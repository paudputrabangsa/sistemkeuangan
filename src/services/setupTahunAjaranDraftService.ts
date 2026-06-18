import { db } from '../db';
import type { Kelas, PengaturanPendaftaranTahunAjaran, TahunAjaran } from '../db/types';
import { assertCanAccess } from './permissionService';
import { ValidationError } from './service-errors';
import { enqueueSync, newId, nowIso, toPendingInsert, type ServiceActor } from './service-helpers';
import { calculateTahunAjaranSelesai } from './tahunAjaranDateService';
import { normalizeWhitespace, parseTahunAjaranName, tahunAjaranKey } from './nameNormalizationService';

export interface TingkatKelasDraft {
  id: string;
  nama_kelas: string;
  kapasitas_siswa: string;
}

export interface TingkatDraft {
  id: string;
  nama: string;
  kode: string;
  tarif_spp: string;
  usia_min_tahun: string;
  usia_max_tahun: string;
  kelas: TingkatKelasDraft[];
}

export interface SetupTahunAjaranKomponenBiayaDraft {
  id: string;
  nama: string;
  nominal: string;
  wajib: boolean;
}

export interface SetupTahunAjaranDraft {
  stepIndex: number;
  tahunAjaran: {
    nama: string;
    mulai: string;
    selesai: string;
  };
  tingkatRows: TingkatDraft[];
  cutoffBulan: string;
  cutoffTanggal: string;
  komponenBiaya: SetupTahunAjaranKomponenBiayaDraft[];
  modeTagihanBiaya: 'gabung' | 'pisah';
  jatuhTempoMode: 'tanggal_tetap' | 'hari_setelah_daftar';
  jatuhTempoTanggal: string;
  jatuhTempoHari: string;
}

const storageKey = 'setup_tahun_ajaran_draft_v3';

export function createDefaultSetupTahunAjaranDraft(): SetupTahunAjaranDraft {
  return {
    stepIndex: 0,
    tahunAjaran: { nama: '', mulai: '', selesai: '' },
    tingkatRows: [
      { id: newId(), nama: 'Kelompok Bermain', kode: '', tarif_spp: '', usia_min_tahun: '2', usia_max_tahun: '4', kelas: [{ id: newId(), nama_kelas: '', kapasitas_siswa: '' }] },
      { id: newId(), nama: 'TK A', kode: '', tarif_spp: '', usia_min_tahun: '4', usia_max_tahun: '5', kelas: [{ id: newId(), nama_kelas: '', kapasitas_siswa: '' }] },
      { id: newId(), nama: 'TK B', kode: '', tarif_spp: '', usia_min_tahun: '5', usia_max_tahun: '6', kelas: [{ id: newId(), nama_kelas: '', kapasitas_siswa: '' }] },
    ],
    cutoffBulan: '7',
    cutoffTanggal: '1',
    komponenBiaya: [],
    modeTagihanBiaya: 'gabung',
    jatuhTempoMode: 'tanggal_tetap',
    jatuhTempoTanggal: '',
    jatuhTempoHari: '14',
  };
}

export function loadSetupTahunAjaranDraft() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SetupTahunAjaranDraft;
  } catch {
    return null;
  }
}

export function saveSetupTahunAjaranDraft(draft: SetupTahunAjaranDraft) {
  localStorage.setItem(storageKey, JSON.stringify(draft));
}

export function clearSetupTahunAjaranDraft() {
  localStorage.removeItem(storageKey);
}

