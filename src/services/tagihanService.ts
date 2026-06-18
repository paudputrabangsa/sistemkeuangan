import { db } from '../db';
import type { Siswa, Tagihan, TahunAjaran } from '../db/types';
import { assertCanAccess } from './permissionService';
import { NotFoundError, ValidationError } from './service-errors';
import {
  enqueueSync,
  formatSppName,
  getActiveSiswaKelasBySiswaId,
  getSppEffectiveStartMonth,
  monthKeyFromDate,
  newId,
  nowIso,
  startOfMonth,
  toPendingInsert,
  toPendingUpdate,
  type ServiceActor,
} from './service-helpers';
import type { SppGenerateCutoffSetting } from '../db/types';
import { assertSiswaPeriodNotArchived, assertTagihanPeriodNotArchived } from './tahunAjaranLockService';
import { catatAuditLog } from './auditLogService';
import { getPromoValue } from '../lib/promoHelper';

export interface GenerateSppInput {
  bulan_mulai: string;
  bulan_selesai: string;
  tanggal_jatuh_tempo: number;
  target: 'semua' | 'individu';
  siswa_ids?: string[];
}

export interface PreviewTagihan {
  siswa_id: string;
  nama_siswa: string;
  kelas_nama: string;
  tagihan: Tagihan;
}

export interface PreviewSkipped {
  siswa_id: string;
  nama_siswa: string;
  reason: string;
}

export interface TagihanPreviewResult {
  created: PreviewTagihan[];
  skipped: PreviewSkipped[];
}

export interface ManualTagihanInput {
  nama_tagihan: string;
  jenis: string;
  jumlah_total: number;
  jatuh_tempo: string;
  bisa_cicil: boolean;
  target: 'semua' | 'kelas' | 'individu';
  kelas_ids?: string[];
  siswa_ids?: string[];
  tahun_ajaran_id?: string;
}

async function getActiveStudentsForManualTarget(input: ManualTagihanInput): Promise<Siswa[]> {
  const activeStudents = (await db.siswa.where('status').equals('aktif').toArray()).filter((item) => !item.deleted_at);

  if (input.target === 'semua') {
    return activeStudents;
  }

  if (input.target === 'individu') {
    const selectedIds = new Set(input.siswa_ids ?? []);
    return activeStudents.filter((item) => selectedIds.has(item.id));
  }

  const kelasIds = new Set(input.kelas_ids ?? []);
  const assignments = await db.siswa_kelas.toArray();
  const siswaIds = new Set(
    assignments.filter((item) => !item.selesai && kelasIds.has(item.kelas_id)).map((item) => item.siswa_id),
  );
  return activeStudents.filter((item) => siswaIds.has(item.id));
}

