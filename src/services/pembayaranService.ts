import { db } from '../db';
import type { Pembayaran, Siswa, Tagihan } from '../db/types';
import { assertCanAccess } from './permissionService';
import { NotFoundError, ValidationError } from './service-errors';
import {
  calculateTagihanStatus,
  enqueueSync,
  newId,
  nowIso,
  toPendingInsert,
  toPendingUpdate,
  type ServiceActor,
} from './service-helpers';
import { handleInitialBillingCompletion } from './placementService';
import { assertCanRecordPembayaranForTagihan } from './tahunAjaranLockService';

import { ReferenceGeneratorService } from './referenceGeneratorService';
import { catatAuditLog } from './auditLogService';

export interface RecordPembayaranInput {
  tagihan_id: string;
  jumlah: number;
  metode: string;
  tanggal: string;
  catatan?: string | null;
}

export interface RecordPembayaranSplitItem {
  metode: string;
  jumlah: number;
  catatan?: string | null;
}

export interface RecordPembayaranSplitInput {
  tagihan_id: string;
  tanggal: string;
  catatan?: string | null;
  items: RecordPembayaranSplitItem[];
}

export interface RecordPembayaranBatchItem {
  tagihan_id: string;
  nominal_dibayar: number;
  diskon_tambahan?: number;
}

export interface RecordPembayaranBatchInput {
  siswa_id: string;
  tanggal: string;
  catatan?: string | null;
  tagihan_items: RecordPembayaranBatchItem[];
  payment_methods: RecordPembayaranSplitItem[];
}

function paymentNeedsVerification(metode: string) {
  const key = metode.trim().toLowerCase();
  return key.includes('transfer') || key.includes('tabungan');
}

async function getPendingVerificationTotal(tagihanId: string) {
  const payments = await db.pembayaran.where('tagihan_id').equals(tagihanId).toArray();
  return payments
    .filter((item) => !item.deleted_at && item.status_verifikasi === 'menunggu_verifikasi')
    .reduce((total, item) => total + item.jumlah, 0);
}

async function canPayDaftarUlang(tagihan: Tagihan): Promise<void> {
  if (tagihan.jenis !== 'daftar_ulang') return;

  if (tagihan.status_daftar_ulang === 'tertahan') {
    throw new ValidationError('Tagihan daftar ulang masih tertahan. Selesaikan semua tunggakan terlebih dahulu.');
  }

  const allYears = (await db.tahun_ajaran.toArray()).filter((y) => !y.deleted_at);
  const activeYear = allYears.find((y) => y.status === 'aktif');
  if (activeYear) {
    const allTagihan = (await db.tagihan.toArray()).filter((t) => !t.deleted_at);
    const sppCount = allTagihan.filter(
      (t) => t.siswa_id === tagihan.siswa_id && t.tahun_ajaran_id === activeYear.id && t.jenis === 'spp'
    ).length;
    if (sppCount === 0) {
      throw new ValidationError('Tagihan SPP untuk tahun ajaran aktif belum digenerate. Generate SPP terlebih dahulu.');
    }
  }
}

async function updateDaftarUlangStatusIfAllPaid(siswaId: string): Promise<void> {
  const allTagihan = (await db.tagihan.toArray()).filter((t) => !t.deleted_at && t.siswa_id === siswaId);
  const duTagihan = allTagihan.filter((t) => t.jenis === 'daftar_ulang' && t.status_daftar_ulang === 'tertahan');
  if (duTagihan.length === 0) return;

  const totalTunggakan = allTagihan
    .filter((t) => t.jenis !== 'daftar_ulang' && t.status !== 'lunas')
    .reduce((sum, t) => sum + Math.max(0, t.jumlah_total - t.sudah_dibayar), 0);

  if (totalTunggakan <= 0) {
    const now = nowIso();
    await db.transaction('rw', db.tagihan, db.sync_queue, async () => {
      for (const du of duTagihan) {
        du.status_daftar_ulang = 'aktif';
        du.updated_at = now;
        await db.tagihan.put(du);
        await enqueueSync('tagihan', du.id, 'update', du);
      }
    });
  }
}

