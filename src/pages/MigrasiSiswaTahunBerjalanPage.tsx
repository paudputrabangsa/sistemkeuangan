import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Download, Save, Upload } from 'lucide-react';
import { getCurrentActor } from '../lib/actor';
import { formatRupiah } from '../lib/format';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { clearMigrasiSiswaTahunBerjalanDraft, loadMigrasiSiswaTahunBerjalanDraft, saveMigrasiSiswaTahunBerjalanDraft, summarizeMigrasiSiswaTahunBerjalanDraft, type MigrasiSiswaTahunBerjalanDraft } from '../services/migrasiSiswaTahunBerjalanDraftService';
import { downloadTemplateMigrasiSiswaTahunBerjalan, parseMigrasiSiswaTahunBerjalanExcel, type MigrasiExcelError } from '../services/migrasiExcelService';
import { getMigrasiPrerequisites, previewMigrasiSiswaTahunBerjalan, saveMigrasiSiswaTahunBerjalan, type MigrasiSiswaTahunBerjalanPreviewRow } from '../services/migrasiService';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

type ValidationIssue = { message: string; fieldId?: string; stepIndex?: number };
const steps: Array<{ label: string; description: string }> = [
  { label: 'Prasyarat', description: 'Pastikan tahun dan kelas aktif tersedia' },
  { label: 'Upload Excel', description: 'Upload file .xlsx dengan data siswa' },
  { label: 'Validasi', description: 'Periksa error dan perbaiki jika ada' },
  { label: 'Review & Simpan', description: 'Cek data lalu simpan ke database lokal' },
];

export default function MigrasiSiswaTahunBerjalanPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const initialDraft = loadMigrasiSiswaTahunBerjalanDraft();
  const [stepIndex, setStepIndex] = useState(initialDraft?.stepIndex ?? 0);
  const [maxStepReached, setMaxStepReached] = useState(initialDraft?.stepIndex ?? 0);
  const [draft, setDraft] = useState<MigrasiSiswaTahunBerjalanDraft | null>(initialDraft);
  const [errors, setErrors] = useState<MigrasiExcelError[]>([]);
  const [summary, setSummary] = useState(initialDraft ? summarizeMigrasiSiswaTahunBerjalanDraft(initialDraft) : { siswa: 0, tagihan: 0, pembayaran: 0, totalTagihan: 0, totalDiskon: 0, totalPembayaran: 0 });
  const [preview, setPreview] = useState<MigrasiSiswaTahunBerjalanPreviewRow[]>([]);
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [autoGenerateNis, setAutoGenerateNis] = useState(false);
  const [errorPage, setErrorPage] = useState(1);
  const [errorPageSize, setErrorPageSize] = useState(25);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(25);

  const prerequisites = useLiveQuery(() => getMigrasiPrerequisites(), [], null);

  useEffect(() => { if (draft && errors.length === 0) saveMigrasiSiswaTahunBerjalanDraft({ ...draft, stepIndex }); }, [draft, errors.length, stepIndex]);

  useEffect(() => {
    if (!draft || errors.length > 0) return;
    let cancelled = false;
    previewMigrasiSiswaTahunBerjalan(draft).then((rows) => {
      if (!cancelled) setPreview(rows);
    }).catch((error) => {
      if (!cancelled) addToast({ type: 'error', title: 'Gagal', message: formatPreviewError(error, 'Gagal memuat preview siswa tahun berjalan.') });
    });
    return () => { cancelled = true; };
  }, [draft, errors.length]);

  const currentStep = steps[stepIndex];

  // ===================== Validation =====================

  function issue(message: string, fieldId?: string, sIndex?: number): ValidationIssue {
    return { message, fieldId, stepIndex: sIndex };
  }

  function showValidationIssue(vi: ValidationIssue) {
    if (!vi.fieldId) addToast({ type: 'error', title: 'Validasi', message: vi.message });
    if (typeof vi.stepIndex === 'number') { setStepIndex(vi.stepIndex); setMaxStepReached((m) => Math.max(m, vi.stepIndex ?? 0)); }
  }

  function validateStep(targetStep: number): ValidationIssue | null {
    if (targetStep === 0) {
      if (!prerequisites?.activeYearId) return issue('Tahun ajaran aktif wajib tersedia sebelum lanjut.', undefined, 0);
      if ((prerequisites?.activeClassCount ?? 0) <= 0) return issue('Minimal satu kelas aktif wajib tersedia sebelum lanjut.', undefined, 0);
      return null;
    }
    if (targetStep >= 1 && !draft) return issue('Upload file Excel terlebih dahulu.', undefined, 1);
    if (targetStep >= 2 && errors.length > 0) return issue('Perbaiki error Excel sebelum lanjut ke Review.', undefined, 2);
    if (targetStep >= 3 && (!draft || draft.rows.filter((item) => item.nama.trim()).length <= 0)) return issue('File Excel wajib berisi minimal satu siswa.', undefined, 2);
    return null;
  }

  function validateUntilStep(targetStep: number) {
    for (let i = 0; i < targetStep; i += 1) {
      const err = validateStep(i);
      if (err) return err;
    }
    return null;
  }

  // ===================== Navigation =====================

  function goNext() {
    const err = validateStep(stepIndex);
    if (err) { showValidationIssue(err); return; }
    setStepIndex((c) => { const n = Math.min(c + 1, steps.length - 1); setMaxStepReached((m) => Math.max(m, n)); return n; });
  }

  function goBack() { setStepIndex((c) => Math.max(c - 1, 0)); }

  function goToStep(target: number) {
    const err = validateUntilStep(target);
    if (err) { showValidationIssue(err); return; }
    setMaxStepReached((m) => Math.max(m, target)); setStepIndex(target);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); if (stepIndex === steps.length - 1) { void handleSave(); return; } goNext(); }

  // ===================== File Upload =====================

  async function handleFile(file: File | null) {
    if (!file) return;
    setIsParsing(true);
    setErrorPage(1);
    setPreviewPage(1);
    try {
      const result = await parseMigrasiSiswaTahunBerjalanExcel(file);
      setDraft(result.draft);
      setErrors(result.errors);
      setSummary(result.summary);
      if (result.errors.length === 0) {
        setPreview(await previewMigrasiSiswaTahunBerjalan(result.draft));
      } else {
        setPreview([]);
      }
      setStepIndex(2);
      setMaxStepReached((m) => Math.max(m, 2));
    } catch (error) {
      addToast({ type: 'error', title: 'Gagal', message: error instanceof Error ? error.message : 'Terjadi kesalahan saat memproses file Excel.' });
    } finally {
      setIsParsing(false);
    }
  }

  // ===================== Save =====================

  async function handleSave() {
    if (!actor || !draft) return;
    if (errors.length > 0) {
      addToast({ type: 'error', title: 'Validasi', message: 'Perbaiki error Excel sebelum menyimpan.' });
      return;
    }

    requestConfirm({
      title: 'Simpan Migrasi Siswa Tahun Berjalan?',
      description: `Apakah Anda yakin ingin menyimpan ${summary.siswa} siswa ini beserta tagihannya ke database lokal?`,
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          const result = await saveMigrasiSiswaTahunBerjalan(actor, draft, { autoGenerateNis });
          clearMigrasiSiswaTahunBerjalanDraft();
          setDraft(null);
          addToast({ type: 'success', title: 'Berhasil', message: `Migrasi berhasil: ${result.students.length} siswa, ${result.bills.length} tagihan, ${result.payments.length} pembayaran.` });
          navigate('/migrasi');
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof Error ? error.message : 'Gagal menyimpan migrasi siswa.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  // ===================== Steps =====================

  function renderPrasyaratStep() {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Metric label="Tahun aktif" value={prerequisites?.activeYearName ?? '-'} />
          <Metric label="Kelas aktif" value={`${prerequisites?.activeClassCount ?? 0}`} />
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Migrasi siswa tahun berjalan membutuhkan tahun ajaran aktif, kelas aktif, dan metode pembayaran.
        </div>
        <button type="button" onClick={downloadTemplateMigrasiSiswaTahunBerjalan} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500"><Download className="h-4 w-4" />Download Template Excel</button>
      </div>
    );
  }

  function renderUploadStep() {
    return (
      <div className="space-y-5">
        <label className={`flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white/70 p-10 text-center transition hover:border-brand-300 hover:bg-brand-50/30 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-brand-800 dark:hover:bg-brand-950/10 ${isParsing ? 'opacity-70 pointer-events-none' : ''}`}>
          {isParsing ? (
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent"></div>
          ) : (
            <Upload className="mb-3 h-8 w-8 text-brand-600" />
          )}
          <span className="font-bold text-slate-800 dark:text-slate-100">{isParsing ? 'Sedang Memproses File Excel...' : 'Pilih file migrasi siswa tahun berjalan'}</span>
          <span className="mt-1 text-xs text-slate-500">{isParsing ? 'Mohon tunggu sebentar, sedang mengecek baris data...' : 'Format .xlsx dengan sheet siswa, tagihan, pembayaran'}</span>
          <input type="file" accept=".xlsx" className="hidden" disabled={isParsing} onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void handleFile(file);
            event.target.value = '';
          }} />
        </label>
      </div>
    );
  }

  function renderValidasiStep() {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Metric label="Siswa" value={`${summary.siswa}`} />
          <Metric label="Tagihan" value={`${summary.tagihan}`} />
          <Metric label="Pembayaran" value={`${summary.pembayaran}`} />
          <Metric label="Error" value={`${errors.length}`} />
        </div>
        {errors.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/50">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="px-4 py-3">Sheet</th><th className="px-4 py-3">Baris</th><th className="px-4 py-3">Kolom</th><th className="px-4 py-3">Pesan</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginateData(errors, errorPage, errorPageSize).map((error, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3">{error.sheet}</td>
                    <td className="px-4 py-3">{error.row}</td>
                    <td className="px-4 py-3">{error.column}</td>
                    <td className="px-4 py-3 font-semibold text-danger-700">{error.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination currentPage={errorPage} totalItems={errors.length} pageSize={errorPageSize} onPageChange={setErrorPage} onPageSizeChange={setErrorPageSize} />
          </div>
        ) : (
          <div className="rounded-2xl border border-success-100 bg-success-50 p-4 text-sm font-bold text-success-700 dark:border-success-950/40 dark:bg-success-950/20 dark:text-success-400">File valid. Lanjut ke Review & Simpan.</div>
        )}
      </div>
    );
  }

  function renderReviewStep() {
    const emptyNisCount = preview.filter(item => item.nis === '-' || item.nis === '').length;

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Tagihan tidak digenerate otomatis. Hanya tagihan yang ada di Excel yang akan disimpan. Data hanya disimpan jika tidak ada error validasi.
        </div>

        {emptyNisCount > 0 && (
          <div className="rounded-2xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-900/50 dark:bg-warning-900/20 animate-fade-in">
            <h3 className="text-sm font-bold text-warning-800 dark:text-warning-300">
              Ada {emptyNisCount} siswa yang NIS-nya kosong pada file Excel.
            </h3>
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-warning-200/60 bg-white/60 p-3 transition hover:bg-white dark:border-warning-800/50 dark:bg-warning-950/40 dark:hover:bg-warning-950/60">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:checked:bg-brand-500"
                checked={autoGenerateNis}
                onChange={(e) => setAutoGenerateNis(e.target.checked)}
              />
              <span className="text-sm font-semibold text-warning-800 dark:text-warning-300">
                Generate NIS secara otomatis (Pola: Tahun Ajaran + Urutan)
                <span className="block text-xs font-normal opacity-80 mt-0.5">Jika tidak dicentang, NIS akan dibiarkan kosong.</span>
              </span>
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Metric label="Siswa" value={`${summary.siswa}`} />
          <Metric label="Total Tagihan" value={formatRupiah(summary.totalTagihan)} />
          <Metric label="Total Diskon" value={formatRupiah(summary.totalDiskon)} />
          <Metric label="Total Pembayaran" value={formatRupiah(summary.totalPembayaran)} />
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/50">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="px-4 py-3">Siswa</th><th className="px-4 py-3">NIS</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Kelas</th><th className="px-4 py-3">Promo yang Didapat</th><th className="px-4 py-3">Total Tagihan</th><th className="px-4 py-3">Total Diskon</th><th className="px-4 py-3">Total Bayar</th><th className="px-4 py-3">Sisa</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginateData(preview, previewPage, previewPageSize).map((item) => (
                <tr key={item.rowId}>
                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{item.nama}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.nis}</td>
                  <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-400">{item.status}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.kelasLabel}</td>
                  <td className="px-4 py-3 text-brand-700 dark:text-brand-400 font-medium">{item.namaPromo}</td>
                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{formatRupiah(item.totalTagihan)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatRupiah(item.nominalDiskonTagihan)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatRupiah(item.totalPembayaran)}</td>
                  <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">{formatRupiah(item.sisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination currentPage={previewPage} totalItems={preview.length} pageSize={previewPageSize} onPageChange={setPreviewPage} onPageSizeChange={setPreviewPageSize} />
        </div>
      </div>
    );
  }

  // ===================== Step Router =====================

  function renderStepContent() {
    if (stepIndex === 0) return renderPrasyaratStep();
    if (stepIndex === 1) return renderUploadStep();
    if (stepIndex === 2) return renderValidasiStep();
    return renderReviewStep();
  }

  // ===================== Shell =====================

  return (
    <form className="mx-auto w-full max-w-7xl rounded-3xl border border-slate-200 bg-white/90 shadow-soft animate-fade-in dark:border-slate-800 dark:bg-slate-950/80" onSubmit={handleSubmit}>
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800 md:px-6">
        {/* Mobile stepper */}
        <div className="md:hidden">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">Migrasi Siswa</p>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Langkah {stepIndex + 1}/{steps.length}: {currentStep.label}</p>
            </div>
            <Link to="/migrasi" className="shrink-0 rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">Kembali</Link>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
          <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((step, index) => {
              const active = index === stepIndex;
              const complete = index < maxStepReached;
              const available = index <= maxStepReached || index === stepIndex + 1;
              return (
                <button key={step.label} type="button" onClick={() => goToStep(index)} aria-label={step.label} disabled={!available}
                  className={`h-7 rounded-lg text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'bg-brand-600 text-white' : complete ? 'bg-success-100 text-success-700 dark:bg-success-950/30 dark:text-success-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-500'}`}
                >{complete ? <CheckCircle2 className="mx-auto h-3.5 w-3.5" /> : index + 1}</button>
              );
            })}
          </div>
        </div>

        {/* Desktop stepper */}
        <div className="hidden items-center gap-2 md:grid" style={{ gridTemplateColumns: `8rem repeat(${steps.length}, minmax(0, 1fr)) auto` }}>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">Migrasi Siswa</p>
            <p className="mt-0.5 text-xs font-bold text-slate-400">{stepIndex + 1}/{steps.length} langkah</p>
          </div>
          {steps.map((step, index) => {
            const active = index === stepIndex;
            const complete = index < maxStepReached;
            const available = index <= maxStepReached || index === stepIndex + 1;
            return (
              <button key={step.label} type="button" onClick={() => goToStep(index)} disabled={!available}
                className={`rounded-xl border px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${active ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-950/60 dark:bg-brand-950/20 dark:text-brand-300' : complete ? 'border-success-100 bg-success-50/70 text-success-700 dark:border-success-950/40 dark:bg-success-950/10 dark:text-success-400' : 'border-slate-100 bg-slate-50/70 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/60'}`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold ${active || complete ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 dark:bg-slate-950'}`}>{complete ? <CheckCircle2 className="h-3 w-3" /> : index + 1}</span>
                  <span className="truncate text-[11px] font-extrabold">{step.label}</span>
                </span>
              </button>
            );
          })}
          <Link to="/migrasi" className="justify-self-end rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-[11px] font-bold text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">Kembali ke Migrasi</Link>
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
        {stepIndex === steps.length - 1 ? (
          <button type="button" onClick={() => void handleSave()} disabled={isSubmitting || !draft || errors.length > 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-60">
            <Save className="h-4 w-4" />{isSubmitting ? 'Menyimpan...' : 'Simpan Atomic'}
          </button>
        ) : (
          <button type="button" onClick={goNext} disabled={isSubmitting} className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-60">Lanjut</button>
        )}
      </div>
    </form>
  );
}

function formatPreviewError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('objectStore') || message.includes('object store')) {
    return 'Database lokal belum memuat schema terbaru. Muat ulang aplikasi, lalu buka kembali halaman migrasi. Jika masih muncul, gunakan Pengaturan > Reset Data untuk memperbarui database lokal.';
  }
  return message || fallback;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
