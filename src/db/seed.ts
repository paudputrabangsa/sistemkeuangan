import { db } from './index';
import type { Akun, Pengaturan, Permission } from './types';
import { DEFAULT_JENIS_TAGIHAN, DEFAULT_METODE_PEMBAYARAN, repairSettingList } from '../services/pengaturanRepository';

const PROFILE_ID = '00000000-0000-0000-0000-000000000001';
// Gunakan timestamp masa lalu untuk seed agar LWW selalu memprioritaskan data remote saat sinkronisasi ditarik (pull) ke perangkat baru
const now = () => '2000-01-01T00:00:00.000Z';

function withSyncMeta<T extends Record<string, unknown>>(value: T) {
  const timestamp = now();
  return {
    ...value,
    _sync_status: 'synced' as const,
    _sync_at: timestamp,
    _local_only: false,
  };
}

function defaultSettings(): Pengaturan[] {
  const timestamp = now();
  return [
    withSyncMeta({
      id: '00000000-0000-0000-0000-000000000003',
      kunci: 'metode_pembayaran',
      nilai: DEFAULT_METODE_PEMBAYARAN,
      keterangan: 'Daftar metode pembayaran yang tersedia',
      created_at: timestamp,
      updated_at: timestamp,
    }),
    withSyncMeta({
      id: '00000000-0000-0000-0000-000000000004',
      kunci: 'jenis_tagihan',
      nilai: DEFAULT_JENIS_TAGIHAN,
      keterangan: 'Daftar jenis tagihan sekolah',
      created_at: timestamp,
      updated_at: timestamp,
    }),
    withSyncMeta({
      id: '00000000-0000-0000-0000-000000000005',
      kunci: 'penempatan_siswa_baru',
      nilai: {
        aktifkan_penempatan_otomatis: true,
        cutoff_bulan: 7,
        cutoff_tanggal: 1,
        keterangan: 'Cutoff umur default 1 Juli',
      },
      keterangan: 'Pengaturan cutoff umur untuk penempatan siswa baru',
      created_at: timestamp,
      updated_at: timestamp,
    }),
    withSyncMeta({
      id: '00000000-0000-0000-0000-000000000006',
      kunci: 'format_nis',
      nilai: {
        komponen: [
          { id: 1, tipe: 'tahun', cfg: 'ta-gabung' },
          { id: 2, tipe: 'urut', cfg: '3' },
        ],
        separator: '-',
        resetUrutPerTahun: true,
        autoGenerate: true,
      },
      keterangan: 'Format NIS otomatis',
      created_at: timestamp,
      updated_at: timestamp,
    }),
    withSyncMeta({
      id: '00000000-0000-0000-0000-000000000007',
      kunci: 'diskon',
      nilai: [],
      keterangan: 'Daftar diskon/promo yang tersedia',
      created_at: timestamp,
      updated_at: timestamp,
    }),
    withSyncMeta({
      id: '00000000-0000-0000-0000-000000000011',
      kunci: 'spp_generate_cutoff',
      nilai: { aktif: true, cutoff_tanggal: 20, keterangan: 'SPP siswa pindahan mulai bulan depan jika tanggal daftar melewati cutoff' },
      keterangan: 'Pengaturan cutoff tanggal untuk generate SPP siswa pindahan',
      created_at: timestamp,
      updated_at: timestamp,
    }),
    withSyncMeta({
      id: '00000000-0000-0000-0000-000000000012',
      kunci: 'kode_perangkat',
      nilai: { kode: 'A' },
      keterangan: 'Kode perangkat untuk penomoran kuitansi offline',
      created_at: timestamp,
      updated_at: timestamp,
    }),
  ];
}

