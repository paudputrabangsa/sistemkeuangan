import { useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore, type Toast } from '../../store/toastStore';

const TOAST_DURATION = 6000;

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success: 'bg-white border-success-200 text-success-800 dark:bg-slate-900 dark:border-success-900/50 dark:text-success-400',
  error: 'bg-white border-danger-200 text-danger-800 dark:bg-slate-900 dark:border-danger-900/50 dark:text-danger-400',
  warning: 'bg-white border-amber-200 text-amber-800 dark:bg-slate-900 dark:border-amber-900/50 dark:text-amber-400',
  info: 'bg-white border-brand-200 text-brand-800 dark:bg-slate-900 dark:border-brand-900/50 dark:text-brand-400',
};

const iconColors = {
  success: 'text-success-600 dark:text-success-500',
  error: 'text-danger-600 dark:text-danger-500',
  warning: 'text-amber-600 dark:text-amber-500',
  info: 'text-brand-600 dark:text-brand-500',
};

function ToastItem({ toast, remove }: { toast: Toast; remove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      remove(toast.id);
    }, toast.duration || TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [toast, remove]);

  const Icon = icons[toast.type];

  return (
    <div className={`pointer-events-auto flex w-full max-w-sm overflow-hidden rounded-xl border shadow-lg transition-all animate-fade-in ${colors[toast.type]}`}>
      <div className="flex w-full items-start p-4">
        <div className="flex-shrink-0">
          <Icon className={`h-5 w-5 ${iconColors[toast.type]}`} aria-hidden="true" />
        </div>
        <div className="ml-3 w-0 flex-1 pt-0.5">
          <p className="text-sm font-bold">{toast.title}</p>
          {toast.message && <p className="mt-1 text-sm opacity-90">{toast.message}</p>}
        </div>
        <div className="ml-4 flex flex-shrink-0">
          <button
            type="button"
            className="inline-flex rounded-md bg-transparent text-current opacity-50 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
            onClick={() => remove(toast.id)}
          >
            <span className="sr-only">Tutup</span>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 z-50 flex items-start px-4 py-6 sm:p-6"
    >
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} remove={removeToast} />
        ))}
      </div>
    </div>
  );
}
