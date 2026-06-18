import type { ReactNode } from 'react';

type MetricTone = 'slate' | 'brand' | 'emerald' | 'amber' | 'danger' | 'violet';

interface SummaryMetricCardProps {
  title: string;
  value: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: MetricTone;
}

const toneClass: Record<MetricTone, string> = {
  slate: 'border-slate-100 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-100',
  brand: 'border-brand-100 bg-brand-50/70 text-brand-800 dark:border-brand-950/50 dark:bg-brand-950/20 dark:text-brand-200',
  emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-800 dark:border-emerald-950/50 dark:bg-emerald-950/20 dark:text-emerald-200',
  amber: 'border-amber-100 bg-amber-50/70 text-amber-800 dark:border-amber-950/50 dark:bg-amber-950/20 dark:text-amber-200',
  danger: 'border-danger-100 bg-danger-50/70 text-danger-800 dark:border-danger-950/50 dark:bg-danger-950/20 dark:text-danger-200',
  violet: 'border-violet-100 bg-violet-50/70 text-violet-800 dark:border-violet-950/50 dark:bg-violet-950/20 dark:text-violet-200',
};

const iconToneClass: Record<MetricTone, string> = {
  slate: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
  brand: 'bg-brand-100 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300',
  danger: 'bg-danger-100 text-danger-600 dark:bg-danger-900/50 dark:text-danger-300',
  violet: 'bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300',
};

export default function SummaryMetricCard({ title, value, description, icon, tone = 'slate' }: SummaryMetricCardProps) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wide opacity-70">{title}</p>
          <div className="mt-2 text-2xl font-extrabold tracking-tight">{value}</div>
        </div>
        {icon ? <div className={`shrink-0 rounded-xl p-2 ${iconToneClass[tone]}`}>{icon}</div> : null}
      </div>
      {description ? <div className="mt-2 text-xs font-semibold opacity-70">{description}</div> : null}
    </div>
  );
}
