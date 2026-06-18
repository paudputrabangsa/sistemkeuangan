import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface FilterDrawerProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  onReset?: () => void;
}

export default function FilterDrawer({ open, title = 'Ubah Filter', subtitle, children, onClose, onReset }: FilterDrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden md:absolute md:z-40 md:rounded-2xl">
      <button type="button" aria-label="Tutup filter" onClick={onClose} className="absolute inset-0 bg-slate-950/10 backdrop-blur-[1px] dark:bg-slate-950/30" />
      <aside className="absolute bottom-0 right-0 top-auto flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:top-0 md:h-full md:max-h-none md:w-[420px] md:rounded-l-2xl md:rounded-tr-none">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-1 gap-2">{children}</div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          {onReset ? (
            <button type="button" onClick={onReset} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
              Reset Filter
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="h-9 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white transition hover:bg-brand-500">
            Terapkan
          </button>
        </div>
      </aside>
    </div>
  );
}
