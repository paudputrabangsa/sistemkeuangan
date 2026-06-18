import { db } from '../db';
import type { Kelas, Siswa, SiswaKelas } from '../db/types';
import { NotFoundError, ValidationError } from './service-errors';
import { assertKelasHasCapacity, hasKelasCapacity } from './kelasCapacityService';
import {
  calculateAgeInYears,
  enqueueSync,
  getTahunAjaranCutoffDate,
  newId,
  nowIso,
  toPendingInsert,
  toPendingUpdate,
  todayDate,
  type ServiceActor,
} from './service-helpers';
import { getPengaturanPendaftaranByTahunAjaran } from './pendaftaranTahunAjaranService';
import { getPenempatanSiswaBaruSetting } from './placementService';

export interface ActivationPreviewItem {
  siswa: Siswa;
  statusAktivasi: 'aktif' | 'calon' | 'warning';
  kelasRencana?: Kelas | null;
  tagihanPendaftaranLunas: boolean;
  tagihanDaftarUlang?: { jumlah: number; lunas: boolean } | null;
  tunggakan: Array<{ id: string; nama: string; sisa: number }>;
  tarifLama?: number;
  tarifBaru: number;
  hasPromo: boolean;
  promoList: string[];
  pesan: string[];
}

export interface ActivationDecision {
  siswaId: string;
  kelasOverrideId?: string | null;
  hapusPromo: boolean;
  action?: 'aktif' | 'berhenti' | 'batal_daftar'; // If set, overrides the default activation logic
}

export interface ActivationPreviewResult {
  items: ActivationPreviewItem[];
  ringkasan: {
    akanAktif: number;
    tetapCalon: number;
    warning: number;
    tanpaKelas: number;
    kapasitasPenuh: number;
    promoBisaDihapus: number;
  };
}

export interface ActivationResult {
  activated: number;
  tetapCalon: number;
  warnings: string[];
}

async function findMatchingKelas(tahunAjaranId: string, usiaTahun: number) {
  const kelas = await db.kelas.where('tahun_ajaran_id').equals(tahunAjaranId).toArray();
  const candidates = kelas
    .filter((item) => !item.deleted_at && item.usia_min_tahun !== null && item.usia_min_tahun !== undefined && item.usia_max_tahun !== null && item.usia_max_tahun !== undefined)
    .sort((a, b) => (a.usia_min_tahun ?? 0) - (b.usia_min_tahun ?? 0))
    .filter((item) => usiaTahun >= (item.usia_min_tahun ?? 0) && usiaTahun <= (item.usia_max_tahun ?? 0));

  for (const item of candidates) {
    if (await hasKelasCapacity(item.id)) {
      return item;
    }
  }
  return null;
}

async function getCutoffSettingForTahunAjaran(tahunAjaranId: string) {
  const yearlySetting = await getPengaturanPendaftaranByTahunAjaran(tahunAjaranId);
  if (yearlySetting) {
    return { cutoff_bulan: yearlySetting.cutoff_bulan, cutoff_tanggal: yearlySetting.cutoff_tanggal };
  }
  return getPenempatanSiswaBaruSetting();
}

