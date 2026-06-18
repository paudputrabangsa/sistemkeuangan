import { db } from '../db';
import type { Pembayaran, Siswa, SiswaKelas, Tagihan } from '../db/types';
import type { MigrasiCalonSiswaDraft } from './migrasiCalonSiswaDraftService';
import type { MigrasiSiswaTahunBerjalanDraft } from './migrasiSiswaTahunBerjalanDraftService';
import { updateMigrasiWizardStatus } from './onboardingService';
import { getPengaturanPendaftaranOrDefault, resolveJatuhTempoPendaftaran } from './pendaftaranTahunAjaranService';
import { getPengaturanNilaiByKunci, type SettingListValue } from './pengaturanRepository';
import { assertCanAccess } from './permissionService';
import { ValidationError } from './service-errors';
import { ReferenceGeneratorService } from './referenceGeneratorService';
import { calculateTagihanStatus, enqueueSync, newId, nowIso, toPendingInsert, type ServiceActor } from './service-helpers';

export interface MigrasiPrerequisites {
  activeYearId: string | null;
  activeYearName: string | null;
  activeClassCount: number;
  draftYearCount: number;
}

export async function getMigrasiPrerequisites(): Promise<MigrasiPrerequisites> {
  const [years, classes] = await Promise.all([db.tahun_ajaran.toArray(), db.kelas.toArray()]);
  const activeYear = years.find((item) => !item.deleted_at && (item.aktif || item.status === 'aktif')) ?? null;
  const activeClasses = activeYear ? classes.filter((item) => !item.deleted_at && item.tahun_ajaran_id === activeYear.id) : [];
  const draftYears = years.filter((item) => !item.deleted_at && item.status === 'draft');

  return {
    activeYearId: activeYear?.id ?? null,
    activeYearName: activeYear?.nama ?? null,
    activeClassCount: activeClasses.length,
    draftYearCount: draftYears.length,
  };
}

export async function assertCanRunMigrasiDataAwal() {
  const setting = await db.pengaturan.where('kunci').equals('onboarding_status').first();
  const status = setting?.nilai as { operasional_aktif?: boolean } | undefined;
  if (status?.operasional_aktif) {
    throw new ValidationError('Migrasi data awal sudah dikunci karena operasional sudah aktif. Gunakan import operasional untuk input massal.');
  }
}





export interface MigrasiSiswaTahunBerjalanPreviewRow {
  rowId: string;
  nama: string;
  status: 'aktif' | 'keluar';
  kelasLabel: string;
  totalTagihan: number;
  totalPembayaran: number;
  sisa: number;
  nis: string;
  namaPromo: string;
  nominalDiskonTagihan: number;
}

export interface MigrasiCalonSiswaPreviewRow {
  rowId: string;
  nama: string;
  tanggalDaftar: string;
  kelasRencanaLabel: string;
  totalTagihan: number;
  totalPembayaran: number;
  sisa: number;
  statusBayar: 'belum_bayar' | 'sebagian' | 'lunas' | 'dibatalkan';
  namaPromo: string;
  namaPromoTagihan: string;
  nominalDiskonTagihan: number;
}

export async function previewMigrasiCalonSiswa(draft: MigrasiCalonSiswaDraft): Promise<MigrasiCalonSiswaPreviewRow[]> {
  if (!draft.tahun_ajaran_target_id) throw new ValidationError('Tahun ajaran target wajib dipilih.');
  const classes = await db.kelas.where('tahun_ajaran_id').equals(draft.tahun_ajaran_target_id).toArray();

  return draft.rows.filter((item) => item.nama.trim()).map((row) => {
    const kelas = row.kelas_rencana_id ? classes.find((item) => item.id === row.kelas_rencana_id && !item.deleted_at) : null;
    const tagihans = draft.tagihanRows.filter((item) => item.siswa_row_id === row.id);
    const totalTagihan = tagihans.reduce((sum, item) => sum + Number(item.jumlah_total || 0), 0);
    const nominalDiskonTagihan = tagihans.reduce((sum, item) => sum + (item.nominal_diskon ? Number(item.nominal_diskon) : 0), 0);
    const netTagihan = Math.max(0, totalTagihan - nominalDiskonTagihan);
    const totalPembayaran = draft.pembayaranRows.filter((item) => item.siswa_row_id === row.id).reduce((sum, item) => sum + Number(item.jumlah || 0), 0);
    return {
      rowId: row.id,
      nama: row.nama,
      tanggalDaftar: row.tanggal_daftar,
      kelasRencanaLabel: kelas ? `${kelas.tingkat ? `${kelas.tingkat} - ` : ''}${kelas.nama_kelas}` : 'Auto-placement saat aktif',
      totalTagihan,
      totalPembayaran,
      sisa: Math.max(0, netTagihan - totalPembayaran),
      statusBayar: calculateTagihanStatus(netTagihan, totalPembayaran),
      namaPromo: row.nama_promo || '-',
      namaPromoTagihan: tagihans.map((item) => item.nama_promo).filter(Boolean).join(', ') || '-',
      nominalDiskonTagihan,
    };
  });
}

