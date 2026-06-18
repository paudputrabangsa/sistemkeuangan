export function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function parseNumberInput(value: string | number | null | undefined) {
  return String(value ?? '').replace(/\D/g, '');
}

export function formatNumberInput(value: string | number | null | undefined) {
  const digits = parseNumberInput(value);
  if (!digits) return '';
  return new Intl.NumberFormat('id-ID').format(Number(digits));
}

export function formatTanggal(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatMonthYear(value: string) {
  if (/^\d{4}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat('id-ID', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${value}-01T00:00:00`));
  }

  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatKelasLabel(kelas: { tingkat?: string | null; nama_kelas: string } | null | undefined): string {
  if (!kelas) return '-';
  return kelas.tingkat ? `${kelas.tingkat} - ${kelas.nama_kelas}` : kelas.nama_kelas;
}
