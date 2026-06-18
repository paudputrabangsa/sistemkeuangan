import { db } from '../db';
import type { Siswa, SiswaKelas, TahunAjaran } from '../db/types';

export type SiswaPeriodStatus = 'calon' | 'aktif' | 'keluar' | 'batal_daftar' | 'naik_kelas' | 'alumni' | 'tidak_lanjut' | 'cuti';

interface SiswaFilters {
  status?: SiswaPeriodStatus | 'semua';
  search?: string;
  kelasId?: string;
  tahunAjaranId?: string;
}

function getYearStatus(tahunAjaran: TahunAjaran | null | undefined) {
  return tahunAjaran?.status ?? (tahunAjaran?.aktif ? 'aktif' : 'draft');
}

async function getActiveTahunAjaran() {
  const years = (await db.tahun_ajaran.toArray()).filter((item) => !item.deleted_at);
  return years.find((item) => item.aktif || item.status === 'aktif') ?? null;
}

function getPeriodStatus(siswa: Siswa, assignment: SiswaKelas | null, year: TahunAjaran | null | undefined): SiswaPeriodStatus {
  if (!year) {
    if (siswa.status === 'berhenti') {
      return siswa.jalur_registrasi === 'baru' && !assignment ? 'batal_daftar' : 'keluar';
    }
    if (siswa.status === 'lulus') {
      return 'alumni';
    }
    return siswa.status;
  }

  const yearStatus = getYearStatus(year);
  if (yearStatus === 'arsip') {
    if (assignment?.status_akhir_periode) {
      return assignment.status_akhir_periode;
    }
    if (siswa.status === 'lulus') {
      return 'alumni';
    }
    if (siswa.status === 'berhenti') {
      return siswa.jalur_registrasi === 'baru' && !assignment ? 'batal_daftar' : 'keluar';
    }
    return 'tidak_lanjut';
  }

  if (yearStatus === 'draft') {
    if (siswa.status === 'batal_daftar') return 'batal_daftar';
    if (siswa.status === 'berhenti') return 'batal_daftar';
    return 'calon';
  }

  if (siswa.status === 'berhenti') {
    return siswa.jalur_registrasi === 'baru' && !assignment ? 'batal_daftar' : 'keluar';
  }
  if (siswa.status === 'lulus') {
    return 'alumni';
  }
  return siswa.status;
}

function findRegistrationYearId(siswa: Siswa, years: TahunAjaran[]) {
  return years.find((year) => !year.deleted_at && siswa.tanggal_daftar >= year.mulai && siswa.tanggal_daftar <= year.selesai)?.id ?? null;
}

function isCandidateLikeStatus(status: SiswaPeriodStatus) {
  return status === 'calon' || status === 'batal_daftar';
}

