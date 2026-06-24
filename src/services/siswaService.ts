import { db } from '../db';
import type { Siswa, SiswaKelas, Tagihan } from '../db/types';
import { assertCanAccess } from './permissionService';
import { NotFoundError, ValidationError } from './service-errors';
import { calculateAgeInYears, enqueueSync, getTahunAjaranCutoffDate, nowIso, toPendingInsert, toPendingUpdate, type ServiceActor } from './service-helpers';
import { getAutoPlacementPreview, getPenempatanSiswaBaruSetting } from './placementService';
import { getPengaturanPendaftaranByTahunAjaran } from './pendaftaranTahunAjaranService';
import { assertKelasHasCapacity } from './kelasCapacityService';
import { assertSiswaPeriodNotArchived, assertTahunAjaranNotArchived } from './tahunAjaranLockService';
import { ReferenceGeneratorService } from './referenceGeneratorService';
import { catatAuditLog } from './auditLogService';
import { generateDeterministicUUID } from '../lib/uuid';

type JenisMasuk = Siswa['jenis_masuk'];
type JalurRegistrasiNormal = Extract<Siswa['jalur_registrasi'], 'baru' | 'pindahan' | 'migrasi'>;
type SumberData = Siswa['sumber_data'];

interface BaseSiswaInput {
  nama: string;
  tanggal_lahir?: string | null;
  jenis_kelamin?: 'L' | 'P' | null;
  foto_url?: string | null;
  nama_wali: string;
  hubungan_wali?: 'ayah' | 'ibu' | 'wali' | null;
  kontak_wali: string;
  email_wali?: string | null;
  alamat?: string | null;
}

export interface KomponenTagihanInput {
  id: string; // ID komponen (atau ID statis untuk legacy)
  nama: string;
  jumlah: number;
  potongan_diskon: number;
  nama_promo?: string | null;
}

export interface RegisterSiswaInput extends BaseSiswaInput {
  nis?: string | null;
  status: 'calon' | 'aktif';
  jalur_registrasi: JalurRegistrasiNormal;
  tanggal_daftar: string;
  jatuh_tempo_pendaftaran: string;
  jenis_masuk: JenisMasuk;
  tahun_ajaran_target_id: string;
  kelas_tujuan_id?: string | null;
  kelas_rencana_id?: string | null;
  
  komponen_tagihan_awal: KomponenTagihanInput[];
  opsi_bayar_tagihan_awal: 'full' | 'cicil';

  daftar_promo?: string[] | null;
  flag_diskon_spp: boolean;
  tipe_diskon_spp?: 'persen' | 'nominal';
  persen_diskon: number;
  nominal_diskon_spp?: number;
}

export interface UpdateSiswaInput extends BaseSiswaInput {
  nis?: string | null;
  daftar_promo?: string[];
}

export interface ImportSiswaCalonRowInput extends BaseSiswaInput {
  kode_import_siswa: string;
  tahun_ajaran_target_id: string;
  tanggal_daftar: string;
  jatuh_tempo_pendaftaran: string;
  biaya_pendaftaran: number;
  opsi_pembayaran_awal: 'full' | 'cicil';
}

export interface ImportSiswaCalonInput {
  rows: ImportSiswaCalonRowInput[];
}

export interface MigrateSiswaInput extends BaseSiswaInput {
  status: Extract<Siswa['status'], 'aktif' | 'berhenti'>;
  jenis_masuk: JenisMasuk;
  tahun_ajaran_target_id: string;
  tanggal_daftar: string;
  kelas_tujuan_id?: string | null;
  alasan_keluar?: Siswa['alasan_keluar'];
  tanggal_keluar?: string | null;
  kode_import_siswa?: string | null;
  sumber_data?: SumberData;
}

export interface ImportSiswaMigrasiRowInput extends MigrateSiswaInput {
  sumber_data: 'import_excel';
}

export interface ImportSiswaMigrasiInput {
  rows: ImportSiswaMigrasiRowInput[];
}

async function getActiveTahunAjaranId() {
  const tahunAjaran = (await db.tahun_ajaran.toArray()).find((item) => !item.deleted_at && (item.aktif || item.status === 'aktif'));
  return tahunAjaran?.id ?? null;
}

function validateBillingInput(biaya: number) {
  if (biaya < 0) {
    throw new ValidationError('Biaya tagihan awal tidak boleh negatif.');
  }
}