export async function recordPembayaran(actor: ServiceActor, input: RecordPembayaranInput) {
  const result = await recordPembayaranSplit(actor, {
    tagihan_id: input.tagihan_id,
    tanggal: input.tanggal,
    catatan: input.catatan ?? null,
    items: [{ metode: input.metode, jumlah: input.jumlah, catatan: input.catatan ?? null }],
  });
  return { pembayaran: result.pembayaran[0], tagihan: result.tagihan, siswa: result.siswa };
}

export async function recordPembayaranSplit(actor: ServiceActor, input: RecordPembayaranSplitInput) {
  await assertCanAccess(actor.role, 'pembayaran', 'tambah');

  const existingTagihan = await db.tagihan.get(input.tagihan_id);
  if (!existingTagihan || existingTagihan.deleted_at) {
    throw new NotFoundError('Tagihan tidak ditemukan.');
  }
  await assertCanRecordPembayaranForTagihan(existingTagihan);

  if (existingTagihan.jenis === 'spp' && existingTagihan.bulan_tahun) {
    const earlierSpp = await db.tagihan
      .where({ siswa_id: existingTagihan.siswa_id, jenis: 'spp' })
      .filter((t) => Boolean(!t.deleted_at && t.status !== 'lunas' && t.bulan_tahun && t.bulan_tahun < existingTagihan.bulan_tahun!))
      .first();
    if (earlierSpp) {
      throw new ValidationError('Tagihan SPP harus dibayar berurutan. Selesaikan SPP yang lebih awal terlebih dahulu.');
    }
  }

  await canPayDaftarUlang(existingTagihan);

  const siswa = await db.siswa.get(existingTagihan.siswa_id);
  if (!siswa || siswa.deleted_at) {
    throw new NotFoundError('Siswa tidak ditemukan.');
  }

  if (!input.tanggal) {
    throw new ValidationError('Tanggal pembayaran wajib diisi.');
  }
  if (input.items.length === 0) {
    throw new ValidationError('Minimal satu metode pembayaran wajib diisi.');
  }
  const methods = new Set<string>();
  for (const item of input.items) {
    if (!item.metode.trim()) throw new ValidationError('Metode pembayaran wajib dipilih.');
    if (!Number.isFinite(item.jumlah) || item.jumlah <= 0) throw new ValidationError('Jumlah pembayaran tiap metode harus lebih dari nol.');
    const methodKey = item.metode.trim().toLowerCase();
    if (methods.has(methodKey)) throw new ValidationError(`Metode pembayaran duplikat: ${item.metode}. Gabungkan nominal dalam satu baris.`);
    methods.add(methodKey);
  }

  const totalPembayaran = input.items.reduce((total, item) => total + item.jumlah, 0);
  const pendingTotal = await getPendingVerificationTotal(existingTagihan.id);
  const sisaTagihan = existingTagihan.jumlah_total - existingTagihan.sudah_dibayar - pendingTotal;
  if (totalPembayaran > sisaTagihan) {
    throw new ValidationError('Jumlah pembayaran tidak boleh melebihi sisa tagihan.');
  }

  // Validasi tagihan Full (bisa_cicil = false)
  if (!existingTagihan.bisa_cicil) {
    if (pendingTotal > 0) {
      throw new ValidationError(
        'Tagihan ini harus dibayar penuh dan saat ini sudah ada pembayaran yang menunggu verifikasi. ' +
        'Selesaikan verifikasi pembayaran sebelumnya terlebih dahulu sebelum mencatat transaksi baru.',
      );
    }
    if (totalPembayaran < sisaTagihan) {
      throw new ValidationError(
        `Tagihan ini harus dibayar penuh sekaligus (tidak bisa dicicil). Sisa yang harus dibayar: Rp ${sisaTagihan.toLocaleString('id-ID')}.`,
      );
    }
  }

  const now = nowIso();
  const groupId = newId();
  const requiresVerification = input.items.some((item) => paymentNeedsVerification(item.metode));
  const verificationStatus: Pembayaran['status_verifikasi'] = requiresVerification ? 'menunggu_verifikasi' : 'terverifikasi';
  const pembayaranPromises = input.items.map(async (item) => toPendingInsert<Pembayaran>({
    id: newId(),
    no_kuitansi: await ReferenceGeneratorService.generateNoKuitansi(existingTagihan.tahun_ajaran_id),
    tagihan_id: existingTagihan.id,
    dicatat_oleh: actor.userId,
    jumlah: item.jumlah,
    metode: item.metode,
    tanggal: input.tanggal,
    catatan: item.catatan ?? input.catatan ?? null,
    payment_group_id: groupId,
    status_verifikasi: verificationStatus,
    diverifikasi_pada: requiresVerification ? null : now,
    diverifikasi_oleh: requiresVerification ? null : actor.userId,
    catatan_verifikasi: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }));
  const pembayaran = await Promise.all(pembayaranPromises);

  const updatedTagihan = requiresVerification ? existingTagihan : toPendingUpdate<Tagihan>(existingTagihan, {
    sudah_dibayar: existingTagihan.sudah_dibayar + totalPembayaran,
    updated_at: now,
  });
  if (!requiresVerification) {
    updatedTagihan.status = calculateTagihanStatus(updatedTagihan.jumlah_total, updatedTagihan.sudah_dibayar);
  }

  let updatedSiswa: Siswa | null = null;

  await db.transaction('rw', db.pembayaran, db.tagihan, db.siswa, db.sync_queue, async () => {
    for (const item of pembayaran) {
      await db.pembayaran.add(item);
      await enqueueSync('pembayaran', item.id, 'insert', item);
    }

    if (!requiresVerification) {
      await db.tagihan.put(updatedTagihan);
      await enqueueSync('tagihan', updatedTagihan.id, 'update', updatedTagihan);
    }
  });

  if (!requiresVerification && updatedTagihan.status === 'lunas' && updatedTagihan.jenis === 'pendaftaran' && siswa.jalur_registrasi !== 'migrasi') {
    const activationResult = await handleInitialBillingCompletion(siswa.id);
    if (activationResult && 'siswa' in activationResult && activationResult.siswa) {
      updatedSiswa = activationResult.siswa;
    } else if (activationResult && !('placement' in activationResult)) {
      updatedSiswa = activationResult as Siswa;
    }
  }

  if (!requiresVerification && existingTagihan.jenis !== 'daftar_ulang') {
    await updateDaftarUlangStatusIfAllPaid(siswa.id);
  }

  await catatAuditLog(actor, 'pembayaran', groupId, 'create',
    `Pembayaran ${pembayaran[0]?.no_kuitansi || ''} ${siswa?.nama || ''} ${pembayaran.map(p => p.jumlah).reduce((a, b) => a + b, 0)} ` +
    `(${pembayaran.map(p => `${p.metode}:Rp${p.jumlah}`).join(', ')})`,
    {
      nama_siswa: siswa?.nama, tagihan_id: existingTagihan.id, payment_group_id: groupId,
      requires_verification: requiresVerification, jumlah_total: pembayaran.reduce((a, p) => a + p.jumlah, 0),
      items: pembayaran.map(p => ({ id: p.id, metode: p.metode, jumlah: p.jumlah, no_kuitansi: p.no_kuitansi }))
    });

  return { pembayaran, tagihan: updatedTagihan, siswa: updatedSiswa, payment_group_id: groupId, requiresVerification };
}

