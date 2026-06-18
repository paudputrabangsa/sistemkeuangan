import { db } from '../db';
import type { Siswa, Tagihan } from '../db/types';
import { ValidationError } from './service-errors';

export function getTahunAjaranStatus(tahunAjaran: { aktif: boolean; status?: 'draft' | 'aktif' | 'arsip' | null }) {
  return tahunAjaran.status ?? (tahunAjaran.aktif ? 'aktif' : 'draft');
}

export async function assertTahunAjaranNotArchived(tahunAjaranId: string, action = 'Aksi') {
  const tahunAjaran = await db.tahun_ajaran.get(tahunAjaranId);
  if (!tahunAjaran || tahunAjaran.deleted_at) {
    throw new ValidationError('Tahun ajaran tidak ditemukan.');
  }

  if (getTahunAjaranStatus(tahunAjaran) === 'arsip') {
    throw new ValidationError(`${action} tidak bisa dijalankan pada tahun ajaran arsip. Data arsip dikunci dan hanya bisa dilihat.`);
  }
}

export async function getSiswaOperationalTahunAjaranId(siswa: Siswa) {
  const assignments = await db.siswa_kelas.where('siswa_id').equals(siswa.id).toArray();
  const activeAssignment = assignments.find((item) => !item.selesai) ?? null;
  if (activeAssignment) {
    const kelas = await db.kelas.get(activeAssignment.kelas_id);
    if (kelas && !kelas.deleted_at) {
      return kelas.tahun_ajaran_id;
    }
  }

  return siswa.tahun_ajaran_target_id;
}

export async function assertSiswaPeriodNotArchived(siswa: Siswa, action = 'Aksi') {
  const tahunAjaranId = await getSiswaOperationalTahunAjaranId(siswa);
  if (tahunAjaranId) {
    await assertTahunAjaranNotArchived(tahunAjaranId, action);
  }
}

export async function assertTagihanPeriodNotArchived(tagihanId: string, action = 'Aksi') {
  const tagihan = await db.tagihan.get(tagihanId);
  if (!tagihan || tagihan.deleted_at) {
    throw new ValidationError('Tagihan tidak ditemukan.');
  }

  if (tagihan.tahun_ajaran_id) {
    await assertTahunAjaranNotArchived(tagihan.tahun_ajaran_id, action);
    return;
  }

  const siswa = await db.siswa.get(tagihan.siswa_id);
  if (!siswa || siswa.deleted_at) {
    throw new ValidationError('Siswa tagihan tidak ditemukan.');
  }

  await assertSiswaPeriodNotArchived(siswa, action);
}

export async function assertCanRecordPembayaranForTagihan(tagihan: Tagihan) {
  if (tagihan.deleted_at || tagihan.status === 'dibatalkan') {
    throw new ValidationError('Tagihan tidak ditemukan.');
  }

  if (tagihan.status === 'lunas' || tagihan.sudah_dibayar >= tagihan.jumlah_total) {
    throw new ValidationError('Tagihan sudah lunas.');
  }

  if (!tagihan.tahun_ajaran_id) {
    const siswa = await db.siswa.get(tagihan.siswa_id);
    if (!siswa || siswa.deleted_at) {
      throw new ValidationError('Siswa tagihan tidak ditemukan.');
    }
    await assertSiswaPeriodNotArchived(siswa, 'Catat pembayaran');
    return;
  }

  const tahunAjaran = await db.tahun_ajaran.get(tagihan.tahun_ajaran_id);
  if (!tahunAjaran || tahunAjaran.deleted_at) {
    throw new ValidationError('Tahun ajaran tagihan tidak ditemukan.');
  }

  // Tahun arsip tetap read-only untuk edit/hapus/buat tagihan, tetapi piutang lama
  // boleh dilunasi sampai status tagihan menjadi lunas.
}
