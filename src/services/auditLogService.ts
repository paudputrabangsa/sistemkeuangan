import { db } from '../db';
import type { ServiceActor } from './service-helpers';

export type AuditAksi = 'create' | 'update' | 'delete' | 'batal' | 'lainnya';

export async function catatAuditLog(
  actor: ServiceActor,
  tabel: string,
  record_id: string,
  aksi: AuditAksi,
  deskripsi: string,
  payload?: any
) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.audit_log.add({
    id,
    tabel,
    record_id,
    aksi,
    deskripsi,
    user_id: actor.userId,
    payload,
    created_at: now,
    _sync_status: 'pending',
    _sync_at: null,
    _local_only: true,
  });
  return id;
}

export async function catatAuditLogUntukSiswa(
  actor: ServiceActor,
  record_id: string,
  aksi: AuditAksi,
  namaSiswa: string,
  detail: string,
  extraPayload?: any
) {
  return catatAuditLog(actor, 'siswa', record_id, aksi, detail, {
    nama_siswa: namaSiswa,
    ...extraPayload,
  });
}

export async function catatAuditLogUntukTagihan(
  actor: ServiceActor,
  record_id: string,
  aksi: AuditAksi,
  noReferensi: string,
  namaSiswa: string,
  extraPayload?: any
) {
  return catatAuditLog(actor, 'tagihan', record_id, aksi, `Tagihan ${noReferensi || ''} untuk ${namaSiswa}`.trim(), {
    nama_siswa: namaSiswa,
    no_referensi: noReferensi,
    ...extraPayload,
  });
}

export async function catatAuditLogUntukPembayaran(
  actor: ServiceActor,
  record_id: string,
  aksi: AuditAksi,
  noKuitansi: string,
  namaSiswa: string,
  jumlah: number,
  extraPayload?: any
) {
  return catatAuditLog(actor, 'pembayaran', record_id, aksi, `Pembayaran ${noKuitansi || ''} ${namaSiswa} Rp${jumlah}`.trim(), {
    nama_siswa: namaSiswa,
    no_referensi: noKuitansi,
    jumlah,
    ...extraPayload,
  });
}