export async function confirmPaymentGroup(actor: ServiceActor, groupId: string, catatan?: string | null) {
  await assertCanAccess(actor.role, 'pembayaran', 'edit');
  const group = (await db.pembayaran.where('payment_group_id').equals(groupId).toArray()).filter((item) => !item.deleted_at);
  if (group.length === 0) throw new NotFoundError('Grup pembayaran tidak ditemukan.');
  if (group.some((item) => item.status_verifikasi === 'ditolak')) throw new ValidationError('Pembayaran yang sudah ditolak tidak dapat dikonfirmasi.');

  // Only process items that are still pending verification
  const pendingItems = group.filter((item) => item.status_verifikasi === 'menunggu_verifikasi');
  if (pendingItems.length === 0) throw new ValidationError('Pembayaran sudah terverifikasi.');

  const pendingByTagihan = new Map<string, typeof pendingItems>();
  for (const item of pendingItems) {
    const list = pendingByTagihan.get(item.tagihan_id) || [];
    list.push(item);
    pendingByTagihan.set(item.tagihan_id, list);
  }

  const updatedPayments: Pembayaran[] = [];
  const tagihanToUpdate: Tagihan[] = [];
  let triggerActivationSiswaId: string | null = null;
  const now = nowIso();

  for (const [tagihanId, items] of pendingByTagihan.entries()) {
    const tagihan = await db.tagihan.get(tagihanId);
    if (!tagihan || tagihan.deleted_at) throw new NotFoundError('Tagihan tidak ditemukan.');
    await assertCanRecordPembayaranForTagihan(tagihan);

    const diskonTambahan = items.reduce((sum, item) => sum + (item.diskon_tambahan ?? 0), 0);
    let adjustedJumlahTotal = tagihan.jumlah_total;
    let adjustedPotonganDiskon = tagihan.potongan_diskon ?? 0;
    if (diskonTambahan > 0) {
      adjustedJumlahTotal = Math.max(0, adjustedJumlahTotal - diskonTambahan);
      adjustedPotonganDiskon += diskonTambahan;
    }

    const pendingTotal = items.reduce((sum, item) => sum + item.jumlah, 0);
    const sisa = adjustedJumlahTotal - tagihan.sudah_dibayar;
    if (pendingTotal > sisa) throw new ValidationError('Total pembayaran melebihi sisa tagihan.');

    const updatedTagihan = toPendingUpdate<Tagihan>(tagihan, {
      jumlah_total: adjustedJumlahTotal,
      potongan_diskon: adjustedPotonganDiskon,
      sudah_dibayar: tagihan.sudah_dibayar + pendingTotal,
      updated_at: now,
    });
    updatedTagihan.status = calculateTagihanStatus(updatedTagihan.jumlah_total, updatedTagihan.sudah_dibayar);
    tagihanToUpdate.push(updatedTagihan);

    if (updatedTagihan.status === 'lunas' && updatedTagihan.jenis === 'pendaftaran') {
      triggerActivationSiswaId = tagihan.siswa_id;
    }

    for (const item of items) {
      updatedPayments.push(toPendingUpdate<Pembayaran>(item, { status_verifikasi: 'terverifikasi', diverifikasi_pada: now, diverifikasi_oleh: actor.userId, catatan_verifikasi: catatan ?? null, updated_at: now }));
    }
  }

  let updatedSiswa: Siswa | null = null;

  await db.transaction('rw', db.pembayaran, db.tagihan, db.siswa, db.sync_queue, async () => {
    for (const item of updatedPayments) {
      await db.pembayaran.put(item);
      await enqueueSync('pembayaran', item.id, 'update', item);
    }
    for (const t of tagihanToUpdate) {
      await db.tagihan.put(t);
      await enqueueSync('tagihan', t.id, 'update', t);
    }
  });

  if (triggerActivationSiswaId) {
    const siswa = await db.siswa.get(triggerActivationSiswaId);
    if (siswa && siswa.jalur_registrasi !== 'migrasi') {
      const activationResult = await handleInitialBillingCompletion(siswa.id);
      if (activationResult && 'siswa' in activationResult && activationResult.siswa) updatedSiswa = activationResult.siswa;
      else if (activationResult && !('placement' in activationResult)) updatedSiswa = activationResult as Siswa;
    }
  }

  for (const t of tagihanToUpdate) {
    if (t.jenis !== 'daftar_ulang') {
      await updateDaftarUlangStatusIfAllPaid(t.siswa_id);
    }
  }

  await catatAuditLog(actor, 'pembayaran', groupId, 'update',
    `Konfirmasi pembayaran ${groupId} — ${updatedPayments.length} item diverifikasi`,
    {
      payment_group_id: groupId, item_count: updatedPayments.length, catatan,
      total_verified: updatedPayments.reduce((a, p) => a + p.jumlah, 0),
      tagihan_affected: tagihanToUpdate.map(t => ({ id: t.id, siswa: t.siswa_id, jumlah_total: t.jumlah_total, sudah_dibayar: t.sudah_dibayar }))
    });

  return { pembayaran: updatedPayments, tagihan: tagihanToUpdate[0], siswa: updatedSiswa };
}


