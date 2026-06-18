
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { CalendarDays, Layers, Settings2, CheckCircle2, Trash2, Plus, Users } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import FormField from '../components/ui/FormField';
import EmptyState from '../components/ui/EmptyState';
import { SummaryGroupCard, SummaryGroupGrid, SummaryGroupMiniCard } from '../components/ui/SummaryGroup';
import KelasPage from './KelasPage';
import { getCurrentActor } from '../lib/actor';
import { formatNumberInput, formatRupiah, formatTanggal, parseNumberInput } from '../lib/format';
import { getTahunAjaranSummary } from '../queries/tahunAjaranQueries';
import { defaultPengaturanPendaftaranTahunAjaran, getPengaturanPendaftaranOrDefault, upsertPengaturanPendaftaranTahunAjaran, type SavePengaturanPendaftaranTahunAjaranInput } from '../services/pendaftaranTahunAjaranService';
import { ServiceError } from '../services/service-errors';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

type DetailTab = 'ringkasan' | 'kelas' | 'pendaftaran' | 'penempatan';

const tabs: Array<{ id: DetailTab; label: string; icon: typeof CalendarDays }> = [
  { id: 'ringkasan', label: 'Ringkasan', icon: CalendarDays },
  { id: 'kelas', label: 'Kelas & Tarif', icon: Layers },
  { id: 'pendaftaran', label: 'Komponen Biaya', icon: Settings2 },
  { id: 'penempatan', label: 'Penempatan & Usia', icon: Users },
];

interface KomponenBiayaItem {
  id: string;
  nama: string;
  nominal: number;
  wajib: boolean;
}

interface PendaftaranFormState {
  pendaftaran_luar_sistem: boolean;
  komponen_biaya: KomponenBiayaItem[];
  mode_tagihan_biaya: 'gabung' | 'pisah';
  jatuh_tempo_mode: 'tanggal_tetap' | 'hari_setelah_daftar';
  jatuh_tempo_tanggal: string;
  jatuh_tempo_hari_setelah_daftar: string;
  cutoff_bulan: string;
  cutoff_tanggal: string;
}



function toFormState(setting: Awaited<ReturnType<typeof getPengaturanPendaftaranOrDefault>>): PendaftaranFormState {
  return {
    pendaftaran_luar_sistem: Boolean(setting.pendaftaran_luar_sistem),
    komponen_biaya: setting.komponen_biaya || [],
    mode_tagihan_biaya: setting.mode_tagihan_biaya || 'gabung',
    jatuh_tempo_mode: setting.jatuh_tempo_mode || 'tanggal_tetap',
    jatuh_tempo_tanggal: setting.jatuh_tempo_tanggal ?? '',
    jatuh_tempo_hari_setelah_daftar: String(setting.jatuh_tempo_hari_setelah_daftar ?? 14),
    cutoff_bulan: String(setting.cutoff_bulan ?? 7),
    cutoff_tanggal: String(setting.cutoff_tanggal ?? 1),
  };
}