export async function previewGenerateSpp(actor: ServiceActor, input: GenerateSppInput): Promise<TagihanPreviewResult> {
  await assertCanAccess(actor.role, 'tagihan', 'tambah');

  const startYear = parseInt(input.bulan_mulai.split('-')[0], 10);
  const startMonth = parseInt(input.bulan_mulai.split('-')[1], 10);
  const endYear = parseInt(input.bulan_selesai.split('-')[0], 10);
  const endMonth = parseInt(input.bulan_selesai.split('-')[1], 10);

  const monthsToGenerate: string[] = [];
  let curY = startYear;
  let curM = startMonth;
  while (curY < endYear || (curY === endYear && curM <= endMonth)) {
    monthsToGenerate.push(`${curY}-${curM.toString().padStart(2, '0')}`);
    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }

  let siswaAktif = (await db.siswa.where('status').equals('aktif').toArray()).filter((item) => !item.deleted_at);
  if (input.target === 'individu' && input.siswa_ids) {
    const selectedIds = new Set(input.siswa_ids);
    siswaAktif = siswaAktif.filter((item) => selectedIds.has(item.id));
  }

  const settingDiskon = await db.pengaturan.where('kunci').equals('diskon').first();
  const allPromos: any[] = settingDiskon?.nilai || [];
  const activeSppPromos = allPromos.filter((d) => d.aktif && (d.target_jenis_tagihan?.includes('spp') || d.target_jenis_tagihan?.includes('semua') || d.jenis_tagihan === 'spp' || d.jenis_tagihan === 'semua'));

  const sppCutoffRecord = await db.pengaturan.where('kunci').equals('spp_generate_cutoff').first();
  const sppCutoffSetting: SppGenerateCutoffSetting | null = sppCutoffRecord?.nilai || null;

  const created: PreviewTagihan[] = [];
  const skipped: PreviewSkipped[] = [];

  const existingBills = await db.tagihan.toArray();
  const assignments = await db.siswa_kelas.toArray();
  const kelasRecords = await db.kelas.toArray();
  const kelasMap = new Map(kelasRecords.map(k => [k.id, k]));
  const yearRecords = await db.tahun_ajaran.toArray();
  const yearMap = new Map(yearRecords.map(y => [y.id, y]));

  for (const siswa of siswaAktif) {
    const assignment = assignments.find(a => a.siswa_id === siswa.id && !a.selesai);
    if (!assignment) {
      skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: 'kelas_tidak_ditemukan' });
      continue;
    }

    const kelas = kelasMap.get(assignment.kelas_id);
    if (!kelas || kelas.deleted_at) {
      skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: 'kelas_tidak_valid' });
      continue;
    }
    const kelasYear = yearMap.get(kelas.tahun_ajaran_id);
    if (!kelasYear || kelasYear.status === 'draft' || kelasYear.status === 'arsip') {
      skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: 'tahun_ajaran_tidak_aktif' });
      continue;
    }
    
    try {
       await assertSiswaPeriodNotArchived(siswa, 'Generate SPP');
    } catch (e: any) {
       skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: 'tahun_ajaran_tidak_aktif' });
       continue;
    }

    for (const bulan of monthsToGenerate) {
      const targetMonthStr = startOfMonth(bulan);
      const monthNumber = parseInt(bulan.split('-')[1], 10);
      const jatuhTempo = `${bulan}-${input.tanggal_jatuh_tempo.toString().padStart(2, '0')}`;

      const yearStartMonth = monthKeyFromDate(kelasYear.mulai);
      const yearEndMonth = monthKeyFromDate(kelasYear.selesai);
      if (bulan < yearStartMonth || bulan > yearEndMonth) {
        skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: `Bulan ${bulan} di luar periode tahun ajaran ${kelasYear.nama}` });
        continue;
      }

      const sppEffectiveStart = getSppEffectiveStartMonth(
        siswa.tanggal_daftar || '',
        siswa.jenis_masuk,
        sppCutoffSetting
      );
      if (siswa.tanggal_daftar && startOfMonth(sppEffectiveStart) > targetMonthStr) {
        skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: `Siswa masuk pada ${sppEffectiveStart}. SPP mulai dari bulan tersebut.` });
        continue;
      }

      // Validasi tidak boleh loncat bulan
      let firstValidMonth = monthKeyFromDate(kelasYear.mulai);
      if (siswa.jenis_masuk === 'pindahan' && startOfMonth(sppEffectiveStart) > startOfMonth(firstValidMonth)) {
        firstValidMonth = sppEffectiveStart;
      }

      if (targetMonthStr > startOfMonth(firstValidMonth)) {
        const prevMonthDate = new Date(`${bulan}-01`);
        prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        
        const hasPrevInDb = existingBills.some(t => t.siswa_id === siswa.id && t.bulan_tahun === prevMonth && !t.deleted_at && t.jenis === 'spp');
        const hasPrevInCreated = created.some(t => t.siswa_id === siswa.id && t.tagihan.bulan_tahun === prevMonth);

        if (!hasPrevInDb && !hasPrevInCreated) {
          throw new ValidationError(`Tidak boleh loncat bulan: Tagihan SPP bulan sebelumnya (${prevMonth}) untuk siswa ${siswa.nama} belum dibuat. Harap buat tagihan secara berurutan.`);
        }
      }

      const existingTagihan = existingBills.find(t => t.siswa_id === siswa.id && t.bulan_tahun === bulan && !t.deleted_at && t.jenis === 'spp');
      if (existingTagihan) {
        skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: `Tagihan SPP bulan ${bulan} sudah ada.` });
        continue;
      }

      let jumlahTotal = siswa.tarif_spp_khusus
        ? siswa.tarif_spp_khusus
        : siswa.flag_diskon_spp
          ? Math.max(0, (siswa.tipe_diskon_spp ?? 'persen') === 'nominal'
            ? kelas.tarif_spp - (siswa.nominal_diskon_spp ?? 0)
            : kelas.tarif_spp - (kelas.tarif_spp * siswa.persen_diskon / 100))
          : kelas.tarif_spp;

      let totalPromoDiscount = 0;
      const usedPromoNames: string[] = [];
      const usedPromoIds: string[] = [];
      const siswaTagihanHistory = existingBills.filter(t => t.siswa_id === siswa.id);

      for (const promoId of siswa.daftar_promo || []) {
        const promo = activeSppPromos.find((p) => p.id === promoId);
        if (!promo) continue;
        if (promo.mode_tagihan_berulang === 'tertentu') {
          if (!Array.isArray(promo.bulan_tertentu) || !promo.bulan_tertentu.includes(monthNumber)) {
             continue;
          }
        }

        let historyCount = siswaTagihanHistory.filter(t => t.promo_ids?.includes(promo.id) || t.nama_promo?.includes(promo.nama)).length;
        historyCount += created.filter(t => t.siswa_id === siswa.id && (t.tagihan.promo_ids?.includes(promo.id))).length;

        if (promo.batas_kali_penggunaan && historyCount >= promo.batas_kali_penggunaan) continue;
        if (!promo.berulang && historyCount >= 1) continue;
        
        let promoNominal = 0;
        const promoVal = getPromoValue(promo, 'spp');
        if (promoVal.tipe_diskon === 'nominal') {
          promoNominal = Number(promoVal.nominal_diskon) || 0;
        } else if (promoVal.tipe_diskon === 'persen') {
          promoNominal = Math.floor((kelas.tarif_spp * (Number(promoVal.persen_diskon) || 0)) / 100);
        }
        totalPromoDiscount += promoNominal;
        usedPromoNames.push(promo.nama);
        usedPromoIds.push(promo.id);
      }

      jumlahTotal = Math.max(0, jumlahTotal - totalPromoDiscount);

      const tagihan = toPendingInsert<Tagihan>({
        id: newId(),
        siswa_id: siswa.id,
        tahun_ajaran_id: kelas.tahun_ajaran_id,
        jenis: 'spp',
        nama_tagihan: formatSppName(bulan),
        jumlah_total: Math.max(0, jumlahTotal),
        sudah_dibayar: 0,
        status: 'belum_bayar',
        jatuh_tempo: jatuhTempo,
        bulan_tahun: bulan,
        bisa_cicil: false,
        potongan_diskon: totalPromoDiscount > 0 ? totalPromoDiscount : null,
        nama_promo: usedPromoNames.length > 0 ? usedPromoNames.join(', ') : null,
        promo_ids: usedPromoIds.length > 0 ? usedPromoIds : null,
        created_by: actor.userId,
        created_at: nowIso(),
        updated_at: nowIso(),
        deleted_at: null,
      });

      created.push({
        siswa_id: siswa.id,
        nama_siswa: siswa.nama,
        kelas_nama: kelas.nama_kelas,
        tagihan
      });
    }
  }

  return { created, skipped };
}

