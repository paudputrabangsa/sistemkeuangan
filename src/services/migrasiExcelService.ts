import ExcelJS from 'exceljs';
import { db } from '../db';
import type { Kelas } from '../db/types';
import type { MigrasiCalonSiswaDraft, MigrasiCalonTagihanRowDraft } from './migrasiCalonSiswaDraftService';
import type { MigrasiSiswaTahunBerjalanDraft } from './migrasiSiswaTahunBerjalanDraftService';
import { getPengaturanNilaiByKunci, type SettingListValue } from './pengaturanRepository';

export interface MigrasiExcelError {
  sheet: string;
  row: number;
  column: string;
  message: string;
}

export interface MigrasiExcelParseResult<TDraft> {
  draft: TDraft;
  errors: MigrasiExcelError[];
  summary: {
    siswa: number;
    tagihan: number;
    pembayaran: number;
    totalTagihan: number;
    totalDiskon: number;
    totalPembayaran: number;
  };
}

type RawRow = Record<string, unknown> & { __rowNum__?: number };

const calonSheets = ['calon_siswa', 'tagihan_pendaftaran', 'pembayaran_pendaftaran'];
const siswaSheets = ['siswa', 'tagihan', 'pembayaran'];

function hasSheets(workbook: ExcelJS.Workbook, sheets: string[]) {
  return sheets.every((sheet) => Boolean(workbook.getWorksheet(sheet)));
}

function emptySummary() {
  return { siswa: 0, tagihan: 0, pembayaran: 0, totalTagihan: 0, totalDiskon: 0, totalPembayaran: 0 };
}

function emptyCalonDraft(tahunAjaranTargetId: string): MigrasiCalonSiswaDraft {
  return { stepIndex: 2, tahun_ajaran_target_id: tahunAjaranTargetId, rows: [], tagihanRows: [], pembayaranRows: [] };
}

function emptySiswaDraft(): MigrasiSiswaTahunBerjalanDraft {
  return { stepIndex: 2, rows: [], tagihanRows: [], pembayaranRows: [] };
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    if ('result' in value) {
      const res = (value as any).result;
      if (res && typeof res === 'object' && 'error' in res) return '';
      return String(res ?? '').trim();
    }
    if ('text' in value) {
      return String((value as any).text ?? '').trim();
    }
    if ('formula' in value || 'sharedFormula' in value) {
      return '';
    }
    return ''; // Treat any other unknown ExcelJS object as empty string
  }
  return String(value).trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeNumber(value: unknown) {
  let val = value;
  if (value && typeof value === 'object') {
    if ('result' in value) {
      val = (value as any).result;
      if (val && typeof val === 'object' && 'error' in val) {
        return '0'; // Treat formula errors as 0
      }
    } else if ('text' in value) {
      val = (value as any).text;
    } else if ('formula' in value || 'sharedFormula' in value) {
      val = '';
    } else if (!(value instanceof Date)) {
      val = '';
    }
  }
  let raw = normalizeText(val).replace(/\./g, '').replace(/,/g, '.');
  if (raw === '-' || raw === 'NaN' || raw === 'null' || raw === 'undefined' || raw === '') return '';
  return raw;
}

function parseBoolean(value: unknown) {
  const raw = normalizeKey(value);
  if (!raw) return false;
  if (['true', '1', 'ya', 'y', 'yes'].includes(raw)) return true;
  if (['false', '0', 'tidak', 'n', 'no'].includes(raw)) return false;
  return null;
}

function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof value === 'number') {
    // exceljs typically converts dates to JS Date, but if it remains a number, we try to convert it
    // Using a simplistic epoch conversion just in case, though ExcelJS usually handles it
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    if (!Number.isNaN(date.getTime())) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  const raw = normalizeText(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw)) return raw.substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashDate = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (slashDate) {
    const day = Number(slashDate[1]);
    const month = Number(slashDate[2]);
    const rawYear = Number(slashDate[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return raw;
}

function normalizeBulanTahun(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    if (!Number.isNaN(date.getTime())) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      return `${yyyy}-${mm}`;
    }
  }
  const raw = normalizeText(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw)) return raw.substring(0, 7);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.substring(0, 7);
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const slashDate = raw.match(/^(\d{1,2})[\/-](\d{4})$/);
  if (slashDate) {
    return `${slashDate[2]}-${String(slashDate[1]).padStart(2, '0')}`;
  }
  return raw;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function dateError(sheet: string, row: number, column: string, value: unknown, label: string): MigrasiExcelError {
  const norm = normalizeDate(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
    return { sheet, row, column, message: `${label} tidak valid. Tanggal tersebut tidak ada di kalender (misal: 31 Juni). Nilai terbaca: "${norm}".` };
  }
  return { sheet, row, column, message: `Format ${label} salah. Gunakan format YYYY-MM-DD atau tanggal Excel. Nilai terbaca: "${normalizeText(value)}".` };
}

function isBlankRow(row: RawRow) {
  return Object.entries(row)
    .filter(([key]) => key !== '__rowNum__' && !key.startsWith('kode_import_'))
    .every(([, value]) => normalizeText(value) === '');
}

function readRows(workbook: ExcelJS.Workbook, sheetName: string, errors: MigrasiExcelError[]) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    errors.push({ sheet: sheetName, row: 0, column: '-', message: `Sheet ${sheetName} wajib ada.` });
    return [];
  }
  const rows: RawRow[] = [];
  const headers: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.text;
      });
    } else {
      const rowData: RawRow = { __rowNum__: rowNumber - 1 };
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (headers[colNumber]) {
          let val = cell.value;
          if (val && typeof val === 'object' && !(val instanceof Date)) {
            if ('richText' in val && Array.isArray((val as any).richText)) {
              val = (val as any).richText.map((t: any) => t.text).join('');
            } else if ('text' in val) {
              val = (val as any).text;
            } else if (('formula' in val || 'sharedFormula' in val) && 'result' in val) {
              val = (val as any).result;
            } else if ('error' in val) {
              val = (val as any).error;
            } else if ('hyperlink' in val && 'text' in val) {
              val = (val as any).text;
            } else {
              try { val = JSON.stringify(val); } catch { val = String(val); }
            }
          }
          rowData[headers[colNumber]] = val;
        }
      });
      if (!isBlankRow(rowData)) {
        rows.push(rowData);
      }
    }
  });
  return rows;
}