function defaultPermissions(): Permission[] {
  const timestamp = now();
  return [
    withSyncMeta({ id: '00000000-0000-0000-0000-000000000301', role: 'admin' as const, modul: 'dashboard' as const, aksi: ['baca'], aktif: true, created_at: timestamp, updated_at: timestamp }) as Permission,
    withSyncMeta({ id: '00000000-0000-0000-0000-000000000302', role: 'admin' as const, modul: 'siswa' as const, aksi: ['baca', 'tambah', 'edit', 'hapus'], aktif: true, created_at: timestamp, updated_at: timestamp }) as Permission,
    withSyncMeta({ id: '00000000-0000-0000-0000-000000000303', role: 'admin' as const, modul: 'kelas' as const, aksi: ['baca', 'tambah', 'edit', 'hapus'], aktif: true, created_at: timestamp, updated_at: timestamp }) as Permission,
    withSyncMeta({ id: '00000000-0000-0000-0000-000000000304', role: 'admin' as const, modul: 'tahun_ajaran' as const, aksi: ['baca', 'tambah', 'edit'], aktif: true, created_at: timestamp, updated_at: timestamp }) as Permission,
    withSyncMeta({ id: '00000000-0000-0000-0000-000000000305', role: 'admin' as const, modul: 'tagihan' as const, aksi: ['baca', 'tambah', 'edit', 'hapus'], aktif: true, created_at: timestamp, updated_at: timestamp }) as Permission,
    withSyncMeta({ id: '00000000-0000-0000-0000-000000000306', role: 'admin' as const, modul: 'pembayaran' as const, aksi: ['baca', 'tambah', 'edit'], aktif: true, created_at: timestamp, updated_at: timestamp }) as Permission,
    withSyncMeta({ id: '00000000-0000-0000-0000-000000000307', role: 'admin' as const, modul: 'laporan' as const, aksi: ['baca', 'export'], aktif: true, created_at: timestamp, updated_at: timestamp }) as Permission,
    withSyncMeta({ id: '00000000-0000-0000-0000-000000000308', role: 'admin' as const, modul: 'akun' as const, aksi: ['baca', 'tambah', 'edit', 'hapus'], aktif: true, created_at: timestamp, updated_at: timestamp }) as Permission,
    withSyncMeta({ id: '00000000-0000-0000-0000-000000000309', role: 'admin' as const, modul: 'pengaturan' as const, aksi: ['baca', 'edit'], aktif: true, created_at: timestamp, updated_at: timestamp }) as Permission,
  ];
}

async function ensureSettings() {
  for (const setting of defaultSettings()) {
    const existing = await db.pengaturan.where('kunci').equals(setting.kunci).first();
    if (!existing) {
      await db.pengaturan.add(setting);
      continue;
    }

    if (setting.kunci === 'penempatan_siswa_baru' && !existing.nilai) {
      await db.pengaturan.put({ ...existing, nilai: setting.nilai, updated_at: now() });
    }
    if (setting.kunci === 'spp_generate_cutoff' && !existing.nilai) {
      await db.pengaturan.put({ ...existing, nilai: setting.nilai, updated_at: now() });
    }
  }
  await repairSettingList('metode_pembayaran');
  await repairSettingList('jenis_tagihan');
}

async function cleanupDummySeragamTagihan() {
  const timestamp = now();
  const bills = await db.tagihan.toArray();
  for (const bill of bills) {
    if (bill.deleted_at || String(bill.jenis).trim().toLowerCase() !== 'seragam') continue;
    await db.tagihan.put({ ...bill, jenis: 'Lainnya', updated_at: timestamp });
  }
}

async function ensureProfile() {
  const existingProfile = await db.profil_sekolah.get(PROFILE_ID);
  if (existingProfile) {
    return;
  }

  const timestamp = now();
  await db.profil_sekolah.add(withSyncMeta({
    id: PROFILE_ID,
    nama_sekolah: '',
    nama_yayasan: null,
    bentuk_satuan: 'TK',
    izin_operasional: null,
    npsn: '12345678',
    telepon: '021-12345678',
    website: 'info@paudmelatiindah.sch.id',
    tahun_berdiri: null,
    alamat_jalan: 'Jl. Melati Indah No. 12',
    alamat_rt: null,
    alamat_rw: null,
    alamat_desa: 'Kuningan Timur',
    alamat_kecamatan: 'Setiabudi',
    alamat_kabupaten: 'Jakarta Selatan',
    alamat_provinsi: 'DKI Jakarta',
    alamat_kode_pos: null,
    nama_kepsek: 'Admin',
    logo_url: null,
    tanda_tangan_url: null,
    created_at: timestamp,
    updated_at: timestamp,
  }));
}

async function ensureAdmin() {
  const existing = await db.akun.toArray();
  const admin = existing.find((item) => item.email.trim().toLowerCase() === 'admin@paud.sch.id');
  if (admin) {
    if (!admin.aktif || admin.deleted_at) {
      await db.akun.put({
        ...admin,
        aktif: true,
        deleted_at: null,
        updated_at: now(),
      });
    }
    return;
  }
  const timestamp = now();
  await db.akun.add(withSyncMeta({
    id: '00000000-0000-0000-0000-000000000010',
    nama: 'Admin',
    email: 'admin@paud.sch.id',
    role: 'admin' as const,
    aktif: true,
    created_at: timestamp,
    updated_at: timestamp,
  }) as Akun);
}

export async function ensureLoginBootstrap() {
  await ensureAdmin();
  await ensurePermissions();

  const { hashString } = await import('../services/authService');
  const nowStr = now();

  const existingPin = await db.pengaturan.where('kunci').equals('auth_pin_hash').first();
  if (!existingPin) {
    const pinHash = await hashString('123456');
    await db.pengaturan.add({ id: '00000000-0000-0000-0000-000000000901', kunci: 'auth_pin_hash', nilai: { hash: pinHash }, created_at: nowStr, updated_at: nowStr, keterangan: 'PIN Kasir (Default: 123456)', _sync_status: 'synced', _sync_at: nowStr, _local_only: false });
  }

  const existingSandi = await db.pengaturan.where('kunci').equals('auth_sandi_darurat_hash').first();
  if (!existingSandi) {
    const sandiHash = await hashString('doomsday123');
    await db.pengaturan.add({ id: '00000000-0000-0000-0000-000000000902', kunci: 'auth_sandi_darurat_hash', nilai: { hash: sandiHash }, created_at: nowStr, updated_at: nowStr, keterangan: 'Sandi Darurat (Default: doomsday123)', _sync_status: 'synced', _sync_at: nowStr, _local_only: false });
  }
}

