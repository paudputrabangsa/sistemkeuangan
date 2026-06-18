import { db } from '../db';
import { seedDatabase } from '../db/seed';
import type { Pengaturan, ProfilSekolah, SppGenerateCutoffSetting } from '../db/types';
import { defaultOnboardingStatus } from './onboardingService';
import { assertCanAccess } from './permissionService';
import { NotFoundError, ValidationError } from './service-errors';
import { enqueueSync, newId, nowIso, toPendingUpdate, type ServiceActor } from './service-helpers';
import { normalizeComparisonKey, normalizeWhitespace } from './nameNormalizationService';
import { getActivePengaturanRecord, repairSettingList, upsertPengaturanNilai } from './pengaturanRepository';

export interface SettingListItem {
  id: string;
  nama: string;
  aktif: boolean;
}

export interface PenempatanSiswaBaruSetting {
  aktifkan_penempatan_otomatis: boolean;
  cutoff_bulan: number;
  cutoff_tanggal: number;
  keterangan: string;
}

export interface UpdateProfilSekolahInput {
  nama_sekolah: string;
  nama_yayasan?: string | null;
  bentuk_satuan?: string | null;
  izin_operasional?: string | null;
  npsn?: string | null;
  telepon?: string | null;
  website?: string | null;
  tahun_berdiri?: string | null;
  alamat_jalan?: string | null;
  alamat_rt?: string | null;
  alamat_rw?: string | null;
  alamat_desa?: string | null;
  alamat_kecamatan?: string | null;
  alamat_kabupaten?: string | null;
  alamat_provinsi?: string | null;
  alamat_kode_pos?: string | null;
  nama_kepsek?: string | null;
  logo_url?: string | null;
  tanda_tangan_url?: string | null;
}

async function getPengaturanRecord(kunci: string) {
  const setting = await getActivePengaturanRecord(kunci);
  if (!setting || setting.deleted_at) {
    throw new NotFoundError(`Pengaturan ${kunci} tidak ditemukan.`);
  }
  return setting;
}

function validateProfilSekolah(input: UpdateProfilSekolahInput) {
  if (!input.nama_sekolah.trim()) {
    throw new ValidationError('Nama sekolah wajib diisi.');
  }
  if (!input.bentuk_satuan?.trim()) {
    throw new ValidationError('Bentuk satuan wajib diisi.');
  }
  if (!input.nama_kepsek?.trim()) {
    throw new ValidationError('Nama kepala/pengelola wajib diisi.');
  }
  if (!input.alamat_jalan?.trim()) {
    throw new ValidationError('Alamat jalan wajib diisi.');
  }
  if (!input.alamat_desa?.trim()) {
    throw new ValidationError('Desa/Kelurahan wajib diisi.');
  }
  if (!input.alamat_kecamatan?.trim()) {
    throw new ValidationError('Kecamatan wajib diisi.');
  }
  if (!input.alamat_kabupaten?.trim()) {
    throw new ValidationError('Kabupaten/Kota wajib diisi.');
  }
  if (!input.alamat_provinsi?.trim()) {
    throw new ValidationError('Provinsi wajib diisi.');
  }

  if (input.website && !/^(https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/.*)?$/i.test(input.website.trim())) {
    throw new ValidationError('Format website sekolah tidak valid.');
  }

  if (input.npsn && !/^\d+$/.test(input.npsn)) {
    throw new ValidationError('NPSN hanya boleh berisi angka.');
  }
}

export async function updateProfilSekolah(actor: ServiceActor, input: UpdateProfilSekolahInput) {
  await assertCanAccess(actor.role, 'pengaturan', 'edit');
  validateProfilSekolah(input);

  const existing = await db.profil_sekolah.get('00000000-0000-0000-0000-000000000001');
  if (!existing) {
    throw new NotFoundError('Profil sekolah tidak ditemukan.');
  }

  const updated = toPendingUpdate<ProfilSekolah>(existing, {
    nama_sekolah: input.nama_sekolah.trim(),
    nama_yayasan: input.nama_yayasan?.trim() || null,
    bentuk_satuan: input.bentuk_satuan?.trim() || null,
    izin_operasional: input.izin_operasional?.trim() || null,
    npsn: input.npsn?.trim() || null,
    telepon: input.telepon?.trim() || null,
    website: input.website?.trim() || null,
    tahun_berdiri: input.tahun_berdiri?.trim() || null,
    alamat_jalan: input.alamat_jalan?.trim() || null,
    alamat_rt: input.alamat_rt?.trim() || null,
    alamat_rw: input.alamat_rw?.trim() || null,
    alamat_desa: input.alamat_desa?.trim() || null,
    alamat_kecamatan: input.alamat_kecamatan?.trim() || null,
    alamat_kabupaten: input.alamat_kabupaten?.trim() || null,
    alamat_provinsi: input.alamat_provinsi?.trim() || null,
    alamat_kode_pos: input.alamat_kode_pos?.trim() || null,
    nama_kepsek: input.nama_kepsek?.trim() || null,
    logo_url: input.logo_url?.trim() || null,
    tanda_tangan_url: input.tanda_tangan_url?.trim() || null,
    updated_at: nowIso(),
  });

  await db.transaction('rw', db.profil_sekolah, db.sync_queue, async () => {
    await db.profil_sekolah.put(updated);
    await enqueueSync('profil_sekolah', updated.id, 'update', updated);
  });

  return updated;
}

