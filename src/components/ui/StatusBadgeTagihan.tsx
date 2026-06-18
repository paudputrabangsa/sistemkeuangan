import type { Tagihan } from '../../db/types';

const styles: Record<Tagihan['status'], string> = {
  belum_bayar: 'bg-danger-50 text-danger-700 dark:bg-danger-950/30 dark:text-danger-400',
  sebagian: 'bg-warning-50 text-warning-700 dark:bg-warning-950/30 dark:text-warning-400',
  lunas: 'bg-success-50 text-success-700 dark:bg-success-950/30 dark:text-success-400',
  dibatalkan: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const labels: Record<Tagihan['status'], string> = {
  belum_bayar: 'Belum Bayar',
  sebagian: 'Sebagian',
  lunas: 'Lunas',
  dibatalkan: 'Dibatalkan',
};

export default function StatusBadgeTagihan({ status }: { status: Tagihan['status'] }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${styles[status]}`}>{labels[status]}</span>;
}
