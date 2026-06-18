import Dexie, { type Table } from 'dexie';
import type {
  ProfilSekolah,
  Pengaturan,
  TahunAjaran,
  Tingkat,
  Kelas,
  PengaturanPendaftaranTahunAjaran,
  Akun,
  Permission,
  Siswa,
  SiswaKelas,
  Tagihan,
  Pembayaran,
  SyncQueue,
  SyncLog,
  AuditLog
} from './types';

export class AppDatabase extends Dexie {
  profil_sekolah!: Table<ProfilSekolah>;
  pengaturan!: Table<Pengaturan>;
  tahun_ajaran!: Table<TahunAjaran>;
  tingkat!: Table<Tingkat>;
  kelas!: Table<Kelas>;
  pengaturan_pendaftaran_tahun_ajaran!: Table<PengaturanPendaftaranTahunAjaran>;
  akun!: Table<Akun>;
  permission!: Table<Permission>;
  siswa!: Table<Siswa>;
  siswa_kelas!: Table<SiswaKelas>;
  tagihan!: Table<Tagihan>;
  pembayaran!: Table<Pembayaran>;
  sync_queue!: Table<SyncQueue>;
  sync_log!: Table<SyncLog>;
  audit_log!: Table<AuditLog>;

  constructor() {
    super('paud_db');
    this.version(1).stores({
      profil_sekolah: 'id, updated_at, _sync_status',
      pengaturan: 'id, kunci, updated_at, _sync_status',
      tahun_ajaran: 'id, aktif, updated_at, _sync_status',
      kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
      akun: 'id, email, role, updated_at, _sync_status',
      permission: 'id, role, modul, updated_at, _sync_status',
      siswa: 'id, status, updated_at, _sync_status',
      siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
      tagihan: 'id, siswa_id, jenis, status, bulan_tahun, updated_at, _sync_status',
      pembayaran: 'id, tagihan_id, updated_at, _sync_status',
      sync_queue: '++id, tabel, record_id, aksi, created_at',
      sync_log: '++id, tabel, record_id, status, created_at',
    });
    this.version(2).stores({
      profil_sekolah: 'id, updated_at, _sync_status',
      pengaturan: 'id, kunci, updated_at, _sync_status',
      tahun_ajaran: 'id, aktif, updated_at, _sync_status',
      kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
      akun: 'id, email, role, updated_at, _sync_status',
      permission: 'id, role, modul, updated_at, _sync_status',
      siswa: 'id, status, tahun_ajaran_target_id, jalur_registrasi, updated_at, _sync_status',
      siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
      tagihan: 'id, siswa_id, jenis, status, bulan_tahun, updated_at, _sync_status',
      pembayaran: 'id, tagihan_id, updated_at, _sync_status',
      sync_queue: '++id, tabel, record_id, aksi, created_at',
      sync_log: '++id, tabel, record_id, status, created_at',
    });
    this.version(3)
      .stores({
        profil_sekolah: 'id, updated_at, _sync_status',
        pengaturan: 'id, kunci, updated_at, _sync_status',
        tahun_ajaran: 'id, aktif, updated_at, _sync_status',
        kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
        akun: 'id, email, role, updated_at, _sync_status',
        permission: 'id, role, modul, updated_at, _sync_status',
        siswa: 'id, status, tahun_ajaran_target_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
        siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
        tagihan: 'id, siswa_id, jenis, status, bulan_tahun, updated_at, _sync_status',
        pembayaran: 'id, tagihan_id, updated_at, _sync_status',
        sync_queue: '++id, tabel, record_id, aksi, created_at',
        sync_log: '++id, tabel, record_id, status, created_at',
      })
      .upgrade(async (tx) => {
        await tx.table('siswa').toCollection().modify((record: Record<string, unknown>) => {
          const oldStatus = typeof record.status === 'string' ? record.status : 'calon';
          const oldJenisMasuk = typeof record.jenis_masuk === 'string' ? record.jenis_masuk : 'baru';
          const oldJalur = typeof record.jalur_registrasi === 'string' ? record.jalur_registrasi : 'baru';
          const oldSumber = typeof record.sumber_data === 'string' ? record.sumber_data : 'manual';

          record.status = oldStatus === 'aktif'
            ? 'aktif'
            : oldStatus === 'calon'
              ? 'calon'
              : 'berhenti';
          record.jenis_masuk = oldJenisMasuk === 'pindahan' ? 'pindahan' : 'awal_tahun';
          record.jalur_registrasi = oldJalur === 'daftar_ulang' ? 'migrasi' : oldJalur;
          record.sumber_data = oldSumber === 'dapodik_import' ? 'import_excel' : oldSumber;
          record.tanggal_daftar = (record.tanggal_daftar as string | undefined) ?? (record.tanggal_masuk as string | undefined) ?? String(record.created_at ?? '').slice(0, 10);
          record.alasan_keluar = (record.alasan_keluar as string | undefined) ?? null;
          record.tanggal_keluar = (record.tanggal_keluar as string | undefined) ?? null;
          record.kode_import_siswa = (record.kode_import_siswa as string | undefined) ?? null;
          delete record.tanggal_masuk;
        });

        await tx.table('siswa_kelas').toCollection().modify((record: Record<string, unknown>) => {
          record.penempatan_sumber = (record.penempatan_sumber as string | undefined) ?? 'manual';
        });
      });
    this.version(4)
      .stores({
        profil_sekolah: 'id, updated_at, _sync_status',
        pengaturan: 'id, kunci, updated_at, _sync_status',
        tahun_ajaran: 'id, aktif, status, updated_at, _sync_status',
        kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
        akun: 'id, email, role, updated_at, _sync_status',
        permission: 'id, role, modul, updated_at, _sync_status',
        siswa: 'id, status, tahun_ajaran_target_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
        siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
        tagihan: 'id, siswa_id, jenis, status, bulan_tahun, updated_at, _sync_status',
        pembayaran: 'id, tagihan_id, updated_at, _sync_status',
        sync_queue: '++id, tabel, record_id, aksi, created_at',
        sync_log: '++id, tabel, record_id, status, created_at',
      })
      .upgrade(async (tx) => {
        await tx.table('tahun_ajaran').toCollection().modify((record: Record<string, unknown>) => {
          if (record.status === 'draft' || record.status === 'aktif' || record.status === 'arsip') {
            record.aktif = record.status === 'aktif';
            return;
          }

          record.status = record.aktif ? 'aktif' : 'draft';
        });
      });
    this.version(5)
      .stores({
        profil_sekolah: 'id, updated_at, _sync_status',
        pengaturan: 'id, kunci, updated_at, _sync_status',
        tahun_ajaran: 'id, aktif, status, updated_at, _sync_status',
        kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
        akun: 'id, email, role, updated_at, _sync_status',
        permission: 'id, role, modul, updated_at, _sync_status',
        siswa: 'id, status, tahun_ajaran_target_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
        siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
        tagihan: 'id, siswa_id, jenis, status, bulan_tahun, updated_at, _sync_status',
        pembayaran: 'id, tagihan_id, updated_at, _sync_status',
        sync_queue: '++id, tabel, record_id, aksi, created_at',
        sync_log: '++id, tabel, record_id, status, created_at',
      })
      .upgrade(async (tx) => {
        await tx.table('siswa_kelas').toCollection().modify((record: Record<string, unknown>) => {
          record.status_akhir_periode = (record.status_akhir_periode as string | undefined) ?? null;
        });
      });
    this.version(6)
      .stores({
        profil_sekolah: 'id, updated_at, _sync_status',
        pengaturan: 'id, kunci, updated_at, _sync_status',
        tahun_ajaran: 'id, aktif, status, updated_at, _sync_status',
        kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
        akun: 'id, email, role, updated_at, _sync_status',
        permission: 'id, role, modul, updated_at, _sync_status',
        siswa: 'id, status, tahun_ajaran_target_id, kelas_rencana_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
        siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
        tagihan: 'id, siswa_id, jenis, status, bulan_tahun, updated_at, _sync_status',
        pembayaran: 'id, tagihan_id, updated_at, _sync_status',
        sync_queue: '++id, tabel, record_id, aksi, created_at',
        sync_log: '++id, tabel, record_id, status, created_at',
      })
      .upgrade(async (tx) => {
        await tx.table('siswa').toCollection().modify((record: Record<string, unknown>) => {
          record.kelas_rencana_id = (record.kelas_rencana_id as string | undefined) ?? null;
        });
      });
    this.version(7).stores({
      profil_sekolah: 'id, updated_at, _sync_status',
      pengaturan: 'id, kunci, updated_at, _sync_status',
      tahun_ajaran: 'id, aktif, status, updated_at, _sync_status',
      kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
      pengaturan_pendaftaran_tahun_ajaran: 'id, tahun_ajaran_id, updated_at, _sync_status',
      akun: 'id, email, role, updated_at, _sync_status',
      permission: 'id, role, modul, updated_at, _sync_status',
      siswa: 'id, status, tahun_ajaran_target_id, kelas_rencana_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
      siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
      tagihan: 'id, siswa_id, jenis, status, bulan_tahun, updated_at, _sync_status',
      pembayaran: 'id, tagihan_id, updated_at, _sync_status',
      sync_queue: '++id, tabel, record_id, aksi, created_at',
      sync_log: '++id, tabel, record_id, status, created_at',
    });
    this.version(8)
      .stores({
        profil_sekolah: 'id, updated_at, _sync_status',
        pengaturan: 'id, kunci, updated_at, _sync_status',
        tahun_ajaran: 'id, aktif, status, updated_at, _sync_status',
        kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
        pengaturan_pendaftaran_tahun_ajaran: 'id, tahun_ajaran_id, updated_at, _sync_status',
        akun: 'id, email, role, updated_at, _sync_status',
        permission: 'id, role, modul, updated_at, _sync_status',
        siswa: 'id, status, tahun_ajaran_target_id, kelas_rencana_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
        siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
        tagihan: 'id, siswa_id, tahun_ajaran_id, jenis, status, bulan_tahun, updated_at, _sync_status',
        pembayaran: 'id, tagihan_id, updated_at, _sync_status',
        sync_queue: '++id, tabel, record_id, aksi, created_at',
        sync_log: '++id, tabel, record_id, status, created_at',
      })
      .upgrade(async (tx) => {
        const siswa = await tx.table('siswa').toArray();
        const siswaYearMap = new Map<string, string>();
        for (const item of siswa as Array<Record<string, unknown>>) {
          const id = typeof item.id === 'string' ? item.id : '';
          const yearId = typeof item.tahun_ajaran_target_id === 'string' ? item.tahun_ajaran_target_id : '';
          if (id && yearId) siswaYearMap.set(id, yearId);
        }

        const years = await tx.table('tahun_ajaran').toArray();
        const activeYear = (years as Array<Record<string, unknown>>).find((item) => !item.deleted_at && (item.aktif === true || item.status === 'aktif'));
        const fallbackYearId = typeof activeYear?.id === 'string' ? activeYear.id : '';

        await tx.table('tagihan').toCollection().modify((record: Record<string, unknown>) => {
          if (typeof record.tahun_ajaran_id === 'string' && record.tahun_ajaran_id) return;
          const siswaId = typeof record.siswa_id === 'string' ? record.siswa_id : '';
          record.tahun_ajaran_id = siswaYearMap.get(siswaId) ?? fallbackYearId;
        });
      });
    this.version(9)
      .stores({
        profil_sekolah: 'id, updated_at, _sync_status',
        pengaturan: 'id, kunci, updated_at, _sync_status',
        tahun_ajaran: 'id, aktif, status, updated_at, _sync_status',
        kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
        pengaturan_pendaftaran_tahun_ajaran: 'id, tahun_ajaran_id, updated_at, _sync_status',
        akun: 'id, email, role, updated_at, _sync_status',
        permission: 'id, role, modul, updated_at, _sync_status',
        siswa: 'id, status, tahun_ajaran_target_id, kelas_rencana_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
        siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
        tagihan: 'id, siswa_id, tahun_ajaran_id, jenis, status, bulan_tahun, updated_at, _sync_status',
        pembayaran: 'id, tagihan_id, payment_group_id, status_verifikasi, updated_at, _sync_status',
        sync_queue: '++id, tabel, record_id, aksi, created_at',
        sync_log: '++id, tabel, record_id, status, created_at',
      })
      .upgrade(async (tx) => {
        await tx.table('pembayaran').toCollection().modify((record: Record<string, unknown>) => {
          const id = typeof record.id === 'string' ? record.id : crypto.randomUUID();
          record.payment_group_id = typeof record.payment_group_id === 'string' && record.payment_group_id ? record.payment_group_id : id;
          record.status_verifikasi = typeof record.status_verifikasi === 'string' ? record.status_verifikasi : 'terverifikasi';
          record.diverifikasi_pada = record.diverifikasi_pada ?? record.created_at ?? null;
          record.diverifikasi_oleh = record.diverifikasi_oleh ?? record.dicatat_oleh ?? null;
          record.catatan_verifikasi = record.catatan_verifikasi ?? null;
        });
      });
    this.version(10).stores({
      profil_sekolah: 'id, updated_at, _sync_status',
      pengaturan: 'id, kunci, updated_at, _sync_status',
      tahun_ajaran: 'id, aktif, status, updated_at, _sync_status',
      kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
      pengaturan_pendaftaran_tahun_ajaran: 'id, tahun_ajaran_id, updated_at, _sync_status',
      akun: 'id, email, role, updated_at, _sync_status',
      permission: 'id, role, modul, updated_at, _sync_status',
      siswa: 'id, status, tahun_ajaran_target_id, kelas_rencana_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
      siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
      tagihan: 'id, siswa_id, tahun_ajaran_id, jenis, status, bulan_tahun, updated_at, _sync_status',
      pembayaran: 'id, tagihan_id, payment_group_id, status_verifikasi, updated_at, _sync_status',
      sync_log: '++id, tabel, record_id, status, created_at',
      audit_log: 'id, tabel, record_id, user_id, aksi, created_at, _sync_status'
    });
    this.version(11)
      .stores({
        profil_sekolah: 'id, updated_at, _sync_status',
        pengaturan: 'id, kunci, updated_at, _sync_status',
        tahun_ajaran: 'id, aktif, status, updated_at, _sync_status',
        kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
        pengaturan_pendaftaran_tahun_ajaran: 'id, tahun_ajaran_id, updated_at, _sync_status',
        akun: 'id, email, role, updated_at, _sync_status',
        permission: 'id, role, modul, updated_at, _sync_status',
        siswa: 'id, nis, no_pendaftaran, status, tahun_ajaran_target_id, kelas_rencana_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
        siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
        tagihan: 'id, no_referensi, siswa_id, tahun_ajaran_id, jenis, status, bulan_tahun, updated_at, _sync_status',
        pembayaran: 'id, no_kuitansi, tagihan_id, payment_group_id, status_verifikasi, updated_at, _sync_status',
        sync_queue: '++id, tabel, record_id, aksi, created_at',
        sync_log: '++id, tabel, record_id, status, created_at',
        audit_log: 'id, tabel, record_id, user_id, aksi, created_at, _sync_status'
      })
      .upgrade(async (tx) => {
        await tx.table('siswa').toCollection().modify((record: Record<string, unknown>) => {
          record.nis = record.nis ?? null;
          record.no_pendaftaran = record.no_pendaftaran ?? null;
        });
        await tx.table('tagihan').toCollection().modify((record: Record<string, unknown>) => {
          record.no_referensi = record.no_referensi ?? null;
        });
        await tx.table('pembayaran').toCollection().modify((record: Record<string, unknown>) => {
          record.no_kuitansi = record.no_kuitansi ?? null;
        });
      });
    this.version(12)
      .stores({
        profil_sekolah: 'id, updated_at, _sync_status',
        pengaturan: 'id, kunci, updated_at, _sync_status',
        tahun_ajaran: 'id, aktif, status, updated_at, _sync_status',
        tingkat: 'id, tahun_ajaran_id, updated_at, _sync_status',
        kelas: 'id, tahun_ajaran_id, tingkat_id, updated_at, _sync_status',
        pengaturan_pendaftaran_tahun_ajaran: 'id, tahun_ajaran_id, updated_at, _sync_status',
        akun: 'id, email, role, updated_at, _sync_status',
        permission: 'id, role, modul, updated_at, _sync_status',
        siswa: 'id, nis, no_pendaftaran, status, tahun_ajaran_target_id, kelas_rencana_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
        siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
        tagihan: 'id, no_referensi, siswa_id, tahun_ajaran_id, jenis, status, bulan_tahun, updated_at, _sync_status',
        pembayaran: 'id, no_kuitansi, tagihan_id, payment_group_id, status_verifikasi, updated_at, _sync_status',
        sync_queue: '++id, tabel, record_id, aksi, created_at',
        sync_log: '++id, tabel, record_id, status, created_at',
        audit_log: 'id, tabel, record_id, user_id, aksi, created_at, _sync_status'
      })
      .upgrade(async (tx) => {
        // Backfill: create tingkat records from existing kelas tingkat strings
        const allKelas = await tx.table('kelas').toArray();
        const tingkatMap = new Map<string, string>(); // key: "tahun_ajaran_id|tingkat_name" -> tingkat_id
        let urutanCounter = 0;

        for (const kelas of allKelas as Array<Record<string, unknown>>) {
          const tahunAjaranId = typeof kelas.tahun_ajaran_id === 'string' ? kelas.tahun_ajaran_id : '';
          const tingkatName = typeof kelas.tingkat === 'string' && kelas.tingkat.trim() ? kelas.tingkat.trim() : (typeof kelas.nama_kelas === 'string' ? kelas.nama_kelas : '');
          const mapKey = `${tahunAjaranId}|${tingkatName.toLowerCase()}`;

          if (!tingkatMap.has(mapKey)) {
            const tingkatId = crypto.randomUUID();
            const timestamp = new Date().toISOString();
            urutanCounter += 1;
            await tx.table('tingkat').add({
              id: tingkatId,
              tahun_ajaran_id: tahunAjaranId,
              nama: tingkatName,
              kode: null,
              urutan: urutanCounter,
              tarif_spp: typeof kelas.tarif_spp === 'number' ? kelas.tarif_spp : 0,
              usia_min_tahun: typeof kelas.usia_min_tahun === 'number' ? kelas.usia_min_tahun : null,
              usia_max_tahun: typeof kelas.usia_max_tahun === 'number' ? kelas.usia_max_tahun : null,
              created_at: timestamp,
              updated_at: timestamp,
              deleted_at: null,
              _sync_status: 'pending',
              _sync_at: null,
              _local_only: true,
            });
            tingkatMap.set(mapKey, tingkatId);
          }

          kelas.tingkat_id = tingkatMap.get(mapKey) ?? '';
        }

        for (const kelas of allKelas as Array<Record<string, unknown>>) {
          await tx.table('kelas').put(kelas);
        }

        // Backfill komponen_biaya in pengaturan_pendaftaran_tahun_ajaran
        await tx.table('pengaturan_pendaftaran_tahun_ajaran').toCollection().modify((record: Record<string, unknown>) => {
          if (!Array.isArray(record.komponen_biaya)) {
            const biaya = typeof record.biaya_pendaftaran_default === 'number' ? record.biaya_pendaftaran_default : 0;
            record.komponen_biaya = biaya > 0
              ? [{ id: crypto.randomUUID(), nama: 'Pendaftaran', nominal: biaya, wajib: true }]
              : [];
          }
          if (!record.mode_tagihan_biaya) {
            record.mode_tagihan_biaya = 'gabung';
          }
        });
      });

    this.version(13).stores({
        profil_sekolah: 'id, updated_at, _sync_status',
        pengaturan: 'id, kunci, updated_at, _sync_status',
        tahun_ajaran: 'id, aktif, updated_at, _sync_status',
        tingkat: 'id, tahun_ajaran_id, updated_at, _sync_status',
        kelas: 'id, tahun_ajaran_id, tingkat_id, updated_at, _sync_status',
        pengaturan_pendaftaran_tahun_ajaran: 'id, tahun_ajaran_id, updated_at, _sync_status',
        akun: 'id, email, role, updated_at, _sync_status',
        permission: 'id, role, modul, updated_at, _sync_status',
        siswa: 'id, nis, no_pendaftaran, status, tahun_ajaran_target_id, kelas_rencana_id, jalur_registrasi, kode_import_siswa, updated_at, _sync_status',
        siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
        tagihan: 'id, no_referensi, siswa_id, tahun_ajaran_id, jenis, status, bulan_tahun, updated_at, _sync_status',
        pembayaran: 'id, no_kuitansi, tagihan_id, payment_group_id, status_verifikasi, updated_at, _sync_status',
        sync_queue: '++id, tabel, record_id, aksi, created_at',
        sync_log: '++id, tabel, record_id, status, created_at',
        audit_log: 'id, tabel, record_id, user_id, aksi, created_at, _sync_status'
      })
      .upgrade(async (tx: import('dexie').Transaction) => {
        // Backfill: move old alamat string to alamat_jalan
        await tx.table('profil_sekolah').toCollection().modify((record: Record<string, unknown>) => {
          if ('alamat' in record && typeof record.alamat === 'string') {
            record.alamat_jalan = record.alamat;
            delete record.alamat;
          }
        });
      });
  }
}

export const db = new AppDatabase();
export default db;