export async function getActivationPreview(tahunAjaranId: string): Promise<ActivationPreviewResult> {
  const tahunAjaran = await db.tahun_ajaran.get(tahunAjaranId);
  if (!tahunAjaran || tahunAjaran.deleted_at) throw new NotFoundError('Tahun ajaran tidak ditemukan.');
  if ((tahunAjaran.status ?? (tahunAjaran.aktif ? 'aktif' : 'draft')) !== 'draft') throw new ValidationError('Hanya tahun ajaran draft yang bisa diaktivasi.');

  const [allSiswa, allKelas, allAssignments, allTagihan] = await Promise.all([
    db.siswa.toArray(),
    db.kelas.toArray(),
    db.siswa_kelas.toArray(),
    db.tagihan.toArray(),
  ]);

  const siswaDiTA = allSiswa.filter((s) => !s.deleted_at && s.tahun_ajaran_target_id === tahunAjaranId);
  const kelasTA = allKelas.filter((k) => !k.deleted_at && k.tahun_ajaran_id === tahunAjaranId);
  const assignmentMap = new Map<string, SiswaKelas>();
  for (const a of allAssignments) {
    if (!a.selesai) assignmentMap.set(a.siswa_id, a);
  }

  const items: ActivationPreviewItem[] = [];
  let akanAktif = 0;
  let tetapCalon = 0;
  let warning = 0;
  let tanpaKelas = 0;
  let kapasitasPenuh = 0;
  let promoBisaDihapus = 0;

  for (const siswa of siswaDiTA) {
    const pesan: string[] = [];
    const tagihanSiswa = allTagihan.filter((t) => !t.deleted_at && t.siswa_id === siswa.id);

    // Cek pendaftaran
    const tagihanPendaftaran = tagihanSiswa.filter((t) => t.jenis === 'pendaftaran');
    const pendaftaranLunas = tagihanPendaftaran.length === 0 || tagihanPendaftaran.every((t) => t.status === 'lunas');

    // Cek daftar ulang
    const tagihanDaftarUlang = tagihanSiswa.find((t) => t.jenis === 'daftar_ulang' || t.jenis === 'Daftar Ulang');
    const daftarUlangInfo = tagihanDaftarUlang
      ? { jumlah: tagihanDaftarUlang.jumlah_total, lunas: tagihanDaftarUlang.status === 'lunas' }
      : null;
    if (daftarUlangInfo && !daftarUlangInfo.lunas) {
      pesan.push(`Tagihan daftar ulang belum lunas (${tagihanDaftarUlang!.nama_tagihan})`);
    }

    // Cek tunggakan lain
    const tunggakan = tagihanSiswa.filter((t) =>
      t.status !== 'lunas' &&
      t.jenis !== 'pendaftaran' &&
      t.jenis !== 'daftar_ulang' &&
      t.jenis !== 'Daftar Ulang'
    );
    for (const t of tunggakan) {
      const sisa = t.jumlah_total - t.sudah_dibayar;
      if (sisa > 0) pesan.push(`Tunggakan ${t.nama_tagihan}: Rp${sisa.toLocaleString()}`);
    }

    // Cek promo
    const hasPromo = !!siswa.daftar_promo && siswa.daftar_promo.length > 0;
    const promoList = siswa.daftar_promo || [];
    if (hasPromo) promoBisaDihapus++;

    // Cek kelas
    const activeAssignment = assignmentMap.get(siswa.id);
    let kelasRencana: Kelas | undefined;
    let tarifLama: number | undefined;
    let tarifBaru = 0;
    let kelasCapacityOk = true;

    if (siswa.status === 'aktif' || siswa.status === 'lulus' || siswa.status === 'berhenti') {
      // Siswa migrasi/aktif — cari assignment
      if (activeAssignment) {
        const currentKelas = allKelas.find((k) => k.id === activeAssignment.kelas_id && !k.deleted_at);
        if (currentKelas) {
          kelasRencana = currentKelas;
          tarifLama = siswa.flag_diskon_spp ? siswa.nominal_diskon_spp : currentKelas.tarif_spp;
          // Cek apakah kelas ini ada di TA tujuan
          if (currentKelas.tahun_ajaran_id !== tahunAjaranId) {
            // Kelas dari tahun lalu — cari kelas dengan tingkat yang sama di TA baru
            const sameTingkat = kelasTA.find((k) => k.tingkat === currentKelas.tingkat);
            if (sameTingkat) {
              kelasRencana = sameTingkat;
              if (!(await hasKelasCapacity(sameTingkat.id))) {
                kelasCapacityOk = false;
                kapasitasPenuh++;
                pesan.push(`Kelas ${sameTingkat.nama_kelas} penuh — siswa tetap diaktivasi tanpa kelas`);
              }
            } else {
              tanpaKelas++;
              pesan.push('Tidak ada kelas yang sesuai di tahun ajaran baru — perlu diatur manual');
            }
          }
        } else {
          tanpaKelas++;
          pesan.push('Belum memiliki kelas aktif');
        }
      } else {
        tanpaKelas++;
        pesan.push('Belum memiliki kelas aktif');
      }
    } else if (siswa.status === 'calon') {
      // Calon — cari kelas rencana
      if (siswa.kelas_rencana_id) {
        const planned = kelasTA.find((k) => k.id === siswa.kelas_rencana_id);
        if (planned) {
          kelasRencana = planned;
          if (!(await hasKelasCapacity(planned.id))) {
            kelasCapacityOk = false;
            kapasitasPenuh++;
            pesan.push(`Kelas rencana ${planned.nama_kelas} penuh`);
          }
        } else {
          tanpaKelas++;
          pesan.push('Kelas rencana tidak ditemukan di tahun ajaran ini');
        }
      } else if (siswa.tanggal_lahir) {
        // Auto placement
        const [setting, ta] = await Promise.all([
          getCutoffSettingForTahunAjaran(tahunAjaranId),
          db.tahun_ajaran.get(tahunAjaranId),
        ]);
        if (ta) {
          const cutoffDate = getTahunAjaranCutoffDate(ta, setting.cutoff_bulan, setting.cutoff_tanggal);
          const usia = calculateAgeInYears(siswa.tanggal_lahir, cutoffDate);
          const autoKelas = await findMatchingKelas(tahunAjaranId, usia);
          if (autoKelas) {
            kelasRencana = autoKelas;
          } else {
            tanpaKelas++;
            pesan.push('Tidak ada kelas sesuai umur — perlu diatur manual');
          }
        }
      } else {
        tanpaKelas++;
        pesan.push('Tanggal lahir tidak ada, tidak bisa menentukan kelas');
      }
      // Tarif untuk calon
      tarifBaru = kelasRencana?.tarif_spp ?? 0;
    }

    if (!tarifLama) tarifLama = kelasRencana?.tarif_spp ?? 0;
    if (!tarifBaru) tarifBaru = kelasRencana?.tarif_spp ?? 0;

    // Status aktivasi
    let statusAktivasi: 'aktif' | 'calon' | 'warning';
    if (siswa.status === 'calon') {
      if (pendaftaranLunas && kelasCapacityOk && kelasRencana) {
        statusAktivasi = 'aktif';
        akanAktif++;
      } else if (!pendaftaranLunas) {
        statusAktivasi = 'calon';
        tetapCalon++;
        pesan.push('Tagihan pendaftaran belum lunas');
      } else {
        statusAktivasi = 'warning';
        warning++;
      }
    } else if (siswa.status === 'aktif') {
      statusAktivasi = 'aktif';
      akanAktif++;
      if (pesan.length > 0) {
        statusAktivasi = 'warning';
        warning++;
        akanAktif--;
      }
    } else {
      statusAktivasi = 'calon';
      tetapCalon++;
    }

    const tunggakanList = tunggakan.map((t) => {
      const sisa = t.jumlah_total - t.sudah_dibayar;
      return { id: t.id, nama: t.nama_tagihan, sisa: Math.max(0, sisa) };
    });

    items.push({
      siswa,
      statusAktivasi,
      kelasRencana,
      tagihanPendaftaranLunas: pendaftaranLunas,
      tagihanDaftarUlang: daftarUlangInfo,
      tunggakan: tunggakanList,
      tarifLama,
      tarifBaru,
      hasPromo,
      promoList,
      pesan,
    });
  }

  return {
    items,
    ringkasan: { akanAktif, tetapCalon, warning, tanpaKelas, kapasitasPenuh, promoBisaDihapus },
  };
}

