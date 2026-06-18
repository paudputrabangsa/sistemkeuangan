export interface BaseEntity {
  id: string; // uuid PK generated on client
  created_at: string; // ISO date-time string
  updated_at: string; // ISO date-time string
  deleted_at?: string | null; // ISO date-time string for soft delete

  // Sync metadata (Dexie only, not on Supabase)
  _sync_status?: 'synced' | 'pending' | 'conflict';
  _sync_at?: string | null;
  _local_only?: boolean;
}

export interface ProfilSekolah extends BaseEntity {
  nama_sekolah: string;
  nama_yayasan?: string | null;
  bentuk_satuan?: string | null;
  izin_operasional?: string | null;
  npsn?: string | null;
  telepon?: string | null;
  website?: string | null;
  tahun_berdiri?: string | null;
  alamat_jalan?: string | null;
  alamat_rt?: string | null;
  alamat_rw?: string | null;
  alamat_desa?: string | null;
  alamat_kecamatan?: string | null;
  alamat_kabupaten?: string | null;
  alamat_provinsi?: string | null;
  alamat_kode_pos?: string | null;
  nama_kepsek?: string | null;
  logo_url?: string | null;
  tanda_tangan_url?: string | null;
}

export interface Pengaturan extends BaseEntity {
  kunci: string; // UNIQUE (e.g., 'metode_pembayaran', 'jenis_tagihan')
  nilai: any; // JSON value
  keterangan?: string | null;
}

export interface Akun extends BaseEntity {
  nama: string;
  email: string;
  role: 'admin';
  aktif: boolean;
}

export interface Permission extends Omit<BaseEntity, 'deleted_at'> {
  role: string;
  modul: 'dashboard' | 'siswa' | 'kelas' | 'tahun_ajaran' | 'tagihan' | 'pembayaran' | 'laporan' | 'akun' | 'pengaturan';
  aksi: ('baca' | 'tambah' | 'edit' | 'hapus' | 'export')[];
  aktif: boolean;
}

export interface TahunAjaran extends BaseEntity {
  nama: string; // e.g. "2025/2026"
  mulai: string; // YYYY-MM-DD
  selesai: string; // YYYY-MM-DD
  aktif: boolean;
  status?: 'draft' | 'aktif' | 'arsip';
}

export interface Tingkat extends BaseEntity {
  tahun_ajaran_id: string; // FK to TahunAjaran
  nama: string; // e.g. "Kelompok Bermain", "TK A", "TK B"
  kode?: string | null; // e.g. "KB", "A", "B" — used for NIS generation
  urutan: number; // sort order
  tarif_spp: number;
  usia_min_tahun?: number | null;
  usia_max_tahun?: number | null;
}

export interface Kelas extends BaseEntity {
  tahun_ajaran_id: string; // FK to TahunAjaran
  tingkat_id: string; // FK to Tingkat
  nama_kelas: string; // e.g. "Mawar", "Melati"
  tingkat?: string | null; // Denormalized tingkat name for backward compat
  tarif_spp: number; // Denormalized from Tingkat for backward compat
  kapasitas_siswa?: number | null;
  usia_min_tahun?: number | null; // Denormalized from Tingkat
  usia_max_tahun?: number | null; // Denormalized from Tingkat
}

export interface KomponenBiayaItem {
  id: string;
  nama: string; // e.g. "Uang Pangkal", "Seragam", "Buku"
  nominal: number;
  wajib: boolean;
}

export interface PengaturanPendaftaranTahunAjaran extends BaseEntity {
  tahun_ajaran_id: string;
  pendaftaran_luar_sistem?: boolean; // NEW: optional registration
  biaya_pendaftaran_default: number; // Legacy, replaced by komponen_biaya
  komponen_biaya: KomponenBiayaItem[]; // NEW: replaces biaya_pendaftaran_default
  mode_tagihan_biaya: 'gabung' | 'pisah'; // NEW: combine or separate components
  opsi_bayar_default: 'full' | 'cicil';
  jatuh_tempo_mode: 'tanggal_tetap' | 'hari_setelah_daftar';
  jatuh_tempo_tanggal?: string | null;
  jatuh_tempo_hari_setelah_daftar?: number | null;
  cutoff_bulan: number;
  cutoff_tanggal: number;
}

export interface Siswa extends BaseEntity {
  nama: string;
  tanggal_lahir?: string | null; // YYYY-MM-DD
  jenis_kelamin?: 'L' | 'P' | null;
  foto_url?: string | null;
  nama_wali: string;
  hubungan_wali?: 'ayah' | 'ibu' | 'wali' | null;
  kontak_wali: string;
  email_wali?: string | null;
  alamat?: string | null;
  status: 'calon' | 'aktif' | 'lulus' | 'berhenti' | 'batal_daftar' | 'cuti';
  flag_diskon_spp: boolean;
  tipe_diskon_spp?: 'persen' | 'nominal';
  persen_diskon: number;
  nominal_diskon_spp?: number;
  tanggal_daftar: string; // YYYY-MM-DD
  jenis_masuk: 'awal_tahun' | 'pindahan';
  tahun_ajaran_target_id: string;
  kelas_rencana_id?: string | null;
  jalur_registrasi: 'baru' | 'pindahan' | 'migrasi';
  sumber_data: 'manual' | 'import_excel';
  alasan_keluar?: 'pindah_sekolah' | 'berhenti_lainnya' | 'cuti' | null;
  tanggal_keluar?: string | null;
  kode_import_siswa?: string | null;
  no_pendaftaran?: string | null;
  nis?: string | null;
  daftar_promo?: string[] | null;
  tarif_spp_khusus?: number | null;
  alasan_tarif_spp_khusus?: string | null;
}