function validatePendaftaranDueDate(tanggalDaftar: string, jatuhTempo: string) {
  if (!jatuhTempo) {
    throw new ValidationError('Jatuh tempo tagihan pendaftaran wajib diisi.');
  }
  if (jatuhTempo < tanggalDaftar) {
    throw new ValidationError('Jatuh tempo tagihan pendaftaran tidak boleh sebelum tanggal daftar.');
  }
}

function normalizeBaseSiswaInput<T extends BaseSiswaInput>(input: T): T {
  return {
    ...input,
    nama: input.nama.trim(),
    nama_wali: input.nama_wali.trim(),
    kontak_wali: input.kontak_wali.trim(),
    email_wali: input.email_wali?.trim() || null,
    alamat: input.alamat?.trim() || null,
  };
}

function normalizeIdentityText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

function buildIdentityKey(input: BaseSiswaInput) {
  return [
    normalizeIdentityText(input.nama),
    input.tanggal_lahir ?? '',
    normalizeIdentityText(input.nama_wali),
    normalizePhone(input.kontak_wali),
  ].join('|');
}

function isSameStrongIdentity(a: BaseSiswaInput, b: BaseSiswaInput) {
  const sameName = normalizeIdentityText(a.nama) === normalizeIdentityText(b.nama);
  const sameWali = normalizeIdentityText(a.nama_wali) === normalizeIdentityText(b.nama_wali);
  const samePhone = normalizePhone(a.kontak_wali) === normalizePhone(b.kontak_wali);
  const sameBirthDate = (a.tanggal_lahir ?? '') && (a.tanggal_lahir ?? '') === (b.tanggal_lahir ?? '');
  return sameName && sameWali && samePhone && (sameBirthDate || !a.tanggal_lahir || !b.tanggal_lahir);
}

async function assertNoDuplicateSiswa(input: BaseSiswaInput & { kode_import_siswa?: string | null }, currentId?: string) {
  const existingStudents = (await db.siswa.toArray()).filter((item) => !item.deleted_at && item.id !== currentId);
  const code = input.kode_import_siswa?.trim();
  if (code) {
    const duplicateCode = existingStudents.find((item) => item.kode_import_siswa?.trim().toLowerCase() === code.toLowerCase());
    if (duplicateCode) {
      throw new ValidationError(`Kode import siswa sudah ada pada data ${duplicateCode.nama}: ${code}`);
    }
  }

  const duplicateIdentity = existingStudents.find((item) => isSameStrongIdentity(input, item));
  if (duplicateIdentity) {
    throw new ValidationError(`Data siswa terindikasi duplikat dengan ${duplicateIdentity.nama}. Periksa nama, tanggal lahir, wali, dan nomor HP.`);
  }
}

function assertNoDuplicateRows<T extends BaseSiswaInput & { kode_import_siswa?: string | null }>(rows: T[], label: string) {
  const codes = new Map<string, number>();
  const identities = new Map<string, number>();
  rows.forEach((row, index) => {
    const code = row.kode_import_siswa?.trim().toLowerCase();
    if (code) {
      const duplicateIndex = codes.get(code);
      if (duplicateIndex !== undefined) {
        throw new ValidationError(`${label} duplikat kode import pada baris ${duplicateIndex + 1} dan ${index + 1}: ${row.kode_import_siswa}`);
      }
      codes.set(code, index);
    }

    const identityKey = buildIdentityKey(row);
    const duplicateIdentityIndex = identities.get(identityKey);
    if (duplicateIdentityIndex !== undefined) {
      throw new ValidationError(`${label} duplikat identitas siswa pada baris ${duplicateIdentityIndex + 1} dan ${index + 1}: ${row.nama}`);
    }
    identities.set(identityKey, index);
  });
}


async function ensureTargetYear(id: string) {
  const tahunAjaran = await db.tahun_ajaran.get(id);
  if (!tahunAjaran || tahunAjaran.deleted_at) {
    throw new ValidationError('Tahun ajaran target tidak ditemukan.');
  }
  return tahunAjaran;
}

async function assertCalonAge(tanggalLahir: string | null | undefined, tahunAjaranId: string) {
  if (!tanggalLahir) {
    throw new ValidationError('Tanggal lahir wajib diisi untuk menghitung umur siswa calon.');
  }
  const tahunAjaran = await ensureTargetYear(tahunAjaranId);
  const yearlySetting = await getPengaturanPendaftaranByTahunAjaran(tahunAjaranId);
  const setting = yearlySetting ?? await getPenempatanSiswaBaruSetting();
  const cutoffDate = getTahunAjaranCutoffDate(tahunAjaran, setting.cutoff_bulan, setting.cutoff_tanggal);
  const age = calculateAgeInYears(tanggalLahir, cutoffDate);
  if (age < 2) {
    throw new ValidationError('Usia siswa minimal 2 tahun pada cutoff tahun ajaran target.');
  }
  if (age >= 7) {
    throw new ValidationError('Usia siswa harus di bawah 7 tahun pada cutoff tahun ajaran target.');
  }
}

