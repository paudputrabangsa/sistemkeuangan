import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Layers, Pencil, Plus, Trash2, FileEdit, Settings2, ShieldCheck } from 'lucide-react';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import PageHeader from '../components/ui/PageHeader';
import { getCurrentActor } from '../lib/actor';
import { formatNumberInput, formatRupiah, parseNumberInput } from '../lib/format';
import { listActiveKelas } from '../queries/kelasQueries';
import { listTingkat } from '../queries/tingkatQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { ServiceError } from '../services/service-errors';
import { createKelas, deleteKelas, updateKelas, type SaveKelasInput } from '../services/kelasService';
import { createTingkat, deleteTingkat, updateTingkat, type SaveTingkatInput } from '../services/tingkatService';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

// === Tingkat Form State ===
interface TingkatFormState {
  tahun_ajaran_id: string;
  nama: string;
  urutan: string;
  tarif_spp: string;
  usia_min_tahun: string;
  usia_max_tahun: string;
}

const emptyTingkatForm: TingkatFormState = {
  tahun_ajaran_id: '',
  nama: '',
  urutan: '1',
  tarif_spp: '',
  usia_min_tahun: '',
  usia_max_tahun: '',
};

// === Kelas Form State ===
interface KelasFormState {
  tahun_ajaran_id: string;
  tingkat_id: string;
  nama_kelas: string;
  kapasitas_siswa: string;
}

const emptyKelasForm: KelasFormState = {
  tahun_ajaran_id: '',
  tingkat_id: '',
  nama_kelas: '',
  kapasitas_siswa: '',
};

interface KelasPageProps {
  fixedYearId?: string;
  embedded?: boolean;
}