export async function previewMigrasiSiswaTahunBerjalan(draft: MigrasiSiswaTahunBerjalanDraft) {
  const prerequisites = await getMigrasiPrerequisites();
  if (!prerequisites.activeYearId) throw new ValidationError('Tahun ajaran aktif tidak ditemukan.');
  const activeYear = await db.tahun_ajaran.get(prerequisites.activeYearId);
  if (!activeYear) throw new ValidationError('Tahun ajaran aktif tidak ditemukan.');
  const kelasList = await db.kelas.where('tahun_ajaran_id').equals(activeYear.id).toArray();
  const rows: MigrasiSiswaTahunBerjalanPreviewRow[] = [];

  for (const row of draft.rows.filter((item) => item.nama.trim())) {
    const kelas = kelasList.find((item) => item.id === row.kelas_id && !item.deleted_at);
    const totalTagihan = (draft.tagihanRows ?? []).filter((item) => item.siswa_row_id === row.id).reduce((sum, item) => sum + (Number(item.jumlah_total) || 0), 0);
    const manualTagihanRows = new Set((draft.tagihanRows ?? []).filter((item) => item.siswa_row_id === row.id).map((item) => item.id));
    const tagihanDrafts = (draft.tagihanRows ?? []).filter((item) => item.siswa_row_id === row.id);
    const nominalDiskonTagihan = tagihanDrafts.reduce((sum, item) => sum + (item.nominal_diskon ? Number(item.nominal_diskon) : 0), 0);
    const totalPembayaran = (draft.pembayaranRows ?? []).filter((item) => item.siswa_row_id === row.id || (item.tagihan_row_id && manualTagihanRows.has(item.tagihan_row_id))).reduce((sum, item) => sum + (Number(item.jumlah) || 0), 0);
    rows.push({
      rowId: row.id,
      nama: row.nama,
      status: row.status,
      kelasLabel: kelas ? `${kelas.tingkat ? `${kelas.tingkat} - ` : ''}${kelas.nama_kelas}` : '-',
      totalTagihan,
      nominalDiskonTagihan,
      totalPembayaran,
      sisa: Math.max(0, totalTagihan - nominalDiskonTagihan - totalPembayaran),
      nis: row.nis || '-',
      namaPromo: row.nama_promo || '-',
    });
  }

  return rows;
}