export default function TahunAjaranDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const [errors, setErrors] = useState<Partial<Record<keyof PendaftaranFormState, string>>>({});
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeTab = useMemo<DetailTab>(() => {
    const raw = searchParams.get('tab');
    return raw === 'kelas' || raw === 'pendaftaran' || raw === 'penempatan' ? raw : 'ringkasan';
  }, [searchParams]);

  const tahunAjaran = useLiveQuery(async () => id ? await db.tahun_ajaran.get(id) : undefined, [id], undefined);
  const summary = useLiveQuery(() => id ? getTahunAjaranSummary(id) : Promise.resolve(null), [id], null);
  const pendaftaranSetting = useLiveQuery(() => id ? getPengaturanPendaftaranOrDefault(id) : Promise.resolve(null), [id], null);
  const [form, setForm] = useState<PendaftaranFormState>(toFormState({
    ...defaultPengaturanPendaftaranTahunAjaran,
    id: '',
    tahun_ajaran_id: id ?? '',
    pendaftaran_luar_sistem: false,
    komponen_biaya: [],
    mode_tagihan_biaya: 'gabung',
    created_at: '',
    updated_at: '',
    deleted_at: null,
  }));

  useEffect(() => {
    if (pendaftaranSetting) {
      setForm(toFormState(pendaftaranSetting));
    }
  }, [pendaftaranSetting]);

  if (!id || tahunAjaran === null || tahunAjaran?.deleted_at) {
    return <EmptyState title="Tahun ajaran tidak ditemukan" description="Data tahun ajaran tidak tersedia di IndexedDB lokal." />;
  }

  if (!tahunAjaran) {
    return null;
  }

  const status = tahunAjaran.status ?? (tahunAjaran.aktif ? 'aktif' : 'draft');
  const isArchived = status === 'arsip';
  const isFormReadOnly = isArchived;

  function updateTab(tab: DetailTab) {
    setSearchParams(tab === 'ringkasan' ? {} : { tab });
  }

  function updateForm<K extends keyof PendaftaranFormState>(key: K, value: PendaftaranFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function addKomponenBiaya() {
    if (isFormReadOnly) return;
    setForm((f) => ({
      ...f,
      komponen_biaya: [...f.komponen_biaya, { id: crypto.randomUUID(), nama: '', nominal: 0, wajib: true }],
    }));
  }

  function removeKomponenBiaya(komponenId: string) {
    if (isFormReadOnly) return;
    setForm((f) => ({
      ...f,
      komponen_biaya: f.komponen_biaya.filter((k) => k.id !== komponenId),
    }));
  }

  function updateKomponenBiaya(komponenId: string, field: keyof KomponenBiayaItem, value: string | number | boolean) {
    if (isFormReadOnly) return;
    setForm((f) => ({
      ...f,
      komponen_biaya: f.komponen_biaya.map((k) => k.id === komponenId ? { ...k, [field]: value } : k),
    }));
  }

  async function handleSavePendaftaran(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actor || !id) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan. Silakan login ulang.' });
      return;
    }
    if (!tahunAjaran) {
      addToast({ type: 'error', title: 'Gagal', message: 'Tahun ajaran tidak ditemukan.' });
      return;
    }

    const nextErrors: Partial<Record<keyof PendaftaranFormState, string>> = {};

    if (!form.pendaftaran_luar_sistem) {
      if (form.jatuh_tempo_mode === 'tanggal_tetap') {
        if (!form.jatuh_tempo_tanggal) {
          nextErrors.jatuh_tempo_tanggal = 'Tanggal jatuh tempo wajib diisi.';
        } else if (form.jatuh_tempo_tanggal < tahunAjaran.mulai || form.jatuh_tempo_tanggal > tahunAjaran.selesai) {
          nextErrors.jatuh_tempo_tanggal = 'Harus berada dalam periode tahun ajaran.';
        }
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    requestConfirm({
      title: 'Simpan Pengaturan?',
      description: 'Apakah Anda yakin ingin menyimpan pengaturan pendaftaran/komponen biaya ini?',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        const payload: SavePengaturanPendaftaranTahunAjaranInput = {
          tahun_ajaran_id: id,
          pendaftaran_luar_sistem: form.pendaftaran_luar_sistem,
          biaya_pendaftaran_default: form.pendaftaran_luar_sistem ? 0 : form.komponen_biaya.reduce((sum, k) => sum + k.nominal, 0),
          opsi_bayar_default: 'full',
          komponen_biaya: form.pendaftaran_luar_sistem ? [] : form.komponen_biaya.filter((k) => k.nama.trim()),
          mode_tagihan_biaya: form.mode_tagihan_biaya,
          jatuh_tempo_mode: form.pendaftaran_luar_sistem ? 'tanggal_tetap' : form.jatuh_tempo_mode,
          jatuh_tempo_tanggal: form.pendaftaran_luar_sistem ? null : (form.jatuh_tempo_mode === 'tanggal_tetap' ? form.jatuh_tempo_tanggal : null),
          jatuh_tempo_hari_setelah_daftar: form.pendaftaran_luar_sistem ? null : (form.jatuh_tempo_mode === 'hari_setelah_daftar' ? Number(form.jatuh_tempo_hari_setelah_daftar || 14) : null),
          cutoff_bulan: Number(form.cutoff_bulan || 7),
          cutoff_tanggal: Number(form.cutoff_tanggal || 1),
        };

        setIsSubmitting(true);
        try {
          await upsertPengaturanPendaftaranTahunAjaran(actor, payload);
          addToast({ type: 'success', title: 'Berhasil', message: 'Pengaturan berhasil disimpan.' });
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan pengaturan.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 disabled:dark:border-slate-800 disabled:dark:bg-slate-900/50 disabled:dark:text-slate-600";
  const errorInputClass = "w-full rounded-xl border border-danger-300 bg-danger-50/50 px-4 py-3 text-sm text-danger-900 focus:border-danger-500 focus:outline-none focus:ring-4 focus:ring-danger-500/10 dark:border-danger-900 dark:bg-danger-950/20 dark:text-danger-100";
  const inputClassFor = (name: string) => errors[name as keyof PendaftaranFormState] ? errorInputClass : inputClass;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`Detail Tahun Ajaran ${tahunAjaran.nama}`}
        description="Kelola konteks periode: ringkasan, kelas, dan komponen biaya."
        actions={<Link to="/tahun-ajaran" className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800">Daftar Tahun Ajaran</Link>}
      />

      {isArchived ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">Tahun ajaran arsip dikunci. Data hanya bisa dilihat dan tidak bisa diubah.</div> : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => updateTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${active
                  ? 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0 space-y-6">

        {activeTab === 'ringkasan' ? (
          <SectionCard title="Ringkasan periode" description="Ringkasan data utama untuk tahun ajaran ini dari IndexedDB lokal.">
            <div className="mb-5 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Periode</p>
              <p className="mt-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">{tahunAjaran.nama}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatTanggal(tahunAjaran.mulai)} - {formatTanggal(tahunAjaran.selesai)}</p>
              <span className="mt-3 inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">{status}</span>
            </div>
            {!summary ? <EmptyState title="Memuat ringkasan" description="Ringkasan sedang disiapkan." /> : (
              <SummaryGroupGrid>
                <SummaryGroupCard title="Ringkasan Siswa" tone="brand" layout="mini">
                  <SummaryGroupMiniCard label="Kelas" value={summary.jumlahKelas} highlight />
                  {status === 'draft' ? (
                    <>
                      <SummaryGroupMiniCard label="Calon" value={summary.jumlahSiswaCalon} />
                      <SummaryGroupMiniCard label="Batal Daftar" value={summary.jumlahSiswaBerhenti} />
                    </>
                  ) : (
                    <>
                      <SummaryGroupMiniCard label={isArchived ? 'Naik Kelas' : 'Aktif'} value={summary.jumlahSiswaAktif} />
                      <SummaryGroupMiniCard label={isArchived ? 'Lulus' : 'Calon'} value={isArchived ? summary.jumlahSiswaLulus : summary.jumlahSiswaCalon} />
                      <SummaryGroupMiniCard label="Berhenti" value={summary.jumlahSiswaBerhenti} />
                    </>
                  )}
                </SummaryGroupCard>
                <SummaryGroupCard title="Ringkasan Keuangan" tone="emerald" layout="mini">
                  <SummaryGroupMiniCard label="Jumlah Tagihan" value={`${summary.jumlahTagihan} tagihan`} />
                  <SummaryGroupMiniCard label="Ada Pembayaran" value={`${summary.jumlahPembayaran} transaksi`} />
                  <SummaryGroupMiniCard label="Total Tagihan" value={formatRupiah(summary.totalTagihan)} highlight />
                  <SummaryGroupMiniCard label="Sisa Tagihan" value={formatRupiah(summary.totalTunggakan)} />
                </SummaryGroupCard>
              </SummaryGroupGrid>
            )}
          </SectionCard>
        ) : null}

        {activeTab === 'kelas' ? <KelasPage fixedYearId={id} embedded /> : null}

        {activeTab === 'pendaftaran' ? (
          <SectionCard title="Pengaturan komponen biaya" description="Konfigurasi biaya tagihan awal yang melekat pada pendaftaran tahun ajaran ini.">
            <form className="space-y-5" onSubmit={handleSavePendaftaran}>

              <label className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 text-sm font-bold text-brand-700 dark:border-brand-950/40 dark:bg-brand-950/20 dark:text-brand-300">
                <input type="checkbox" checked={form.pendaftaran_luar_sistem} onChange={(event) => updateForm('pendaftaran_luar_sistem', event.target.checked)} disabled={isFormReadOnly} className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-600" />
                Pendaftaran dilakukan di luar sistem (Tagihan awal pendaftaran tidak dibuat otomatis)
              </label>

              {!form.pendaftaran_luar_sistem && (
                <>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                    Komponen biaya pendaftaran. Anda bisa menambah beberapa komponen (Uang Pangkal, Seragam, Buku, dll). Pilih apakah semua komponen dijadikan satu tagihan atau dipisah menjadi tagihan terpisah per komponen.
                  </div>

                  <div className="space-y-3">
                    {form.komponen_biaya.map((k, i) => (
                      <div key={k.id} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 md:grid-cols-[1fr_1fr_auto_auto] md:items-start">
                        <FormField label={`Komponen ${i + 1}`} htmlFor={`biaya_nama_${k.id}`}><input id={`biaya_nama_${k.id}`} value={k.nama} onChange={(e) => updateKomponenBiaya(k.id, 'nama', e.target.value)} disabled={isFormReadOnly} placeholder="misal: Uang Pangkal" className={inputClass} /></FormField>
                        <FormField label="Nominal" htmlFor={`biaya_nominal_${k.id}`}><input id={`biaya_nominal_${k.id}`} inputMode="numeric" value={formatNumberInput(k.nominal)} onChange={(e) => updateKomponenBiaya(k.id, 'nominal', parseNumberInput(e.target.value))} disabled={isFormReadOnly} className={inputClass} /></FormField>
                        <label className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5 text-sm font-bold text-slate-600 dark:border-slate-800 dark:text-slate-300 md:mt-7"><input type="checkbox" checked={k.wajib} onChange={(e) => updateKomponenBiaya(k.id, 'wajib', e.target.checked)} disabled={isFormReadOnly} className="h-4 w-4 rounded border-slate-300 text-brand-600" /> Wajib</label>
                        <button type="button" onClick={() => removeKomponenBiaya(k.id)} disabled={isFormReadOnly} className="inline-flex items-center justify-center gap-2 rounded-xl border border-danger-100 px-3 py-2.5 text-sm font-bold text-danger-700 hover:bg-danger-50 dark:border-danger-950/50 dark:text-danger-400 md:mt-7 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>

                  {!isFormReadOnly && (
                    <button type="button" onClick={addKomponenBiaya} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"><Plus className="h-4 w-4" /> Tambah Komponen</button>
                  )}

                  {form.komponen_biaya.length > 0 && (
                    <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 dark:border-brand-950/50 dark:bg-brand-950/20">
                      <p className="text-sm font-extrabold text-brand-700 dark:text-brand-300">Total: {formatRupiah(form.komponen_biaya.reduce((s, k) => s + k.nominal, 0))}</p>
                      <div className="mt-3 flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                          <input type="radio" name="mode_tagihan" checked={form.mode_tagihan_biaya === 'gabung'} onChange={() => updateForm('mode_tagihan_biaya', 'gabung')} disabled={isFormReadOnly} className="h-4 w-4 text-brand-600" /> Gabung jadi 1 tagihan
                        </label>
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                          <input type="radio" name="mode_tagihan" checked={form.mode_tagihan_biaya === 'pisah'} onChange={() => updateForm('mode_tagihan_biaya', 'pisah')} disabled={isFormReadOnly} className="h-4 w-4 text-brand-600" /> Pisah per komponen
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Jatuh Tempo Pendaftaran</p>
                    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField label="Mode" htmlFor="jt_mode">
                        <select id="jt_mode" value={form.jatuh_tempo_mode} onChange={(e) => updateForm('jatuh_tempo_mode', e.target.value as PendaftaranFormState['jatuh_tempo_mode'])} disabled={isFormReadOnly} className={inputClass}>
                          <option value="tanggal_tetap">Tanggal tetap</option>
                          <option value="hari_setelah_daftar">Hari setelah daftar</option>
                        </select>
                      </FormField>
                      {form.jatuh_tempo_mode === 'tanggal_tetap' ? (
                        <FormField label="Tanggal jatuh tempo" htmlFor="jatuh_tempo_tanggal" error={errors.jatuh_tempo_tanggal} hint={`Wajib berada antara ${tahunAjaran.mulai} dan ${tahunAjaran.selesai}.`}><input id="jatuh_tempo_tanggal" type="date" value={form.jatuh_tempo_tanggal} onChange={(e) => updateForm('jatuh_tempo_tanggal', e.target.value)} disabled={isFormReadOnly} className={inputClassFor('jatuh_tempo_tanggal')} /></FormField>
                      ) : (
                        <FormField label="Hari setelah daftar" htmlFor="jatuh_tempo_hari_setelah_daftar"><input id="jatuh_tempo_hari_setelah_daftar" inputMode="numeric" value={form.jatuh_tempo_hari_setelah_daftar} onChange={(e) => updateForm('jatuh_tempo_hari_setelah_daftar', e.target.value.replace(/\D/g, ''))} disabled={isFormReadOnly} className={inputClass} /></FormField>
                      )}
                    </div>
                  </div>

                </>
              )}

              {!isFormReadOnly ? <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"><CheckCircle2 className="h-4 w-4" />{isSubmitting ? 'Menyimpan...' : 'Simpan Pengaturan'}</button> : null}
            </form>
          </SectionCard>
        ) : null}

        {activeTab === 'penempatan' ? (
          <SectionCard title="Pengaturan Penempatan Usia" description="Konfigurasi cutoff umur untuk penempatan kelas otomatis siswa baru.">
            <form className="space-y-5" onSubmit={handleSavePendaftaran}>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <FormField label="Bulan cutoff umur" htmlFor="cutoff_bulan">
                  <input id="cutoff_bulan" type="number" min="1" max="12" value={form.cutoff_bulan} onChange={(event) => updateForm('cutoff_bulan', event.target.value)} disabled={isFormReadOnly} className={inputClass} />
                </FormField>
                <FormField label="Tanggal cutoff umur" htmlFor="cutoff_tanggal">
                  <input id="cutoff_tanggal" type="number" min="1" max="31" value={form.cutoff_tanggal} onChange={(event) => updateForm('cutoff_tanggal', event.target.value)} disabled={isFormReadOnly} className={inputClass} />
                </FormField>
              </div>
              {!isFormReadOnly ? <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"><CheckCircle2 className="h-4 w-4" />{isSubmitting ? 'Menyimpan...' : 'Simpan Pengaturan'}</button> : null}
            </form>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
