import { db } from '../db';
import type { PengaturanPendaftaranTahunAjaran, TahunAjaran } from '../db/types';
import { assertCanAccess } from './permissionService';
import { NotFoundError, ValidationError } from './service-errors';
import { enqueueSync, newId, nowIso, safeDate, toPendingInsert, toPendingUpdate, type ServiceActor } from './service-helpers';

export interface SavePengaturanPendaftaranTahunAjaranInput {
  tahun_ajaran_id: string;
  pendaftaran_luar_sistem?: boolean;
  biaya_pendaftaran_default: number;
  opsi_bayar_default: 'full' | 'cicil';
  jatuh_tempo_mode: 'tanggal_tetap' | 'hari_setelah_daftar';
  jatuh_tempo_tanggal?: string | null;
  jatuh_tempo_hari_setelah_daftar?: number | null;
  cutoff_bulan: number;
  cutoff_tanggal: number;
  komponen_biaya?: { id: string; nama: string; nominal: number; wajib: boolean }[];
  mode_tagihan_biaya?: 'gabung' | 'pisah';
}

export const defaultPengaturanPendaftaranTahunAjaran = {
  biaya_pendaftaran_default: 0,
  opsi_bayar_default: 'full' as const,
  jatuh_tempo_mode: 'hari_setelah_daftar' as const,
  jatuh_tempo_tanggal: null,
  jatuh_tempo_hari_setelah_daftar: 14,
  cutoff_bulan: 7,
  cutoff_tanggal: 1,
};

