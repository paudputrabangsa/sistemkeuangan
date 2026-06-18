import { db } from '../db';
import type { Kelas } from '../db/types';
import { assertCanAccess } from './permissionService';
import { NotFoundError, ValidationError } from './service-errors';
import { enqueueSync, newId, nowIso, toPendingInsert, toPendingUpdate, type ServiceActor } from './service-helpers';
import { assertTahunAjaranNotArchived } from './tahunAjaranLockService';
import { kelasKey, normalizeWhitespace } from './nameNormalizationService';

export interface SaveKelasInput {
  tahun_ajaran_id: string;
  tingkat_id: string;
  nama_kelas: string;
  kapasitas_siswa?: number | null;
}

function validateKelasInput(input: SaveKelasInput) {
  if (!input.tahun_ajaran_id) {
    throw new ValidationError('Tahun ajaran wajib dipilih.');
  }

  if (!input.tingkat_id) {
    throw new ValidationError('Tingkat wajib dipilih.');
  }

  if (!input.nama_kelas.trim()) {
    throw new ValidationError('Nama kelas wajib diisi.');
  }

  if (input.kapasitas_siswa !== null && input.kapasitas_siswa !== undefined && (!Number.isInteger(input.kapasitas_siswa) || input.kapasitas_siswa < 1)) {
    throw new ValidationError('Kapasitas siswa per rombel harus berupa bilangan bulat minimal 1.');
  }
}

async function ensureTahunAjaranExists(tahunAjaranId: string) {
  const tahunAjaran = await db.tahun_ajaran.get(tahunAjaranId);
  if (!tahunAjaran || tahunAjaran.deleted_at) {
    throw new ValidationError('Tahun ajaran tidak ditemukan.');
  }
}

async function ensureCapacityNotBelowActiveStudents(kelasId: string, kapasitasSiswa?: number | null) {
  if (!kapasitasSiswa) {
    return;
  }

  const activeAssignments = await db.siswa_kelas.where('kelas_id').equals(kelasId).toArray();
  const activeCount = activeAssignments.filter((item) => !item.selesai).length;
  if (kapasitasSiswa < activeCount) {
    throw new ValidationError(`Kapasitas tidak boleh lebih kecil dari jumlah siswa aktif saat ini (${activeCount} siswa).`);
  }
}

async function assertNoDuplicateKelas(input: SaveKelasInput, tingkatName: string, currentId?: string) {
  const key = kelasKey(tingkatName, input.nama_kelas);
  const duplicate = (await db.kelas.where('tahun_ajaran_id').equals(input.tahun_ajaran_id).toArray())
    .find((item) => !item.deleted_at && item.id !== currentId && kelasKey(item.tingkat, item.nama_kelas) === key);
  if (duplicate) {
    const tingkat = duplicate.tingkat ? `${duplicate.tingkat} - ` : '';
    throw new ValidationError(`Kelas duplikat pada tahun ajaran ini: ${tingkat}${duplicate.nama_kelas}.`);
  }
}

async function getTingkatForKelas(tingkatId: string, tahunAjaranId: string) {
  const tingkat = await db.tingkat.get(tingkatId);
  if (!tingkat || tingkat.deleted_at || tingkat.tahun_ajaran_id !== tahunAjaranId) {
    throw new ValidationError('Tingkat tidak valid atau tidak ditemukan pada tahun ajaran ini.');
  }
  return tingkat;
}

export async function createKelas(actor: ServiceActor, input: SaveKelasInput) {
  await assertCanAccess(actor.role, 'kelas', 'tambah');
  validateKelasInput(input);
  await ensureTahunAjaranExists(input.tahun_ajaran_id);
  await assertTahunAjaranNotArchived(input.tahun_ajaran_id, 'Tambah kelas');
  const tingkat = await getTingkatForKelas(input.tingkat_id, input.tahun_ajaran_id);
  await assertNoDuplicateKelas(input, tingkat.nama);

  const now = nowIso();
  const kelas = toPendingInsert<Kelas>({
    id: newId(),
    tahun_ajaran_id: input.tahun_ajaran_id,
    tingkat_id: input.tingkat_id,
    nama_kelas: normalizeWhitespace(input.nama_kelas),
    tingkat: normalizeWhitespace(tingkat.nama),
    tarif_spp: tingkat.tarif_spp,
    kapasitas_siswa: input.kapasitas_siswa ?? null,
    usia_min_tahun: tingkat.usia_min_tahun ?? null,
    usia_max_tahun: tingkat.usia_max_tahun ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  await db.transaction('rw', db.kelas, db.sync_queue, async () => {
    await db.kelas.add(kelas);
    await enqueueSync('kelas', kelas.id, 'insert', kelas);
  });

  return kelas;
}

export async function updateKelas(actor: ServiceActor, kelasId: string, input: SaveKelasInput) {
  await assertCanAccess(actor.role, 'kelas', 'edit');
  validateKelasInput(input);
  await ensureTahunAjaranExists(input.tahun_ajaran_id);

  const existing = await db.kelas.get(kelasId);
  if (!existing || existing.deleted_at) {
    throw new NotFoundError('Kelas tidak ditemukan.');
  }
  await assertTahunAjaranNotArchived(existing.tahun_ajaran_id, 'Edit kelas');
  await assertTahunAjaranNotArchived(input.tahun_ajaran_id, 'Pindah kelas ke periode');
  await ensureCapacityNotBelowActiveStudents(kelasId, input.kapasitas_siswa);
  const tingkat = await getTingkatForKelas(input.tingkat_id, input.tahun_ajaran_id);
  await assertNoDuplicateKelas(input, tingkat.nama, kelasId);

  const updated = toPendingUpdate(existing, {
    tahun_ajaran_id: input.tahun_ajaran_id,
    tingkat_id: input.tingkat_id,
    nama_kelas: normalizeWhitespace(input.nama_kelas),
    tingkat: normalizeWhitespace(tingkat.nama),
    tarif_spp: tingkat.tarif_spp,
    kapasitas_siswa: input.kapasitas_siswa ?? null,
    usia_min_tahun: tingkat.usia_min_tahun ?? null,
    usia_max_tahun: tingkat.usia_max_tahun ?? null,
    updated_at: nowIso(),
  });

  await db.transaction('rw', db.kelas, db.sync_queue, async () => {
    await db.kelas.put(updated);
    await enqueueSync('kelas', updated.id, 'update', updated);
  });

  return updated;
}

export async function deleteKelas(actor: ServiceActor, kelasId: string) {
  await assertCanAccess(actor.role, 'kelas', 'hapus');

  const existing = await db.kelas.get(kelasId);
  if (!existing || existing.deleted_at) {
    throw new NotFoundError('Kelas tidak ditemukan.');
  }
  await assertTahunAjaranNotArchived(existing.tahun_ajaran_id, 'Hapus kelas');

  const activeAssignments = await db.siswa_kelas.where('kelas_id').equals(kelasId).toArray();
  if (activeAssignments.some((item) => !item.selesai)) {
    throw new ValidationError('Kelas yang masih memiliki siswa aktif tidak dapat dihapus.');
  }

  const updated = toPendingUpdate(existing, {
    deleted_at: nowIso(),
    updated_at: nowIso(),
  });

  await db.transaction('rw', db.kelas, db.sync_queue, async () => {
    await db.kelas.put(updated);
    await enqueueSync('kelas', updated.id, 'delete', updated);
  });

  return updated;
}
