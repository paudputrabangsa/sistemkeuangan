import { db } from '../db';
import type { Siswa, SiswaKelas, Tagihan } from '../db/types';
import { assertCanAccess } from './permissionService';
import { NotFoundError, ValidationError } from './service-errors';
import { enqueueSync, nowIso, todayDate, toPendingUpdate, type ServiceActor } from './service-helpers';
import { assignSiswaKelasManual } from './placementService';
import { assertSiswaPeriodNotArchived } from './tahunAjaranLockService';
import { catatAuditLog } from './auditLogService';

export type PenangananTagihanBerhenti = 'tandai_lunas' | 'hapus_tagihan' | 'biarkan';

export interface SetSiswaBerhentiInput {
  penangananTagihan: Record<string, PenangananTagihanBerhenti>;
  alasanKeluar?: 'pindah_sekolah' | 'berhenti_lainnya';
  catatan?: string | null;
}

export interface AssignManualKelasInput {
  kelas_id: string;
  alasan_override?: string | null;
}

export interface SetSiswaTidakJadiMasukInput {
  penangananTagihan: Record<string, PenangananTagihanBerhenti>;
  catatan?: string | null;
}

export interface SetSiswaCutiInput {
  penangananTagihan: Record<string, PenangananTagihanBerhenti>;
}

function updateTagihanForBerhenti(tagihan: Tagihan, penanganan: PenangananTagihanBerhenti) {
  const now = nowIso();

  if (penanganan === 'tandai_lunas') {
    return toPendingUpdate(tagihan, {
      sudah_dibayar: tagihan.jumlah_total,
      status: 'lunas',
      updated_at: now,
    });
  }

  if (penanganan === 'hapus_tagihan') {
    return toPendingUpdate(tagihan, {
      deleted_at: now,
      status: 'dibatalkan',
      updated_at: now,
    });
  }

  return null;
}

export async function setSiswaBerhenti(actor: ServiceActor, siswaId: string, input: SetSiswaBerhentiInput) {
  await assertCanAccess(actor.role, 'siswa', 'edit');

  const siswa = await db.siswa.get(siswaId);
  if (!siswa || siswa.deleted_at) {
    throw new NotFoundError('Siswa tidak ditemukan.');
  }
  await assertSiswaPeriodNotArchived(siswa, 'Set siswa berhenti');

  if (siswa.status !== 'aktif' && siswa.status !== 'cuti') {
    throw new ValidationError('Hanya siswa aktif atau cuti yang dapat diubah menjadi berhenti.');
  }

  const [tagihan, assignments] = await Promise.all([
    db.tagihan.where('siswa_id').equals(siswaId).toArray(),
    db.siswa_kelas.where('siswa_id').equals(siswaId).toArray(),
  ]);

  const openBills = tagihan.filter((item) => !item.deleted_at && item.status !== 'lunas');
  const activeAssignment = assignments.find((item) => !item.selesai) ?? null;
  const updatedBills: Tagihan[] = [];
  const updatedAssignments: SiswaKelas[] = [];
  const today = todayDate();

  await db.transaction('rw', db.siswa, db.tagihan, db.siswa_kelas, db.sync_queue, async () => {
    for (const bill of openBills) {
      const penanganan = input.penangananTagihan[bill.id] ?? 'biarkan';
      const updatedBill = updateTagihanForBerhenti(bill, penanganan);
      if (!updatedBill) {
        continue;
      }

      await db.tagihan.put(updatedBill);
      await enqueueSync('tagihan', updatedBill.id, penanganan === 'hapus_tagihan' ? 'delete' : 'update', updatedBill);
      updatedBills.push(updatedBill);
    }

    if (activeAssignment) {
      const updatedAssignment = toPendingUpdate(activeAssignment, {
        selesai: today,
        status_akhir_periode: 'keluar',
        updated_at: nowIso(),
      });
      await db.siswa_kelas.put(updatedAssignment);
      await enqueueSync('siswa_kelas', updatedAssignment.id, 'update', updatedAssignment);
      updatedAssignments.push(updatedAssignment);
    }

    const updatedSiswa = toPendingUpdate<Siswa>(siswa, {
      status: 'berhenti',
      alasan_keluar: input.alasanKeluar ?? 'berhenti_lainnya',
      tanggal_keluar: today,
      updated_at: nowIso(),
    });
    await db.siswa.put(updatedSiswa);
    await enqueueSync('siswa', updatedSiswa.id, 'update', updatedSiswa);
  });

  await catatAuditLog(actor, 'siswa', siswaId, 'update',
    `Siswa berhenti: ${siswa.nama} (${input.alasanKeluar || 'berhenti_lainnya'}) — ${updatedBills.length} tagihan diproses`,
    { nama_siswa: siswa.nama, status_baru: 'berhenti', alasan_keluar: input.alasanKeluar,
      penanganan_tagihan: input.penangananTagihan, updated_bills: updatedBills.length, catatan: input.catatan });

  return {
    siswa: await db.siswa.get(siswaId),
    updatedBills,
    updatedAssignments,
  };
}

