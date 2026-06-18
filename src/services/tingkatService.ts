import { db } from '../db';
import type { Tingkat } from '../db/types';
import { assertCanAccess } from './permissionService';
import { NotFoundError, ValidationError } from './service-errors';
import { enqueueSync, newId, nowIso, toPendingInsert, toPendingUpdate, type ServiceActor } from './service-helpers';
import { assertTahunAjaranNotArchived } from './tahunAjaranLockService';
import { normalizeWhitespace } from './nameNormalizationService';

export interface SaveTingkatInput {
  tahun_ajaran_id: string;
  nama: string;
  kode?: string | null;
  urutan: number;
  tarif_spp: number;
  usia_min_tahun?: number | null;
  usia_max_tahun?: number | null;
}

function validateTingkatInput(input: SaveTingkatInput) {
  if (!input.tahun_ajaran_id) {
    throw new ValidationError('Tahun ajaran wajib dipilih.');
  }
  if (!input.nama.trim()) {
    throw new ValidationError('Nama tingkat wajib diisi.');
  }
  if (input.tarif_spp < 0) {
    throw new ValidationError('Tarif SPP tidak boleh negatif.');
  }
  if (input.usia_min_tahun !== null && input.usia_min_tahun !== undefined && input.usia_min_tahun < 0) {
    throw new ValidationError('Usia minimum tidak boleh negatif.');
  }
  if (input.usia_max_tahun !== null && input.usia_max_tahun !== undefined && input.usia_max_tahun < 0) {
    throw new ValidationError('Usia maksimum tidak boleh negatif.');
  }
  if (
    input.usia_min_tahun !== null && input.usia_min_tahun !== undefined &&
    input.usia_max_tahun !== null && input.usia_max_tahun !== undefined &&
    input.usia_max_tahun < input.usia_min_tahun
  ) {
    throw new ValidationError('Usia maksimum tidak boleh lebih kecil dari usia minimum.');
  }
}

async function assertNoDuplicateTingkat(input: SaveTingkatInput, currentId?: string) {
  const normalizedNama = normalizeWhitespace(input.nama).toLowerCase();
  const duplicate = (await db.tingkat.where('tahun_ajaran_id').equals(input.tahun_ajaran_id).toArray())
    .find((item) => !item.deleted_at && item.id !== currentId && item.nama.toLowerCase() === normalizedNama);

  if (duplicate) {
    throw new ValidationError(`Tingkat duplikat pada tahun ajaran ini: ${duplicate.nama}.`);
  }
}

export async function createTingkat(actor: ServiceActor, input: SaveTingkatInput) {
  await assertCanAccess(actor.role, 'kelas', 'tambah');
  validateTingkatInput(input);
  await assertTahunAjaranNotArchived(input.tahun_ajaran_id, 'Tambah tingkat');
  await assertNoDuplicateTingkat(input);

  const now = nowIso();
  const tingkat = toPendingInsert<Tingkat>({
    id: newId(),
    tahun_ajaran_id: input.tahun_ajaran_id,
    nama: normalizeWhitespace(input.nama),
    kode: input.kode ? normalizeWhitespace(input.kode) : null,
    urutan: input.urutan,
    tarif_spp: input.tarif_spp,
    usia_min_tahun: input.usia_min_tahun ?? null,
    usia_max_tahun: input.usia_max_tahun ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  await db.transaction('rw', db.tingkat, db.sync_queue, async () => {
    await db.tingkat.add(tingkat);
    await enqueueSync('tingkat', tingkat.id, 'insert', tingkat);
  });

  return tingkat;
}

export async function updateTingkat(actor: ServiceActor, tingkatId: string, input: SaveTingkatInput) {
  await assertCanAccess(actor.role, 'kelas', 'edit');
  validateTingkatInput(input);

  const existing = await db.tingkat.get(tingkatId);
  if (!existing || existing.deleted_at) {
    throw new NotFoundError('Tingkat tidak ditemukan.');
  }

  await assertTahunAjaranNotArchived(existing.tahun_ajaran_id, 'Edit tingkat');
  await assertTahunAjaranNotArchived(input.tahun_ajaran_id, 'Pindah tingkat ke periode');
  await assertNoDuplicateTingkat(input, tingkatId);

  const updatedNama = normalizeWhitespace(input.nama);
  const now = nowIso();

  const updated = toPendingUpdate(existing, {
    tahun_ajaran_id: input.tahun_ajaran_id,
    nama: updatedNama,
    kode: input.kode ? normalizeWhitespace(input.kode) : null,
    urutan: input.urutan,
    tarif_spp: input.tarif_spp,
    usia_min_tahun: input.usia_min_tahun ?? null,
    usia_max_tahun: input.usia_max_tahun ?? null,
    updated_at: now,
  });

  await db.transaction('rw', db.tingkat, db.kelas, db.sync_queue, async () => {
    // 1. Update Tingkat
    await db.tingkat.put(updated);
    await enqueueSync('tingkat', updated.id, 'update', updated);

    // 2. Cascade update ke Kelas yang menjadi anaknya
    const childClasses = await db.kelas.where('tingkat_id').equals(tingkatId).toArray();
    for (const kelas of childClasses) {
      if (kelas.deleted_at) continue;
      const updatedKelas = toPendingUpdate(kelas, {
        tingkat: updatedNama,
        tarif_spp: input.tarif_spp,
        usia_min_tahun: input.usia_min_tahun ?? null,
        usia_max_tahun: input.usia_max_tahun ?? null,
        updated_at: now,
      });
      await db.kelas.put(updatedKelas);
      await enqueueSync('kelas', updatedKelas.id, 'update', updatedKelas);
    }
  });

  return updated;
}

export async function deleteTingkat(actor: ServiceActor, tingkatId: string) {
  await assertCanAccess(actor.role, 'kelas', 'hapus');

  const existing = await db.tingkat.get(tingkatId);
  if (!existing || existing.deleted_at) {
    throw new NotFoundError('Tingkat tidak ditemukan.');
  }
  await assertTahunAjaranNotArchived(existing.tahun_ajaran_id, 'Hapus tingkat');

  // Prevent deletion if there are non-deleted child classes
  const childClasses = await db.kelas.where('tingkat_id').equals(tingkatId).toArray();
  const activeChildClasses = childClasses.filter((c) => !c.deleted_at);
  if (activeChildClasses.length > 0) {
    throw new ValidationError(`Tingkat tidak dapat dihapus karena masih memiliki ${activeChildClasses.length} kelas aktif.`);
  }

  const updated = toPendingUpdate(existing, {
    deleted_at: nowIso(),
    updated_at: nowIso(),
  });

  await db.transaction('rw', db.tingkat, db.sync_queue, async () => {
    await db.tingkat.put(updated);
    await enqueueSync('tingkat', updated.id, 'delete', updated);
  });

  return true;
}