export async function batalkanPembayaran(actor: ServiceActor, pembayaranId: string, catatan: string) {
  await assertCanAccess(actor.role, 'pembayaran', 'edit');

  const pembayaran = await db.pembayaran.get(pembayaranId);
  if (!pembayaran || pembayaran.deleted_at) {
    throw new NotFoundError('Pembayaran tidak ditemukan.');
  }
  if (pembayaran.status_verifikasi !== 'terverifikasi') {
    throw new ValidationError('Hanya pembayaran yang sudah terverifikasi yang bisa dibatalkan.');
  }

  const tagihan = await db.tagihan.get(pembayaran.tagihan_id);
  if (!tagihan || tagihan.deleted_at) {
    throw new NotFoundError('Tagihan tidak ditemukan.');
  }

  const now = nowIso();
  const updatedPembayaran = toPendingUpdate(pembayaran, { deleted_at: now, updated_at: now });
  const sisaBayar = Math.max(0, tagihan.sudah_dibayar - pembayaran.jumlah);
  const updatedTagihan = toPendingUpdate(tagihan, {
    sudah_dibayar: sisaBayar,
    status: calculateTagihanStatus(tagihan.jumlah_total, sisaBayar),
    updated_at: now,
  });

  await db.transaction('rw', db.pembayaran, db.tagihan, db.sync_queue, async () => {
    await db.pembayaran.put(updatedPembayaran);
    await enqueueSync('pembayaran', updatedPembayaran.id, 'delete', updatedPembayaran);
    await db.tagihan.put(updatedTagihan);
    await enqueueSync('tagihan', updatedTagihan.id, 'update', updatedTagihan);
  });

  const siswaNama = (await db.siswa.get(tagihan.siswa_id))?.nama || '';
  await catatAuditLog(actor, 'pembayaran', pembayaranId, 'batal',
    `Pembatalan pembayaran ${pembayaran.no_kuitansi || ''} ${siswaNama} Rp${pembayaran.jumlah}`,
    {
      nama_siswa: siswaNama, no_kuitansi: pembayaran.no_kuitansi, jumlah: pembayaran.jumlah,
      metode: pembayaran.metode, tagihan_id: tagihan.id, sisa_tagihan_setelah_batal: sisaBayar,
      catatan
    });

  return { pembayaran: updatedPembayaran, tagihan: updatedTagihan };
}

