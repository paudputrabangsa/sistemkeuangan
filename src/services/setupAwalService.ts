import { db } from '../db';
import { ensureLoginBootstrap } from '../db/seed';
import type { Kelas, Pengaturan, PengaturanPendaftaranTahunAjaran, ProfilSekolah, SppGenerateCutoffSetting, TahunAjaran, Tingkat } from '../db/types';
import { assertCanAccess } from './permissionService';
import { ValidationError } from './service-errors';
import { enqueueSync, newId, nowIso, toPendingInsert, toPendingUpdate, type ServiceActor } from './service-helpers';
import { assertMaxOneYearTahunAjaran } from './tahunAjaranDateService';
import type { SetupAwalDraft } from './setupAwalDraftService';
import { markSetupAwalCompleted } from './onboardingService';
import { normalizeComparisonKey, normalizeWhitespace, parseTahunAjaranName, tahunAjaranKey } from './nameNormalizationService';
import { getActivePengaturanRecord } from './pengaturanRepository';

// ===================== Validation =====================

function validateSetupDraft(draft: SetupAwalDraft) {
  // --- Profile ---
  if (!draft.profile.nama_sekolah.trim()) throw new ValidationError('Nama sekolah wajib diisi.');
  if (!draft.profile.bentuk_satuan.trim()) throw new ValidationError('Bentuk satuan wajib diisi.');
  if (!draft.profile.nama_kepsek.trim()) throw new ValidationError('Nama kepala sekolah wajib diisi.');
  if (!draft.profile.alamat_jalan.trim()) throw new ValidationError('Alamat jalan wajib diisi.');
  if (!draft.profile.alamat_desa.trim()) throw new ValidationError('Desa/Kelurahan wajib diisi.');
  if (!draft.profile.alamat_kecamatan.trim()) throw new ValidationError('Kecamatan wajib diisi.');
  if (!draft.profile.alamat_kabupaten.trim()) throw new ValidationError('Kabupaten wajib diisi.');
  if (!draft.profile.alamat_provinsi.trim()) throw new ValidationError('Provinsi wajib diisi.');

  // --- Year ---
  if (!draft.year.nama.trim()) throw new ValidationError('Nama tahun ajaran wajib diisi.');
  const parsedYearName = parseTahunAjaranName(draft.year.nama);
  if (!parsedYearName) throw new ValidationError('Nama tahun ajaran harus berformat YYYY/YYYY dan tahun kedua harus satu tahun setelah tahun pertama.');
  assertMaxOneYearTahunAjaran(draft.year.mulai, draft.year.selesai);

  // --- Tingkat & Kelas ---
  const validTingkat = draft.tingkatRows.filter((t) => t.nama.trim());
  if (validTingkat.length === 0) throw new ValidationError('Minimal satu tingkat wajib dibuat.');

  const tingkatNames = new Set<string>();
  for (const [index, tingkat] of validTingkat.entries()) {
    if (!tingkat.nama.trim()) throw new ValidationError(`Nama tingkat baris ${index + 1} wajib diisi.`);
    const nameKey = normalizeComparisonKey(tingkat.nama);
    if (tingkatNames.has(nameKey)) throw new ValidationError(`Tingkat duplikat: ${tingkat.nama}.`);
    tingkatNames.add(nameKey);

    if (!tingkat.tarif_spp || Number(tingkat.tarif_spp) < 0) throw new ValidationError(`Tarif SPP tingkat "${tingkat.nama}" wajib diisi minimal 0.`);
    if (tingkat.usia_min_tahun && Number(tingkat.usia_min_tahun) < 0) throw new ValidationError(`Usia minimal tingkat "${tingkat.nama}" tidak boleh negatif.`);
    if (tingkat.usia_max_tahun && Number(tingkat.usia_max_tahun) < 0) throw new ValidationError(`Usia maksimal tingkat "${tingkat.nama}" tidak boleh negatif.`);
    if (tingkat.usia_min_tahun && tingkat.usia_max_tahun && Number(tingkat.usia_max_tahun) < Number(tingkat.usia_min_tahun)) {
      throw new ValidationError(`Usia maksimal tingkat "${tingkat.nama}" tidak boleh lebih kecil dari usia minimal.`);
    }

    const validKelas = tingkat.kelas.filter((k) => k.nama_kelas.trim());
    if (validKelas.length === 0) throw new ValidationError(`Tingkat "${tingkat.nama}" harus memiliki minimal satu kelas.`);

    const classNames = new Set<string>();
    for (const [kelasIndex, kelas] of validKelas.entries()) {
      if (!kelas.nama_kelas.trim()) throw new ValidationError(`Nama kelas baris ${kelasIndex + 1} pada tingkat "${tingkat.nama}" wajib diisi.`);
      const key = normalizeComparisonKey(kelas.nama_kelas);
      if (classNames.has(key)) throw new ValidationError(`Kelas duplikat pada tingkat "${tingkat.nama}": ${kelas.nama_kelas}.`);
      classNames.add(key);
      if (kelas.kapasitas_siswa && (!Number.isInteger(Number(kelas.kapasitas_siswa)) || Number(kelas.kapasitas_siswa) < 1)) {
        throw new ValidationError(`Kapasitas kelas "${kelas.nama_kelas}" tingkat "${tingkat.nama}" harus minimal 1.`);
      }
    }
  }

  // --- Cutoff ---
  if (Number(draft.cutoff.bulan) < 1 || Number(draft.cutoff.bulan) > 12 || Number(draft.cutoff.tanggal) < 1 || Number(draft.cutoff.tanggal) > 31) {
    throw new ValidationError('Cutoff umur tidak valid.');
  }

  // --- Komponen Biaya & Jatuh Tempo ---
  if (!draft.pendaftaranDiLuarSistem) {
    for (const [index, item] of draft.komponenBiaya.entries()) {
      if (!item.nama.trim()) throw new ValidationError(`Nama komponen biaya baris ${index + 1} wajib diisi.`);
      if (Number(item.nominal) < 0) throw new ValidationError(`Nominal komponen biaya "${item.nama}" tidak boleh negatif.`);
    }

    if (draft.jatuhTempoPendaftaran.mode === 'tanggal_tetap' && !draft.jatuhTempoPendaftaran.tanggal) {
      throw new ValidationError('Tanggal jatuh tempo pendaftaran wajib diisi.');
    }
  }

  // --- Diskon (optional) ---
  for (const [index, d] of draft.diskon.entries()) {
    if (!d.nama.trim()) throw new ValidationError(`Nama diskon baris ${index + 1} wajib diisi.`);
    const targets = d.target_jenis_tagihan?.length ? d.target_jenis_tagihan : [d.jenis_tagihan || 'semua'];
    for (const target of targets) {
      const pt = d.potongan_per_target?.[target] || { tipe_diskon: d.tipe_diskon, persen_diskon: d.persen_diskon, nominal_diskon: d.nominal_diskon };
      if (pt.tipe_diskon === 'persen' && (Number(pt.persen_diskon) < 0 || Number(pt.persen_diskon) > 100)) {
        throw new ValidationError(`Persen diskon "${d.nama}" untuk target "${target}" harus antara 0-100.`);
      }
      if (pt.tipe_diskon === 'nominal' && Number(pt.nominal_diskon) < 0) {
        throw new ValidationError(`Nominal diskon "${d.nama}" untuk target "${target}" tidak boleh negatif.`);
      }
    }
    if (d.aktif && d.mulai && d.selesai && d.selesai < d.mulai) {
      throw new ValidationError(`Tanggal selesai diskon "${d.nama}" harus setelah tanggal mulai.`);
    }
  }

  // --- Format NIS ---
  if (draft.formatNIS.autoGenerate) {
    const hasUrut = draft.formatNIS.komponen.some((k) => k.tipe === 'urut');
    if (!hasUrut) throw new ValidationError('Format NIS otomatis harus memiliki minimal satu komponen nomor urut.');
  }

  // --- Metode Pembayaran ---
  const activeMethods = draft.metodePembayaran.filter((item) => item.aktif && item.nama.trim());
  if (activeMethods.length === 0) throw new ValidationError('Minimal satu metode pembayaran aktif wajib diisi.');
  const methodKeys = new Set<string>();
  for (const item of draft.metodePembayaran) {
    if (!item.nama.trim()) throw new ValidationError('Nama metode pembayaran wajib diisi.');
    const key = normalizeComparisonKey(item.nama);
    if (methodKeys.has(key)) throw new ValidationError(`Metode pembayaran duplikat: ${item.nama}.`);
    methodKeys.add(key);
  }

  // --- Jenis Tagihan ---
  const activeBillTypes = draft.jenisTagihan.filter((item) => item.aktif && item.nama.trim());
  if (activeBillTypes.length === 0) throw new ValidationError('Minimal satu jenis tagihan aktif wajib diisi.');
  const billTypeKeys = new Set<string>();
  for (const item of draft.jenisTagihan) {
    if (!item.nama.trim()) throw new ValidationError('Nama jenis tagihan wajib diisi.');
    const key = normalizeComparisonKey(item.nama);
    if (billTypeKeys.has(key)) throw new ValidationError(`Jenis tagihan duplikat: ${item.nama}.`);
    billTypeKeys.add(key);
  }

  // --- Keamanan ---
  if (!draft.keamananPin || draft.keamananPin.length < 4) {
    throw new ValidationError('PIN Kasir wajib diisi minimal 4 angka.');
  }
  if (!/^\d+$/.test(draft.keamananPin)) {
    throw new ValidationError('PIN Kasir hanya boleh berisi angka.');
  }
  if (!draft.keamananSandi || draft.keamananSandi.length < 6) {
    throw new ValidationError('Sandi Darurat wajib diisi minimal 6 karakter.');
  }
}