export async function aturKelasSiswaManual(actor: ServiceActor, siswaId: string, input: AssignManualKelasInput) {
  await assertCanAccess(actor.role, 'siswa', 'edit');
  const siswa = await db.siswa.get(siswaId);
  if (!siswa || siswa.deleted_at) {
    throw new NotFoundError('Siswa tidak ditemukan.');
  }
  await assertSiswaPeriodNotArchived(siswa, 'Atur kelas manual');
  if (siswa.status !== 'aktif' && siswa.status !== 'calon') {
    throw new ValidationError('Hanya siswa aktif atau calon yang dapat diatur kelas manual.');
  }
  const result = await assignSiswaKelasManual(siswaId, input.kelas_id, input.alasan_override ?? null);
  await catatAuditLog(actor, 'siswa_kelas', siswaId, 'create',
    `Atur kelas manual ${siswa.nama} → ${await (await db.kelas.get(input.kelas_id))?.nama_kelas || input.kelas_id}${result.activated ? ' (diaktifkan)' : ''}`,
    { nama_siswa: siswa.nama, kelas_id: input.kelas_id, alasan: input.alasan_override,
      placement_id: result.placement.id, activated: result.activated });
  return result;
}

export async function setSiswaTidakJadiMasuk(actor: ServiceActor, siswaId: string, input: SetSiswaTidakJadiMasukInput) {
  await assertCanAccess(actor.role, 'siswa', 'edit');

  const siswa = await db.siswa.get(siswaId);
  if (!siswa || siswa.deleted_at) {
    throw new NotFoundError('Siswa tidak ditemukan.');
  }
  await assertSiswaPeriodNotArchived(siswa, 'Set siswa tidak jadi masuk');

  if (siswa.status !== 'calon') {
    throw new ValidationError('Hanya siswa calon yang dapat ditandai tidak jadi masuk.');
  }

  const [tagihan, assignments] = await Promise.all([
    db.tagihan.where('siswa_id').equals(siswaId).toArray(),
    db.siswa_kelas.where('siswa_id').equals(siswaId).toArray(),
  ]);

  const openBills = tagihan.filter((item) => !item.deleted_at && item.status !== 'lunas');
  const activeAssignment = assignments.find((item) => !item.selesai) ?? null;
  const updatedBills: Tagihan[] = [];
  const updatedAssignments: SiswaKelas[] = [];
  const today = todayDate();

  await db.transaction('rw', db.siswa, db.tagihan, db.siswa_kelas, db.sync_queue, async () => {
    for (const bill of openBills) {
      const penanganan = input.penangananTagihan[bill.id] ?? 'biarkan';
      const updatedBill = updateTagihanForBerhenti(bill, penanganan);
      if (!updatedBill) {
        continue;
      }

      await db.tagihan.put(updatedBill);
      await enqueueSync('tagihan', updatedBill.id, penanganan === 'hapus_tagihan' ? 'delete' : 'update', updatedBill);
      updatedBills.push(updatedBill);
    }

    if (activeAssignment) {
      const updatedAssignment = toPendingUpdate(activeAssignment, {
        selesai: today,
        status_akhir_periode: 'batal_daftar',
        updated_at: nowIso(),
      });
      await db.siswa_kelas.put(updatedAssignment);
      await enqueueSync('siswa_kelas', updatedAssignment.id, 'update', updatedAssignment);
      updatedAssignments.push(updatedAssignment);
    }

    const updatedSiswa = toPendingUpdate<Siswa>(siswa, {
      status: 'batal_daftar',
      alasan_keluar: null,
      tanggal_keluar: today,
      updated_at: nowIso(),
    });
    await db.siswa.put(updatedSiswa);
    await enqueueSync('siswa', updatedSiswa.id, 'update', updatedSiswa);
  });

  await catatAuditLog(actor, 'siswa', siswaId, 'update',
    `Batal daftar: ${siswa.nama} — ${updatedBills.length} tagihan diproses`,
    { nama_siswa: siswa.nama, status_baru: 'batal_daftar',
      penanganan_tagihan: input.penangananTagihan, updated_bills: updatedBills.length, catatan: input.catatan });

  return {
    siswa: await db.siswa.get(siswaId),
    updatedBills,
    updatedAssignments,
  };
}