function isValidMonthDay(month: number, day: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return false;
  const date = new Date(2024, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day;
}

export async function validateSetupTahunAjaranStep(draft: SetupTahunAjaranDraft, stepIndex: number): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};
  const tahun = draft.tahunAjaran;

  if (stepIndex >= 0) {
    if (!tahun.nama.trim()) errors.tahun_nama = 'Nama tahun ajaran wajib diisi.';
    else if (!parseTahunAjaranName(tahun.nama)) errors.tahun_nama = 'Format harus YYYY/YYYY, tahun kedua tepat satu tahun setelah tahun pertama. Contoh: 2026/2027.';
    if (!tahun.mulai) errors.tahun_mulai = 'Tanggal mulai wajib diisi.';
    if (!tahun.selesai) errors.tahun_selesai = 'Tanggal selesai wajib diisi.';
    else if (tahun.mulai && tahun.selesai < tahun.mulai) errors.tahun_selesai = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
    else if (tahun.mulai && tahun.selesai > calculateTahunAjaranSelesai(tahun.mulai)) errors.tahun_selesai = `Durasi maksimal satu tahun (maksimal ${calculateTahunAjaranSelesai(tahun.mulai)}).`;
    if (Object.keys(errors).length === 0 && tahun.nama.trim() && tahun.mulai && tahun.selesai) {
      const existing = (await db.tahun_ajaran.toArray()).filter((item) => !item.deleted_at);
      const normalizedName = tahunAjaranKey(tahun.nama);
      const dupName = existing.find((item) => tahunAjaranKey(item.nama) === normalizedName);
      if (dupName) errors.tahun_nama = `Nama tahun ajaran sudah ada: ${dupName.nama}.`;
      const dupPeriod = existing.find((item) => item.mulai === tahun.mulai && item.selesai === tahun.selesai);
      if (dupPeriod) errors.tahun_selesai = `Periode sama dengan ${dupPeriod.nama}.`;
      const overlap = existing.find((item) => tahun.mulai <= item.selesai && tahun.selesai >= item.mulai);
      if (overlap) errors.tahun_selesai = `Periode tumpang tindih dengan ${overlap.nama}.`;
    }
  }

  if (stepIndex >= 1) {
    if (!draft.tingkatRows.length) errors.tingkat_global = 'Minimal satu tingkat wajib diisi.';
    const tingkatNames = new Set<string>();
    for (const [tIdx, t] of draft.tingkatRows.entries()) {
      const tPrefix = `tingkat_${t.id}`;
      if (!t.nama.trim()) errors[`${tPrefix}_nama`] = `Nama tingkat ${tIdx + 1} wajib diisi.`;
      const normalized = t.nama.trim().toLowerCase();
      if (normalized && tingkatNames.has(normalized)) errors[`${tPrefix}_nama`] = `Nama tingkat "${t.nama}" sudah ada.`;
      if (normalized) tingkatNames.add(normalized);
      if (!t.kelas.length) errors[`${tPrefix}_kelas`] = `Minimal satu kelas di tingkat "${t.nama || tIdx + 1}" wajib diisi.`;
      else {
        const classNames = new Set<string>();
        for (const [kIdx, k] of t.kelas.entries()) {
          const kPrefix = `kelas_${k.id}`;
          if (!k.nama_kelas.trim()) errors[`${kPrefix}_nama`] = `Nama kelas ${kIdx + 1} di tingkat "${t.nama || tIdx + 1}" wajib diisi.`;
          const kNormalized = k.nama_kelas.trim().toLowerCase();
          if (kNormalized && classNames.has(kNormalized)) errors[`${kPrefix}_nama`] = `Nama kelas "${k.nama_kelas}" duplikat di tingkat "${t.nama || tIdx + 1}".`;
          if (kNormalized) classNames.add(kNormalized);
          if (k.kapasitas_siswa && (!Number.isInteger(Number(k.kapasitas_siswa)) || Number(k.kapasitas_siswa) < 1)) errors[`${kPrefix}_kapasitas`] = 'Kapasitas harus bilangan bulat minimal 1.';
        }
      }
      if (t.tarif_spp === '' || Number(t.tarif_spp) < 0 || !Number.isFinite(Number(t.tarif_spp))) errors[`${tPrefix}_tarif`] = 'Tarif SPP harus nol atau lebih.';
      if (t.usia_min_tahun && Number(t.usia_min_tahun) < 0) errors[`${tPrefix}_usia_min`] = 'Usia minimal tidak valid.';
      if (t.usia_max_tahun && Number(t.usia_max_tahun) < 0) errors[`${tPrefix}_usia_max`] = 'Usia maksimal tidak valid.';
      if (t.usia_min_tahun && t.usia_max_tahun && Number(t.usia_max_tahun) < Number(t.usia_min_tahun)) errors[`${tPrefix}_usia_max`] = 'Usia maksimal tidak boleh lebih kecil dari usia minimal.';
    }
    const cutoffBulan = Number(draft.cutoffBulan);
    const cutoffTanggal = Number(draft.cutoffTanggal);
    if (!isValidMonthDay(cutoffBulan, cutoffTanggal)) errors.cutoff_tanggal = 'Tanggal cutoff umur tidak valid.';
  }

  if (stepIndex >= 2) {
    if (!draft.komponenBiaya.length) errors.komponen_global = 'Minimal satu komponen biaya wajib diisi.';
    for (const [index, k] of draft.komponenBiaya.entries()) {
      const prefix = `biaya_${k.id}`;
      if (!k.nama.trim()) errors[`${prefix}_nama`] = `Nama komponen ${index + 1} wajib diisi.`;
      if (k.nominal === '' || Number(k.nominal) < 0 || !Number.isFinite(Number(k.nominal))) errors[`${prefix}_nominal`] = `Nominal komponen ${index + 1} harus nol atau lebih.`;
    }
    if (draft.jatuhTempoMode === 'tanggal_tetap') {
      if (!draft.jatuhTempoTanggal) errors.jt_tanggal = 'Tanggal jatuh tempo wajib diisi.';
      else if (tahun.mulai && draft.jatuhTempoTanggal < tahun.mulai) errors.jt_tanggal = 'Tidak boleh sebelum tanggal mulai tahun ajaran.';
      else if (tahun.selesai && draft.jatuhTempoTanggal > tahun.selesai) errors.jt_tanggal = 'Tidak boleh setelah tanggal selesai tahun ajaran.';
    }
  }

  return errors;
}

