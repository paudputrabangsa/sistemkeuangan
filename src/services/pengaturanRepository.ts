import { db } from '../db';
import type { Pengaturan, FormatNIS, DiskonItem } from '../db/types';
import { newId, nowIso, toPendingInsert, toPendingUpdate } from './service-helpers';
import { normalizeComparisonKey, normalizeWhitespace } from './nameNormalizationService';

export interface SettingListValue {
  id: string;
  nama: string;
  aktif: boolean;
}

export const DEFAULT_FORMAT_NIS: FormatNIS = {
  komponen: [
    { id: 1, tipe: 'tahun', cfg: 'ta-gabung' },
    { id: 2, tipe: 'urut', cfg: '3' },
  ],
  separator: '-',
  resetUrutPerTahun: true,
  autoGenerate: true,
};

export const DEFAULT_DISKON: DiskonItem[] = [];

export const DEFAULT_METODE_PEMBAYARAN: SettingListValue[] = [
  { id: '00000000-0000-0000-0000-000000000101', nama: 'Tunai', aktif: false },
  { id: '00000000-0000-0000-0000-000000000102', nama: 'Transfer', aktif: false },
  { id: '00000000-0000-0000-0000-000000000103', nama: 'Tabungan', aktif: false },
];

export const DEFAULT_JENIS_TAGIHAN: SettingListValue[] = [
  { id: '00000000-0000-0000-0000-000000000201', nama: 'SPP', aktif: false },
  { id: '00000000-0000-0000-0000-000000000202', nama: 'Pendaftaran', aktif: false },
  { id: '00000000-0000-0000-0000-000000000203', nama: 'Daftar Ulang', aktif: false },
  { id: '00000000-0000-0000-0000-000000000204', nama: 'Kegiatan', aktif: false },
  { id: '00000000-0000-0000-0000-000000000205', nama: 'Administrasi', aktif: false },
  { id: '00000000-0000-0000-0000-000000000206', nama: 'Lainnya', aktif: false },
];

export function getDefaultSettingList(kunci: string) {
  if (kunci === 'metode_pembayaran') return DEFAULT_METODE_PEMBAYARAN;
  if (kunci === 'jenis_tagihan') return DEFAULT_JENIS_TAGIHAN;
  return [];
}

function sanitizeSettingListItems(kunci: string, items: SettingListValue[]) {
  const seen = new Set<string>();
  const result: SettingListValue[] = [];
  for (const item of items) {
    const name = normalizeWhitespace(item.nama ?? '');
    if (!name) continue;
    const key = normalizeComparisonKey(name);
    if (kunci === 'metode_pembayaran' && key === 'split') continue;
    if (kunci === 'jenis_tagihan' && key === 'seragam') continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ id: item.id || newId(), nama: name, aktif: item.aktif !== false });
  }
  return result;
}

function mergeWithDefaults(kunci: string, items: SettingListValue[]) {
  const merged = sanitizeSettingListItems(kunci, items);
  const keys = new Set(merged.map((item) => normalizeComparisonKey(item.nama)));
  for (const defaultItem of getDefaultSettingList(kunci)) {
    const key = normalizeComparisonKey(defaultItem.nama);
    if (!keys.has(key)) {
      merged.push(defaultItem);
      keys.add(key);
    }
  }
  return merged;
}

export async function getActivePengaturanRecord(kunci: string) {
  const records = (await db.pengaturan.where('kunci').equals(kunci).toArray()).filter((item) => !item.deleted_at);
  return records.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
}

export async function getPengaturanNilaiByKunci<T>(kunci: string) {
  const record = await getActivePengaturanRecord(kunci);
  if (record) return record.nilai as T;
  const defaults = getDefaultSettingList(kunci);
  return (defaults.length ? defaults : null) as T | null;
}

export async function repairSettingList(kunci: 'jenis_tagihan' | 'metode_pembayaran') {
  const records = (await db.pengaturan.where('kunci').equals(kunci).toArray()).filter((item) => !item.deleted_at);
  const timestamp = nowIso();
  const sourceItems = records.flatMap((record) => Array.isArray(record.nilai) ? record.nilai as SettingListValue[] : []);
  const repairedValue = mergeWithDefaults(kunci, sourceItems);
  const primary = records.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
  const repaired = primary
    ? toPendingUpdate<Pengaturan>(primary, { nilai: repairedValue, updated_at: timestamp })
    : toPendingInsert<Pengaturan>({
      id: newId(),
      kunci,
      nilai: repairedValue,
      keterangan: kunci === 'jenis_tagihan' ? 'Daftar jenis tagihan sekolah' : 'Daftar metode pembayaran yang tersedia',
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    });

  await db.pengaturan.put(repaired);
  for (const duplicate of records.filter((record) => record.id !== repaired.id)) {
    await db.pengaturan.put(toPendingUpdate<Pengaturan>(duplicate, { deleted_at: timestamp, updated_at: timestamp }));
  }
  return repaired;
}

export async function upsertPengaturanNilai(kunci: string, nilai: unknown, keterangan?: string) {
  const existing = await getActivePengaturanRecord(kunci);
  const timestamp = nowIso();
  const record = existing
    ? toPendingUpdate<Pengaturan>(existing, { nilai, updated_at: timestamp })
    : toPendingInsert<Pengaturan>({ id: newId(), kunci, nilai, keterangan: keterangan ?? null, created_at: timestamp, updated_at: timestamp, deleted_at: null });
  await db.pengaturan.put(record);
  return record;
}
