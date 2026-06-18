import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Save, Info } from 'lucide-react';
import FormField from '../components/ui/FormField';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { getCurrentActor } from '../lib/actor';
import { formatNumberInput, formatRupiah, parseNumberInput, formatKelasLabel } from '../lib/format';
import { listActiveKelas } from '../queries/kelasQueries';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import {
  getSiswaAutoPlacementPreview,
  registerSiswa,
  type RegisterSiswaInput,
  type KomponenTagihanInput,
} from '../services/siswaService';
import { ServiceError } from '../services/service-errors';
import { calculateAgeInYears, getTahunAjaranCutoffDate, todayDate } from '../services/service-helpers';
import { getPengaturanPendaftaranOrDefault, resolveJatuhTempoPendaftaran } from '../services/pendaftaranTahunAjaranService';
import { getPengaturanNilaiByKunci } from '../services/pengaturanRepository';
import { getPromoValue } from '../lib/promoHelper';
import type { DiskonItem } from '../db/types';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

interface PenempatanSiswaBaruSetting {
  aktifkan_penempatan_otomatis: boolean;
  cutoff_bulan: number;
  cutoff_tanggal: number;
  keterangan: string;
}

type TipeSiswa = 'calon' | 'aktif';
type JenisMasukAktif = 'awal_tahun' | 'pindahan';

interface FormState {
  tipe_siswa: TipeSiswa;
  jenis_masuk_aktif: JenisMasukAktif;
  nama: string;
  tanggal_lahir: string;
  jenis_kelamin: '' | 'L' | 'P';
  nama_wali: string;
  hubungan_wali: '' | 'ayah' | 'ibu' | 'wali';
  kontak_wali: string;
  email_wali: string;
  alamat: string;
  nis: string;
  tahun_ajaran_target_id: string;
  tanggal_daftar: string;
  jatuh_tempo_pendaftaran: string;
  kelas_tujuan_id: string;
  opsi_bayar_tagihan_awal: 'full' | 'cicil';

  // Promo and Diskon
  daftar_promo: string[];
  flag_diskon_spp: boolean;
  tipe_diskon_spp: 'persen' | 'nominal';
  persen_diskon: string;
  nominal_diskon_spp: string;

  // Registration components overrides
  komponen_checked: Record<string, boolean>;
  komponen_diskon: Record<string, string>;
  promo_komponen_target: Record<string, string>;
}

const initialForm: FormState = {
  tipe_siswa: 'calon',
  jenis_masuk_aktif: 'awal_tahun',
  nama: '',
  tanggal_lahir: '',
  jenis_kelamin: '',
  nama_wali: '',
  hubungan_wali: '',
  kontak_wali: '',
  email_wali: '',
  alamat: '',
  nis: '',
  tahun_ajaran_target_id: '',
  tanggal_daftar: todayDate(),
  jatuh_tempo_pendaftaran: todayDate(),
  kelas_tujuan_id: '',
  opsi_bayar_tagihan_awal: 'full',
  daftar_promo: [],
  flag_diskon_spp: false,
  tipe_diskon_spp: 'persen',
  persen_diskon: '',
  nominal_diskon_spp: '',
  komponen_checked: {},
  komponen_diskon: {},
  promo_komponen_target: {},
};

type FormErrors = Partial<Record<keyof FormState, string>>;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function calculateAgeParts(tanggalLahir: string, cutoffDate: Date) {
  const birthDate = new Date(`${tanggalLahir}T00:00:00`);
  let years = cutoffDate.getFullYear() - birthDate.getFullYear();
  let months = cutoffDate.getMonth() - birthDate.getMonth();
  const days = cutoffDate.getDate() - birthDate.getDate();
  if (days < 0) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years: Math.max(0, years), months: Math.max(0, months) };
}