async function buildPendaftaranTagihan(
  actor: ServiceActor,
  siswaId: string,
  tahunAjaranId: string,
  jatuhTempo: string,
  komponen: KomponenTagihanInput,
  opsi: 'full' | 'cicil',
) {
  return toPendingInsert<Tagihan>({
    id: generateDeterministicUUID(`tagihan|${siswaId}|pendaftaran|${tahunAjaranId}`),
    no_referensi: await ReferenceGeneratorService.generateNoTagihan(tahunAjaranId),
    siswa_id: siswaId,
    tahun_ajaran_id: tahunAjaranId,
    jenis: 'pendaftaran',
    nama_tagihan: komponen.nama || 'Tagihan Pendaftaran',
    jumlah_total: Math.max(0, komponen.jumlah - (komponen.potongan_diskon || 0)),
    sudah_dibayar: 0,
    jatuh_tempo: jatuhTempo,
    status: 'belum_bayar',
    bisa_cicil: opsi === 'cicil',
    bulan_tahun: null,
    potongan_diskon: komponen.potongan_diskon || 0,
    nama_promo: komponen.nama_promo || null,
    promo_ids: komponen.nama_promo ? [] : null,
    created_by: actor.userId,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  });
}

function buildSiswaKelas(
  siswaId: string,
  kelasId: string,
  mulai: string,
  penempatan_sumber: SiswaKelas['penempatan_sumber'],
  selesai?: string | null,
  catatan_penempatan?: string | null,
  status_akhir_periode?: SiswaKelas['status_akhir_periode'],
) {
  const now = nowIso();
  return toPendingInsert<SiswaKelas>({
    id: generateDeterministicUUID(`siswakelas|${siswaId}|${kelasId}|${mulai}`),
    siswa_id: siswaId,
    kelas_id: kelasId,
    mulai,
    selesai: selesai ?? null,
    penempatan_sumber,
    catatan_penempatan: catatan_penempatan ?? null,
    status_akhir_periode: selesai ? status_akhir_periode ?? 'tidak_lanjut' : null,
    created_at: now,
    updated_at: now,
  });
}

function validateRegisterInput(input: RegisterSiswaInput) {
  if (!input.tahun_ajaran_target_id) {
    throw new ValidationError('Tahun ajaran target wajib diisi.');
  }
  if (input.jalur_registrasi !== 'migrasi') {
    input.komponen_tagihan_awal.forEach((k) => validateBillingInput(k.jumlah));
    validatePendaftaranDueDate(input.tanggal_daftar, input.jatuh_tempo_pendaftaran);
  }

  if (input.jalur_registrasi === 'baru' && input.jenis_masuk !== 'awal_tahun') {
    throw new ValidationError('Siswa baru harus memiliki jenis masuk awal tahun.');
  }

  if (input.jalur_registrasi === 'pindahan') {
    if (input.jenis_masuk !== 'pindahan') {
      throw new ValidationError('Siswa pindahan harus memiliki jenis masuk pindahan.');
    }
    if (!input.kelas_tujuan_id) {
      throw new ValidationError('Kelas tujuan wajib diisi untuk siswa pindahan.');
    }
  }
}

async function ensureKelasInTahunAjaran(kelasId: string | null | undefined, tahunAjaranId: string, label: string) {
  if (!kelasId) {
    return;
  }
  const kelas = await db.kelas.get(kelasId);
  if (!kelas || kelas.deleted_at) {
    throw new ValidationError(`${label} tidak ditemukan.`);
  }
  if (kelas.tahun_ajaran_id !== tahunAjaranId) {
    throw new ValidationError(`${label} harus berada pada tahun ajaran target.`);
  }
}