export async function saveTagihanPreview(actor: ServiceActor, tagihans: Tagihan[]) {
  await assertCanAccess(actor.role, 'tagihan', 'tambah');
  if (tagihans.length === 0) return;
  await db.transaction('rw', db.tagihan, db.sync_queue, async () => {
    for (const tagihan of tagihans) {
      await db.tagihan.add(tagihan);
      await enqueueSync('tagihan', tagihan.id, 'insert', tagihan);
    }
  });
  await catatAuditLog(actor, 'tagihan', tagihans[0].id, 'create',
    `Generate ${tagihans.length} tagihan (${tagihans.filter(t=>t.jenis==='spp').length} SPP, ${tagihans.filter(t=>t.jenis!=='spp').length} non-SPP)`,
    { jumlah: tagihans.length, jenis: [...new Set(tagihans.map(t=>t.jenis))], tahun_ajaran_id: tagihans[0].tahun_ajaran_id,
      siswa_ids: [...new Set(tagihans.map(t=>t.siswa_id))] });
}

export interface GenerateDaftarUlangInput {
  tahun_ajaran_id: string;
  biaya_default: number;
  jatuh_tempo: string;
  nama_tagihan: string;
  target: 'kelas' | 'individu';
  siswa_ids?: string[];
  kelas_ids?: string[];
}

