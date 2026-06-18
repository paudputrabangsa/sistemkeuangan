export interface MigrasiSiswaRowDraft {
  id: string;
  kode_import_siswa: string;
  nis: string;
  nama: string;
  tanggal_lahir: string;
  jenis_kelamin: '' | 'L' | 'P';
  nama_wali: string;
  kontak_wali: string;
  alamat: string;
  status: 'aktif' | 'keluar';
  jenis_masuk: 'awal_tahun' | 'pindahan';
  tanggal_daftar: string;
  kelas_id: string;
  tanggal_keluar: string;
  alasan_keluar: '' | 'pindah_sekolah' | 'berhenti_lainnya';
  tarif_spp_khusus: string;
  alasan_tarif_spp_khusus: string;
  nama_promo: string;
}

export interface MigrasiTagihanRowDraft {
  id: string;
  kode_import_tagihan: string;
  siswa_row_id: string;
  jenis_tagihan: string;
  bulan_tahun: string;
  nama_tagihan: string;
  jumlah_total: string;
  jatuh_tempo: string;
  bisa_cicil: boolean;
  nama_promo: string;
  nominal_diskon: string;
}

export interface MigrasiPembayaranRowDraft {
  id: string;
  kode_import_pembayaran: string;
  tagihan_row_id: string;
  siswa_row_id?: string;
  bulan_tahun?: string;
  tanggal: string;
  jumlah: string;
  metode: string;
  catatan: string;
}

export interface MigrasiSiswaTahunBerjalanDraft {
  stepIndex: number;
  rows: MigrasiSiswaRowDraft[];
  tagihanRows?: MigrasiTagihanRowDraft[];
  pembayaranRows?: MigrasiPembayaranRowDraft[];
}

const DRAFT_KEY = 'migrasi_siswa_tahun_berjalan_draft_v1';

export function createEmptyMigrasiSiswaRow(): MigrasiSiswaRowDraft {
  return {
    id: crypto.randomUUID(),
    kode_import_siswa: '',
    nis: '',
    nama: '',
    tanggal_lahir: '',
    jenis_kelamin: '',
    nama_wali: '',
    kontak_wali: '',
    alamat: '',
    status: 'aktif',
    jenis_masuk: 'awal_tahun',
    tanggal_daftar: '',
    kelas_id: '',
    tanggal_keluar: '',
    alasan_keluar: '',
    tarif_spp_khusus: '',
    alasan_tarif_spp_khusus: '',
    nama_promo: '',
  };
}

export function createEmptyMigrasiTagihanRow(siswaRowId = ''): MigrasiTagihanRowDraft {
  return {
    id: crypto.randomUUID(),
    kode_import_tagihan: '',
    siswa_row_id: siswaRowId,
    jenis_tagihan: '',
    bulan_tahun: '',
    nama_tagihan: '',
    jumlah_total: '',
    jatuh_tempo: '',
    bisa_cicil: true,
    nama_promo: '',
    nominal_diskon: '',
  };
}

export function createEmptyMigrasiPembayaranRow(tagihanRowId = ''): MigrasiPembayaranRowDraft {
  return {
    id: crypto.randomUUID(),
    kode_import_pembayaran: '',
    tagihan_row_id: tagihanRowId,
    tanggal: '',
    jumlah: '',
    metode: '',
    catatan: '',
  };
}

export function loadMigrasiSiswaTahunBerjalanDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MigrasiSiswaTahunBerjalanDraft;
    return { ...parsed, tagihanRows: parsed.tagihanRows ?? [], pembayaranRows: parsed.pembayaranRows ?? [] };
  } catch {
    return null;
  }
}

export function saveMigrasiSiswaTahunBerjalanDraft(draft: MigrasiSiswaTahunBerjalanDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearMigrasiSiswaTahunBerjalanDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export function summarizeMigrasiSiswaTahunBerjalanDraft(draft: MigrasiSiswaTahunBerjalanDraft) {
  const tagihanRows = draft.tagihanRows ?? [];
  const pembayaranRows = draft.pembayaranRows ?? [];
  return {
    siswa: draft.rows.filter((item) => item.nama.trim()).length,
    tagihan: tagihanRows.length,
    pembayaran: pembayaranRows.length,
    totalTagihan: tagihanRows.reduce((sum, item) => sum + Number(item.jumlah_total || 0), 0),
    totalDiskon: tagihanRows.reduce((sum, item) => sum + Number(item.nominal_diskon || 0), 0),
    totalPembayaran: pembayaranRows.reduce((sum, item) => sum + Number(item.jumlah || 0), 0),
  };
}
