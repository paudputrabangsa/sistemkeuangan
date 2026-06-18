import { db } from '../db';
import type { Kelas, Siswa, SiswaKelas, TahunAjaran } from '../db/types';
import { NotFoundError, ValidationError } from './service-errors';
import { assertKelasHasCapacity, hasKelasCapacity } from './kelasCapacityService';
import {
  calculateAgeInYears,
  enqueueSync,
  getPendaftaranTagihanBySiswaId,
  getTahunAjaranCutoffDate,
  newId,
  nowIso,
  toPendingInsert,
  toPendingUpdate,
  todayDate,
} from './service-helpers';
import { getPengaturanPendaftaranByTahunAjaran } from './pendaftaranTahunAjaranService';

export interface PenempatanSiswaBaruSetting {
  aktifkan_penempatan_otomatis: boolean;
  cutoff_bulan: number;
  cutoff_tanggal: number;
  keterangan: string;
}

const defaultSetting: PenempatanSiswaBaruSetting = {
  aktifkan_penempatan_otomatis: true,
  cutoff_bulan: 7,
  cutoff_tanggal: 1,
  keterangan: 'Cutoff umur default 1 Juli',
};

export async function getPenempatanSiswaBaruSetting(): Promise<PenempatanSiswaBaruSetting> {
  const setting = await db.pengaturan.where('kunci').equals('penempatan_siswa_baru').first();
  return (setting?.nilai as PenempatanSiswaBaruSetting | undefined) ?? defaultSetting;
}

async function getCutoffSettingForTahunAjaran(tahunAjaranId: string) {
  const yearlySetting = await getPengaturanPendaftaranByTahunAjaran(tahunAjaranId);
  if (yearlySetting) {
    return { cutoff_bulan: yearlySetting.cutoff_bulan, cutoff_tanggal: yearlySetting.cutoff_tanggal };
  }
  return getPenempatanSiswaBaruSetting();
}

async function getTahunAjaranById(id: string) {
  const tahunAjaran = await db.tahun_ajaran.get(id);
  if (!tahunAjaran || tahunAjaran.deleted_at) {
    throw new NotFoundError('Tahun ajaran target tidak ditemukan.');
  }
  return tahunAjaran;
}

async function getActiveAssignment(siswaId: string) {
  const assignments = await db.siswa_kelas.where('siswa_id').equals(siswaId).toArray();
  return assignments.find((item) => !item.selesai) ?? null;
}

async function assertNoDuplicatePlacement(siswaId: string, kelasId: string, mulai: string, ignoredAssignmentId?: string | null) {
  const assignments = await db.siswa_kelas.where('siswa_id').equals(siswaId).toArray();
  if (assignments.some((item) => item.id !== ignoredAssignmentId && item.kelas_id === kelasId && item.mulai === mulai)) {
    throw new ValidationError('Riwayat kelas siswa sudah ada untuk kelas dan tanggal mulai yang sama.');
  }
}

async function hasAllPendaftaranLunas(siswaId: string) {
  const tagihan = await getPendaftaranTagihanBySiswaId(siswaId);
  return tagihan.length > 0 && tagihan.every((item) => item.status === 'lunas');
}

async function findMatchingKelas(tahunAjaranId: string, usiaTahun: number) {
  const kelas = await db.kelas.where('tahun_ajaran_id').equals(tahunAjaranId).toArray();
  const candidates = kelas
    .filter((item) => !item.deleted_at && item.usia_min_tahun !== null && item.usia_min_tahun !== undefined && item.usia_max_tahun !== null && item.usia_max_tahun !== undefined)
    .sort((a, b) => (a.usia_min_tahun ?? 0) - (b.usia_min_tahun ?? 0))
    .filter((item) => usiaTahun >= (item.usia_min_tahun ?? 0) && usiaTahun <= (item.usia_max_tahun ?? 0));

  for (const item of candidates) {
    if (await hasKelasCapacity(item.id)) {
      return item;
    }
  }

  return null;
}

export async function getAutoPlacementPreview(tanggalLahir: string | null | undefined, tahunAjaranTargetId: string | null | undefined) {
  if (!tanggalLahir || !tahunAjaranTargetId) {
    return null;
  }
  const [setting, tahunAjaran] = await Promise.all([
    getCutoffSettingForTahunAjaran(tahunAjaranTargetId),
    getTahunAjaranById(tahunAjaranTargetId),
  ]);
  const usiaTahun = calculateAgeInYears(tanggalLahir, getTahunAjaranCutoffDate(tahunAjaran, setting.cutoff_bulan, setting.cutoff_tanggal));
  return findMatchingKelas(tahunAjaranTargetId, usiaTahun);
}

