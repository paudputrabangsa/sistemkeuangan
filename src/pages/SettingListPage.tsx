import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { getCurrentActor } from '../lib/actor';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { ServiceError } from '../services/service-errors';
import { type SettingListItem, updateSettingList } from '../services/pengaturanService';
import { getDefaultSettingList } from '../services/pengaturanRepository';
import { newId } from '../services/service-helpers';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';
import FormField from '../components/ui/FormField';

export default function SettingListPage({ title, description, settingKey }: { title: string; description: string; settingKey: 'jenis_tagihan' | 'metode_pembayaran'; }) {
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const liveItems = useLiveQuery(() => getPengaturanByKunci<SettingListItem[]>(settingKey), [settingKey], [] as SettingListItem[]);
  const [draft, setDraft] = useState<SettingListItem[] | null>(null);
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultItems = getDefaultSettingList(settingKey);
  const sanitizeItems = (source: SettingListItem[]) => settingKey === 'metode_pembayaran'
    ? source.filter((item) => item.nama.trim().toLowerCase() !== 'split')
    : source.filter((item) => item.nama.trim().toLowerCase() !== 'seragam');
  const items = sanitizeItems(draft ?? (liveItems?.length ? liveItems : defaultItems));

  function ensureDraft() {
    if (!draft) {
      setDraft(sanitizeItems(liveItems ?? []).map((item) => ({ ...item })));
    }
  }

  function updateItem(index: number, changes: Partial<SettingListItem>) {
    ensureDraft();
    const base = (draft ?? sanitizeItems(liveItems ?? []).map((item) => ({ ...item })));
    const next = [...base];
    next[index] = { ...next[index], ...changes };
    setDraft(next);
    setErrors((current) => { const next = { ...current }; delete next[index]; return next; });
  }

  function addItem() {
    const base = (draft ?? sanitizeItems(liveItems ?? []).map((item) => ({ ...item })));
    setDraft([...base, { id: newId(), nama: '', aktif: true }]);
  }

  function removeItem(index: number) {
    const base = (draft ?? (liveItems ?? []).map((item) => ({ ...item })));
    setDraft(base.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSave() {
    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan. Silakan login ulang.' });
      return;
    }

    const nextErrors: Record<number, string> = {};
    items.forEach((item, index) => {
      if (!item.nama.trim()) nextErrors[index] = 'Nama item wajib diisi.';
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    requestConfirm({
      title: 'Simpan Pengaturan?',
      description: 'Apakah Anda yakin ingin menyimpan perubahan pada daftar ini?',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await updateSettingList(actor, settingKey, items);
          setDraft(null);
          addToast({ type: 'success', title: 'Berhasil', message: 'Pengaturan berhasil diperbarui.' });
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan pengaturan.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={title} description={description} actions={<button type="button" onClick={addItem} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500"><Plus className="h-4 w-4" />Tambah Item</button>} />
      <SectionCard title="Daftar item" description="Tambah, ubah nama, atau aktif/nonaktifkan item. Khusus jenis tagihan, hindari menonaktifkan SPP bila masih dipakai proses generate.">
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.id} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 md:grid-cols-[1fr_auto_auto] dark:border-slate-800 dark:bg-slate-900/30">
              <FormField label="" htmlFor={`item-nama-${index}`} error={errors[index]}>
                <input id={`item-nama-${index}`} value={item.nama} onChange={(event) => updateItem(index, { nama: event.target.value })} placeholder="Nama item" className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
              </FormField>
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 h-[46px]"><input type="checkbox" checked={item.aktif} onChange={(event) => updateItem(index, { aktif: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />Aktif</label>
              <button type="button" onClick={() => removeItem(index)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-danger-500 h-[46px]"><Trash2 className="h-4 w-4" />Hapus</button>
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-3"><button type="button" onClick={handleSave} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}</button><button type="button" onClick={() => setDraft(null)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800">Reset</button></div>
      </SectionCard>
    </div>
  );
}
