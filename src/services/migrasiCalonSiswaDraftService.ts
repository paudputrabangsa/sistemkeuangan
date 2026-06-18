export interface MigrasiCalonRowDraft {
  id: string;
  kode_import_siswa: string;
  nama: string;
  tanggal_lahir: string;
  jenis_kelamin: '' | 'L' | 'P';
  nama_wali: string;
  kontak_wali: string;
  alamat: string;
  tanggal_daftar: string;
  kelas_rencana_id: string;
  nama_promo: string;
}

export interface MigrasiCalonTagihanRowDraft {
  id: string;
  kode_import_tagihan: string;
  siswa_row_id: string;
  jenis_tagihan: string;
  nama_tagihan: string;
  jumlah_total: string;
  jatuh_tempo: string;
  bisa_cicil: boolean;
  nama_promo: string;
  nominal_diskon: string;
}

export interface MigrasiCalonPembayaranRowDraft {
  id: string;
  kode_import_pembayaran: string;
  tagihan_row_id: string;
  siswa_row_id: string;
  tanggal: string;
  jumlah: string;
  metode: string;
  catatan: string;
}

export interface MigrasiCalonSiswaDraft {
  stepIndex: number;
  tahun_ajaran_target_id: string;
  rows: MigrasiCalonRowDraft[];
  tagihanRows: MigrasiCalonTagihanRowDraft[];
  pembayaranRows: MigrasiCalonPembayaranRowDraft[];
}

const DRAFT_KEY = 'migrasi_calon_siswa_draft_v1';

export function createEmptyMigrasiCalonRow(): MigrasiCalonRowDraft {
  return { id: crypto.randomUUID(), kode_import_siswa: '', nama: '', tanggal_lahir: '', jenis_kelamin: '', nama_wali: '', kontak_wali: '', alamat: '', tanggal_daftar: '', kelas_rencana_id: '', nama_promo: '' };
}

export function createEmptyMigrasiCalonPembayaranRow(tagihanRowId = '', siswaRowId = ''): MigrasiCalonPembayaranRowDraft {
  return { id: crypto.randomUUID(), kode_import_pembayaran: '', tagihan_row_id: tagihanRowId, siswa_row_id: siswaRowId, tanggal: '', jumlah: '', metode: '', catatan: '' };
}

export function loadMigrasiCalonSiswaDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MigrasiCalonSiswaDraft;
    return { ...parsed, tagihanRows: parsed.tagihanRows ?? [], pembayaranRows: parsed.pembayaranRows ?? [] };
  } catch {
    return null;
  }
}

export function saveMigrasiCalonSiswaDraft(draft: MigrasiCalonSiswaDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearMigrasiCalonSiswaDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export function summarizeMigrasiCalonSiswaDraft(draft: MigrasiCalonSiswaDraft) {
  return {
    siswa: draft.rows.filter((item) => item.nama.trim()).length,
    tagihan: draft.tagihanRows.length,
    pembayaran: draft.pembayaranRows.length,
    totalTagihan: draft.tagihanRows.reduce((sum, item) => sum + Number(item.jumlah_total || 0), 0),
    totalDiskon: draft.tagihanRows.reduce((sum, item) => sum + Number(item.nominal_diskon || 0), 0),
    totalPembayaran: draft.pembayaranRows.reduce((sum, item) => sum + Number(item.jumlah || 0), 0),
  };
}