function rowNumber(row: RawRow, index: number) {
  return row.__rowNum__ ? row.__rowNum__ + 1 : index + 2;
}

function addDuplicateError(errors: MigrasiExcelError[], sheet: string, row: number, column: string, value: string) {
  errors.push({ sheet, row, column, message: `Nilai duplikat: ${value}.` });
}

function assertUnique(errors: MigrasiExcelError[], seen: Set<string>, sheet: string, row: number, column: string, value: string) {
  const key = value.toLowerCase();
  if (seen.has(key)) {
    addDuplicateError(errors, sheet, row, column, value);
    return false;
  }
  seen.add(key);
  return true;
}

function findClassIdByTingkat(classes: Kelas[], tingkat: string) {
  const key = normalizeKey(tingkat);
  if (!key) return '';
  const matches = classes
    .filter((kelas) => !kelas.deleted_at && normalizeKey(kelas.tingkat) === key)
    .sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas));
  return matches[0]?.id ?? '';
}

function findClassIdByTingkatAndName(classes: Kelas[], tingkat: string, namaKelas: string) {
  const tingkatKey = normalizeKey(tingkat);
  const kelasKey = normalizeKey(namaKelas);
  if (!tingkatKey || !kelasKey) return '';
  return classes.find((kelas) => !kelas.deleted_at && normalizeKey(kelas.tingkat) === tingkatKey && normalizeKey(kelas.nama_kelas) === kelasKey)?.id ?? '';
}

async function downloadExcelTemplate(sheets: Record<string, Array<Record<string, unknown>>>, filename: string) {
  const workbook = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const worksheet = workbook.addWorksheet(name);
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      worksheet.columns = keys.map((k) => ({ header: k, key: k }));
      worksheet.addRows(rows);
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadTemplateMigrasiCalonSiswa() {
  const metodePembayaran = await getPengaturanNilaiByKunci<SettingListValue[]>('metode_pembayaran');
  const jenisTagihan = await getPengaturanNilaiByKunci<SettingListValue[]>('jenis_tagihan');
  const diskonItems = await getPengaturanNilaiByKunci<any[]>('diskon');

  const metodeAktif = (Array.isArray(metodePembayaran) ? metodePembayaran : []).filter(item => item.aktif !== false).map(item => item.nama).join(', ');
  const jenisAktif = (Array.isArray(jenisTagihan) ? jenisTagihan : []).filter(item => item.aktif !== false).map(item => item.nama).join(', ');
  const promoAktif = (Array.isArray(diskonItems) ? diskonItems : []).filter(item => item.aktif !== false).map(item => item.nama).join(', ');

  await downloadExcelTemplate({
    petunjuk: [{ instruksi: 'Isi sheet calon_siswa. kode_import_siswa wajib unik. Tagihan mengacu ke kode_import_siswa. Setiap calon siswa wajib memiliki minimal 1 tagihan. Kolom jenis_tagihan wajib sama dengan Pengaturan Jenis Tagihan di sistem.' }],
    calon_siswa: [
      { kode_import_siswa: 'C001', nama_siswa: 'Nama Anak', tanggal_lahir: '2021-01-15', jenis_kelamin: 'L', nama_wali: 'Nama Wali', kontak_wali: '081234567890', alamat: 'Alamat', tanggal_daftar: '2026-06-01', tingkat: 'TK A', nama_promo: 'Promo Spesial, Early Bird' }
    ],
    tagihan_pendaftaran: [
      { kode_import_tagihan: 'T001', kode_import_siswa: 'C001', jenis_tagihan: 'Pendaftaran', nama_tagihan: 'Uang Pangkal', jumlah_tagihan: 500000, nama_promo: '', nominal_diskon: '', jatuh_tempo: '2026-06-30', bisa_cicil: 'ya' }
    ],
    pembayaran_pendaftaran: [
      { kode_import_pembayaran: 'P001', kode_import_tagihan: 'T001', kode_import_siswa: 'C001', tanggal_pembayaran: '2026-06-05', jumlah: 250000, metode_pembayaran: 'Tunai', catatan: '' }
    ],
    referensi: [{
      jenis_kelamin: 'L/P',
      bisa_cicil: 'ya/tidak',
      tanggal: 'YYYY-MM-DD',
      jenis_tagihan_aktif: jenisAktif || 'Tidak ada',
      metode_pembayaran_aktif: metodeAktif || 'Tidak ada',
      promo_aktif: promoAktif || 'Tidak ada'
    }],
  }, 'template_migrasi_calon_siswa.xlsx');
}

export async function downloadTemplateMigrasiSiswaTahunBerjalan() {
  const metodePembayaran = await getPengaturanNilaiByKunci<SettingListValue[]>('metode_pembayaran');
  const jenisTagihan = await getPengaturanNilaiByKunci<SettingListValue[]>('jenis_tagihan');
  const diskonItems = await getPengaturanNilaiByKunci<any[]>('diskon');
  const kelasItems = await db.kelas.toArray();

  const metodeAktif = (Array.isArray(metodePembayaran) ? metodePembayaran : []).filter(item => item.aktif !== false).map(item => item.nama).join(', ');
  const jenisAktif = (Array.isArray(jenisTagihan) ? jenisTagihan : []).filter(item => item.aktif !== false).map(item => item.nama).join(', ');
  const promoAktif = (Array.isArray(diskonItems) ? diskonItems : []).filter(item => item.aktif !== false).map(item => item.nama).join(', ');
  const kelasAktif = kelasItems.filter(item => !item.deleted_at).map(item => `${item.tingkat || '-'}/${item.nama_kelas}`).join(', ');

  await downloadExcelTemplate({
    petunjuk: [{ instruksi: 'Isi baris yang disediakan. SPP bulan depan dibuat otomatis. Tunggakan SPP lama dicatat di sheet tagihan dengan jenis_tagihan = spp dan bulan_tahun diisi. Kolom jenis_tagihan wajib sama dengan di sistem.' }],
    siswa: [
      { kode_import_siswa: 'S001', nis: '10101', nama_siswa: 'Nama Anak', tanggal_lahir: '2020-01-15', jenis_kelamin: 'P', nama_wali: 'Nama Wali', kontak_wali: '081234567890', alamat: 'Alamat', status: 'aktif', jenis_masuk: 'awal_tahun', tanggal_daftar: '2025-07-01', tingkat: 'TK A', kelas: 'A1', tanggal_keluar: '', alasan_keluar: '', tarif_spp_khusus: '', alasan_tarif_spp_khusus: '', nama_promo: 'Promo Spesial, Early Bird' }
    ],
    tagihan: [
      { kode_import_tagihan: 'T001', kode_import_siswa: 'S001', jenis_tagihan: 'spp', bulan_tahun: '2025-07', nama_tagihan: 'Tunggakan SPP Juli 2025', jumlah_total: 200000, nama_promo: '', nominal_diskon: '', jatuh_tempo: '2025-07-10', bisa_cicil: 'ya' },
      { kode_import_tagihan: 'T002', kode_import_siswa: 'S001', jenis_tagihan: 'kegiatan', bulan_tahun: '', nama_tagihan: 'Kegiatan Lama', jumlah_total: 300000, nama_promo: '', nominal_diskon: '', jatuh_tempo: '2025-08-10', bisa_cicil: 'ya' }
    ],
    pembayaran: [
      { kode_import_pembayaran: 'P001', kode_import_tagihan: 'T002', tanggal_pembayaran: '2025-08-15', jumlah: 100000, metode_pembayaran: 'Tunai', catatan: 'Contoh bayar tagihan kegiatan' },
      { kode_import_pembayaran: 'P002', kode_import_tagihan: 'T001', tanggal_pembayaran: '2025-07-15', jumlah: 200000, metode_pembayaran: 'Transfer', catatan: 'Contoh bayar tunggakan SPP' }
    ],
    referensi: [{
      status: 'aktif/keluar',
      jenis_masuk: 'awal_tahun/pindahan',
      alasan_keluar: 'pindah_sekolah/berhenti_lainnya',
      jenis_tagihan_aktif: jenisAktif || 'Tidak ada',
      metode_pembayaran_aktif: metodeAktif || 'Tidak ada',
      promo_aktif: promoAktif || 'Tidak ada',
      kelas_aktif: kelasAktif || 'Tidak ada'
    }],
  }, 'template_migrasi_siswa_tahun_berjalan.xlsx');
}

async function workbookFromFile(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function validateWorkbookExtension(file: File, errors: MigrasiExcelError[]) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    errors.push({ sheet: '-', row: 0, column: 'file', message: 'File wajib berformat .xlsx.' });
  }
}

