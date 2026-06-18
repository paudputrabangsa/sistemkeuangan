import { db } from '../db';
import type { TahunAjaran } from '../db/types';
import { assertCanAccess } from './permissionService';
import { NotFoundError, ValidationError } from './service-errors';
import { enqueueSync, newId, nowIso, toPendingInsert, toPendingUpdate, type ServiceActor } from './service-helpers';
import { runAutoPlacementForTahunAjaran } from './placementService';
import { assertMaxOneYearTahunAjaran } from './tahunAjaranDateService';
import { parseTahunAjaranName, tahunAjaranKey } from './nameNormalizationService';

export interface SaveTahunAjaranInput {
  nama: string;
  mulai: string;
  selesai: string;
}

function validateDateRange(mulai: string, selesai: string) {
  assertMaxOneYearTahunAjaran(mulai, selesai);
}

function validateTahunAjaranName(nama: string) {
  if (!nama.trim()) {
    throw new ValidationError('Nama tahun ajaran wajib diisi.');
  }
  if (!parseTahunAjaranName(nama)) {
    throw new ValidationError('Nama tahun ajaran harus berformat YYYY/YYYY dan tahun kedua harus satu tahun setelah tahun pertama. Contoh: 2026/2027.');
  }
}

async function assertNoDuplicateTahunAjaran(input: SaveTahunAjaranInput, currentId?: string) {
  const normalizedName = tahunAjaranKey(input.nama);
  const years = (await db.tahun_ajaran.toArray()).filter((item) => !item.deleted_at && item.id !== currentId);
  const duplicateName = years.find((item) => tahunAjaranKey(item.nama) === normalizedName);
  if (duplicateName) {
    throw new ValidationError(`Nama tahun ajaran sudah ada: ${duplicateName.nama}.`);
  }

  const duplicatePeriod = years.find((item) => item.mulai === input.mulai && item.selesai === input.selesai);
  if (duplicatePeriod) {
    throw new ValidationError(`Periode tahun ajaran sama dengan ${duplicatePeriod.nama}.`);
  }

  const overlap = years.find((item) => input.mulai <= item.selesai && input.selesai >= item.mulai);
  if (overlap) {
    throw new ValidationError(`Periode tahun ajaran tumpang tindih dengan ${overlap.nama}.`);
  }
}

export async function createTahunAjaran(actor: ServiceActor, input: SaveTahunAjaranInput) {
  await assertCanAccess(actor.role, 'tahun_ajaran', 'tambah');
  validateTahunAjaranName(input.nama);
  validateDateRange(input.mulai, input.selesai);
  await assertNoDuplicateTahunAjaran(input);

  const now = nowIso();
  const tahunAjaran = toPendingInsert<TahunAjaran>({
    id: newId(),
    nama: parseTahunAjaranName(input.nama)!.normalized,
    mulai: input.mulai,
    selesai: input.selesai,
    aktif: false,
    status: 'draft',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  await db.transaction('rw', db.tahun_ajaran, db.sync_queue, async () => {
    await db.tahun_ajaran.add(tahunAjaran);
    await enqueueSync('tahun_ajaran', tahunAjaran.id, 'insert', tahunAjaran);
  });

  return tahunAjaran;
}

export async function updateTahunAjaran(actor: ServiceActor, id: string, input: SaveTahunAjaranInput) {
  await assertCanAccess(actor.role, 'tahun_ajaran', 'edit');
  validateTahunAjaranName(input.nama);
  validateDateRange(input.mulai, input.selesai);

  const existing = await db.tahun_ajaran.get(id);
  if (!existing || existing.deleted_at) {
    throw new NotFoundError('Tahun ajaran tidak ditemukan.');
  }
  if ((existing.status ?? (existing.aktif ? 'aktif' : 'draft')) === 'arsip') {
    throw new ValidationError('Tahun ajaran arsip dikunci dan tidak bisa diedit.');
  }
  await assertNoDuplicateTahunAjaran(input, id);

  const now = nowIso();

  await db.transaction('rw', db.tahun_ajaran, db.sync_queue, async () => {
    const updated = toPendingUpdate(existing, {
      nama: parseTahunAjaranName(input.nama)!.normalized,
      mulai: input.mulai,
      selesai: input.selesai,
      updated_at: now,
    });

    await db.tahun_ajaran.put(updated);
    await enqueueSync('tahun_ajaran', updated.id, 'update', updated);
  });

  return db.tahun_ajaran.get(id);
}

export async function activateTahunAjaran(actor: ServiceActor, id: string) {
  await assertCanAccess(actor.role, 'tahun_ajaran', 'edit');

  const existing = await db.tahun_ajaran.get(id);
  if (!existing || existing.deleted_at) {
    throw new NotFoundError('Tahun ajaran tidak ditemukan.');
  }
  const existingStatus = existing.status ?? (existing.aktif ? 'aktif' : 'draft');
  if (existingStatus === 'arsip') {
    throw new ValidationError('Tahun ajaran arsip tidak bisa diaktifkan kembali. Buat tahun ajaran baru jika perlu periode baru.');
  }
  if (existingStatus !== 'draft') {
    throw new ValidationError('Hanya tahun ajaran draft yang bisa diaktifkan manual.');
  }
  const activeOther = (await db.tahun_ajaran.toArray()).find((item) => item.id !== id && !item.deleted_at && (item.aktif || item.status === 'aktif'));
  if (activeOther) {
    throw new ValidationError('Sudah ada tahun ajaran aktif. Tahun aktif hanya bisa menjadi arsip melalui proses naik kelas.');
  }

  const now = nowIso();

  await db.transaction('rw', db.tahun_ajaran, db.sync_queue, async () => {
    const semua = await db.tahun_ajaran.toArray();
    for (const item of semua) {
      if (item.deleted_at) {
        continue;
      }

      const shouldBeActive = item.id === id;
      const nextStatus = shouldBeActive ? 'aktif' : ((item.status ?? (item.aktif ? 'aktif' : 'draft')) === 'aktif' ? 'draft' : (item.status ?? 'draft'));
      if (item.aktif === shouldBeActive && item.status === nextStatus) {
        continue;
      }

      const updated = toPendingUpdate(item, { aktif: shouldBeActive, status: nextStatus, updated_at: now });
      await db.tahun_ajaran.put(updated);
      await enqueueSync('tahun_ajaran', updated.id, 'update', updated);
    }
  });

  await runAutoPlacementForTahunAjaran(id);

  return db.tahun_ajaran.get(id);
}
