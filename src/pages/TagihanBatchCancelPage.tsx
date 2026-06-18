import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { getCurrentActor } from '../lib/actor';
import { formatKelasLabel } from '../lib/format';
import { listActiveKelas } from '../queries/kelasQueries';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { listSiswaWithFilters } from '../queries/siswaQueries';
import { listTagihanWithFilters } from '../queries/tagihanQueries';
import { batchDeleteTagihan } from '../services/tagihanService';
import { ServiceError } from '../services/service-errors';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

interface SettingOption {
  id: string;
  nama: string;
  aktif: boolean;
}

export default function TagihanBatchCancelPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();

  const kelasOptions = useLiveQuery(() => listActiveKelas(), [], []);
  const siswaAktif = useLiveQuery(() => listSiswaWithFilters({ status: 'aktif' }), [], []);
  const jenisTagihanOptions = useLiveQuery(() => getPengaturanByKunci<SettingOption[]>('jenis_tagihan'), [], [] as SettingOption[]);
  const tagihan = useLiveQuery(() => listTagihanWithFilters({}), [], []);

  const activeJenisOptions = useMemo(() => (jenisTagihanOptions ?? []).filter((item) => item.aktif), [jenisTagihanOptions]);

  const [batchForm, setBatchForm] = useState({
    nama_tagihan: '',
    jenis: '',
    target: 'semua' as 'semua' | 'kelas' | 'individu',
    kelas_ids: [] as string[],
    siswa_ids: [] as string[],
  });
  const [isBatchCancelling, setIsBatchCancelling] = useState(false);

  const updateBatchField = (field: keyof typeof batchForm, value: any) => {
    setBatchForm((prev) => ({ ...prev, [field]: value }));
  };

  const cancellableTagihanNames = useMemo(() => {
    const names = new Set<string>();
    for (const item of tagihan) {
      if (item.deleted_at || item.status === 'dibatalkan') continue;
      if (item.sudah_dibayar > 0) continue;
      if (item.jenis === 'spp' || item.jenis === 'daftar_ulang') continue;
      names.add(item.nama_tagihan);
    }
    return Array.from(names).sort();
  }, [tagihan]);

  const batchPreview = useMemo(() => {
    if (!batchForm.nama_tagihan && !batchForm.jenis) return { count: 0, ids: [] as string[] };
    const matchedIds: string[] = [];
    for (const item of tagihan) {
      if (item.deleted_at || item.status === 'dibatalkan') continue;
      if (item.sudah_dibayar > 0) continue;
      if (item.jenis === 'spp' || item.jenis === 'daftar_ulang') continue;
      if (batchForm.nama_tagihan && item.nama_tagihan !== batchForm.nama_tagihan) continue;
      if (batchForm.jenis && item.jenis !== batchForm.jenis) continue;
      if (batchForm.target === 'kelas' && batchForm.kelas_ids.length > 0) {
        if (!item.activeClass || !batchForm.kelas_ids.includes(item.activeClass.id)) continue;
      }
      if (batchForm.target === 'individu' && batchForm.siswa_ids.length > 0) {
        if (!batchForm.siswa_ids.includes(item.siswa_id)) continue;
      }
      matchedIds.push(item.id);
    }
    return { count: matchedIds.length, ids: matchedIds };
  }, [tagihan, batchForm]);

  const selectCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader
        title="Batalkan Tagihan Massal"
        description="Cari tagihan berdasarkan nama dan jenis, lalu batalkan secara massal."
        actions={
          <button
            type="button"
            onClick={() => navigate('/tagihan')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali
          </button>
        }
      />

      <SectionCard title="Cari & Batalkan Tagihan" description="Pilih nama tagihan, jenis, dan target siswa untuk melihat pratinjau sebelum membatalkan.">
        <div className="space-y-5">
          {cancellableTagihanNames.length === 0 ? (
            <EmptyState title="Tidak ada tagihan yang bisa dibatalkan" description="Tidak ada tagihan yang memenuhi syarat untuk dibatalkan massal saat ini." />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <FormField label="Nama tagihan" htmlFor="batch_nama_tagihan">
                  <select id="batch_nama_tagihan" value={batchForm.nama_tagihan} onChange={(e) => updateBatchField('nama_tagihan', e.target.value)} className={selectCls}>
                    <option value="">Pilih nama tagihan</option>
                    {cancellableTagihanNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </FormField>
                <FormField label="Jenis tagihan" htmlFor="batch_jenis">
                  <select id="batch_jenis" value={batchForm.jenis} onChange={(e) => updateBatchField('jenis', e.target.value)} className={selectCls}>
                    <option value="">Semua jenis</option>
                    {activeJenisOptions.map((i) => <option key={i.id} value={i.nama.toLowerCase()}>{i.nama}</option>)}
                  </select>
                </FormField>
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Target siswa</p>
                <div className="flex flex-wrap gap-3">
                  {([{ value: 'semua', label: 'Semua siswa' }, { value: 'kelas', label: 'Per kelas' }, { value: 'individu', label: 'Per individu' }] as const).map((option) => (
                    <button key={option.value} type="button" onClick={() => updateBatchField('target', option.value)} className={`rounded-xl px-4 py-3 text-sm font-bold transition ${batchForm.target === option.value ? 'bg-brand-600 text-white shadow-md shadow-brand-600/10' : 'border border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {batchForm.target === 'kelas' && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Pilih kelas</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {kelasOptions.map((kelas) => (
                      <label key={kelas.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white/70 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                        <input type="checkbox" checked={batchForm.kelas_ids.includes(kelas.id)} onChange={() => updateBatchField('kelas_ids', batchForm.kelas_ids.includes(kelas.id) ? batchForm.kelas_ids.filter((id) => id !== kelas.id) : [...batchForm.kelas_ids, kelas.id])} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                        <p className="font-semibold text-slate-700 dark:text-slate-300">{kelas.nama_kelas}</p>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {batchForm.target === 'individu' && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Pilih siswa</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {siswaAktif.map((siswa) => (
                      <label key={siswa.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white/70 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                        <input type="checkbox" checked={batchForm.siswa_ids.includes(siswa.id)} onChange={() => updateBatchField('siswa_ids', batchForm.siswa_ids.includes(siswa.id) ? batchForm.siswa_ids.filter((id) => id !== siswa.id) : [...batchForm.siswa_ids, siswa.id])} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                        <div>
                          <p className="font-semibold text-slate-700 dark:text-slate-300">{siswa.nama}</p>
                          <p className="mt-1 text-xs text-slate-400">{siswa.activeClass ? formatKelasLabel(siswa.activeClass) : '-'}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-danger-100 bg-danger-50/80 p-4 dark:border-danger-950/40 dark:bg-danger-950/20">
                <div>
                  <p className="text-sm font-semibold text-danger-700 dark:text-danger-400">Preview: {batchPreview.count} tagihan akan dibatalkan</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    requestConfirm({
                      title: 'Batalkan tagihan massal?',
                      description: `Batalkan ${batchPreview.count} tagihan? Aksi ini tidak bisa dibatalkan.`,
                      confirmLabel: `Batalkan ${batchPreview.count} Tagihan`,
                      variant: 'danger',
                      requireInput: true,
                      inputLabel: 'Alasan Pembatalan Massal',
                      onConfirm: async (catatan?: string) => {
                        if (!actor) return;
                        setIsBatchCancelling(true);
                        try {
                          await batchDeleteTagihan(actor, batchPreview.ids, catatan || '-');
                          addToast({ type: 'success', title: 'Berhasil', message: `${batchPreview.count} tagihan berhasil dibatalkan.` });
                          setBatchForm({ nama_tagihan: '', jenis: '', target: 'semua', kelas_ids: [], siswa_ids: [] });
                        } catch (error) {
                          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal membatalkan tagihan massal.' });
                        } finally {
                          setIsBatchCancelling(false);
                        }
                      }
                    });
                  }}
                  disabled={isBatchCancelling || batchPreview.count === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-danger-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-danger-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBatchCancelling ? 'Memproses...' : `Batalkan ${batchPreview.count} Tagihan`}
                </button>
              </div>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