export async function parseMigrasiCalonSiswaExcel(file: File, tahunAjaranTargetId: string): Promise<MigrasiExcelParseResult<MigrasiCalonSiswaDraft>> {
  const errors: MigrasiExcelError[] = [];
  validateWorkbookExtension(file, errors);
  const workbook = await workbookFromFile(file);
  if (!hasSheets(workbook, calonSheets) && hasSheets(workbook, siswaSheets)) {
    return {
      draft: emptyCalonDraft(tahunAjaranTargetId),
      errors: [{ sheet: '-', row: 0, column: 'file', message: 'File ini adalah template Migrasi Siswa Tahun Berjalan. Upload file ini di menu Migrasi Siswa Tahun Berjalan, atau download template Migrasi Calon Siswa.' }],
      summary: emptySummary(),
    };
  }
  for (const sheet of calonSheets) if (!workbook.getWorksheet(sheet)) errors.push({ sheet, row: 0, column: '-', message: `Sheet ${sheet} wajib ada.` });
  if (!hasSheets(workbook, calonSheets)) return { draft: emptyCalonDraft(tahunAjaranTargetId), errors, summary: emptySummary() };
  const siswaRows = readRows(workbook, 'calon_siswa', errors);
  const tagihanRowsRaw = readRows(workbook, 'tagihan_pendaftaran', errors);
  const pembayaranRowsRaw = readRows(workbook, 'pembayaran_pendaftaran', errors);
  const classes = await db.kelas.where('tahun_ajaran_id').equals(tahunAjaranTargetId).toArray();
  const metodePembayaran = await getPengaturanNilaiByKunci<SettingListValue[]>('metode_pembayaran');
  const metodeAktif = new Set((Array.isArray(metodePembayaran) ? metodePembayaran : []).filter((item) => item.aktif !== false).map((item) => normalizeKey(item.nama)));
  const jenisTagihanItems = await getPengaturanNilaiByKunci<SettingListValue[]>('jenis_tagihan');
  const jenisTagihanAktif = new Set((Array.isArray(jenisTagihanItems) ? jenisTagihanItems : []).filter((item) => item.aktif !== false).map((item) => normalizeKey(item.nama)));
  const diskonItems = await getPengaturanNilaiByKunci<any[]>('diskon');
  const diskonNames = new Set((Array.isArray(diskonItems) ? diskonItems : []).filter((item) => item.aktif !== false).map((item) => normalizeKey(item.nama)));
  const existingStudents = await db.siswa.toArray();
  const seenKode = new Set<string>();
  const seenNatural = new Set<string>();
  const siswaByKode = new Map<string, string>();
  const rows = siswaRows.map((raw, index) => {
    const row = rowNumber(raw, index);
    const kode = normalizeText(raw.kode_import_siswa);
    const nama = normalizeText(raw.nama_siswa);
    const tanggalLahir = normalizeDate(raw.tanggal_lahir);
    const namaWali = normalizeText(raw.nama_wali);
    if (!kode) errors.push({ sheet: 'calon_siswa', row, column: 'kode_import_siswa', message: 'Kode import siswa wajib diisi.' }); else assertUnique(errors, seenKode, 'calon_siswa', row, 'kode_import_siswa', kode);
    if (!nama) errors.push({ sheet: 'calon_siswa', row, column: 'nama_siswa', message: 'Nama siswa wajib diisi.' });
    if (!tanggalLahir || !isValidDate(tanggalLahir)) errors.push(dateError('calon_siswa', row, 'tanggal_lahir', raw.tanggal_lahir, 'Tanggal lahir'));
    if (!namaWali) errors.push({ sheet: 'calon_siswa', row, column: 'nama_wali', message: 'Nama wali wajib diisi.' });
    const tanggalDaftar = normalizeDate(raw.tanggal_daftar);
    if (!tanggalDaftar || !isValidDate(tanggalDaftar)) errors.push(dateError('calon_siswa', row, 'tanggal_daftar', raw.tanggal_daftar, 'Tanggal daftar'));
    const natural = `${normalizeKey(nama)}|${tanggalLahir}|${normalizeKey(namaWali)}|${tahunAjaranTargetId}`;
    if (seenNatural.has(natural)) errors.push({ sheet: 'calon_siswa', row, column: 'nama_siswa', message: 'Duplikat natural key siswa dalam file.' });
    seenNatural.add(natural);
    if (existingStudents.some((item) => !item.deleted_at && normalizeKey(item.nama) === normalizeKey(nama) && normalizeKey(item.nama_wali) === normalizeKey(namaWali) && (item.tanggal_lahir ?? '') === tanggalLahir && item.tahun_ajaran_target_id === tahunAjaranTargetId)) {
      errors.push({ sheet: 'calon_siswa', row, column: 'nama_siswa', message: 'Siswa sudah ada di database lokal.' });
    }
    const tingkat = normalizeText(raw.tingkat);
    const kelasId = findClassIdByTingkat(classes, tingkat);
    if (tingkat && !kelasId) errors.push({ sheet: 'calon_siswa', row, column: 'tingkat', message: 'Tingkat tidak ditemukan pada kelas tahun ajaran target.' });
    const id = crypto.randomUUID();
    siswaByKode.set(normalizeKey(kode), id);
    const rawNamaPromo = normalizeText(raw.nama_promo);
    const promoList = rawNamaPromo ? rawNamaPromo.split(',').map(p => p.trim()).filter(Boolean) : [];
    for (const promo of promoList) {
      if (!diskonNames.has(normalizeKey(promo))) errors.push({ sheet: 'calon_siswa', row, column: 'nama_promo', message: `Promo '${promo}' tidak aktif atau tidak ditemukan di sistem.` });
    }
    const namaPromo = promoList.join(', ');
    return { id, kode_import_siswa: kode, nama, tanggal_lahir: tanggalLahir, jenis_kelamin: normalizeText(raw.jenis_kelamin) as '' | 'L' | 'P', nama_wali: namaWali, kontak_wali: normalizeText(raw.kontak_wali).replace(/\D/g, ''), alamat: normalizeText(raw.alamat), tanggal_daftar: tanggalDaftar, kelas_rencana_id: kelasId, nama_promo: namaPromo };
  });
  const tagihanRows: MigrasiCalonTagihanRowDraft[] = [];
  const tagihanBySiswaRow = new Set<string>();
  const seenTagihan = new Set<string>();
  const tagihanByKode = new Map<string, string>();
  for (const [index, raw] of tagihanRowsRaw.entries()) {
    const row = rowNumber(raw, index);
    const kodeTagihan = normalizeText(raw.kode_import_tagihan);
    if (kodeTagihan) assertUnique(errors, seenTagihan, 'tagihan_pendaftaran', row, 'kode_import_tagihan', kodeTagihan);
    const kode = normalizeKey(raw.kode_import_siswa);
    const siswaRowId = siswaByKode.get(kode) ?? '';
    if (!siswaRowId) errors.push({ sheet: 'tagihan_pendaftaran', row, column: 'kode_import_siswa', message: 'Kode siswa tidak ditemukan di sheet calon_siswa.' });
    tagihanBySiswaRow.add(siswaRowId);
    const jumlah = normalizeNumber(raw.jumlah_tagihan);
    if (!jumlah || Number(jumlah) < 0 || !Number.isFinite(Number(jumlah))) errors.push({ sheet: 'tagihan_pendaftaran', row, column: 'jumlah_tagihan', message: 'Jumlah tagihan wajib angka nol atau lebih.' });
    const jatuhTempo = normalizeDate(raw.jatuh_tempo);
    if (!jatuhTempo || !isValidDate(jatuhTempo)) errors.push(dateError('tagihan_pendaftaran', row, 'jatuh_tempo', raw.jatuh_tempo, 'Jatuh tempo'));
    const bisaCicil = parseBoolean(raw.bisa_cicil);
    if (bisaCicil === null) errors.push({ sheet: 'tagihan_pendaftaran', row, column: 'bisa_cicil', message: 'Bisa cicil harus ya/tidak atau true/false.' });
    const jenisTagihan = normalizeText(raw.jenis_tagihan);
    if (!jenisTagihan) errors.push({ sheet: 'tagihan_pendaftaran', row, column: 'jenis_tagihan', message: 'Jenis tagihan wajib diisi.' });
    else if (!jenisTagihanAktif.has(normalizeKey(jenisTagihan))) errors.push({ sheet: 'tagihan_pendaftaran', row, column: 'jenis_tagihan', message: `Jenis tagihan '${jenisTagihan}' tidak ditemukan atau tidak aktif di sistem.` });
    const nominalDiskon = normalizeNumber(raw.nominal_diskon);
    if (nominalDiskon && !Number.isFinite(Number(nominalDiskon))) errors.push({ sheet: 'tagihan_pendaftaran', row, column: 'nominal_diskon', message: 'Nominal diskon wajib berupa angka valid.' });
    else if (Number(nominalDiskon || 0) > Number(jumlah || 0)) errors.push({ sheet: 'tagihan_pendaftaran', row, column: 'nominal_diskon', message: 'Nominal diskon tidak boleh melebihi jumlah tagihan.' });
    const id = crypto.randomUUID();
    if (kodeTagihan) tagihanByKode.set(normalizeKey(kodeTagihan), id);
    tagihanRows.push({ id, kode_import_tagihan: kodeTagihan, siswa_row_id: siswaRowId, jenis_tagihan: jenisTagihan, nama_tagihan: normalizeText(raw.nama_tagihan) || 'Uang Pangkal', jumlah_total: jumlah, jatuh_tempo: jatuhTempo, bisa_cicil: Boolean(bisaCicil), nama_promo: normalizeText(raw.nama_promo), nominal_diskon: nominalDiskon });
  }
  for (const siswa of rows) {
    if (!tagihanBySiswaRow.has(siswa.id)) {
      errors.push({ sheet: 'tagihan_pendaftaran', row: 0, column: '-', message: `Setiap calon siswa wajib memiliki minimal 1 tagihan. Siswa dengan kode ${siswa.kode_import_siswa} tidak memiliki tagihan.` });
    }
  }
  const pembayaranSiswaMap = new Map<string, string>(); // kode_pembayaran -> siswa_row_id
  const pembayaranRows = pembayaranRowsRaw.map((raw, index) => {
    const row = rowNumber(raw, index);
    const kodePembayaran = normalizeText(raw.kode_import_pembayaran);
    const siswaRowId = siswaByKode.get(normalizeKey(raw.kode_import_siswa)) ?? '';
    if (!siswaRowId) errors.push({ sheet: 'pembayaran_pendaftaran', row, column: 'kode_import_siswa', message: 'Kode siswa tidak ditemukan.' });
    const kodeTagihan = normalizeKey(raw.kode_import_tagihan);
    const tagihanRowId = kodeTagihan ? tagihanByKode.get(kodeTagihan) ?? '' : '';
    if (kodeTagihan && !tagihanRowId) errors.push({ sheet: 'pembayaran_pendaftaran', row, column: 'kode_import_tagihan', message: 'Kode tagihan tidak ditemukan.' });
    const tanggal = normalizeDate(raw.tanggal_pembayaran);
    if (!tanggal || !isValidDate(tanggal)) errors.push(dateError('pembayaran_pendaftaran', row, 'tanggal_pembayaran', raw.tanggal_pembayaran, 'Tanggal pembayaran'));
    const jumlah = normalizeNumber(raw.jumlah);
    if (!jumlah || Number(jumlah) <= 0 || !Number.isFinite(Number(jumlah))) errors.push({ sheet: 'pembayaran_pendaftaran', row, column: 'jumlah', message: 'Jumlah pembayaran wajib lebih dari nol.' });
    const metode = normalizeText(raw.metode_pembayaran);
    if (!metodeAktif.has(normalizeKey(metode))) errors.push({ sheet: 'pembayaran_pendaftaran', row, column: 'metode_pembayaran', message: 'Metode pembayaran tidak aktif atau tidak ditemukan.' });
    
    if (kodePembayaran && siswaRowId) {
      const existingSiswa = pembayaranSiswaMap.get(normalizeKey(kodePembayaran));
      if (existingSiswa && existingSiswa !== siswaRowId) {
        errors.push({ sheet: 'pembayaran_pendaftaran', row, column: 'kode_import_pembayaran', message: 'Kode pembayaran yang sama tidak boleh digunakan untuk tagihan dari siswa yang berbeda.' });
      } else {
        pembayaranSiswaMap.set(normalizeKey(kodePembayaran), siswaRowId);
      }
    }
    
    return { id: crypto.randomUUID(), kode_import_pembayaran: kodePembayaran, tagihan_row_id: tagihanRowId, siswa_row_id: siswaRowId, tanggal, jumlah, metode, catatan: normalizeText(raw.catatan) };
  });
  validatePaymentTotalsCalon(tagihanRows, pembayaranRows, errors);
  const summary = summarize(tagihanRows.map((item) => item.jumlah_total), tagihanRows.map((item) => item.nominal_diskon), pembayaranRows.map((item) => item.jumlah), rows.length);
  return { draft: { stepIndex: 2, tahun_ajaran_target_id: tahunAjaranTargetId, rows, tagihanRows, pembayaranRows }, errors, summary };
}

