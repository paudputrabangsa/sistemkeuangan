import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Plus, Pencil, CheckCircle2, XCircle, CalendarDays, Eye, Zap } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Pagination, { paginateData } from '../components/ui/Pagination';
import SectionCard from '../components/ui/SectionCard';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { useAuthStore } from '../store/authStore';
import { getCurrentActor } from '../lib/actor';
import { formatTanggal } from '../lib/format';
import { createTahunAjaran, updateTahunAjaran, type SaveTahunAjaranInput } from '../services/tahunAjaranService';
import { ServiceError } from '../services/service-errors';
import { isValidTahunAjaranName } from '../services/nameNormalizationService';
import { useToastStore } from '../store/toastStore';

interface FormState {
  nama: string;
  mulai: string;
  selesai: string;
}

const emptyForm: FormState = {
  nama: '',
  mulai: '',
  selesai: '',
};

export default function TahunAjaranPage() {
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const tahunAjaran = useLiveQuery(() => listTahunAjaran(), [], []);
  const activeYear = (tahunAjaran ?? []).find((item) => item.aktif || item.status === 'aktif') ?? null;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { addToast } = useToastStore();

  const formTitle = useMemo(() => (editingId ? 'Edit tahun ajaran' : 'Buat tahun ajaran baru'), [editingId]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setIsFormOpen(false);
    setErrors({});
  }

  function openEditForm(id: string) {
    const selected = tahunAjaran.find((item) => item.id === id);
    if (!selected) {
      return;
    }

    setForm({
      nama: selected.nama,
      mulai: selected.mulai,
      selesai: selected.selesai,
    });
    setEditingId(id);
    setErrors({});
    setIsFormOpen(true);
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validateForm(input: FormState) {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};

    if (!input.nama.trim()) {
      nextErrors.nama = 'Nama tahun ajaran wajib diisi.';
    } else if (!isValidTahunAjaranName(input.nama)) {
      nextErrors.nama = 'Format: YYYY/YYYY (tahun kedua = tahun pertama + 1).';
    }

    if (!input.mulai) {
      nextErrors.mulai = 'Tanggal mulai wajib diisi.';
    }

    if (!input.selesai) {
      nextErrors.selesai = 'Tanggal selesai wajib diisi.';
    }

    return nextErrors;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan. Silakan login ulang.' });
      return;
    }

    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload: SaveTahunAjaranInput = {
      nama: form.nama.trim(),
      mulai: form.mulai,
      selesai: form.selesai,
    };

    setIsSubmitting(true);

    try {
      if (editingId) {
        await updateTahunAjaran(actor, editingId, payload);
        addToast({ type: 'success', title: 'Berhasil', message: 'Tahun ajaran berhasil diperbarui.' });
      } else {
        await createTahunAjaran(actor, payload);
        addToast({ type: 'success', title: 'Berhasil', message: 'Tahun ajaran berhasil dibuat.' });
      }

      resetForm();
    } catch (error) {
      addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan tahun ajaran.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Tahun Ajaran"
        description="Kelola periode akademik sekolah. Semua perubahan disimpan lokal ke IndexedDB dan otomatis masuk antrean sinkronisasi."
        actions={
          <Link
            to="/tahun-ajaran/setup-draft"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Buat Tahun Ajaran Draft
          </Link>
        }
      />



      {isFormOpen ? (
        <SectionCard title={formTitle} description="Isi nama dan rentang periode. Tahun ajaran baru disimpan sebagai draft dan hanya diaktifkan melalui Lanjut Tahun Ajaran.">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Nama tahun ajaran" htmlFor="nama" error={errors.nama}>
                <input
                  id="nama"
                  value={form.nama}
                  onChange={(event) => updateForm('nama', event.target.value)}
                  placeholder="Contoh: 2026/2027"
                  className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Tanggal mulai" htmlFor="mulai" error={errors.mulai}>
                <input
                  id="mulai"
                  type="date"
                  value={form.mulai}
                  onChange={(event) => updateForm('mulai', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                />
              </FormField>

              <FormField label="Tanggal selesai" htmlFor="selesai" error={errors.selesai}>
                <input
                  id="selesai"
                  type="date"
                  value={form.selesai}
                  onChange={(event) => updateForm('selesai', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                />
              </FormField>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmitting ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <XCircle className="h-4 w-4" />
                Batal
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Daftar tahun ajaran" description="Tinjau seluruh periode. Tahun ajaran aktif ditetapkan melalui Lanjut Tahun Ajaran, bukan aktivasi manual dari daftar.">
        {tahunAjaran.length === 0 ? (
          <EmptyState
            title="Belum ada tahun ajaran"
            description="Mulai dengan membuat tahun ajaran pertama agar data kelas dan transaksi bisa dipetakan ke periode yang benar."
            action={
              <Link
                to="/tahun-ajaran/setup-draft"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Buat Tahun Ajaran Draft
              </Link>
            }
          />
        ) : (
          <div className="-mx-4 sm:mx-0 overflow-x-auto">
            <table className="w-full min-w-[400px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-4 py-3 font-semibold">Nama & Periode</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {paginateData(tahunAjaran, page, pageSize).map((item) => {
                  const status = item.status ?? (item.aktif ? 'aktif' : 'draft');
                  return (
                  <tr key={item.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                    <td className="px-4 py-4">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{item.nama}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatTanggal(item.mulai)} - {formatTanggal(item.selesai)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {status === 'aktif' ? (
                        <span className="inline-flex rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-bold text-success-700 dark:bg-success-950/30 dark:text-success-400">
                          Aktif
                        </span>
                      ) : status === 'arsip' ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Arsip
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-warning-50 px-2.5 py-1 text-[11px] font-bold text-warning-700 dark:bg-warning-950/30 dark:text-warning-400">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {status === 'draft' && !activeYear && (
                          <Link to={`/lanjut-tahun-ajaran?tahunAjaranId=${item.id}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-500">
                            <Zap className="h-3.5 w-3.5" />
                            Aktivasi
                          </Link>
                        )}
                        {status === 'draft' && activeYear && (
                          <Link to={`/lanjut-tahun-ajaran?tahunAjaranId=${item.id}`} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500">
                            <Zap className="h-3.5 w-3.5" />
                            Lanjut TA
                          </Link>
                        )}
                        {status === 'draft' || status === 'aktif' ? (
                          <button type="button" onClick={() => openEditForm(item.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800">
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        ) : null}
                        <Link to={`/tahun-ajaran/${item.id}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-500">
                          <Eye className="h-3.5 w-3.5" />
                          Detail
                        </Link>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination currentPage={page} totalItems={tahunAjaran.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        )}
      </SectionCard>
    </div>
  );
}
