import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, Save } from 'lucide-react';
import Modal from './Modal';

type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called when user confirms. Can be async — button shows loading state automatically. */
  onConfirm: (input?: string) => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  requireInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
}

const variantStyles: Record<ConfirmVariant, {
  iconBg: string;
  iconColor: string;
  Icon: typeof Trash2;
  confirmBtn: string;
}> = {
  danger: {
    iconBg: 'bg-danger-50 dark:bg-danger-950/30',
    iconColor: 'text-danger-600 dark:text-danger-400',
    Icon: Trash2,
    confirmBtn:
      'bg-danger-600 text-white shadow-lg shadow-danger-600/20 hover:bg-danger-500 focus:ring-danger-300 dark:focus:ring-danger-800',
  },
  warning: {
    iconBg: 'bg-amber-50 dark:bg-amber-950/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    Icon: AlertTriangle,
    confirmBtn:
      'bg-amber-600 text-white shadow-lg shadow-amber-600/20 hover:bg-amber-500 focus:ring-amber-300 dark:focus:ring-amber-800',
  },
  info: {
    iconBg: 'bg-brand-50 dark:bg-brand-950/30',
    iconColor: 'text-brand-600 dark:text-brand-400',
    Icon: Save,
    confirmBtn:
      'bg-brand-600 text-white shadow-lg shadow-brand-600/20 hover:bg-brand-500 focus:ring-brand-300 dark:focus:ring-brand-800',
  },
};

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  variant = 'danger',
  requireInput = false,
  inputLabel = 'Catatan',
  inputPlaceholder = 'Masukkan alasan atau catatan di sini...',
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const style = variantStyles[variant];
  const IconComponent = style.Icon;

  useEffect(() => {
    if (open) {
      setInputValue('');
    }
  }, [open]);

  async function handleConfirm() {
    if (requireInput && !inputValue.trim()) return;
    setIsLoading(true);
    try {
      await onConfirm(requireInput ? inputValue.trim() : undefined);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={isLoading ? () => {} : onClose} size="sm" showClose={false} closeOnBackdrop={!isLoading}>
      <div className="p-6 sm:p-8">
        {/* Icon */}
        <div className="mb-5 flex justify-center">
          <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${style.iconBg}`}>
            <IconComponent className={`h-7 w-7 ${style.iconColor}`} />
          </div>
        </div>

        {/* Content */}
        <div className="text-center">
          <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{title}</h3>
          {description && (
            <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>

        {requireInput && (
          <div className="mt-5 text-left">
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">
              {inputLabel} <span className="text-danger-600">*</span>
            </label>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-brand-500"
              rows={3}
              placeholder={inputPlaceholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
            />
          </div>
        )}

        {/* Actions */}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:focus:ring-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isLoading || (requireInput && !inputValue.trim())}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${style.confirmBtn}`}
          >
            {isLoading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Memproses...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
