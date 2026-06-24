import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, GripVertical, Plus, Save, Trash2, X } from 'lucide-react';
import FormField from '../components/ui/FormField';
import { getCurrentActor } from '../lib/actor';
import { formatNumberInput, parseNumberInput } from '../lib/format';
import { completeSetupAwal } from '../services/setupAwalService';
import { clearSetupAwalDraft, loadSetupAwalDraft, saveSetupAwalDraft } from '../services/setupAwalDraftService';
import type { SetupAwalTingkatDraft, SetupAwalKomponenBiayaDraft, SetupAwalDiskonDraft } from '../services/setupAwalDraftService';
import type { FormatNIS, KomponenNIS, TipeKomponenNIS } from '../db/types';
import { DEFAULT_FORMAT_NIS } from '../services/pengaturanRepository';
import { ServiceError } from '../services/service-errors';
import { calculateTahunAjaranSelesai } from '../services/tahunAjaranDateService';
import { isValidTahunAjaranName } from '../services/nameNormalizationService';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

// ===================== Types =====================

type StepId = 'mode' | 'profil' | 'tahun' | 'tingkat' | 'biaya' | 'metode' | 'diskon' | 'nis' | 'keamanan' | 'review';
type ValidationIssue = { message: string; fieldId?: string; stepIndex?: number };

const steps: Array<{ id: StepId; label: string; description: string }> = [
  { id: 'mode', label: 'Mode Penggunaan', description: 'Sekarang atau persiapan' },
  { id: 'profil', label: 'Profil Sekolah', description: 'Identitas sekolah' },
  { id: 'tahun', label: 'Tahun Ajaran', description: 'Periode tahun ajaran' },
  { id: 'tingkat', label: 'Tingkat & Kelas', description: 'Rombel, tarif, cutoff' },
  { id: 'biaya', label: 'Komponen Biaya', description: 'Biaya pendaftaran' },
  { id: 'metode', label: 'Metode & Tagihan', description: 'Master global' },
  { id: 'diskon', label: 'Promo / Diskon', description: 'Potongan harga' },
  { id: 'nis', label: 'Format NIS', description: 'Nomor induk siswa' },
  { id: 'keamanan', label: 'Keamanan', description: 'Akses lokal' },
  { id: 'review', label: 'Review', description: 'Cek lalu simpan' },
];

// ===================== Defaults =====================

function defaultTingkatRows(): SetupAwalTingkatDraft[] {
  return [
    { id: crypto.randomUUID(), nama: 'Kelompok Bermain', kode: 'KB', tarif_spp: '', usia_min_tahun: '2', usia_max_tahun: '4', kelas: [{ id: crypto.randomUUID(), nama_kelas: '', kapasitas_siswa: '' }] },
    { id: crypto.randomUUID(), nama: 'TK A', kode: 'A', tarif_spp: '', usia_min_tahun: '4', usia_max_tahun: '5', kelas: [{ id: crypto.randomUUID(), nama_kelas: '', kapasitas_siswa: '' }] },
    { id: crypto.randomUUID(), nama: 'TK B', kode: 'B', tarif_spp: '', usia_min_tahun: '5', usia_max_tahun: '6', kelas: [{ id: crypto.randomUUID(), nama_kelas: '', kapasitas_siswa: '' }] },
  ];
}

const defaultKomponenBiaya: SetupAwalKomponenBiayaDraft[] = [
  { id: crypto.randomUUID(), nama: 'Uang Pangkal', nominal: '', wajib: true },
];

const defaultMetodePembayaran = [
  { id: crypto.randomUUID(), nama: 'Tunai', aktif: false },
  { id: crypto.randomUUID(), nama: 'Transfer', aktif: false },
  { id: crypto.randomUUID(), nama: 'Tabungan', aktif: false },
];

const defaultJenisTagihan = [
  { id: crypto.randomUUID(), nama: 'SPP', aktif: false },
  { id: crypto.randomUUID(), nama: 'Pendaftaran', aktif: false },
  { id: crypto.randomUUID(), nama: 'Daftar Ulang', aktif: false },
  { id: crypto.randomUUID(), nama: 'Kegiatan', aktif: false },
  { id: crypto.randomUUID(), nama: 'Administrasi', aktif: false },
  { id: crypto.randomUUID(), nama: 'Lainnya', aktif: false },
];

const defaultDiskonDraft: SetupAwalDiskonDraft[] = [
  {
    id: crypto.randomUUID(),
    nama: 'Early Bird Pendaftaran',
    aktif: true,
    tipe_diskon: 'nominal',
    persen_diskon: '',
    nominal_diskon: '50000',
    target_jenis_tagihan: ['pendaftaran'],
    berulang: false,
    klaim_mulai: '',
    klaim_selesai: '',
    batas_kali_penggunaan: '1',
    kuota: '',
  },
  {
    id: crypto.randomUUID(),
    nama: 'Promo SPP Awal Bulan',
    aktif: true,
    tipe_diskon: 'persen',
    persen_diskon: '10',
    nominal_diskon: '',
    target_jenis_tagihan: ['spp'],
    berulang: true,
    klaim_mulai: '',
    klaim_selesai: '',
    batas_kali_penggunaan: '',
    kuota: '',
  }
];


const monthOptions = [
  { value: '1', label: 'Januari' }, { value: '2', label: 'Februari' }, { value: '3', label: 'Maret' }, { value: '4', label: 'April' },
  { value: '5', label: 'Mei' }, { value: '6', label: 'Juni' }, { value: '7', label: 'Juli' }, { value: '8', label: 'Agustus' },
  { value: '9', label: 'September' }, { value: '10', label: 'Oktober' }, { value: '11', label: 'November' }, { value: '12', label: 'Desember' },
];

const NIS_TIPE_OPTIONS: Array<{ tipe: TipeKomponenNIS; label: string; description: string; maxCount: number }> = [
  { tipe: 'prefix', label: 'Prefix', description: 'Teks tetap di awal, misal "PAUD"', maxCount: 1 },
  { tipe: 'tahun', label: 'Tahun', description: 'Tahun ajaran', maxCount: 1 },
  { tipe: 'kelas', label: 'Kelas', description: 'Kode tingkat/kelompok siswa', maxCount: 1 },
  { tipe: 'gender', label: 'Gender', description: 'L atau P', maxCount: 1 },
  { tipe: 'thlahir', label: 'Thn Lahir', description: 'Tahun lahir siswa', maxCount: 1 },
  { tipe: 'urut', label: 'No. Urut', description: 'Nomor urut (wajib)', maxCount: 99 },
  { tipe: 'custom', label: 'Custom', description: 'Teks bebas', maxCount: 99 },
];

const NIS_TAHUN_CFG_OPTIONS = [
  { value: '4digit', label: '2025' },
  { value: '2digit', label: '25' },
  { value: 'ta-panjang', label: '2025/2026' },
  { value: 'ta-pendek', label: '25/26' },
  { value: 'ta-gabung', label: '2526' },
  { value: 'ta-gabung-panjang', label: '20252026' },
];

// ===================== Helpers =====================

function sanitize<T extends { nama: string; aktif: boolean }>(items: T[] | undefined, defaults: T[]) {
  return items?.length ? items : defaults;
}

function sanitizeMetode(items: Array<{ id: string; nama: string; aktif: boolean }> | undefined) {
  const source = items?.length ? items : defaultMetodePembayaran;
  return source.filter((item) => item.nama.trim().toLowerCase() !== 'split');
}

