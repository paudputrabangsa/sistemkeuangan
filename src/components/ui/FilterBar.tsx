import { Download, Filter } from 'lucide-react';
import FilterInput, { type FilterOption } from './FilterInput';

export interface FilterConfig extends Record<string, unknown> {
  id: string;
  type: 'select' | 'search' | 'date' | 'month';
  value: string;
  onChange: (val: string) => void;
  label?: string;
  options?: FilterOption[];
  placeholder?: string;
  compact?: boolean;
  className?: string;
}

export interface FilterBarProps {
  filters?: FilterConfig[];
  fromDate?: string;
  toDate?: string;
  onChangeFromDate?: (val: string) => void;
  onChangeToDate?: (val: string) => void;
  tahunAjaranId?: string;
  onChangeTahunAjaran?: (val: string) => void;
  tahunAjaranOptions?: { id: string; nama: string; aktif?: boolean }[];
  tahunAjaranLabel?: string;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export default function FilterBar({
  filters,
  fromDate,
  toDate,
  onChangeFromDate,
  onChangeToDate,
  tahunAjaranId,
  onChangeTahunAjaran,
  tahunAjaranOptions,
  tahunAjaranLabel,
  onExportPdf,
  onExportExcel,
  children,
  className,
}: FilterBarProps) {
  const hasDateRange = onChangeFromDate && onChangeToDate;

  return (
    <div
      className={`mb-4 flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm md:flex-row md:items-start dark:border-slate-800 dark:bg-slate-900/80 ${className ?? ''}`}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {onChangeTahunAjaran && tahunAjaranOptions && (
          <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-extrabold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <span className="shrink-0 whitespace-nowrap">{tahunAjaranLabel || 'Tahun Ajaran'}:</span>
            <select
              value={tahunAjaranId || ''}
              onChange={(e) => onChangeTahunAjaran(e.target.value)}
              className="h-8 min-w-0 border-0 bg-transparent px-0 text-xs font-semibold text-slate-700 outline-none focus:ring-0 dark:text-slate-200"
            >
              <option value="">Aktif</option>
              <option value="all">Semua Periode</option>
              {tahunAjaranOptions.map((ta) => (
                <option key={ta.id} value={ta.id}>
                  {ta.nama} {ta.aktif ? '(Aktif)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {hasDateRange && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">Tanggal:</span>
            <input
              type="date"
              value={fromDate || ''}
              onChange={(e) => onChangeFromDate(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
            <span className="text-xs text-slate-500">s/d</span>
            <input
              type="date"
              value={toDate || ''}
              onChange={(e) => onChangeToDate(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>
        )}

        {filters && filters.length > 0 && (
          <>
            {(onChangeTahunAjaran || hasDateRange) && (
              <div className="hidden h-6 w-px bg-slate-200 md:block dark:bg-slate-700" />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {filters.length > 1 && <Filter className="hidden h-4 w-4 text-slate-400 md:block" />}
              {filters.map((f) => (
                <FilterInput
                  key={f.id}
                  type={f.type}
                  value={f.value}
                  onChange={f.onChange}
                  label={f.label}
                  options={f.options}
                  placeholder={f.placeholder}
                  compact={f.compact ?? true}
                  className={f.className}
                />
              ))}
            </div>
          </>
        )}

        {children && (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        )}
      </div>

      {(onExportExcel || onExportPdf) && (
        <div className="flex shrink-0 items-center gap-2">
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              className="flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-900/30 dark:text-emerald-400"
            >
              <Download className="h-4 w-4" />
              Excel
            </button>
          )}
          {onExportPdf && (
            <button
              onClick={onExportPdf}
              className="flex h-9 items-center gap-2 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              <Download className="h-4 w-4" />
              Cetak PDF
            </button>
          )}
        </div>
      )}
    </div>
  );
}
