import type { ReactNode } from 'react';

interface SummaryGroupGridProps {
  children: ReactNode;
  className?: string;
}

type SummaryGroupVariant = 'default' | 'featured' | 'receipt';
type SummaryGroupLayout = 'row' | 'mini';

interface SummaryGroupCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  tone?: SummaryTone;
  variant?: SummaryGroupVariant;
  layout?: SummaryGroupLayout;
}

interface SummaryGroupRowProps {
  label: ReactNode;
  value: ReactNode;
  highlight?: boolean;
  valueClassName?: string;
}

interface SummaryGroupMiniCardProps {
  label: ReactNode;
  value: ReactNode;
  highlight?: boolean;
  valueClassName?: string;
}

type SummaryTone = 'brand' | 'emerald' | 'amber' | 'danger' | 'slate' | 'violet';

const toneStyles: Record<SummaryTone, { accent: string; badge: string; highlight: string; value: string }> = {
  brand: {
    accent: 'bg-gradient-to-r from-brand-500 to-brand-400',
    badge: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
    highlight: 'bg-brand-50/50 dark:bg-brand-500/5',
    value: 'text-brand-700 dark:text-brand-300',
  },
  emerald: {
    accent: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    highlight: 'bg-emerald-50/50 dark:bg-emerald-500/5',
    value: 'text-emerald-700 dark:text-emerald-300',
  },
  amber: {
    accent: 'bg-gradient-to-r from-amber-500 to-amber-400',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    highlight: 'bg-amber-50/50 dark:bg-amber-500/5',
    value: 'text-amber-700 dark:text-amber-300',
  },
  danger: {
    accent: 'bg-gradient-to-r from-danger-500 to-danger-400',
    badge: 'bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-300',
    highlight: 'bg-danger-50/50 dark:bg-danger-500/5',
    value: 'text-danger-700 dark:text-danger-300',
  },
  slate: {
    accent: 'bg-gradient-to-r from-slate-400 to-slate-300',
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    highlight: 'bg-slate-50 dark:bg-slate-800/50',
    value: 'text-slate-800 dark:text-slate-100',
  },
  violet: {
    accent: 'bg-gradient-to-r from-violet-500 to-violet-400',
    badge: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
    highlight: 'bg-violet-50/50 dark:bg-violet-500/5',
    value: 'text-violet-700 dark:text-violet-300',
  },
};

export function SummaryGroupGrid({ children, className = '' }: SummaryGroupGridProps) {
  return <div className={`grid grid-cols-1 gap-4 xl:grid-cols-2 ${className}`.trim()}>{children}</div>;
}

export function SummaryGroupCard({ title, children, className = '', tone = 'brand', variant = 'default', layout = 'row' }: SummaryGroupCardProps) {
  const toneClass = toneStyles[tone];
  
  const baseCardClass = "group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white dark:border-slate-800 dark:bg-slate-900 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700";
  
  let shadowClass = 'shadow-sm';
  if (variant === 'featured') {
    shadowClass = 'shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.1)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]';
  } else if (variant === 'receipt') {
    shadowClass = 'shadow-sm';
  } else {
    shadowClass = 'shadow-sm hover:shadow-md';
  }

  const childrenContainer = layout === 'mini'
    ? 'mt-5 flex flex-wrap gap-y-6 gap-x-8'
    : variant === 'receipt'
    ? 'mt-3 divide-y divide-dashed divide-slate-200 dark:divide-slate-800'
    : 'mt-4 space-y-2';

  return (
    <div className={`${baseCardClass} ${shadowClass} p-5 ${className}`.trim()}>
      <div className={`absolute inset-x-0 top-0 h-1 opacity-90 ${toneClass.accent}`} />
      <div className="flex items-center justify-between gap-3">
        <p className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${toneClass.badge}`}>{title}</p>
      </div>
      <div className={childrenContainer}>{children}</div>
    </div>
  );
}

export function SummaryGroupRow({ label, value, highlight = false, valueClassName = '' }: SummaryGroupRowProps) {
  return (
    <div className={`flex items-start justify-between gap-4 px-1 py-2 ${highlight ? 'rounded-xl px-3 mt-2 bg-slate-50 dark:bg-slate-800/40' : ''}`.trim()}>
      <span className={`text-sm break-words flex-1 ${highlight ? 'font-semibold text-slate-700 dark:text-slate-200' : 'font-medium text-slate-500 dark:text-slate-400'}`}>{label}</span>
      <span className={`text-right font-bold tabular-nums tracking-tight whitespace-nowrap shrink-0 ${highlight ? 'text-lg text-slate-900 dark:text-white' : 'text-sm text-slate-800 dark:text-slate-200'} ${valueClassName}`.trim()}>{value}</span>
    </div>
  );
}

export function SummaryGroupMiniCard({ label, value, highlight = false, valueClassName = '' }: SummaryGroupMiniCardProps) {
  return (
    <div className={`flex flex-col justify-start transition-all duration-200 min-w-[120px] ${highlight ? 'scale-[1.02] origin-left' : ''}`.trim()}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 font-black tabular-nums tracking-tight truncate ${highlight ? 'text-2xl text-brand-600 dark:text-brand-400' : 'text-xl text-slate-800 dark:text-slate-100'} ${valueClassName}`.trim()} title={typeof value === 'string' ? value : undefined}>{value}</p>
    </div>
  );
}

export function SummaryGroupEmpty({ children = 'Belum ada data' }: { children?: ReactNode }) {
  return <p className="text-sm italic text-slate-400 dark:text-slate-500 pt-2">{children}</p>;
}
