import { db } from '../db';
import type { Tagihan } from '../db/types';
import { ReferenceGeneratorService } from './referenceGeneratorService';
import { getPromoValue } from '../lib/promoHelper';
import { monthKeyFromDate } from './service-helpers';

export class BatchGenerateTagihanService {
  /**
   * Men-generate tagihan SPP bulanan untuk semua siswa aktif dalam suatu kelas/tahun ajaran.
   *
   * @param tahunAjaranId ID Tahun Ajaran aktif
   * @param bulanTahunArray Array format YYYY-MM
   * @param adminId ID Akun admin pembuat
   * @param tanggalJatuhTempo Tanggal jatuh tempo (1-31) setiap bulannya
   * @param overrideJumlah Jika ingin mengoverride tarif SPP standar dengan jumlah tertentu
   */
  static async generateSPPMassal(
    tahunAjaranId: string,
    bulanTahunArray: string[],
    adminId: string,
    tanggalJatuhTempo: number = 10,
    overrideJumlah?: number
  ): Promise<{ success: number; skipped: number; errors: number }> {
    let success = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const year = await db.tahun_ajaran.get(tahunAjaranId);
      if (!year || year.deleted_at) throw new Error('Tahun ajaran tidak ditemukan.');
      if (year.status === 'draft') throw new Error('Generate SPP massal tidak dapat dilakukan pada tahun ajaran draft.');
      if (year.status === 'arsip') throw new Error('Generate SPP massal tidak dapat dilakukan pada tahun ajaran arsip.');

      const yearStartMonth = monthKeyFromDate(year.mulai);
      const yearEndMonth = monthKeyFromDate(year.selesai);
      for (const bulan of bulanTahunArray) {
        if (bulan < yearStartMonth || bulan > yearEndMonth) {
          throw new Error(`Bulan ${bulan} berada di luar periode tahun ajaran ${year.nama}. Generate SPP hanya bisa dilakukan antara ${yearStartMonth} sampai ${yearEndMonth}.`);
        }
      }

      const diskonPengaturan = await db.pengaturan.where({ kunci: 'diskon' }).first();
      const allPromos = (diskonPengaturan?.nilai || []) as any[];

      const siswaAktif = await db.siswa
        .filter((s) => s.status === 'aktif' && !s.deleted_at)
        .toArray();

      for (const siswa of siswaAktif) {
        // Cari kelas aktif siswa sekali saja per siswa
        const sk = await db.siswa_kelas
          .where({ siswa_id: siswa.id })
          .filter((k) => !k.selesai)
          .first();

        let baseJumlahSpp = overrideJumlah ?? 0;
        if (overrideJumlah === undefined) {
          if (siswa.tarif_spp_khusus) {
            baseJumlahSpp = siswa.tarif_spp_khusus;
          } else {
            if (sk) {
              const kelas = await db.kelas.get(sk.kelas_id);
              baseJumlahSpp = kelas ? kelas.tarif_spp : 0;
            }
            if (siswa.flag_diskon_spp && siswa.nominal_diskon_spp !== undefined) {
              baseJumlahSpp = siswa.nominal_diskon_spp;
            }
          }
        }

        const siswaTagihanHistory = await db.tagihan.where({ siswa_id: siswa.id }).toArray();
        const sessionPromoUsageCount = new Map<string, number>();

        for (const bulanTahun of bulanTahunArray) {
          try {
            // Cek apakah tagihan SPP untuk bulan ini sudah ada
            const existing = await db.tagihan
              .where({ siswa_id: siswa.id, bulan_tahun: bulanTahun })
              .filter((t) => t.jenis === 'spp' && !t.deleted_at)
              .first();

            if (existing) {
              skipped++;
              continue;
            }

            let promoDiscounts = 0;
            let usedPromoNames = new Set<string>();
            const usedPromoIds = new Set<string>();

            if (siswa.daftar_promo && siswa.daftar_promo.length > 0) {
               const promosToApply = allPromos.filter(p => {
                  if (!siswa.daftar_promo!.includes(p.id)) return false;
                  if (!p.aktif) return false;
                  if (!p.target_jenis_tagihan?.includes('spp') && !p.target_jenis_tagihan?.includes('semua') && p.jenis_tagihan !== 'spp' && p.jenis_tagihan !== 'semua') return false;
                  
                  let historyCount = siswaTagihanHistory.filter(t => t.promo_ids?.includes(p.id) || t.nama_promo?.includes(p.nama)).length;
                  let sessionCount = sessionPromoUsageCount.get(p.id) || 0;
                  let totalUsage = historyCount + sessionCount;

                  if (p.batas_kali_penggunaan && totalUsage >= p.batas_kali_penggunaan) return false;
                  if (!p.berulang && totalUsage >= 1) return false;

                  return true;
               });
               for (const p of promosToApply) {
                  usedPromoNames.add(p.nama);
                  usedPromoIds.add(p.id);
                  const promoVal = getPromoValue(p, 'spp');
                  if (promoVal.tipe_diskon === 'nominal') {
                      promoDiscounts += Number(promoVal.nominal_diskon) || 0;
                  } else {
                      promoDiscounts += (baseJumlahSpp * ((Number(promoVal.persen_diskon) || 0) / 100));
                  }
                  sessionPromoUsageCount.set(p.id, (sessionPromoUsageCount.get(p.id) || 0) + 1);
               }
            }

            const bulan = bulanTahun.split('-')[1];
            const noRef = await ReferenceGeneratorService.generateNoTagihan(tahunAjaranId, bulan);
            const padTanggal = String(tanggalJatuhTempo).padStart(2, '0');

            const tagihanBaru: Tagihan = {
              id: crypto.randomUUID(),
              siswa_id: siswa.id,
              tahun_ajaran_id: tahunAjaranId,
              jenis: 'spp',
              nama_tagihan: `SPP ${bulanTahun}`,
              jumlah_total: Math.max(0, baseJumlahSpp - promoDiscounts),
              sudah_dibayar: 0,
              jatuh_tempo: `${bulanTahun}-${padTanggal}`,
              status: 'belum_bayar',
              bisa_cicil: false,
              bulan_tahun: bulanTahun,
              potongan_diskon: promoDiscounts,
              nama_promo: usedPromoNames.size > 0 ? Array.from(usedPromoNames).join(', ') : null,
              promo_ids: usedPromoIds.size > 0 ? Array.from(usedPromoIds) : null,
              created_by: adminId,
              no_referensi: noRef,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };

            await db.tagihan.add(tagihanBaru);
            success++;
          } catch (err) {
            console.error(`Gagal generate SPP untuk siswa ${siswa.id} bulan ${bulanTahun}`, err);
            errors++;
          }
        }
      }
    } catch (err) {
      console.error('Error saat generate SPP massal:', err);
      throw err;
    }

    return { success, skipped, errors };
  }
}