export interface SiswaKelas {
  id: string; // uuid PK generated on client
  siswa_id: string; // FK to Siswa
  kelas_id: string; // FK to Kelas
  mulai: string; // YYYY-MM-DD
  selesai?: string | null; // YYYY-MM-DD (null if active in class)
  penempatan_sumber?: 'otomatis' | 'manual' | 'import_excel' | null;
  catatan_penempatan?: string | null;
  status_akhir_periode?: 'naik_kelas' | 'alumni' | 'keluar' | 'batal_daftar' | 'tidak_lanjut' | null;
  created_at: string;
  updated_at: string;

  // Sync metadata
  _sync_status?: 'synced' | 'pending' | 'conflict';
  _sync_at?: string | null;
  _local_only?: boolean;
}

export interface Tagihan extends BaseEntity {
  siswa_id: string; // FK to Siswa
  tahun_ajaran_id: string; // FK to TahunAjaran
  jenis: string; // e.g. 'spp', 'pendaftaran', 'kegiatan', etc.
  nama_tagihan: string; // e.g. "SPP Oktober 2025"
  jumlah_total: number;
  sudah_dibayar: number;
  jatuh_tempo: string; // YYYY-MM-DD
  status: 'belum_bayar' | 'sebagian' | 'lunas' | 'dibatalkan';
  bisa_cicil: boolean;
  bulan_tahun?: string | null; // YYYY-MM (SPP only)
  created_by: string; // FK to Akun (id of creator admin)
  no_referensi?: string | null;
  potongan_diskon?: number | null;
  nama_promo?: string | null;
  promo_ids?: string[] | null;
  status_daftar_ulang?: 'tertahan' | 'aktif';
}

export interface Pembayaran extends BaseEntity {
  tagihan_id: string; // FK to Tagihan
  dicatat_oleh: string; // FK to Akun (id of recording admin)
  jumlah: number;
  diskon_tambahan?: number; // manual discount applied at payment time
  metode: string; // e.g. 'Tunai', 'Transfer Bank'
  tanggal: string; // YYYY-MM-DD
  catatan?: string | null;
  payment_group_id?: string | null;
  status_verifikasi?: 'menunggu_verifikasi' | 'terverifikasi' | 'ditolak';
  diverifikasi_pada?: string | null;
  diverifikasi_oleh?: string | null;
  catatan_verifikasi?: string | null;
  no_kuitansi?: string | null;
}

export interface SyncQueue {
  id?: number; // Auto increment local PK
  tabel: string; // Name of table: 'siswa', 'tagihan', etc.
  record_id: string; // uuid of record that changed
  aksi: 'insert' | 'update' | 'delete';
  payload: any; // JSON representation of full record
  retry_count: number; // default 0
  created_at: string; // ISO date-time string
}

export interface SyncLog {
  id?: number; // Auto increment local PK
  tabel: string;
  record_id: string;
  status: 'success' | 'failed';
  created_at: string; // ISO date-time string
  error_message?: string | null;
}

export interface AuditLog {
  id: string; // uuid
  tabel: string;
  record_id: string;
  aksi: 'create' | 'update' | 'delete' | 'batal' | 'lainnya';
  deskripsi: string;
  user_id: string;
  payload?: any;
  created_at: string;

  // Sync metadata
  _sync_status?: 'synced' | 'pending' | 'conflict';
  _sync_at?: string | null;
  _local_only?: boolean;
}

// ==================== Pengaturan Module Types ====================

// Format NIS — stored in pengaturan kunci='format_nis'
export type TipeKomponenNIS = 'prefix' | 'tahun' | 'kelas' | 'gender' | 'thlahir' | 'urut' | 'custom';

export interface KomponenNIS {
  id: number;
  tipe: TipeKomponenNIS;
  cfg: string;
}

export interface FormatNIS {
  komponen: KomponenNIS[];
  separator: '-' | '/' | '.' | '';
  resetUrutPerTahun: boolean;
  autoGenerate: boolean;
}

export interface DiskonItem {
  id: string;
  nama: string; // e.g. "Early Bird", "Promo Lebaran"
  aktif: boolean;
  tipe_diskon: 'persen' | 'nominal';
  persen_diskon: number;
  nominal_diskon: number;
  potongan_per_target?: Record<string, {
    tipe_diskon: 'persen' | 'nominal';
    persen_diskon: number;
    nominal_diskon: number;
  }>;
  jenis_tagihan?: string; // Deprecated: keep for backwards compatibility during migration
  berulang: boolean;
  klaim_mulai?: string | null;
  klaim_selesai?: string | null;
  batas_kali_penggunaan?: number | null;
  kuota?: number | null;
  mulai?: string | null;
  selesai?: string | null;
  target_jenis_tagihan: string[];
  target_komponen_biaya?: string[];
  mode_tagihan_berulang?: 'otomatis' | 'manual' | 'tertentu';
  bulan_tertentu?: number[];
}

export interface SppGenerateCutoffSetting {
  aktif: boolean;
  cutoff_tanggal: number;
  keterangan: string;
}