function validateMigrateInput(input: MigrateSiswaInput) {
  if (!input.tahun_ajaran_target_id) {
    throw new ValidationError('Tahun ajaran target wajib diisi.');
  }
  if (input.status === 'aktif' && !input.kelas_tujuan_id) {
    throw new ValidationError('Kelas wajib diisi untuk siswa migrasi aktif.');
  }
  if (input.status === 'berhenti' && !input.alasan_keluar) {
    throw new ValidationError('Alasan keluar wajib diisi untuk siswa berhenti.');
  }
  if (input.status === 'berhenti' && !input.kelas_tujuan_id) {
    throw new ValidationError('Kelas terakhir wajib diisi untuk siswa migrasi keluar.');
  }
  if (input.status === 'berhenti' && !input.tanggal_keluar) {
    throw new ValidationError('Tanggal keluar wajib diisi untuk siswa migrasi keluar.');
  }
}

export async function registerSiswa(actor: ServiceActor, rawInput: RegisterSiswaInput) {
  await assertCanAccess(actor.role, 'siswa', 'tambah');
  const input = normalizeBaseSiswaInput(rawInput);
  validateRegisterInput(input);

  const targetYear = await ensureTargetYear(input.tahun_ajaran_target_id);
  const targetYearStatus = targetYear.status ?? (targetYear.aktif ? 'aktif' : 'draft');
  const activeYearId = await getActiveTahunAjaranId();
  if (input.jalur_registrasi === 'baru' && targetYearStatus !== 'draft') {
    throw new ValidationError('Siswa baru/calon hanya boleh didaftarkan ke tahun ajaran draft.');
  }
  if (input.jalur_registrasi === 'baru') {
    await assertCalonAge(input.tanggal_lahir, input.tahun_ajaran_target_id);
  }
  await assertTahunAjaranNotArchived(input.tahun_ajaran_target_id, 'Registrasi siswa');
  await ensureKelasInTahunAjaran(input.kelas_rencana_id, input.tahun_ajaran_target_id, 'Kelas rencana');
  if (input.jalur_registrasi === 'pindahan' && activeYearId && input.tahun_ajaran_target_id !== activeYearId) {
    throw new ValidationError('Siswa pindahan harus masuk ke tahun ajaran aktif.');
  }
  if (input.jalur_registrasi === 'migrasi') {
    if (!input.kelas_tujuan_id) throw new ValidationError('Kelas tujuan wajib diisi untuk siswa awal masuk.');
    if (activeYearId && input.tahun_ajaran_target_id !== activeYearId) throw new ValidationError('Siswa awal masuk harus masuk ke tahun ajaran aktif.');
  }

  await assertNoDuplicateSiswa(input);
  if (input.kelas_tujuan_id) {
    await assertKelasHasCapacity(input.kelas_tujuan_id);
  }
  const siswaId = generateDeterministicUUID(`siswa|${input.nama.toLowerCase()}|${input.nama_wali.toLowerCase()}|${input.tanggal_lahir || ''}`);
  const now = nowIso();

  const siswa = toPendingInsert<Siswa>({
    id: siswaId,
    nama: input.nama,
    tanggal_lahir: input.tanggal_lahir ?? null,
    jenis_kelamin: input.jenis_kelamin ?? null,
    foto_url: input.foto_url ?? null,
    nama_wali: input.nama_wali,
    hubungan_wali: input.hubungan_wali ?? null,
    kontak_wali: input.kontak_wali,
    email_wali: input.email_wali ?? null,
    alamat: input.alamat ?? null,
    status: input.status,
    flag_diskon_spp: input.flag_diskon_spp,
    tipe_diskon_spp: input.tipe_diskon_spp,
    persen_diskon: input.persen_diskon || 0,
    nominal_diskon_spp: input.nominal_diskon_spp || 0,
    daftar_promo: input.daftar_promo ?? [],
    tanggal_daftar: input.tanggal_daftar,
    jenis_masuk: input.jenis_masuk,
    tahun_ajaran_target_id: input.tahun_ajaran_target_id,
    kelas_rencana_id: input.jalur_registrasi === 'baru' ? input.kelas_rencana_id ?? null : null,
    jalur_registrasi: input.jalur_registrasi,
    sumber_data: 'manual',
    alasan_keluar: null,
    tanggal_keluar: null,
    kode_import_siswa: null,
    no_pendaftaran: await ReferenceGeneratorService.generateNoPendaftaran(input.tahun_ajaran_target_id),
    nis: input.nis?.trim() || (input.jalur_registrasi !== 'baru' ? await ReferenceGeneratorService.generateNIS(input.tahun_ajaran_target_id) : null),
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  const tagihanList: Tagihan[] = [];
  if (input.jalur_registrasi !== 'migrasi') {
    for (const kom of input.komponen_tagihan_awal) {
      if (kom.jumlah > 0) {
        tagihanList.push(await buildPendaftaranTagihan(actor, siswaId, input.tahun_ajaran_target_id, input.jatuh_tempo_pendaftaran, kom, input.opsi_bayar_tagihan_awal));
      }
    }
  }

  const siswaKelas = input.kelas_tujuan_id ? buildSiswaKelas(siswaId, input.kelas_tujuan_id, input.tanggal_daftar, 'manual') : null;

  await db.transaction('rw', db.siswa, db.tagihan, db.siswa_kelas, db.sync_queue, async () => {
    await db.siswa.add(siswa);
    await enqueueSync('siswa', siswa.id, 'insert', siswa);

    for (const tagihan of tagihanList) {
      await db.tagihan.add(tagihan);
      await enqueueSync('tagihan', tagihan.id, 'insert', tagihan);
    }

    if (siswaKelas) {
      await db.siswa_kelas.add(siswaKelas);
      await enqueueSync('siswa_kelas', siswaKelas.id, 'insert', siswaKelas);
    }
  });

  await catatAuditLog(actor, 'siswa', siswa.id, 'create',
    `Registrasi ${input.jalur_registrasi} ${siswa.nama}`,
    { nama_siswa: siswa.nama, jalur_registrasi: input.jalur_registrasi, jenis_masuk: input.jenis_masuk,
      status: siswa.status, tahun_ajaran_target_id: siswa.tahun_ajaran_target_id,
      no_pendaftaran: siswa.no_pendaftaran, nis: siswa.nis, tagihan_awal: tagihanList.length });

  return { siswa, tagihanList, siswaKelas };
}

export async function importSiswaCalon(actor: ServiceActor, input: ImportSiswaCalonInput) {
  await assertCanAccess(actor.role, 'siswa', 'tambah');
  if (input.rows.length === 0) {
    throw new ValidationError('Tidak ada baris siswa calon yang siap diimpor.');
  }

  assertNoDuplicateRows(input.rows, 'Import calon');

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    try {
      validateBillingInput(row.biaya_pendaftaran);
      validatePendaftaranDueDate(row.tanggal_daftar, row.jatuh_tempo_pendaftaran);
      const targetYear = await ensureTargetYear(row.tahun_ajaran_target_id);
      const targetYearStatus = targetYear.status ?? (targetYear.aktif ? 'aktif' : 'draft');
      if (targetYearStatus !== 'draft') {
        throw new ValidationError('Siswa calon hanya boleh ditargetkan ke tahun ajaran draft.');
      }
      await assertCalonAge(row.tanggal_lahir, row.tahun_ajaran_target_id);
      await assertNoDuplicateSiswa(row);
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : 'Validasi tahun ajaran atau tagihan gagal.';
      throw new ValidationError(`Baris calon ke-${index + 1} (${row.kode_import_siswa || row.nama || 'tanpa kode'}): ${baseMessage}`);
    }
  }

  const createdStudents: Siswa[] = [];
  const createdBills: Tagihan[] = [];

  await db.transaction('rw', [db.siswa, db.tagihan, db.pengaturan, db.pengaturan_pendaftaran_tahun_ajaran, db.sync_queue], async () => {
    for (let index = 0; index < input.rows.length; index += 1) {
      const rawRow = input.rows[index];
      try {
        const row = normalizeBaseSiswaInput(rawRow);
        if (!row.kode_import_siswa.trim()) {
          throw new ValidationError('Kode import siswa wajib diisi untuk semua baris import calon.');
        }

        const now = nowIso();
        const siswaId = generateDeterministicUUID(`siswa|${row.nama.toLowerCase()}|${row.nama_wali.toLowerCase()}|${row.tanggal_lahir || ''}`);
        const siswa = toPendingInsert<Siswa>({
          id: siswaId,
          nama: row.nama,
          tanggal_lahir: row.tanggal_lahir ?? null,
          jenis_kelamin: row.jenis_kelamin ?? null,
          foto_url: row.foto_url ?? null,
          nama_wali: row.nama_wali,
          hubungan_wali: row.hubungan_wali ?? null,
          kontak_wali: row.kontak_wali,
          email_wali: row.email_wali ?? null,
          alamat: row.alamat ?? null,
          status: 'calon',
          flag_diskon_spp: false,
          tipe_diskon_spp: undefined,
          persen_diskon: 0,
          nominal_diskon_spp: 0,
          tanggal_daftar: row.tanggal_daftar,
          jenis_masuk: 'awal_tahun',
          tahun_ajaran_target_id: row.tahun_ajaran_target_id,
          kelas_rencana_id: null,
          jalur_registrasi: 'baru',
          sumber_data: 'import_excel',
          alasan_keluar: null,
          tanggal_keluar: null,
          kode_import_siswa: row.kode_import_siswa.trim(),
          created_at: now,
          updated_at: now,
          deleted_at: null,
        });

        const tagihan = await buildPendaftaranTagihan(
          actor, 
          siswa.id, 
          row.tahun_ajaran_target_id, 
          row.jatuh_tempo_pendaftaran, 
          {
            id: 'import_calon',
            nama: 'Tagihan Pendaftaran',
            jumlah: row.biaya_pendaftaran,
            potongan_diskon: 0,
          }, 
          row.opsi_pembayaran_awal
        );
        await db.siswa.add(siswa);
        await enqueueSync('siswa', siswa.id, 'insert', siswa);
        await db.tagihan.add(tagihan);
        await enqueueSync('tagihan', tagihan.id, 'insert', tagihan);

        createdStudents.push(siswa);
        createdBills.push(tagihan);
      } catch (error) {
        const baseMessage = error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan baris import calon.';
        throw new ValidationError(`Baris calon ke-${index + 1} (${rawRow.kode_import_siswa || rawRow.nama || 'tanpa kode'}): ${baseMessage}`);
      }
    }
  });

  return { students: createdStudents, bills: createdBills };
}

export async function migrateSiswaManual(actor: ServiceActor, rawInput: MigrateSiswaInput) {
  await assertCanAccess(actor.role, 'siswa', 'tambah');
  const input = normalizeBaseSiswaInput(rawInput);
  validateMigrateInput(input);
  const targetYear = await ensureTargetYear(input.tahun_ajaran_target_id);
  const targetYearStatus = targetYear.status ?? (targetYear.aktif ? 'aktif' : 'draft');
  if (input.status === 'aktif' && targetYearStatus !== 'aktif') {
    throw new ValidationError('Migrasi siswa aktif hanya boleh masuk ke tahun ajaran yang sedang aktif.');
  }
  if (targetYearStatus !== 'aktif') {
    throw new ValidationError('Migrasi siswa hanya boleh masuk ke tahun ajaran aktif.');
  }

  const now = nowIso();
  await assertNoDuplicateSiswa(input);
  if (input.kelas_tujuan_id) {
    await ensureKelasInTahunAjaran(input.kelas_tujuan_id, input.tahun_ajaran_target_id, 'Kelas tujuan');
    if (input.status === 'aktif') {
      await assertKelasHasCapacity(input.kelas_tujuan_id);
    }
  }
  const siswaId = generateDeterministicUUID(`siswa|${input.nama.toLowerCase()}|${input.nama_wali.toLowerCase()}|${input.tanggal_lahir || ''}`);
  const siswa = toPendingInsert<Siswa>({
    id: siswaId,
    nama: input.nama,
    tanggal_lahir: input.tanggal_lahir ?? null,
    jenis_kelamin: input.jenis_kelamin ?? null,
    foto_url: input.foto_url ?? null,
    nama_wali: input.nama_wali,
    hubungan_wali: input.hubungan_wali ?? null,
    kontak_wali: input.kontak_wali,
    email_wali: input.email_wali ?? null,
    alamat: input.alamat ?? null,
    status: input.status,
    flag_diskon_spp: false,
    tipe_diskon_spp: 'persen',
    persen_diskon: 0,
    nominal_diskon_spp: 0,
    tanggal_daftar: input.tanggal_daftar,
    jenis_masuk: input.jenis_masuk,
    tahun_ajaran_target_id: input.tahun_ajaran_target_id,
    kelas_rencana_id: null,
    jalur_registrasi: 'migrasi',
    sumber_data: input.sumber_data ?? 'manual',
    alasan_keluar: input.alasan_keluar ?? null,
    tanggal_keluar: input.tanggal_keluar ?? null,
    kode_import_siswa: input.kode_import_siswa?.trim() || null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  const siswaKelas = input.kelas_tujuan_id
    ? buildSiswaKelas(
        siswa.id,
        input.kelas_tujuan_id,
        input.tanggal_daftar,
        input.sumber_data === 'import_excel' ? 'import_excel' : 'manual',
        input.status === 'aktif' ? null : input.tanggal_keluar ?? null,
        input.status === 'aktif' ? null : 'Riwayat kelas terakhir siswa migrasi keluar',
        input.status === 'aktif' ? null : 'keluar',
      )
    : null;

  await db.transaction('rw', db.siswa, db.siswa_kelas, db.sync_queue, async () => {
    await db.siswa.add(siswa);
    await enqueueSync('siswa', siswa.id, 'insert', siswa);

    if (siswaKelas) {
      await db.siswa_kelas.add(siswaKelas);
      await enqueueSync('siswa_kelas', siswaKelas.id, 'insert', siswaKelas);
    }
  });

  return { siswa, siswaKelas };
}

export async function importSiswaMigrasi(actor: ServiceActor, input: ImportSiswaMigrasiInput) {
  await assertCanAccess(actor.role, 'siswa', 'tambah');
  if (input.rows.length === 0) {
    throw new ValidationError('Tidak ada baris siswa migrasi yang siap diimpor.');
  }
  assertNoDuplicateRows(input.rows, 'Import migrasi');

  const created: Array<{ siswa: Siswa; siswaKelas: SiswaKelas | null }> = [];
  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    try {
      const result = await migrateSiswaManual(actor, { ...row, sumber_data: 'import_excel' });
      created.push(result);
    } catch (error) {
      const baseMessage = error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan baris migrasi.';
      throw new ValidationError(`Baris migrasi ke-${index + 1} (${row.kode_import_siswa || row.nama || 'tanpa kode'}): ${baseMessage}`);
    }
  }

  return created;
}

export async function getSiswaAutoPlacementPreview(tanggalLahir: string | null | undefined, tahunAjaranTargetId: string | null | undefined) {
  return getAutoPlacementPreview(tanggalLahir, tahunAjaranTargetId);
}

export async function generateKodeImportSiswa(prefix: string = 'IMP'): Promise<string> {
  const settings = await db.pengaturan.where('kunci').equals('kode_perangkat').first();
  const kodePerangkat = settings?.nilai?.kode || '00';
  const count = await db.siswa.count();
  return `${prefix}-${kodePerangkat}-${Date.now()}-${count + 1}`;
}

export async function updateSiswa(actor: ServiceActor, siswaId: string, input: UpdateSiswaInput) {
  await assertCanAccess(actor.role, 'siswa', 'edit');

  const existing = await db.siswa.get(siswaId);
  if (!existing || existing.deleted_at) {
    throw new NotFoundError('Siswa tidak ditemukan.');
  }
  await assertSiswaPeriodNotArchived(existing, 'Edit profil siswa');

  const updated = toPendingUpdate(existing, {
    nama: input.nama.trim(),
    tanggal_lahir: input.tanggal_lahir ?? null,
    jenis_kelamin: input.jenis_kelamin ?? null,
    foto_url: input.foto_url ?? null,
    nama_wali: input.nama_wali.trim(),
    hubungan_wali: input.hubungan_wali ?? null,
    kontak_wali: input.kontak_wali.trim(),
    email_wali: input.email_wali?.trim() || null,
    alamat: input.alamat?.trim() || null,
    nis: input.nis !== undefined ? (input.nis?.trim() || null) : existing.nis,
    daftar_promo: input.daftar_promo !== undefined ? input.daftar_promo : existing.daftar_promo,
    updated_at: nowIso(),
  });

  await db.transaction('rw', db.siswa, db.sync_queue, async () => {
    await db.siswa.put(updated);
    await enqueueSync('siswa', updated.id, 'update', updated);
  });

  await catatAuditLog(actor, 'siswa', updated.id, 'update',
    `Update profil ${updated.nama}`,
    { nama_siswa: updated.nama, perubahan: Object.keys(input).join(', ') });

  return updated;
}

export async function updateSiswaDiskon(actor: ServiceActor, siswaId: string, flag_diskon: boolean, tipe_diskon: 'persen' | 'nominal', persen: number, nominal: number) {
  await assertCanAccess(actor.role, 'siswa', 'edit');

  const existing = await db.siswa.get(siswaId);
  if (!existing || existing.deleted_at) {
    throw new NotFoundError('Siswa tidak ditemukan.');
  }
  await assertSiswaPeriodNotArchived(existing, 'Edit profil siswa');
  if (existing.status !== 'aktif') {
    throw new ValidationError('Hanya siswa aktif yang dapat diedit diskon SPP.');
  }

  const updated = toPendingUpdate(existing, {
    flag_diskon_spp: flag_diskon,
    tipe_diskon_spp: tipe_diskon,
    persen_diskon: persen,
    nominal_diskon_spp: nominal,
    updated_at: nowIso(),
  });

  await db.transaction('rw', db.siswa, db.sync_queue, async () => {
    await db.siswa.put(updated);
    await enqueueSync('siswa', updated.id, 'update', updated);
  });

  await catatAuditLog(actor, 'siswa', updated.id, 'update',
    `Update diskon ${existing.nama}: ${flag_diskon ? `${tipe_diskon === 'persen' ? persen + '%' : 'Rp' + nominal}` : 'nonaktif'}`,
    { nama_siswa: existing.nama, flag_diskon, tipe_diskon, persen, nominal });

  return updated;
}

export async function deleteSiswa(actor: ServiceActor, siswaId: string) {
  await assertCanAccess(actor.role, 'siswa', 'hapus');

  const siswa = await db.siswa.get(siswaId);
  if (!siswa || siswa.deleted_at) {
    throw new NotFoundError('Siswa tidak ditemukan.');
  }
  await assertSiswaPeriodNotArchived(siswa, 'Hapus siswa');

  const [tagihan, assignments] = await Promise.all([
    db.tagihan.where('siswa_id').equals(siswaId).toArray(),
    db.siswa_kelas.where('siswa_id').equals(siswaId).toArray(),
  ]);
  const activeBills = tagihan.filter((item) => !item.deleted_at);
  const billIds = new Set(activeBills.map((item) => item.id));
  const pembayaran = (await db.pembayaran.toArray()).filter((item) => !item.deleted_at && billIds.has(item.tagihan_id));

  if (assignments.length > 0) {
    throw new ValidationError('Siswa sudah memiliki riwayat kelas, tidak dapat dihapus. Gunakan Set Berhenti, Set Lulus, atau Batal Daftar sesuai status siswa.');
  }
  if (pembayaran.length > 0 || activeBills.some((item) => item.sudah_dibayar > 0)) {
    throw new ValidationError('Siswa sudah memiliki pembayaran atau tagihan terbayar, tidak dapat dihapus. Gunakan aksi status siswa.');
  }

  const timestamp = nowIso();
  const deletedSiswa = toPendingUpdate<Siswa>(siswa, { deleted_at: timestamp, updated_at: timestamp });
  const deletedBills = activeBills.map((bill) => toPendingUpdate<Tagihan>(bill, { deleted_at: timestamp, updated_at: timestamp }));

  await db.transaction('rw', db.siswa, db.tagihan, db.sync_queue, async () => {
    await db.siswa.put(deletedSiswa);
    await enqueueSync('siswa', deletedSiswa.id, 'delete', deletedSiswa);
    for (const bill of deletedBills) {
      await db.tagihan.put(bill);
      await enqueueSync('tagihan', bill.id, 'delete', bill);
    }
  });

  await catatAuditLog(actor, 'siswa', siswa.id, 'delete',
    `Hapus siswa ${siswa.nama} + ${deletedBills.length} tagihan terkait`,
    { nama_siswa: siswa.nama, nis: siswa.nis, tagihan_terhapus: deletedBills.length });

  return { siswa: deletedSiswa, tagihan: deletedBills };
}

export async function generateNisMassal(actor: ServiceActor, tahunAjaranId: string) {
  await assertCanAccess(actor.role, 'siswa', 'edit');

  const ta = await db.tahun_ajaran.get(tahunAjaranId);
  if (!ta) throw new ValidationError('Tahun ajaran tidak valid');

  const allSiswa = await db.siswa.toArray();
  const targetSiswa = allSiswa
    .filter(s => !s.deleted_at && s.status === 'aktif' && !s.nis?.trim())
    .sort((a, b) => a.nama.localeCompare(b.nama));

  if (targetSiswa.length === 0) return { count: 0 };

  const timestamp = nowIso();
  let count = 0;

  await db.transaction('rw', db.siswa, db.tahun_ajaran, db.sync_queue, async () => {
    for (const siswa of targetSiswa) {
      const newNis = await ReferenceGeneratorService.generateNIS(tahunAjaranId);
      const updatedSiswa = toPendingUpdate<Siswa>(siswa, {
        nis: newNis,
        updated_at: timestamp
      });
      await db.siswa.put(updatedSiswa);
      await enqueueSync('siswa', updatedSiswa.id, 'update', updatedSiswa);
      count++;
    }
  });

  await catatAuditLog(actor, 'siswa', 'bulk', 'update', `Generate NIS massal untuk ${count} siswa aktif`);
  return { count };
}