export async function getPendaftaranTahunAktifTerakhir() {
  const semua = await db.tahun_ajaran
    .filter((item) => !item.deleted_at && (item.status === 'aktif' || item.status === 'arsip'))
    .toArray();
  const tahunAjaran = semua.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (!tahunAjaran) return null;
  const pendaftaran = await db.pengaturan_pendaftaran_tahun_ajaran
    .filter((item) => !item.deleted_at && item.tahun_ajaran_id === tahunAjaran.id)
    .first();
  if (!pendaftaran) return null;
  return {
    tahunAjaran: { id: tahunAjaran.id, nama: tahunAjaran.nama },
    pendaftaran: {
      komponen_biaya: pendaftaran.komponen_biaya || [],
      mode_tagihan_biaya: pendaftaran.mode_tagihan_biaya || 'gabung',
      jatuh_tempo_mode: pendaftaran.jatuh_tempo_mode || 'tanggal_tetap',
      jatuh_tempo_tanggal: pendaftaran.jatuh_tempo_tanggal || '',
      jatuh_tempo_hari_setelah_daftar: pendaftaran.jatuh_tempo_hari_setelah_daftar || 14,
      cutoff_bulan: pendaftaran.cutoff_bulan || 7,
      cutoff_tanggal: pendaftaran.cutoff_tanggal || 1,
    },
  };
}

export async function getKelasTahunAktifTerakhir() {
  const semua = await db.tahun_ajaran
    .filter((item) => !item.deleted_at && (item.status === 'aktif' || item.status === 'arsip'))
    .toArray();
  const tahunAjaran = semua.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  if (!tahunAjaran) return null;
  const kelasList = await db.kelas
    .filter((item) => !item.deleted_at && item.tahun_ajaran_id === tahunAjaran.id)
    .toArray();
  if (!kelasList.length) return null;
  const grouped = new Map<string, typeof kelasList>();
  for (const k of kelasList) {
    const tingkat = k.tingkat || 'Umum';
    const arr = grouped.get(tingkat) ?? [];
    arr.push(k);
    grouped.set(tingkat, arr);
  }
  return {
    tahunAjaran: { id: tahunAjaran.id, nama: tahunAjaran.nama },
    tingkatRows: Array.from(grouped.entries()).map(([namaTingkat, kelas]) => ({
      id: newId(),
      nama: namaTingkat,
      kode: '',
      tarif_spp: String(kelas[0]?.tarif_spp ?? 0),
      usia_min_tahun: String(kelas[0]?.usia_min_tahun ?? ''),
      usia_max_tahun: String(kelas[0]?.usia_max_tahun ?? ''),
      kelas: kelas.map((k) => ({ id: newId(), nama_kelas: k.nama_kelas, kapasitas_siswa: String(k.kapasitas_siswa ?? '') })),
    })),
  };
}

