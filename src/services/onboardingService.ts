import { db } from '../db';
import type { Pengaturan } from '../db/types';
import { assertCanAccess } from './permissionService';
import { ValidationError } from './service-errors';
import { enqueueSync, newId, nowIso, toPendingInsert, toPendingUpdate, type ServiceActor } from './service-helpers';

export type MigrasiDataAwalStatus = 'pending' | 'selesai' | 'dilewati';
export type MigrasiWizardStatus = 'belum_mulai' | 'draft' | 'selesai' | 'dilewati';

export interface OnboardingStatus {
  setup_selesai: boolean;
  migrasi_data_awal_status: MigrasiDataAwalStatus;
  migrasi_calon_siswa_status: MigrasiWizardStatus;
  migrasi_siswa_tahun_berjalan_status: MigrasiWizardStatus;
  operasional_aktif: boolean;
  migrasi_dikunci_pada?: string | null;
}

export const defaultOnboardingStatus: OnboardingStatus = {
  setup_selesai: false,
  migrasi_data_awal_status: 'pending',
  migrasi_calon_siswa_status: 'belum_mulai',
  migrasi_siswa_tahun_berjalan_status: 'belum_mulai',
  operasional_aktif: false,
  migrasi_dikunci_pada: null,
};

async function getOnboardingRecord() {
  return db.pengaturan.where('kunci').equals('onboarding_status').first();
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const record = await getOnboardingRecord();
  return { ...defaultOnboardingStatus, ...(record?.nilai as Partial<OnboardingStatus> | undefined) };
}

async function saveOnboardingStatus(value: OnboardingStatus) {
  const existing = await getOnboardingRecord();
  const timestamp = nowIso();
  const record = existing && !existing.deleted_at
    ? toPendingUpdate<Pengaturan>(existing, { nilai: value, updated_at: timestamp })
    : toPendingInsert<Pengaturan>({
      id: newId(),
      kunci: 'onboarding_status',
      nilai: value,
      keterangan: 'Status onboarding setup, migrasi data awal, dan operasional',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

  await db.pengaturan.put(record);
  await enqueueSync('pengaturan', record.id, existing && !existing.deleted_at ? 'update' : 'insert', record);
  return record;
}

export async function markSetupAwalCompleted() {
  return saveOnboardingStatus({
    setup_selesai: true,
    migrasi_data_awal_status: 'pending',
    migrasi_calon_siswa_status: 'belum_mulai',
    migrasi_siswa_tahun_berjalan_status: 'belum_mulai',
    operasional_aktif: false,
    migrasi_dikunci_pada: null,
  });
}

export async function skipMigrasiDataAwal(actor: ServiceActor) {
  await assertCanAccess(actor.role, 'pengaturan', 'edit');
  return saveOnboardingStatus({
    setup_selesai: true,
    migrasi_data_awal_status: 'dilewati',
    migrasi_calon_siswa_status: 'dilewati',
    migrasi_siswa_tahun_berjalan_status: 'dilewati',
    operasional_aktif: true,
    migrasi_dikunci_pada: nowIso(),
  });
}

export async function completeMigrasiDataAwal(actor: ServiceActor) {
  await assertCanAccess(actor.role, 'pengaturan', 'edit');
  const current = await getOnboardingStatus();
  const calonSelesai = current.migrasi_calon_siswa_status === 'selesai';
  const siswaSelesai = current.migrasi_siswa_tahun_berjalan_status === 'selesai';
  if (!calonSelesai && !siswaSelesai) {
    throw new ValidationError('Minimal satu wizard migrasi harus selesai. Jika tidak ingin migrasi sama sekali, gunakan Lewati Semua dan Mulai Operasional.');
  }
  return saveOnboardingStatus({
    setup_selesai: true,
    migrasi_data_awal_status: 'selesai',
    migrasi_calon_siswa_status: calonSelesai ? 'selesai' : 'dilewati',
    migrasi_siswa_tahun_berjalan_status: siswaSelesai ? 'selesai' : 'dilewati',
    operasional_aktif: true,
    migrasi_dikunci_pada: nowIso(),
  });
}

export async function updateMigrasiWizardStatus(actor: ServiceActor, wizard: 'calon_siswa' | 'siswa_tahun_berjalan', status: MigrasiWizardStatus) {
  await assertCanAccess(actor.role, 'pengaturan', 'edit');
  const current = await getOnboardingStatus();
  return saveOnboardingStatus({
    ...current,
    setup_selesai: true,
    migrasi_data_awal_status: current.operasional_aktif ? current.migrasi_data_awal_status : 'pending',
    migrasi_calon_siswa_status: wizard === 'calon_siswa' ? status : current.migrasi_calon_siswa_status,
    migrasi_siswa_tahun_berjalan_status: wizard === 'siswa_tahun_berjalan' ? status : current.migrasi_siswa_tahun_berjalan_status,
  });
}