function currency(value: string | number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function issue(message: string, fieldId?: string, stepIndex?: number): ValidationIssue {
  return { message, fieldId, stepIndex };
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const compactInputClass = 'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function previewNIS(format: FormatNIS): string {
  const segments = format.komponen.map((k) => {
    switch (k.tipe) {
      case 'prefix': case 'custom': return k.cfg || '???';
      case 'tahun': {
        switch (k.cfg) {
          case '4digit': return '2026';
          case '2digit': return '26';
          case 'ta-panjang': return '2026/2027';
          case 'ta-pendek': return '26/27';
          case 'ta-gabung': return '2627';
          case 'ta-gabung-panjang': return '20262027';
          default: return '2627';
        }
      }
      case 'kelas': return 'A';
      case 'gender': return 'L';
      case 'thlahir': return k.cfg === '2digit' ? '20' : '2020';
      case 'urut': return '0'.repeat(Math.max(1, parseInt(k.cfg) || 3) - 1) + '1';
      default: return '?';
    }
  });
  return segments.join(format.separator);
}

function getDefaultCfg(tipe: TipeKomponenNIS): string {
  if (tipe === 'tahun') return 'ta-gabung';
  if (tipe === 'urut') return '3';
  if (tipe === 'thlahir') return '2digit';
  return '';
}

// ===================== Component =====================

export default function SetupAwalPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const initialDraft = loadSetupAwalDraft();
  const [stepIndex, setStepIndex] = useState(initialDraft?.stepIndex ?? 0);
  const [maxStepReached, setMaxStepReached] = useState(initialDraft?.maxStepReached ?? 0);
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [expandedTingkat, setExpandedTingkat] = useState<Record<string, boolean>>({});

  // --- State ---
  const defaultProfileDraft = {
    nama_sekolah: '',
    nama_yayasan: '',
    bentuk_satuan: '',
    izin_operasional: '',
    npsn: '',
    telepon: '',
    website: '',
    tahun_berdiri: '',
    alamat_jalan: '',
    alamat_rt: '',
    alamat_rw: '',
    alamat_desa: '',
    alamat_kecamatan: '',
    alamat_kabupaten: '',
    alamat_provinsi: '',
    alamat_kode_pos: '',
    nama_kepsek: '',
  };
  const [profile, setProfile] = useState(initialDraft?.profile ?? defaultProfileDraft);
  const [year, setYear] = useState(initialDraft?.year ?? { nama: '', mulai: '', selesai: '' });
  const [tingkatRows, setTingkatRows] = useState<SetupAwalTingkatDraft[]>(initialDraft?.tingkatRows ?? defaultTingkatRows());
  const [cutoff, setCutoff] = useState(initialDraft?.cutoff ?? { bulan: '7', tanggal: '1' });
  const [sppCutoff, setSppCutoff] = useState(initialDraft?.sppCutoff ?? { aktif: true, tanggal: '20' });
  const [mode, setMode] = useState<'sekarang' | 'mendatang'>(initialDraft?.mode ?? 'sekarang');
  const [pendaftaranDiLuarSistem, setPendaftaranDiLuarSistem] = useState(initialDraft?.pendaftaranDiLuarSistem ?? false);
  const [komponenBiaya, setKomponenBiaya] = useState<SetupAwalKomponenBiayaDraft[]>(initialDraft?.komponenBiaya ?? defaultKomponenBiaya);
  const [modeTagihanBiaya, setModeTagihanBiaya] = useState<'gabung' | 'pisah'>(initialDraft?.modeTagihanBiaya ?? 'gabung');
  const [jatuhTempoPendaftaran, setJatuhTempoPendaftaran] = useState(initialDraft?.jatuhTempoPendaftaran ?? { mode: 'tanggal_tetap' as const, tanggal: '', hari: '14' });
  const [diskon, setDiskon] = useState<SetupAwalDiskonDraft[]>(initialDraft?.diskon ?? defaultDiskonDraft);
  const [formatNIS, setFormatNIS] = useState<FormatNIS>(initialDraft?.formatNIS ?? DEFAULT_FORMAT_NIS);
  const [metodePembayaran, setMetodePembayaran] = useState(sanitizeMetode(initialDraft?.metodePembayaran));
  const [jenisTagihan, setJenisTagihan] = useState(sanitize(initialDraft?.jenisTagihan, defaultJenisTagihan));


  const currentStep = steps[stepIndex];

  // Save draft on every state change
  useEffect(() => {
    saveSetupAwalDraft({ mode, profile, year, tingkatRows, cutoff, sppCutoff, pendaftaranDiLuarSistem, komponenBiaya, modeTagihanBiaya, jatuhTempoPendaftaran, diskon, formatNIS, metodePembayaran, jenisTagihan, stepIndex, maxStepReached });
  }, [mode, profile, year, tingkatRows, cutoff, sppCutoff, pendaftaranDiLuarSistem, komponenBiaya, modeTagihanBiaya, jatuhTempoPendaftaran, diskon, formatNIS, metodePembayaran, jenisTagihan, stepIndex, maxStepReached]);

  // ===================== Tingkat/Kelas CRUD =====================

  function toggleTingkat(id: string) {
    setExpandedTingkat((c) => ({ ...c, [id]: !c[id] }));
  }

  function updateTingkat(id: string, key: keyof SetupAwalTingkatDraft, value: unknown) {
    setTingkatRows((cur) => cur.map((t) => t.id === id ? { ...t, [key]: value } : t));
  }

  function addTingkat() {
    const newT: SetupAwalTingkatDraft = { id: crypto.randomUUID(), nama: '', kode: '', tarif_spp: '', usia_min_tahun: '', usia_max_tahun: '', kelas: [{ id: crypto.randomUUID(), nama_kelas: '', kapasitas_siswa: '' }] };
    setTingkatRows((cur) => [...cur, newT]);
    setExpandedTingkat((c) => ({ ...c, [newT.id]: true }));
  }

  function removeTingkat(id: string) {
    setTingkatRows((cur) => cur.length === 1 ? cur : cur.filter((t) => t.id !== id));
  }

  function addKelasToTingkat(tingkatId: string) {
    setTingkatRows((cur) => cur.map((t) => t.id === tingkatId ? { ...t, kelas: [...t.kelas, { id: crypto.randomUUID(), nama_kelas: '', kapasitas_siswa: '' }] } : t));
  }

  function updateKelas(tingkatId: string, kelasId: string, key: string, value: string) {
    setTingkatRows((cur) => cur.map((t) => t.id === tingkatId ? { ...t, kelas: t.kelas.map((k) => k.id === kelasId ? { ...k, [key]: value } : k) } : t));
  }

  function removeKelas(tingkatId: string, kelasId: string) {
    setTingkatRows((cur) => cur.map((t) => t.id === tingkatId ? { ...t, kelas: t.kelas.length === 1 ? t.kelas : t.kelas.filter((k) => k.id !== kelasId) } : t));
  }

  // ===================== Komponen Biaya CRUD =====================

  function addKomponenBiaya() { setKomponenBiaya((c) => [...c, { id: crypto.randomUUID(), nama: '', nominal: '', wajib: true }]); }
  function updateKomponenBiaya(id: string, key: keyof SetupAwalKomponenBiayaDraft, value: unknown) { setKomponenBiaya((c) => c.map((k) => k.id === id ? { ...k, [key]: value } : k)); }
  function removeKomponenBiaya(id: string) { setKomponenBiaya((c) => c.length === 0 ? c : c.filter((k) => k.id !== id)); }

  // ===================== Diskon CRUD =====================

  function addDiskon() {
    setDiskon((c) => [...c, { id: crypto.randomUUID(), nama: '', aktif: true, tipe_diskon: 'persen', persen_diskon: '', nominal_diskon: '', target_jenis_tagihan: ['semua'], berulang: true, klaim_mulai: '', klaim_selesai: '', batas_kali_penggunaan: '', kuota: '' }]);
  }
  function updateDiskon(id: string, changes: Partial<SetupAwalDiskonDraft>) { setDiskon((c) => c.map((d) => d.id === id ? { ...d, ...changes } : d)); }
  function removeDiskon(id: string) { setDiskon((c) => c.filter((d) => d.id !== id)); }

  // ===================== NIS Component CRUD =====================

  function addNISKomponen(tipe: TipeKomponenNIS) {
    const nextId = formatNIS.komponen.length > 0 ? Math.max(...formatNIS.komponen.map((k) => k.id)) + 1 : 1;
    setFormatNIS((cur) => ({ ...cur, komponen: [...cur.komponen, { id: nextId, tipe, cfg: getDefaultCfg(tipe) }] }));
  }
  function updateNISKomponen(id: number, changes: Partial<KomponenNIS>) { setFormatNIS((cur) => ({ ...cur, komponen: cur.komponen.map((k) => k.id === id ? { ...k, ...changes } : k) })); }
  function removeNISKomponen(id: number) { setFormatNIS((cur) => ({ ...cur, komponen: cur.komponen.filter((k) => k.id !== id) })); }
  function moveNISKomponen(index: number, direction: -1 | 1) {
    setFormatNIS((cur) => {
      const arr = [...cur.komponen];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= arr.length) return cur;
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return { ...cur, komponen: arr };
    });
  }

  // ===================== Metode & Tagihan CRUD =====================

  function addMetode() { setMetodePembayaran((c) => [...c, { id: crypto.randomUUID(), nama: '', aktif: true }]); }
  function updateMetode(id: string, key: 'nama' | 'aktif', value: string | boolean) { setMetodePembayaran((c) => c.map((i) => i.id === id ? { ...i, [key]: value } : i)); }
  function removeMetode(id: string) { setMetodePembayaran((c) => c.length === 1 ? c : c.filter((i) => i.id !== id)); }

  function addJenisTagihan() { setJenisTagihan((c) => [...c, { id: crypto.randomUUID(), nama: '', aktif: true }]); }
  function updateJenisTagihan(id: string, key: 'nama' | 'aktif', value: string | boolean) { setJenisTagihan((c) => c.map((i) => i.id === id ? { ...i, [key]: value } : i)); }
  function removeJenisTagihan(id: string) { setJenisTagihan((c) => c.length === 1 ? c : c.filter((i) => i.id !== id)); }

  // ===================== Validation =====================

  function inputClassFor(fieldId: string, baseClass = inputClass) {
    return fieldErrors[fieldId] ? `${baseClass} border-danger-300 focus:border-danger-400 focus:ring-danger-100 dark:border-danger-800` : baseClass;
  }

  function scrollToField(fieldId?: string) {
    if (!fieldId) return;
    window.setTimeout(() => {
      const mobileField = window.matchMedia('(max-width: 767px)').matches ? document.getElementById(`m_${fieldId}`) : null;
      const element = mobileField ?? document.getElementById(fieldId);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (element instanceof HTMLElement) element.focus({ preventScroll: true });
    }, 80);
  }

  function showValidationIssue(vi: ValidationIssue) {
    if (!vi.fieldId) addToast({ type: 'error', title: 'Validasi', message: vi.message });
    setFieldErrors(vi.fieldId ? { [vi.fieldId]: vi.message } : {});
    if (typeof vi.stepIndex === 'number') { setStepIndex(vi.stepIndex); setMaxStepReached((m) => Math.max(m, vi.stepIndex ?? 0)); }
    scrollToField(vi.fieldId);
  }

  function validateProfile(): ValidationIssue | null {
    if (!profile.nama_sekolah.trim()) return issue('Nama sekolah wajib diisi.', 'nama_sekolah', 1);
    if (!profile.bentuk_satuan.trim()) return issue('Bentuk satuan wajib diisi.', 'bentuk_satuan', 1);
    if (!profile.nama_kepsek.trim()) return issue('Nama kepala/pengelola wajib diisi.', 'nama_kepsek', 1);
    if (!profile.alamat_jalan.trim()) return issue('Alamat jalan wajib diisi.', 'alamat_jalan', 1);
    if (!profile.alamat_desa.trim()) return issue('Desa/Kelurahan wajib diisi.', 'alamat_desa', 1);
    if (!profile.alamat_kecamatan.trim()) return issue('Kecamatan wajib diisi.', 'alamat_kecamatan', 1);
    if (!profile.alamat_kabupaten.trim()) return issue('Kabupaten/Kota wajib diisi.', 'alamat_kabupaten', 1);
    if (!profile.alamat_provinsi.trim()) return issue('Provinsi wajib diisi.', 'alamat_provinsi', 1);
    return null;
  }

  function validateYear(): ValidationIssue | null {
    if (!year.nama.trim()) return issue('Nama tahun ajaran wajib diisi.', 'tahun_nama', 2);
    if (!isValidTahunAjaranName(year.nama)) return issue('Format harus YYYY/YYYY, contoh 2026/2027.', 'tahun_nama', 2);
    if (!year.mulai) return issue('Tanggal mulai wajib diisi.', 'tahun_mulai', 2);
    if (!year.selesai) return issue('Tanggal selesai wajib diisi.', 'tahun_selesai', 2);
    if (year.selesai < year.mulai) return issue('Tanggal selesai tidak boleh sebelum tanggal mulai.', 'tahun_selesai', 2);
    const maxSelesai = calculateTahunAjaranSelesai(year.mulai);
    if (year.selesai > maxSelesai) return issue(`Maks ${maxSelesai}.`, 'tahun_selesai', 2);
    return null;
  }

  function validateTingkat(): ValidationIssue | null {
    const valid = tingkatRows.filter((t) => t.nama.trim());
    if (valid.length === 0) return issue('Minimal satu tingkat wajib dibuat.', undefined, 3);
    const names = new Set<string>();
    for (const [i, t] of valid.entries()) {
      if (!t.nama.trim()) return issue(`Nama tingkat baris ${i + 1} wajib diisi.`, `tingkat_nama_${t.id}`, 3);
      const k = t.nama.trim().toLowerCase();
      if (names.has(k)) return issue(`Tingkat duplikat: ${t.nama}.`, `tingkat_nama_${t.id}`, 3);
      names.add(k);
      if (!t.tarif_spp || Number(t.tarif_spp) < 0) return issue(`Tarif SPP tingkat "${t.nama}" wajib diisi minimal 0.`, `tingkat_tarif_${t.id}`, 3);
      const vk = t.kelas.filter((c) => c.nama_kelas.trim());
      if (vk.length === 0) return issue(`Tingkat "${t.nama}" harus punya minimal 1 kelas.`, `tingkat_nama_${t.id}`, 3);
      const cn = new Set<string>();
      for (const [ci, c] of vk.entries()) {
        if (!c.nama_kelas.trim()) return issue(`Nama kelas baris ${ci + 1} pada "${t.nama}" wajib diisi.`, `kelas_nama_${c.id}`, 3);
        const ck = c.nama_kelas.trim().toLowerCase();
        if (cn.has(ck)) return issue(`Kelas duplikat pada "${t.nama}": ${c.nama_kelas}.`, `kelas_nama_${c.id}`, 3);
        cn.add(ck);
      }
    }
    if (Number(cutoff.bulan) < 1 || Number(cutoff.bulan) > 12) return issue('Cutoff bulan tidak valid.', 'cutoff_bulan', 3);
    if (Number(cutoff.tanggal) < 1 || Number(cutoff.tanggal) > 31) return issue('Tanggal cutoff tidak valid.', 'cutoff_tanggal', 3);
    if (Number(sppCutoff.tanggal) < 1 || Number(sppCutoff.tanggal) > 31) return issue('Tanggal cutoff SPP tidak valid.', 'spp_cutoff_tanggal', 3);
    return null;
  }

  function validateBiaya(): ValidationIssue | null {
    if (pendaftaranDiLuarSistem) return null;
    for (const [i, k] of komponenBiaya.entries()) {
      if (!k.nama.trim()) return issue(`Nama komponen biaya baris ${i + 1} wajib diisi.`, `biaya_nama_${k.id}`, 4);
      if (Number(k.nominal) < 0) return issue(`Nominal "${k.nama}" tidak boleh negatif.`, `biaya_nominal_${k.id}`, 4);
    }
    return null;
  }

  function validateMode(): ValidationIssue | null {
    return null; // No validation needed — mode is always chosen (default 'sekarang')
  }

  function validateDiskon(): ValidationIssue | null {
    for (let i = 0; i < diskon.length; i++) {
      const d = diskon[i];
      if (!d.nama.trim()) return issue(`Nama diskon baris ${i + 1} wajib diisi.`, `diskon_nama_${d.id}`, 6);
      if (!d.target_jenis_tagihan?.length) return issue(`Pilih minimal satu target tagihan untuk diskon "${d.nama}".`, `diskon_jenis_${d.id}`, 6);
      for (const target of d.target_jenis_tagihan) {
        const pt = d.potongan_per_target?.[target] || { tipe_diskon: d.tipe_diskon, persen_diskon: d.persen_diskon, nominal_diskon: d.nominal_diskon };
        if (pt.tipe_diskon === 'persen' && (Number(pt.persen_diskon) < 0 || Number(pt.persen_diskon) > 100)) return issue(`Persen diskon "${d.nama}" untuk target "${target}" harus 0-100.`, `diskon_persen_${d.id}_${target}`, 6);
      }
      if (d.aktif && d.klaim_mulai && d.klaim_selesai && d.klaim_selesai < d.klaim_mulai) return issue(`Tanggal selesai klaim diskon "${d.nama}" harus setelah tanggal mulai.`, `diskon_klaim_selesai_${d.id}`, 6);
      if (d.kuota && Number(d.kuota) < 1) return issue(`Kuota diskon "${d.nama}" harus lebih besar dari 0.`, `diskon_kuota_${d.id}`, 6);
    }
    return null;
  }

  function validateNIS(): ValidationIssue | null {
    if (formatNIS.autoGenerate && !formatNIS.komponen.some((k) => k.tipe === 'urut')) return issue('Format NIS otomatis harus punya minimal satu komponen No. Urut.', undefined, 7);
    return null;
  }

  function validateKeamanan(): ValidationIssue | null {
    if (!keamananPin || keamananPin.length < 4) return issue('PIN Kasir wajib diisi minimal 4 angka.', 'keamanan_pin', 8);
    if (!/^\d+$/.test(keamananPin)) return issue('PIN Kasir hanya boleh berisi angka.', 'keamanan_pin', 8);
    if (!keamananSandi || keamananSandi.length < 6) return issue('Sandi Darurat wajib diisi minimal 6 karakter.', 'keamanan_sandi', 8);
    return null;
  }

  function validateMetode(): ValidationIssue | null {
    if (!metodePembayaran.some((i) => i.aktif && i.nama.trim())) return issue('Minimal satu metode pembayaran aktif.', `metode_nama_${metodePembayaran[0]?.id ?? 0}`, 5);
    const mn = new Set<string>();
    for (const [i, m] of metodePembayaran.entries()) {
      if (!m.nama.trim()) return issue(`Nama metode baris ${i + 1} wajib diisi.`, `metode_nama_${m.id}`, 5);
      const k = m.nama.trim().toLowerCase();
      if (mn.has(k)) return issue(`Metode duplikat: ${m.nama}.`, `metode_nama_${m.id}`, 5);
      mn.add(k);
    }
    if (!jenisTagihan.some((i) => i.aktif && i.nama.trim())) return issue('Minimal satu jenis tagihan aktif.', `jenis_tagihan_nama_${jenisTagihan[0]?.id ?? 0}`, 5);
    const jn = new Set<string>();
    for (const [i, j] of jenisTagihan.entries()) {
      if (!j.nama.trim()) return issue(`Nama jenis tagihan baris ${i + 1} wajib diisi.`, `jenis_tagihan_nama_${j.id}`, 5);
      const k = j.nama.trim().toLowerCase();
      if (jn.has(k)) return issue(`Jenis tagihan duplikat: ${j.nama}.`, `jenis_tagihan_nama_${j.id}`, 5);
      jn.add(k);
    }
    return null;
  }

  function validateStep(stepId: StepId) {
    const validators: Record<StepId, () => ValidationIssue | null> = {
      mode: validateMode, profil: validateProfile, tahun: validateYear, tingkat: validateTingkat, biaya: validateBiaya,
      metode: validateMetode, diskon: validateDiskon, nis: validateNIS, keamanan: validateKeamanan, review: validateAll,
    };
    return validators[stepId]();
  }

  function validateAll() {
    return validateMode() || validateProfile() || validateYear() || validateTingkat() || validateBiaya() || validateMetode() || validateDiskon() || validateNIS() || validateKeamanan();
  }

  function validateUntilStep(targetIndex: number) {
    for (let i = 0; i < targetIndex; i += 1) {
      const err = validateStep(steps[i].id);
      if (err) return err;
    }
    return null;
  }

  // ===================== Navigation =====================

  function goNext() {
    const err = validateStep(currentStep.id);
    if (err) { showValidationIssue(err); return; }
    setFieldErrors({});
    setStepIndex((c) => { const n = Math.min(c + 1, steps.length - 1); setMaxStepReached((m) => Math.max(m, n)); return n; });
  }

  function goBack() { setFieldErrors({}); setStepIndex((c) => Math.max(c - 1, 0)); }

  function goToStep(index: number) {
    const err = validateUntilStep(index);
    if (err) { showValidationIssue(err); return; }
    setFieldErrors({}); setMaxStepReached((m) => Math.max(m, index)); setStepIndex(index);
  }

  async function handleSave() {
    if (currentStep.id !== 'review') { addToast({ type: 'error', title: 'Gagal', message: 'Setup hanya bisa disimpan dari langkah Review.' }); return; }
    if (!actor) { addToast({ type: 'error', title: 'Gagal', message: 'Sesi tidak ditemukan. Login ulang.' }); return; }
    const err = validateAll();
    if (err) { showValidationIssue(err); return; }

    requestConfirm({
      title: 'Simpan Setup Awal?',
      description: 'Semua data profil, tahun ajaran, tingkat & kelas, komponen biaya, dan pengaturan lainnya akan disimpan.',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true); setFieldErrors({});
        try {
          await completeSetupAwal(actor, { mode, profile, year, tingkatRows, cutoff, sppCutoff, pendaftaranDiLuarSistem, komponenBiaya, modeTagihanBiaya, jatuhTempoPendaftaran, diskon, formatNIS, metodePembayaran, jenisTagihan, stepIndex, maxStepReached });
          clearSetupAwalDraft();
          addToast({ type: 'success', title: 'Berhasil', message: 'Setup awal berhasil disimpan.' });
          navigate('/');
        } catch (error) {
          console.error('Setup Awal Error:', error);
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan setup awal. Cek console log.' });
        } finally { setIsSubmitting(false); }
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); if (currentStep.id === 'review') { void handleSave(); return; } goNext(); }

  // ===================== Step 0: Mode =====================

  function renderModeStep() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Pilih mode penggunaan sistem sesuai kebutuhan sekolah Anda.
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <button type="button" onClick={() => setMode('sekarang')} className={`rounded-2xl border-2 p-5 text-left transition ${mode === 'sekarang' ? 'border-brand-500 bg-brand-50/70 shadow-md dark:border-brand-600 dark:bg-brand-950/20' : 'border-slate-200 bg-white/70 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/40'}`}>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-2xl dark:bg-brand-950/30">🚀</div>
            <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">Mulai Menggunakan Sistem Sekarang</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Tahun ajaran akan langsung aktif. Cocok untuk sekolah baru atau yang mulai menggunakan
              sistem di tahun ajaran berjalan. Input data siswa existing sebagai data awal.
            </p>
            {mode === 'sekarang' && <p className="mt-3 text-xs font-bold text-brand-600 dark:text-brand-400">✓ Dipilih</p>}
          </button>
          <button type="button" onClick={() => setMode('mendatang')} className={`rounded-2xl border-2 p-5 text-left transition ${mode === 'mendatang' ? 'border-brand-500 bg-brand-50/70 shadow-md dark:border-brand-600 dark:bg-brand-950/20' : 'border-slate-200 bg-white/70 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/40'}`}>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-2xl dark:bg-indigo-950/30">📋</div>
            <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">Persiapan Tahun Ajaran Mendatang</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Tahun ajaran disimpan sebagai draft. Siapkan data calon siswa, tagihan, dan
              konfigurasi untuk tahun ajaran berikutnya. Aktivasi dilakukan nanti melalui Lanjut Tahun Ajaran.
            </p>
            {mode === 'mendatang' && <p className="mt-3 text-xs font-bold text-brand-600 dark:text-brand-400">✓ Dipilih</p>}
          </button>
        </div>
      </div>
    );
  }

  // ===================== Step 1: Profil =====================

  function renderProfileStep() {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField label="Nama lembaga" htmlFor="nama_sekolah" error={fieldErrors.nama_sekolah}><input id="nama_sekolah" value={profile.nama_sekolah} onChange={(e) => setProfile((c) => ({ ...c, nama_sekolah: e.target.value }))} className={inputClassFor('nama_sekolah')} /></FormField>
          <FormField label="Penyelenggara/Yayasan (Opsional)" htmlFor="nama_yayasan" error={fieldErrors.nama_yayasan}><input id="nama_yayasan" value={profile.nama_yayasan} onChange={(e) => setProfile((c) => ({ ...c, nama_yayasan: e.target.value }))} className={inputClassFor('nama_yayasan')} /></FormField>

          <FormField label="Bentuk satuan" htmlFor="bentuk_satuan" error={fieldErrors.bentuk_satuan}>
            <input id="bentuk_satuan" list="bentuk_satuan_list" value={profile.bentuk_satuan} onChange={(e) => setProfile((c) => ({ ...c, bentuk_satuan: e.target.value }))} placeholder="Pilih atau ketik (KB / TK / TPA / SPS)" className={inputClassFor('bentuk_satuan')} />
            <datalist id="bentuk_satuan_list">
              <option value="KB" />
              <option value="TK" />
              <option value="KB-TK" />
              <option value="TPA" />
              <option value="SPS" />
            </datalist>
          </FormField>
          <FormField label="Tahun Berdiri (Opsional)" htmlFor="tahun_berdiri" error={fieldErrors.tahun_berdiri}><input id="tahun_berdiri" value={profile.tahun_berdiri} onChange={(e) => setProfile((c) => ({ ...c, tahun_berdiri: e.target.value.replace(/\D/g, '') }))} className={inputClassFor('tahun_berdiri')} /></FormField>

          <FormField label="Izin Operasional (Opsional)" htmlFor="izin_operasional" error={fieldErrors.izin_operasional}><input id="izin_operasional" value={profile.izin_operasional} onChange={(e) => setProfile((c) => ({ ...c, izin_operasional: e.target.value }))} className={inputClassFor('izin_operasional')} /></FormField>
          <FormField label="NPSN (Jika ada)" htmlFor="npsn" error={fieldErrors.npsn}><input id="npsn" value={profile.npsn} onChange={(e) => setProfile((c) => ({ ...c, npsn: e.target.value.replace(/\D/g, '') }))} className={inputClassFor('npsn')} /></FormField>

          <FormField label="Telepon (Opsional)" htmlFor="telepon" error={fieldErrors.telepon}><input id="telepon" value={profile.telepon} onChange={(e) => setProfile((c) => ({ ...c, telepon: e.target.value }))} className={inputClassFor('telepon')} /></FormField>
          <FormField label="Website (Opsional)" htmlFor="website" error={fieldErrors.website}><input id="website" value={profile.website} onChange={(e) => setProfile((c) => ({ ...c, website: e.target.value }))} placeholder="contoh: paudmelati.sch.id" className={inputClassFor('website')} /></FormField>

          <div className="md:col-span-2">
            <FormField label="Kepala / Pengelola" htmlFor="nama_kepsek" error={fieldErrors.nama_kepsek}><input id="nama_kepsek" value={profile.nama_kepsek} onChange={(e) => setProfile((c) => ({ ...c, nama_kepsek: e.target.value }))} className={inputClassFor('nama_kepsek')} /></FormField>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
          <h3 className="mb-4 text-sm font-extrabold text-slate-800 dark:text-slate-200">Alamat Lengkap</h3>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <FormField label="Jalan / Gang / Nomor Rumah" htmlFor="alamat_jalan" error={fieldErrors.alamat_jalan}><input id="alamat_jalan" value={profile.alamat_jalan} onChange={(e) => setProfile((c) => ({ ...c, alamat_jalan: e.target.value }))} className={inputClassFor('alamat_jalan')} /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-5">
              <FormField label="RT (Opsional)" htmlFor="alamat_rt" error={fieldErrors.alamat_rt}><input id="alamat_rt" value={profile.alamat_rt} onChange={(e) => setProfile((c) => ({ ...c, alamat_rt: e.target.value }))} className={inputClassFor('alamat_rt')} /></FormField>
              <FormField label="RW (Opsional)" htmlFor="alamat_rw" error={fieldErrors.alamat_rw}><input id="alamat_rw" value={profile.alamat_rw} onChange={(e) => setProfile((c) => ({ ...c, alamat_rw: e.target.value }))} className={inputClassFor('alamat_rw')} /></FormField>
            </div>
            <FormField label="Desa / Kelurahan" htmlFor="alamat_desa" error={fieldErrors.alamat_desa}><input id="alamat_desa" value={profile.alamat_desa} onChange={(e) => setProfile((c) => ({ ...c, alamat_desa: e.target.value }))} className={inputClassFor('alamat_desa')} /></FormField>
            <FormField label="Kecamatan" htmlFor="alamat_kecamatan" error={fieldErrors.alamat_kecamatan}><input id="alamat_kecamatan" value={profile.alamat_kecamatan} onChange={(e) => setProfile((c) => ({ ...c, alamat_kecamatan: e.target.value }))} className={inputClassFor('alamat_kecamatan')} /></FormField>
            <FormField label="Kabupaten / Kota" htmlFor="alamat_kabupaten" error={fieldErrors.alamat_kabupaten}><input id="alamat_kabupaten" value={profile.alamat_kabupaten} onChange={(e) => setProfile((c) => ({ ...c, alamat_kabupaten: e.target.value }))} className={inputClassFor('alamat_kabupaten')} /></FormField>
            <FormField label="Provinsi" htmlFor="alamat_provinsi" error={fieldErrors.alamat_provinsi}><input id="alamat_provinsi" value={profile.alamat_provinsi} onChange={(e) => setProfile((c) => ({ ...c, alamat_provinsi: e.target.value }))} className={inputClassFor('alamat_provinsi')} /></FormField>
            <FormField label="Kode Pos (Opsional)" htmlFor="alamat_kode_pos" error={fieldErrors.alamat_kode_pos}><input id="alamat_kode_pos" value={profile.alamat_kode_pos} onChange={(e) => setProfile((c) => ({ ...c, alamat_kode_pos: e.target.value.replace(/\D/g, '') }))} className={inputClassFor('alamat_kode_pos')} /></FormField>
          </div>
        </div>
      </div>
    );
  }

  // ===================== Step 2: Tahun Ajaran =====================

  function renderYearStep() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-sm font-semibold text-brand-700 dark:border-brand-950/50 dark:bg-brand-950/20 dark:text-brand-300">{mode === 'mendatang' ? 'Tahun ajaran akan disimpan sebagai draft. Anda bisa melengkapinya nanti melalui menu Lanjut Tahun Ajaran.' : 'Tahun ajaran akan langsung aktif setelah setup disimpan.'}</div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <FormField label="Nama tahun ajaran" htmlFor="tahun_nama" error={fieldErrors.tahun_nama}><input id="tahun_nama" value={year.nama} onChange={(e) => setYear((c) => ({ ...c, nama: e.target.value }))} placeholder="2026/2027" className={inputClassFor('tahun_nama')} /></FormField>
          <FormField label="Mulai" htmlFor="tahun_mulai" error={fieldErrors.tahun_mulai}><input id="tahun_mulai" type="date" value={year.mulai} onChange={(e) => setYear((c) => ({ ...c, mulai: e.target.value }))} className={inputClassFor('tahun_mulai')} /></FormField>
          <FormField label="Selesai" htmlFor="tahun_selesai" error={fieldErrors.tahun_selesai} hint={year.mulai ? `Maksimal ${calculateTahunAjaranSelesai(year.mulai)}.` : 'Isi tanggal mulai terlebih dahulu.'}><input id="tahun_selesai" type="date" min={year.mulai || undefined} max={year.mulai ? calculateTahunAjaranSelesai(year.mulai) : undefined} value={year.selesai} onChange={(e) => setYear((c) => ({ ...c, selesai: e.target.value }))} className={inputClassFor('tahun_selesai')} /></FormField>
        </div>
      </div>
    );
  }

  // ===================== Step 3: Tingkat & Kelas =====================

  function renderTingkatStep() {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          <strong>Tingkat</strong> adalah jenjang (contoh: Kelompok Bermain, TK A, TK B). Tarif SPP dan aturan usia dilekatkan ke tingkat.<br />
          <strong>Kelas</strong> adalah rombel dalam satu tingkat (contoh: Mawar, Melati). Satu tingkat bisa punya beberapa kelas.
        </div>

        <div className="space-y-3">
          {tingkatRows.map((t, tIdx) => {
            const isOpen = expandedTingkat[t.id] !== false;
            return (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/50 overflow-hidden">
                {/* Tingkat header */}
                <button type="button" onClick={() => toggleTingkat(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-extrabold text-brand-700 dark:bg-brand-950/30 dark:text-brand-400">{tIdx + 1}</span>
                  <span className="flex-1 truncate text-sm font-extrabold text-slate-800 dark:text-slate-100">{t.nama.trim() || `Tingkat ${tIdx + 1}`}</span>
                  <span className="text-xs text-slate-400">{t.kelas.length} kelas</span>
                  {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800 space-y-4">
                    {/* Tingkat fields */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <FormField label="Nama Tingkat" htmlFor={`tingkat_nama_${t.id}`} error={fieldErrors[`tingkat_nama_${t.id}`]}><input id={`tingkat_nama_${t.id}`} value={t.nama} onChange={(e) => updateTingkat(t.id, 'nama', e.target.value)} className={inputClassFor(`tingkat_nama_${t.id}`, compactInputClass)} /></FormField>
                      <FormField label="Kode (untuk NIS)" htmlFor={`tingkat_kode_${t.id}`}><input id={`tingkat_kode_${t.id}`} value={t.kode} onChange={(e) => updateTingkat(t.id, 'kode', e.target.value)} placeholder="misal: KB, A, B" className={compactInputClass} /></FormField>
                      <FormField label="Tarif SPP" htmlFor={`tingkat_tarif_${t.id}`} error={fieldErrors[`tingkat_tarif_${t.id}`]}><input id={`tingkat_tarif_${t.id}`} inputMode="numeric" value={formatNumberInput(t.tarif_spp)} onChange={(e) => updateTingkat(t.id, 'tarif_spp', parseNumberInput(e.target.value))} className={inputClassFor(`tingkat_tarif_${t.id}`, compactInputClass)} /></FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <FormField label="Usia Minimal" htmlFor={`tingkat_usia_min_${t.id}`}><input id={`tingkat_usia_min_${t.id}`} inputMode="numeric" value={t.usia_min_tahun} onChange={(e) => updateTingkat(t.id, 'usia_min_tahun', e.target.value.replace(/\D/g, ''))} placeholder="tahun" className={compactInputClass} /></FormField>
                      <FormField label="Usia Maksimal" htmlFor={`tingkat_usia_max_${t.id}`}><input id={`tingkat_usia_max_${t.id}`} inputMode="numeric" value={t.usia_max_tahun} onChange={(e) => updateTingkat(t.id, 'usia_max_tahun', e.target.value.replace(/\D/g, ''))} placeholder="tahun" className={compactInputClass} /></FormField>
                    </div>

                    {/* Kelas list */}
                    <div className="space-y-2">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Kelas dalam tingkat ini</p>
                      {t.kelas.map((kls, kIdx) => (
                        <div key={kls.id} className="grid grid-cols-[1fr_auto_auto] items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <FormField label={`Nama Kelas ${kIdx + 1}`} htmlFor={`kelas_nama_${kls.id}`} error={fieldErrors[`kelas_nama_${kls.id}`]}><input id={`kelas_nama_${kls.id}`} value={kls.nama_kelas} onChange={(e) => updateKelas(t.id, kls.id, 'nama_kelas', e.target.value)} placeholder="misal: Mawar, Melati" className={inputClassFor(`kelas_nama_${kls.id}`, compactInputClass)} /></FormField>
                            <FormField label="Kapasitas" htmlFor={`kelas_kap_${kls.id}`}><input id={`kelas_kap_${kls.id}`} inputMode="numeric" value={kls.kapasitas_siswa} onChange={(e) => updateKelas(t.id, kls.id, 'kapasitas_siswa', e.target.value.replace(/\D/g, ''))} className={compactInputClass} /></FormField>
                          </div>
                          <button type="button" onClick={() => removeKelas(t.id, kls.id)} disabled={t.kelas.length === 1} className="mt-7 rounded-xl border border-danger-100 p-2 text-danger-600 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-danger-950/50 dark:text-danger-400"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addKelasToTingkat(t.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"><Plus className="h-3.5 w-3.5" /> Tambah Kelas</button>
                    </div>

                    {/* Remove tingkat */}
                    <div className="flex justify-end">
                      <button type="button" onClick={() => removeTingkat(t.id)} disabled={tingkatRows.length === 1} className="inline-flex items-center gap-1.5 rounded-xl border border-danger-100 px-3 py-2 text-xs font-bold text-danger-600 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-danger-950/50 dark:text-danger-400"><Trash2 className="h-3.5 w-3.5" /> Hapus Tingkat</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" onClick={addTingkat} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"><Plus className="h-4 w-4" /> Tambah Tingkat</button>

        {/* Aturan Usia / Cutoff */}
        <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Aturan Penempatan Usia</p>
          <p className="mt-1 text-xs text-slate-500">Cutoff tanggal untuk menghitung umur siswa. Contoh: cutoff 1 Juli 2026 berarti tahun ajaran 2026/2027 menghitung umur siswa per 1 Juli 2026.</p>
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Bulan cutoff" htmlFor="cutoff_bulan" error={fieldErrors.cutoff_bulan}><select id="cutoff_bulan" value={cutoff.bulan} onChange={(e) => setCutoff((c) => ({ ...c, bulan: e.target.value }))} className={inputClassFor('cutoff_bulan')}>{monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></FormField>
            <FormField label="Tanggal cutoff" htmlFor="cutoff_tanggal" error={fieldErrors.cutoff_tanggal}><input id="cutoff_tanggal" value={cutoff.tanggal} onChange={(e) => setCutoff((c) => ({ ...c, tanggal: e.target.value.replace(/\D/g, '').slice(0, 2) }))} className={inputClassFor('cutoff_tanggal')} /></FormField>
          </div>
        </div>

        {/* SPP Generate Cutoff */}
        <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Cutoff SPP Pindahan</p>
          <p className="mt-1 text-xs text-slate-500">SPP siswa pindahan dimulai bulan depan jika tanggal daftar melewati cutoff.</p>
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <input type="checkbox" checked={sppCutoff.aktif} onChange={(e) => setSppCutoff((c) => ({ ...c, aktif: e.target.checked }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <div><p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Aktifkan cutoff SPP pindahan</p></div>
            </label>
            <FormField label="Cutoff tanggal" htmlFor="spp_cutoff_tanggal" error={fieldErrors.spp_cutoff_tanggal}><input id="spp_cutoff_tanggal" value={sppCutoff.tanggal} onChange={(e) => setSppCutoff((c) => ({ ...c, tanggal: e.target.value.replace(/\D/g, '').slice(0, 2) }))} className={inputClassFor('spp_cutoff_tanggal')} /></FormField>
          </div>
        </div>
      </div>
    );
  }

  // ===================== Step 4: Komponen Biaya =====================

  function renderBiayaStep() {
    const totalBiaya = komponenBiaya.reduce((sum, k) => sum + Number(k.nominal || 0), 0);
    const showBiayaContent = mode === 'mendatang' || !pendaftaranDiLuarSistem;
    return (
      <div className="space-y-5">
        {mode === 'sekarang' && (
          <label className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-sm font-bold text-brand-700 dark:border-brand-950/40 dark:bg-brand-950/20 dark:text-brand-300">
            <input type="checkbox" checked={pendaftaranDiLuarSistem} onChange={(e) => setPendaftaranDiLuarSistem(e.target.checked)} className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-600" />
            Pendaftaran dilakukan di luar sistem (Tagihan awal pendaftaran tidak dibuat otomatis)
          </label>
        )}

        {showBiayaContent && (
          <>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
              Komponen biaya pendaftaran. Anda bisa menambah beberapa komponen (Uang Pangkal, Seragam, Buku, dll). Pilih apakah semua komponen dijadikan satu tagihan atau dipisah menjadi tagihan terpisah per komponen.
            </div>

            <div className="space-y-3">
              {komponenBiaya.map((k, i) => (
                <div key={k.id} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 md:grid-cols-[1fr_1fr_auto_auto] md:items-start">
                  <FormField label={`Komponen ${i + 1}`} htmlFor={`biaya_nama_${k.id}`} error={fieldErrors[`biaya_nama_${k.id}`]}><input id={`biaya_nama_${k.id}`} value={k.nama} onChange={(e) => updateKomponenBiaya(k.id, 'nama', e.target.value)} placeholder="misal: Uang Pangkal" className={inputClassFor(`biaya_nama_${k.id}`)} /></FormField>
                  <FormField label="Nominal" htmlFor={`biaya_nominal_${k.id}`} error={fieldErrors[`biaya_nominal_${k.id}`]}><input id={`biaya_nominal_${k.id}`} inputMode="numeric" value={formatNumberInput(k.nominal)} onChange={(e) => updateKomponenBiaya(k.id, 'nominal', parseNumberInput(e.target.value))} className={inputClassFor(`biaya_nominal_${k.id}`)} /></FormField>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm font-bold text-slate-600 dark:border-slate-800 dark:text-slate-300 md:mt-7"><input type="checkbox" checked={k.wajib} onChange={(e) => updateKomponenBiaya(k.id, 'wajib', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" /> Wajib</label>
                  <button type="button" onClick={() => removeKomponenBiaya(k.id)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-danger-100 px-3 py-2.5 text-sm font-bold text-danger-700 hover:bg-danger-50 dark:border-danger-950/50 dark:text-danger-400 md:mt-7"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>

            <button type="button" onClick={addKomponenBiaya} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"><Plus className="h-4 w-4" /> Tambah Komponen</button>

            {komponenBiaya.length > 0 && (
              <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 dark:border-brand-950/50 dark:bg-brand-950/20">
                <p className="text-sm font-extrabold text-brand-700 dark:text-brand-300">Total: {currency(totalBiaya)}</p>
                <div className="mt-3 flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <input type="radio" name="mode_tagihan" checked={modeTagihanBiaya === 'gabung'} onChange={() => setModeTagihanBiaya('gabung')} className="h-4 w-4 text-brand-600" /> Gabung jadi 1 tagihan
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                    <input type="radio" name="mode_tagihan" checked={modeTagihanBiaya === 'pisah'} onChange={() => setModeTagihanBiaya('pisah')} className="h-4 w-4 text-brand-600" /> Pisah per komponen
                  </label>
                </div>
              </div>
            )}

            {/* Jatuh Tempo Pendaftaran */}
            <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Jatuh Tempo Pendaftaran</p>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label="Mode" htmlFor="jt_mode">
                  <select id="jt_mode" value={jatuhTempoPendaftaran.mode} onChange={(e) => setJatuhTempoPendaftaran((c) => ({ ...c, mode: e.target.value as 'tanggal_tetap' | 'hari_setelah_daftar' }))} className={inputClass}>
                    <option value="tanggal_tetap">Tanggal tetap</option>
                    <option value="hari_setelah_daftar">Hari setelah daftar</option>
                  </select>
                </FormField>
                {jatuhTempoPendaftaran.mode === 'tanggal_tetap' ? (
                  <FormField label="Tanggal jatuh tempo" htmlFor="jt_tanggal" error={fieldErrors.jt_tanggal}><input id="jt_tanggal" type="date" value={jatuhTempoPendaftaran.tanggal} onChange={(e) => setJatuhTempoPendaftaran((c) => ({ ...c, tanggal: e.target.value }))} className={inputClassFor('jt_tanggal')} /></FormField>
                ) : (
                  <FormField label="Hari setelah daftar" htmlFor="jt_hari"><input id="jt_hari" inputMode="numeric" value={jatuhTempoPendaftaran.hari} onChange={(e) => setJatuhTempoPendaftaran((c) => ({ ...c, hari: e.target.value.replace(/\D/g, '') }))} className={inputClass} /></FormField>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ===================== Step 5: Promo/Diskon =====================

  function renderDiskonStep() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Diskon/promo yang bisa dikenakan ke jenis tagihan. Atur rentang masa klaim dan masa berlakunya.
          <br /><span className="mt-1 block font-semibold text-brand-600 dark:text-brand-400">Anda bisa melewati langkah ini jika belum ada diskon.</span>
        </div>

        <div className="space-y-4">
          {diskon.map((d, i) => (
            <div key={d.id} className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Promo {i + 1}</p>
                <button type="button" onClick={() => removeDiskon(d.id)} className="rounded-xl border border-danger-100 p-2 text-danger-600 hover:bg-danger-50 dark:border-danger-950/50 dark:text-danger-400"><Trash2 className="h-4 w-4" /></button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <FormField label="Nama Promo" htmlFor={`diskon_nama_${d.id}`} error={fieldErrors[`diskon_nama_${d.id}`]}><input id={`diskon_nama_${d.id}`} value={d.nama} onChange={(e) => updateDiskon(d.id, { nama: e.target.value })} placeholder="misal: Early Bird" className={inputClassFor(`diskon_nama_${d.id}`, compactInputClass)} /></FormField>
                <FormField label="Target Tagihan" htmlFor={`diskon_target_${d.id}`} error={fieldErrors[`diskon_jenis_${d.id}`]}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {[
                      { id: 'semua', label: 'Semua' },
                      { id: 'spp', label: 'SPP' },
                      { id: 'pendaftaran', label: 'Pendaftaran' },
                      ...jenisTagihan.filter(j => j.nama.toLowerCase() !== 'spp' && j.nama.toLowerCase() !== 'pendaftaran').map(j => ({ id: j.id, label: j.nama }))
                    ].map(opt => {
                      const currentTargets = d.target_jenis_tagihan?.length ? d.target_jenis_tagihan : [d.jenis_tagihan || 'semua'];
                      const isChecked = currentTargets.includes(opt.id) || currentTargets.includes('semua');
                      return (
                        <label key={opt.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                            checked={opt.id === 'semua' ? currentTargets.includes('semua') : isChecked}
                            onChange={(e) => {
                              let current = [...currentTargets];

                              if (e.target.checked) {
                                if (opt.id === 'semua') current = ['semua'];
                                else {
                                  current = current.filter(x => x !== 'semua');
                                  if (!current.includes(opt.id)) current.push(opt.id);
                                }
                              } else {
                                if (opt.id === 'semua') current = [];
                                else current = current.filter(x => x !== opt.id);
                              }
                              updateDiskon(d.id, { target_jenis_tagihan: current, jenis_tagihan: current.length === 1 ? current[0] : 'multi' });
                            }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                </FormField>
                <div className="md:col-span-2 lg:col-span-4 space-y-4">
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Nilai Potongan per Target</p>
                  {(d.target_jenis_tagihan?.length ? d.target_jenis_tagihan : [d.jenis_tagihan || 'semua']).map(targetId => {
                    const targetLabel = targetId === 'semua' ? 'Semua Tagihan' : targetId === 'spp' ? 'SPP' : targetId === 'pendaftaran' ? 'Pendaftaran' : (jenisTagihan.find(j => j.id === targetId)?.nama || targetId);
                    const pt = d.potongan_per_target?.[targetId] || { tipe_diskon: d.tipe_diskon, persen_diskon: Number(d.persen_diskon || 0), nominal_diskon: Number(d.nominal_diskon || 0) };

                    return (
                      <div key={targetId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-end rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/30">
                        <div>
                          <label className="mb-1 block text-[13px] font-bold text-slate-700 dark:text-slate-300">Target</label>
                          <div className="h-10 flex items-center px-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 text-sm font-semibold truncate">{targetLabel}</div>
                        </div>
                        <FormField label="Tipe Potongan" htmlFor={`diskon_tipe_${d.id}_${targetId}`}>
                          <select id={`diskon_tipe_${d.id}_${targetId}`} value={pt.tipe_diskon} onChange={(e) => {
                            const newPt = { ...(d.potongan_per_target || {}), [targetId]: { ...pt, tipe_diskon: e.target.value as 'persen' | 'nominal' } };
                            updateDiskon(d.id, { potongan_per_target: newPt, ...(targetId === 'semua' || targetId === (d.target_jenis_tagihan?.[0] || 'semua') ? { tipe_diskon: e.target.value as 'persen' | 'nominal' } : {}) });
                          }} className={compactInputClass}>
                            <option value="persen">Persentase (%)</option>
                            <option value="nominal">Nominal Rupiah (Rp)</option>
                          </select>
                        </FormField>
                        {pt.tipe_diskon === 'persen' ? (
                          <FormField label="Nilai Potongan (%)" htmlFor={`diskon_persen_${d.id}_${targetId}`} error={fieldErrors[`diskon_persen_${d.id}_${targetId}`]}>
                            <input id={`diskon_persen_${d.id}_${targetId}`} inputMode="numeric" value={pt.persen_diskon} onChange={(e) => {
                              const val = Number(e.target.value.replace(/[^\d.]/g, ''));
                              const newPt = { ...(d.potongan_per_target || {}), [targetId]: { ...pt, persen_diskon: val } };
                              updateDiskon(d.id, { potongan_per_target: newPt, ...(targetId === 'semua' || targetId === (d.target_jenis_tagihan?.[0] || 'semua') ? { persen_diskon: val.toString() } : {}) });
                            }} className={inputClassFor(`diskon_persen_${d.id}_${targetId}`, compactInputClass)} />
                          </FormField>
                        ) : (
                          <FormField label="Nilai Potongan (Rp)" htmlFor={`diskon_nominal_${d.id}_${targetId}`}>
                            <input id={`diskon_nominal_${d.id}_${targetId}`} inputMode="numeric" value={formatNumberInput(pt.nominal_diskon)} onChange={(e) => {
                              const val = Number(parseNumberInput(e.target.value));
                              const newPt = { ...(d.potongan_per_target || {}), [targetId]: { ...pt, nominal_diskon: val } };
                              updateDiskon(d.id, { potongan_per_target: newPt, ...(targetId === 'semua' || targetId === (d.target_jenis_tagihan?.[0] || 'semua') ? { nominal_diskon: val.toString() } : {}) });
                            }} className={compactInputClass} />
                          </FormField>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* KHUSUS PENDAFTARAN JIKA DIPISAH: Pilih Komponen */}
              {(d.target_jenis_tagihan?.includes('pendaftaran') || d.target_jenis_tagihan?.includes('semua') || d.jenis_tagihan === 'semua' || d.jenis_tagihan === 'pendaftaran') && modeTagihanBiaya === 'pisah' && komponenBiaya.length > 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10">
                  <div>
                    <h3 className="text-sm font-extrabold text-amber-800 dark:text-amber-300">Target Komponen Pendaftaran</h3>
                    <p className="mt-0.5 text-[11px] leading-tight text-amber-600/80 dark:text-amber-400/80">Karena tagihan pendaftaran dipisah, Anda bisa membatasi potongan ini hanya untuk komponen tertentu secara default.</p>
                  </div>
                  <div className="mt-4">
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                          checked={!d.target_komponen_biaya || d.target_komponen_biaya.length === 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateDiskon(d.id, { target_komponen_biaya: [] });
                            }
                          }}
                        />
                        <span className={(!d.target_komponen_biaya || d.target_komponen_biaya.length === 0) ? "font-bold text-brand-700 dark:text-brand-400" : ""}>Berlaku untuk semua komponen Pendaftaran</span>
                      </label>
                      <div className="ml-6 flex flex-col gap-2 border-l-2 border-slate-200 pl-4 mt-1 dark:border-slate-700">
                        {komponenBiaya.map(kb => {
                          const isChecked = d.target_komponen_biaya?.includes(kb.nama) ?? false;
                          return (
                            <label key={kb.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                                checked={isChecked}
                                onChange={(e) => {
                                  let current = [...(d.target_komponen_biaya || [])];
                                  if (e.target.checked) {
                                    if (!current.includes(kb.nama)) current.push(kb.nama);
                                  } else {
                                    current = current.filter(x => x !== kb.nama);
                                  }
                                  updateDiskon(d.id, { target_komponen_biaya: current });
                                }}
                              />
                              <span className={isChecked ? "font-semibold" : ""}>{kb.nama || '(Tanpa Nama)'}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* KHUSUS SPP: Konfigurasi Berulang */}
              {(d.target_jenis_tagihan?.includes('spp') || d.target_jenis_tagihan?.includes('semua') || d.jenis_tagihan === 'semua' || d.jenis_tagihan === 'spp') && (
                <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4 dark:border-brand-900/30 dark:bg-brand-900/10">
                  <div>
                    <h3 className="text-sm font-extrabold text-brand-800 dark:text-brand-300">Siklus Potongan SPP</h3>
                    <p className="mt-0.5 text-[11px] leading-tight text-brand-600/80 dark:text-brand-400/80">Karena SPP ditagih setiap bulan, tentukan di bulan apa saja potongan ini berlaku.</p>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField label="Berlaku Pada" htmlFor={`mode_tagihan_berulang_${d.id}`}>
                      <select
                        id={`mode_tagihan_berulang_${d.id}`}
                        value={d.mode_tagihan_berulang || 'otomatis'}
                        onChange={(e) => updateDiskon(d.id, { mode_tagihan_berulang: e.target.value as 'otomatis' | 'manual' })}
                        className={compactInputClass}
                      >
                        <option value="otomatis">Setiap Bulan (Selama setahun penuh)</option>
                        <option value="tertentu">Bulan-bulan tertentu saja</option>
                      </select>
                    </FormField>

                    {d.mode_tagihan_berulang === 'tertentu' && (
                      <div className="md:col-span-2">
                        <p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">Pilih Bulan Berlakunya Promo SPP</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                          {['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'].map((bln, idx) => {
                            const mNumber = idx < 6 ? idx + 7 : idx - 5; // Jul=7...Jun=6
                            const isChecked = d.bulan_tertentu?.includes(mNumber) ?? false;
                            return (
                              <label key={mNumber} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    let current = [...(d.bulan_tertentu || [])];
                                    if (e.target.checked) {
                                      if (!current.includes(mNumber)) current.push(mNumber);
                                    } else {
                                      current = current.filter(x => x !== mNumber);
                                    }
                                    updateDiskon(d.id, { bulan_tertentu: current });
                                  }}
                                />
                                {bln}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800/50 dark:bg-slate-900/30">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Masa Klaim Promo</p>
                  <p className="text-[11px] leading-tight text-slate-400">Rentang waktu promo ini bisa dipilih di formulir siswa.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Mulai (opsional)" htmlFor={`diskon_klaim_mulai_${d.id}`}><input id={`diskon_klaim_mulai_${d.id}`} type="date" value={d.klaim_mulai} onChange={(e) => updateDiskon(d.id, { klaim_mulai: e.target.value })} className={compactInputClass} /></FormField>
                    <FormField label="Selesai (opsional)" htmlFor={`diskon_klaim_selesai_${d.id}`} error={fieldErrors[`diskon_klaim_selesai_${d.id}`]}><input id={`diskon_klaim_selesai_${d.id}`} type="date" value={d.klaim_selesai} onChange={(e) => updateDiskon(d.id, { klaim_selesai: e.target.value })} className={inputClassFor(`diskon_klaim_selesai_${d.id}`, compactInputClass)} /></FormField>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800/50 dark:bg-slate-900/30">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Batas Kali Penggunaan</p>
                  <p className="text-[11px] leading-tight text-slate-400">Berapa kali promo memotong per siswa.</p>
                  <div className="grid grid-cols-1 gap-3">
                    <FormField label="Maksimal (opsional)" htmlFor={`diskon_batas_kali_${d.id}`}><input id={`diskon_batas_kali_${d.id}`} inputMode="numeric" value={d.batas_kali_penggunaan} onChange={(e) => updateDiskon(d.id, { batas_kali_penggunaan: e.target.value.replace(/\\D/g, '') })} placeholder="Kosongkan untuk selamanya" className={compactInputClass} /></FormField>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 items-center">

                <div className="lg:col-span-2">
                  <FormField label="Kuota Maksimal Penerima (opsional)" htmlFor={`diskon_kuota_${d.id}`} error={fieldErrors[`diskon_kuota_${d.id}`]}>
                    <input id={`diskon_kuota_${d.id}`} inputMode="numeric" value={d.kuota} onChange={(e) => updateDiskon(d.id, { kuota: e.target.value.replace(/\D/g, '') })} placeholder="Kosongkan jika tidak terbatas" className={inputClassFor(`diskon_kuota_${d.id}`, compactInputClass)} />
                  </FormField>
                </div>

                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 lg:justify-end">
                  <input type="checkbox" checked={d.aktif} onChange={(e) => updateDiskon(d.id, { aktif: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                  Aktifkan promo ini
                </label>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={addDiskon} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"><Plus className="h-4 w-4" /> Tambah Diskon</button>
      </div>
    );
  }

  // ===================== Step 6: Format NIS =====================

  const nisPreview = useMemo(() => previewNIS(formatNIS), [formatNIS]);
  const nisCountByTipe = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const k of formatNIS.komponen) counts[k.tipe] = (counts[k.tipe] || 0) + 1;
    return counts;
  }, [formatNIS]);

  function renderNISStep() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Atur format NIS yang akan di-generate otomatis. Susun komponen dari atas ke bawah untuk menentukan urutan segmen NIS.
        </div>

        {/* Auto generate toggle */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300"><input type="checkbox" checked={formatNIS.autoGenerate} onChange={(e) => setFormatNIS((c) => ({ ...c, autoGenerate: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-brand-600" /> Generate NIS otomatis</label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300"><input type="checkbox" checked={formatNIS.resetUrutPerTahun} onChange={(e) => setFormatNIS((c) => ({ ...c, resetUrutPerTahun: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-brand-600" /> Reset nomor urut per tahun ajaran</label>
        </div>

        {formatNIS.autoGenerate && (
          <>
            {/* Separator */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Separator:</span>
              {(['-', '/', '.', ''] as const).map((sep) => (
                <button key={sep || 'none'} type="button" onClick={() => setFormatNIS((c) => ({ ...c, separator: sep }))} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${formatNIS.separator === sep ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>{sep || '(tanpa)'}</button>
              ))}
            </div>

            {/* Preview */}
            <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-4 dark:border-brand-950/50 dark:bg-brand-950/20">
              <p className="text-xs font-extrabold uppercase tracking-wide text-brand-500">Preview NIS</p>
              <p className="mt-1 text-2xl font-extrabold tracking-wider text-brand-700 dark:text-brand-300">{nisPreview || '—'}</p>
            </div>

            {/* Komponen list */}
            <div className="space-y-2">
              {formatNIS.komponen.map((k, idx) => {
                const meta = NIS_TIPE_OPTIONS.find((o) => o.tipe === k.tipe);
                return (
                  <div key={k.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-slate-100 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="flex flex-col gap-1">
                      <button type="button" onClick={() => moveNISKomponen(idx, -1)} disabled={idx === 0} className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30"><GripVertical className="h-4 w-4" /></button>
                      <button type="button" onClick={() => moveNISKomponen(idx, 1)} disabled={idx === formatNIS.komponen.length - 1} className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30"><GripVertical className="h-4 w-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:items-center">
                      <div>
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-extrabold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{meta?.label ?? k.tipe}</span>
                        <p className="mt-1 text-xs text-slate-400">{meta?.description}</p>
                      </div>
                      {(k.tipe === 'prefix' || k.tipe === 'custom') && (
                        <input value={k.cfg} onChange={(e) => updateNISKomponen(k.id, { cfg: e.target.value })} placeholder="teks..." className={compactInputClass} />
                      )}
                      {k.tipe === 'tahun' && (
                        <select value={k.cfg} onChange={(e) => updateNISKomponen(k.id, { cfg: e.target.value })} className={compactInputClass}>
                          {NIS_TAHUN_CFG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                      {k.tipe === 'urut' && (
                        <select value={k.cfg} onChange={(e) => updateNISKomponen(k.id, { cfg: e.target.value })} className={compactInputClass}>
                          <option value="3">3 digit (001)</option>
                          <option value="4">4 digit (0001)</option>
                          <option value="5">5 digit (00001)</option>
                        </select>
                      )}
                      {k.tipe === 'thlahir' && (
                        <select value={k.cfg} onChange={(e) => updateNISKomponen(k.id, { cfg: e.target.value })} className={compactInputClass}>
                          <option value="2digit">2 digit (20)</option>
                          <option value="4digit">4 digit (2020)</option>
                        </select>
                      )}
                    </div>
                    <button type="button" onClick={() => removeNISKomponen(k.id)} className="rounded-xl border border-danger-100 p-2 text-danger-600 hover:bg-danger-50 dark:border-danger-950/50 dark:text-danger-400"><X className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>

            {/* Add komponen buttons */}
            <div className="flex flex-wrap gap-2">
              {NIS_TIPE_OPTIONS.map((opt) => {
                const count = nisCountByTipe[opt.tipe] || 0;
                const disabled = count >= opt.maxCount;
                return <button key={opt.tipe} type="button" disabled={disabled} onClick={() => addNISKomponen(opt.tipe)} className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"><Plus className="inline h-3 w-3 mr-1" />{opt.label}</button>;
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ===================== Step 7: Metode & Tagihan =====================

  function renderMetodeStep() {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="text-sm text-slate-600 dark:text-slate-400"><p className="font-extrabold text-slate-800 dark:text-slate-100">Metode Pembayaran</p><p className="mt-1">Master global untuk pencatatan transaksi.</p></div>
          <div className="space-y-3">
            {metodePembayaran.map((item, index) => (
              <div key={item.id} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 md:grid-cols-[1fr_auto_auto] md:items-start">
                <FormField label={`Metode ${index + 1}`} htmlFor={`metode_nama_${item.id}`} error={fieldErrors[`metode_nama_${item.id}`]}><input id={`metode_nama_${item.id}`} value={item.nama} onChange={(e) => updateMetode(item.id, 'nama', e.target.value)} className={inputClassFor(`metode_nama_${item.id}`)} /></FormField>
                <label className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm font-bold text-slate-600 dark:border-slate-800 dark:text-slate-300 md:mt-7"><input type="checkbox" checked={item.aktif} onChange={(e) => updateMetode(item.id, 'aktif', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" /> Aktif</label>
                <button type="button" onClick={() => removeMetode(item.id)} disabled={metodePembayaran.length === 1} className="inline-flex items-center justify-center gap-2 rounded-xl border border-danger-100 px-4 py-2.5 text-sm font-bold text-danger-700 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-danger-950/50 dark:text-danger-400 md:mt-7"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addMetode} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"><Plus className="h-4 w-4" /> Tambah Metode</button>
        </div>
        <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="text-sm text-slate-600 dark:text-slate-400"><p className="font-extrabold text-slate-800 dark:text-slate-100">Jenis Tagihan</p><p className="mt-1">Master global untuk tagihan, filter, dan laporan.</p></div>
          <div className="space-y-3">
            {jenisTagihan.map((item, index) => (
              <div key={item.id} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 md:grid-cols-[1fr_auto_auto] md:items-start">
                <FormField label={`Jenis tagihan ${index + 1}`} htmlFor={`jenis_tagihan_nama_${item.id}`} error={fieldErrors[`jenis_tagihan_nama_${item.id}`]}><input id={`jenis_tagihan_nama_${item.id}`} value={item.nama} onChange={(e) => updateJenisTagihan(item.id, 'nama', e.target.value)} className={inputClassFor(`jenis_tagihan_nama_${item.id}`)} /></FormField>
                <label className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm font-bold text-slate-600 dark:border-slate-800 dark:text-slate-300 md:mt-7"><input type="checkbox" checked={item.aktif} onChange={(e) => updateJenisTagihan(item.id, 'aktif', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" /> Aktif</label>
                <button type="button" onClick={() => removeJenisTagihan(item.id)} disabled={jenisTagihan.length === 1} className="inline-flex items-center justify-center gap-2 rounded-xl border border-danger-100 px-4 py-2.5 text-sm font-bold text-danger-700 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-danger-950/50 dark:text-danger-400 md:mt-7"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addJenisTagihan} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"><Plus className="h-4 w-4" /> Tambah Jenis</button>
        </div>
      </div>
    );
  }

  // ===================== Step 8: Keamanan =====================

  function renderKeamananStep() {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-sm text-brand-700 dark:border-brand-950/50 dark:bg-brand-950/20 dark:text-brand-300">
          <strong>Penting:</strong> Ubah sandi bawaan untuk mencegah akses tidak sah ke data lokal di laptop ini saat offline.
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField label="PIN Kasir (Akses cepat transaksi)" htmlFor="keamanan_pin" error={fieldErrors.keamanan_pin} hint="Minimal 4 angka. Bawaan: 123456">
            <input id="keamanan_pin" type="password" inputMode="numeric" pattern="[0-9]*" value={keamananPin} onChange={(e) => setKeamananPin(e.target.value)} placeholder="Contoh: 123456" className={inputClassFor('keamanan_pin')} />
          </FormField>
          <FormField label="Sandi Darurat (Akses penuh saat offline)" htmlFor="keamanan_sandi" error={fieldErrors.keamanan_sandi} hint="Minimal 6 karakter. Bawaan: doomsday123">
            <input id="keamanan_sandi" type="password" value={keamananSandi} onChange={(e) => setKeamananSandi(e.target.value)} placeholder="Contoh: doomsday123" className={inputClassFor('keamanan_sandi')} />
          </FormField>
        </div>
      </div>
    );
  }

  // ===================== Step 9: Review =====================

  function renderReviewStep() {
    const validTingkat = tingkatRows.filter((t) => t.nama.trim());
    const totalKelas = validTingkat.reduce((s, t) => s + t.kelas.filter((k) => k.nama_kelas.trim()).length, 0);
    const totalBiaya = komponenBiaya.reduce((s, k) => s + Number(k.nominal || 0), 0);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Mode Penggunaan</p><p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{mode === 'mendatang' ? 'Persiapan Tahun Mendatang' : 'Mulai Sekarang'}</p></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Profil Sekolah</p><p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{profile.nama_sekolah || '-'}</p></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{mode === 'mendatang' ? 'Tahun Ajaran (Draft)' : 'Tahun Ajaran Aktif'}</p><p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{year.nama || '-'}</p><p className="mt-1 text-sm text-slate-500">{year.mulai} s/d {year.selesai}</p></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Tingkat & Kelas</p><p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{validTingkat.length} tingkat, {totalKelas} kelas</p></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Komponen Biaya</p><p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{currency(totalBiaya)}</p><p className="mt-1 text-sm text-slate-500">{komponenBiaya.length} komponen, {modeTagihanBiaya === 'gabung' ? '1 tagihan gabungan' : 'tagihan terpisah'}</p></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Promo / Diskon</p><p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{diskon.filter((d) => d.aktif).length} aktif</p><p className="mt-1 text-sm text-slate-500">{diskon.map((d) => d.nama).filter(Boolean).join(', ') || 'Tidak ada'}</p></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Format NIS</p><p className="mt-2 text-lg font-extrabold tracking-wider text-slate-800 dark:text-slate-100">{formatNIS.autoGenerate ? nisPreview : 'Manual'}</p></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Metode Pembayaran</p><p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{metodePembayaran.filter((i) => i.aktif).length} aktif</p><p className="mt-1 text-sm text-slate-500">{metodePembayaran.filter((i) => i.aktif).map((i) => i.nama).join(', ') || '-'}</p></div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Jenis Tagihan</p><p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{jenisTagihan.filter((i) => i.aktif).length} aktif</p><p className="mt-1 text-sm text-slate-500">{jenisTagihan.filter((i) => i.aktif).map((i) => i.nama).join(', ') || '-'}</p></div>
        </div>

        {/* Tingkat/Kelas detail */}
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200">Ringkasan Tingkat & Kelas</p>
          <div className="mt-3 space-y-2">
            {validTingkat.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-slate-700 dark:text-slate-200">{t.nama}</span>
                  <span className="text-sm text-slate-500">{currency(t.tarif_spp)}/bulan</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {t.kelas.filter((k) => k.nama_kelas.trim()).map((k) => (
                    <span key={k.id} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{k.nama_kelas}{k.kapasitas_siswa ? ` (${k.kapasitas_siswa})` : ''}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Cutoff umur: {cutoff.tanggal} {monthOptions.find((m) => m.value === cutoff.bulan)?.label ?? cutoff.bulan}.
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Cutoff SPP pindahan: {sppCutoff.aktif ? `Aktif (tanggal ${sppCutoff.tanggal})` : 'Nonaktif'}.
        </div>
      </div>
    );
  }

  // ===================== Step Router =====================

  function renderStepContent() {
    if (currentStep.id === 'mode') return renderModeStep();
    if (currentStep.id === 'profil') return renderProfileStep();
    if (currentStep.id === 'tahun') return renderYearStep();
    if (currentStep.id === 'tingkat') return renderTingkatStep();
    if (currentStep.id === 'biaya') return renderBiayaStep();
    if (currentStep.id === 'metode') return renderMetodeStep();
    if (currentStep.id === 'diskon') return renderDiskonStep();
    if (currentStep.id === 'nis') return renderNISStep();
    if (currentStep.id === 'keamanan') return renderKeamananStep();
    return renderReviewStep();
  }

  // ===================== Shell =====================

  const [isRestoring, setIsRestoring] = useState(false);

  return (
    <>
      <div className="mx-auto w-full max-w-7xl mb-4 text-right">
        {isRestoring ? (
          <span className="text-sm font-bold text-slate-500 flex items-center justify-end gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Sedang memulihkan data...
          </span>
        ) : (
          <label className="cursor-pointer text-sm font-bold text-brand-600 hover:text-brand-500 underline">
            Atau pulihkan dari backup lokal
            <input type="file" accept=".json" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setIsRestoring(true);
              try {
                // Beri jeda sedikit agar UI sempat me-render state loading
                await new Promise(resolve => setTimeout(resolve, 100));
                const { restoreRawBackup } = await import('../services/localBackupService');
                await restoreRawBackup(file);
                alert('Restore berhasil! Halaman akan dimuat ulang.');
                window.location.href = '/';
              } catch (err) {
                alert('Gagal restore: ' + (err as Error).message);
                setIsRestoring(false);
              }
            }} />
          </label>
        )}
      </div>
      <form className="mx-auto w-full max-w-7xl rounded-3xl border border-slate-200 bg-white/90 shadow-soft animate-fade-in dark:border-slate-800 dark:bg-slate-950/80" onSubmit={handleSubmit}>
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800 md:px-6">
        {/* Mobile stepper */}
        <div className="md:hidden">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">Setup Awal</p>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Langkah {stepIndex + 1}/{steps.length}: {currentStep.label}</p>
            </div>
            <p className="text-xs font-bold text-slate-400">{Math.round(((stepIndex + 1) / steps.length) * 100)}%</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
          <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((step, index) => {
              const active = index === stepIndex;
              const complete = index < maxStepReached;
              const available = index <= maxStepReached || index === stepIndex + 1;
              return <button key={step.id} type="button" onClick={() => goToStep(index)} aria-label={step.label} disabled={!available} className={`h-7 rounded-lg text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'bg-brand-600 text-white' : complete ? 'bg-success-100 text-success-700 dark:bg-success-950/30 dark:text-success-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-500'}`}>{complete ? <CheckCircle2 className="mx-auto h-3.5 w-3.5" /> : index + 1}</button>;
            })}
          </div>
        </div>

        {/* Desktop stepper */}
        <div className="hidden items-center gap-2 md:grid" style={{ gridTemplateColumns: `8rem repeat(${steps.length}, minmax(0, 1fr))` }}>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">Setup Awal</p>
            <p className="mt-0.5 text-xs font-bold text-slate-400">{stepIndex + 1}/{steps.length} langkah</p>
          </div>
          {steps.map((step, index) => {
            const active = index === stepIndex;
            const complete = index < maxStepReached;
            const available = index <= maxStepReached || index === stepIndex + 1;
            return (
              <button key={step.id} type="button" onClick={() => goToStep(index)} disabled={!available} className={`rounded-xl border px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${active ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-950/60 dark:bg-brand-950/20 dark:text-brand-300' : complete ? 'border-success-100 bg-success-50/70 text-success-700 dark:border-success-950/40 dark:bg-success-950/10 dark:text-success-400' : 'border-slate-100 bg-slate-50/70 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/60'}`}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold ${active || complete ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 dark:bg-slate-950'}`}>{complete ? <CheckCircle2 className="h-3 w-3" /> : index + 1}</span>
                  <span className="truncate text-[11px] font-extrabold">{step.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <main className="px-4 py-4 md:px-6 md:py-5">
        <div className="mb-5 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white md:text-xl">{currentStep.label}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{currentStep.description}</p>
        </div>
        {renderStepContent()}
      </main>

      <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-slate-100 bg-white/95 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/95 md:flex md:items-center md:justify-between md:px-6">
        <button type="button" onClick={goBack} disabled={stepIndex === 0 || isSubmitting} className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">Kembali</button>
        {currentStep.id === 'review' ? <button type="button" onClick={handleSave} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-60"><Save className="h-4 w-4" />{isSubmitting ? 'Menyimpan...' : 'Simpan Setup'}</button> : <button type="button" onClick={goNext} disabled={isSubmitting} className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-60">Lanjut</button>}
      </div>
    </form>
  </>
  );
}
