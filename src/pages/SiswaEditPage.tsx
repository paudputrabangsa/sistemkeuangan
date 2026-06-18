import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Save } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { getCurrentActor } from '../lib/actor';
import { getSiswaDetail } from '../queries/siswaQueries';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { ServiceError } from '../services/service-errors';
import { updateSiswa, type UpdateSiswaInput } from '../services/siswaService';
import { todayDate } from '../services/service-helpers';
import type { DiskonItem } from '../db/types';
import { db } from '../db';
import { getPromoNilaiDisplay } from '../lib/promoHelper';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

interface FormState {
  nama: string;
  nis: string;
  tanggal_lahir: string;
  jenis_kelamin: '' | 'L' | 'P';
  nama_wali: string;
  hubungan_wali: '' | 'ayah' | 'ibu' | 'wali';
  kontak_wali: string;
  email_wali: string;
  alamat: string;
  daftar_promo: string[];
  flag_diskon_spp: boolean;
  nominal_diskon_spp: string;
}


type FormErrors = Partial<Record<keyof FormState, string>>;

const initialForm: FormState = {
  nama: '',
  nis: '',
  tanggal_lahir: '',
  jenis_kelamin: '',
  nama_wali: '',
  hubungan_wali: '',
  kontak_wali: '',
  email_wali: '',
  alamat: '',
  daftar_promo: [],
  flag_diskon_spp: false,
  nominal_diskon_spp: '',
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function SiswaEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const detail = useLiveQuery(async () => {
    if (!id) {
      return null;
    }

    return getSiswaDetail(id);
  }, [id], null);

  const diskonItems = useLiveQuery(() => getPengaturanByKunci<DiskonItem[]>('diskon'), [], [] as DiskonItem[]);

  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const promoUsages = useLiveQuery(async () => {
    const usages: Record<string, number> = {};
    const semuaSiswa = await db.siswa.toArray();
    for (const siswa of semuaSiswa) {
      if (Array.isArray(siswa.daftar_promo)) {
        for (const promoId of siswa.daftar_promo) {
          usages[promoId] = (usages[promoId] || 0) + 1;
        }
      }
    }
    return usages;
  }, [], {} as Record<string, number>);

  const promos = useMemo(() => {
    return (diskonItems || []).filter((d) => {
      // Jika siswa sudah memiliki promo ini, selalu tampilkan agar bisa dimatikan
      if (form.daftar_promo.includes(d.id)) return true;

      // Jika belum memiliki, cek status aktif dan masa klaim
      if (!d.aktif) return false;
      const tDate = todayDate();
      if (d.klaim_mulai && tDate < d.klaim_mulai) return false;
      if (d.klaim_selesai && tDate > d.klaim_selesai) return false;

      // Cek kuota
      if (d.kuota) {
        const usage = promoUsages[d.id] || 0;
        if (usage >= Number(d.kuota)) return false;
      }
      return true;
    });
  }, [diskonItems, form.daftar_promo, promoUsages]);

  useEffect(() => {
    if (!detail?.siswa) {
      return;
    }

    setForm({
      nama: detail.siswa.nama,
      nis: detail.siswa.nis ?? '',
      tanggal_lahir: detail.siswa.tanggal_lahir ?? '',
      jenis_kelamin: detail.siswa.jenis_kelamin ?? '',
      nama_wali: detail.siswa.nama_wali,
      hubungan_wali: detail.siswa.hubungan_wali ?? '',
      kontak_wali: detail.siswa.kontak_wali,
      email_wali: detail.siswa.email_wali ?? '',
      alamat: detail.siswa.alamat ?? '',
      daftar_promo: detail.siswa.daftar_promo ?? [],
      flag_diskon_spp: detail.siswa.flag_diskon_spp ?? false,
      nominal_diskon_spp: detail.siswa.nominal_diskon_spp?.toString() || '',
    });
  }, [detail?.siswa]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validateForm(values: FormState) {
    const nextErrors: FormErrors = {};

    if (!values.nama.trim() || values.nama.trim().length < 2) {
      nextErrors.nama = 'Nama siswa minimal 2 karakter.';
    }

    if (values.tanggal_lahir && values.tanggal_lahir > todayDate()) {
      nextErrors.tanggal_lahir = 'Tanggal lahir tidak boleh di masa depan.';
    }

    if (!values.nama_wali.trim() || values.nama_wali.trim().length < 2) {
      nextErrors.nama_wali = 'Nama wali minimal 2 karakter.';
    }

    if (!/^\d{10,}$/.test(values.kontak_wali.trim())) {
      nextErrors.kontak_wali = 'Nomor HP minimal 10 digit dan hanya angka.';
    }

    if (values.email_wali && !isValidEmail(values.email_wali.trim())) {
      nextErrors.email_wali = 'Format email wali tidak valid.';
    }

    return nextErrors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!id || !actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Data sesi atau ID siswa tidak ditemukan.' });
      return;
    }

    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    requestConfirm({
      title: 'Simpan Perubahan?',
      description: 'Apakah Anda yakin ingin menyimpan perubahan data siswa ini?',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        const payload: UpdateSiswaInput = {
          nama: form.nama.trim(),
          nis: form.nis.trim() || null,
          tanggal_lahir: form.tanggal_lahir || null,
          jenis_kelamin: form.jenis_kelamin || null,
          nama_wali: form.nama_wali.trim(),
          hubungan_wali: form.hubungan_wali || null,
          kontak_wali: form.kontak_wali.trim(),
          email_wali: form.email_wali.trim() || null,
          alamat: form.alamat.trim() || null,
          daftar_promo: form.daftar_promo,
        };

        setIsSubmitting(true);

        try {
          await updateSiswa(actor, id, payload);
          addToast({ type: 'success', title: 'Berhasil', message: 'Perubahan siswa berhasil disimpan.' });
          navigate(`/siswa/${id}`);
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan perubahan siswa.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  if (!id) {
    return (
      <EmptyState
        title="ID siswa tidak ditemukan"
        description="Route edit siswa membutuhkan parameter ID yang valid."
        action={
          <button
            type="button"
            onClick={() => navigate('/siswa')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Siswa
          </button>
        }
      />
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Edit Siswa" description="Memuat data siswa dari IndexedDB..." />
        <SectionCard>
          <div className="space-y-3">
            <div className="h-6 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-36 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900/60" />
          </div>
        </SectionCard>
      </div>
    );
  }

  if (!detail.siswa) {
    return (
      <EmptyState
        title="Siswa tidak ditemukan"
        description="Data siswa yang ingin diedit tidak tersedia di penyimpanan lokal."
        action={
          <button
            type="button"
            onClick={() => navigate('/siswa')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Siswa
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Edit Siswa"
        description="Perbarui profil siswa dan data wali. Data pendaftaran tidak dapat diubah dari halaman ini."
        actions={
          <button
            type="button"
            onClick={() => navigate(`/siswa/${id}`)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Detail
          </button>
        }
      />

      <form className="space-y-6" onSubmit={handleSubmit}>
        <SectionCard title="Profil siswa" description="Perbarui identitas siswa dan data wali utama yang digunakan sistem.">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Nama lengkap" htmlFor="nama" error={errors.nama}>
              <input
                id="nama"
                value={form.nama}
                onChange={(event) => updateField('nama', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </FormField>

            <FormField label="Nomor Induk Siswa (Opsional)" htmlFor="nis" error={errors.nis}>
              <input
                id="nis"
                value={form.nis}
                onChange={(event) => updateField('nis', event.target.value)}
                placeholder="Misal: 2526001"
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </FormField>

            <FormField label="Tanggal lahir" htmlFor="tanggal_lahir" error={errors.tanggal_lahir}>
              <input
                id="tanggal_lahir"
                type="date"
                value={form.tanggal_lahir}
                onChange={(event) => updateField('tanggal_lahir', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </FormField>
          </div>

          <div className="mt-5">
            <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Jenis kelamin</p>
            <div className="flex flex-wrap gap-3">
              {[
                { value: 'L', label: 'Laki-laki' },
                { value: 'P', label: 'Perempuan' },
              ].map((option) => {
                const active = form.jenis_kelamin === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateField('jenis_kelamin', option.value as FormState['jenis_kelamin'])}
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition ${active
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-600/10'
                        : 'border border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Nama wali" htmlFor="nama_wali" error={errors.nama_wali}>
              <input
                id="nama_wali"
                value={form.nama_wali}
                onChange={(event) => updateField('nama_wali', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </FormField>

            <FormField label="Hubungan dengan siswa" htmlFor="hubungan_wali">
              <select
                id="hubungan_wali"
                value={form.hubungan_wali}
                onChange={(event) => updateField('hubungan_wali', event.target.value as FormState['hubungan_wali'])}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              >
                <option value="">Pilih hubungan</option>
                <option value="ayah">Ayah</option>
                <option value="ibu">Ibu</option>
                <option value="wali">Wali</option>
              </select>
            </FormField>

            <FormField label="Nomor HP / WhatsApp" htmlFor="kontak_wali" error={errors.kontak_wali}>
              <input
                id="kontak_wali"
                value={form.kontak_wali}
                onChange={(event) => updateField('kontak_wali', event.target.value.replace(/[^\d]/g, ''))}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </FormField>

            <FormField label="Email wali" htmlFor="email_wali" error={errors.email_wali}>
              <input
                id="email_wali"
                type="email"
                value={form.email_wali}
                onChange={(event) => updateField('email_wali', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </FormField>
          </div>

          <div className="mt-5">
            <FormField label="Alamat" htmlFor="alamat">
              <textarea
                id="alamat"
                rows={4}
                value={form.alamat}
                onChange={(event) => updateField('alamat', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="Pengaturan Diskon & Tarif Khusus" description="Tentukan tarif SPP khusus atau centang promo yang didapatkan oleh siswa ini.">
          <div className="rounded-xl border border-slate-200 p-4 mb-6 dark:border-slate-800">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={form.flag_diskon_spp} onChange={e => updateField('flag_diskon_spp', e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Gunakan Tarif SPP Khusus Siswa Ini</span>
            </label>
            {form.flag_diskon_spp && (
              <div className="mt-4 animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="md:col-span-1">
                  <div className="space-y-1">
                    <label htmlFor="nominal_diskon_spp" className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nominal Tarif SPP</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Siswa akan ditagih sejumlah ini setiap bulan, mengabaikan tarif kelas.</p>
                  </div>
                  <input id="nominal_diskon_spp" inputMode="numeric" value={form.nominal_diskon_spp.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} onChange={e => updateField('nominal_diskon_spp', e.target.value.replace(/\D/g, ''))} placeholder="Contoh: 150000" className="mt-2 w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
                </div>
              </div>
            )}
          </div>

          <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Promo Aktif</p>
          {promos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-800">
              <p className="text-sm text-slate-500">Tidak ada promo yang tersedia atau sedang dalam masa penawaran.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {promos.map((promo) => {
                const isSelected = form.daftar_promo.includes(promo.id);
                return (
                  <label
                    key={promo.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${isSelected
                        ? 'border-brand-500 bg-brand-50/50 dark:border-brand-500/50 dark:bg-brand-500/10'
                        : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700'
                      }`}
                  >
                    <div className="flex h-5 items-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const newPromo = e.target.checked
                            ? [...form.daftar_promo, promo.id]
                            : form.daftar_promo.filter((id) => id !== promo.id);
                          updateField('daftar_promo', newPromo);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${isSelected ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'}`}>
                        {promo.nama}
                        {!promo.aktif && <span className="ml-2 rounded bg-danger-100 px-2 py-0.5 text-[10px] text-danger-700">Nonaktif</span>}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Potongan: {getPromoNilaiDisplay(promo)}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Data pendaftaran" description="Informasi di bawah ini ditampilkan untuk referensi saja dan tidak bisa diubah dari halaman edit profil.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ReadOnlyInfo label="Tanggal daftar" value={detail.siswa.tanggal_daftar} />
            <ReadOnlyInfo label="Jenis masuk" value={detail.siswa.jenis_masuk === 'awal_tahun' ? 'Awal Tahun' : 'Pindahan'} />
            <ReadOnlyInfo label="Status siswa" value={detail.siswa.status} />
            <ReadOnlyInfo label="No. Pendaftaran" value={detail.siswa.no_pendaftaran || '-'} />
            <ReadOnlyInfo label="NIS" value={detail.siswa.nis || '-'} />
          </div>
        </SectionCard>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/siswa/${id}`)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}

function ReadOnlyInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{value || '-'}</p>
    </div>
  );
}