export async function autoPlaceSiswaBaruIfEligible(siswaId: string) {
  const siswa = await db.siswa.get(siswaId);
  if (!siswa || siswa.deleted_at || siswa.jalur_registrasi !== 'baru' || siswa.status !== 'calon') {
    return null;
  }

  const [tahunAjaran, globalSetting, activeAssignment, lunas] = await Promise.all([
    getTahunAjaranById(siswa.tahun_ajaran_target_id),
    getPenempatanSiswaBaruSetting(),
    getActiveAssignment(siswa.id),
    hasAllPendaftaranLunas(siswa.id),
  ]);

  if (!tahunAjaran.aktif || !globalSetting.aktifkan_penempatan_otomatis || activeAssignment || !lunas || !siswa.tanggal_lahir) {
    return null;
  }

  const setting = await getCutoffSettingForTahunAjaran(tahunAjaran.id);
  const cutoffDate = getTahunAjaranCutoffDate(tahunAjaran, setting.cutoff_bulan, setting.cutoff_tanggal);
  const usiaTahun = calculateAgeInYears(siswa.tanggal_lahir, cutoffDate);
  const plannedKelas = siswa.kelas_rencana_id ? await db.kelas.get(siswa.kelas_rencana_id) : null;
  const matchingKelas = plannedKelas && !plannedKelas.deleted_at && plannedKelas.tahun_ajaran_id === tahunAjaran.id && await hasKelasCapacity(plannedKelas.id)
    ? plannedKelas
    : await findMatchingKelas(tahunAjaran.id, usiaTahun);
  if (!matchingKelas) {
    return null;
  }

  const now = nowIso();
  const placement = toPendingInsert<SiswaKelas>({
    id: newId(),
    siswa_id: siswa.id,
    kelas_id: matchingKelas.id,
    mulai: todayDate(),
    selesai: null,
    penempatan_sumber: 'otomatis',
    catatan_penempatan: null,
    status_akhir_periode: null,
    created_at: now,
    updated_at: now,
  });
  const updatedSiswa = toPendingUpdate(siswa, { status: 'aktif', updated_at: now });

  await db.transaction('rw', db.siswa, db.siswa_kelas, db.sync_queue, async () => {
    await db.siswa.put(updatedSiswa);
    await enqueueSync('siswa', updatedSiswa.id, 'update', updatedSiswa);
    await db.siswa_kelas.add(placement);
    await enqueueSync('siswa_kelas', placement.id, 'insert', placement);
  });

  return { siswa: updatedSiswa, placement, kelas: matchingKelas };
}

export async function handleInitialBillingCompletion(siswaId: string) {
  const siswa = await db.siswa.get(siswaId);
  if (!siswa || siswa.deleted_at || siswa.status !== 'calon') {
    return null;
  }
  if (siswa.jalur_registrasi === 'baru') {
    return autoPlaceSiswaBaruIfEligible(siswaId);
  }
  return null;
}

export async function runAutoPlacementForTahunAjaran(tahunAjaranId: string) {
  const siswaBaru = await db.siswa.where('tahun_ajaran_target_id').equals(tahunAjaranId).toArray();
  const results = [] as Array<{ siswa: Siswa; placement: SiswaKelas; kelas: Kelas }>;
  for (const siswa of siswaBaru) {
    if (siswa.deleted_at || siswa.jalur_registrasi !== 'baru') {
      continue;
    }
    const result = await autoPlaceSiswaBaruIfEligible(siswa.id);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

async function canActivateCalonForManualPlacement(siswa: Siswa, tahunAjaran: TahunAjaran) {
  if (siswa.status !== 'calon') {
    return false;
  }
  if (siswa.jalur_registrasi === 'baru') {
    return tahunAjaran.aktif && (await hasAllPendaftaranLunas(siswa.id));
  }
  return false;
}

export async function assignSiswaKelasManual(siswaId: string, kelasId: string, catatanPenempatan?: string | null) {
  const [siswa, kelas] = await Promise.all([db.siswa.get(siswaId), db.kelas.get(kelasId)]);
  if (!siswa || siswa.deleted_at) {
    throw new NotFoundError('Siswa tidak ditemukan.');
  }
  if (!kelas || kelas.deleted_at) {
    throw new NotFoundError('Kelas tidak ditemukan.');
  }
  await assertKelasHasCapacity(kelasId, 1, siswaId);
  const tahunAjaran = await getTahunAjaranById(kelas.tahun_ajaran_id);
  const activeAssignment = await getActiveAssignment(siswaId);
  const now = nowIso();
  await assertNoDuplicatePlacement(siswaId, kelasId, todayDate(), activeAssignment?.id ?? null);
  const newPlacement = toPendingInsert<SiswaKelas>({
    id: newId(),
    siswa_id: siswaId,
    kelas_id: kelasId,
    mulai: todayDate(),
    selesai: null,
    penempatan_sumber: 'manual',
    catatan_penempatan: catatanPenempatan?.trim() || null,
    status_akhir_periode: null,
    created_at: now,
    updated_at: now,
  });

  const shouldActivate = await canActivateCalonForManualPlacement(siswa, tahunAjaran);

  await db.transaction('rw', db.siswa, db.siswa_kelas, db.sync_queue, async () => {
    if (activeAssignment) {
      const closed = toPendingUpdate(activeAssignment, { selesai: todayDate(), status_akhir_periode: 'tidak_lanjut', updated_at: now });
      await db.siswa_kelas.put(closed);
      await enqueueSync('siswa_kelas', closed.id, 'update', closed);
    }

    await db.siswa_kelas.add(newPlacement);
    await enqueueSync('siswa_kelas', newPlacement.id, 'insert', newPlacement);

    if (shouldActivate) {
      const updatedSiswa = toPendingUpdate(siswa, { status: 'aktif', updated_at: now });
      await db.siswa.put(updatedSiswa);
      await enqueueSync('siswa', updatedSiswa.id, 'update', updatedSiswa);
    }
  });

  return { placement: newPlacement, activated: shouldActivate };
}