function validatePaymentTotalsCalon(tagihanRows: MigrasiCalonTagihanRowDraft[], pembayaranRows: Array<{ tagihan_row_id: string; siswa_row_id: string; jumlah: string }>, errors: MigrasiExcelError[]) {
  for (const tagihan of tagihanRows) {
    const totalPaid = pembayaranRows.filter((item) => (tagihan.id && item.tagihan_row_id === tagihan.id) || (!tagihan.id && item.siswa_row_id === tagihan.siswa_row_id)).reduce((sum, item) => sum + Number(item.jumlah || 0), 0);
    const netTagihan = Math.max(0, Number(tagihan.jumlah_total || 0) - Number(tagihan.nominal_diskon || 0));
    if (totalPaid > netTagihan) {
      errors.push({ sheet: 'pembayaran_pendaftaran', row: 0, column: '-', message: `Total pembayaran calon melebihi tagihan pendaftaran. (Kode Tagihan: ${tagihan.kode_import_tagihan || 'Auto'}, Tagihan Bersih: Rp${netTagihan.toLocaleString('id-ID')}, Total Dibayar: Rp${totalPaid.toLocaleString('id-ID')})` });
    }
  }
}

function summarize(tagihanValues: string[], diskonValues: string[], pembayaranValues: string[], siswaCount: number) {
  return { siswa: siswaCount, tagihan: tagihanValues.length, pembayaran: pembayaranValues.length, totalTagihan: tagihanValues.reduce((sum, value) => sum + Number(value || 0), 0), totalDiskon: diskonValues.reduce((sum, value) => sum + Number(value || 0), 0), totalPembayaran: pembayaranValues.reduce((sum, value) => sum + Number(value || 0), 0) };
}





