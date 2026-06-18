import { ChevronDown, Search } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterInputProps {
  type: 'select' | 'search' | 'date' | 'month';
  value: string;
  onChange: (val: string) => void;
  label?: string;
  options?: FilterOption[];
  placeholder?: string;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
}

const defaultCls =
  "w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100";

const compactCls =
  "h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

export default function FilterInput({
  type,
  value,
  onChange,
  label,
  options,
  placeholder,
  compact,
  className,
  disabled,
}: FilterInputProps) {
  const base = compact ? compactCls : defaultCls;
  const disabledCls = disabled ? 'cursor-not-allowed opacity-60' : '';
  const cls = [base, disabledCls, className].filter(Boolean).join(' ');

  const wrap = (node: React.ReactNode) => label ? (
    <label className={`inline-flex h-9 min-w-0 items-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 ${disabled ? 'opacity-70' : ''}`}>
      <span className="shrink-0 whitespace-nowrap pl-2">{label}:</span>
      <div className="flex-1 min-w-0 [&>input]:border-0 [&>input]:bg-transparent [&>input]:px-0 [&>input]:shadow-none [&>input]:focus:ring-0 [&>select]:border-0 [&>select]:bg-transparent [&>select]:px-0 [&>select]:shadow-none [&>select]:focus:ring-0">{node}</div>
      <ChevronDown className="mr-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
    </label>
  ) : node;

  if (type === 'select' && options) {
    const selectCls = label
      ? `${cls} appearance-none truncate cursor-pointer w-full`
      : `${cls} truncate max-w-full`;
    return wrap(
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls} disabled={disabled}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (type === 'search') {
    return (
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder || 'Cari...'}
          className={`${compact ? compactCls : defaultCls} w-full pl-9 ${className ?? ''}`}
        />
      </div>
    );
  }

  return wrap(
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className={cls}
    />
  );
}
