type Source = 'tahun_berjalan' | 'tunggakan_lama' | 'piutang_arsip' | 'pra_tahun_ajaran';

interface TunggakanSourceBadgeProps {
  source: Source;
}

const sourceMeta: Record<Source, { label: string; className: string }> = {
  tahun_berjalan: { label: 'Tahun Berjalan', className: 'bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-950/30 dark:text-brand-300 dark:ring-brand-900' },
  tunggakan_lama: { label: 'Tunggakan Lama', className: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900' },
  piutang_arsip: { label: 'Piutang Arsip', className: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700' },
  pra_tahun_ajaran: { label: 'Pra Tahun Ajaran', className: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-900' },
};

export default function TunggakanSourceBadge({ source }: TunggakanSourceBadgeProps) {
  const meta = sourceMeta[source];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ${meta.className}`}>{meta.label}</span>;
}