export async function previewGenerateDaftarUlang(actor: ServiceActor, input: GenerateDaftarUlangInput): Promise<TagihanPreviewResult> {
  await assertCanAccess(actor.role, 'tagihan', 'tambah');

  const targetYear = await db.tahun_ajaran.get(input.tahun_ajaran_id);
  if (!targetYear || targetYear.deleted_at) throw new NotFoundError('Tahun ajaran target tidak ditemukan.');
  if (targetYear.status !== 'draft') throw new ValidationError('Hanya tahun ajaran draft yang bisa menjadi target daftar ulang.');

  const allYears = (await db.tahun_ajaran.toArray()).filter((y) => !y.deleted_at);
  const activeYear = allYears.find((y) => y.status === 'aktif') ?? null;
  if (!activeYear) throw new ValidationError('Tidak ada tahun ajaran aktif.');

  const now = nowIso();
  const created: PreviewTagihan[] = [];
  const skipped: PreviewSkipped[] = [];

  const allTagihan = (await db.tagihan.toArray()).filter((t) => !t.deleted_at);
  const activeStudents = (await db.siswa.where('status').equals('aktif').toArray()).filter((s) => !s.deleted_at);

  let targetStudents: Siswa[];
  if (input.target === 'kelas') {
    const kelasIds = new Set(input.kelas_ids ?? []);
    const allAssignments = (await db.siswa_kelas.toArray()).filter((a) => !a.selesai && kelasIds.has(a.kelas_id));
    const siswaIdsInKelas = new Set(allAssignments.map((a) => a.siswa_id));
    targetStudents = activeStudents.filter((s) => siswaIdsInKelas.has(s.id));
  } else {
    const selectedIds = new Set(input.siswa_ids ?? []);
    targetStudents = activeStudents.filter((s) => selectedIds.has(s.id));
    if (targetStudents.length !== (input.siswa_ids ?? []).length) {
      skipped.push({ siswa_id: '', nama_siswa: 'Beberapa siswa', reason: 'Siswa tidak ditemukan atau tidak aktif' });
    }
  }

  for (const siswa of targetStudents) {
    const kelasAktif = await getActiveSiswaKelasBySiswaId(siswa.id);
    const kelas = kelasAktif ? await db.kelas.get(kelasAktif.kelas_id) : null;
    const kelasNama = kelas ? kelas.nama_kelas : '-';

    // Cek duplikat: sudah ada tagihan daftar_ulang untuk siswa + tahun target
    const existingDu = allTagihan.find(
      (t) => t.siswa_id === siswa.id && t.tahun_ajaran_id === input.tahun_ajaran_id && t.jenis === 'daftar_ulang'
    );
    if (existingDu) {
      skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: `Tagihan daftar ulang sudah ada (${existingDu.nama_tagihan})` });
      continue;
    }

    // ✅ Cek tagihan wajib: minimal ada 1 tagihan SPP di tahun ajaran aktif
    const sppAktif = allTagihan.filter((t) => t.siswa_id === siswa.id && t.tahun_ajaran_id === activeYear.id && t.jenis === 'spp');
    if (sppAktif.length === 0) {
      skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: 'Tagihan SPP belum digenerate untuk tahun ajaran aktif' });
      continue;
    }

    // Hitung total tunggakan (non-daftar-ulang, belum lunas)
    const tunggakan = allTagihan
      .filter((t) => t.siswa_id === siswa.id && t.jenis !== 'daftar_ulang' && t.status !== 'lunas')
      .reduce((sum, t) => sum + Math.max(0, t.jumlah_total - t.sudah_dibayar), 0);

    const tagihan = toPendingInsert<Tagihan>({
      id: newId(),
      siswa_id: siswa.id,
      tahun_ajaran_id: input.tahun_ajaran_id,
      jenis: 'daftar_ulang',
      nama_tagihan: input.nama_tagihan,
      jumlah_total: input.biaya_default,
      sudah_dibayar: 0,
      jatuh_tempo: input.jatuh_tempo,
      status: 'belum_bayar',
      bisa_cicil: false,
      bulan_tahun: null,
      created_by: actor.userId,
      status_daftar_ulang: tunggakan > 0 ? 'tertahan' : 'aktif',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });

    created.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, kelas_nama: kelasNama, tagihan });
  }

  return { created, skipped };
}

