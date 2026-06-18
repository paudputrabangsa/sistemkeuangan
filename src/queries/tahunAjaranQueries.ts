import { db } from '../db';

export async function listTahunAjaran() {
  const tahunAjaran = await db.tahun_ajaran.toArray();
  return tahunAjaran
    .filter((item) => !item.deleted_at)
    .sort((a, b) => b.mulai.localeCompare(a.mulai));
}

export async function getTahunAjaranSummary(tahunAjaranId: string) {
  const [tahunAjaran, kelas, siswa, siswaKelas, tagihan, pembayaran] = await Promise.all([
    db.tahun_ajaran.get(tahunAjaranId),
    db.kelas.toArray(),
    db.siswa.toArray(),
    db.siswa_kelas.toArray(),
    db.tagihan.toArray(),
    db.pembayaran.toArray(),
  ]);

  if (!tahunAjaran || tahunAjaran.deleted_at) {
    return null;
  }

  const kelasPeriode = kelas.filter((item) => !item.deleted_at && item.tahun_ajaran_id === tahunAjaranId);
  const kelasIds = new Set(kelasPeriode.map((item) => item.id));
  const siswaIdsFromAssignments = new Set(
    siswaKelas
      .filter((item) => kelasIds.has(item.kelas_id))
      .map((item) => item.siswa_id),
  );
  const siswaPeriode = siswa.filter((item) => !item.deleted_at && (item.tahun_ajaran_target_id === tahunAjaranId || siswaIdsFromAssignments.has(item.id)));
  const activeSiswaIds = new Set(siswa.filter(s => !s.deleted_at).map(s => s.id));
  const tagihanPeriode = tagihan.filter((item) => 
    !item.deleted_at && 
    item.status !== 'dibatalkan' && 
    item.tahun_ajaran_id === tahunAjaranId &&
    activeSiswaIds.has(item.siswa_id)
  );
  const tagihanIds = new Set(tagihanPeriode.map((item) => item.id));
  const pembayaranPeriode = pembayaran.filter((item) => !item.deleted_at && tagihanIds.has(item.tagihan_id));

  const totalTagihan = tagihanPeriode.reduce((total, item) => total + item.jumlah_total, 0);
  const totalTerbayar = tagihanPeriode.reduce((total, item) => total + item.sudah_dibayar, 0);
  
  // Hitung sisa tagihan per item seperti di TagihanPage.
  // PENTING: Jika statusnya 'lunas', sisa tagihannya WAJIB 0, terlepas dari apakah field sudah_dibayar-nya sinkron atau belum.
  const totalTunggakan = tagihanPeriode.reduce((total, item) => {
    if (item.status === 'lunas') return total;
    return total + Math.max(0, item.jumlah_total - item.sudah_dibayar);
  }, 0);

  return {
    tahunAjaran,
    jumlahKelas: kelasPeriode.length,
    jumlahSiswa: siswaPeriode.length,
    jumlahSiswaAktif: siswaPeriode.filter((item) => item.status === 'aktif').length,
    jumlahSiswaLulus: siswaPeriode.filter((item) => item.status === 'lulus').length,
    jumlahSiswaBerhenti: siswaPeriode.filter((item) => item.status === 'berhenti' || item.status === 'batal_daftar').length,
    jumlahSiswaCalon: siswaPeriode.filter((item) => item.status === 'calon').length,
    jumlahTagihan: tagihanPeriode.length,
    jumlahPembayaran: pembayaranPeriode.length,
    totalTagihan,
    totalTerbayar,
    totalTunggakan,
  };
}