export async function updateSettingList(actor: ServiceActor, kunci: 'jenis_tagihan' | 'metode_pembayaran', items: SettingListItem[]) {
  await assertCanAccess(actor.role, 'pengaturan', 'edit');
  const allowedItems = kunci === 'metode_pembayaran'
    ? items.filter((item) => item.nama.trim().toLowerCase() !== 'split')
    : items;

  if (allowedItems.length === 0) {
    throw new ValidationError('Daftar pengaturan tidak boleh kosong.');
  }

  if (allowedItems.some((item) => !item.nama.trim())) {
    throw new ValidationError('Nama item pengaturan wajib diisi.');
  }

  const keys = new Set<string>();
  for (const item of allowedItems) {
    const key = normalizeComparisonKey(item.nama);
    if (keys.has(key)) {
      throw new ValidationError(`Item pengaturan duplikat: ${item.nama}.`);
    }
    keys.add(key);
  }

  const normalized = allowedItems.map((item) => ({
    id: item.id || newId(),
    nama: normalizeWhitespace(item.nama),
    aktif: item.aktif,
  }));

  const updated = await upsertPengaturanNilai(kunci, normalized, kunci === 'jenis_tagihan' ? 'Daftar jenis tagihan sekolah' : 'Daftar metode pembayaran yang tersedia');

  await db.transaction('rw', db.pengaturan, db.sync_queue, async () => {
    await enqueueSync('pengaturan', updated.id, 'update', updated);
  });
  await repairSettingList(kunci);

  return updated;
}

export async function updatePenempatanSiswaBaruSetting(actor: ServiceActor, value: PenempatanSiswaBaruSetting) {
  await assertCanAccess(actor.role, 'pengaturan', 'edit');

  if (value.cutoff_bulan < 1 || value.cutoff_bulan > 12) {
    throw new ValidationError('Bulan cutoff harus antara 1 sampai 12.');
  }

  if (value.cutoff_tanggal < 1 || value.cutoff_tanggal > 31) {
    throw new ValidationError('Tanggal cutoff harus antara 1 sampai 31.');
  }

  const existing = await getPengaturanRecord('penempatan_siswa_baru');
  const updated = toPendingUpdate<Pengaturan>(existing, {
    nilai: value,
    updated_at: nowIso(),
  });

  await db.transaction('rw', db.pengaturan, db.sync_queue, async () => {
    await db.pengaturan.put(updated);
    await enqueueSync('pengaturan', updated.id, 'update', updated);
  });

  return updated;
}

export async function updateSppGenerateCutoffSetting(actor: ServiceActor, value: SppGenerateCutoffSetting) {
  await assertCanAccess(actor.role, 'pengaturan', 'edit');

  if (value.cutoff_tanggal < 1 || value.cutoff_tanggal > 31) {
    throw new ValidationError('Tanggal cutoff harus antara 1 sampai 31.');
  }

  const existing = await getPengaturanRecord('spp_generate_cutoff');
  const updated = toPendingUpdate<Pengaturan>(existing, {
    nilai: value,
    updated_at: nowIso(),
  });

  await db.transaction('rw', db.pengaturan, db.sync_queue, async () => {
    await db.pengaturan.put(updated);
    await enqueueSync('pengaturan', updated.id, 'update', updated);
  });

  return updated;
}

