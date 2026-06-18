import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Plus, Save, Trash2 } from 'lucide-react';
import FormField from '../components/ui/FormField';
import PageHeader from '../components/ui/PageHeader';
import { getCurrentActor } from '../lib/actor';
import { formatNumberInput, formatRupiah, parseNumberInput } from '../lib/format';
import { calculateTahunAjaranSelesai } from '../services/tahunAjaranDateService';
import { clearSetupTahunAjaranDraft, completeSetupTahunAjaranDraft, createDefaultSetupTahunAjaranDraft, getKelasTahunAktifTerakhir, getPendaftaranTahunAktifTerakhir, loadSetupTahunAjaranDraft, saveSetupTahunAjaranDraft, validateSetupTahunAjaranStep, type SetupTahunAjaranDraft, type TingkatDraft } from '../services/setupTahunAjaranDraftService';
import { ServiceError } from '../services/service-errors';
import { newId } from '../services/service-helpers';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

const steps = ['Tahun Ajaran', 'Tingkat & Kelas', 'Komponen Biaya', 'Review'];

const monthOptions = [
  { value: '1', label: 'Januari' }, { value: '2', label: 'Februari' }, { value: '3', label: 'Maret' },
  { value: '4', label: 'April' }, { value: '5', label: 'Mei' }, { value: '6', label: 'Juni' },
  { value: '7', label: 'Juli' }, { value: '8', label: 'Agustus' }, { value: '9', label: 'September' },
  { value: '10', label: 'Oktober' }, { value: '11', label: 'November' }, { value: '12', label: 'Desember' },
];

export default function SetupTahunAjaranDraftPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const [draft, setDraft] = useState<SetupTahunAjaranDraft>(() => loadSetupTahunAjaranDraft() ?? createDefaultSetupTahunAjaranDraft());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [maxStepReached, setMaxStepReached] = useState(draft.stepIndex);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedTingkat, setExpandedTingkat] = useState<Record<string, boolean>>({});
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const fromMigrasi = searchParams.get('from') === 'migrasi-calon';

  const sumberTahunAjaranBiaya = useLiveQuery(() => getPendaftaranTahunAktifTerakhir(), []);
  const sumberKelas = useLiveQuery(() => getKelasTahunAktifTerakhir(), []);

  const stepIndex = draft.stepIndex;
  const currentStep = steps[stepIndex];

  useEffect(() => {
    saveSetupTahunAjaranDraft(draft);
  }, [draft]);

  useEffect(() => {
    setMaxStepReached((prev) => Math.max(prev, stepIndex));
  }, [stepIndex]);

  function updateDraft(changes: Partial<SetupTahunAjaranDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    setFieldErrors({});
  }

  function updateTingkat(id: string, changes: Partial<TingkatDraft>) {
    updateDraft({ tingkatRows: draft.tingkatRows.map((t) => t.id === id ? { ...t, ...changes } : t) });
  }

  function addTingkat() {
    const newT: TingkatDraft = { id: newId(), nama: '', kode: '', tarif_spp: '', usia_min_tahun: '', usia_max_tahun: '', kelas: [{ id: newId(), nama_kelas: '', kapasitas_siswa: '' }] };
    updateDraft({ tingkatRows: [...draft.tingkatRows, newT] });
  }

  function removeTingkat(id: string) {
    updateDraft({ tingkatRows: draft.tingkatRows.filter((t) => t.id !== id) });
  }

  function toggleTingkat(id: string) {
    setExpandedTingkat((prev) => ({ ...prev, [id]: prev[id] === false ? true : false }));
  }

  function addKelasToTingkat(tingkatId: string) {
    updateDraft({
      tingkatRows: draft.tingkatRows.map((t) => t.id === tingkatId ? { ...t, kelas: [...t.kelas, { id: newId(), nama_kelas: '', kapasitas_siswa: '' }] } : t),
    });
  }

  function removeKelasFromTingkat(tingkatId: string, kelasId: string) {
    updateDraft({
      tingkatRows: draft.tingkatRows.map((t) => t.id === tingkatId ? { ...t, kelas: t.kelas.filter((k) => k.id !== kelasId) } : t),
    });
  }

  function updateKelasInTingkat(tingkatId: string, kelasId: string, changes: Partial<{ nama_kelas: string; kapasitas_siswa: string }>) {
    updateDraft({
      tingkatRows: draft.tingkatRows.map((t) => t.id === tingkatId ? { ...t, kelas: t.kelas.map((k) => k.id === kelasId ? { ...k, ...changes } : k) } : t),
    });
  }

  function updateKomponenBiaya(id: string, changes: Partial<{ nama: string; nominal: string; wajib: boolean }>) {
    updateDraft({ komponenBiaya: draft.komponenBiaya.map((k) => k.id === id ? { ...k, ...changes } : k) });
  }

  function addKomponenBiaya() {
    updateDraft({ komponenBiaya: [...draft.komponenBiaya, { id: newId(), nama: '', nominal: '', wajib: true }] });
  }

  function removeKomponenBiaya(id: string) {
    updateDraft({ komponenBiaya: draft.komponenBiaya.filter((k) => k.id !== id) });
  }

  async function validateStep(step: number): Promise<boolean> {
    const errors = await validateSetupTahunAjaranStep(draft, step);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function goToStep(index: number) {
    if (index === stepIndex) return;
    if (index > maxStepReached + 1) {
      addToast({ type: 'error', title: 'Urutan', message: 'Selesaikan langkah sebelumnya terlebih dahulu.' });
      return;
    }
    if (index > stepIndex) {
      const valid = await validateStep(stepIndex);
      if (!valid) return;
    }
    updateDraft({ stepIndex: index });
    setFieldErrors({});
  }

  function goNext() {
    goToStep(stepIndex + 1);
  }

  function goBack() {
    updateDraft({ stepIndex: Math.max(stepIndex - 1, 0) });
    setFieldErrors({});
  }

  function handleCopyBiayaFromSumber() {
    if (!sumberTahunAjaranBiaya) return;
    const s = sumberTahunAjaranBiaya.pendaftaran;
    updateDraft({
      komponenBiaya: s.komponen_biaya.map((k) => ({ id: newId(), nama: k.nama, nominal: String(k.nominal), wajib: k.wajib })),
      modeTagihanBiaya: s.mode_tagihan_biaya,
      jatuhTempoMode: s.jatuh_tempo_mode,
      jatuhTempoTanggal: s.jatuh_tempo_tanggal,
      jatuhTempoHari: String(s.jatuh_tempo_hari_setelah_daftar),
    });
    addToast({ type: 'success', title: 'Berhasil', message: `Komponen biaya disalin dari ${sumberTahunAjaranBiaya.tahunAjaran.nama}.` });
  }

  function handleCopyKelasFromSumber() {
    if (!sumberKelas) return;
    updateDraft({ tingkatRows: sumberKelas.tingkatRows.map((t) => ({ ...t, id: newId(), kelas: t.kelas.map((k) => ({ ...k, id: newId() })) })) });
    addToast({ type: 'success', title: 'Berhasil', message: `Tingkat & kelas disalin dari ${sumberKelas.tahunAjaran.nama}.` });
  }

  async function handleSave() {
    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan. Silakan login ulang.' });
      return;
    }

    requestConfirm({
      title: 'Simpan Tahun Ajaran Draft?',
      description: 'Apakah Anda yakin ingin menyimpan tahun ajaran draft ini?',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          const result = await completeSetupTahunAjaranDraft(actor, draft);
          clearSetupTahunAjaranDraft();
          addToast({ type: 'success', title: 'Berhasil', message: 'Tahun ajaran draft berhasil dibuat.' });
          navigate(`/tahun-ajaran/${result.tahunAjaran.id}`);
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : error instanceof Error ? error.message : 'Gagal menyimpan tahun ajaran draft.' });
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  }

  function inputClassFor(field: string) {
    return fieldErrors[field]
      ? `${inputClass} border-red-500 focus:border-red-400 focus:ring-red-100`
      : inputClass;
  }

  const compactInputClass = 'w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 dark:disabled:bg-slate-900/70 dark:disabled:text-slate-500';

  // ===================== Step Renderers =====================

  function renderYearStep() {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <FormField label="Nama tahun ajaran" htmlFor="tahun_nama" error={fieldErrors.tahun_nama}>
            <input id="tahun_nama" value={draft.tahunAjaran.nama} onChange={(e) => updateDraft({ tahunAjaran: { ...draft.tahunAjaran, nama: e.target.value } })} placeholder="2027/2028" className={inputClassFor('tahun_nama')} />
          </FormField>
          <FormField label="Mulai" htmlFor="tahun_mulai" error={fieldErrors.tahun_mulai}>
            <input id="tahun_mulai" type="date" value={draft.tahunAjaran.mulai} onChange={(e) => updateDraft({ tahunAjaran: { ...draft.tahunAjaran, mulai: e.target.value } })} className={inputClassFor('tahun_mulai')} />
          </FormField>
          <FormField label="Selesai" htmlFor="tahun_selesai" error={fieldErrors.tahun_selesai} hint={draft.tahunAjaran.mulai ? `Maksimal ${calculateTahunAjaranSelesai(draft.tahunAjaran.mulai)}.` : 'Isi tanggal mulai terlebih dahulu.'}>
            <input id="tahun_selesai" type="date" min={draft.tahunAjaran.mulai || undefined} max={draft.tahunAjaran.mulai ? calculateTahunAjaranSelesai(draft.tahunAjaran.mulai) : undefined} value={draft.tahunAjaran.selesai} onChange={(e) => updateDraft({ tahunAjaran: { ...draft.tahunAjaran, selesai: e.target.value } })} className={inputClassFor('tahun_selesai')} />
          </FormField>
        </div>
      </div>
    );
  }

  function renderTingkatStep() {
    return (
      <div className="space-y-4">
        {sumberKelas && (
          <button type="button" onClick={handleCopyKelasFromSumber} className="flex w-full items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-left text-sm font-bold text-brand-700 hover:bg-brand-100/80 dark:border-brand-950/40 dark:bg-brand-950/20 dark:text-brand-300">
            <Plus className="h-5 w-5 shrink-0" />
            Salin tingkat & kelas dari {sumberKelas.tahunAjaran.nama}
          </button>
        )}

        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          <strong>Tingkat</strong> adalah jenjang (contoh: Kelompok Bermain, TK A, TK B). Tarif SPP dan aturan usia dilekatkan ke tingkat.<br/>
          <strong>Kelas</strong> adalah rombel dalam satu tingkat (contoh: Mawar, Melati). Satu tingkat bisa punya beberapa kelas.
        </div>

        <div className="space-y-3">
          {draft.tingkatRows.map((t, tIdx) => {
            const isOpen = expandedTingkat[t.id] !== false;
            return (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/50 overflow-hidden">
                <button type="button" onClick={() => toggleTingkat(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-extrabold text-brand-700 dark:bg-brand-950/30 dark:text-brand-400">{tIdx + 1}</span>
                  <span className="flex-1 truncate text-sm font-extrabold text-slate-800 dark:text-slate-100">{t.nama.trim() || `Tingkat ${tIdx + 1}`}</span>
                  <span className="text-xs text-slate-400">{t.kelas.length} kelas</span>
                  {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800 space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <FormField label="Nama Tingkat" htmlFor={`tingkat_nama_${t.id}`} error={fieldErrors[`tingkat_${t.id}_nama`]}>
                        <input id={`tingkat_nama_${t.id}`} value={t.nama} onChange={(e) => updateTingkat(t.id, { nama: e.target.value })} className={inputClassFor(`tingkat_${t.id}_nama`)} />
                      </FormField>
                      <FormField label="Kode (untuk NIS)" htmlFor={`tingkat_kode_${t.id}`}>
                        <input id={`tingkat_kode_${t.id}`} value={t.kode} onChange={(e) => updateTingkat(t.id, { kode: e.target.value })} placeholder="misal: KB, A, B" className={compactInputClass} />
                      </FormField>
                      <FormField label="Tarif SPP" htmlFor={`tingkat_tarif_${t.id}`} error={fieldErrors[`tingkat_${t.id}_tarif`]}>
                        <input id={`tingkat_tarif_${t.id}`} inputMode="numeric" value={formatNumberInput(t.tarif_spp)} onChange={(e) => updateTingkat(t.id, { tarif_spp: parseNumberInput(e.target.value) })} className={inputClassFor(`tingkat_${t.id}_tarif`)} />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <FormField label="Usia Minimal" htmlFor={`tingkat_usia_min_${t.id}`}>
                        <input id={`tingkat_usia_min_${t.id}`} inputMode="numeric" value={t.usia_min_tahun} onChange={(e) => updateTingkat(t.id, { usia_min_tahun: e.target.value.replace(/\D/g, '') })} placeholder="tahun" className={compactInputClass} />
                      </FormField>
                      <FormField label="Usia Maksimal" htmlFor={`tingkat_usia_max_${t.id}`}>
                        <input id={`tingkat_usia_max_${t.id}`} inputMode="numeric" value={t.usia_max_tahun} onChange={(e) => updateTingkat(t.id, { usia_max_tahun: e.target.value.replace(/\D/g, '') })} placeholder="tahun" className={compactInputClass} />
                      </FormField>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Kelas dalam tingkat ini</p>
                      {t.kelas.map((kls, kIdx) => (
                        <div key={kls.id} className="grid grid-cols-[1fr_auto_auto] items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <FormField label={`Nama Kelas ${kIdx + 1}`} htmlFor={`kelas_nama_${kls.id}`} error={fieldErrors[`kelas_${kls.id}_nama`]}>
                              <input id={`kelas_nama_${kls.id}`} value={kls.nama_kelas} onChange={(e) => updateKelasInTingkat(t.id, kls.id, { nama_kelas: e.target.value })} placeholder="misal: Mawar, Melati" className={inputClassFor(`kelas_${kls.id}_nama`)} />
                            </FormField>
                            <FormField label="Kapasitas" htmlFor={`kelas_kap_${kls.id}`} error={fieldErrors[`kelas_${kls.id}_kapasitas`]}>
                              <input id={`kelas_kap_${kls.id}`} inputMode="numeric" value={kls.kapasitas_siswa} onChange={(e) => updateKelasInTingkat(t.id, kls.id, { kapasitas_siswa: e.target.value.replace(/\D/g, '') })} className={compactInputClass} />
                            </FormField>
                          </div>
                          <button type="button" onClick={() => removeKelasFromTingkat(t.id, kls.id)} disabled={t.kelas.length === 1} className="mt-7 rounded-xl border border-danger-100 p-2 text-danger-600 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-danger-950/50 dark:text-danger-400"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addKelasToTingkat(t.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"><Plus className="h-3.5 w-3.5" /> Tambah Kelas</button>
                    </div>

                    <div className="flex justify-end">
                      <button type="button" onClick={() => removeTingkat(t.id)} disabled={draft.tingkatRows.length === 1} className="inline-flex items-center gap-1.5 rounded-xl border border-danger-100 px-3 py-2 text-xs font-bold text-danger-600 hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-danger-950/50 dark:text-danger-400"><Trash2 className="h-3.5 w-3.5" /> Hapus Tingkat</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" onClick={addTingkat} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"><Plus className="h-4 w-4" /> Tambah Tingkat</button>

        <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Aturan Penempatan Usia</p>
          <p className="mt-1 text-xs text-slate-500">Cutoff tanggal untuk menghitung umur siswa. Contoh: cutoff 1 Juli 2026 berarti tahun ajaran 2026/2027 menghitung umur siswa per 1 Juli 2026.</p>
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Bulan cutoff" htmlFor="cutoff_bulan" error={fieldErrors.cutoff_bulan}>
              <select id="cutoff_bulan" value={draft.cutoffBulan} onChange={(e) => updateDraft({ cutoffBulan: e.target.value })} className={inputClassFor('cutoff_bulan')}>
                {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </FormField>
            <FormField label="Tanggal cutoff" htmlFor="cutoff_tanggal" error={fieldErrors.cutoff_tanggal}>
              <input id="cutoff_tanggal" value={draft.cutoffTanggal} onChange={(e) => updateDraft({ cutoffTanggal: e.target.value.replace(/\D/g, '').slice(0, 2) })} className={inputClassFor('cutoff_tanggal')} />
            </FormField>
          </div>
        </div>
      </div>
    );
  }

  function renderBiayaStep() {
    const totalBiaya = draft.komponenBiaya.reduce((sum, k) => sum + Number(k.nominal || 0), 0);
    return (
      <div className="space-y-5">
        {sumberTahunAjaranBiaya && (
          <button type="button" onClick={handleCopyBiayaFromSumber} className="flex w-full items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-left text-sm font-bold text-brand-700 hover:bg-brand-100/80 dark:border-brand-950/40 dark:bg-brand-950/20 dark:text-brand-300">
            <Plus className="h-5 w-5 shrink-0" />
            Salin komponen biaya dari {sumberTahunAjaranBiaya.tahunAjaran.nama}
          </button>
        )}

        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Komponen biaya pendaftaran. Anda bisa menambah beberapa komponen (Uang Pangkal, Seragam, Buku, dll). Pilih apakah semua komponen dijadikan satu tagihan atau dipisah menjadi tagihan terpisah per komponen.
        </div>

        <div className="space-y-3">
          {draft.komponenBiaya.map((k, i) => (
            <div key={k.id} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 md:grid-cols-[1fr_1fr_auto_auto] md:items-start">
              <FormField label={`Komponen ${i + 1}`} htmlFor={`biaya_nama_${k.id}`} error={fieldErrors[`biaya_${k.id}_nama`]}>
                <input id={`biaya_nama_${k.id}`} value={k.nama} onChange={(e) => updateKomponenBiaya(k.id, { nama: e.target.value })} placeholder="misal: Uang Pangkal" className={inputClassFor(`biaya_${k.id}_nama`)} />
              </FormField>
              <FormField label="Nominal" htmlFor={`biaya_nominal_${k.id}`} error={fieldErrors[`biaya_${k.id}_nominal`]}>
                <input id={`biaya_nominal_${k.id}`} inputMode="numeric" value={formatNumberInput(k.nominal)} onChange={(e) => updateKomponenBiaya(k.id, { nominal: parseNumberInput(e.target.value) })} className={inputClassFor(`biaya_${k.id}_nominal`)} />
              </FormField>
              <label className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm font-bold text-slate-600 dark:border-slate-800 dark:text-slate-300 md:mt-7">
                <input type="checkbox" checked={k.wajib} onChange={(e) => updateKomponenBiaya(k.id, { wajib: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" /> Wajib
              </label>
              <button type="button" onClick={() => removeKomponenBiaya(k.id)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-danger-100 px-3 py-2.5 text-sm font-bold text-danger-700 hover:bg-danger-50 dark:border-danger-950/50 dark:text-danger-400 md:mt-7"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addKomponenBiaya} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"><Plus className="h-4 w-4" /> Tambah Komponen</button>

        {draft.komponenBiaya.length > 0 && (
          <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 dark:border-brand-950/50 dark:bg-brand-950/20">
            <p className="text-sm font-extrabold text-brand-700 dark:text-brand-300">Total: {formatRupiah(totalBiaya)}</p>
            <div className="mt-3 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                <input type="radio" name="mode_tagihan" checked={draft.modeTagihanBiaya === 'gabung'} onChange={() => updateDraft({ modeTagihanBiaya: 'gabung' })} className="h-4 w-4 text-brand-600" /> Gabung jadi 1 tagihan
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                <input type="radio" name="mode_tagihan" checked={draft.modeTagihanBiaya === 'pisah'} onChange={() => updateDraft({ modeTagihanBiaya: 'pisah' })} className="h-4 w-4 text-brand-600" /> Pisah per komponen
              </label>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Jatuh Tempo Pendaftaran</p>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Mode" htmlFor="jt_mode">
              <select id="jt_mode" value={draft.jatuhTempoMode} onChange={(e) => updateDraft({ jatuhTempoMode: e.target.value as 'tanggal_tetap' | 'hari_setelah_daftar' })} className={inputClass}>
                <option value="tanggal_tetap">Tanggal tetap</option>
                <option value="hari_setelah_daftar">Hari setelah daftar</option>
              </select>
            </FormField>
            {draft.jatuhTempoMode === 'tanggal_tetap' ? (
              <FormField label="Tanggal jatuh tempo" htmlFor="jt_tanggal" error={fieldErrors.jt_tanggal}>
                <input id="jt_tanggal" type="date" value={draft.jatuhTempoTanggal} onChange={(e) => updateDraft({ jatuhTempoTanggal: e.target.value })} className={inputClassFor('jt_tanggal')} />
              </FormField>
            ) : (
              <FormField label="Hari setelah daftar" htmlFor="jt_hari">
                <input id="jt_hari" inputMode="numeric" value={draft.jatuhTempoHari} onChange={(e) => updateDraft({ jatuhTempoHari: e.target.value.replace(/\D/g, '') })} className={inputClass} />
              </FormField>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderReviewStep() {
    const validTingkat = draft.tingkatRows.filter((t) => t.nama.trim());
    const totalKelas = validTingkat.reduce((s, t) => s + t.kelas.filter((k) => k.nama_kelas.trim()).length, 0);
    const totalBiaya = draft.komponenBiaya.reduce((s, k) => s + Number(k.nominal || 0), 0);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Tahun Ajaran</p>
            <p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{draft.tahunAjaran.nama || '-'}</p>
            <p className="mt-1 text-sm text-slate-500">{draft.tahunAjaran.mulai} s/d {draft.tahunAjaran.selesai}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Tingkat & Kelas</p>
            <p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{validTingkat.length} tingkat, {totalKelas} kelas</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Komponen Biaya</p>
            <p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">{formatRupiah(totalBiaya)}</p>
            <p className="mt-1 text-sm text-slate-500">{draft.komponenBiaya.length} komponen, {draft.modeTagihanBiaya === 'gabung' ? '1 tagihan gabungan' : 'tagihan terpisah'}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Jatuh Tempo</p>
            <p className="mt-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">
              {draft.jatuhTempoMode === 'tanggal_tetap' ? draft.jatuhTempoTanggal || '-' : `${draft.jatuhTempoHari || '-'} hari setelah daftar`}
            </p>
          </div>
        </div>

        {validTingkat.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200">Ringkasan Tingkat & Kelas</p>
            <div className="mt-3 space-y-2">
              {validTingkat.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-slate-700 dark:text-slate-200">{t.nama}</span>
                    <span className="text-sm text-slate-500">{formatRupiah(Number(t.tarif_spp || 0))}/bulan</span>
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
        )}

        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          Cutoff umur: {draft.cutoffTanggal} {monthOptions.find((m) => m.value === draft.cutoffBulan)?.label ?? draft.cutoffBulan}.
        </div>
      </div>
    );
  }

  // ===================== Shell =====================

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Setup Tahun Ajaran Draft" description={fromMigrasi ? 'Siapkan tahun ajaran target untuk calon siswa hasil migrasi.' : 'Buat tahun ajaran draft baru beserta kelas, tarif, dan biaya pendaftaran.'}
        actions={<Link to="/tahun-ajaran" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"><ArrowLeft className="h-4 w-4" /> Daftar Tahun Ajaran</Link>}
      />

      <form className="mx-auto w-full max-w-7xl rounded-3xl border border-slate-200 bg-white/90 shadow-soft animate-fade-in dark:border-slate-800 dark:bg-slate-950/80" onSubmit={(e) => e.preventDefault()}>
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800 md:px-6">
          {/* Mobile stepper */}
          <div className="md:hidden">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">Setup Tahun Ajaran</p>
                <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Langkah {stepIndex + 1}/{steps.length}: {currentStep}</p>
              </div>
              <p className="text-xs font-bold text-slate-400">{Math.round(((stepIndex + 1) / steps.length) * 100)}%</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
            </div>
            <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
              {steps.map((step, index) => {
                const active = index === stepIndex;
                const complete = index < maxStepReached;
                const available = index <= maxStepReached || index === stepIndex + 1;
                return (
                  <button key={step} type="button" onClick={() => goToStep(index)} disabled={!available} className={`h-7 rounded-lg text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'bg-brand-600 text-white' : complete ? 'bg-success-100 text-success-700 dark:bg-success-950/30 dark:text-success-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-500'}`}>
                    {complete ? <CheckCircle2 className="mx-auto h-3.5 w-3.5" /> : index + 1}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop stepper */}
          <div className="hidden items-center gap-2 md:grid" style={{ gridTemplateColumns: `8rem repeat(${steps.length}, minmax(0, 1fr))` }}>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">Setup Tahun Ajaran</p>
              <p className="mt-0.5 text-xs font-bold text-slate-400">{stepIndex + 1}/{steps.length} langkah</p>
            </div>
            {steps.map((step, index) => {
              const active = index === stepIndex;
              const complete = index < maxStepReached;
              const available = index <= maxStepReached || index === stepIndex + 1;
              return (
                <button key={step} type="button" onClick={() => goToStep(index)} disabled={!available} className={`rounded-xl border px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${active ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-950/60 dark:bg-brand-950/20 dark:text-brand-300' : complete ? 'border-success-100 bg-success-50/70 text-success-700 dark:border-success-950/40 dark:bg-success-950/10 dark:text-success-400' : 'border-slate-100 bg-slate-50/70 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/60'}`}>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold ${active || complete ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 dark:bg-slate-950'}`}>{complete ? <CheckCircle2 className="h-3 w-3" /> : index + 1}</span>
                    <span className="truncate text-[11px] font-extrabold">{step}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <main className="px-4 py-4 md:px-6 md:py-5">
          <div className="mb-5 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white md:text-xl">{currentStep}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {stepIndex === 0 && 'Tanggal mulai dan selesai diisi manual. Durasi tidak boleh lebih dari satu tahun.'}
              {stepIndex === 1 && 'Tentukan rombel dan tarif SPP per tingkat, serta aturan cutoff umur untuk penempatan siswa.'}
              {stepIndex === 2 && 'Tentukan komponen biaya pendaftaran dan aturan jatuh tempo. Tidak bisa dilewati.'}
              {stepIndex === 3 && 'Pastikan data sudah benar, lalu simpan tahun ajaran draft ke IndexedDB.'}
            </p>
          </div>

          {stepIndex === 0 && renderYearStep()}
          {stepIndex === 1 && renderTingkatStep()}
          {stepIndex === 2 && renderBiayaStep()}
          {stepIndex === 3 && renderReviewStep()}
        </main>

        <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-slate-100 bg-white/95 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/95 md:flex md:items-center md:justify-between md:px-6">
          <button type="button" onClick={goBack} disabled={stepIndex === 0 || isSubmitting} className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">Kembali</button>
          {stepIndex < steps.length - 1 ? (
            <button type="button" onClick={goNext} disabled={isSubmitting} className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-60">Lanjut</button>
          ) : (
            <button type="button" onClick={() => void handleSave()} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-60">
              <Save className="h-4 w-4" /> {isSubmitting ? 'Menyimpan...' : 'Simpan Tahun Ajaran Draft'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 dark:disabled:bg-slate-900/70 dark:disabled:text-slate-500';
