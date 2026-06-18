import { X } from 'lucide-react';

export interface FilterChip {
  key: string;
  label: string;
  onRemove?: () => void;
}

interface FilterChipBarProps {
  chips: FilterChip[];
  summary?: string;
  onReset?: () => void;
}

export default function FilterChipBar({ chips, summary, onReset }: FilterChipBarProps) {
  if (chips.length === 0 && !summary) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white/70 px-4 py-3 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
      {summary ? <span className="font-semibold text-slate-500 dark:text-slate-400">{summary}</span> : null}
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {chip.label}
          {chip.onRemove ? (
            <button type="button" onClick={chip.onRemove} className="rounded-full p-0.5 transition hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={`Hapus filter ${chip.label}`}>
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
      {onReset ? (
        <button type="button" onClick={onReset} className="ml-auto rounded-full px-3 py-1 font-extrabold text-brand-600 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/30">
          Reset
        </button>
      ) : null}
    </div>
  );
}