export async function resetLocalAppData(actor: ServiceActor) {
  await assertCanAccess(actor.role, 'pengaturan', 'edit');

  await db.transaction(
    'rw',
    [
      db.profil_sekolah,
      db.pengaturan,
      db.tahun_ajaran,
      db.tingkat,
      db.kelas,
      db.pengaturan_pendaftaran_tahun_ajaran,
      db.akun,
      db.permission,
      db.siswa,
      db.siswa_kelas,
      db.tagihan,
      db.pembayaran,
      db.sync_queue,
      db.sync_log,
    ],
    async () => {
      await Promise.all([
        db.profil_sekolah.clear(),
        db.pengaturan.clear(),
        db.tahun_ajaran.clear(),
        db.tingkat.clear(),
        db.kelas.clear(),
        db.pengaturan_pendaftaran_tahun_ajaran.clear(),
        db.akun.clear(),
        db.permission.clear(),
        db.siswa.clear(),
        db.siswa_kelas.clear(),
        db.tagihan.clear(),
        db.pembayaran.clear(),
        db.sync_queue.clear(),
        db.sync_log.clear(),
      ]);
    },
  );

  await seedDatabase();
  clearResetDraftStorage();
}

function clearResetDraftStorage() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem('setup_awal_draft_v1');
  localStorage.removeItem('setup_awal_draft_v2');
  localStorage.removeItem('setup_tahun_ajaran_draft_v1');
  localStorage.removeItem('setup_tahun_ajaran_draft_v2');
  localStorage.removeItem('setup_tahun_ajaran_draft_v3');
  localStorage.removeItem('migrasi_siswa_tahun_berjalan_draft_v1');
  localStorage.removeItem('migrasi_calon_siswa_draft_v1');
}

export async function resetToSetupAwal(actor: ServiceActor) {
  await assertCanAccess(actor.role, 'pengaturan', 'edit');
  const profile = await db.profil_sekolah.get('00000000-0000-0000-0000-000000000001');

  await db.transaction(
    'rw',
    [
      db.profil_sekolah,
      db.pengaturan,
      db.tahun_ajaran,
      db.tingkat,
      db.kelas,
      db.pengaturan_pendaftaran_tahun_ajaran,
      db.siswa,
      db.siswa_kelas,
      db.tagihan,
      db.pembayaran,
      db.sync_queue,
      db.sync_log,
    ],
    async () => {
      await Promise.all([
        db.tahun_ajaran.clear(),
        db.pengaturan.clear(),
        db.tingkat.clear(),
        db.kelas.clear(),
        db.pengaturan_pendaftaran_tahun_ajaran.clear(),
        db.siswa.clear(),
        db.siswa_kelas.clear(),
        db.tagihan.clear(),
        db.pembayaran.clear(),
        db.sync_queue.clear(),
        db.sync_log.clear(),
      ]);

      const timestamp = nowIso();
      if (profile) {
        await db.profil_sekolah.put(toPendingUpdate<ProfilSekolah>(profile, {
          nama_sekolah: '',
          nama_yayasan: null,
          bentuk_satuan: null,
          izin_operasional: null,
          npsn: null,
          telepon: null,
          website: null,
          tahun_berdiri: null,
          alamat_jalan: null,
          alamat_rt: null,
          alamat_rw: null,
          alamat_desa: null,
          alamat_kecamatan: null,
          alamat_kabupaten: null,
          alamat_provinsi: null,
          alamat_kode_pos: null,
          nama_kepsek: null,
          logo_url: null,
          tanda_tangan_url: null,
          updated_at: timestamp,
        }));
      } else {
        await db.profil_sekolah.add({
          id: '00000000-0000-0000-0000-000000000001',
          nama_sekolah: '',
          nama_yayasan: null,
          bentuk_satuan: null,
          izin_operasional: null,
          npsn: null,
          telepon: null,
          website: null,
          tahun_berdiri: null,
          alamat_jalan: null,
          alamat_rt: null,
          alamat_rw: null,
          alamat_desa: null,
          alamat_kecamatan: null,
          alamat_kabupaten: null,
          alamat_provinsi: null,
          alamat_kode_pos: null,
          nama_kepsek: null,
          logo_url: null,
          tanda_tangan_url: null,
          created_at: timestamp,
          updated_at: timestamp,
          deleted_at: null,
          _sync_status: 'pending',
          _sync_at: null,
          _local_only: true,
        });
      }
    },
  );

  await seedDatabase();
  const timestamp = nowIso();
  const onboarding = {
    id: newId(),
    kunci: 'onboarding_status',
    nilai: defaultOnboardingStatus,
    keterangan: 'Status onboarding setup, migrasi data awal, dan operasional',
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    _sync_status: 'synced' as const,
    _sync_at: timestamp,
    _local_only: false,
  } satisfies Pengaturan;
  await db.pengaturan.add(onboarding);
  clearResetDraftStorage();
}
