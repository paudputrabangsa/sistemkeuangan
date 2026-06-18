import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Pagination, { paginateData } from '../components/ui/Pagination';
import SectionCard from '../components/ui/SectionCard';
import { getCurrentActor } from '../lib/actor';
import { formatRupiah } from '../lib/format';
import { listActiveKelas } from '../queries/kelasQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import {
  importSiswaCalon,
  importSiswaMigrasi,
  type ImportSiswaCalonRowInput,
  type ImportSiswaMigrasiRowInput,
} from '../services/siswaService';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';
import FormField from '../components/ui/FormField';
import { todayDate } from '../services/service-helpers';

type RawRecord = Record<string, string | number | boolean | null | undefined>;
type ImportMode = 'calon' | 'aktif';

type ParsedCalonRow = ImportSiswaCalonRowInput & {
  rowNumber: number;
  tahunAjaranTargetName: string;
  tahunAjaranTargetStatus: string;
  validationIssues?: string[];
};

type ParsedMigrasiRow = ImportSiswaMigrasiRowInput & {
  rowNumber: number;
  tingkatKelasName: string;
  kelasAktifName: string;
  tahunAjaranName: string;
  statusSiswaName: string;
  validationIssues?: string[];
};

function validateCalonRow(row: Omit<ParsedCalonRow, 'validationIssues'>) {
  const issues: string[] = [];
  if (!row.kode_import_siswa) issues.push('kode import kosong');
  if (!row.tanggal_lahir) issues.push('tanggal lahir wajib untuk validasi umur calon');
  if (!row.tahun_ajaran_target_id) issues.push(`tahun ajaran target tidak cocok: ${row.tahunAjaranTargetName || '-'}`);
  if (row.tahun_ajaran_target_id && row.tahunAjaranTargetStatus !== 'draft') issues.push('tahun ajaran target siswa calon harus berstatus draft');
  if (!row.tanggal_daftar) issues.push('tanggal daftar kosong/tidak valid');
  if (!row.jatuh_tempo_pendaftaran) issues.push('jatuh tempo pendaftaran kosong/tidak valid');
  if (row.tanggal_daftar && row.jatuh_tempo_pendaftaran && row.jatuh_tempo_pendaftaran < row.tanggal_daftar) issues.push('jatuh tempo pendaftaran sebelum tanggal daftar');
  if (Number.isNaN(row.biaya_pendaftaran) || row.biaya_pendaftaran < 0) issues.push('biaya pendaftaran tidak valid');
  return issues;
}

function validateMigrasiRow(row: Omit<ParsedMigrasiRow, 'validationIssues'>) {
  const issues: string[] = [];
  if (!row.tahun_ajaran_target_id) issues.push(`tahun ajaran tidak cocok: ${row.tahunAjaranName || '-'}`);
  if (!row.tanggal_daftar) issues.push('tanggal daftar kosong/tidak valid');
  if (row.statusSiswaName !== 'aktif' && row.statusSiswaName !== 'keluar') issues.push('status siswa harus aktif atau keluar');
  if (!row.kelas_tujuan_id) issues.push(`kombinasi tingkat dan kelas tidak cocok: ${row.tingkatKelasName || '-'} / ${row.kelasAktifName || '-'}`);
  if (row.status === 'berhenti' && !row.alasan_keluar) issues.push('alasan keluar wajib untuk status berhenti');
  if (row.status === 'berhenti' && !row.tanggal_keluar) issues.push('tanggal keluar wajib');
  return issues;
}

const calonAliases = {
  kode_import_siswa: ['kode_import_siswa'],
  nama_siswa: ['nama_siswa', 'nama siswa'],
  tanggal_lahir: ['tanggal_lahir', 'tanggal lahir'],
  jenis_kelamin: ['jenis_kelamin', 'jenis kelamin'],
  nama_wali: ['nama_wali', 'nama wali'],
  hubungan_wali: ['hubungan_wali', 'hubungan wali'],
  kontak_wali: ['kontak_wali', 'kontak wali'],
  email_wali: ['email_wali', 'email wali'],
  alamat: ['alamat'],
  tahun_ajaran_target: ['tahun_ajaran_target', 'tahun ajaran target'],
  tanggal_daftar: ['tanggal_daftar', 'tanggal daftar', 'tanggal masuk', 'tanggal_masuk'],
  jatuh_tempo_pendaftaran: ['jatuh_tempo_pendaftaran', 'jatuh tempo pendaftaran', 'jatuh tempo daftar ulang', 'jatuh_tempo_daftar_ulang'],
  biaya_pendaftaran: ['biaya_pendaftaran', 'biaya pendaftaran'],
  opsi_pembayaran_awal: ['opsi_pembayaran_awal', 'opsi pembayaran awal'],
} as const;