export async function listSiswaWithFilters(filters: SiswaFilters = {}) {
  const [siswa, kelas, assignments, tagihan, tahunAjaran, activeYear] = await Promise.all([
    db.siswa.toArray(),
    db.kelas.toArray(),
    db.siswa_kelas.toArray(),
    db.tagihan.toArray(),
    db.tahun_ajaran.toArray(),
    getActiveTahunAjaran(),
  ]);

  const kelasMap = new Map(kelas.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const tahunAjaranMap = new Map(tahunAjaran.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const activeAssignments = assignments.filter((item) => !item.selesai);
  const search = filters.search?.trim().toLowerCase() ?? '';
  let effectiveYearId = '';
  if (filters.tahunAjaranId === 'all') {
    effectiveYearId = '';
  } else if (filters.tahunAjaranId === 'none') {
    effectiveYearId = 'none';
  } else {
    effectiveYearId = filters.tahunAjaranId ?? activeYear?.id ?? '';
  }
  const effectiveYear = effectiveYearId && effectiveYearId !== 'none' ? tahunAjaranMap.get(effectiveYearId) ?? null : null;

  return siswa
    .filter((item) => !item.deleted_at)
    .map((item) => {
      const activeAssignment = activeAssignments.find((assignment) => assignment.siswa_id === item.id) ?? null;
      const activeClass = activeAssignment ? kelasMap.get(activeAssignment.kelas_id) ?? null : null;
      const periodAssignment = effectiveYearId
        ? assignments.find((assignment) => assignment.siswa_id === item.id && kelasMap.get(assignment.kelas_id)?.tahun_ajaran_id === effectiveYearId) ?? null
        : activeAssignment;
      const fallbackActiveClass = !effectiveYearId || activeClass?.tahun_ajaran_id === effectiveYearId ? activeClass : null;
      const periodClass = periodAssignment ? kelasMap.get(periodAssignment.kelas_id) ?? null : fallbackActiveClass;
      const periodStatus = getPeriodStatus(item, periodAssignment, effectiveYear);
      const tahunAjaranDaftarId = findRegistrationYearId(item, tahunAjaran);
      const outstanding = tagihan
        .filter((bill) => !bill.deleted_at && bill.siswa_id === item.id)
        .reduce((total, bill) => total + Math.max(0, bill.jumlah_total - bill.sudah_dibayar), 0);

      return {
        ...item,
        activeAssignment,
        activeClass,
        periodAssignment,
        periodClass,
        periodStatus,
        tahunAjaranDaftarId,
        isInRegistrationYear: Boolean(effectiveYearId && tahunAjaranDaftarId === effectiveYearId),
        isInTargetYear: Boolean(effectiveYearId && item.tahun_ajaran_target_id === effectiveYearId),
        isArchivedPeriod: getYearStatus(effectiveYear) === 'arsip',
        outstanding,
      };
    })
    .filter((item) => {
      if (filters.status && filters.status !== 'semua' && item.periodStatus !== filters.status) {
        return false;
      }

      if (effectiveYearId) {
        const candidateMatchesYear = isCandidateLikeStatus(item.periodStatus) && (item.tahun_ajaran_target_id === effectiveYearId);
        const periodClassMatchesYear = item.periodClass?.tahun_ajaran_id === effectiveYearId;
        const targetMatchesYear = item.tahun_ajaran_target_id === effectiveYearId;
        if (!candidateMatchesYear && !periodClassMatchesYear && !targetMatchesYear) {
          return false;
        }
      }

      if (effectiveYear && getYearStatus(effectiveYear) === 'aktif') {
        const isUnplacedCandidate = isCandidateLikeStatus(item.periodStatus) && (item.tahun_ajaran_target_id === effectiveYearId);
        const isPlacedInActiveYear = item.periodClass?.tahun_ajaran_id === effectiveYearId;
        if (!isUnplacedCandidate && !isPlacedInActiveYear) {
          return false;
        }
      }

      if (effectiveYear && getYearStatus(effectiveYear) === 'draft' && item.status !== 'calon' && item.periodStatus !== 'batal_daftar') {
        return false;
      }

      if (effectiveYear && getYearStatus(effectiveYear) === 'arsip') {
        const hasAssignmentInYear = item.periodClass?.tahun_ajaran_id === effectiveYearId;
        const isTargetYear = item.tahun_ajaran_target_id === effectiveYearId;
        if (!hasAssignmentInYear && !isTargetYear) {
          return false;
        }
      }

      if (filters.kelasId && !isCandidateLikeStatus(item.periodStatus) && item.periodClass?.id !== filters.kelasId) {
        return false;
      }

      if (search && !`${item.nama} ${item.nama_wali}`.toLowerCase().includes(search)) {
        return false;
      }

      return true;
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

export async function getSiswaDetail(siswaId: string) {
  const [siswa, assignments, kelas, tagihan, pembayaran, tahunAjaran] = await Promise.all([
    db.siswa.get(siswaId),
    db.siswa_kelas.where('siswa_id').equals(siswaId).toArray(),
    db.kelas.toArray(),
    db.tagihan.where('siswa_id').equals(siswaId).toArray(),
    db.pembayaran.toArray(),
    db.tahun_ajaran.toArray(),
  ]);

  if (!siswa || siswa.deleted_at) {
    return null;
  }

  const kelasMap = new Map(kelas.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const tahunAjaranMap = new Map(tahunAjaran.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const history = assignments
    .map((assignment) => {
      const k = kelasMap.get(assignment.kelas_id) ?? null;
      return {
        ...assignment,
        kelas: k,
        tahun_ajaran: k ? tahunAjaranMap.get(k.tahun_ajaran_id) ?? null : null,
      };
    })
    .sort((a, b) => b.mulai.localeCompare(a.mulai));
  const activeAssignment = history.find((item) => !item.selesai) ?? null;
  const studentBills = tagihan.filter((item) => !item.deleted_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const billIds = new Set(studentBills.map((item) => item.id));
  const studentPayments = pembayaran
    .filter((item) => billIds.has(item.tagihan_id))
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  return {
    siswa,
    tahunAjaranTarget: tahunAjaranMap.get(siswa.tahun_ajaran_target_id) ?? null,
    activeAssignment,
    riwayatKelas: history,
    tagihan: studentBills,
    pembayaran: studentPayments,
  };
}
