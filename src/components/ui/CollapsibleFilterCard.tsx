import { useState, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { FilterChip } from './FilterChipBar';
import FilterDrawer from './FilterDrawer';

interface CollapsibleFilterCardProps {
  summary?: string;
  chips: FilterChip[];
  onReset?: () => void;
  children?: ReactNode;
  mobileSummary?: string;
}

export default function CollapsibleFilterCard({ summary, chips, onReset, children, mobileSummary }: CollapsibleFilterCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {summary ? <span className="font-semibold text-slate-500 dark:text-slate-400">{summary}</span> : null}
        {mobileSummary ? <p className="w-full truncate text-xs font-bold text-slate-700 md:hidden dark:text-slate-300">{mobileSummary}</p> : null}
        {chips.map((chip) => (
          <span key={chip.key} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {chip.label}
            {chip.onRemove ? (
              <button type="button" onClick={chip.onRemove} className="rounded-full p-0.5 transition hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={`Hapus filter ${chip.label}`}>
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        )).map((chipNode, index) => <span key={chips[index].key} className="hidden md:inline-flex">{chipNode}</span>)}
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-extrabold text-white transition hover:bg-brand-500 md:ml-auto">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Ubah Filter
          </button>
        ) : null}
      </div>
      {open ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            {children}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {onReset ? (
              <button type="button" onClick={onReset} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                Reset Filter
              </button>
            ) : null}
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white transition hover:bg-brand-500">
              Terapkan
            </button>
          </div>
        </>
      ) : null}
      <div className="md:hidden">
        <FilterDrawer open={open} onClose={() => setOpen(false)} onReset={onReset}>
          {children}
        </FilterDrawer>
      </div>
    </div>
  );
}