export async function saveMigrasiSiswaTahunBerjalan(actor: ServiceActor, draft: MigrasiSiswaTahunBerjalanDraft, options?: { autoGenerateNis?: boolean }) {
  await assertCanAccess(actor.role, 'siswa', 'tambah');
  await assertCanAccess(actor.role, 'tagihan', 'tambah');
  await assertCanAccess(actor.role, 'pengaturan', 'edit');
  await assertCanRunMigrasiDataAwal();

  const rows = draft.rows.filter((item) => item.nama.trim());
  if (rows.length === 0) throw new ValidationError('Minimal satu siswa wajib diisi.');

  const prerequisites = await getMigrasiPrerequisites();
  if (!prerequisites.activeYearId) throw new ValidationError('Tahun ajaran aktif tidak ditemukan.');
  if (prerequisites.activeClassCount === 0) throw new ValidationError('Minimal satu kelas aktif wajib tersedia untuk migrasi siswa tahun berjalan.');
  const activeYear = await db.tahun_ajaran.get(prerequisites.activeYearId);
  if (!activeYear) throw new ValidationError('Tahun ajaran aktif tidak ditemukan.');
  const kelasList = await db.kelas.where('tahun_ajaran_id').equals(activeYear.id).toArray();
  const existingStudents = await db.siswa.toArray();
  const existingTagihan = await db.tagihan.toArray();
  const now = nowIso();

  const createdStudents: Siswa[] = [];
  const createdAssignments: SiswaKelas[] = [];
  const createdBills: Tagihan[] = [];
  const createdPayments: Pembayaran[] = [];
  const studentIdByRowId = new Map<string, string>();
  const tagihanIdByRowId = new Map<string, string>();


  await db.transaction('rw', [db.siswa, db.siswa_kelas, db.tagihan, db.pembayaran, db.pengaturan, db.sync_queue], async () => {
    for (const [index, row] of rows.entries()) {
      const rowLabel = `Baris ${index + 1} (${row.nama || 'tanpa nama'})`;
      if (!row.nama.trim()) throw new ValidationError(`${rowLabel}: nama siswa wajib diisi.`);
      if (!row.nama_wali.trim()) throw new ValidationError(`${rowLabel}: nama wali wajib diisi.`);
      if (!row.tanggal_daftar) throw new ValidationError(`${rowLabel}: tanggal daftar wajib diisi.`);
      if (!row.kelas_id) throw new ValidationError(`${rowLabel}: kelas wajib dipilih.`);
      if (row.status === 'keluar' && !row.tanggal_keluar) throw new ValidationError(`${rowLabel}: tanggal keluar wajib diisi.`);
      if (row.status === 'keluar' && !row.alasan_keluar) throw new ValidationError(`${rowLabel}: alasan keluar wajib diisi.`);
      if (row.tarif_spp_khusus && Number(row.tarif_spp_khusus) < 0) throw new ValidationError(`${rowLabel}: tarif SPP khusus tidak boleh negatif.`);
      if (row.kode_import_siswa?.trim()) {
        const existingByCode = existingStudents.find((item) => !item.deleted_at && item.kode_import_siswa?.trim().toLowerCase() === row.kode_import_siswa.trim().toLowerCase());
        if (existingByCode) throw new ValidationError(`${rowLabel}: kode import siswa '${row.kode_import_siswa.trim()}' sudah digunakan oleh ${existingByCode.nama}.`);
      }
      if (existingStudents.some((item) => !item.deleted_at && item.nama.trim().toLowerCase() === row.nama.trim().toLowerCase() && item.nama_wali.trim().toLowerCase() === row.nama_wali.trim().toLowerCase() && (item.tanggal_lahir ?? '') === (row.tanggal_lahir ?? ''))) {
        throw new ValidationError(`${rowLabel}: siswa dengan nama, wali, dan tanggal lahir yang sama sudah ada.`);
      }

      const kelas = kelasList.find((item) => item.id === row.kelas_id && !item.deleted_at);
      if (!kelas) throw new ValidationError(`${rowLabel}: kelas tidak valid.`);
      const siswaId = newId();
      const siswa = toPendingInsert<Siswa>({
        id: siswaId,
        nama: row.nama.trim(),
        tanggal_lahir: row.tanggal_lahir || null,
        jenis_kelamin: row.jenis_kelamin || null,
        foto_url: null,
        nama_wali: row.nama_wali.trim(),
        hubungan_wali: null,
        kontak_wali: row.kontak_wali.trim(),
        email_wali: null,
        alamat: row.alamat.trim() || null,
        status: row.status === 'aktif' ? 'aktif' : 'berhenti',
        flag_diskon_spp: false,
        tipe_diskon_spp: 'persen',
        persen_diskon: 0,
        nominal_diskon_spp: 0,
        tarif_spp_khusus: row.tarif_spp_khusus ? Number(row.tarif_spp_khusus) : null,
        alasan_tarif_spp_khusus: row.alasan_tarif_spp_khusus?.trim() || null,
        tanggal_daftar: row.tanggal_daftar,
        jenis_masuk: row.jenis_masuk,
        tahun_ajaran_target_id: activeYear.id,
        kelas_rencana_id: null,
        jalur_registrasi: 'migrasi',
        sumber_data: 'manual',
        alasan_keluar: row.status === 'keluar' ? row.alasan_keluar || null : null,
        tanggal_keluar: row.status === 'keluar' ? row.tanggal_keluar : null,
        kode_import_siswa: row.kode_import_siswa.trim() || null,
        nis: row.nis?.trim() || (options?.autoGenerateNis ? await ReferenceGeneratorService.generateNIS(activeYear.id) : null),
        daftar_promo: row.nama_promo ? row.nama_promo.split(',').map(s => s.trim()).filter(Boolean) : null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      const assignment = toPendingInsert<SiswaKelas>({
        id: newId(),
        siswa_id: siswa.id,
        kelas_id: kelas.id,
        mulai: row.tanggal_daftar,
        selesai: row.status === 'aktif' ? null : row.tanggal_keluar,
        penempatan_sumber: 'manual',
        catatan_penempatan: row.status === 'aktif' && row.tarif_spp_khusus ? `Tarif SPP khusus migrasi: ${row.tarif_spp_khusus}. ${row.alasan_tarif_spp_khusus}`.trim() : null,
        status_akhir_periode: row.status === 'aktif' ? null : 'keluar',
        created_at: now,
        updated_at: now,
      });

      await db.siswa.add(siswa);
      await enqueueSync('siswa', siswa.id, 'insert', siswa);
      await db.siswa_kelas.add(assignment);
      await enqueueSync('siswa_kelas', assignment.id, 'insert', assignment);
      createdStudents.push(siswa);
      createdAssignments.push(assignment);
      studentIdByRowId.set(row.id, siswa.id);


    }

    const manualTagihanRows = draft.tagihanRows ?? [];
    const tagihanCodes = new Set<string>();
    for (const [index, row] of manualTagihanRows.entries()) {
      const rowLabel = `Tagihan ${index + 1}`;
      if (!row.siswa_row_id || !studentIdByRowId.has(row.siswa_row_id)) throw new ValidationError(`${rowLabel}: siswa wajib dipilih.`);
      if (!row.kode_import_tagihan.trim()) throw new ValidationError(`${rowLabel}: kode tagihan wajib diisi.`);
      if (tagihanCodes.has(row.kode_import_tagihan.trim().toLowerCase())) throw new ValidationError(`${rowLabel}: kode tagihan duplikat.`);
      tagihanCodes.add(row.kode_import_tagihan.trim().toLowerCase());
      if (!row.nama_tagihan.trim()) throw new ValidationError(`${rowLabel}: nama tagihan wajib diisi.`);
      if (!row.jatuh_tempo) throw new ValidationError(`${rowLabel}: jatuh tempo wajib diisi.`);
      const total = Number(row.jumlah_total);
      if (!Number.isFinite(total) || total < 0) throw new ValidationError(`${rowLabel}: jumlah total harus nol atau lebih.`);

      const siswaId = studentIdByRowId.get(row.siswa_row_id)!;
      if ((row.jenis_tagihan as string)?.toLowerCase() === 'spp' && row.bulan_tahun) {
        if (existingTagihan.some((t) => !t.deleted_at && t.siswa_id === siswaId && t.bulan_tahun === row.bulan_tahun)) {
          throw new ValidationError(`${rowLabel}: tagihan SPP bulan ${row.bulan_tahun} sudah ada untuk siswa ini.`);
        }
        if (createdBills.some((t) => t.siswa_id === siswaId && t.bulan_tahun === row.bulan_tahun)) {
          throw new ValidationError(`${rowLabel}: tagihan SPP bulan ${row.bulan_tahun} sudah ada dalam batch ini.`);
        }
      } else {
        if (existingTagihan.some((t) => !t.deleted_at && t.siswa_id === siswaId && t.nama_tagihan.trim().toLowerCase() === row.nama_tagihan.trim().toLowerCase() && t.jumlah_total === total)) {
          throw new ValidationError(`${rowLabel}: tagihan '${row.nama_tagihan.trim()}' dengan nominal yang sama sudah ada untuk siswa ini.`);
        }
        if (createdBills.some((t) => t.siswa_id === siswaId && t.nama_tagihan.trim().toLowerCase() === row.nama_tagihan.trim().toLowerCase() && t.jumlah_total === total)) {
          throw new ValidationError(`${rowLabel}: tagihan '${row.nama_tagihan.trim()}' dengan nominal yang sama sudah ada dalam batch ini.`);
        }
      }

      const tagihan = toPendingInsert<Tagihan>({
        id: newId(),
        siswa_id: siswaId,
        tahun_ajaran_id: activeYear.id,
        jenis: ((row.jenis_tagihan as string)?.trim().toLowerCase() as any) || 'lainnya',
        nama_tagihan: row.nama_tagihan.trim(),
        jumlah_total: Math.max(0, total - (row.nominal_diskon ? Number(row.nominal_diskon) : 0)),
        sudah_dibayar: 0,
        jatuh_tempo: row.jatuh_tempo,
        status: calculateTagihanStatus(Math.max(0, total - (row.nominal_diskon ? Number(row.nominal_diskon) : 0)), 0),
        bisa_cicil: row.bisa_cicil,
        bulan_tahun: row.bulan_tahun || null,
        potongan_diskon: row.nominal_diskon ? Number(row.nominal_diskon) : 0,
        nama_promo: row.nama_promo?.trim() || null,
        created_by: actor.userId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      await db.tagihan.add(tagihan);
      await enqueueSync('tagihan', tagihan.id, 'insert', tagihan);
      createdBills.push(tagihan);
      tagihanIdByRowId.set(row.id, tagihan.id);
    }

    const paymentRows = draft.pembayaranRows ?? [];
    const paidByTagihanRowId = new Map<string, number>();
    const metodePembayaran = await getPengaturanNilaiByKunci<SettingListValue[]>('metode_pembayaran');
    const metodeAktifMap = new Map((Array.isArray(metodePembayaran) ? metodePembayaran : []).filter((item) => item.aktif !== false).map((item) => [item.nama.toLowerCase(), item.nama]));
    for (const [index, row] of paymentRows.entries()) {
      const rowLabel = `Pembayaran ${index + 1}`;
      const isManualBillPayment = Boolean(row.tagihan_row_id);
      const isSppPayment = Boolean(row.siswa_row_id || row.bulan_tahun);
      if (isManualBillPayment && isSppPayment) throw new ValidationError(`${rowLabel}: isi referensi tagihan manual atau SPP auto, bukan keduanya.`);
      if (!isManualBillPayment && !isSppPayment) throw new ValidationError(`${rowLabel}: pembayaran wajib mengacu ke tagihan manual atau SPP auto.`);
      if (!row.kode_import_pembayaran.trim()) throw new ValidationError(`${rowLabel}: kode pembayaran wajib diisi.`);
      if (!row.tanggal) throw new ValidationError(`${rowLabel}: tanggal pembayaran wajib diisi.`);
      if (!row.metode || !metodeAktifMap.has(row.metode.toLowerCase())) throw new ValidationError(`${rowLabel}: metode pembayaran tidak valid atau tidak aktif.`);
      const resolvedMetode = metodeAktifMap.get(row.metode.toLowerCase())!;
      const amount = Number(row.jumlah);
      if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError(`${rowLabel}: jumlah pembayaran harus lebih dari nol.`);
      const billId = isManualBillPayment ? tagihanIdByRowId.get(row.tagihan_row_id) : undefined;
      if (isSppPayment) throw new ValidationError(`${rowLabel}: SPP tidak lagi digenerate otomatis saat migrasi, harap gunakan tagihan manual untuk migrasi tunggakan SPP lama.`);
      if (isManualBillPayment && !billId) throw new ValidationError(`${rowLabel}: tagihan manual tidak ditemukan.`);
      const bill = createdBills.find((item) => item.id === billId);
      if (!bill) throw new ValidationError(`${rowLabel}: tagihan tidak ditemukan.`);
      const paymentKey = bill.id;
      const paidBefore = paidByTagihanRowId.get(paymentKey) ?? 0;
      if (paidBefore + amount > bill.jumlah_total) throw new ValidationError(`${rowLabel}: total pembayaran melebihi jumlah tagihan.`);
      paidByTagihanRowId.set(paymentKey, paidBefore + amount);

      const payment = toPendingInsert<Pembayaran>({
        id: newId(),
        tagihan_id: bill.id,
        dicatat_oleh: actor.userId,
        jumlah: amount,
        metode: resolvedMetode,
        tanggal: row.tanggal,
        catatan: row.catatan.trim() || null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      await db.pembayaran.add(payment);
      await enqueueSync('pembayaran', payment.id, 'insert', payment);
      createdPayments.push(payment);
    }

    for (const [billId, paid] of paidByTagihanRowId.entries()) {
      const bill = createdBills.find((item) => item.id === billId) ?? null;
      if (!bill) continue;
      const updated = { ...bill, sudah_dibayar: paid, status: calculateTagihanStatus(bill.jumlah_total, paid), updated_at: now };
      await db.tagihan.put(updated);
      await enqueueSync('tagihan', updated.id, 'update', updated);
      const index = createdBills.findIndex((item) => item.id === updated.id);
      if (index >= 0) createdBills[index] = updated;
    }
  });

  await updateMigrasiWizardStatus(actor, 'siswa_tahun_berjalan', 'selesai');

  return { students: createdStudents, assignments: createdAssignments, bills: createdBills, payments: createdPayments };
}

export async function saveMigrasiCalonSiswa(actor: ServiceActor, draft: MigrasiCalonSiswaDraft) {
  await assertCanAccess(actor.role, 'siswa', 'tambah');
  await assertCanAccess(actor.role, 'tagihan', 'tambah');
  await assertCanAccess(actor.role, 'pembayaran', 'tambah');
  await assertCanAccess(actor.role, 'pengaturan', 'edit');
  await assertCanRunMigrasiDataAwal();

  const rows = draft.rows.filter((item) => item.nama.trim());
  if (rows.length === 0) throw new ValidationError('Minimal satu calon siswa wajib diisi.');
  if (!draft.tahun_ajaran_target_id) throw new ValidationError('Tahun ajaran target wajib dipilih.');
  const targetYear = await db.tahun_ajaran.get(draft.tahun_ajaran_target_id);
  if (!targetYear || targetYear.deleted_at || (targetYear.status ?? 'draft') !== 'draft') throw new ValidationError('Migrasi calon siswa wajib memakai tahun ajaran target berstatus draft.');
  const classes = await db.kelas.where('tahun_ajaran_id').equals(targetYear.id).toArray();
  const setting = await getPengaturanPendaftaranOrDefault(targetYear.id);
  const metodePembayaran = await getPengaturanNilaiByKunci<SettingListValue[]>('metode_pembayaran');
  const metodeAktifMap = new Map((Array.isArray(metodePembayaran) ? metodePembayaran : []).filter((item) => item.aktif !== false).map((item) => [item.nama.toLowerCase(), item.nama]));
  const existingStudents = await db.siswa.toArray();
  const existingTagihan = await db.tagihan.toArray();
  const now = nowIso();
  const createdStudents: Siswa[] = [];
  const createdBills: Tagihan[] = [];
  const createdPayments: Pembayaran[] = [];

  await db.transaction('rw', [db.siswa, db.tagihan, db.pembayaran, db.pengaturan, db.sync_queue], async () => {
    for (const [index, row] of rows.entries()) {
      const rowLabel = `Calon ${index + 1}`;
      if (!row.nama.trim()) throw new ValidationError(`${rowLabel}: nama wajib diisi.`);
      if (!row.tanggal_lahir) throw new ValidationError(`${rowLabel}: tanggal lahir wajib diisi.`);
      if (!row.nama_wali.trim()) throw new ValidationError(`${rowLabel}: nama wali wajib diisi.`);
      if (!row.tanggal_daftar) throw new ValidationError(`${rowLabel}: tanggal daftar wajib diisi.`);
      if (row.kelas_rencana_id && !classes.some((kelas) => kelas.id === row.kelas_rencana_id && !kelas.deleted_at)) throw new ValidationError(`${rowLabel}: kelas rencana tidak valid.`);
      if (row.kode_import_siswa?.trim()) {
        const existingByCode = existingStudents.find((item) => !item.deleted_at && item.kode_import_siswa?.trim().toLowerCase() === row.kode_import_siswa.trim().toLowerCase());
        if (existingByCode) throw new ValidationError(`${rowLabel}: kode import siswa '${row.kode_import_siswa.trim()}' sudah digunakan oleh ${existingByCode.nama}.`);
      }
      if (existingStudents.some((item) => !item.deleted_at && item.nama.trim().toLowerCase() === row.nama.trim().toLowerCase() && item.nama_wali.trim().toLowerCase() === row.nama_wali.trim().toLowerCase() && (item.tanggal_lahir ?? '') === (row.tanggal_lahir ?? '') && item.tahun_ajaran_target_id === targetYear.id)) {
        throw new ValidationError(`${rowLabel}: calon siswa dengan nama, wali, dan tanggal lahir yang sama sudah ada di tahun ajaran ini.`);
      }
      const tagihanDraftList = draft.tagihanRows.filter((item) => item.siswa_row_id === row.id);

      const siswa = toPendingInsert<Siswa>({
        id: newId(),
        nama: row.nama.trim(),
        tanggal_lahir: row.tanggal_lahir,
        jenis_kelamin: row.jenis_kelamin || null,
        foto_url: null,
        nama_wali: row.nama_wali.trim(),
        hubungan_wali: null,
        kontak_wali: row.kontak_wali.trim(),
        email_wali: null,
        alamat: row.alamat.trim() || null,
        status: 'calon',
        flag_diskon_spp: false,
        tipe_diskon_spp: undefined,
        persen_diskon: 0,
        nominal_diskon_spp: 0,
        tanggal_daftar: row.tanggal_daftar,
        jenis_masuk: 'awal_tahun',
        tahun_ajaran_target_id: targetYear.id,
        kelas_rencana_id: row.kelas_rencana_id || null,
        jalur_registrasi: 'migrasi',
        sumber_data: 'manual',
        alasan_keluar: null,
        tanggal_keluar: null,
        kode_import_siswa: row.kode_import_siswa.trim() || null,
        daftar_promo: row.nama_promo ? row.nama_promo.split(',').map(s => s.trim()).filter(Boolean) : null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      await db.siswa.add(siswa);
      await enqueueSync('siswa', siswa.id, 'insert', siswa);
      createdStudents.push(siswa);

      for (const [tagihanIndex, tagihanDraft] of tagihanDraftList.entries()) {
        const tagihanTotal = Number(tagihanDraft.jumlah_total);
        const due = tagihanDraft?.jatuh_tempo || resolveJatuhTempoPendaftaran(setting, row.tanggal_daftar);
        if (!Number.isFinite(tagihanTotal) || tagihanTotal < 0) throw new ValidationError(`${rowLabel} Tagihan ${tagihanIndex + 1}: tagihan pendaftaran tidak valid.`);
        const namaTagihan = tagihanDraft?.nama_tagihan || `Pendaftaran ${siswa.nama}`;
        const jenisTagihan = tagihanDraft?.jenis_tagihan ? tagihanDraft.jenis_tagihan.trim().toLowerCase() : 'pendaftaran';
        if (existingTagihan.some((t) => !t.deleted_at && t.siswa_id === siswa.id && t.jenis === jenisTagihan && t.jumlah_total === tagihanTotal && t.nama_tagihan === namaTagihan)) {
          throw new ValidationError(`${rowLabel} Tagihan ${tagihanIndex + 1}: tagihan '${namaTagihan}' sudah ada untuk siswa ini.`);
        }
        if (createdBills.some((t) => t.siswa_id === siswa.id && t.jenis === jenisTagihan && t.jumlah_total === tagihanTotal && t.nama_tagihan === namaTagihan)) {
          throw new ValidationError(`${rowLabel} Tagihan ${tagihanIndex + 1}: tagihan '${namaTagihan}' sudah ada dalam batch ini.`);
        }
        const bill = toPendingInsert<Tagihan>({
          id: newId(),
          siswa_id: siswa.id,
          tahun_ajaran_id: targetYear.id,
          jenis: jenisTagihan,
          nama_tagihan: namaTagihan,
          jumlah_total: Math.max(0, tagihanTotal - (tagihanDraft?.nominal_diskon ? Number(tagihanDraft.nominal_diskon) : 0)),
          sudah_dibayar: 0,
          jatuh_tempo: due,
          status: calculateTagihanStatus(Math.max(0, tagihanTotal - (tagihanDraft?.nominal_diskon ? Number(tagihanDraft.nominal_diskon) : 0)), 0),
          bisa_cicil: tagihanDraft?.bisa_cicil ?? setting.opsi_bayar_default === 'cicil',
          bulan_tahun: null,
          potongan_diskon: tagihanDraft?.nominal_diskon ? Number(tagihanDraft.nominal_diskon) : 0,
          nama_promo: tagihanDraft?.nama_promo?.trim() || null,
          created_by: actor.userId,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        });
        await db.tagihan.add(bill);
        await enqueueSync('tagihan', bill.id, 'insert', bill);
        createdBills.push(bill);

        const payments = draft.pembayaranRows.filter((item) => (tagihanDraft.id && item.tagihan_row_id === tagihanDraft.id) || (!tagihanDraft.id && item.siswa_row_id === row.id));
        let paid = 0;
        for (const [paymentIndex, paymentRow] of payments.entries()) {
          const paymentLabel = `${rowLabel} Tagihan ${tagihanIndex + 1} pembayaran ${paymentIndex + 1}`;
          if (!paymentRow.tanggal) throw new ValidationError(`${paymentLabel}: tanggal wajib diisi.`);
          if (!paymentRow.metode || !metodeAktifMap.has(paymentRow.metode.toLowerCase())) throw new ValidationError(`${paymentLabel}: metode tidak valid.`);
          const resolvedMetode = metodeAktifMap.get(paymentRow.metode.toLowerCase())!;
          const amount = Number(paymentRow.jumlah);
          if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError(`${paymentLabel}: jumlah harus lebih dari nol.`);
          if (paid + amount > bill.jumlah_total) throw new ValidationError(`${paymentLabel}: total pembayaran melebihi tagihan.`);
          paid += amount;
          const payment = toPendingInsert<Pembayaran>({ id: newId(), tagihan_id: bill.id, dicatat_oleh: actor.userId, jumlah: amount, metode: resolvedMetode, tanggal: paymentRow.tanggal, catatan: paymentRow.catatan.trim() || null, created_at: now, updated_at: now, deleted_at: null });
          await db.pembayaran.add(payment);
          await enqueueSync('pembayaran', payment.id, 'insert', payment);
          createdPayments.push(payment);
        }
        if (paid > 0) {
          const updated = { ...bill, sudah_dibayar: paid, status: calculateTagihanStatus(bill.jumlah_total, paid), updated_at: now };
          await db.tagihan.put(updated);
          await enqueueSync('tagihan', updated.id, 'update', updated);
          const index = createdBills.findIndex((item) => item.id === updated.id);
          if (index >= 0) createdBills[index] = updated;
        }
      }
    }
  });

  await updateMigrasiWizardStatus(actor, 'calon_siswa', 'selesai');

  return { students: createdStudents, bills: createdBills, payments: createdPayments };
}

export async function resetMigrasiCalonSiswaData(actor: ServiceActor): Promise<void> {
  const now = new Date().toISOString();
  const siswaToReset = await db.siswa.filter((s) => s.jalur_registrasi === 'migrasi' && s.status === 'calon' && !s.deleted_at).toArray();
  for (const siswa of siswaToReset) {
    siswa.deleted_at = now;
    await db.siswa.put(siswa);
    await enqueueSync('siswa', siswa.id, 'update', siswa);

    const tagihanToReset = await db.tagihan.where('siswa_id').equals(siswa.id).filter((t) => !t.deleted_at).toArray();
    for (const tagihan of tagihanToReset) {
      tagihan.deleted_at = now;
      await db.tagihan.put(tagihan);
      await enqueueSync('tagihan', tagihan.id, 'update', tagihan);

      const pembayaranToReset = await db.pembayaran.where('tagihan_id').equals(tagihan.id).filter((p) => !p.deleted_at).toArray();
      for (const pembayaran of pembayaranToReset) {
        pembayaran.deleted_at = now;
        await db.pembayaran.put(pembayaran);
        await enqueueSync('pembayaran', pembayaran.id, 'update', pembayaran);
      }
    }
  }
  await updateMigrasiWizardStatus(actor, 'calon_siswa', 'belum_mulai');
}

export async function resetMigrasiSiswaTahunBerjalanData(actor: ServiceActor): Promise<void> {
  const now = new Date().toISOString();
  const siswaToReset = await db.siswa.filter((s) => s.jalur_registrasi === 'migrasi' && s.status !== 'calon' && !s.deleted_at).toArray();
  for (const siswa of siswaToReset) {
    siswa.deleted_at = now;
    await db.siswa.put(siswa);
    await enqueueSync('siswa', siswa.id, 'update', siswa);

    const kelasToReset = await db.siswa_kelas.where('siswa_id').equals(siswa.id).toArray();
    for (const kelas of kelasToReset) {
      await db.siswa_kelas.delete(kelas.id);
      await enqueueSync('siswa_kelas', kelas.id, 'delete', kelas);
    }

    const tagihanToReset = await db.tagihan.where('siswa_id').equals(siswa.id).filter((t) => !t.deleted_at).toArray();
    for (const tagihan of tagihanToReset) {
      tagihan.deleted_at = now;
      await db.tagihan.put(tagihan);
      await enqueueSync('tagihan', tagihan.id, 'update', tagihan);

      const pembayaranToReset = await db.pembayaran.where('tagihan_id').equals(tagihan.id).filter((p) => !p.deleted_at).toArray();
      for (const pembayaran of pembayaranToReset) {
        pembayaran.deleted_at = now;
        await db.pembayaran.put(pembayaran);
        await enqueueSync('pembayaran', pembayaran.id, 'update', pembayaran);
      }
    }
  }
  await updateMigrasiWizardStatus(actor, 'siswa_tahun_berjalan', 'belum_mulai');
}
