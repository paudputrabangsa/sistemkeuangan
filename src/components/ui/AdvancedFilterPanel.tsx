import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';

interface AdvancedFilterPanelProps {
  title?: string;
  activeCount?: number;
  children: ReactNode;
  onReset?: () => void;
}

export default function AdvancedFilterPanel({ title = 'Filter Lanjutan', activeCount = 0, children, onReset }: AdvancedFilterPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand-900 dark:hover:bg-brand-950/30 dark:hover:text-brand-300"
      >
        <SlidersHorizontal className="h-4 w-4" />
        {title}
        {activeCount > 0 ? <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] text-white">{activeCount}</span> : null}
      </button>
      {open ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
          <div className="flex justify-end gap-2">
            {onReset ? (
              <button type="button" onClick={onReset} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                Reset Lanjutan
              </button>
            ) : null}
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white transition hover:bg-brand-500">
              Terapkan
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