export async function previewManualTagihan(actor: ServiceActor, input: ManualTagihanInput): Promise<TagihanPreviewResult> {
  await assertCanAccess(actor.role, 'tagihan', 'tambah');

  if (['spp', 'daftar_ulang', 'daftar ulang'].includes(input.jenis.toLowerCase())) {
    throw new ValidationError('Tagihan manual tidak boleh menggunakan jenis SPP atau Daftar Ulang.');
  }

  const now = nowIso();
  const created: PreviewTagihan[] = [];
  const skipped: PreviewSkipped[] = [];

  const existingBills = (await db.tagihan.toArray()).filter((item) => !item.deleted_at);

  const settingDiskon = await db.pengaturan.where('kunci').equals('diskon').first();
  const allPromos: any[] = settingDiskon?.nilai || [];
  const activeManualPromos = allPromos.filter((d) => d.aktif && (d.target_jenis_tagihan?.includes(input.jenis) || d.target_jenis_tagihan?.includes('semua') || d.jenis_tagihan === input.jenis || d.jenis_tagihan === 'semua'));

  const selectedTahunAjaranId = input.tahun_ajaran_id || null;
  let draftYear: TahunAjaran | null = null;
  if (selectedTahunAjaranId) {
    draftYear = await db.tahun_ajaran.get(selectedTahunAjaranId) ?? null;
    if (!draftYear || draftYear.deleted_at) {
      throw new ValidationError('Tahun ajaran target tidak ditemukan.');
    }
    if (draftYear.status !== 'draft') {
      throw new ValidationError('Hanya tahun ajaran draft yang bisa dipilih sebagai target.');
    }
  }

  let targetStudents: Siswa[];
  if (selectedTahunAjaranId && input.jenis.toLowerCase() === 'pendaftaran') {
    const calonSiswa = (await db.siswa.where('status').equals('calon').toArray())
      .filter((item) => !item.deleted_at && item.tahun_ajaran_target_id === selectedTahunAjaranId);
    if (input.target === 'semua') {
      targetStudents = calonSiswa;
    } else if (input.target === 'individu') {
      const selectedIds = new Set(input.siswa_ids ?? []);
      targetStudents = calonSiswa.filter((item) => selectedIds.has(item.id));
    } else {
      throw new ValidationError('Target kelas tidak tersedia untuk tagihan pendaftaran tahun draft.');
    }
  } else if (!selectedTahunAjaranId && input.jenis.toLowerCase() === 'pendaftaran') {
    targetStudents = await getActiveStudentsForManualTarget(input);
    targetStudents = targetStudents.filter((s) => s.jenis_masuk === 'pindahan');
  } else {
    targetStudents = await getActiveStudentsForManualTarget(input);
  }

  for (const siswa of targetStudents) {
    const kelasAktif = await getActiveSiswaKelasBySiswaId(siswa.id);
    const kelas = kelasAktif ? await db.kelas.get(kelasAktif.kelas_id) : null;

    if (!selectedTahunAjaranId) {
      if (!kelas || kelas.deleted_at) {
        skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: 'Kelas aktif tidak ditemukan' });
        continue;
      }
      const kelasYear = await db.tahun_ajaran.get(kelas.tahun_ajaran_id);
      if (kelasYear && (kelasYear.status === 'draft' || kelasYear.status === 'arsip')) {
        skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: `Tahun ajaran ${kelasYear.status}` });
        continue;
      }
      try {
        await assertSiswaPeriodNotArchived(siswa, 'Buat tagihan manual');
      } catch (e: any) {
        skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: 'Tahun ajaran tidak aktif' });
        continue;
      }
    }

    const tagihanYearId = selectedTahunAjaranId || (kelas ? kelas.tahun_ajaran_id : siswa.tahun_ajaran_target_id);
    if (!tagihanYearId) {
      skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: 'Tahun ajaran tidak tersedia' });
      continue;
    }

    const exceptionJenis = ['pendaftaran', 'daftar_ulang', 'daftar ulang'];
    if (!exceptionJenis.includes(input.jenis.toLowerCase())) {
      const tagihanYear = await db.tahun_ajaran.get(tagihanYearId);
      if (tagihanYear && !tagihanYear.deleted_at) {
        if (input.jatuh_tempo < tagihanYear.mulai || input.jatuh_tempo > tagihanYear.selesai) {
          skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: `Tanggal jatuh tempo di luar periode tahun ajaran ${tagihanYear.nama}` });
          continue;
        }
      }
    }

    const duplicate = existingBills.find((item) => item.siswa_id === siswa.id
      && item.tahun_ajaran_id === tagihanYearId
      && item.jenis.toLowerCase() === input.jenis.toLowerCase()
      && item.nama_tagihan.trim().toLowerCase() === input.nama_tagihan.trim().toLowerCase()
      && item.jatuh_tempo === input.jatuh_tempo
      && item.jumlah_total === input.jumlah_total);
    if (duplicate) {
      skipped.push({ siswa_id: siswa.id, nama_siswa: siswa.nama, reason: 'Tagihan duplikat sudah ada' });
      continue;
    }

    let jumlahTotal = input.jumlah_total;
    let totalPromoDiscount = 0;
    const usedPromoNames: string[] = [];
    const usedPromoIds: string[] = [];
    const siswaTagihanHistory = existingBills.filter(t => t.siswa_id === siswa.id);

    for (const promoId of siswa.daftar_promo || []) {
      const promo = activeManualPromos.find((p) => p.id === promoId);
      if (!promo) continue;

      let historyCount = siswaTagihanHistory.filter(t => t.promo_ids?.includes(promo.id) || t.nama_promo?.includes(promo.nama)).length;
      if (promo.batas_kali_penggunaan && historyCount >= promo.batas_kali_penggunaan) continue;
      if (!promo.berulang && historyCount >= 1) continue;

      let promoNominal = 0;
      const promoVal = getPromoValue(promo, input.jenis);
      if (promoVal.tipe_diskon === 'nominal') {
        promoNominal = Number(promoVal.nominal_diskon) || 0;
      } else if (promoVal.tipe_diskon === 'persen') {
        promoNominal = Math.floor((input.jumlah_total * (Number(promoVal.persen_diskon) || 0)) / 100);
      }
      totalPromoDiscount += promoNominal;
      usedPromoNames.push(promo.nama);
      usedPromoIds.push(promo.id);
    }

    jumlahTotal = Math.max(0, jumlahTotal - totalPromoDiscount);

    const tagihan = toPendingInsert<Tagihan>({
      id: newId(),
      siswa_id: siswa.id,
      tahun_ajaran_id: tagihanYearId,
      jenis: input.jenis,
      nama_tagihan: input.nama_tagihan,
      jumlah_total: jumlahTotal,
      sudah_dibayar: 0,
      jatuh_tempo: input.jatuh_tempo,
      status: 'belum_bayar',
      bisa_cicil: input.bisa_cicil,
      bulan_tahun: null,
      potongan_diskon: totalPromoDiscount > 0 ? totalPromoDiscount : null,
      nama_promo: usedPromoNames.length > 0 ? usedPromoNames.join(', ') : null,
      promo_ids: usedPromoIds.length > 0 ? usedPromoIds : null,
      created_by: actor.userId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });

    created.push({
      siswa_id: siswa.id,
      nama_siswa: siswa.nama,
      kelas_nama: kelas ? kelas.nama_kelas : (draftYear ? draftYear.nama : '-'),
      tagihan
    });
  }

  return { created, skipped };
}

