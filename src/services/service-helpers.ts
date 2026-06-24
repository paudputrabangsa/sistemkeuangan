import { db, type AppDatabase } from '../db';
import type { BaseEntity, Permission, SyncQueue, Tagihan, TahunAjaran } from '../db/types';

export type SyncableTableName = Exclude<keyof AppDatabase, 'sync_queue' | 'sync_log'>;
export type ServiceActor = {
  userId: string;
  role: Permission['role'];
};

type SyncableEntity = BaseEntity | {
  id: string;
  created_at: string;
  updated_at: string;
  _sync_status?: 'synced' | 'pending' | 'conflict';
  _sync_at?: string | null;
  _local_only?: boolean;
};

export function nowIso() {
  return new Date().toISOString();
}

export function todayDate() {
  return nowIso().slice(0, 10);
}

export function newId() {
  return crypto.randomUUID();
}

export function toPendingInsert<T extends SyncableEntity>(record: Omit<T, '_sync_status' | '_sync_at' | '_local_only'>): T {
  return {
    ...record,
    _sync_status: 'pending',
    _sync_at: null,
    _local_only: true,
  } as T;
}

export function toPendingUpdate<T extends SyncableEntity>(existing: T, changes: Partial<T>): T {
  return {
    ...existing,
    ...changes,
    _sync_status: 'pending',
    _sync_at: existing._sync_at ?? null,
    _local_only: existing._local_only ?? false,
  };
}

export async function enqueueSync(
  tabel: SyncableTableName,
  record_id: string,
  aksi: SyncQueue['aksi'],
  payload: unknown,
) {
  await db.sync_queue.add({
    tabel,
    record_id,
    aksi,
    payload,
    retry_count: 0,
    status: 'pending',
    created_at: nowIso(),
  });
}

export function calculateTagihanStatus(jumlahTotal: number, sudahDibayar: number): Tagihan['status'] {
  if (sudahDibayar >= jumlahTotal) {
    return 'lunas';
  }

  if (sudahDibayar > 0) {
    return 'sebagian';
  }

  return 'belum_bayar';
}

export function startOfMonth(value: string) {
  return new Date(`${value}-01T00:00:00`);
}

export function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function monthKeyFromDate(value: string) {
  return value.slice(0, 7);
}

import type { SppGenerateCutoffSetting } from '../db/types';

export function getSppEffectiveStartMonth(
  tanggalDaftar: string,
  jenisMasuk: string,
  cutoff: SppGenerateCutoffSetting | null
): string {
  if (jenisMasuk !== 'pindahan' || !cutoff?.aktif) return monthKeyFromDate(tanggalDaftar);
  const day = new Date(tanggalDaftar).getDate();
  if (day > cutoff.cutoff_tanggal) return nextMonthKey(monthKeyFromDate(tanggalDaftar));
  return monthKeyFromDate(tanggalDaftar);
}

export function formatSppName(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(year, month - 1, 1));
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return `SPP ${capitalizedMonth} ${year}`;
}

export function safeDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

export function calculateAgeInYears(tanggalLahir: string, cutoffDate: Date) {
  const birthDate = safeDate(tanggalLahir);
  let age = cutoffDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = cutoffDate.getMonth() - birthDate.getMonth();
  const dayDiff = cutoffDate.getDate() - birthDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return Math.max(age, 0);
}

export function getTahunAjaranCutoffDate(tahunAjaran: TahunAjaran, cutoffBulan: number, cutoffTanggal: number) {
  const startDate = safeDate(tahunAjaran.mulai);
  return new Date(startDate.getFullYear(), cutoffBulan - 1, cutoffTanggal);
}

export async function getActiveSiswaKelasBySiswaId(siswaId: string) {
  const assignments = await db.siswa_kelas.where('siswa_id').equals(siswaId).toArray();
  return assignments.find((item) => !item.selesai) ?? null;
}

export async function getPendaftaranTagihanBySiswaId(siswaId: string) {
  const tagihan = await db.tagihan.where('siswa_id').equals(siswaId).toArray();
  return tagihan.filter((item) => !item.deleted_at && item.jenis === 'pendaftaran');
}