const migrasiAliases = {
  kode_import_siswa: ['kode_import_siswa'],
  nama_siswa: ['nama_siswa', 'nama siswa'],
  tanggal_lahir: ['tanggal_lahir', 'tanggal lahir'],
  jenis_kelamin: ['jenis_kelamin', 'jenis kelamin'],
  nama_wali: ['nama_wali', 'nama wali'],
  hubungan_wali: ['hubungan_wali', 'hubungan wali'],
  kontak_wali: ['kontak_wali', 'kontak wali'],
  email_wali: ['email_wali', 'email wali'],
  alamat: ['alamat'],
  status_siswa: ['status_siswa', 'status siswa'],
  jenis_masuk: ['jenis_masuk', 'jenis masuk'],
  tahun_ajaran: ['tahun_ajaran', 'tahun ajaran'],
  tingkat_kelas: ['tingkat_kelas', 'tingkat kelas', 'tingkat'],
  kelas_aktif: ['kelas_aktif', 'kelas aktif'],
  tanggal_daftar: ['tanggal_daftar', 'tanggal daftar', 'tanggal masuk', 'tanggal_masuk'],
  alasan_keluar: ['alasan_keluar', 'alasan keluar'],
  tanggal_keluar: ['tanggal_keluar', 'tanggal keluar'],
} as const;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function getValue(record: RawRecord, aliases: readonly string[]) {
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const found = entries.find(([key]) => normalizeHeader(key) === normalizedAlias);
    if (found) {
      return String(found[1] ?? '').trim();
    }
  }
  return '';
}

function excelDateToIso(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    if (!Number.isNaN(date.getTime())) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  if (!value) {
    return null;
  }
  const strValue = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(strValue)) {
    return strValue;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(strValue)) {
    const [day, month, year] = strValue.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = new Date(strValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function parseJenisKelamin(value: string): 'L' | 'P' | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (['l', 'laki-laki', 'laki laki'].includes(normalized)) {
    return 'L';
  }
  if (['p', 'perempuan'].includes(normalized)) {
    return 'P';
  }
  return null;
}

function parseHubunganWali(value: string): 'ayah' | 'ibu' | 'wali' | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'ayah' || normalized === 'ibu' || normalized === 'wali') {
    return normalized;
  }
  return null;
}

function parseJenisMasuk(value: string): 'awal_tahun' | 'pindahan' {
  return value.trim().toLowerCase() === 'pindahan' ? 'pindahan' : 'awal_tahun';
}

function parseStatusMigrasi(value: string): 'aktif' | 'berhenti' {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'keluar') {
    return 'berhenti';
  }
  return 'aktif';
}

function parseAlasanKeluar(value: string): 'pindah_sekolah' | 'berhenti_lainnya' | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'pindah_sekolah' || normalized === 'pindah sekolah') {
    return 'pindah_sekolah';
  }
  if (normalized === 'berhenti_lainnya' || normalized === 'berhenti lainnya') {
    return 'berhenti_lainnya';
  }
  return null;
}

