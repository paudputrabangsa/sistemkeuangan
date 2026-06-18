-- =================================================================================
-- SUPABASE SCHEMA FOR PAUD PUTRA BANGSA (Single-Tenant Offline-First System)
-- =================================================================================
-- Run this script in the Supabase SQL Editor.
-- It matches the Dexie IndexedDB schema.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFIL SEKOLAH
CREATE TABLE IF NOT EXISTS profil_sekolah (
  id UUID PRIMARY KEY,
  nama_sekolah TEXT NOT NULL,
  nama_yayasan TEXT,
  bentuk_satuan TEXT,
  izin_operasional TEXT,
  npsn TEXT,
  telepon TEXT,
  website TEXT,
  tahun_berdiri TEXT,
  alamat_jalan TEXT,
  alamat_rt TEXT,
  alamat_rw TEXT,
  alamat_desa TEXT,
  alamat_kecamatan TEXT,
  alamat_kabupaten TEXT,
  alamat_provinsi TEXT,
  alamat_kode_pos TEXT,
  nama_kepsek TEXT,
  logo_url TEXT,
  tanda_tangan_url TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 2. PENGATURAN
CREATE TABLE IF NOT EXISTS pengaturan (
  id UUID PRIMARY KEY,
  kunci TEXT UNIQUE NOT NULL,
  nilai JSONB NOT NULL,
  keterangan TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 3. TAHUN AJARAN
CREATE TABLE IF NOT EXISTS tahun_ajaran (
  id UUID PRIMARY KEY,
  nama TEXT NOT NULL,
  mulai DATE NOT NULL,
  selesai DATE NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT false,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 4. TINGKAT
CREATE TABLE IF NOT EXISTS tingkat (
  id UUID PRIMARY KEY,
  tahun_ajaran_id UUID NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  kode TEXT,
  urutan INTEGER NOT NULL DEFAULT 0,
  tarif_spp NUMERIC NOT NULL DEFAULT 0,
  usia_min_tahun INTEGER,
  usia_max_tahun INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 5. KELAS
CREATE TABLE IF NOT EXISTS kelas (
  id UUID PRIMARY KEY,
  tahun_ajaran_id UUID NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  tingkat_id UUID NOT NULL REFERENCES tingkat(id) ON DELETE CASCADE,
  nama_kelas TEXT NOT NULL,
  tingkat TEXT,
  tarif_spp NUMERIC NOT NULL DEFAULT 0,
  kapasitas_siswa INTEGER,
  usia_min_tahun INTEGER,
  usia_max_tahun INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 6. PENGATURAN PENDAFTARAN TAHUN AJARAN
CREATE TABLE IF NOT EXISTS pengaturan_pendaftaran_tahun_ajaran (
  id UUID PRIMARY KEY,
  tahun_ajaran_id UUID NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  pendaftaran_luar_sistem BOOLEAN,
  biaya_pendaftaran_default NUMERIC NOT NULL DEFAULT 0,
  komponen_biaya JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode_tagihan_biaya TEXT NOT NULL DEFAULT 'gabung',
  opsi_bayar_default TEXT NOT NULL DEFAULT 'full',
  jatuh_tempo_mode TEXT NOT NULL DEFAULT 'tanggal_tetap',
  jatuh_tempo_tanggal DATE,
  jatuh_tempo_hari_setelah_daftar INTEGER,
  cutoff_bulan INTEGER NOT NULL,
  cutoff_tanggal INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 7. SISWA
CREATE TABLE IF NOT EXISTS siswa (
  id UUID PRIMARY KEY,
  nama TEXT NOT NULL,
  tanggal_lahir DATE,
  jenis_kelamin TEXT,
  foto_url TEXT,
  nama_wali TEXT NOT NULL,
  hubungan_wali TEXT,
  kontak_wali TEXT NOT NULL,
  email_wali TEXT,
  alamat TEXT,
  status TEXT NOT NULL,
  flag_diskon_spp BOOLEAN NOT NULL DEFAULT false,
  tipe_diskon_spp TEXT,
  persen_diskon NUMERIC NOT NULL DEFAULT 0,
  nominal_diskon_spp NUMERIC,
  tanggal_daftar DATE NOT NULL,
  jenis_masuk TEXT NOT NULL,
  tahun_ajaran_target_id UUID NOT NULL,
  kelas_rencana_id UUID,
  jalur_registrasi TEXT NOT NULL,
  sumber_data TEXT NOT NULL,
  alasan_keluar TEXT,
  tanggal_keluar DATE,
  kode_import_siswa TEXT,
  no_pendaftaran TEXT,
  nis TEXT,
  daftar_promo JSONB,
  tarif_spp_khusus NUMERIC,
  alasan_tarif_spp_khusus TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 8. SISWA KELAS
CREATE TABLE IF NOT EXISTS siswa_kelas (
  id UUID PRIMARY KEY,
  siswa_id UUID NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
  kelas_id UUID NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
  mulai DATE NOT NULL,
  selesai DATE,
  penempatan_sumber TEXT,
  catatan_penempatan TEXT,
  status_akhir_periode TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 9. TAGIHAN
CREATE TABLE IF NOT EXISTS tagihan (
  id UUID PRIMARY KEY,
  siswa_id UUID NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
  tahun_ajaran_id UUID NOT NULL,
  jenis TEXT NOT NULL,
  nama_tagihan TEXT NOT NULL,
  jumlah_total NUMERIC NOT NULL,
  sudah_dibayar NUMERIC NOT NULL DEFAULT 0,
  jatuh_tempo DATE NOT NULL,
  status TEXT NOT NULL,
  bisa_cicil BOOLEAN NOT NULL DEFAULT true,
  bulan_tahun TEXT,
  created_by UUID NOT NULL,
  no_referensi TEXT,
  potongan_diskon NUMERIC,
  nama_promo TEXT,
  promo_ids JSONB,
  status_daftar_ulang TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 10. PEMBAYARAN
CREATE TABLE IF NOT EXISTS pembayaran (
  id UUID PRIMARY KEY,
  tagihan_id UUID NOT NULL REFERENCES tagihan(id) ON DELETE CASCADE,
  dicatat_oleh UUID NOT NULL,
  jumlah NUMERIC NOT NULL,
  diskon_tambahan NUMERIC,
  metode TEXT NOT NULL,
  tanggal DATE NOT NULL,
  catatan TEXT,
  payment_group_id UUID,
  status_verifikasi TEXT,
  diverifikasi_pada TIMESTAMPTZ,
  diverifikasi_oleh UUID,
  catatan_verifikasi TEXT,
  no_kuitansi TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 11. AUDIT LOG (Optional Sync)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY,
  tabel TEXT NOT NULL,
  record_id UUID NOT NULL,
  aksi TEXT NOT NULL,
  deskripsi TEXT NOT NULL,
  user_id UUID NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);
