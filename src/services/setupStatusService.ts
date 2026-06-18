import { db } from '../db';
import { getOnboardingStatus, type OnboardingStatus } from './onboardingService';

export interface SetupChecklistItem {
  key: 'profil' | 'tahun_ajaran' | 'tingkat_kelas' | 'komponen_biaya' | 'promo_diskon' | 'format_nis' | 'metode_tagihan';
  label: string;
  description: string;
  done: boolean;
  href: string;
}

export interface SetupStatus {
  isComplete: boolean;
  isOperationalActive: boolean;
  onboarding: OnboardingStatus;
  activeYearId: string | null;
  items: SetupChecklistItem[];
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const [profile, years, classes, registrationSettings, settings, onboarding] = await Promise.all([
    db.profil_sekolah.get('00000000-0000-0000-0000-000000000001'),
    db.tahun_ajaran.toArray(),
    db.kelas.toArray(),
    db.pengaturan_pendaftaran_tahun_ajaran.toArray(),
    db.pengaturan.toArray(),
    getOnboardingStatus(),
  ]);

  const activeYear = years.find((item) => !item.deleted_at && (item.aktif || item.status === 'aktif')) ?? null;
  const activeYearClasses = activeYear ? classes.filter((item) => !item.deleted_at && item.tahun_ajaran_id === activeYear.id) : [];
  const activeRegistrationSetting = activeYear ? registrationSettings.find((item) => !item.deleted_at && item.tahun_ajaran_id === activeYear.id) : null;
  const diskonSetting = settings.find((item) => !item.deleted_at && item.kunci === 'diskon');

  const komponenBiayaDone = Boolean(
    activeRegistrationSetting &&
    (activeRegistrationSetting.pendaftaran_luar_sistem ||
     (activeRegistrationSetting.komponen_biaya?.length ?? 0) > 0)
  );

  const items: SetupChecklistItem[] = [
    {
      key: 'profil',
      label: 'Profil Sekolah',
      description: 'Identitas sekolah sudah diisi.',
      done: Boolean(profile?.nama_sekolah?.trim() && profile.nama_sekolah !== 'TK PAUD Melati Indah'),
      href: '/pengaturan/profil-sekolah',
    },
    {
      key: 'tahun_ajaran',
      label: 'Tahun Ajaran',
      description: 'Periode berjalan sudah ditentukan.',
      done: Boolean(activeYear),
      href: '/tahun-ajaran',
    },
    {
      key: 'tingkat_kelas',
      label: 'Tingkat & Kelas',
      description: 'Rombel, tarif SPP, dan cutoff umur sudah diatur.',
      done: activeYearClasses.length > 0,
      href: '/kelas',
    },
    {
      key: 'komponen_biaya',
      label: 'Komponen Biaya',
      description: 'Biaya pendaftaran, jatuh tempo, dan mode tagihan sudah dikonfigurasi.',
      done: komponenBiayaDone,
      href: '/tahun-ajaran',
    },
    {
      key: 'promo_diskon',
      label: 'Promo / Diskon',
      description: 'Potongan harga untuk tagihan (opsional).',
      done: Boolean(diskonSetting?.nilai && Array.isArray(diskonSetting.nilai) && diskonSetting.nilai.length > 0),
      href: '/pengaturan',
    },
    {
      key: 'format_nis',
      label: 'Format NIS',
      description: 'Format nomor induk siswa sudah diatur (opsional).',
      done: onboarding.setup_selesai,
      href: '/pengaturan',
    },
    {
      key: 'metode_tagihan',
      label: 'Metode & Tagihan',
      description: 'Metode pembayaran dan jenis tagihan sudah siap.',
      done: onboarding.setup_selesai,
      href: '/pengaturan',
    },
  ];

  const coreSetupKeys = new Set<SetupChecklistItem['key']>(['profil', 'tahun_ajaran', 'tingkat_kelas', 'komponen_biaya']);
  const isComplete = items.filter((item) => coreSetupKeys.has(item.key)).every((item) => item.done);
  return {
    isComplete,
    isOperationalActive: isComplete && onboarding.operasional_aktif,
    onboarding,
    activeYearId: activeYear?.id ?? null,
    items,
  };
}
