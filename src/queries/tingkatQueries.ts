import { db } from '../db';
import type { Tingkat } from '../db/types';

export async function listTingkat(tahunAjaranId?: string): Promise<Tingkat[]> {
  let records = await db.tingkat.toArray();
  records = records.filter((item) => !item.deleted_at);
  if (tahunAjaranId) {
    records = records.filter((item) => item.tahun_ajaran_id === tahunAjaranId);
  }
  return records.sort((a, b) => a.urutan - b.urutan);
}
