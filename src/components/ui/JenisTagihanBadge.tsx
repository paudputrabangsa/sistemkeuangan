const toneMap: Record<string, string> = {
  spp: 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300',
  pendaftaran: 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300',
  kegiatan: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300',
  administrasi: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default function JenisTagihanBadge({ jenis, className = '' }: { jenis: string; className?: string }) {
  const key = jenis.toLowerCase();
  const tone = toneMap[key] ?? toneMap.administrasi;

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${tone} ${className}`.trim()}>{jenis}</span>;
}