export async function completeSetupTahunAjaranDraft(actor: ServiceActor, draft: SetupTahunAjaranDraft) {
  await assertCanAccess(actor.role, 'tahun_ajaran', 'tambah');
  await assertCanAccess(actor.role, 'kelas', 'tambah');

  const validationErrors = await validateSetupTahunAjaranStep(draft, 3);
  if (Object.keys(validationErrors).length > 0) {
    throw new ValidationError(Object.values(validationErrors)[0]);
  }

  const now = nowIso();
  const tahunAjaran = toPendingInsert<TahunAjaran>({
    id: newId(),
    nama: parseTahunAjaranName(draft.tahunAjaran.nama)!.normalized,
    mulai: draft.tahunAjaran.mulai,
    selesai: draft.tahunAjaran.selesai,
    aktif: false,
    status: 'draft',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  const kelasRows = draft.tingkatRows.flatMap((t) =>
    t.kelas.map((k) => toPendingInsert<Kelas>({
      id: newId(),
      tahun_ajaran_id: tahunAjaran.id,
      tingkat_id: '',
      nama_kelas: normalizeWhitespace(k.nama_kelas),
      tingkat: normalizeWhitespace(t.nama),
      tarif_spp: Number(t.tarif_spp),
      kapasitas_siswa: k.kapasitas_siswa ? Number(k.kapasitas_siswa) : null,
      usia_min_tahun: t.usia_min_tahun ? Number(t.usia_min_tahun) : null,
      usia_max_tahun: t.usia_max_tahun ? Number(t.usia_max_tahun) : null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }))
  );

  const totalBiaya = draft.komponenBiaya.reduce((s, k) => s + Number(k.nominal || 0), 0);

  const pendaftaran = toPendingInsert<PengaturanPendaftaranTahunAjaran>({
    id: newId(),
    tahun_ajaran_id: tahunAjaran.id,
    biaya_pendaftaran_default: totalBiaya,
    komponen_biaya: draft.komponenBiaya.map((k) => ({
      id: k.id,
      nama: normalizeWhitespace(k.nama),
      nominal: Number(k.nominal),
      wajib: k.wajib,
    })),
    mode_tagihan_biaya: draft.modeTagihanBiaya,
    opsi_bayar_default: 'full',
    jatuh_tempo_mode: draft.jatuhTempoMode,
    jatuh_tempo_tanggal: draft.jatuhTempoMode === 'tanggal_tetap' ? draft.jatuhTempoTanggal : null,
    jatuh_tempo_hari_setelah_daftar: draft.jatuhTempoMode === 'hari_setelah_daftar' ? Number(draft.jatuhTempoHari) : null,
    cutoff_bulan: Number(draft.cutoffBulan),
    cutoff_tanggal: Number(draft.cutoffTanggal),
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  await db.transaction('rw', db.tahun_ajaran, db.kelas, db.pengaturan_pendaftaran_tahun_ajaran, db.sync_queue, async () => {
    await db.tahun_ajaran.add(tahunAjaran);
    await enqueueSync('tahun_ajaran', tahunAjaran.id, 'insert', tahunAjaran);
    for (const kelas of kelasRows) {
      await db.kelas.add(kelas);
      await enqueueSync('kelas', kelas.id, 'insert', kelas);
    }
    await db.pengaturan_pendaftaran_tahun_ajaran.add(pendaftaran);
    await enqueueSync('pengaturan_pendaftaran_tahun_ajaran', pendaftaran.id, 'insert', pendaftaran);
  });

  return { tahunAjaran, kelas: kelasRows, pendaftaran };
}