export default function SiswaImportDapodikPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlMode = searchParams.get('mode');
  
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const years = useLiveQuery(() => listTahunAjaran(), [], []);
  const activeClasses = useLiveQuery(() => listActiveKelas(), [], []);

  const [mode, setMode] = useState<ImportMode>(urlMode === 'aktif' ? 'aktif' : 'calon');
  const [calonRows, setCalonRows] = useState<ParsedCalonRow[]>([]);
  const [migrasiRows, setMigrasiRows] = useState<ParsedMigrasiRow[]>([]);
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tanggalEfektifMasuk, setTanggalEfektifMasuk] = useState(todayDate());
  const [jatuhTempoDaftarUlang, setJatuhTempoDaftarUlang] = useState(todayDate());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const yearMap = useMemo(() => new Map(years.map((item) => [item.nama.toLowerCase(), item.id])), [years]);
  const yearStatusMap = useMemo(() => new Map(years.map((item) => [item.id, item.status ?? (item.aktif ? 'aktif' : 'draft')])), [years]);
  const classCompositeMap = useMemo(
    () => new Map(activeClasses.map((item) => [`${item.tahun_ajaran_id}||${(item.tingkat ?? '').toLowerCase()}||${item.nama_kelas.toLowerCase()}`, item.id])),
    [activeClasses],
  );

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const preferredSheetName = mode === 'calon' ? 'siswa_calon' : 'siswa_aktif';
      let sheet: ExcelJS.Worksheet | undefined;
      workbook.eachSheet((s) => {
        const name = s.name.toLowerCase();
        if (name === preferredSheetName || name === 'siswa_migrasi') {
          sheet = s;
        }
      });
      if (!sheet) {
        throw new Error(`File ini bukan template ${mode === 'calon' ? 'import siswa calon' : 'import siswa aktif'} yang benar. Sheet ${preferredSheetName} tidak ditemukan.`);
      }
      const rawRows: RawRecord[] = [];
      const headers: string[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.text;
          });
        } else {
          const rowData: RawRecord = { __rowNum__: rowNumber - 1 };
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (headers[colNumber]) {
              let val = cell.value;
              if (val && typeof val === 'object' && 'text' in val) val = val.text;
              else if (val && typeof val === 'object' && 'formula' in val) val = (val as any).result;
              rowData[headers[colNumber]] = val as any;
            }
          });
          const isBlankRow = Object.entries(rowData).filter(([key]) => key !== '__rowNum__' && !key.startsWith('kode_import_')).every(([, value]) => String(value ?? '').trim() === '');
          if (!isBlankRow) {
            rawRows.push(rowData);
          }
        }
      });

      if (mode === 'calon') {
        const parsedRows = rawRows.map((record, index) => {
          const tahunAjaranName = getValue(record, calonAliases.tahun_ajaran_target);
          const tahunAjaranTargetId = yearMap.get(tahunAjaranName.toLowerCase()) ?? '';
          const row = {
            rowNumber: index + 2,
            kode_import_siswa: getValue(record, calonAliases.kode_import_siswa),
            nama: getValue(record, calonAliases.nama_siswa),
            tanggal_lahir: excelDateToIso(getValue(record, calonAliases.tanggal_lahir) ?? record[calonAliases.tanggal_lahir[0]]),
            jenis_kelamin: parseJenisKelamin(getValue(record, calonAliases.jenis_kelamin)),
            nama_wali: getValue(record, calonAliases.nama_wali),
            hubungan_wali: parseHubunganWali(getValue(record, calonAliases.hubungan_wali)),
            kontak_wali: getValue(record, calonAliases.kontak_wali),
            email_wali: getValue(record, calonAliases.email_wali) || null,
            alamat: getValue(record, calonAliases.alamat) || null,
            tahun_ajaran_target_id: tahunAjaranTargetId,
            tahunAjaranTargetName: tahunAjaranName,
            tahunAjaranTargetStatus: tahunAjaranTargetId ? yearStatusMap.get(tahunAjaranTargetId) ?? '' : '',
            tanggal_daftar: excelDateToIso(getValue(record, calonAliases.tanggal_daftar) ?? record[calonAliases.tanggal_daftar[0]]) || tanggalEfektifMasuk,
            jatuh_tempo_pendaftaran: excelDateToIso(getValue(record, calonAliases.jatuh_tempo_pendaftaran) ?? record[calonAliases.jatuh_tempo_pendaftaran[0]]) || jatuhTempoDaftarUlang,
            biaya_pendaftaran: Number(getValue(record, calonAliases.biaya_pendaftaran) || 0),
            opsi_pembayaran_awal: getValue(record, calonAliases.opsi_pembayaran_awal).toLowerCase() === 'cicil' ? 'cicil' : 'full',
          } satisfies ParsedCalonRow;
          return { ...row, validationIssues: validateCalonRow(row) };
        }).filter((row) => row.nama.trim());

        if (parsedRows.length === 0) {
          throw new Error('Tidak ada baris siswa calon yang valid pada sheet siswa_calon. Pastikan Anda mengunggah template calon yang benar.');
        }
        setCalonRows(parsedRows);
        setMigrasiRows([]);
        setPage(1);
      } else {
        const parsedRows = rawRows.map((record, index) => {
          const tahunAjaranName = getValue(record, migrasiAliases.tahun_ajaran);
          const tahunAjaranId = yearMap.get(tahunAjaranName.toLowerCase()) ?? '';
          const tingkatKelasName = getValue(record, migrasiAliases.tingkat_kelas);
          const kelasAktifName = getValue(record, migrasiAliases.kelas_aktif);
          const statusSiswaName = getValue(record, migrasiAliases.status_siswa).trim().toLowerCase();
          const compositeKey = `${tahunAjaranId}||${tingkatKelasName.toLowerCase()}||${kelasAktifName.toLowerCase()}`;
          const row = {
            rowNumber: index + 2,
            kode_import_siswa: getValue(record, migrasiAliases.kode_import_siswa) || null,
            nama: getValue(record, migrasiAliases.nama_siswa),
            tanggal_lahir: excelDateToIso(getValue(record, migrasiAliases.tanggal_lahir) ?? record[migrasiAliases.tanggal_lahir[0]]),
            jenis_kelamin: parseJenisKelamin(getValue(record, migrasiAliases.jenis_kelamin)),
            nama_wali: getValue(record, migrasiAliases.nama_wali),
            hubungan_wali: parseHubunganWali(getValue(record, migrasiAliases.hubungan_wali)),
            kontak_wali: getValue(record, migrasiAliases.kontak_wali),
            email_wali: getValue(record, migrasiAliases.email_wali) || null,
            alamat: getValue(record, migrasiAliases.alamat) || null,
            status: parseStatusMigrasi(getValue(record, migrasiAliases.status_siswa)),
            statusSiswaName,
            jenis_masuk: parseJenisMasuk(getValue(record, migrasiAliases.jenis_masuk)),
            tahun_ajaran_target_id: tahunAjaranId,
            tahunAjaranName,
            tanggal_daftar: excelDateToIso(getValue(record, migrasiAliases.tanggal_daftar) ?? record[migrasiAliases.tanggal_daftar[0]]) || tanggalEfektifMasuk,
            kelas_tujuan_id: classCompositeMap.get(compositeKey) ?? '',
            tingkatKelasName,
            kelasAktifName,
            alasan_keluar: parseAlasanKeluar(getValue(record, migrasiAliases.alasan_keluar)),
            tanggal_keluar: excelDateToIso(getValue(record, migrasiAliases.tanggal_keluar) ?? record[migrasiAliases.tanggal_keluar[0]]),
            sumber_data: 'import_excel',
          } satisfies ParsedMigrasiRow;
          return { ...row, validationIssues: validateMigrasiRow(row) };
        }).filter((row) => row.nama.trim());

        if (parsedRows.length === 0) {
          throw new Error('Tidak ada baris siswa aktif yang valid pada sheet excel. Pastikan Anda mengunggah template yang benar.');
        }
        setMigrasiRows(parsedRows);
        setCalonRows([]);
        setPage(1);
      }

      event.target.value = '';
    } catch (error) {
      addToast({ type: 'error', title: 'Gagal', message: error instanceof Error ? error.message : 'Gagal membaca file Excel.' });
    }
  }

  const calonSummary = useMemo(() => {
    const invalid = calonRows.filter((row) => (row.validationIssues?.length ?? 0) > 0).length;
    const totalBiaya = calonRows.reduce((sum, row) => sum + Math.max(0, row.biaya_pendaftaran || 0), 0);
    return { valid: calonRows.length - invalid, invalid, totalBiaya };
  }, [calonRows]);

  const migrasiSummary = useMemo(() => {
    const invalid = migrasiRows.filter((row) => (row.validationIssues?.length ?? 0) > 0).length;
    return { valid: migrasiRows.length - invalid, invalid };
  }, [migrasiRows]);

  async function handleImport() {
    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan. Silakan login ulang.' });
      return;
    }

    let count = 0;
    if (mode === 'calon') {
      const validRows = calonRows.filter((row) => (row.validationIssues?.length ?? 0) === 0);
      if (validRows.length === 0) {
        const previewIssues = calonRows.slice(0, 3).map((row) => `Baris ${row.rowNumber}: ${(row.validationIssues ?? []).join(', ') || 'tidak valid'}`).join(' | ');
        addToast({ type: 'error', title: 'Gagal', message: `Tidak ada baris calon yang lolos validasi. ${previewIssues}` });
        return;
      }
      count = validRows.length;
    } else {
      const validRows = migrasiRows.filter((row) => (row.validationIssues?.length ?? 0) === 0);
      if (validRows.length === 0) {
        const previewIssues = migrasiRows.slice(0, 3).map((row) => `Baris ${row.rowNumber}: ${(row.validationIssues ?? []).join(', ') || 'tidak valid'}`).join(' | ');
        addToast({ type: 'error', title: 'Gagal', message: `Tidak ada baris migrasi yang lolos validasi. ${previewIssues}` });
        return;
      }
      count = validRows.length;
    }

    requestConfirm({
      title: 'Import Siswa?',
      description: `Apakah Anda yakin ingin mengimpor ${count} siswa ${mode === 'calon' ? 'calon' : 'aktif'} ke dalam sistem?`,
      confirmLabel: 'Ya, Import',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          if (mode === 'calon') {
            const validRows = calonRows.filter((row) => (row.validationIssues?.length ?? 0) === 0);
            const result = await importSiswaCalon(actor, { rows: validRows });
            addToast({ type: 'success', title: 'Berhasil', message: `${result.students.length} siswa calon berhasil diimpor.` });
            setCalonRows([]);
          } else {
            const validRows = migrasiRows.filter((row) => (row.validationIssues?.length ?? 0) === 0);
            const result = await importSiswaMigrasi(actor, { rows: validRows });
            addToast({ type: 'success', title: 'Berhasil', message: `${result.length} siswa migrasi berhasil diimpor.` });
            setMigrasiRows([]);
          }
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof Error ? error.message : 'Gagal mengimpor data siswa.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  const hasRows = mode === 'calon' ? calonRows.length > 0 : migrasiRows.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Import Siswa"
        description="Gunakan halaman ini untuk import batch siswa baru/calon atau migrasi siswa existing dari template Excel resmi."
        actions={<button type="button" onClick={() => navigate('/siswa')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" />Kembali ke Daftar Siswa</button>}
      />

      <SectionCard title="Mode import" description="Pilih template yang sesuai sebelum mengunggah file Excel.">
        <div className="flex flex-wrap gap-3">
          {[
            { value: 'calon', label: 'Import Siswa Baru / Calon' },
            { value: 'aktif', label: 'Import Siswa Aktif' },
          ].map((option) => (
            <button key={option.value} type="button" onClick={() => { setMode(option.value as ImportMode); setCalonRows([]); setMigrasiRows([]); setPage(1); }} className={`rounded-xl px-4 py-3 text-sm font-bold transition ${mode === option.value ? 'bg-brand-600 text-white shadow-md shadow-brand-600/10' : 'border border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              {option.label}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Upload template Excel" description={mode === 'calon' ? 'Template yang diharapkan: template_import_siswa_calon.xlsx' : 'Template yang diharapkan: template_import_siswa_aktif.xlsx'}>
        {years.length === 0 ? (
          <EmptyState title="Belum ada tahun ajaran" description="Buat master tahun ajaran terlebih dahulu sebelum import siswa." />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Tanggal efektif masuk" htmlFor="tanggal_efektif_masuk">
                <input id="tanggal_efektif_masuk" type="date" value={tanggalEfektifMasuk} onChange={(e) => setTanggalEfektifMasuk(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
              </FormField>
              {mode === 'calon' && (
                <FormField label="Jatuh tempo daftar ulang" htmlFor="jatuh_tempo_daftar_ulang">
                  <input id="jatuh_tempo_daftar_ulang" type="date" value={jatuhTempoDaftarUlang} onChange={(e) => setJatuhTempoDaftarUlang(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
                </FormField>
              )}
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                {mode === 'calon'
                  ? 'Setiap baris calon harus punya kode import, tahun ajaran target, biaya pendaftaran, dan opsi pembayaran. Jika tanggal masuk di file kosong, akan menggunakan Tanggal efektif masuk di atas.'
                  : 'Setiap baris migrasi harus punya status siswa, jenis masuk, tahun ajaran, dan kelas aktif jika statusnya aktif. Jika tanggal masuk di file kosong, akan menggunakan Tanggal efektif masuk di atas.'}
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-4 py-8 text-sm font-bold text-brand-700 transition hover:bg-brand-100 dark:border-brand-900/40 dark:bg-brand-950/20 dark:text-brand-300 dark:hover:bg-brand-950/30">
                <FileSpreadsheet className="h-4 w-4" />
                Pilih File Excel
                <input type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
          </div>
        )}
      </SectionCard>

      {mode === 'calon' && calonRows.length > 0 ? (
        <SectionCard title="Preview import calon" description="Tinjau hasil baca file sebelum data disimpan ke IndexedDB.">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-bold">
            <span className="rounded-full bg-slate-100 px-3 py-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{calonRows.length} baris terbaca</span>
            <span className="rounded-full bg-success-50 px-3 py-2 text-success-700 dark:bg-success-950/30 dark:text-success-400">{calonSummary.valid} valid</span>
            <span className="rounded-full bg-warning-50 px-3 py-2 text-warning-700 dark:bg-warning-950/30 dark:text-warning-400">{calonSummary.invalid} perlu review</span>
            <span className="rounded-full bg-brand-50 px-3 py-2 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">Total biaya {formatRupiah(calonSummary.totalBiaya)}</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1180px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="px-4 py-3 font-semibold">Baris</th><th className="px-4 py-3 font-semibold">Kode</th><th className="px-4 py-3 font-semibold">Nama</th><th className="px-4 py-3 font-semibold">Tahun Ajaran</th><th className="px-4 py-3 font-semibold">Tanggal Masuk</th><th className="px-4 py-3 font-semibold">Biaya</th><th className="px-4 py-3 font-semibold">Opsi</th><th className="px-4 py-3 font-semibold">Validasi</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">{paginateData(calonRows, page, pageSize).map((row) => <tr key={`${row.rowNumber}-${row.kode_import_siswa}`}><td className="px-4 py-4 text-slate-500 dark:text-slate-400">{row.rowNumber}</td><td className="px-4 py-4 font-semibold text-slate-700 dark:text-slate-200">{row.kode_import_siswa || '-'}</td><td className="px-4 py-4 font-bold text-slate-800 dark:text-slate-100">{row.nama}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{row.tahunAjaranTargetName || '-'}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{row.tanggal_daftar || '-'}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{formatRupiah(row.biaya_pendaftaran || 0)}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{row.opsi_pembayaran_awal}</td><td className="px-4 py-4 text-xs font-semibold">{(row.validationIssues?.length ?? 0) === 0 ? <span className="text-success-700 dark:text-success-400">Valid</span> : <span className="text-danger-700 dark:text-danger-400">{row.validationIssues?.join(', ')}</span>}</td></tr>)}</tbody></table></div>
          <Pagination currentPage={page} totalItems={calonRows.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </SectionCard>
      ) : null}

      {mode === 'aktif' && migrasiRows.length > 0 ? (
        <SectionCard title="Preview import siswa aktif" description="Pastikan tahun ajaran dan kelas aktif hasil mapping sudah benar sebelum import dijalankan.">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-bold">
            <span className="rounded-full bg-slate-100 px-3 py-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{migrasiRows.length} baris terbaca</span>
            <span className="rounded-full bg-success-50 px-3 py-2 text-success-700 dark:bg-success-950/30 dark:text-success-400">{migrasiSummary.valid} valid</span>
            <span className="rounded-full bg-warning-50 px-3 py-2 text-warning-700 dark:bg-warning-950/30 dark:text-warning-400">{migrasiSummary.invalid} perlu review</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1380px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="px-4 py-3 font-semibold">Baris</th><th className="px-4 py-3 font-semibold">Kode</th><th className="px-4 py-3 font-semibold">Nama</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Jenis Masuk</th><th className="px-4 py-3 font-semibold">Tahun Ajaran</th><th className="px-4 py-3 font-semibold">Tingkat</th><th className="px-4 py-3 font-semibold">Kelas</th><th className="px-4 py-3 font-semibold">Validasi</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">{paginateData(migrasiRows, page, pageSize).map((row) => <tr key={`${row.rowNumber}-${row.kode_import_siswa ?? row.nama}`}><td className="px-4 py-4 text-slate-500 dark:text-slate-400">{row.rowNumber}</td><td className="px-4 py-4 font-semibold text-slate-700 dark:text-slate-200">{row.kode_import_siswa ?? '-'}</td><td className="px-4 py-4 font-bold text-slate-800 dark:text-slate-100">{row.nama}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{row.status}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{row.jenis_masuk}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{row.tahunAjaranName || '-'}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{row.tingkatKelasName || '-'}</td><td className="px-4 py-4 text-slate-600 dark:text-slate-300">{row.kelasAktifName || '-'}</td><td className="px-4 py-4 text-xs font-semibold">{(row.validationIssues?.length ?? 0) === 0 ? <span className="text-success-700 dark:text-success-400">Valid</span> : <span className="text-danger-700 dark:text-danger-400">{row.validationIssues?.join(', ')}</span>}</td></tr>)}</tbody></table></div>
          <Pagination currentPage={page} totalItems={migrasiRows.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </SectionCard>
      ) : null}

      {hasRows ? <div className="flex flex-wrap gap-3"><button type="button" onClick={handleImport} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Mengimpor...' : 'Import ke Sistem'}</button><button type="button" onClick={() => { setCalonRows([]); setMigrasiRows([]); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800">Reset Preview</button></div> : null}
    </div>
  );
}
