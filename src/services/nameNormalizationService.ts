export function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeComparisonKey(value: string | null | undefined) {
  return normalizeWhitespace(value ?? '').toLowerCase();
}

export function normalizeTahunAjaranName(value: string) {
  const normalized = normalizeWhitespace(value).replace(/\s*[\-/–—]\s*/g, '/');
  const match = normalized.match(/^(\d{4})\/(\d{4})$/);
  return match ? `${match[1]}/${match[2]}` : normalized;
}

export function parseTahunAjaranName(value: string) {
  const normalized = normalizeWhitespace(value).replace(/\s*[\-/–—]\s*/g, '/');
  const match = normalized.match(/^(\d{4})\/(\d{4})$/);
  if (!match) return null;

  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (endYear !== startYear + 1) return null;

  return {
    startYear,
    endYear,
    normalized: `${match[1]}/${match[2]}`,
  };
}

export function isValidTahunAjaranName(value: string) {
  return Boolean(parseTahunAjaranName(value));
}

export function tahunAjaranKey(value: string) {
  return normalizeTahunAjaranName(value).toLowerCase();
}

export function kelasKey(tingkat: string | null | undefined, namaKelas: string | null | undefined) {
  return `${normalizeComparisonKey(tingkat)}|${normalizeComparisonKey(namaKelas)}`;
}
