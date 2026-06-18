import { db } from '../db';

export async function getDashboardSummary() {
  const [siswa, tagihan, pembayaran, syncQueue, kelas, assignments, tahunAjaran] = await Promise.all([
    db.siswa.toArray(),
    db.tagihan.toArray(),
    db.pembayaran.toArray(),
    db.sync_queue.toArray(),
    db.kelas.toArray(),
    db.siswa_kelas.toArray(),
    db.tahun_ajaran.toArray(),
  ]);

  const activeYear = tahunAjaran.find((item) => !item.deleted_at && item.aktif) ?? null;
  const kelasMap = new Map(kelas.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const activeAssignments = assignments.filter((item) => !item.selesai);
  const siswaMap = new Map(siswa.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const tagihanMap = new Map(tagihan.filter((item) => !item.deleted_at).map((item) => [item.id, item]));

  const activeStudents = siswa.filter((item) => !item.deleted_at && item.status === 'aktif').length;
  const calonStudents = siswa.filter((item) => !item.deleted_at && item.status === 'calon').length;

  const activeSiswaIds = new Set(siswa.filter((item) => !item.deleted_at && item.status === 'aktif').map((item) => item.id));
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

  const paidThisMonth = pembayaran
    .filter((item) => !item.deleted_at && (item.status_verifikasi ?? 'terverifikasi') === 'terverifikasi' && item.tanggal >= monthStart && item.tanggal <= monthEnd)
    .reduce((total, item) => total + item.jumlah, 0);

  const activeYearId = activeYear?.id ?? '';

  let currentYearOutstanding = 0;
  let oldYearOutstanding = 0;
  for (const item of tagihan) {
    if (item.deleted_at) continue;
    if (!activeSiswaIds.has(item.siswa_id)) continue;
    const sisa = Math.max(0, item.jumlah_total - item.sudah_dibayar);
    if (sisa <= 0) continue;
    if (item.tahun_ajaran_id === activeYearId) {
      currentYearOutstanding += sisa;
    } else {
      oldYearOutstanding += sisa;
    }
  }

  const unpaidOldStudents = new Set(
    tagihan.filter((item) => 
      !item.deleted_at && 
      item.status !== 'lunas' && 
      item.tahun_ajaran_id !== activeYearId &&
      activeSiswaIds.has(item.siswa_id) &&
      Math.max(0, item.jumlah_total - item.sudah_dibayar) > 0
    ).map((item) => item.siswa_id)
  ).size;

  const unpaidStudents = new Set(
    tagihan.filter((item) => !item.deleted_at && item.status !== 'lunas' && activeSiswaIds.has(item.siswa_id)).map((item) => item.siswa_id),
  ).size;

  const recentPayments = pembayaran
    .filter((item) => !item.deleted_at)
    .sort((a, b) => `${b.tanggal}${b.created_at}`.localeCompare(`${a.tanggal}${a.created_at}`))
    .slice(0, 5)
    .map((item) => {
      const relatedTagihan = tagihanMap.get(item.tagihan_id) ?? null;
      const relatedSiswa = relatedTagihan ? siswaMap.get(relatedTagihan.siswa_id) ?? null : null;
      const activeAssignment = relatedSiswa ? activeAssignments.find((assignment) => assignment.siswa_id === relatedSiswa.id) ?? null : null;
      const activeClass = activeAssignment ? kelasMap.get(activeAssignment.kelas_id) ?? null : null;

      return {
        ...item,
        tagihan: relatedTagihan,
        siswa: relatedSiswa,
        activeClass,
      };
    })
    .filter((item) => item.tagihan && item.siswa);

  return {
    activeStudents,
    calonStudents,
    currentYearOutstanding,
    oldYearOutstanding,
    paidThisMonth,
    unpaidStudents,
    unpaidOldStudents,
    pendingSyncCount: syncQueue.length,
    activeYear,
    recentPayments,
  };
}