export async function deleteTagihan(actor: ServiceActor, tagihanId: string, catatan: string) {
  await assertCanAccess(actor.role, 'tagihan', 'hapus');

  const existing = await db.tagihan.get(tagihanId);
  if (!existing || existing.deleted_at) {
    throw new NotFoundError('Tagihan tidak ditemukan.');
  }
  await assertTagihanPeriodNotArchived(existing.id, 'Hapus tagihan');

  if (existing.jenis === 'spp') {
    throw new ValidationError('Tagihan SPP tidak bisa dibatalkan langsung. Batalkan melalui menu siswa berhenti/pindah sekolah.');
  }
  if (['daftar_ulang', 'daftar ulang'].includes(existing.jenis)) {
    throw new ValidationError('Tagihan daftar ulang tidak bisa dibatalkan langsung.');
  }
  if (existing.sudah_dibayar > 0) {
    throw new ValidationError('Tagihan yang sudah memiliki pembayaran tidak dapat dihapus.');
  }

  const updated = toPendingUpdate(existing, {
    deleted_at: nowIso(),
    status: 'dibatalkan',
    updated_at: nowIso(),
  });

  await db.transaction('rw', db.tagihan, db.sync_queue, async () => {
    await db.tagihan.put(updated);
    await enqueueSync('tagihan', updated.id, 'delete', updated);
  });

  await catatAuditLog(actor, 'tagihan', tagihanId, 'delete',
    `Hapus tagihan ${existing.nama_tagihan} (${existing.jenis} Rp${existing.jumlah_total})`,
    { nama_tagihan: existing.nama_tagihan, jenis: existing.jenis, jumlah_total: existing.jumlah_total,
      siswa_id: existing.siswa_id, bulan_tahun: existing.bulan_tahun, catatan });

  return updated;
}