export async function executeActivation(
  _actor: ServiceActor,
  tahunAjaranId: string,
  toggleBawaTarif: boolean,
  decisions: ActivationDecision[]
): Promise<ActivationResult> {
  // Validate no active TA
  const activeOther = (await db.tahun_ajaran.toArray())
    .find((item) => item.id !== tahunAjaranId && !item.deleted_at && (item.aktif || item.status === 'aktif'));
  if (activeOther) {
    throw new ValidationError('Sudah ada tahun ajaran aktif. Gunakan Lanjut Tahun Ajaran untuk pergantian periode.');
  }

  const tahunAjaran = await db.tahun_ajaran.get(tahunAjaranId);
  if (!tahunAjaran || tahunAjaran.deleted_at) throw new NotFoundError('Tahun ajaran tidak ditemukan.');
  if ((tahunAjaran.status ?? (tahunAjaran.aktif ? 'aktif' : 'draft')) !== 'draft') {
    throw new ValidationError('Hanya tahun ajaran draft yang bisa diaktivasi.');
  }

  const decisionMap = new Map(decisions.map((d) => [d.siswaId, d]));
  const allSiswa = (await db.siswa.toArray()).filter((s) => !s.deleted_at && s.tahun_ajaran_target_id === tahunAjaranId);
  const allAssignments = await db.siswa_kelas.toArray();
  const now = nowIso();
  const today = todayDate();

  let activated = 0;
  let tetapCalon = 0;
  const warnings: string[] = [];
  const activatedSiswaIds: string[] = [];

  await db.transaction('rw', db.siswa, db.siswa_kelas, db.tahun_ajaran, db.sync_queue, async () => {
    // 1. Set TA aktif
    const updatedTA = toPendingUpdate(tahunAjaran, { aktif: true, status: 'aktif', updated_at: now });
    await db.tahun_ajaran.put(updatedTA);
    await enqueueSync('tahun_ajaran', updatedTA.id, 'update', updatedTA);

    // 2. Proses siswa
    for (const siswa of allSiswa) {
      const decision = decisionMap.get(siswa.id);

      if (decision?.action === 'berhenti' || decision?.action === 'batal_daftar') {
        const updated = toPendingUpdate(siswa, { status: decision.action, tanggal_keluar: today, updated_at: now });
        await db.siswa.put(updated);
        await enqueueSync('siswa', updated.id, 'update', updated);

        // Tutup assignment lama jika ada
        const oldAssignment = allAssignments.find((a) => a.siswa_id === siswa.id && !a.selesai);
        if (oldAssignment) {
          const closed = toPendingUpdate(oldAssignment, { selesai: today, status_akhir_periode: 'keluar', updated_at: now });
          await db.siswa_kelas.put(closed);
          await enqueueSync('siswa_kelas', closed.id, 'update', closed);
        }
        continue;
      }

      const shouldActivate = siswa.status === 'aktif' || (siswa.status === 'calon' && decision?.kelasOverrideId);
      if (!shouldActivate && siswa.status === 'calon') {
        tetapCalon++;
        continue;
      }

      // Cari kelas tujuan
      let kelasTujuanId = decision?.kelasOverrideId || null;
      if (!kelasTujuanId) {
        if (siswa.status === 'aktif') {
          const activeAssignment = allAssignments.find((a) => a.siswa_id === siswa.id && !a.selesai);
          if (activeAssignment) {
            const kelasLama = await db.kelas.get(activeAssignment.kelas_id);
            if (kelasLama && kelasLama.tahun_ajaran_id === tahunAjaranId) {
              kelasTujuanId = kelasLama.id;
            } else if (kelasLama) {
              const sameTingkat = await db.kelas
                .where('tahun_ajaran_id').equals(tahunAjaranId)
                .and((k) => !k.deleted_at && k.tingkat === kelasLama.tingkat)
                .first();
              if (sameTingkat) {
                kelasTujuanId = sameTingkat.id;
              }
            }
          }
        } else if (siswa.status === 'calon' && siswa.kelas_rencana_id) {
          kelasTujuanId = siswa.kelas_rencana_id;
        }
      }

      if (!kelasTujuanId) {
        warnings.push(`Siswa ${siswa.nama} tidak memiliki kelas — perlu diatur manual`);
        // tetap aktifkan tanpa kelas
        const updated = toPendingUpdate(siswa, { status: 'aktif', updated_at: now });
        await db.siswa.put(updated);
        await enqueueSync('siswa', updated.id, 'update', updated);
        activatedSiswaIds.push(siswa.id);
        activated++;
        continue;
      }

      // Validasi kapasitas
      try {
        await assertKelasHasCapacity(kelasTujuanId, 1, siswa.id);
      } catch {
        warnings.push(`Kelas ${(await db.kelas.get(kelasTujuanId))?.nama_kelas ?? '-'} penuh untuk ${siswa.nama}`);
        const updated = toPendingUpdate(siswa, { status: 'aktif', updated_at: now });
        await db.siswa.put(updated);
        await enqueueSync('siswa', updated.id, 'update', updated);
        activatedSiswaIds.push(siswa.id);
        activated++;
        continue;
      }

      // Tutup assignment lama jika ada
      const oldAssignment = allAssignments.find((a) => a.siswa_id === siswa.id && !a.selesai);
      if (oldAssignment) {
        const closed = toPendingUpdate(oldAssignment, { selesai: today, status_akhir_periode: 'naik_kelas', updated_at: now });
        await db.siswa_kelas.put(closed);
        await enqueueSync('siswa_kelas', closed.id, 'update', closed);
      }

      // Buat assignment baru
      const newAssignment = toPendingInsert<SiswaKelas>({
        id: newId(),
        siswa_id: siswa.id,
        kelas_id: kelasTujuanId,
        mulai: today,
        selesai: null,
        penempatan_sumber: 'otomatis',
        catatan_penempatan: 'Aktivasi tahun ajaran',
        status_akhir_periode: null,
        created_at: now,
        updated_at: now,
      });
      await db.siswa_kelas.add(newAssignment);
      await enqueueSync('siswa_kelas', newAssignment.id, 'insert', newAssignment);

      // Update siswa
      const tarifLama = siswa.flag_diskon_spp ? siswa.nominal_diskon_spp : (await db.kelas.get(kelasTujuanId))?.tarif_spp ?? 0;
      const updateSiswa: Partial<Siswa> = {
        status: 'aktif',
        tahun_ajaran_target_id: tahunAjaranId,
        updated_at: now,
      };

      if (toggleBawaTarif) {
        if (siswa.flag_diskon_spp) {
          // Diemin — pertahankan tarif khusus existing
        } else {
          // Simpan tarif kelas saat ini sebagai tarif khusus
          updateSiswa.flag_diskon_spp = true;
          updateSiswa.nominal_diskon_spp = tarifLama;
          updateSiswa.persen_diskon = 0;
        }
      } else {
        updateSiswa.flag_diskon_spp = false;
        updateSiswa.nominal_diskon_spp = 0;
        updateSiswa.persen_diskon = 0;
      }

      // Hapus promo jika diminta
      if (decision?.hapusPromo) {
        updateSiswa.daftar_promo = [];
      }

      const updatedSiswa = toPendingUpdate(siswa, updateSiswa);
      await db.siswa.put(updatedSiswa);
      await enqueueSync('siswa', updatedSiswa.id, 'update', updatedSiswa);
      activatedSiswaIds.push(siswa.id);
      activated++;
    }
  });

  if (activatedSiswaIds.length > 0) {
    // Jalan auto-placement untuk calon yang diaktifkan
    const { runAutoPlacementForTahunAjaran } = await import('./placementService');
    await runAutoPlacementForTahunAjaran(tahunAjaranId);
  }

  return { activated, tetapCalon, warnings };
}
