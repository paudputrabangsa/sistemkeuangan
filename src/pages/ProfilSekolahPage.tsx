import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import FormField from '../components/ui/FormField';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { db } from '../db';
import { getCurrentActor } from '../lib/actor';
import { ServiceError } from '../services/service-errors';
import { updateProfilSekolah } from '../services/pengaturanService';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

export default function ProfilSekolahPage() {
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const profil = useLiveQuery(() => db.profil_sekolah.get('00000000-0000-0000-0000-000000000001'), [], null);
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan. Silakan login ulang.' });
      return;
    }

    const formData = new FormData(event.currentTarget);
    const payload = {
      nama_sekolah: String(formData.get('nama_sekolah') ?? '').trim(),
      nama_yayasan: String(formData.get('nama_yayasan') ?? '').trim(),
      bentuk_satuan: String(formData.get('bentuk_satuan') ?? '').trim(),
      izin_operasional: String(formData.get('izin_operasional') ?? '').trim(),
      npsn: String(formData.get('npsn') ?? '').trim(),
      telepon: String(formData.get('telepon') ?? '').trim(),
      website: String(formData.get('website') ?? '').trim(),
      tahun_berdiri: String(formData.get('tahun_berdiri') ?? '').trim(),
      alamat_jalan: String(formData.get('alamat_jalan') ?? '').trim(),
      alamat_rt: String(formData.get('alamat_rt') ?? '').trim(),
      alamat_rw: String(formData.get('alamat_rw') ?? '').trim(),
      alamat_desa: String(formData.get('alamat_desa') ?? '').trim(),
      alamat_kecamatan: String(formData.get('alamat_kecamatan') ?? '').trim(),
      alamat_kabupaten: String(formData.get('alamat_kabupaten') ?? '').trim(),
      alamat_provinsi: String(formData.get('alamat_provinsi') ?? '').trim(),
      alamat_kode_pos: String(formData.get('alamat_kode_pos') ?? '').trim(),
      nama_kepsek: String(formData.get('nama_kepsek') ?? '').trim(),
      logo_url: String(formData.get('logo_url') ?? '').trim(),
      tanda_tangan_url: String(formData.get('tanda_tangan_url') ?? '').trim(),
    };

    const nextErrors: Record<string, string> = {};
    if (!payload.nama_sekolah) nextErrors.nama_sekolah = 'Nama sekolah wajib diisi.';
    if (!payload.bentuk_satuan) nextErrors.bentuk_satuan = 'Bentuk satuan wajib diisi.';
    if (!payload.nama_kepsek) nextErrors.nama_kepsek = 'Nama kepala/pengelola wajib diisi.';
    if (!payload.alamat_jalan) nextErrors.alamat_jalan = 'Alamat jalan wajib diisi.';
    if (!payload.alamat_desa) nextErrors.alamat_desa = 'Desa/Kelurahan wajib diisi.';
    if (!payload.alamat_kecamatan) nextErrors.alamat_kecamatan = 'Kecamatan wajib diisi.';
    if (!payload.alamat_kabupaten) nextErrors.alamat_kabupaten = 'Kabupaten/Kota wajib diisi.';
    if (!payload.alamat_provinsi) nextErrors.alamat_provinsi = 'Provinsi wajib diisi.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstErrorId = Object.keys(nextErrors)[0];
      document.getElementById(firstErrorId)?.focus();
      return;
    }

    requestConfirm({
      title: 'Simpan Profil Sekolah?',
      description: 'Apakah Anda yakin ingin menyimpan perubahan profil sekolah ini?',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          await updateProfilSekolah(actor, payload);
          addToast({ type: 'success', title: 'Berhasil', message: 'Profil sekolah berhasil diperbarui.' });
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan profil sekolah.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Profil Sekolah" description="Perbarui identitas sekolah yang dipakai di header aplikasi, kuitansi, dan laporan." />
      <SectionCard title="Identitas sekolah" description="Upload aset belum diaktifkan, jadi field logo dan tanda tangan masih berupa URL manual lokal atau remote.">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Nama lembaga" htmlFor="nama_sekolah" error={errors.nama_sekolah}><input id="nama_sekolah" name="nama_sekolah" defaultValue={profil?.nama_sekolah ?? ''} onChange={() => setErrors((e) => ({ ...e, nama_sekolah: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
            <FormField label="Penyelenggara/Yayasan (Opsional)" htmlFor="nama_yayasan" error={errors.nama_yayasan}><input id="nama_yayasan" name="nama_yayasan" defaultValue={profil?.nama_yayasan ?? ''} onChange={() => setErrors((e) => ({ ...e, nama_yayasan: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>

            <FormField label="Bentuk satuan" htmlFor="bentuk_satuan" error={errors.bentuk_satuan}>
              <input id="bentuk_satuan" name="bentuk_satuan" list="bentuk_satuan_list" defaultValue={profil?.bentuk_satuan ?? ''} onChange={() => setErrors((e) => ({ ...e, bentuk_satuan: '' }))} placeholder="Pilih atau ketik (KB / TK / TPA / SPS)" className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
              <datalist id="bentuk_satuan_list">
                <option value="KB" />
                <option value="TK" />
                <option value="KB-TK" />
                <option value="TPA" />
                <option value="SPS" />
              </datalist>
            </FormField>
            <FormField label="Tahun Berdiri (Opsional)" htmlFor="tahun_berdiri" error={errors.tahun_berdiri}><input id="tahun_berdiri" name="tahun_berdiri" defaultValue={profil?.tahun_berdiri ?? ''} onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, ''); setErrors((e2) => ({ ...e2, tahun_berdiri: '' })); }} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>

            <FormField label="Izin Operasional (Opsional)" htmlFor="izin_operasional" error={errors.izin_operasional}><input id="izin_operasional" name="izin_operasional" defaultValue={profil?.izin_operasional ?? ''} onChange={() => setErrors((e) => ({ ...e, izin_operasional: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
            <FormField label="NPSN (Jika ada)" htmlFor="npsn" error={errors.npsn}><input id="npsn" name="npsn" defaultValue={profil?.npsn ?? ''} onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, ''); setErrors((e2) => ({ ...e2, npsn: '' })); }} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>

            <FormField label="Telepon (Opsional)" htmlFor="telepon" error={errors.telepon}><input id="telepon" name="telepon" defaultValue={profil?.telepon ?? ''} onChange={() => setErrors((e) => ({ ...e, telepon: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
            <FormField label="Website (Opsional)" htmlFor="website" error={errors.website}><input id="website" name="website" defaultValue={profil?.website ?? ''} onChange={() => setErrors((e) => ({ ...e, website: '' }))} placeholder="contoh: paudmelati.sch.id" className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>

            <div className="md:col-span-2">
              <FormField label="Kepala / Pengelola" htmlFor="nama_kepsek" error={errors.nama_kepsek}><input id="nama_kepsek" name="nama_kepsek" defaultValue={profil?.nama_kepsek ?? ''} onChange={() => setErrors((e) => ({ ...e, nama_kepsek: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
            <h3 className="mb-4 text-sm font-extrabold text-slate-800 dark:text-slate-200">Alamat Lengkap</h3>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <FormField label="Jalan / Gang / Nomor Rumah" htmlFor="alamat_jalan" error={errors.alamat_jalan}><input id="alamat_jalan" name="alamat_jalan" defaultValue={profil?.alamat_jalan ?? ''} onChange={() => setErrors((e) => ({ ...e, alamat_jalan: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <FormField label="RT (Opsional)" htmlFor="alamat_rt" error={errors.alamat_rt}><input id="alamat_rt" name="alamat_rt" defaultValue={profil?.alamat_rt ?? ''} onChange={() => setErrors((e) => ({ ...e, alamat_rt: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
                <FormField label="RW (Opsional)" htmlFor="alamat_rw" error={errors.alamat_rw}><input id="alamat_rw" name="alamat_rw" defaultValue={profil?.alamat_rw ?? ''} onChange={() => setErrors((e) => ({ ...e, alamat_rw: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
              </div>
              <FormField label="Desa / Kelurahan" htmlFor="alamat_desa" error={errors.alamat_desa}><input id="alamat_desa" name="alamat_desa" defaultValue={profil?.alamat_desa ?? ''} onChange={() => setErrors((e) => ({ ...e, alamat_desa: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
              <FormField label="Kecamatan" htmlFor="alamat_kecamatan" error={errors.alamat_kecamatan}><input id="alamat_kecamatan" name="alamat_kecamatan" defaultValue={profil?.alamat_kecamatan ?? ''} onChange={() => setErrors((e) => ({ ...e, alamat_kecamatan: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
              <FormField label="Kabupaten / Kota" htmlFor="alamat_kabupaten" error={errors.alamat_kabupaten}><input id="alamat_kabupaten" name="alamat_kabupaten" defaultValue={profil?.alamat_kabupaten ?? ''} onChange={() => setErrors((e) => ({ ...e, alamat_kabupaten: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
              <FormField label="Provinsi" htmlFor="alamat_provinsi" error={errors.alamat_provinsi}><input id="alamat_provinsi" name="alamat_provinsi" defaultValue={profil?.alamat_provinsi ?? ''} onChange={() => setErrors((e) => ({ ...e, alamat_provinsi: '' }))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
              <FormField label="Kode Pos (Opsional)" htmlFor="alamat_kode_pos" error={errors.alamat_kode_pos}><input id="alamat_kode_pos" name="alamat_kode_pos" defaultValue={profil?.alamat_kode_pos ?? ''} onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, ''); setErrors((e2) => ({ ...e2, alamat_kode_pos: '' })); }} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
            </div>
          </div>
          <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="URL logo" htmlFor="logo_url" hint="Sementara gunakan URL manual sampai upload file diaktifkan."><input id="logo_url" name="logo_url" defaultValue={profil?.logo_url ?? ''} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
              <FormField label="URL tanda tangan" htmlFor="tanda_tangan_url"><input id="tanda_tangan_url" name="tanda_tangan_url" defaultValue={profil?.tanda_tangan_url ?? ''} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
            </div>
          </div>
          <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Menyimpan...' : 'Simpan'}</button>
        </form>
      </SectionCard>
    </div>
  );
}