export async function rejectPaymentGroup(actor: ServiceActor, groupId: string, catatan?: string | null) {
  await assertCanAccess(actor.role, 'pembayaran', 'edit');
  const group = (await db.pembayaran.where('payment_group_id').equals(groupId).toArray()).filter((item) => !item.deleted_at);
  if (group.length === 0) throw new NotFoundError('Grup pembayaran tidak ditemukan.');

  // Only reject items that are still pending
  const pendingItems = group.filter((item) => item.status_verifikasi === 'menunggu_verifikasi');
  if (pendingItems.length === 0) throw new ValidationError('Tidak ada pembayaran yang menunggu verifikasi untuk ditolak.');

  const verifiedItems = group.filter((item) => item.status_verifikasi === 'terverifikasi');
  const now = nowIso();
  const updatedPending = pendingItems.map((item) => toPendingUpdate<Pembayaran>(item, { status_verifikasi: 'ditolak', diverifikasi_pada: now, diverifikasi_oleh: actor.userId, catatan_verifikasi: catatan ?? null, updated_at: now }));
  const updatedVerified = verifiedItems.map((item) => toPendingUpdate<Pembayaran>(item, { deleted_at: now, updated_at: now }));

  const verifiedByTagihan = new Map<string, number>();
  for (const item of verifiedItems) {
    verifiedByTagihan.set(item.tagihan_id, (verifiedByTagihan.get(item.tagihan_id) || 0) + item.jumlah);
  }

  const tagihanToUpdate: Tagihan[] = [];

  for (const [tagihanId, verifiedTotal] of verifiedByTagihan.entries()) {
    if (verifiedTotal > 0) {
      const tagihan = await db.tagihan.get(tagihanId);
      if (tagihan && !tagihan.deleted_at) {
        const newPaid = Math.max(0, tagihan.sudah_dibayar - verifiedTotal);
        const updatedTagihan = toPendingUpdate<Tagihan>(tagihan, { sudah_dibayar: newPaid, status: calculateTagihanStatus(tagihan.jumlah_total, newPaid), updated_at: now });
        tagihanToUpdate.push(updatedTagihan);
      }
    }
  }

  await db.transaction('rw', db.pembayaran, db.tagihan, db.sync_queue, async () => {
    for (const item of updatedPending) {
      await db.pembayaran.put(item);
      await enqueueSync('pembayaran', item.id, 'update', item);
    }
    for (const item of updatedVerified) {
      await db.pembayaran.put(item);
      await enqueueSync('pembayaran', item.id, 'delete', item);
    }
    for (const t of tagihanToUpdate) {
      await db.tagihan.put(t);
      await enqueueSync('tagihan', t.id, 'update', t);
    }
  });
  await catatAuditLog(actor, 'pembayaran', groupId, 'update',
    `Penolakan pembayaran ${groupId} — ${pendingItems.length} item ditolak${updatedVerified.length > 0 ? `, ${updatedVerified.length} item dibatalkan` : ''}`,
    {
      payment_group_id: groupId, catatan, pending_ditolak: pendingItems.length, verified_dibatalkan: updatedVerified.length,
      tagihan_affected: tagihanToUpdate.map(t => ({ id: t.id, siswa: t.siswa_id, sudah_dibayar_sebelum: t.sudah_dibayar }))
    });

  return [...updatedPending, ...updatedVerified];
}


