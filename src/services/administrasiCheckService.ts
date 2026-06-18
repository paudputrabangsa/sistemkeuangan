import { db } from '../db';
import type { Siswa } from '../db/types';

export interface AdministrasiIssue {
  siswa: Siswa;
  tagihanPendaftaranLunas: boolean;
  tagihanDaftarUlang?: { jumlah: number; lunas: boolean } | null;
  tunggakanLainnya: Array<{ id: string; nama: string; sisa: number }>;
  totalTunggakan: number;
}

export async function checkAdministrasiMasalah(targetYearId: string): Promise<AdministrasiIssue[]> {
  const [allSiswa, allTagihan] = await Promise.all([
    db.siswa.toArray(),
    db.tagihan.toArray(),
  ]);

  // Siswa yang relevan: siswa aktif (akan naik kelas/diaktivasi) atau calon siswa dengan target TA ini
  const siswaRelevan = allSiswa.filter(
    (s) => !s.deleted_at && (s.status === 'aktif' || (s.status === 'calon' && s.tahun_ajaran_target_id === targetYearId))
  );

  const issues: AdministrasiIssue[] = [];

  for (const siswa of siswaRelevan) {
    const tagihanSiswa = allTagihan.filter((t) => !t.deleted_at && t.siswa_id === siswa.id);

    // Cek pendaftaran (khusus calon, tapi kita cek saja semuanya)
    const tagihanPendaftaran = tagihanSiswa.filter((t) => t.jenis === 'pendaftaran');
    const pendaftaranLunas = tagihanPendaftaran.length === 0 || tagihanPendaftaran.every((t) => t.status === 'lunas');

    // Cek daftar ulang
    const tagihanDaftarUlang = tagihanSiswa.find((t) => t.jenis === 'daftar_ulang' || t.jenis === 'Daftar Ulang');
    const daftarUlangInfo = tagihanDaftarUlang
      ? { jumlah: tagihanDaftarUlang.jumlah_total, lunas: tagihanDaftarUlang.status === 'lunas' }
      : null;

    // Cek tunggakan lainnya (SPP, dll)
    const tunggakanTagihan = tagihanSiswa.filter(
      (t) => t.status !== 'lunas' && t.jenis !== 'pendaftaran' && t.jenis !== 'daftar_ulang' && t.jenis !== 'Daftar Ulang'
    );
    const tunggakanLainnya = tunggakanTagihan.map((t) => {
      const sisa = t.jumlah_total - t.sudah_dibayar;
      return { id: t.id, nama: t.nama_tagihan, sisa: Math.max(0, sisa) };
    }).filter(t => t.sisa > 0);

    let totalTunggakan = 0;
    if (tagihanDaftarUlang && tagihanDaftarUlang.status !== 'lunas') {
      totalTunggakan += (tagihanDaftarUlang.jumlah_total - tagihanDaftarUlang.sudah_dibayar);
    }
    for (const t of tunggakanLainnya) {
      totalTunggakan += t.sisa;
    }
    // Pendaftaran tidak selalu punya "sisa" jika tidak lunas, tapi kita bisa hitung
    const tagihanPendaftaranBelumLunas = tagihanPendaftaran.filter(t => t.status !== 'lunas');
    for (const t of tagihanPendaftaranBelumLunas) {
      totalTunggakan += (t.jumlah_total - t.sudah_dibayar);
    }

    // Jika ada masalah (belum lunas pendaftaran, daftar ulang, atau ada tunggakan lain)
    if (!pendaftaranLunas || (daftarUlangInfo && !daftarUlangInfo.lunas) || tunggakanLainnya.length > 0) {
      issues.push({
        siswa,
        tagihanPendaftaranLunas: pendaftaranLunas,
        tagihanDaftarUlang: daftarUlangInfo,
        tunggakanLainnya,
        totalTunggakan,
      });
    }
  }

  return issues;
}
