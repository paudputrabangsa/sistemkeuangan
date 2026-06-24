import { db } from '../db';


export class ReferenceGeneratorService {
  /**
   * Mendapatkan tahun ajaran string untuk keperluan format referensi
   * Contoh: "2025/2026" -> "2526"
   */
  static getTahunAjaranSingkat(namaTahunAjaran: string): string {
    const parts = namaTahunAjaran.split('/');
    if (parts.length === 2) {
      const year1 = parts[0].slice(-2);
      const year2 = parts[1].slice(-2);
      return `${year1}${year2}`;
    }
    return '';
  }

  /**
   * Men-generate Nomor Pendaftaran untuk calon siswa baru.
   * Format: REG-[TahunAjaran]-[Urut 4 digit]
   * Contoh: REG-2526-0001
   */
  static async generateNoPendaftaran(tahunAjaranId: string): Promise<string> {
    const ta = await db.tahun_ajaran.get(tahunAjaranId);
    if (!ta) throw new Error('Tahun ajaran tidak ditemukan');

    const taString = this.getTahunAjaranSingkat(ta.nama);
    const prefix = `REG-${taString}-`;

    const lastSiswa = await db.siswa
      .filter((s) => !!s.no_pendaftaran && s.no_pendaftaran.startsWith(prefix))
      .toArray();

    let maxUrut = 0;
    for (const siswa of lastSiswa) {
      if (siswa.no_pendaftaran) {
        const urutStr = siswa.no_pendaftaran.split('-').pop();
        if (urutStr) {
          const urut = parseInt(urutStr, 10);
          if (!isNaN(urut) && urut > maxUrut) {
            maxUrut = urut;
          }
        }
      }
    }

    const nextUrut = String(maxUrut + 1).padStart(4, '0');
    return `${prefix}${nextUrut}`;
  }

  /**
   * Men-generate NIS untuk siswa aktif.
   * Format: [TahunAjaran][Urut 3 digit]
   * Contoh: 2526001
   */
  static async generateNIS(tahunAjaranId: string): Promise<string> {
    const ta = await db.tahun_ajaran.get(tahunAjaranId);
    if (!ta) throw new Error('Tahun ajaran tidak ditemukan');

    const taString = this.getTahunAjaranSingkat(ta.nama);

    const lastSiswa = await db.siswa
      .filter((s) => !!s.nis && s.nis.startsWith(taString))
      .toArray();

    let maxUrut = 0;
    for (const siswa of lastSiswa) {
      if (siswa.nis) {
        const urutStr = siswa.nis.substring(taString.length);
        if (urutStr) {
          const urut = parseInt(urutStr, 10);
          if (!isNaN(urut) && urut > maxUrut) {
            maxUrut = urut;
          }
        }
      }
    }

    const nextUrut = String(maxUrut + 1).padStart(3, '0');
    return `${taString}${nextUrut}`;
  }

  /**
   * Men-generate Nomor Tagihan (Invoice).
   * Format: INV-[TahunAjaran]-[Bulan]-[Urut 4 digit]
   * Contoh: INV-2526-06-0001
   */
  static async generateNoTagihan(tahunAjaranId: string, bulan: string = new Date().getMonth() + 1 + ''): Promise<string> {
    const ta = await db.tahun_ajaran.get(tahunAjaranId);
    if (!ta) throw new Error('Tahun ajaran tidak ditemukan');

    const taString = this.getTahunAjaranSingkat(ta.nama);
    const bulanStr = String(bulan).padStart(2, '0');
    const prefix = `INV-${taString}-${bulanStr}-`;

    const lastTagihan = await db.tagihan
      .filter((t) => !!t.no_referensi && t.no_referensi.startsWith(prefix))
      .toArray();

    let maxUrut = 0;
    for (const tagihan of lastTagihan) {
      if (tagihan.no_referensi) {
        const urutStr = tagihan.no_referensi.split('-').pop();
        if (urutStr) {
          const urut = parseInt(urutStr, 10);
          if (!isNaN(urut) && urut > maxUrut) {
            maxUrut = urut;
          }
        }
      }
    }

    const nextUrut = String(maxUrut + 1).padStart(4, '0');
    return `${prefix}${nextUrut}`;
  }

  /**
   * Men-generate Nomor Kuitansi Pembayaran.
   * Format: KWT-[TahunAjaran]-[Bulan]-[Urut 4 digit]
   * Contoh: KWT-2526-06-0001
   */
  static async generateNoKuitansi(tahunAjaranId: string, bulan: string = new Date().getMonth() + 1 + ''): Promise<string> {
    const ta = await db.tahun_ajaran.get(tahunAjaranId);
    if (!ta) throw new Error('Tahun ajaran tidak ditemukan');

    const settingKode = await db.pengaturan.where('kunci').equals('kode_perangkat').first();
    const kodePerangkat = settingKode?.nilai?.kode || '001';

    const taString = this.getTahunAjaranSingkat(ta.nama);
    const bulanStr = String(bulan).padStart(2, '0');
    const prefix = `KWT-${kodePerangkat}-${taString}-${bulanStr}-`;

    const lastPembayaran = await db.pembayaran
      .filter((p) => !!p.no_kuitansi && p.no_kuitansi.startsWith(prefix))
      .toArray();

    let maxUrut = 0;
    for (const bayar of lastPembayaran) {
      if (bayar.no_kuitansi) {
        const urutStr = bayar.no_kuitansi.split('-').pop();
        if (urutStr) {
          const urut = parseInt(urutStr, 10);
          if (!isNaN(urut) && urut > maxUrut) {
            maxUrut = urut;
          }
        }
      }
    }

    const nextUrut = String(maxUrut + 1).padStart(4, '0');
    return `${prefix}${nextUrut}`;
  }
}