function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidMonthDay(month: number, day: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(2024, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day;
}

async function getTahunAjaranOrThrow(id: string) {
  const tahunAjaran = await db.tahun_ajaran.get(id);
  if (!tahunAjaran || tahunAjaran.deleted_at) {
    throw new NotFoundError('Tahun ajaran tidak ditemukan.');
  }
  return tahunAjaran;
}

function assertNotArchived(tahunAjaran: TahunAjaran) {
  if ((tahunAjaran.status ?? (tahunAjaran.aktif ? 'aktif' : 'draft')) === 'arsip') {
    throw new ValidationError('Pengaturan pendaftaran tahun ajaran arsip tidak boleh diubah.');
  }
}

function assertDateWithinYear(value: string, tahunAjaran: TahunAjaran, label: string) {
  if (value < tahunAjaran.mulai || value > tahunAjaran.selesai) {
    throw new ValidationError(`${label} harus berada dalam periode tahun ajaran ${tahunAjaran.nama}.`);
  }
}

function normalizeInput(input: SavePengaturanPendaftaranTahunAjaranInput): SavePengaturanPendaftaranTahunAjaranInput {
  return {
    ...input,
    jatuh_tempo_tanggal: input.jatuh_tempo_tanggal || null,
    jatuh_tempo_hari_setelah_daftar: input.jatuh_tempo_hari_setelah_daftar ?? null,
  };
}

function validateInput(input: SavePengaturanPendaftaranTahunAjaranInput, tahunAjaran: TahunAjaran) {
  if (input.biaya_pendaftaran_default < 0 || !Number.isFinite(input.biaya_pendaftaran_default)) {
    throw new ValidationError('Biaya pendaftaran default harus berupa angka nol atau lebih.');
  }
  if (input.opsi_bayar_default !== 'full' && input.opsi_bayar_default !== 'cicil') {
    throw new ValidationError('Opsi bayar default tidak valid.');
  }
  if (input.jatuh_tempo_mode !== 'tanggal_tetap' && input.jatuh_tempo_mode !== 'hari_setelah_daftar') {
    throw new ValidationError('Mode jatuh tempo tidak valid.');
  }
  if (input.jatuh_tempo_mode === 'tanggal_tetap') {
    if (!input.jatuh_tempo_tanggal || !isValidDateString(input.jatuh_tempo_tanggal)) {
      throw new ValidationError('Tanggal jatuh tempo default wajib diisi dan harus valid.');
    }
    assertDateWithinYear(input.jatuh_tempo_tanggal, tahunAjaran, 'Tanggal jatuh tempo default');
  }
  if (input.jatuh_tempo_mode === 'hari_setelah_daftar') {
    if (!Number.isInteger(input.jatuh_tempo_hari_setelah_daftar) || (input.jatuh_tempo_hari_setelah_daftar ?? 0) < 0) {
      throw new ValidationError('Jumlah hari jatuh tempo setelah daftar harus bilangan bulat nol atau lebih.');
    }
  }
  if (!isValidMonthDay(input.cutoff_bulan, input.cutoff_tanggal)) {
    throw new ValidationError('Tanggal cutoff umur tidak valid.');
  }
}

export async function getPengaturanPendaftaranByTahunAjaran(tahunAjaranId: string) {
  const rows = await db.pengaturan_pendaftaran_tahun_ajaran.where('tahun_ajaran_id').equals(tahunAjaranId).toArray();
  return rows.find((item) => !item.deleted_at) ?? null;
}

export async function getPengaturanPendaftaranOrDefault(tahunAjaranId: string) {
  const existing = await getPengaturanPendaftaranByTahunAjaran(tahunAjaranId);
  if (existing) {
    return existing;
  }
  return {
    ...defaultPengaturanPendaftaranTahunAjaran,
    id: '',
    tahun_ajaran_id: tahunAjaranId,
    komponen_biaya: [],
    mode_tagihan_biaya: 'gabung',
    created_at: '',
    updated_at: '',
    deleted_at: null,
  } satisfies PengaturanPendaftaranTahunAjaran;
}

export function resolveJatuhTempoPendaftaran(setting: Pick<PengaturanPendaftaranTahunAjaran, 'jatuh_tempo_mode' | 'jatuh_tempo_tanggal' | 'jatuh_tempo_hari_setelah_daftar'>, tanggalDaftar: string) {
  if (setting.jatuh_tempo_mode === 'tanggal_tetap') {
    return setting.jatuh_tempo_tanggal ?? tanggalDaftar;
  }
  const date = safeDate(tanggalDaftar);
  date.setDate(date.getDate() + (setting.jatuh_tempo_hari_setelah_daftar ?? 0));
  return date.toISOString().slice(0, 10);
}

export async function upsertPengaturanPendaftaranTahunAjaran(actor: ServiceActor, rawInput: SavePengaturanPendaftaranTahunAjaranInput) {
  await assertCanAccess(actor.role, 'tahun_ajaran', 'edit');
  const input = normalizeInput(rawInput);
  const tahunAjaran = await getTahunAjaranOrThrow(input.tahun_ajaran_id);
  assertNotArchived(tahunAjaran);
  validateInput(input, tahunAjaran);

  const existing = await getPengaturanPendaftaranByTahunAjaran(input.tahun_ajaran_id);
  const now = nowIso();

  if (existing) {
    const updated = toPendingUpdate<PengaturanPendaftaranTahunAjaran>(existing, {
      ...input,
      updated_at: now,
    });
    await db.transaction('rw', db.pengaturan_pendaftaran_tahun_ajaran, db.sync_queue, async () => {
      await db.pengaturan_pendaftaran_tahun_ajaran.put(updated);
      await enqueueSync('pengaturan_pendaftaran_tahun_ajaran', updated.id, 'update', updated);
    });
    return updated;
  }

  const created = toPendingInsert<PengaturanPendaftaranTahunAjaran>({
    id: newId(),
    ...input,
    komponen_biaya: input.komponen_biaya ?? [],
    mode_tagihan_biaya: input.mode_tagihan_biaya ?? 'gabung',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  await db.transaction('rw', db.pengaturan_pendaftaran_tahun_ajaran, db.sync_queue, async () => {
    await db.pengaturan_pendaftaran_tahun_ajaran.add(created);
    await enqueueSync('pengaturan_pendaftaran_tahun_ajaran', created.id, 'insert', created);
  });
  return created;
}
