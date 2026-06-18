import { ValidationError } from './service-errors';

export function calculateTahunAjaranSelesai(mulai: string) {
  const start = new Date(`${mulai}T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    return '';
  }
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  return end.toISOString().slice(0, 10);
}

export function assertMaxOneYearTahunAjaran(mulai: string, selesai: string) {
  const maximum = calculateTahunAjaranSelesai(mulai);
  if (!maximum) {
    throw new ValidationError('Tanggal mulai tahun ajaran tidak valid.');
  }
  if (!selesai) {
    throw new ValidationError('Tanggal selesai tahun ajaran wajib diisi.');
  }
  if (selesai < mulai) {
    throw new ValidationError('Tanggal selesai tidak boleh sebelum tanggal mulai.');
  }
  if (selesai > maximum) {
    throw new ValidationError(`Tahun ajaran tidak boleh lebih dari satu tahun. Tanggal selesai maksimal ${maximum}.`);
  }
}
