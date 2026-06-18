import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import FormField from '../components/ui/FormField';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { getCurrentActor } from '../lib/actor';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { ServiceError } from '../services/service-errors';
import { type PenempatanSiswaBaruSetting, updatePenempatanSiswaBaruSetting } from '../services/pengaturanService';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

const fallback: PenempatanSiswaBaruSetting = {
  aktifkan_penempatan_otomatis: true,
  cutoff_bulan: 7,
  cutoff_tanggal: 1,
  keterangan: 'Cutoff umur default 1 Juli',
};

export default function PenempatanSiswaBaruPage() {
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const setting = useLiveQuery(() => getPengaturanByKunci<PenempatanSiswaBaruSetting>('penempatan_siswa_baru'), [], fallback);
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
      description: 'Apakah Anda yakin ingin menyimpan pengaturan penempatan siswa baru ini?',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await updatePenempatanSiswaBaruSetting(actor, {
            aktifkan_penempatan_otomatis: formData.get('aktifkan_penempatan_otomatis') === 'on',
            cutoff_bulan: Number(formData.get('cutoff_bulan') ?? 7),
            cutoff_tanggal: Number(formData.get('cutoff_tanggal') ?? 1),
            keterangan: String(formData.get('keterangan') ?? ''),
          });
          addToast({ type: 'success', title: 'Berhasil', message: 'Pengaturan penempatan siswa baru berhasil diperbarui.' });
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan pengaturan penempatan siswa baru.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Penempatan Siswa Baru" description="Atur cutoff umur dan toggle penempatan kelas otomatis untuk siswa baru yang sudah lunas." />
      <SectionCard title="Pengaturan cutoff umur" description="Default aplikasi menggunakan 1 Juli. Admin tetap bisa mengubah hasil penempatan otomatis secara manual dari detail siswa.">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <input type="checkbox" name="aktifkan_penempatan_otomatis" defaultChecked={setting?.aktifkan_penempatan_otomatis ?? true} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
            <div><p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Aktifkan penempatan otomatis</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Jika nonaktif, siswa baru yang lunas tetap calon sampai admin menentukan kelas manual.</p></div>
          </label>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Bulan cutoff" htmlFor="cutoff_bulan"><input id="cutoff_bulan" name="cutoff_bulan" type="number" min="1" max="12" defaultValue={setting?.cutoff_bulan ?? 7} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
            <FormField label="Tanggal cutoff" htmlFor="cutoff_tanggal"><input id="cutoff_tanggal" name="cutoff_tanggal" type="number" min="1" max="31" defaultValue={setting?.cutoff_tanggal ?? 1} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
          </div>
          <FormField label="Keterangan" htmlFor="keterangan"><textarea id="keterangan" name="keterangan" rows={4} defaultValue={setting?.keterangan ?? ''} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
          <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Menyimpan...' : 'Simpan'}</button>
        </form>
      </SectionCard>
    </div>
  );
}
