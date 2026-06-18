import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import FormField from '../components/ui/FormField';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { getCurrentActor } from '../lib/actor';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { ServiceError } from '../services/service-errors';
import type { SppGenerateCutoffSetting } from '../db/types';
import { updateSppGenerateCutoffSetting } from '../services/pengaturanService';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

const fallback: SppGenerateCutoffSetting = {
  aktif: true,
  cutoff_tanggal: 20,
  keterangan: 'SPP siswa pindahan mulai bulan depan jika tanggal daftar melewati cutoff',
};

export default function SppGenerateCutoffPage() {
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const setting = useLiveQuery(() => getPengaturanByKunci<SppGenerateCutoffSetting>('spp_generate_cutoff'), [], fallback);
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan. Silakan login ulang.' });
      return;
    }
    const formData = new FormData(event.currentTarget);
    requestConfirm({
      title: 'Simpan Pengaturan?',
      description: 'Apakah Anda yakin ingin menyimpan pengaturan cutoff SPP pindahan?',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await updateSppGenerateCutoffSetting(actor, {
            aktif: formData.get('aktif') === 'on',
            cutoff_tanggal: Number(formData.get('cutoff_tanggal') ?? 20),
            keterangan: String(formData.get('keterangan') ?? ''),
          });
          addToast({ type: 'success', title: 'Berhasil', message: 'Pengaturan cutoff SPP pindahan berhasil diperbarui.' });
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan pengaturan cutoff SPP pindahan.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Cutoff SPP Pindahan" description="Atur cutoff tanggal untuk menentukan kapan SPP siswa pindahan mulai bulan depan jika tanggal daftar melewati batas." />
      <SectionCard title="Pengaturan cutoff SPP pindahan" description="Default aplikasi menggunakan cutoff tanggal 20. Jika aktif dan tanggal daftar melewati cutoff, SPP baru dimulai bulan depan.">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <input type="checkbox" name="aktif" defaultChecked={setting?.aktif ?? true} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
            <div><p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Aktifkan cutoff SPP pindahan</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Jika nonaktif, SPP siswa pindahan dimulai dari bulan tanggal daftar seperti biasa.</p></div>
          </label>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Cutoff tanggal" htmlFor="cutoff_tanggal"><input id="cutoff_tanggal" name="cutoff_tanggal" type="number" min="1" max="31" defaultValue={setting?.cutoff_tanggal ?? 20} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
          </div>
          <FormField label="Keterangan" htmlFor="keterangan"><textarea id="keterangan" name="keterangan" rows={4} defaultValue={setting?.keterangan ?? ''} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
          <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Menyimpan...' : 'Simpan'}</button>
        </form>
      </SectionCard>
    </div>
  );
}