export async function parseMigrasiSiswaTahunBerjalanExcel(file: File): Promise<MigrasiExcelParseResult<MigrasiSiswaTahunBerjalanDraft>> {
  const errors: MigrasiExcelError[] = [];
  validateWorkbookExtension(file, errors);
  const workbook = await workbookFromFile(file);
  if (!hasSheets(workbook, siswaSheets) && hasSheets(workbook, calonSheets)) {
    return {
      draft: emptySiswaDraft(),
      errors: [{ sheet: '-', row: 0, column: 'file', message: 'File ini adalah template Migrasi Calon Siswa. Upload file ini di menu Migrasi Calon Siswa, atau download template Migrasi Siswa Tahun Berjalan.' }],
      summary: emptySummary(),
    };
  }
  for (const sheet of siswaSheets) if (!workbook.getWorksheet(sheet)) errors.push({ sheet, row: 0, column: '-', message: `Sheet ${sheet} wajib ada.` });
  if (!hasSheets(workbook, siswaSheets)) return { draft: emptySiswaDraft(), errors, summary: emptySummary() };
  const siswaRaw = readRows(workbook, 'siswa', errors);
  const tagihanRaw = readRows(workbook, 'tagihan', errors);
  const pembayaranRaw = readRows(workbook, 'pembayaran', errors);
  const years = await db.tahun_ajaran.toArray();
  const activeYear = years.find((item) => !item.deleted_at && (item.aktif || item.status === 'aktif')) ?? null;
  const classes = activeYear ? await db.kelas.where('tahun_ajaran_id').equals(activeYear.id).toArray() : [];
  const metodePembayaran = await getPengaturanNilaiByKunci<SettingListValue[]>('metode_pembayaran');
  const metodeAktif = new Set((Array.isArray(metodePembayaran) ? metodePembayaran : []).filter((item) => item.aktif !== false).map((item) => normalizeKey(item.nama)));
  const jenisTagihanItems = await getPengaturanNilaiByKunci<SettingListValue[]>('jenis_tagihan');
  const jenisTagihanAktif = new Set((Array.isArray(jenisTagihanItems) ? jenisTagihanItems : []).filter((item) => item.aktif !== false).map((item) => normalizeKey(item.nama)));
  const diskonItems = await getPengaturanNilaiByKunci<any[]>('diskon');
  const diskonNames = new Set((Array.isArray(diskonItems) ? diskonItems : []).filter((item) => item.aktif !== false).map((item) => normalizeKey(item.nama)));
  const existingStudents = await db.siswa.toArray();
  const seenSiswa = new Set<string>();
  const seenNatural = new Set<string>();
  const siswaByKode = new Map<string, string>();
  const rows = siswaRaw.map((raw, index) => {
    const row = rowNumber(raw, index);
    const kode = normalizeText(raw.kode_import_siswa);
    const nama = normalizeText(raw.nama_siswa);
    const tanggalLahir = normalizeDate(raw.tanggal_lahir);
    const namaWali = normalizeText(raw.nama_wali);
    if (!kode) errors.push({ sheet: 'siswa', row, column: 'kode_import_siswa', message: 'Kode import siswa wajib diisi.' }); else assertUnique(errors, seenSiswa, 'siswa', row, 'kode_import_siswa', kode);
    if (!nama) errors.push({ sheet: 'siswa', row, column: 'nama_siswa', message: 'Nama siswa wajib diisi.' });
    if (tanggalLahir && !isValidDate(tanggalLahir)) errors.push(dateError('siswa', row, 'tanggal_lahir', raw.tanggal_lahir, 'Tanggal lahir'));
    if (!namaWali) errors.push({ sheet: 'siswa', row, column: 'nama_wali', message: 'Nama wali wajib diisi.' });
    const status = normalizeKey(raw.status) as 'aktif' | 'keluar';
    if (status !== 'aktif' && status !== 'keluar') errors.push({ sheet: 'siswa', row, column: 'status', message: 'Status harus aktif atau keluar.' });
    const jenisMasuk = normalizeKey(raw.jenis_masuk) as 'awal_tahun' | 'pindahan';
    if (jenisMasuk !== 'awal_tahun' && jenisMasuk !== 'pindahan') errors.push({ sheet: 'siswa', row, column: 'jenis_masuk', message: 'Jenis masuk harus awal_tahun atau pindahan.' });
    const tanggalDaftar = normalizeDate(raw.tanggal_daftar);
    if (!tanggalDaftar || !isValidDate(tanggalDaftar)) errors.push(dateError('siswa', row, 'tanggal_daftar', raw.tanggal_daftar, 'Tanggal daftar'));
    const kelasId = findClassIdByTingkatAndName(classes, normalizeText(raw.tingkat), normalizeText(raw.kelas));
    if (!kelasId) errors.push({ sheet: 'siswa', row, column: 'tingkat/kelas', message: 'Kombinasi tingkat dan kelas tidak ditemukan pada tahun ajaran aktif.' });
    const tanggalKeluar = normalizeDate(raw.tanggal_keluar);
    const alasanKeluar = normalizeKey(raw.alasan_keluar) as '' | 'pindah_sekolah' | 'berhenti_lainnya';
    if (status === 'keluar' && (!tanggalKeluar || !isValidDate(tanggalKeluar))) errors.push(dateError('siswa', row, 'tanggal_keluar', raw.tanggal_keluar, 'Tanggal keluar'));
    if (status === 'keluar' && alasanKeluar !== 'pindah_sekolah' && alasanKeluar !== 'berhenti_lainnya') errors.push({ sheet: 'siswa', row, column: 'alasan_keluar', message: 'Alasan keluar wajib pindah_sekolah atau berhenti_lainnya.' });
    const natural = `${normalizeKey(nama)}|${tanggalLahir}|${normalizeKey(namaWali)}|${activeYear?.id ?? ''}`;
    if (seenNatural.has(natural)) errors.push({ sheet: 'siswa', row, column: 'nama_siswa', message: 'Duplikat natural key siswa dalam file.' });
    seenNatural.add(natural);
    if (existingStudents.some((item) => !item.deleted_at && normalizeKey(item.nama) === normalizeKey(nama) && normalizeKey(item.nama_wali) === normalizeKey(namaWali) && (item.tanggal_lahir ?? '') === tanggalLahir && item.tahun_ajaran_target_id === activeYear?.id)) errors.push({ sheet: 'siswa', row, column: 'nama_siswa', message: 'Siswa sudah ada di database lokal.' });
    const id = crypto.randomUUID();
    siswaByKode.set(normalizeKey(kode), id);
    const rawNamaPromo = normalizeText(raw.nama_promo);
    const promoList = rawNamaPromo ? rawNamaPromo.split(',').map(p => p.trim()).filter(Boolean) : [];
    for (const promo of promoList) {
      if (!diskonNames.has(normalizeKey(promo))) errors.push({ sheet: 'siswa', row, column: 'nama_promo', message: `Promo '${promo}' tidak aktif atau tidak ditemukan di sistem.` });
    }
    const namaPromo = promoList.join(', ');
    return { id, kode_import_siswa: kode, nis: normalizeText(raw.nis), nama, tanggal_lahir: tanggalLahir, jenis_kelamin: normalizeText(raw.jenis_kelamin) as '' | 'L' | 'P', nama_wali: namaWali, kontak_wali: normalizeText(raw.kontak_wali).replace(/\D/g, ''), alamat: normalizeText(raw.alamat), status, jenis_masuk: jenisMasuk, tanggal_daftar: tanggalDaftar, kelas_id: kelasId, tanggal_keluar: tanggalKeluar, alasan_keluar: status === 'keluar' ? alasanKeluar : '', tarif_spp_khusus: normalizeNumber(raw.tarif_spp_khusus), alasan_tarif_spp_khusus: normalizeText(raw.alasan_tarif_spp_khusus), nama_promo: namaPromo };
  });
  const seenTagihan = new Set<string>();
  const tagihanByKode = new Map<string, string>();
  const tagihanRows = tagihanRaw.map((raw, index) => {
    const row = rowNumber(raw, index);
    const kodeTagihan = normalizeText(raw.kode_import_tagihan);
    if (!kodeTagihan) errors.push({ sheet: 'tagihan', row, column: 'kode_import_tagihan', message: 'Kode tagihan wajib diisi.' }); else assertUnique(errors, seenTagihan, 'tagihan', row, 'kode_import_tagihan', kodeTagihan);
    const siswaRowId = siswaByKode.get(normalizeKey(raw.kode_import_siswa)) ?? '';
    if (!siswaRowId) errors.push({ sheet: 'tagihan', row, column: 'kode_import_siswa', message: 'Kode siswa tidak ditemukan.' });
    const jumlah = normalizeNumber(raw.jumlah_total);
    if (!jumlah || Number(jumlah) < 0 || !Number.isFinite(Number(jumlah))) errors.push({ sheet: 'tagihan', row, column: 'jumlah_total', message: 'Jumlah total wajib nol atau lebih.' });
    const jatuhTempo = normalizeDate(raw.jatuh_tempo);
    if (!jatuhTempo || !isValidDate(jatuhTempo)) errors.push(dateError('tagihan', row, 'jatuh_tempo', raw.jatuh_tempo, 'Jatuh tempo'));
    const bisaCicil = parseBoolean(raw.bisa_cicil);
    if (bisaCicil === null) errors.push({ sheet: 'tagihan', row, column: 'bisa_cicil', message: 'Bisa cicil harus ya/tidak atau true/false.' });

    const jenisTagihan = normalizeText(raw.jenis_tagihan);
    if (!jenisTagihan) errors.push({ sheet: 'tagihan', row, column: 'jenis_tagihan', message: 'Jenis tagihan wajib diisi.' });
    else if (!jenisTagihanAktif.has(normalizeKey(jenisTagihan))) errors.push({ sheet: 'tagihan', row, column: 'jenis_tagihan', message: `Jenis tagihan '${jenisTagihan}' tidak ditemukan atau tidak aktif di sistem.` });

    const bulanTahun = normalizeBulanTahun(raw.bulan_tahun);
    if (normalizeKey(jenisTagihan) === 'spp' && !/^\d{4}-\d{2}$/.test(bulanTahun)) {
      errors.push({ sheet: 'tagihan', row, column: 'bulan_tahun', message: 'SPP wajib mengisi bulan_tahun format YYYY-MM.' });
    }
    const nominalDiskon = normalizeNumber(raw.nominal_diskon);
    if (nominalDiskon && !Number.isFinite(Number(nominalDiskon))) errors.push({ sheet: 'tagihan', row, column: 'nominal_diskon', message: 'Nominal diskon wajib berupa angka valid.' });
    else if (Number(nominalDiskon || 0) > Number(jumlah || 0)) errors.push({ sheet: 'tagihan', row, column: 'nominal_diskon', message: 'Nominal diskon tidak boleh melebihi jumlah tagihan.' });
    const id = crypto.randomUUID();
    tagihanByKode.set(normalizeKey(kodeTagihan), id);
    return { id, kode_import_tagihan: kodeTagihan, siswa_row_id: siswaRowId, jenis_tagihan: jenisTagihan, bulan_tahun: bulanTahun, nama_tagihan: normalizeText(raw.nama_tagihan), jumlah_total: jumlah, jatuh_tempo: jatuhTempo, bisa_cicil: Boolean(bisaCicil), nama_promo: normalizeText(raw.nama_promo), nominal_diskon: nominalDiskon };
  });
  const pembayaranSiswaMap = new Map<string, string>(); // kode -> siswa_row_id
  const pembayaranRows = pembayaranRaw.map((raw, index) => {
    const row = rowNumber(raw, index);
    const kode = normalizeText(raw.kode_import_pembayaran);
    if (!kode) errors.push({ sheet: 'pembayaran', row, column: 'kode_import_pembayaran', message: 'Kode pembayaran wajib diisi.' });
    const kodeTagihan = normalizeKey(raw.kode_import_tagihan);
    if (!kodeTagihan) errors.push({ sheet: 'pembayaran', row, column: 'kode_import_tagihan', message: 'Pembayaran wajib mengacu ke kode import tagihan.' });

    const tagihanRowId = kodeTagihan ? tagihanByKode.get(kodeTagihan) ?? '' : '';
    if (kodeTagihan && !tagihanRowId) errors.push({ sheet: 'pembayaran', row, column: 'kode_import_tagihan', message: 'Kode tagihan tidak ditemukan.' });
    const tanggal = normalizeDate(raw.tanggal_pembayaran);
    if (!tanggal || !isValidDate(tanggal)) errors.push(dateError('pembayaran', row, 'tanggal_pembayaran', raw.tanggal_pembayaran, 'Tanggal pembayaran'));
    const jumlah = normalizeNumber(raw.jumlah);
    if (!jumlah || Number(jumlah) <= 0 || !Number.isFinite(Number(jumlah))) errors.push({ sheet: 'pembayaran', row, column: 'jumlah', message: 'Jumlah pembayaran wajib lebih dari nol.' });
    const metode = normalizeText(raw.metode_pembayaran);
    if (!metodeAktif.has(normalizeKey(metode))) errors.push({ sheet: 'pembayaran', row, column: 'metode_pembayaran', message: 'Metode pembayaran tidak aktif atau tidak ditemukan.' });
    
    // Validasi satu kode pembayaran harus untuk siswa yang sama
    const siswaId = tagihanRowId ? tagihanRows.find(t => t.id === tagihanRowId)?.siswa_row_id : '';
    if (kode && siswaId) {
      const existingSiswa = pembayaranSiswaMap.get(normalizeKey(kode));
      if (existingSiswa && existingSiswa !== siswaId) {
        errors.push({ sheet: 'pembayaran', row, column: 'kode_import_pembayaran', message: 'Kode pembayaran yang sama tidak boleh digunakan untuk tagihan dari siswa yang berbeda.' });
      } else {
        pembayaranSiswaMap.set(normalizeKey(kode), siswaId);
      }
    }

    return { id: crypto.randomUUID(), kode_import_pembayaran: kode, tagihan_row_id: tagihanRowId, siswa_row_id: '', bulan_tahun: '', tanggal, jumlah, metode, catatan: normalizeText(raw.catatan) };
  });
  validatePaymentTotalsTagihan(tagihanRows, pembayaranRows, errors);
  const summary = summarize(tagihanRows.map((item) => item.jumlah_total), tagihanRows.map((item) => item.nominal_diskon), pembayaranRows.map((item) => item.jumlah), rows.length);
  return { draft: { stepIndex: 2, rows, tagihanRows, pembayaranRows }, errors, summary };
}

function validatePaymentTotalsTagihan(tagihanRows: Array<{ id: string; kode_import_tagihan?: string; jumlah_total: string; nominal_diskon?: string }>, pembayaranRows: Array<{ tagihan_row_id: string; siswa_row_id?: string; bulan_tahun?: string; jumlah: string }>, errors: MigrasiExcelError[]) {
  for (const tagihan of tagihanRows) {
    const totalPaid = pembayaranRows.filter((item) => item.tagihan_row_id === tagihan.id).reduce((sum, item) => sum + Number(item.jumlah || 0), 0);
    const netTagihan = Math.max(0, Number(tagihan.jumlah_total || 0) - Number(tagihan.nominal_diskon || 0));
    if (totalPaid > netTagihan) {
      errors.push({ sheet: 'pembayaran', row: 0, column: '-', message: `Total pembayaran melebihi jumlah tagihan. (Kode Tagihan: ${tagihan.kode_import_tagihan || '-'}, Tagihan Bersih: Rp${netTagihan.toLocaleString('id-ID')}, Total Dibayar: Rp${totalPaid.toLocaleString('id-ID')})` });
    }
  }
}
