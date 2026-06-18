import { db } from '../db';

interface PembayaranFilters {
  siswaId?: string;
  fromDate?: string;
  toDate?: string;
  tahunAjaranId?: string;
}

export async function listPembayaranWithFilters(filters: PembayaranFilters = {}) {
  const allYears = (await db.tahun_ajaran.toArray()).filter((item) => !item.deleted_at);
  const [pembayaran, tagihan, siswa, kelas, assignments] = await Promise.all([
    db.pembayaran.toArray(),
    db.tagihan.toArray(),
    db.siswa.toArray(),
    db.kelas.toArray(),
    db.siswa_kelas.toArray(),
  ]);

  const tagihanMap = new Map(tagihan.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const siswaMap = new Map(siswa.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const kelasMap = new Map(kelas.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const activeAssignments = assignments.filter((item) => !item.selesai);
  let effectiveYearIds: string[] = [];
  if (filters.tahunAjaranId === 'all') {
    effectiveYearIds = [];
  } else if (filters.tahunAjaranId) {
    effectiveYearIds = [filters.tahunAjaranId];
  } else {
    effectiveYearIds = allYears
      .filter((y) => y.status === 'aktif' || y.status === 'draft')
      .map((y) => y.id);
  }

  return pembayaran
    .map((item) => {
      const parentTagihan = tagihanMap.get(item.tagihan_id);
      const parentSiswa = parentTagihan ? siswaMap.get(parentTagihan.siswa_id) : null;
      const activeAssignment = parentSiswa ? activeAssignments.find((assignment) => assignment.siswa_id === parentSiswa.id) ?? null : null;
      const activeClass = activeAssignment ? kelasMap.get(activeAssignment.kelas_id) ?? null : null;
      return {
        ...item,
        tagihan: parentTagihan ?? null,
        siswa: parentSiswa ?? null,
        activeClass,
      };
    })
    .filter((item) => {
      if (!item.tagihan || !item.siswa) {
        return false;
      }

      if (filters.siswaId && item.siswa.id !== filters.siswaId) {
        return false;
      }

      if (effectiveYearIds.length > 0) {
        const itemYearId = item.tagihan.tahun_ajaran_id || item.activeClass?.tahun_ajaran_id || item.siswa.tahun_ajaran_target_id;
        if (!effectiveYearIds.includes(itemYearId)) {
          return false;
        }
      }

      if (filters.fromDate && item.tanggal < filters.fromDate) {
        return false;
      }

      if (filters.toDate && item.tanggal > filters.toDate) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const dateCmp = b.tanggal.localeCompare(a.tanggal);
      if (dateCmp !== 0) return dateCmp;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
}
