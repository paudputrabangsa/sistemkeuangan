import type { LucideIcon } from 'lucide-react';

interface ReportSummaryCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

export default function ReportSummaryCard({ title, value, subtitle, icon: Icon, trend, trendValue }: ReportSummaryCardProps) {
  const displayValue = typeof value === 'number' ? value.toLocaleString('id-ID') : value;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{displayValue}</p>
          {(subtitle || trendValue) && (
            <div className="mt-2 flex items-center gap-2">
              {trendValue && (
                <span
                  className={`inline-flex items-center text-xs font-semibold ${
                    trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : trend === 'down' ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {trendValue}
                </span>
              )}
              {subtitle && <span className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className="rounded-xl bg-brand-50 p-3 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
    </div>
  );
}
