import { getPengaturanNilaiByKunci } from '../services/pengaturanRepository';

export async function getPengaturanByKunci<T>(kunci: string) {
  return getPengaturanNilaiByKunci<T>(kunci);
}