export async function completeSetupAwal(actor: ServiceActor, draft: SetupAwalDraft) {
  await ensureLoginBootstrap();
  await assertCanAccess(actor.role, 'pengaturan', 'edit');
  await assertCanAccess(actor.role, 'tahun_ajaran', 'tambah');
  await assertCanAccess(actor.role, 'kelas', 'tambah');
  validateSetupDraft(draft);

  const profile = await db.profil_sekolah.get('00000000-0000-0000-0000-000000000001');
  const existingActiveYear = (await db.tahun_ajaran.toArray()).find((item) => !item.deleted_at && (item.aktif || item.status === 'aktif'));
  if (existingActiveYear) throw new ValidationError('Setup awal tidak bisa disimpan karena sudah ada tahun ajaran aktif.');
  const existingYear = (await db.tahun_ajaran.toArray()).find((item) => !item.deleted_at && tahunAjaranKey(item.nama) === tahunAjaranKey(draft.year.nama));
  if (existingYear) throw new ValidationError(`Nama tahun ajaran sudah ada: ${existingYear.nama}.`);
  const overlappingYear = (await db.tahun_ajaran.toArray()).find((item) => !item.deleted_at && draft.year.mulai <= item.selesai && draft.year.selesai >= item.mulai);
  if (overlappingYear) throw new ValidationError(`Periode tahun ajaran tumpang tindih dengan ${overlappingYear.nama}.`);

  const now = nowIso();
  const metodeRecord = await getActivePengaturanRecord('metode_pembayaran');
  const jenisTagihanRecord = await getActivePengaturanRecord('jenis_tagihan');
  const formatNISRecord = await getActivePengaturanRecord('format_nis');
  const diskonRecord = await getActivePengaturanRecord('diskon');
  const yearId = newId();

  // --- Build Profile ---
  const profilePayload = {
    nama_sekolah: (draft.profile.nama_sekolah || '').trim(),
    nama_yayasan: (draft.profile.nama_yayasan || '').trim() || null,
    bentuk_satuan: (draft.profile.bentuk_satuan || '').trim() || null,
    izin_operasional: (draft.profile.izin_operasional || '').trim() || null,
    npsn: (draft.profile.npsn || '').trim() || null,
    telepon: (draft.profile.telepon || '').trim() || null,
    website: (draft.profile.website || '').trim() || null,
    tahun_berdiri: (draft.profile.tahun_berdiri || '').trim() || null,
    alamat_jalan: (draft.profile.alamat_jalan || '').trim() || null,
    alamat_rt: (draft.profile.alamat_rt || '').trim() || null,
    alamat_rw: (draft.profile.alamat_rw || '').trim() || null,
    alamat_desa: (draft.profile.alamat_desa || '').trim() || null,
    alamat_kecamatan: (draft.profile.alamat_kecamatan || '').trim() || null,
    alamat_kabupaten: (draft.profile.alamat_kabupaten || '').trim() || null,
    alamat_provinsi: (draft.profile.alamat_provinsi || '').trim() || null,
    alamat_kode_pos: (draft.profile.alamat_kode_pos || '').trim() || null,
    nama_kepsek: (draft.profile.nama_kepsek || '').trim() || null,
    logo_url: null,
    tanda_tangan_url: null,
    updated_at: now,
  };
  const updatedProfile = profile
    ? toPendingUpdate<ProfilSekolah>(profile, profilePayload)
    : toPendingInsert<ProfilSekolah>({ id: '00000000-0000-0000-0000-000000000001', ...profilePayload, created_at: now, deleted_at: null });

  // --- Build Year ---
  const isModeSekarang = draft.mode !== 'mendatang';
  const year = toPendingInsert<TahunAjaran>({
    id: yearId, nama: parseTahunAjaranName(draft.year.nama)!.normalized,
    mulai: draft.year.mulai, selesai: draft.year.selesai,
    aktif: isModeSekarang, status: isModeSekarang ? 'aktif' : 'draft',
    created_at: now, updated_at: now, deleted_at: null,
  });

  // --- Build Tingkat & Kelas ---
  const validTingkat = draft.tingkatRows.filter((t) => t.nama.trim());
  const tingkatRecords: Tingkat[] = [];
  const kelasRecords: Kelas[] = [];

  for (const [index, tingkatDraft] of validTingkat.entries()) {
    const tingkatId = newId();
    tingkatRecords.push(toPendingInsert<Tingkat>({
      id: tingkatId,
      tahun_ajaran_id: yearId,
      nama: normalizeWhitespace(tingkatDraft.nama),
      kode: tingkatDraft.kode.trim() || null,
      urutan: index + 1,
      tarif_spp: Number(tingkatDraft.tarif_spp),
      usia_min_tahun: tingkatDraft.usia_min_tahun ? Number(tingkatDraft.usia_min_tahun) : null,
      usia_max_tahun: tingkatDraft.usia_max_tahun ? Number(tingkatDraft.usia_max_tahun) : null,
      created_at: now, updated_at: now, deleted_at: null,
    }));

    const validKelas = tingkatDraft.kelas.filter((k) => k.nama_kelas.trim());
    for (const kelasDraft of validKelas) {
      kelasRecords.push(toPendingInsert<Kelas>({
        id: newId(),
        tahun_ajaran_id: yearId,
        tingkat_id: tingkatId,
        nama_kelas: normalizeWhitespace(kelasDraft.nama_kelas),
        tingkat: normalizeWhitespace(tingkatDraft.nama),
        tarif_spp: Number(tingkatDraft.tarif_spp),
        kapasitas_siswa: kelasDraft.kapasitas_siswa ? Number(kelasDraft.kapasitas_siswa) : null,
        usia_min_tahun: tingkatDraft.usia_min_tahun ? Number(tingkatDraft.usia_min_tahun) : null,
        usia_max_tahun: tingkatDraft.usia_max_tahun ? Number(tingkatDraft.usia_max_tahun) : null,
        created_at: now, updated_at: now, deleted_at: null,
      }));
    }
  }

  // --- Build Registration Settings ---
  const komponenBiaya = draft.pendaftaranDiLuarSistem ? [] : draft.komponenBiaya
    .filter((k) => k.nama.trim())
    .map((k) => ({ id: k.id || newId(), nama: normalizeWhitespace(k.nama), nominal: Number(k.nominal || 0), wajib: k.wajib }));
  const totalBiaya = komponenBiaya.reduce((sum, k) => sum + k.nominal, 0);

  const registration = toPendingInsert<PengaturanPendaftaranTahunAjaran>({
    id: newId(),
    tahun_ajaran_id: yearId,
    pendaftaran_luar_sistem: draft.pendaftaranDiLuarSistem,
    biaya_pendaftaran_default: totalBiaya,
    komponen_biaya: komponenBiaya,
    mode_tagihan_biaya: draft.modeTagihanBiaya,
    opsi_bayar_default: 'full',
    jatuh_tempo_mode: draft.pendaftaranDiLuarSistem ? 'tanggal_tetap' : draft.jatuhTempoPendaftaran.mode,
    jatuh_tempo_tanggal: draft.pendaftaranDiLuarSistem ? null : (draft.jatuhTempoPendaftaran.mode === 'tanggal_tetap' ? draft.jatuhTempoPendaftaran.tanggal : null),
    jatuh_tempo_hari_setelah_daftar: draft.pendaftaranDiLuarSistem ? null : (draft.jatuhTempoPendaftaran.mode === 'hari_setelah_daftar' ? Number(draft.jatuhTempoPendaftaran.hari || 14) : null),
    cutoff_bulan: Number(draft.cutoff.bulan),
    cutoff_tanggal: Number(draft.cutoff.tanggal),
    created_at: now, updated_at: now, deleted_at: null,
  });

  // --- Build Metode Pembayaran ---
  const methodValue = draft.metodePembayaran
    .map((item) => ({ id: item.id || newId(), nama: normalizeWhitespace(item.nama), aktif: item.aktif }))
    .filter((item) => item.nama && item.nama.toLowerCase() !== 'split');
  const updatedMethods = metodeRecord && !metodeRecord.deleted_at
    ? toPendingUpdate<Pengaturan>(metodeRecord, { nilai: methodValue, updated_at: now })
    : toPendingInsert<Pengaturan>({ id: newId(), kunci: 'metode_pembayaran', nilai: methodValue, keterangan: 'Daftar metode pembayaran yang tersedia', created_at: now, updated_at: now, deleted_at: null });

  // --- Build Jenis Tagihan ---
  const billTypeValue = draft.jenisTagihan
    .map((item) => ({ id: item.id || newId(), nama: normalizeWhitespace(item.nama), aktif: item.aktif }))
    .filter((item) => item.nama);
  const updatedBillTypes = jenisTagihanRecord && !jenisTagihanRecord.deleted_at
    ? toPendingUpdate<Pengaturan>(jenisTagihanRecord, { nilai: billTypeValue, updated_at: now })
    : toPendingInsert<Pengaturan>({ id: newId(), kunci: 'jenis_tagihan', nilai: billTypeValue, keterangan: 'Daftar jenis tagihan yang tersedia', created_at: now, updated_at: now, deleted_at: null });

  // --- Build Format NIS ---
  const updatedFormatNIS = formatNISRecord && !formatNISRecord.deleted_at
    ? toPendingUpdate<Pengaturan>(formatNISRecord, { nilai: draft.formatNIS, updated_at: now })
    : toPendingInsert<Pengaturan>({ id: newId(), kunci: 'format_nis', nilai: draft.formatNIS, keterangan: 'Format NIS otomatis', created_at: now, updated_at: now, deleted_at: null });

  // --- Build Diskon ---
  const diskonValue = draft.diskon
    .filter((d) => d.nama.trim())
    .map((d) => ({
      id: d.id || newId(),
      nama: normalizeWhitespace(d.nama),
      aktif: d.aktif,
      potongan_per_target: d.potongan_per_target || undefined,
      tipe_diskon: d.tipe_diskon,
      persen_diskon: Number(d.persen_diskon || 0),
      nominal_diskon: Number(d.nominal_diskon || 0),
      mulai: d.mulai || null,
      selesai: d.selesai || null,
      target_jenis_tagihan: d.target_jenis_tagihan?.length ? d.target_jenis_tagihan : (d.jenis_tagihan === 'semua' ? ['semua'] : [d.jenis_tagihan || 'semua']),
      berulang: !!d.berulang,
      klaim_mulai: d.klaim_mulai || null,
      klaim_selesai: d.klaim_selesai || null,
      batas_kali_penggunaan: d.batas_kali_penggunaan ? Number(d.batas_kali_penggunaan) : null,
      kuota: d.kuota ? Number(d.kuota) : null,
    }));
  const updatedDiskon = diskonRecord && !diskonRecord.deleted_at
    ? toPendingUpdate<Pengaturan>(diskonRecord, { nilai: diskonValue, updated_at: now })
    : toPendingInsert<Pengaturan>({ id: newId(), kunci: 'diskon', nilai: diskonValue, keterangan: 'Daftar diskon/promo yang tersedia', created_at: now, updated_at: now, deleted_at: null });

  // --- Build SPP Generate Cutoff ---
  const sppCutoffRecord = await getActivePengaturanRecord('spp_generate_cutoff');
  const sppCutoffValue: SppGenerateCutoffSetting = {
    aktif: draft.sppCutoff.aktif,
    cutoff_tanggal: Number(draft.sppCutoff.tanggal) || 20,
    keterangan: 'SPP siswa pindahan mulai bulan depan jika tanggal daftar melewati cutoff',
  };
  const updatedSppCutoff = sppCutoffRecord && !sppCutoffRecord.deleted_at
    ? toPendingUpdate<Pengaturan>(sppCutoffRecord, { nilai: sppCutoffValue, updated_at: now })
    : toPendingInsert<Pengaturan>({ id: newId(), kunci: 'spp_generate_cutoff', nilai: sppCutoffValue, keterangan: 'Pengaturan cutoff tanggal untuk generate SPP siswa pindahan', created_at: now, updated_at: now, deleted_at: null });

  // ===================== Atomic Transaction =====================
  await db.transaction('rw', [db.profil_sekolah, db.tahun_ajaran, db.tingkat, db.kelas, db.pengaturan_pendaftaran_tahun_ajaran, db.pengaturan, db.sync_queue], async () => {
    await db.profil_sekolah.put(updatedProfile);
    await enqueueSync('profil_sekolah', updatedProfile.id, profile ? 'update' : 'insert', updatedProfile);

    await db.tahun_ajaran.add(year);
    await enqueueSync('tahun_ajaran', year.id, 'insert', year);

    for (const tingkat of tingkatRecords) {
      await db.tingkat.add(tingkat);
      await enqueueSync('tingkat', tingkat.id, 'insert', tingkat);
    }

    for (const kelas of kelasRecords) {
      await db.kelas.add(kelas);
      await enqueueSync('kelas', kelas.id, 'insert', kelas);
    }

    await db.pengaturan_pendaftaran_tahun_ajaran.add(registration);
    await enqueueSync('pengaturan_pendaftaran_tahun_ajaran', registration.id, 'insert', registration);

    await db.pengaturan.put(updatedMethods);
    await enqueueSync('pengaturan', updatedMethods.id, metodeRecord && !metodeRecord.deleted_at ? 'update' : 'insert', updatedMethods);

    await db.pengaturan.put(updatedBillTypes);
    await enqueueSync('pengaturan', updatedBillTypes.id, jenisTagihanRecord && !jenisTagihanRecord.deleted_at ? 'update' : 'insert', updatedBillTypes);

    await db.pengaturan.put(updatedFormatNIS);
    await enqueueSync('pengaturan', updatedFormatNIS.id, formatNISRecord && !formatNISRecord.deleted_at ? 'update' : 'insert', updatedFormatNIS);

    await db.pengaturan.put(updatedDiskon);
    await enqueueSync('pengaturan', updatedDiskon.id, diskonRecord && !diskonRecord.deleted_at ? 'update' : 'insert', updatedDiskon);

    await db.pengaturan.put(updatedSppCutoff);
    await enqueueSync('pengaturan', updatedSppCutoff.id, sppCutoffRecord && !sppCutoffRecord.deleted_at ? 'update' : 'insert', updatedSppCutoff);

    await markSetupAwalCompleted();
  });

  const { setPinKasir, setSandiDarurat } = await import('./authService');
  await setPinKasir(draft.keamananPin);
  await setSandiDarurat(draft.keamananSandi);

  return { year, tingkatRecords, kelasRecords, registration };
}

