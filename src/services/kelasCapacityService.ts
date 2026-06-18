import { db } from '../db';
import { ValidationError } from './service-errors';

export async function getActiveStudentCountByKelas(kelasId: string, excludeSiswaId?: string | null) {
  const assignments = await db.siswa_kelas.where('kelas_id').equals(kelasId).toArray();
  return assignments.filter((item) => !item.selesai && item.siswa_id !== excludeSiswaId).length;
}

export async function assertKelasHasCapacity(kelasId: string, additionalStudents = 1, excludeSiswaId?: string | null) {
  const kelas = await db.kelas.get(kelasId);
  if (!kelas || kelas.deleted_at || !kelas.kapasitas_siswa) {
    return;
  }

  const currentCount = await getActiveStudentCountByKelas(kelasId, excludeSiswaId);
  if (currentCount + additionalStudents > kelas.kapasitas_siswa) {
    throw new ValidationError(`Kelas ${kelas.nama_kelas} sudah mencapai kapasitas ${kelas.kapasitas_siswa} siswa.`);
  }
}

export async function hasKelasCapacity(kelasId: string, additionalStudents = 1, excludeSiswaId?: string | null) {
  const kelas = await db.kelas.get(kelasId);
  if (!kelas || kelas.deleted_at || !kelas.kapasitas_siswa) {
    return true;
  }

  const currentCount = await getActiveStudentCountByKelas(kelasId, excludeSiswaId);
  return currentCount + additionalStudents <= kelas.kapasitas_siswa;
}

export async function assertBatchKelasCapacity(assignments: Array<{ kelasId: string; siswaId?: string | null }>) {
  const grouped = new Map<string, Array<string | null | undefined>>();
  for (const item of assignments) {
    grouped.set(item.kelasId, [...(grouped.get(item.kelasId) ?? []), item.siswaId]);
  }

  for (const [kelasId, siswaIds] of grouped.entries()) {
    const kelas = await db.kelas.get(kelasId);
    if (!kelas || kelas.deleted_at || !kelas.kapasitas_siswa) {
      continue;
    }

    const activeAssignments = await db.siswa_kelas.where('kelas_id').equals(kelasId).toArray();
    const incomingSiswaIds = new Set(siswaIds.filter(Boolean));
    const currentCount = activeAssignments.filter((item) => !item.selesai && !incomingSiswaIds.has(item.siswa_id)).length;

    if (currentCount + siswaIds.length > kelas.kapasitas_siswa) {
      throw new ValidationError(`Kelas ${kelas.nama_kelas} hanya memiliki sisa ${Math.max(kelas.kapasitas_siswa - currentCount, 0)} kursi, tetapi akan diisi ${siswaIds.length} siswa.`);
    }
  }
}