export default function SiswaCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlMode = searchParams.get('mode');

  const initialTipeSiswa: TipeSiswa = urlMode === 'aktif' ? 'aktif' : 'calon';
  const initialJenisMasuk: JenisMasukAktif = 'awal_tahun';

  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const [form, setForm] = useState<FormState>({ ...initialForm, tipe_siswa: initialTipeSiswa, jenis_masuk_aktif: initialJenisMasuk });
  const [errors, setErrors] = useState<FormErrors>({});
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [kelasDiubahManual, setKelasDiubahManual] = useState(false);

  const years = useLiveQuery(() => listTahunAjaran(), [], []);
  const activeClasses = useLiveQuery(() => listActiveKelas(), [], []);
  const placementSetting = useLiveQuery(() => getPengaturanByKunci<PenempatanSiswaBaruSetting>('penempatan_siswa_baru'), [], null);
  const promos = useLiveQuery(() => getPengaturanNilaiByKunci<DiskonItem[]>('diskon'), [], []);
  const promoUsages = useLiveQuery(async () => {
    const { db } = await import('../db');
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

  const activePromos = useMemo(() => {
    if (!Array.isArray(promos)) return [];
    return promos.filter(p => {
      if (!p.aktif) return false;
      const targetDate = form.tanggal_daftar || todayDate();
      if (p.klaim_mulai && targetDate < p.klaim_mulai) return false;
      if (p.klaim_selesai && targetDate > p.klaim_selesai) return false;

      if (p.kuota) {
        const usage = promoUsages[p.id] || 0;
        if (usage >= Number(p.kuota)) return false;
      }

      return true;
    });
  }, [promos, form.tanggal_daftar, promoUsages]);

  const [lastAppliedPendaftaranTargetId, setLastAppliedPendaftaranTargetId] = useState('');
  const [lastAppliedJenisMasuk, setLastAppliedJenisMasuk] = useState<JenisMasukAktif>('awal_tahun');

  const activeYear = years.find((item) => item.aktif || item.status === 'aktif') ?? null;
  const calonTargetYears = useMemo(() => years.filter((item) => {
    const status = item.status ?? (item.aktif ? 'aktif' : 'draft');
    return status === 'draft';
  }), [years]);

  const effectiveTargetYearId = useMemo(() => {
    if (form.tipe_siswa === 'aktif') {
      return activeYear?.id || '';
    }
    return form.tahun_ajaran_target_id;
  }, [activeYear?.id, form.tipe_siswa, form.tahun_ajaran_target_id]);

  const pendaftaranSetting = useLiveQuery(
    () => effectiveTargetYearId ? getPengaturanPendaftaranOrDefault(effectiveTargetYearId) : Promise.resolve(null),
    [effectiveTargetYearId],
    null,
  );

  const selectedTargetYear = years.find((item) => item.id === effectiveTargetYearId) ?? null;
  const kelasTargetOptions = useMemo(
    () => activeClasses.filter((kelas) => kelas.tahun_ajaran_id === effectiveTargetYearId),
    [activeClasses, effectiveTargetYearId],
  );

  const cutoffDate = useMemo(() => {
    if (!selectedTargetYear) return null;
    return getTahunAjaranCutoffDate(selectedTargetYear, pendaftaranSetting?.cutoff_bulan ?? placementSetting?.cutoff_bulan ?? 7, pendaftaranSetting?.cutoff_tanggal ?? placementSetting?.cutoff_tanggal ?? 1);
  }, [pendaftaranSetting?.cutoff_bulan, pendaftaranSetting?.cutoff_tanggal, placementSetting?.cutoff_bulan, placementSetting?.cutoff_tanggal, selectedTargetYear]);

  const ageAtCutoff = useMemo(() => {
    if (!form.tanggal_lahir || !cutoffDate) return null;
    return calculateAgeInYears(form.tanggal_lahir, cutoffDate);
  }, [cutoffDate, form.tanggal_lahir]);
  const ageAtCutoffParts = useMemo(() => {
    if (!form.tanggal_lahir || !cutoffDate) return null;
    return calculateAgeParts(form.tanggal_lahir, cutoffDate);
  }, [cutoffDate, form.tanggal_lahir]);

  const shouldValidateAge = form.tipe_siswa === 'calon' || form.jenis_masuk_aktif === 'awal_tahun' || form.jenis_masuk_aktif === 'pindahan';
  const ageTooYoung = shouldValidateAge && ageAtCutoff !== null && ageAtCutoff < 2;
  const ageTooOld = shouldValidateAge && ageAtCutoff !== null && ageAtCutoff >= 7;
  const ageValid = !ageTooYoung && !ageTooOld;

  const autoPlacementPreview = useLiveQuery(
    () => getSiswaAutoPlacementPreview(shouldValidateAge ? form.tanggal_lahir || null : null, effectiveTargetYearId || null),
    [shouldValidateAge, form.tanggal_lahir, effectiveTargetYearId],
    null,
  );

  useEffect(() => {
    if (!shouldValidateAge || !autoPlacementPreview || kelasDiubahManual) return;
    setForm((current) => current.kelas_tujuan_id === autoPlacementPreview.id ? current : { ...current, kelas_tujuan_id: autoPlacementPreview.id });
  }, [autoPlacementPreview, shouldValidateAge, kelasDiubahManual]);

  useEffect(() => {
    if (!effectiveTargetYearId || !pendaftaranSetting) return;

    setForm((current) => {
      const targetChanged = lastAppliedPendaftaranTargetId !== effectiveTargetYearId;
      const jenisChanged = lastAppliedJenisMasuk !== current.jenis_masuk_aktif;
      const needsReset = targetChanged || jenisChanged;
      const nextJatuhTempo = resolveJatuhTempoPendaftaran(pendaftaranSetting, current.tanggal_daftar);

      let nextChecked = { ...current.komponen_checked };
      if (needsReset) {
        nextChecked = {};
        const isMigrasiMode = current.tipe_siswa === 'aktif' && current.jenis_masuk_aktif === 'awal_tahun';
        if (!isMigrasiMode) {
          pendaftaranSetting.komponen_biaya.forEach(kom => {
            nextChecked[kom.id] = kom.wajib;
          });
        }
      }

      return {
        ...current,
        komponen_checked: nextChecked,
        opsi_bayar_tagihan_awal: targetChanged ? pendaftaranSetting.opsi_bayar_default : current.opsi_bayar_tagihan_awal,
        jatuh_tempo_pendaftaran: targetChanged || !current.jatuh_tempo_pendaftaran || pendaftaranSetting.jatuh_tempo_mode === 'hari_setelah_daftar' ? nextJatuhTempo : current.jatuh_tempo_pendaftaran,
      };
    });
    setLastAppliedPendaftaranTargetId(effectiveTargetYearId);
    setLastAppliedJenisMasuk(form.jenis_masuk_aktif);
  }, [effectiveTargetYearId, form.tanggal_daftar, lastAppliedPendaftaranTargetId, pendaftaranSetting, form.jenis_masuk_aktif]);

  // Reset jenis_masuk_aktif to awal_tahun if no active TA
  useEffect(() => {
    if (!activeYear && form.jenis_masuk_aktif === 'pindahan') {
      updateField('jenis_masuk_aktif', 'awal_tahun');
    }
  }, [activeYear?.id]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (key === 'tipe_siswa' || key === 'jenis_masuk_aktif' || key === 'tahun_ajaran_target_id' || key === 'tanggal_lahir') {
      setKelasDiubahManual(false);
    }
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'tipe_siswa' && value === 'calon') {
        next.tahun_ajaran_target_id = '';
        next.kelas_tujuan_id = '';
      }
      if (key === 'tipe_siswa' && value === 'aktif') {
        next.tahun_ajaran_target_id = activeYear?.id ?? '';
        next.kelas_tujuan_id = '';
      }
      if (key === 'tahun_ajaran_target_id' || key === 'tanggal_lahir') {
        next.kelas_tujuan_id = '';
      }
      return next;
    });
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function togglePromo(promoId: string) {
    setForm(curr => {
      const exists = curr.daftar_promo.includes(promoId);
      const nextPromoTarget = { ...curr.promo_komponen_target };
      if (exists) {
        delete nextPromoTarget[promoId];
      }
      return {
        ...curr,
        daftar_promo: exists ? curr.daftar_promo.filter(id => id !== promoId) : [...curr.daftar_promo, promoId],
        promo_komponen_target: nextPromoTarget
      };
    });
  }

  function handlePromoKomponenTarget(promoId: string, komponenId: string) {
    setForm(curr => ({ ...curr, promo_komponen_target: { ...curr.promo_komponen_target, [promoId]: komponenId } }));
  }

  function handleKomponenCheckbox(id: string, checked: boolean) {
    setForm(curr => ({ ...curr, komponen_checked: { ...curr.komponen_checked, [id]: checked } }));
  }

  function handleKomponenDiskon(id: string, val: string) {
    setForm(curr => ({ ...curr, komponen_diskon: { ...curr.komponen_diskon, [id]: val } }));
  }

  const generatedTagihanAwal = useMemo(() => {
    if (!pendaftaranSetting) return [];

    const appliedPromos = activePromos.filter(p => form.daftar_promo.includes(p.id));

    if (pendaftaranSetting.mode_tagihan_biaya === 'gabung') {
      let totalAmount = 0;
      let totalManualDiscount = 0;
      let promoDiscounts = 0;
      let usedPromoNames = new Set<string>();

      pendaftaranSetting.komponen_biaya.forEach(kom => {
        if (form.komponen_checked[kom.id]) {
          totalAmount += kom.nominal;
          const manualDisc = Number(parseNumberInput(form.komponen_diskon[kom.id] || '0'));
          totalManualDiscount += manualDisc;
        }
      });

      if (totalAmount === 0) return [];

      appliedPromos.forEach(p => {
        if (p.target_jenis_tagihan?.includes('pendaftaran') || p.target_jenis_tagihan?.includes('semua') || p.jenis_tagihan === 'pendaftaran' || p.jenis_tagihan === 'semua') {
          usedPromoNames.add(p.nama);
          const promoVal = getPromoValue(p, 'pendaftaran');
          if (promoVal.tipe_diskon === 'nominal') promoDiscounts += promoVal.nominal_diskon;
          else promoDiscounts += (totalAmount * (promoVal.persen_diskon / 100));
        }
      });

      const totalDisc = totalManualDiscount + promoDiscounts;

      return [{
        id: 'gabungan',
        nama: 'Tagihan Pendaftaran',
        jumlah: totalAmount,
        potongan_diskon: totalDisc,
        nama_promo: usedPromoNames.size > 0 ? Array.from(usedPromoNames).join(', ') : null,
      }];
    } else {
      const list: KomponenTagihanInput[] = [];
      pendaftaranSetting.komponen_biaya.forEach(kom => {
        if (form.komponen_checked[kom.id]) {
          const manualDisc = Number(parseNumberInput(form.komponen_diskon[kom.id] || '0'));
          let promoDiscounts = 0;
          let usedPromoNames = new Set<string>();

          appliedPromos.forEach(p => {
            if (p.target_jenis_tagihan?.includes('pendaftaran') || p.target_jenis_tagihan?.includes('semua') || p.jenis_tagihan === 'pendaftaran' || p.jenis_tagihan === 'semua') {
              let shouldApply = false;

              // Jika master promo sudah mengunci komponen tertentu, ikuti pengaturan master
              if (p.target_komponen_biaya && p.target_komponen_biaya.length > 0) {
                if (p.target_komponen_biaya.includes(kom.nama)) {
                  shouldApply = true;
                }
              } else {
                // Jika master promo tidak mengunci, cek pilihan admin di form
                const targetKomponenId = form.promo_komponen_target[p.id];
                shouldApply = !targetKomponenId || targetKomponenId === kom.id || targetKomponenId === 'semua_komponen';
              }

              if (shouldApply) {
                usedPromoNames.add(p.nama);
                const promoVal = getPromoValue(p, kom.id);
                if (promoVal.tipe_diskon === 'nominal') promoDiscounts += promoVal.nominal_diskon;
                else promoDiscounts += (kom.nominal * (promoVal.persen_diskon / 100));
              }
            }
          });

          list.push({
            id: kom.id,
            nama: kom.nama,
            jumlah: kom.nominal,
            potongan_diskon: manualDisc + promoDiscounts,
            nama_promo: usedPromoNames.size > 0 ? Array.from(usedPromoNames).join(', ') : null,
          });
        }
      });
      return list;
    }
  }, [pendaftaranSetting, form.komponen_checked, form.komponen_diskon, form.daftar_promo, activePromos]);

  function validateForm(values: FormState) {
    const nextErrors: FormErrors = {};
    if (!values.nama.trim() || values.nama.trim().length < 2) nextErrors.nama = 'Nama siswa minimal 2 karakter.';
    if (values.tanggal_lahir && values.tanggal_lahir > todayDate()) nextErrors.tanggal_lahir = 'Tanggal lahir tidak boleh di masa depan.';
    if (!values.nama_wali.trim() || values.nama_wali.trim().length < 2) nextErrors.nama_wali = 'Nama wali minimal 2 karakter.';
    if (!/^\d{10,}$/.test(values.kontak_wali.trim())) nextErrors.kontak_wali = 'Nomor HP minimal 10 digit dan hanya angka.';
    if (values.email_wali && !isValidEmail(values.email_wali.trim())) nextErrors.email_wali = 'Format email wali tidak valid.';
    if (!values.tanggal_daftar) nextErrors.tanggal_daftar = 'Tanggal daftar wajib diisi.';
    if (!effectiveTargetYearId) nextErrors.tahun_ajaran_target_id = 'Tahun ajaran target wajib diisi.';

    if (values.tipe_siswa === 'aktif' && !values.kelas_tujuan_id) {
      nextErrors.kelas_tujuan_id = 'Kelas tujuan wajib dipilih untuk siswa aktif.';
    }

    if (values.tipe_siswa === 'calon') {
      const status = selectedTargetYear?.status ?? (selectedTargetYear?.aktif ? 'aktif' : 'draft');
      if (status !== 'draft') {
        nextErrors.tahun_ajaran_target_id = 'Siswa calon hanya boleh didaftarkan ke tahun ajaran draft.';
      }
    }

    if (shouldValidateAge) {
      if (!values.tanggal_lahir) {
        nextErrors.tanggal_lahir = 'Tanggal lahir wajib diisi untuk menghitung umur siswa.';
      } else if (ageTooYoung) {
        nextErrors.tanggal_lahir = 'Usia siswa minimal 2 tahun pada cutoff tahun ajaran target.';
      } else if (ageTooOld) {
        nextErrors.tanggal_lahir = 'Usia siswa harus di bawah 7 tahun pada cutoff tahun ajaran target.';
      }
    }

    if (!values.jatuh_tempo_pendaftaran) {
      nextErrors.jatuh_tempo_pendaftaran = 'Jatuh tempo tagihan awal wajib diisi.';
    }
    if (values.jatuh_tempo_pendaftaran && values.tanggal_daftar && values.jatuh_tempo_pendaftaran < values.tanggal_daftar) {
      nextErrors.jatuh_tempo_pendaftaran = 'Jatuh tempo tidak boleh sebelum tanggal daftar.';
    }

    return nextErrors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan. Silakan login ulang.' });
      return;
    }

    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    requestConfirm({
      title: 'Simpan Data Siswa?',
      description: 'Apakah Anda yakin ingin menyimpan data siswa ini?',
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          const payload: RegisterSiswaInput = {
            nama: form.nama,
            tanggal_lahir: form.tanggal_lahir || null,
            jenis_kelamin: form.jenis_kelamin || null,
            nama_wali: form.nama_wali,
            hubungan_wali: form.hubungan_wali || null,
            kontak_wali: form.kontak_wali,
            email_wali: form.email_wali || null,
            alamat: form.alamat || null,

            nis: form.nis || null,
            status: form.tipe_siswa,
            jalur_registrasi: form.tipe_siswa === 'aktif' && form.jenis_masuk_aktif === 'pindahan' ? 'pindahan' : form.tipe_siswa === 'aktif' && form.jenis_masuk_aktif === 'awal_tahun' ? 'migrasi' : 'baru',
            jenis_masuk: form.tipe_siswa === 'calon' ? 'awal_tahun' : form.jenis_masuk_aktif,
            tanggal_daftar: form.tanggal_daftar,
            jatuh_tempo_pendaftaran: form.jatuh_tempo_pendaftaran,
            tahun_ajaran_target_id: effectiveTargetYearId,
            kelas_tujuan_id: form.tipe_siswa === 'aktif' ? form.kelas_tujuan_id : null,
            kelas_rencana_id: form.tipe_siswa === 'calon' ? form.kelas_tujuan_id || null : null,

            komponen_tagihan_awal: generatedTagihanAwal,
            opsi_bayar_tagihan_awal: form.opsi_bayar_tagihan_awal,

            daftar_promo: form.daftar_promo,
            flag_diskon_spp: form.flag_diskon_spp,
            tipe_diskon_spp: form.tipe_diskon_spp,
            persen_diskon: Number(form.persen_diskon) || 0,
            nominal_diskon_spp: Number(parseNumberInput(form.nominal_diskon_spp)) || 0,
          };
          const result = await registerSiswa(actor, payload);
          addToast({ type: 'success', title: 'Berhasil', message: 'Data siswa berhasil disimpan.' });
          navigate(`/siswa/${result.siswa.id}`);
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menyimpan data siswa.' });
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  }

  const totalTagihanAwal = generatedTagihanAwal.reduce((acc, curr) => acc + curr.jumlah, 0);
  const totalDiskonTagihanAwal = generatedTagihanAwal.reduce((acc, curr) => acc + curr.potongan_diskon, 0);
  const totalAkhirTagihanAwal = totalTagihanAwal - totalDiskonTagihanAwal;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Tambah Siswa"
        description="Masukkan data pendaftaran secara manual untuk satu siswa baru atau aktif."
        actions={
          <button type="button" onClick={() => navigate('/siswa')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Siswa
          </button>
        }
      />

      <form className="space-y-6" onSubmit={handleSubmit}>
        {form.tipe_siswa === 'aktif' && (
          <SectionCard title="Tipe & Jalur Pendaftaran" description="Tentukan apakah pendaftaran ini langsung masuk ke tahun berjalan.">
            <div className="animate-fade-in p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20">
              <p className="mb-3 text-sm font-bold text-indigo-800 dark:text-indigo-300">Pilih Jalur Masuk Siswa Aktif:</p>
              <div className="flex flex-wrap gap-3">
                {[
                  { value: 'awal_tahun', label: 'Awal Masuk' },
                  ...(activeYear ? [{ value: 'pindahan', label: 'Pindahan' }] : []),
                ].map((option) => (
                  <button key={option.value} type="button" onClick={() => updateField('jenis_masuk_aktif', option.value as JenisMasukAktif)} className={`rounded-lg px-3 py-2 text-sm font-bold transition ${form.jenis_masuk_aktif === option.value ? 'bg-indigo-600 text-white shadow-sm' : 'border border-indigo-200 bg-white/70 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-900'}`}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard title="Data siswa" description="Isi identitas utama siswa yang akan dicatat ke sistem.">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Nama lengkap" htmlFor="nama" error={errors.nama}><input id="nama" value={form.nama} onChange={(event) => updateField('nama', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
            <FormField label="Tanggal lahir" htmlFor="tanggal_lahir" error={errors.tanggal_lahir}><input id="tanggal_lahir" type="date" value={form.tanggal_lahir} onChange={(event) => updateField('tanggal_lahir', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
          </div>
          <div className="mt-5">
            <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Jenis kelamin</p>
            <div className="flex flex-wrap gap-3">
              {[
                { value: 'L', label: 'Laki-laki' },
                { value: 'P', label: 'Perempuan' },
              ].map((option) => (
                <button key={option.value} type="button" onClick={() => updateField('jenis_kelamin', option.value as FormState['jenis_kelamin'])} className={`rounded-xl px-4 py-3 text-sm font-bold transition ${form.jenis_kelamin === option.value ? 'bg-brand-600 text-white shadow-md shadow-brand-600/10' : 'border border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Data orang tua / wali" description="Gunakan data wali utama yang akan dihubungi untuk kebutuhan administrasi dan pembayaran.">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Nama wali" htmlFor="nama_wali" error={errors.nama_wali}><input id="nama_wali" value={form.nama_wali} onChange={(event) => updateField('nama_wali', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
            <FormField label="Hubungan dengan siswa" htmlFor="hubungan_wali"><select id="hubungan_wali" value={form.hubungan_wali} onChange={(event) => updateField('hubungan_wali', event.target.value as FormState['hubungan_wali'])} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"><option value="">Pilih hubungan</option><option value="ayah">Ayah</option><option value="ibu">Ibu</option><option value="wali">Wali</option></select></FormField>
            <FormField label="Nomor HP / WhatsApp" htmlFor="kontak_wali" error={errors.kontak_wali}><input id="kontak_wali" value={form.kontak_wali} onChange={(event) => updateField('kontak_wali', event.target.value.replace(/[^\d]/g, ''))} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
            <FormField label="Email wali" htmlFor="email_wali" error={errors.email_wali}><input id="email_wali" type="email" value={form.email_wali} onChange={(event) => updateField('email_wali', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
          </div>
          <div className="mt-5"><FormField label="Alamat" htmlFor="alamat"><textarea id="alamat" value={form.alamat} onChange={(event) => updateField('alamat', event.target.value)} rows={4} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField></div>
        </SectionCard>

        <SectionCard title="Data Pendaftaran & Kelas" description="Pilih target penempatan dan periode jatuh tempo untuk tagihan pendaftaran.">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Tahun ajaran target" htmlFor="tahun_ajaran_target_id" error={errors.tahun_ajaran_target_id}>
              {form.tipe_siswa === 'aktif' ? (
                <input id="tahun_ajaran_target_id" readOnly value={activeYear?.nama ?? 'Belum ada tahun ajaran aktif'} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300" />
              ) : (
                <select id="tahun_ajaran_target_id" value={form.tahun_ajaran_target_id} onChange={(event) => updateField('tahun_ajaran_target_id', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"><option value="">Pilih tahun ajaran draft</option>{calonTargetYears.map((item) => <option key={item.id} value={item.id}>{item.nama} - Draft</option>)}</select>
              )}
            </FormField>
            <FormField label="Tanggal daftar" htmlFor="tanggal_daftar" error={errors.tanggal_daftar}><input id="tanggal_daftar" type="date" value={form.tanggal_daftar} onChange={(event) => updateField('tanggal_daftar', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
          </div>

          {form.tipe_siswa === 'aktif' ? (
            <div className="mt-5 space-y-5">
              <FormField label="Kelas tujuan" htmlFor="kelas_tujuan_id" error={errors.kelas_tujuan_id}><select id="kelas_tujuan_id" value={form.kelas_tujuan_id} onChange={(event) => updateField('kelas_tujuan_id', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"><option value="">Pilih kelas aktif</option>{kelasTargetOptions.map((kelas) => <option key={kelas.id} value={kelas.id}>{formatKelasLabel(kelas)}</option>)}</select></FormField>
              {form.jenis_masuk_aktif === 'awal_tahun' && (
                <FormField label="NIS (jika sudah ada)" htmlFor="nis" hint="Kosongi untuk auto-generate.">
                  <input id="nis" value={form.nis} onChange={(event) => updateField('nis', event.target.value)} placeholder="Kosongi untuk auto" className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
                </FormField>
              )}
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Kelas rencana" htmlFor="kelas_rencana_id" error={errors.kelas_tujuan_id} hint="Diisi otomatis dari umur dan cutoff, tetapi boleh diubah manual.">
                <select id="kelas_rencana_id" value={form.kelas_tujuan_id} onChange={(event) => { setKelasDiubahManual(true); updateField('kelas_tujuan_id', event.target.value); }} disabled={!effectiveTargetYearId} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100">
                  <option value="">{effectiveTargetYearId ? 'Pilih kelas rencana' : 'Pilih tahun ajaran dahulu'}</option>
                  {kelasTargetOptions.map((kelas) => <option key={kelas.id} value={kelas.id}>{formatKelasLabel(kelas)}</option>)}
                </select>
              </FormField>
              <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4 dark:border-brand-900/40 dark:bg-brand-950/20">
                <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">Rekomendasi otomatis</p>
                {!effectiveTargetYearId ? <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Pilih tahun ajaran target untuk menghitung umur dan rekomendasi kelas.</p> : null}
                {effectiveTargetYearId && !form.tanggal_lahir ? <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Isi tanggal lahir untuk menghitung umur dan rekomendasi kelas.</p> : null}
                {effectiveTargetYearId && form.tanggal_lahir && cutoffDate ? <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${ageValid ? 'border-success-100 bg-success-50 text-success-700 dark:border-success-950/40 dark:bg-success-950/20 dark:text-success-400' : 'border-danger-100 bg-danger-50 text-danger-700 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400'}`}>Umur pada cutoff tahun ajaran target ({cutoffDate.toLocaleDateString('id-ID')}): {ageAtCutoffParts ? `${ageAtCutoffParts.years} tahun ${ageAtCutoffParts.months} bulan` : '-'}. {ageTooYoung ? 'Usia minimal 2 tahun.' : ageTooOld ? 'Usia harus di bawah 7 tahun.' : 'Valid untuk PAUD usia 2 sampai kurang dari 7 tahun.'}</div> : null}
                <p className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-100">{effectiveTargetYearId && form.tanggal_lahir ? (autoPlacementPreview ? formatKelasLabel(autoPlacementPreview) : 'Tidak ada kelas yang cocok dengan umur siswa') : '-'}</p>
                {effectiveTargetYearId && form.tanggal_lahir && !autoPlacementPreview ? <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Pilih kelas rencana secara manual jika tidak ada rekomendasi otomatis.</p> : null}
                <button type="button" disabled={!autoPlacementPreview} onClick={() => { if (autoPlacementPreview) { setKelasDiubahManual(false); updateField('kelas_tujuan_id', autoPlacementPreview.id); } }} className="mt-3 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700">Gunakan rekomendasi</button>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Pengaturan Promo & Diskon" description="Berlakukan promo yang sedang aktif dan atur diskon khusus jika ada.">
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Daftar Promo</p>
              {activePromos.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {activePromos.map(promo => {
                    const isSelected = form.daftar_promo.includes(promo.id);
                    const isPendaftaranPromo = promo.jenis_tagihan === 'pendaftaran' || promo.jenis_tagihan === 'semua';
                    const isModePisah = pendaftaranSetting?.mode_tagihan_biaya === 'pisah';

                    return (
                      <div key={promo.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-3 transition ${isSelected ? 'border-brand-300 bg-brand-50/50 dark:border-brand-500/30 dark:bg-brand-900/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/50'}`}>
                        <label className="flex items-center gap-3 cursor-pointer select-none grow">
                          <input type="checkbox" checked={isSelected} onChange={() => togglePromo(promo.id)} className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                          <span className={`text-sm font-bold ${isSelected ? 'text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-400'}`}>{promo.nama}</span>
                        </label>

                        {isSelected && isPendaftaranPromo && isModePisah && (
                          promo.target_komponen_biaya && promo.target_komponen_biaya.length > 0 ? (
                            <div className="w-full sm:w-auto mt-2 sm:mt-0 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50">
                              Hanya untuk: {promo.target_komponen_biaya.join(', ')}
                            </div>
                          ) : (
                            <select
                              value={form.promo_komponen_target[promo.id] || ''}
                              onChange={e => handlePromoKomponenTarget(promo.id, e.target.value)}
                              className="w-full sm:w-64 mt-2 sm:mt-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                              <option value="">Terapkan ke Semua Komponen</option>
                              {pendaftaranSetting.komponen_biaya.map(k => (
                                <option key={k.id} value={k.id}>Terapkan ke: {k.nama}</option>
                              ))}
                            </select>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Belum ada promo yang aktif.</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={form.flag_diskon_spp} onChange={e => updateField('flag_diskon_spp', e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Gunakan Tarif SPP Khusus Siswa Ini</span>
              </label>
              {form.flag_diskon_spp && (
                <div className="mt-4 animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="md:col-span-1">
                    <FormField label="Nominal Tarif SPP" htmlFor="nominal_diskon_spp" hint="Siswa akan ditagih sejumlah ini setiap bulan, mengabaikan tarif kelas.">
                      <input id="nominal_diskon_spp" inputMode="numeric" value={formatNumberInput(form.nominal_diskon_spp)} onChange={e => updateField('nominal_diskon_spp', parseNumberInput(e.target.value))} placeholder="Contoh: 150000" className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
                    </FormField>
                  </div>
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Tagihan Pendaftaran" description="Komponen biaya tagihan awal yang akan dihasilkan. Terapkan potongan manual (diskon per komponen) jika diperlukan.">
          {!pendaftaranSetting ? (
            <div className="p-4 text-center text-sm text-slate-500 border border-slate-200 rounded-xl dark:border-slate-800">Silakan pilih tahun ajaran target terlebih dahulu.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <FormField label="Jatuh tempo tagihan awal" htmlFor="jatuh_tempo_pendaftaran" error={errors.jatuh_tempo_pendaftaran}><input id="jatuh_tempo_pendaftaran" type="date" value={form.jatuh_tempo_pendaftaran} onChange={(event) => updateField('jatuh_tempo_pendaftaran', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" /></FormField>
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Opsi bayar tagihan awal</p>
                  <div className="flex flex-wrap gap-3">{[{ value: 'full', label: 'Full' }, { value: 'cicil', label: 'Bisa Dicicil' }].map((option) => <button key={option.value} type="button" onClick={() => updateField('opsi_bayar_tagihan_awal', option.value as FormState['opsi_bayar_tagihan_awal'])} className={`rounded-xl px-4 py-3 text-sm font-bold transition ${form.opsi_bayar_tagihan_awal === option.value ? 'bg-brand-600 text-white shadow-md shadow-brand-600/10' : 'border border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{option.label}</button>)}</div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 w-10">Pilih</th>
                      <th className="px-4 py-3">Komponen Biaya</th>
                      <th className="px-4 py-3 text-right">Tarif</th>
                      <th className="px-4 py-3 w-40 text-right">Potongan Manual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/20">
                    {pendaftaranSetting.komponen_biaya.map(kom => (
                      <tr key={kom.id}>
                        <td className="px-4 py-3">
                          <input type="checkbox" disabled={kom.wajib && !(form.tipe_siswa === 'aktif' && form.jenis_masuk_aktif === 'awal_tahun')} checked={!!form.komponen_checked[kom.id]} onChange={e => handleKomponenCheckbox(kom.id, e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50" />
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {kom.nama}
                          {kom.wajib && <span className="ml-2 inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/10 dark:bg-rose-900/30 dark:text-rose-400">Wajib</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {formatRupiah(kom.nominal)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input type="text" inputMode="numeric" disabled={!form.komponen_checked[kom.id]} value={formatNumberInput(form.komponen_diskon[kom.id] || '')} onChange={e => handleKomponenDiskon(kom.id, parseNumberInput(e.target.value))} placeholder="0" className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-right text-sm outline-none transition focus:border-brand-400 disabled:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/50 dark:disabled:bg-slate-800" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col items-end gap-1 px-4 py-3 bg-brand-50/50 border border-brand-100 rounded-xl dark:bg-brand-950/20 dark:border-brand-900/40">
                <div className="flex w-full max-w-sm justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Total Tarif</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{formatRupiah(totalTagihanAwal)}</span>
                </div>
                <div className="flex w-full max-w-sm justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Total Potongan & Promo</span>
                  <span className="font-semibold text-danger-600 dark:text-danger-400">- {formatRupiah(totalDiskonTagihanAwal)}</span>
                </div>
                <div className="my-2 h-px w-full max-w-sm bg-brand-200 dark:bg-brand-800/50"></div>
                <div className="flex w-full max-w-sm justify-between text-lg">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Total Tagihan Awal</span>
                  <span className="font-black text-brand-700 dark:text-brand-400">{formatRupiah(Math.max(0, totalAkhirTagihanAwal))}</span>
                </div>
                <p className="mt-2 text-xs text-brand-600/70 dark:text-brand-400/70 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  {pendaftaranSetting.mode_tagihan_biaya === 'gabung' ? 'Dibuat sebagai 1 tagihan gabungan.' : 'Dibuat sebagai tagihan terpisah per komponen.'}
                </p>
              </div>
            </div>
          )}
        </SectionCard>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}{isSubmitting ? 'Menyimpan...' : 'Simpan Siswa'}</button>
        </div>
      </form>
    </div>
  );
}