async function ensurePermissions() {
  for (const permission of defaultPermissions()) {
    const existing = await db.permission
      .where('role')
      .equals(permission.role)
      .filter((item) => item.modul === permission.modul)
      .first();
    if (!existing) {
      await db.permission.add(permission);
    } else {
      await db.permission.put({
        ...existing,
        aksi: permission.aksi,
        aktif: true,
        updated_at: now(),
      });
    }
  }
}

async function backfillRecords() {
  const tahunAjaranRecords = await db.tahun_ajaran.toArray();
  for (const tahunAjaran of tahunAjaranRecords) {
    const status = tahunAjaran.status ?? (tahunAjaran.aktif ? 'aktif' : 'draft');
    await db.tahun_ajaran.put({
      ...tahunAjaran,
      aktif: status === 'aktif',
      status,
    });
  }

  const allYears = await db.tahun_ajaran.toArray();
  const activeYear = allYears.find((item) => !item.deleted_at && (item.aktif || item.status === 'aktif')) ?? null;
  const firstYear = activeYear ?? allYears.sort((a, b) => a.mulai.localeCompare(b.mulai))[0] ?? null;
  const kelasMap = new Map((await db.kelas.toArray()).map((item) => [item.id, item]));

  const siswaRecords = await db.siswa.toArray();
  for (const siswa of siswaRecords) {
    const assignments = await db.siswa_kelas.where('siswa_id').equals(siswa.id).toArray();
    const activeAssignment = assignments.find((item) => !item.selesai) ?? null;
    const assignedKelas = activeAssignment ? kelasMap.get(activeAssignment.kelas_id) : null;
    const targetYearId = siswa.tahun_ajaran_target_id || assignedKelas?.tahun_ajaran_id || firstYear?.id || '';
    const normalizedStatus = siswa.status === 'aktif' || siswa.status === 'calon' || siswa.status === 'lulus' || siswa.status === 'berhenti'
      ? siswa.status
      : 'berhenti';
    const enforcedStatus = normalizedStatus === 'aktif' && !activeAssignment ? 'calon' : normalizedStatus;

    await db.siswa.put({
      ...siswa,
      status: enforcedStatus,
      tanggal_daftar: (siswa as typeof siswa & { tanggal_masuk?: string }).tanggal_daftar ?? (siswa as typeof siswa & { tanggal_masuk?: string }).tanggal_masuk ?? String(siswa.created_at).slice(0, 10),
      jenis_masuk: siswa.jenis_masuk === 'pindahan' ? 'pindahan' : 'awal_tahun',
      tahun_ajaran_target_id: targetYearId,
      kelas_rencana_id: siswa.kelas_rencana_id ?? null,
      jalur_registrasi: siswa.jalur_registrasi === 'baru' || siswa.jalur_registrasi === 'pindahan' || siswa.jalur_registrasi === 'migrasi'
        ? siswa.jalur_registrasi
        : 'migrasi',
      sumber_data: siswa.sumber_data === 'import_excel' ? 'import_excel' : 'manual',
      alasan_keluar: siswa.alasan_keluar ?? null,
      tanggal_keluar: siswa.tanggal_keluar ?? null,
      kode_import_siswa: siswa.kode_import_siswa ?? null,
    });
  }

  const kelasRecords = await db.kelas.toArray();
  for (const kelas of kelasRecords) {
    await db.kelas.put({
      ...kelas,
      usia_min_tahun: kelas.usia_min_tahun ?? null,
      usia_max_tahun: kelas.usia_max_tahun ?? null,
    });
  }

  const siswaKelasRecords = await db.siswa_kelas.toArray();
  for (const item of siswaKelasRecords) {
    await db.siswa_kelas.put({
      ...item,
      penempatan_sumber: item.penempatan_sumber ?? 'manual',
      catatan_penempatan: item.catatan_penempatan ?? null,
      status_akhir_periode: item.status_akhir_periode ?? null,
    });
  }
}

export async function seedDatabase() {
  await db.transaction('rw', [db.profil_sekolah, db.pengaturan, db.akun, db.permission, db.siswa, db.kelas, db.tingkat, db.siswa_kelas, db.tagihan, db.tahun_ajaran], async () => {
    await ensureProfile();
    await ensureSettings();
    await cleanupDummySeragamTagihan();
    await ensureAdmin();
    await ensurePermissions();
    await backfillRecords();
  });
}