export async function setSiswaCuti(actor: ServiceActor, siswaId: string, input: SetSiswaCutiInput) {
  await assertCanAccess(actor.role, 'siswa', 'edit');

  const siswa = await db.siswa.get(siswaId);
  if (!siswa || siswa.deleted_at) {
    throw new NotFoundError('Siswa tidak ditemukan.');
  }
  await assertSiswaPeriodNotArchived(siswa, 'Set siswa cuti');

  if (siswa.status !== 'aktif') {
    throw new ValidationError('Hanya siswa aktif yang dapat diubah menjadi cuti.');
  }

  const [tagihan, assignments] = await Promise.all([
    db.tagihan.where('siswa_id').equals(siswaId).toArray(),
    db.siswa_kelas.where('siswa_id').equals(siswaId).toArray(),
  ]);

  const openBills = tagihan.filter((item) => !item.deleted_at && item.status !== 'lunas');
  const activeAssignment = assignments.find((item) => !item.selesai) ?? null;
  const updatedBills: Tagihan[] = [];
  const updatedAssignments: SiswaKelas[] = [];
  const today = todayDate();

  await db.transaction('rw', db.siswa, db.tagihan, db.siswa_kelas, db.sync_queue, async () => {
    for (const bill of openBills) {
      const penanganan = input.penangananTagihan[bill.id] ?? 'biarkan';
      const updatedBill = updateTagihanForBerhenti(bill, penanganan);
      if (!updatedBill) {
        continue;
      }

      await db.tagihan.put(updatedBill);
      await enqueueSync('tagihan', updatedBill.id, penanganan === 'hapus_tagihan' ? 'delete' : 'update', updatedBill);
      updatedBills.push(updatedBill);
    }

    if (activeAssignment) {
      const updatedAssignment = toPendingUpdate(activeAssignment, {
        selesai: today,
        status_akhir_periode: 'keluar',
        updated_at: nowIso(),
      });
      await db.siswa_kelas.put(updatedAssignment);
      await enqueueSync('siswa_kelas', updatedAssignment.id, 'update', updatedAssignment);
      updatedAssignments.push(updatedAssignment);
    }

    const updatedSiswa = toPendingUpdate<Siswa>(siswa, {
      status: 'cuti',
      alasan_keluar: 'cuti',
      updated_at: nowIso(),
    });
    await db.siswa.put(updatedSiswa);
    await enqueueSync('siswa', updatedSiswa.id, 'update', updatedSiswa);
  });

  await catatAuditLog(actor, 'siswa', siswaId, 'update', `Siswa cuti: ${siswa.nama} — ${updatedBills.length} tagihan diproses`, { status_baru: 'cuti', penanganan_tagihan: input.penangananTagihan, updated_bills: updatedBills.length });

  return {
    siswa: await db.siswa.get(siswaId),
    updatedBills,
    updatedAssignments,
  };
}

export async function setSiswaAktifDariCuti(actor: ServiceActor, siswaId: string, kelasId: string) {
  await assertCanAccess(actor.role, 'siswa', 'edit');

  const siswa = await db.siswa.get(siswaId);
  if (!siswa || siswa.deleted_at) {
    throw new NotFoundError('Siswa tidak ditemukan.');
  }
  await assertSiswaPeriodNotArchived(siswa, 'Set siswa aktif kembali');

  if (siswa.status !== 'cuti') {
    throw new ValidationError('Hanya siswa cuti yang dapat diubah menjadi aktif.');
  }

  await db.transaction('rw', db.siswa, db.sync_queue, async () => {
    const updatedSiswa = toPendingUpdate<Siswa>(siswa, {
      status: 'aktif',
      alasan_keluar: null,
      updated_at: nowIso(),
    });
    await db.siswa.put(updatedSiswa);
    await enqueueSync('siswa', updatedSiswa.id, 'update', updatedSiswa);
  });

  // Assign kelas manual setelah mengubah status siswa menjadi aktif
  const resultKelas = await assignSiswaKelasManual(siswaId, kelasId, 'Aktif kembali dari cuti');

  await catatAuditLog(actor, 'siswa', siswaId, 'update', `Siswa aktif kembali dari cuti: ${siswa.nama} di kelas ${kelasId}`, { status_baru: 'aktif', kelas_id: kelasId });

  return resultKelas;
}