export async function recordPembayaranBatch(actor: ServiceActor, input: RecordPembayaranBatchInput) {
  await assertCanAccess(actor.role, 'pembayaran', 'tambah');

  if (!input.tanggal) throw new ValidationError('Tanggal pembayaran wajib diisi.');
  if (input.tagihan_items.length === 0) throw new ValidationError('Minimal satu tagihan wajib dipilih.');
  if (input.payment_methods.length === 0) throw new ValidationError('Minimal satu metode pembayaran wajib diisi.');

  const siswa = await db.siswa.get(input.siswa_id);
  if (!siswa || siswa.deleted_at) throw new NotFoundError('Siswa tidak ditemukan.');

  let totalTagihan = 0;
  const tagihanMap = new Map<string, Tagihan>();
  const sppList: Tagihan[] = [];

  for (const item of input.tagihan_items) {
    if (!Number.isFinite(item.nominal_dibayar) || item.nominal_dibayar <= 0) {
      throw new ValidationError('Nominal dibayar tiap tagihan harus lebih dari nol.');
    }
    totalTagihan += item.nominal_dibayar;

    const t = await db.tagihan.get(item.tagihan_id);
    if (!t || t.deleted_at) throw new NotFoundError(`Tagihan tidak ditemukan: ${item.tagihan_id}`);
    if (t.siswa_id !== input.siswa_id) throw new ValidationError('Tagihan tidak sesuai dengan siswa.');
    if (t.status === 'lunas' || t.status === 'dibatalkan') throw new ValidationError(`Tagihan "${t.nama_tagihan}" sudah lunas atau dibatalkan.`);

    await assertCanRecordPembayaranForTagihan(t);
    await canPayDaftarUlang(t);

    const pendingTotal = await getPendingVerificationTotal(t.id);
    const diskonTambahan = item.diskon_tambahan && item.diskon_tambahan > 0 ? item.diskon_tambahan : 0;

    if (diskonTambahan > 0) {
      t.jumlah_total = Math.max(0, t.jumlah_total - diskonTambahan);
      t.potongan_diskon = (t.potongan_diskon || 0) + diskonTambahan;
    }

    const sisaTagihan = t.jumlah_total - t.sudah_dibayar - pendingTotal;

    if (item.nominal_dibayar > sisaTagihan) {
      throw new ValidationError(`Nominal dibayar melebihi sisa tagihan untuk "${t.nama_tagihan}".`);
    }

    if (!t.bisa_cicil) {
      if (pendingTotal > 0) throw new ValidationError(`Tagihan "${t.nama_tagihan}" harus dibayar penuh dan saat ini sudah ada pembayaran yang menunggu verifikasi.`);
      if (item.nominal_dibayar < sisaTagihan) throw new ValidationError(`Tagihan "${t.nama_tagihan}" harus dibayar penuh sekaligus.`);
    }

    tagihanMap.set(t.id, t);
    if (t.jenis === 'spp') sppList.push(t);
  }

  // Validate SPP Sequential (All unselected earlier SPPs must be checked)
  if (sppList.length > 0) {
    // Find earliest selected SPP
    const earliestSelectedSpp = [...sppList].sort((a, b) => (a.bulan_tahun ?? '').localeCompare(b.bulan_tahun ?? ''))[0];
    if (earliestSelectedSpp && earliestSelectedSpp.bulan_tahun) {
      const earlierUnpaidSpp = await db.tagihan
        .where({ siswa_id: input.siswa_id, jenis: 'spp' })
        .filter((t) => Boolean(!t.deleted_at && t.status !== 'lunas' && t.bulan_tahun && t.bulan_tahun < earliestSelectedSpp.bulan_tahun!))
        .toArray();
      // If there are earlier unpaid SPPs that are NOT in the selected batch
      for (const earlier of earlierUnpaidSpp) {
        if (!tagihanMap.has(earlier.id)) {
          throw new ValidationError(`Tagihan SPP harus dibayar berurutan. Pilih juga SPP yang lebih awal ("${earlier.nama_tagihan}").`);
        }
      }
    }
  }

  const methods = new Set<string>();
  let totalMetode = 0;
  for (const m of input.payment_methods) {
    if (!m.metode.trim()) throw new ValidationError('Metode pembayaran wajib dipilih.');
    if (!Number.isFinite(m.jumlah) || m.jumlah <= 0) throw new ValidationError('Jumlah pembayaran tiap metode harus lebih dari nol.');
    const methodKey = m.metode.trim().toLowerCase();
    if (methods.has(methodKey)) throw new ValidationError(`Metode pembayaran duplikat: ${m.metode}. Gabungkan nominal dalam satu baris.`);
    methods.add(methodKey);
    totalMetode += m.jumlah;
  }

  if (totalMetode !== totalTagihan) {
    throw new ValidationError(`Total input metode (Rp ${totalMetode.toLocaleString('id-ID')}) tidak sama dengan total tagihan yang akan dibayar (Rp ${totalTagihan.toLocaleString('id-ID')}).`);
  }

  const now = nowIso();
  const groupId = newId();
  const pembayaranToInsert: Pembayaran[] = [];
  const tagihanToUpdate: Tagihan[] = [];

  let availableMethods = input.payment_methods.map(m => ({ ...m, remaining: m.jumlah }));

  const requiresVerification = input.payment_methods.some((m) => paymentNeedsVerification(m.metode));
  const verificationStatus: Pembayaran['status_verifikasi'] = requiresVerification ? 'menunggu_verifikasi' : 'terverifikasi';

  for (const tItem of input.tagihan_items) {
    const existingTagihan = tagihanMap.get(tItem.tagihan_id)!;
    let amountToCover = tItem.nominal_dibayar;

    for (const method of availableMethods) {
      if (amountToCover <= 0) break;
      if (method.remaining <= 0) continue;

      const assigned = Math.min(amountToCover, method.remaining);
      method.remaining -= assigned;
      amountToCover -= assigned;

      const diskonTambahan = tItem.diskon_tambahan && tItem.diskon_tambahan > 0 ? tItem.diskon_tambahan : 0;

      pembayaranToInsert.push(toPendingInsert<Pembayaran>({
        id: newId(),
        no_kuitansi: await ReferenceGeneratorService.generateNoKuitansi(existingTagihan.tahun_ajaran_id),
        tagihan_id: existingTagihan.id,
        dicatat_oleh: actor.userId,
        jumlah: assigned,
        diskon_tambahan: diskonTambahan || undefined,
        metode: method.metode,
        tanggal: input.tanggal,
        catatan: method.catatan ?? input.catatan ?? null,
        payment_group_id: groupId,
        status_verifikasi: verificationStatus,
        diverifikasi_pada: requiresVerification ? null : now,
        diverifikasi_oleh: requiresVerification ? null : actor.userId,
        catatan_verifikasi: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }));
    }

    if (!requiresVerification) {
      const updatedTagihan = toPendingUpdate<Tagihan>(existingTagihan, {
        sudah_dibayar: existingTagihan.sudah_dibayar + tItem.nominal_dibayar,
        updated_at: now,
      });
      updatedTagihan.status = calculateTagihanStatus(updatedTagihan.jumlah_total, updatedTagihan.sudah_dibayar);
      tagihanToUpdate.push(updatedTagihan);
    }
  }

  let triggerActivation = false;
  let updatedSiswa: Siswa | null = null;

  if (!requiresVerification) {
    for (const updatedTagihan of tagihanToUpdate) {
      if (updatedTagihan.status === 'lunas' && updatedTagihan.jenis === 'pendaftaran') {
        if (siswa.jalur_registrasi !== 'migrasi') triggerActivation = true;
      }
    }
  }

  await db.transaction('rw', db.pembayaran, db.tagihan, db.siswa, db.sync_queue, async () => {
    for (const item of pembayaranToInsert) {
      await db.pembayaran.add(item);
      await enqueueSync('pembayaran', item.id, 'insert', item);
    }

    for (const t of tagihanToUpdate) {
      if (t.updated_at === now) {
        await db.tagihan.put(t);
        await enqueueSync('tagihan', t.id, 'update', t);
      }
    }

  });

  if (triggerActivation) {
    const activationResult = await handleInitialBillingCompletion(siswa.id);
    if (activationResult && 'siswa' in activationResult && activationResult.siswa) updatedSiswa = activationResult.siswa;
    else if (activationResult && !('placement' in activationResult)) updatedSiswa = activationResult as Siswa;
  }

  if (!requiresVerification) {
    await updateDaftarUlangStatusIfAllPaid(siswa.id);
  }

  return { pembayaran: pembayaranToInsert, tagihan: tagihanToUpdate, siswa: updatedSiswa, payment_group_id: groupId, requiresVerification };
}