export async function batchDeleteTagihan(actor: ServiceActor, tagihanIds: string[], catatan: string) {
  await assertCanAccess(actor.role, 'tagihan', 'hapus');
  if (tagihanIds.length === 0) {
    throw new ValidationError('Tidak ada tagihan yang dipilih untuk dibatalkan.');
  }

  const now = nowIso();
  const allTagihan = await db.tagihan.where('id').anyOf(tagihanIds).toArray();
  const updates: Tagihan[] = [];

  for (const existing of allTagihan) {
    if (!existing || existing.deleted_at) continue;
    await assertTagihanPeriodNotArchived(existing.id, 'Hapus tagihan massal');
    if (existing.jenis === 'spp') {
      throw new ValidationError(`Tagihan "${existing.nama_tagihan}" untuk salah satu siswa: SPP tidak bisa dibatalkan langsung.`);
    }
    if (['daftar_ulang', 'daftar ulang'].includes(existing.jenis)) {
      throw new ValidationError(`Tagihan "${existing.nama_tagihan}" untuk salah satu siswa: Daftar ulang tidak bisa dibatalkan langsung.`);
    }
    if (existing.sudah_dibayar > 0) {
      throw new ValidationError(`Tagihan "${existing.nama_tagihan}" untuk salah satu siswa: sudah memiliki pembayaran.`);
    }
    updates.push(toPendingUpdate(existing, {
      deleted_at: now,
      status: 'dibatalkan',
      updated_at: now,
    }));
  }

  if (updates.length === 0) {
    throw new ValidationError('Tidak ada tagihan yang dapat dibatalkan.');
  }

  await db.transaction('rw', db.tagihan, db.sync_queue, async () => {
    for (const updated of updates) {
      await db.tagihan.put(updated);
      await enqueueSync('tagihan', updated.id, 'delete', updated);
    }
  });

  await catatAuditLog(actor, 'tagihan', updates[0].id, 'delete',
    `Hapus massal ${updates.length} tagihan`,
    { jumlah: updates.length, tagihan: updates.map(t=>({ id: t.id, nama: t.nama_tagihan, jenis: t.jenis, siswa_id: t.siswa_id })), catatan });

  return updates;
}
