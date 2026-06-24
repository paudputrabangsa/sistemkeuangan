import type { FormatNIS } from '../db/types';

// ===================== Sub-Draft Interfaces =====================

export interface SetupAwalTingkatKelasDraft {
  id: string;
  nama_kelas: string;
  kapasitas_siswa: string;
}

export interface SetupAwalTingkatDraft {
  id: string;
  nama: string;
  kode: string;
  tarif_spp: string;
  usia_min_tahun: string;
  usia_max_tahun: string;
  kelas: SetupAwalTingkatKelasDraft[];
}

export interface SetupAwalKomponenBiayaDraft {
  id: string;
  nama: string;
  nominal: string;
  wajib: boolean;
}

export interface SetupAwalDiskonDraft {
  id: string;
  nama: string;
  aktif: boolean;
  tipe_diskon: 'persen' | 'nominal';
  persen_diskon: string;
  nominal_diskon: string;
  potongan_per_target?: Record<string, {
    tipe_diskon: 'persen' | 'nominal';
    persen_diskon: number;
    nominal_diskon: number;
  }>;
  jenis_tagihan?: string;
  berulang: boolean;
  klaim_mulai: string;
  klaim_selesai: string;
  batas_kali_penggunaan: string;
  kuota: string;
  mulai?: string;
  selesai?: string;
  target_jenis_tagihan: string[];
  target_komponen_biaya?: string[];
  mode_tagihan_berulang?: 'otomatis' | 'manual' | 'tertentu';
  bulan_tertentu?: number[];
}

// ===================== Main Draft Interface =====================

export interface SetupAwalDraft {
  mode: 'sekarang' | 'mendatang';
  profile: {
    nama_sekolah: string;
    nama_yayasan: string;
    bentuk_satuan: string;
    izin_operasional: string;
    npsn: string;
    telepon: string;
    website: string;
    tahun_berdiri: string;
    alamat_jalan: string;
    alamat_rt: string;
    alamat_rw: string;
    alamat_desa: string;
    alamat_kecamatan: string;
    alamat_kabupaten: string;
    alamat_provinsi: string;
    alamat_kode_pos: string;
    nama_kepsek: string;
  };
  year: {
    nama: string;
    mulai: string;
    selesai: string;
  };
  tingkatRows: SetupAwalTingkatDraft[];
  cutoff: {
    bulan: string;
    tanggal: string;
  };
  sppCutoff: {
    aktif: boolean;
    tanggal: string;
  };
  pendaftaranDiLuarSistem: boolean;
  komponenBiaya: SetupAwalKomponenBiayaDraft[];
  modeTagihanBiaya: 'gabung' | 'pisah';
  jatuhTempoPendaftaran: {
    mode: 'tanggal_tetap' | 'hari_setelah_daftar';
    tanggal: string;
    hari: string;
  };
  diskon: SetupAwalDiskonDraft[];
  formatNIS: FormatNIS;
  metodePembayaran: Array<{ id: string; nama: string; aktif: boolean }>;
  jenisTagihan: Array<{ id: string; nama: string; aktif: boolean }>;
  stepIndex: number;
  maxStepReached: number;
}

// ===================== Legacy Draft Interface (for migration) =====================

export interface SetupAwalKelasDraft {
  id: string;
  nama_kelas: string;
  tingkat: string;
  tarif_spp: string;
  kapasitas_siswa: string;
  usia_min_tahun: string;
  usia_max_tahun: string;
}

// ===================== Persistence =====================

const DRAFT_KEY = 'setup_awal_draft_v2';
const LEGACY_DRAFT_KEY = 'setup_awal_draft_v1';

export function loadSetupAwalDraft(): SetupAwalDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw) as SetupAwalDraft;
    // Try legacy draft and clear it
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
    if (legacy) {
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSetupAwalDraft(draft: SetupAwalDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearSetupAwalDraft() {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(LEGACY_DRAFT_KEY);
}
