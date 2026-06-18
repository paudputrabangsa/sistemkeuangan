import { db } from '../db';

interface TagihanFilters {
  context?: 'aktif' | 'tunggakan_lama' | 'pendaftaran' | 'dibatalkan' | 'semua';
  bulanTahun?: string;
  kelasId?: string;
  jenis?: string;
  status?: string;
  siswaId?: string;
  tahunAjaranId?: string;
  studentStatus?: string; // comma-separated, e.g. 'aktif,calon'
}

async function getActiveTahunAjaran() {
  const years = (await db.tahun_ajaran.toArray()).filter((item) => !item.deleted_at);
  return years.find((item) => item.aktif || item.status === 'aktif') ?? null;
}

export async function listTagihanWithFilters(filters: TagihanFilters = {}) {
  const [tagihan, siswa, kelas, assignments, activeYear, allYears] = await Promise.all([
    db.tagihan.toArray(),
    db.siswa.toArray(),
    db.kelas.toArray(),
    db.siswa_kelas.toArray(),
    getActiveTahunAjaran(),
    db.tahun_ajaran.toArray(),
  ]);

  const draftYears = allYears.filter((item) => !item.deleted_at && item.status === 'draft');
  draftYears.sort((a, b) => a.mulai.localeCompare(b.mulai));
  const firstDraftYear = draftYears[0] ?? null;

  const siswaMap = new Map(siswa.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const kelasMap = new Map(kelas.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const activeAssignments = assignments.filter((item) => !item.selesai);
  const context = filters.context ?? 'aktif';

  let defaultYearId = activeYear?.id ?? '';
  if (context === 'pendaftaran' && firstDraftYear) {
    defaultYearId = firstDraftYear.id;
  }
  if (context === 'tunggakan_lama') {
    defaultYearId = '';
  }
  const effectiveYearId = filters.tahunAjaranId === 'all' ? '' : filters.tahunAjaranId ?? defaultYearId;

  return tagihan
    .filter((item) => {
      if (context === 'dibatalkan') return Boolean(item.deleted_at) || item.status === 'dibatalkan';
      if (context === 'semua') return true;
      return !item.deleted_at;
    })
    .map((item) => {
      const student = siswaMap.get(item.siswa_id) ?? null;
      const activeAssignment = activeAssignments.find((assignment) => assignment.siswa_id === item.siswa_id) ?? null;
      const activeClass = activeAssignment ? kelasMap.get(activeAssignment.kelas_id) ?? null : null;
      return {
        ...item,
        siswa: student,
        activeClass,
        remaining: Math.max(0, item.jumlah_total - item.sudah_dibayar),
      };
    })
    .filter((item) => {
      if (!item.siswa) {
        return false;
      }

      if (filters.siswaId && item.siswa_id !== filters.siswaId) {
        return false;
      }

      const itemYearId = item.tahun_ajaran_id || item.activeClass?.tahun_ajaran_id || item.siswa.tahun_ajaran_target_id;
      const activeYearId = activeYear?.id ?? '';

      if (context === 'aktif') {
        if (!activeYearId || itemYearId !== activeYearId) return false;
      } else if (context === 'tunggakan_lama') {
        if (item.status === 'lunas' || item.status === 'dibatalkan' || item.remaining <= 0) return false;
        if (activeYearId && itemYearId === activeYearId) return false;
        if (effectiveYearId && itemYearId !== effectiveYearId) return false;
      } else if (context === 'pendaftaran') {
        const jenis = item.jenis.toLowerCase();
        if (jenis !== 'pendaftaran' && jenis !== 'daftar_ulang') return false;
        if (effectiveYearId && itemYearId !== effectiveYearId) return false;
      } else if (context === 'semua') {
        if (effectiveYearId && itemYearId !== effectiveYearId) return false;
      } else if (context === 'dibatalkan') {
        if (effectiveYearId && itemYearId !== effectiveYearId) return false;
      }

      if (filters.bulanTahun) {
        const matchesBulanTahun = item.bulan_tahun === filters.bulanTahun;
        const matchesJatuhTempo = item.jatuh_tempo && item.jatuh_tempo.startsWith(filters.bulanTahun);
        if (!matchesBulanTahun && !matchesJatuhTempo) return false;
      }

      if (filters.kelasId && item.activeClass?.id !== filters.kelasId) {
        return false;
      }

      if (filters.jenis && item.jenis.toLowerCase() !== filters.jenis.toLowerCase()) {
        return false;
      }

      if (filters.status === 'dibatalkan') {
        if (!item.deleted_at && item.status !== 'dibatalkan') return false;
      } else if (filters.status) {
        const allowedStatuses = filters.status.split(',').map((status) => status.trim()).filter(Boolean);
        if (allowedStatuses.length > 0 && !allowedStatuses.includes(item.status)) return false;
      }

      if (filters.studentStatus) {
        const allowedStatuses = filters.studentStatus.split(',').map((s) => s.trim());
        if (!allowedStatuses.includes(item.siswa.status)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (context === 'tunggakan_lama') {
        return a.jatuh_tempo.localeCompare(b.jatuh_tempo);
      }
      return b.updated_at.localeCompare(a.updated_at);
    });
}
