import { db } from '../db';
import type { Siswa, SiswaKelas, SppGenerateCutoffSetting } from '../db/types';
import { assertCanAccess } from './permissionService';
import { NotFoundError, ValidationError } from './service-errors';
import { enqueueSync, getSppEffectiveStartMonth, newId, todayDate, toPendingInsert, toPendingUpdate, type ServiceActor } from './service-helpers';
import { runAutoPlacementForTahunAjaran } from './placementService';
import { assertBatchKelasCapacity } from './kelasCapacityService';
import { ReferenceGeneratorService } from './referenceGeneratorService';

export interface ProsesNaikKelasInput {
  tahunAjaranTujuanId: string;
  decisions: Array<{
    siswaId: string;
    kelasTujuanId: string | null;
    action: 'naik' | 'lulus' | 'berhenti' | 'batal_daftar' | 'tetap_cuti';
  }>;
  toggleBawaTarif: boolean;
  hapusPromoSiswaIds: string[];
}

export async function prosesNaikKelas(actor: ServiceActor, input: ProsesNaikKelasInput) {
  await assertCanAccess(actor.role, 'siswa', 'edit');
  await assertCanAccess(actor.role, 'kelas', 'edit');
  await assertCanAccess(actor.role, 'tahun_ajaran', 'edit');

  const [targetYear, activeYear, assignments, siswaList] = await Promise.all([
    db.tahun_ajaran.get(input.tahunAjaranTujuanId),
    db.tahun_ajaran.toArray().then((years) => years.find((item) => !item.deleted_at && (item.aktif || item.status === 'aktif'))),
    db.siswa_kelas.toArray(),
    db.siswa.toArray(),
  ]);

  if (!targetYear || targetYear.deleted_at) {
    throw new NotFoundError('Tahun ajaran tujuan tidak ditemukan.');
  }

  if (!activeYear || activeYear.deleted_at) {
    throw new ValidationError('Belum ada tahun ajaran aktif saat ini.');
  }

  if (activeYear.id === targetYear.id) {
    throw new ValidationError('Tahun ajaran tujuan harus berbeda dari tahun ajaran aktif saat ini.');
  }

  if (activeYear.selesai > todayDate()) {
    throw new ValidationError('Proses naik kelas belum bisa dijalankan karena tahun ajaran aktif belum benar-benar selesai.');
  }

  if ((targetYear.status ?? (targetYear.aktif ? 'aktif' : 'draft')) !== 'draft') {
    throw new ValidationError('Tahun ajaran tujuan proses naik kelas harus berstatus draft.');
  }

  const siswaMap = new Map(siswaList.filter((item) => !item.deleted_at).map((item) => [item.id, item]));
  const activeAssignments = new Map(assignments.filter((item) => !item.selesai).map((item) => [item.siswa_id, item]));
  const today = todayDate();

  await assertBatchKelasCapacity(input.decisions
    .filter((decision) => decision.action === 'naik' && Boolean(decision.kelasTujuanId))
    .map((decision) => ({ kelasId: decision.kelasTujuanId as string, siswaId: decision.siswaId })));

  await db.transaction('rw', db.siswa, db.siswa_kelas, db.tahun_ajaran, db.sync_queue, async () => {
    for (const decision of input.decisions) {
      const siswa = siswaMap.get(decision.siswaId);
      if (!siswa) continue;

      const currentAssignment = activeAssignments.get(decision.siswaId);

      // Handle closing old assignment for active students
      if (currentAssignment && (decision.action !== 'naik' || decision.kelasTujuanId)) {
        let statusAkhir: "batal_daftar" | "naik_kelas" | "alumni" | "keluar" | "tidak_lanjut" | null = null;
        if (decision.action === 'naik') statusAkhir = 'naik_kelas';
        else if (decision.action === 'lulus') statusAkhir = 'alumni';
        else if (decision.action === 'berhenti') statusAkhir = 'keluar';

        const closedAssignment = toPendingUpdate<SiswaKelas>(currentAssignment, {
          selesai: today,
          status_akhir_periode: statusAkhir,
          updated_at: new Date().toISOString(),
        });
        await db.siswa_kelas.put(closedAssignment);
        await enqueueSync('siswa_kelas', closedAssignment.id, 'update', closedAssignment);
      }

      if (decision.action === 'naik' && decision.kelasTujuanId) {
        const kelasTujuan = await db.kelas.get(decision.kelasTujuanId);
        if (!kelasTujuan || kelasTujuan.deleted_at) {
          throw new ValidationError(`Kelas tujuan untuk siswa ${siswa.nama} tidak ditemukan.`);
        }

        const kelasAsalNama = currentAssignment ? (await db.kelas.get(currentAssignment.kelas_id))?.nama_kelas : null;
        const newAssignment = toPendingInsert<SiswaKelas>({
          id: newId(),
          siswa_id: siswa.id,
          kelas_id: decision.kelasTujuanId,
          mulai: today,
          selesai: null,
          penempatan_sumber: 'manual',
          catatan_penempatan: currentAssignment && kelasAsalNama
            ? `Proses naik kelas dari ${kelasAsalNama} ke ${kelasTujuan.nama_kelas}`
            : `Penempatan saat Lanjut Tahun Ajaran ke ${kelasTujuan.nama_kelas}`,
          status_akhir_periode: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        await db.siswa_kelas.add(newAssignment);
        await enqueueSync('siswa_kelas', newAssignment.id, 'insert', newAssignment);

        const updateFields: Partial<Siswa> = {
          status: 'aktif',
          nis: siswa.nis || await ReferenceGeneratorService.generateNIS(input.tahunAjaranTujuanId),
          tahun_ajaran_target_id: input.tahunAjaranTujuanId,
          updated_at: new Date().toISOString(),
        };

        // Apply toggleBawaTarif
        if (input.toggleBawaTarif) {
          if (!siswa.flag_diskon_spp && currentAssignment) {
            const kelasAsal = await db.kelas.get(currentAssignment.kelas_id);
            if (kelasAsal && !kelasAsal.deleted_at) {
              updateFields.flag_diskon_spp = true;
              updateFields.nominal_diskon_spp = kelasAsal.tarif_spp;
              updateFields.persen_diskon = 0;
            }
          }
        } else {
          updateFields.flag_diskon_spp = false;
          updateFields.nominal_diskon_spp = 0;
          updateFields.persen_diskon = 0;
        }

        // Hapus promo
        if (input.hapusPromoSiswaIds.includes(siswa.id)) {
          updateFields.daftar_promo = [];
        }

        const updatedSiswa = toPendingUpdate<Siswa>(siswa, updateFields);
        await db.siswa.put(updatedSiswa);
        await enqueueSync('siswa', updatedSiswa.id, 'update', updatedSiswa);
      } else if (decision.action === 'lulus' || decision.action === 'berhenti' || decision.action === 'batal_daftar') {
        const archivedSiswa = toPendingUpdate<Siswa>(siswa, {
          status: decision.action,
          tanggal_keluar: today,
          updated_at: new Date().toISOString(),
        });
        await db.siswa.put(archivedSiswa);
        await enqueueSync('siswa', archivedSiswa.id, 'update', archivedSiswa);
      } else if (decision.action === 'tetap_cuti') {
        const updatedSiswa = toPendingUpdate<Siswa>(siswa, {
          status: 'cuti',
          tahun_ajaran_target_id: input.tahunAjaranTujuanId,
          updated_at: new Date().toISOString(),
        });
        await db.siswa.put(updatedSiswa);
        await enqueueSync('siswa', updatedSiswa.id, 'update', updatedSiswa);
      }
    }

    const updatedCurrentYear = toPendingUpdate(activeYear, { aktif: false, status: 'arsip' as const, updated_at: new Date().toISOString() });
    await db.tahun_ajaran.put(updatedCurrentYear);
    await enqueueSync('tahun_ajaran', updatedCurrentYear.id, 'update', updatedCurrentYear);

    const updatedTargetYear = toPendingUpdate(targetYear, { aktif: true, status: 'aktif' as const, updated_at: new Date().toISOString() });
    await db.tahun_ajaran.put(updatedTargetYear);
    await enqueueSync('tahun_ajaran', updatedTargetYear.id, 'update', updatedTargetYear);
  });

  await runAutoPlacementForTahunAjaran(input.tahunAjaranTujuanId);
}

export async function validateDaftarUlangForPromotedStudents(
  tahunAjaranTujuanId: string,
  decisions: Array<{ siswaId: string; action: string }>
): Promise<{ missing: Array<{ siswaId: string; nama: string }> }> {
  const naikIds = decisions.filter((d) => d.action === 'naik').map((d) => d.siswaId);
  if (naikIds.length === 0) return { missing: [] };

  const [siswaList, tagihanList] = await Promise.all([
    db.siswa.where('id').anyOf(naikIds).toArray(),
    db.tagihan.where('jenis').equals('daftar_ulang').toArray(),
  ]);

  const siswaMap = new Map(siswaList.filter((s) => !s.deleted_at).map((s) => [s.id, s.nama]));
  const studentsWithDaftarUlang = new Set<string>();

  for (const t of tagihanList) {
    if (!t.deleted_at && t.tahun_ajaran_id === tahunAjaranTujuanId) {
      studentsWithDaftarUlang.add(t.siswa_id);
    }
  }

  const missing: Array<{ siswaId: string; nama: string }> = [];
  for (const id of naikIds) {
    if (!studentsWithDaftarUlang.has(id)) {
      const nama = siswaMap.get(id);
      if (nama) missing.push({ siswaId: id, nama });
    }
  }

  return { missing };
}

export async function validatePendaftaranForCalonStudents(
  tahunAjaranTargetId: string
): Promise<Array<{ siswaId: string; nama: string; masalah: 'missing' | 'belum_lunas' }>> {
  const [siswaList, tagihanList] = await Promise.all([
    db.siswa.toArray(),
    db.tagihan.where('jenis').equals('pendaftaran').toArray(),
  ]);

  const targetSiswa = siswaList.filter(
    (s) => !s.deleted_at && s.tahun_ajaran_target_id === tahunAjaranTargetId
  );

  const pendaftaranBySiswa = new Map<string, typeof tagihanList>();
  for (const t of tagihanList) {
    if (!t.deleted_at && t.tahun_ajaran_id === tahunAjaranTargetId) {
      const existing = pendaftaranBySiswa.get(t.siswa_id) || [];
      existing.push(t);
      pendaftaranBySiswa.set(t.siswa_id, existing);
    }
  }

  const result: Array<{ siswaId: string; nama: string; masalah: 'missing' | 'belum_lunas' }> = [];
  for (const s of targetSiswa) {
    const tagihan = pendaftaranBySiswa.get(s.id);
    if (!tagihan || tagihan.length === 0) {
      result.push({ siswaId: s.id, nama: s.nama, masalah: 'missing' });
    } else if (!tagihan.every((t) => t.status === 'lunas')) {
      result.push({ siswaId: s.id, nama: s.nama, masalah: 'belum_lunas' });
    }
  }

  return result;
}

export async function validateAllTagihanGenerated(activeYearId: string): Promise<{
  lengkap: boolean;
  missingCount: number;
  message: string;
}> {
  const [activeSiswa, allTagihan, activeYear, cutoffRecord] = await Promise.all([
    db.siswa.where('status').equals('aktif').toArray(),
    db.tagihan.toArray(),
    db.tahun_ajaran.get(activeYearId),
    db.pengaturan.where('kunci').equals('spp_generate_cutoff').first(),
  ]);

  const sppCutoff: SppGenerateCutoffSetting | null = cutoffRecord?.nilai || null;

  if (!activeYear) return { lengkap: true, missingCount: 0, message: '' };

  const startMonth = new Date(activeYear.mulai);
  const endMonth = new Date(activeYear.selesai);
  const now = new Date();
  const currentMonth = now < startMonth ? startMonth : now > endMonth ? endMonth : now;
  const currentYear = currentMonth.getFullYear();
  const currentMonthNum = currentMonth.getMonth() + 1;

  // Generate all expected month keys (YYYY-MM) from start to current month
  const expectedMonths: string[] = [];
  const startYear = startMonth.getFullYear();
  const startMonthNum = startMonth.getMonth() + 1;
  let y = startYear;
  let m = startMonthNum;
  while (y < currentYear || (y === currentYear && m <= currentMonthNum)) {
    expectedMonths.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  if (expectedMonths.length === 0) return { lengkap: true, missingCount: 0, message: '' };

  const tagihanBySiswa = new Map<string, Set<string>>();
  for (const t of allTagihan) {
    if (!t.deleted_at && t.jenis === 'spp' && t.bulan_tahun) {
      const set = tagihanBySiswa.get(t.siswa_id) || new Set();
      set.add(t.bulan_tahun);
      tagihanBySiswa.set(t.siswa_id, set);
    }
  }

  let missingCount = 0;
  for (const s of activeSiswa) {
    const studentMonths = tagihanBySiswa.get(s.id) || new Set();
    const effectiveStart = getSppEffectiveStartMonth(s.tanggal_daftar || '', s.jenis_masuk, sppCutoff);
    const startIdx = expectedMonths.indexOf(effectiveStart);
    const relevantMonths = startIdx > 0 ? expectedMonths.slice(startIdx) : expectedMonths;
    for (const month of relevantMonths) {
      if (!studentMonths.has(month)) {
        missingCount++;
      }
    }
  }

  if (missingCount > 0) {
    return {
      lengkap: false,
      missingCount,
      message: `Terdapat ${missingCount} tagihan SPP yang belum digenerate untuk tahun ajaran aktif. Generate SPP terlebih dahulu sebelum Lanjut Tahun Ajaran.`,
    };
  }

  return { lengkap: true, missingCount: 0, message: '' };
}

export async function checkLulusTunggakan(
  siswaIds: string[]
): Promise<Array<{ siswaId: string; nama: string; totalTunggakan: number }>> {
  if (siswaIds.length === 0) return [];

  const [siswaList, tagihanList] = await Promise.all([
    db.siswa.where('id').anyOf(siswaIds).toArray(),
    db.tagihan.toArray(),
  ]);

  const siswaMap = new Map(siswaList.filter((s) => !s.deleted_at).map((s) => [s.id, s.nama]));
  const result: Array<{ siswaId: string; nama: string; totalTunggakan: number }> = [];

  for (const id of siswaIds) {
    const nama = siswaMap.get(id);
    if (!nama) continue;

    const tagihanSiswa = tagihanList.filter((t) => !t.deleted_at && t.siswa_id === id);
    let totalTunggakan = 0;
    for (const t of tagihanSiswa) {
      if (t.status !== 'lunas') {
        totalTunggakan += (t.jumlah_total - t.sudah_dibayar);
      }
    }
    if (totalTunggakan > 0) {
      result.push({ siswaId: id, nama, totalTunggakan });
    }
  }

  return result;
}


