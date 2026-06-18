import { db } from '../db';

export async function listActiveKelas() {
  const [kelas, assignments] = await Promise.all([db.kelas.toArray(), db.siswa_kelas.toArray()]);

  return kelas
    .filter((item) => !item.deleted_at)
    .map((item) => ({
      ...item,
      activeStudentCount: assignments.filter((assignment) => assignment.kelas_id === item.id && !assignment.selesai).length,
    }))
    .sort((a, b) => a.nama_kelas.localeCompare(b.nama_kelas));
}