export default function KelasPage({ fixedYearId, embedded = false }: KelasPageProps = {}) {
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  
  const tahunAjaran = useLiveQuery(() => listTahunAjaran(), [], []);
  const [selectedYearId, setSelectedYearId] = useState('');
  const effectiveYearId = fixedYearId || selectedYearId || tahunAjaran.find((item) => item.aktif || item.status === 'aktif')?.id || tahunAjaran[0]?.id || '';
  const selectedYear = tahunAjaran.find((item) => item.id === effectiveYearId) ?? null;
  const selectedYearLocked = (selectedYear?.status ?? (selectedYear?.aktif ? 'aktif' : 'draft')) === 'arsip';

  const tingkat = useLiveQuery(() => listTingkat(effectiveYearId), [effectiveYearId], []);
  const kelas = useLiveQuery(() => listActiveKelas(), [], []);
  
  const filteredKelas = useMemo(
    () => kelas.filter((item) => item.tahun_ajaran_id === effectiveYearId),
    [kelas, effectiveYearId],
  );

  // === State for Tingkat Form ===
  const [isTingkatFormOpen, setIsTingkatFormOpen] = useState(false);
  const [editingTingkatId, setEditingTingkatId] = useState<string | null>(null);
  const [tingkatForm, setTingkatForm] = useState<TingkatFormState>(emptyTingkatForm);
  const [tingkatErrors, setTingkatErrors] = useState<Partial<Record<keyof TingkatFormState, string>>>({});
  
  // === State for Kelas Form ===
  const [isKelasFormOpen, setIsKelasFormOpen] = useState(false);
  const [editingKelasId, setEditingKelasId] = useState<string | null>(null);
  const [kelasForm, setKelasForm] = useState<KelasFormState>(emptyKelasForm);
  const [kelasErrors, setKelasErrors] = useState<Partial<Record<keyof KelasFormState, string>>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [actionId, setActionId] = useState<string | null>(null);

  // === Handlers for Tingkat ===
  function openCreateTingkat() {
    setTingkatForm({ ...emptyTingkatForm, tahun_ajaran_id: effectiveYearId, urutan: String(tingkat.length + 1) });
    setEditingTingkatId(null);
    setTingkatErrors({});
    setIsTingkatFormOpen(true);
  }

  function openEditTingkat(tingkatId: string) {
    const selected = tingkat.find(t => t.id === tingkatId);
    if (!selected) return;
    setTingkatForm({
      tahun_ajaran_id: selected.tahun_ajaran_id,
      nama: selected.nama,
      urutan: String(selected.urutan),
      tarif_spp: String(selected.tarif_spp),
      usia_min_tahun: selected.usia_min_tahun !== null && selected.usia_min_tahun !== undefined ? String(selected.usia_min_tahun) : '',
      usia_max_tahun: selected.usia_max_tahun !== null && selected.usia_max_tahun !== undefined ? String(selected.usia_max_tahun) : '',
    });
    setEditingTingkatId(tingkatId);
    setTingkatErrors({});
    setIsTingkatFormOpen(true);
  }

  function updateTingkatForm<K extends keyof TingkatFormState>(key: K, value: TingkatFormState[K]) {
    setTingkatForm((c) => ({ ...c, [key]: value }));
    setTingkatErrors((c) => ({ ...c, [key]: undefined }));
  }

  async function handleTingkatSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;
    
    const errors: Partial<Record<keyof TingkatFormState, string>> = {};
    if (!tingkatForm.nama.trim()) errors.nama = 'Nama tingkat wajib diisi.';
    if (!tingkatForm.tarif_spp.trim() || Number(tingkatForm.tarif_spp) < 0) errors.tarif_spp = 'Tarif SPP wajib diisi minimal 0.';
    setTingkatErrors(errors);
    if (Object.keys(errors).length > 0) return;

    requestConfirm({
      title: editingTingkatId ? 'Simpan Tingkat?' : 'Tambah Tingkat?',
      description: editingTingkatId ? 'Perubahan tarif dan umur akan diterapkan ke semua kelas di tingkat ini.' : 'Yakin ingin menambah tingkat baru?',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          const payload: SaveTingkatInput = {
            tahun_ajaran_id: tingkatForm.tahun_ajaran_id,
            nama: tingkatForm.nama,
            urutan: Number(tingkatForm.urutan || 1),
            tarif_spp: Number(tingkatForm.tarif_spp),
            usia_min_tahun: tingkatForm.usia_min_tahun ? Number(tingkatForm.usia_min_tahun) : null,
            usia_max_tahun: tingkatForm.usia_max_tahun ? Number(tingkatForm.usia_max_tahun) : null,
          };
          if (editingTingkatId) {
            await updateTingkat(actor, editingTingkatId, payload);
            addToast({ type: 'success', title: 'Berhasil', message: 'Tingkat berhasil diperbarui.' });
          } else {
            await createTingkat(actor, payload);
            addToast({ type: 'success', title: 'Berhasil', message: 'Tingkat berhasil ditambahkan.' });
          }
          setIsTingkatFormOpen(false);
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan tingkat.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  function handleDeleteTingkat(tingkatId: string) {
    if (!actor) return;
    requestConfirm({
      title: 'Hapus Tingkat?',
      description: 'Menghapus tingkat tidak dapat dibatalkan. Pastikan tingkat ini tidak memiliki kelas aktif.',
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
      onConfirm: async () => {
        setActionId(tingkatId);
        try {
          await deleteTingkat(actor, tingkatId);
          addToast({ type: 'success', title: 'Berhasil', message: 'Tingkat dihapus.' });
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menghapus tingkat.' });
        } finally {
          setActionId(null);
        }
      }
    });
  }

  // === Handlers for Kelas ===
  function openCreateKelas(tingkatId: string) {
    setKelasForm({ ...emptyKelasForm, tahun_ajaran_id: effectiveYearId, tingkat_id: tingkatId });
    setEditingKelasId(null);
    setKelasErrors({});
    setIsKelasFormOpen(true);
  }

  function openEditKelas(kelasId: string) {
    const selected = kelas.find(k => k.id === kelasId);
    if (!selected) return;
    setKelasForm({
      tahun_ajaran_id: selected.tahun_ajaran_id,
      tingkat_id: selected.tingkat_id,
      nama_kelas: selected.nama_kelas,
      kapasitas_siswa: selected.kapasitas_siswa ? String(selected.kapasitas_siswa) : '',
    });
    setEditingKelasId(kelasId);
    setKelasErrors({});
    setIsKelasFormOpen(true);
  }

  function updateKelasForm<K extends keyof KelasFormState>(key: K, value: KelasFormState[K]) {
    setKelasForm((c) => ({ ...c, [key]: value }));
    setKelasErrors((c) => ({ ...c, [key]: undefined }));
  }

  async function handleKelasSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor) return;

    const errors: Partial<Record<keyof KelasFormState, string>> = {};
    if (!kelasForm.nama_kelas.trim()) errors.nama_kelas = 'Nama kelas wajib diisi.';
    setKelasErrors(errors);
    if (Object.keys(errors).length > 0) return;

    requestConfirm({
      title: editingKelasId ? 'Simpan Kelas?' : 'Tambah Kelas?',
      description: 'Apakah Anda yakin ingin menyimpan kelas ini?',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          const payload: SaveKelasInput = {
            tahun_ajaran_id: kelasForm.tahun_ajaran_id,
            tingkat_id: kelasForm.tingkat_id,
            nama_kelas: kelasForm.nama_kelas,
            kapasitas_siswa: kelasForm.kapasitas_siswa ? Number(kelasForm.kapasitas_siswa) : null,
          };
          if (editingKelasId) {
            await updateKelas(actor, editingKelasId, payload);
            addToast({ type: 'success', title: 'Berhasil', message: 'Kelas berhasil diperbarui.' });
          } else {
            await createKelas(actor, payload);
            addToast({ type: 'success', title: 'Berhasil', message: 'Kelas berhasil ditambahkan.' });
          }
          setIsKelasFormOpen(false);
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan kelas.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  function handleDeleteKelas(kelasId: string) {
    if (!actor) return;
    requestConfirm({
      title: 'Hapus Kelas?',
      description: 'Kelas yang dihapus tidak akan ditampilkan lagi. Lanjutkan?',
      confirmLabel: 'Ya, Hapus',
      variant: 'danger',
      onConfirm: async () => {
        setActionId(kelasId);
        try {
          await deleteKelas(actor, kelasId);
          addToast({ type: 'success', title: 'Berhasil', message: 'Kelas dihapus.' });
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menghapus kelas.' });
        } finally {
          setActionId(null);
        }
      }
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {!embedded ? <PageHeader
        title="Kelas & Tingkat"
        description="Kelola hierarki tingkat dan kelas, tarif SPP default, dan kapasitas rombel."
      /> : null}

      {selectedYearLocked ? <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">Tahun ajaran arsip dikunci. Data kelas hanya bisa dilihat.</div> : null}

      {!fixedYearId && tahunAjaran.length > 0 ? <div className="max-w-sm">
        <FormField label="Filter tahun ajaran" htmlFor="filter_tahun_ajaran">
          <select
            id="filter_tahun_ajaran"
            value={effectiveYearId}
            onChange={(event) => setSelectedYearId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
          >
            {tahunAjaran.map((item) => (
              <option key={item.id} value={item.id}>{item.nama}{item.aktif ? ' - Aktif' : ''}</option>
            ))}
          </select>
        </FormField>
      </div> : null}

      {/* MODAL FORM TINGKAT */}
      <Modal open={isTingkatFormOpen} onClose={() => setIsTingkatFormOpen(false)} size="md" showClose>
        <div className="p-6">
          <h2 className="mb-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
            {editingTingkatId ? 'Edit Tingkat' : 'Tambah Tingkat'}
          </h2>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            Atur nama tingkat, tarif SPP dasar, dan kriteria usia untuk penempatan.
          </p>
          <form className="space-y-5" onSubmit={handleTingkatSubmit}>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Nama tingkat" htmlFor="t_nama" error={tingkatErrors.nama} hint="Contoh: Kelompok Bermain, TK A, TK B">
                <input id="t_nama" value={tingkatForm.nama} onChange={(e) => updateTingkatForm('nama', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
              </FormField>
              <FormField label="Tarif SPP Tingkat" htmlFor="t_tarif_spp" error={tingkatErrors.tarif_spp} hint="Berlaku untuk semua kelas di tingkat ini.">
                <input id="t_tarif_spp" inputMode="numeric" value={formatNumberInput(tingkatForm.tarif_spp)} onChange={(e) => updateTingkatForm('tarif_spp', parseNumberInput(e.target.value))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Usia minimum (Tahun)" htmlFor="t_usia_min" error={tingkatErrors.usia_min_tahun}>
                <input id="t_usia_min" type="number" min="0" value={tingkatForm.usia_min_tahun} onChange={(e) => updateTingkatForm('usia_min_tahun', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
              </FormField>
              <FormField label="Usia maksimum (Tahun)" htmlFor="t_usia_max" error={tingkatErrors.usia_max_tahun}>
                <input id="t_usia_max" type="number" min="0" value={tingkatForm.usia_max_tahun} onChange={(e) => updateTingkatForm('usia_max_tahun', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
              </FormField>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" onClick={() => setIsTingkatFormOpen(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Batal</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-50">Simpan Tingkat</button>
            </div>
          </form>
        </div>
      </Modal>

      {/* MODAL FORM KELAS */}
      <Modal open={isKelasFormOpen} onClose={() => setIsKelasFormOpen(false)} size="md" showClose>
        <div className="p-6">
          <h2 className="mb-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
            {editingKelasId ? 'Edit Kelas' : 'Tambah Kelas'}
          </h2>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            Tambahkan rombongan belajar baru. Tarif SPP akan mengikuti tingkat induknya.
          </p>
          <form className="space-y-5" onSubmit={handleKelasSubmit}>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Nama kelas / Rombel" htmlFor="k_nama" error={kelasErrors.nama_kelas} hint="Contoh: Mawar, Melati">
                <input id="k_nama" value={kelasForm.nama_kelas} onChange={(e) => updateKelasForm('nama_kelas', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
              </FormField>
              <FormField label="Kapasitas siswa (Opsional)" htmlFor="k_kapasitas" error={kelasErrors.kapasitas_siswa}>
                <input id="k_kapasitas" type="number" min="1" value={kelasForm.kapasitas_siswa} onChange={(e) => updateKelasForm('kapasitas_siswa', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
              </FormField>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button type="button" onClick={() => setIsKelasFormOpen(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Batal</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-50">Simpan Kelas</button>
            </div>
          </form>
        </div>
      </Modal>

      {/* FAB: Floating Action Button */}
      {!selectedYearLocked && tahunAjaran.length > 0 && effectiveYearId ? (
        <button 
          type="button" 
          onClick={openCreateTingkat} 
          title="Tambah Tingkat Baru"
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl shadow-brand-600/40 transition-all duration-300 hover:scale-110 hover:bg-brand-500 hover:shadow-2xl md:bottom-8 md:right-8"
        >
          <Plus className="h-6 w-6" />
        </button>
      ) : null}

      {tahunAjaran.length === 0 ? (
        <EmptyState title="Belum ada tahun ajaran" description="Buat tahun ajaran terlebih dahulu sebelum mengelola tingkat dan kelas." />
      ) : tingkat.length === 0 ? (
        <EmptyState 
          title="Belum ada tingkat" 
          description="Tambahkan tingkat (misal TK A, TK B) terlebih dahulu untuk mengatur tarif SPP." 
          action={!selectedYearLocked && <button type="button" onClick={openCreateTingkat} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-500"><Plus className="h-4 w-4" /> Tambah Tingkat</button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
          {tingkat.map((t) => {
            const childKelas = filteredKelas.filter(k => k.tingkat_id === t.id);
            return (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                {/* Header Tingkat */}
                <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{t.nama}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Tarif: {formatRupiah(t.tarif_spp)}</span>
                      {(t.usia_min_tahun !== null || t.usia_max_tahun !== null) && (
                        <span className="flex items-center gap-1"><Settings2 className="h-3.5 w-3.5" /> Usia: {t.usia_min_tahun ?? 0} - {t.usia_max_tahun ?? '~'} tahun</span>
                      )}
                    </div>
                  </div>
                  {!selectedYearLocked && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => openEditTingkat(t.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"><FileEdit className="h-3.5 w-3.5" /> Edit</button>
                      <button type="button" onClick={() => handleDeleteTingkat(t.id)} disabled={actionId === t.id || childKelas.length > 0} className="inline-flex items-center gap-1.5 rounded-lg border border-danger-200 bg-white px-3 py-2 text-xs font-bold text-danger-600 transition hover:bg-danger-50 disabled:opacity-50 dark:border-danger-900/50 dark:bg-slate-900 dark:text-danger-400"><Trash2 className="h-3.5 w-3.5" /> Hapus</button>
                    </div>
                  )}
                </div>

                {/* Daftar Kelas di Bawah Tingkat */}
                <div className="p-4">
                  {childKelas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center dark:border-slate-800 dark:bg-slate-900/20">
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Belum ada kelas di tingkat ini.</p>
                      {!selectedYearLocked && <button type="button" onClick={() => openCreateKelas(t.id)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-100 px-4 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-200 dark:bg-brand-900/30 dark:text-brand-400"><Plus className="h-3.5 w-3.5" /> Tambah Kelas</button>}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {childKelas.map((k) => (
                        <div key={k.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-brand-200 hover:bg-brand-50/30 dark:border-slate-800 dark:hover:border-brand-900/30 dark:hover:bg-brand-900/10 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-brand-50 p-2 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400"><Layers className="h-4 w-4" /></div>
                            <div>
                              <p className="font-bold text-slate-800 dark:text-slate-200">Kelas {k.nama_kelas}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                <span className="font-semibold">{(k as any).activeStudentCount ?? 0} Siswa Aktif</span>
                                {k.kapasitas_siswa && <span>/ Kapasitas: {k.kapasitas_siswa}</span>}
                              </div>
                            </div>
                          </div>
                          {!selectedYearLocked && (
                            <div className="flex shrink-0 items-center gap-2">
                              <button type="button" onClick={() => openEditKelas(k.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-brand-600 dark:border-slate-700 dark:hover:bg-slate-800"><Pencil className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => handleDeleteKelas(k.id)} disabled={actionId === k.id} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-danger-50 hover:text-danger-600 dark:border-slate-700 dark:hover:bg-slate-800"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                        </div>
                      ))}
                      {!selectedYearLocked && (
                        <div className="mt-4 flex">
                          <button type="button" onClick={() => openCreateKelas(t.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"><Plus className="h-3 w-3" /> Tambah Kelas di {t.nama}</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
