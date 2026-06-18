import type { Siswa } from '../../db/types';
import type { SiswaPeriodStatus } from '../../queries/siswaQueries';

type DisplayStatus = Siswa['status'] | SiswaPeriodStatus;

const styles: Record<DisplayStatus, string> = {
  calon: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  aktif: 'bg-success-50 text-success-700 dark:bg-success-950/30 dark:text-success-400',
  lulus: 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300',
  berhenti: 'bg-danger-50 text-danger-700 dark:bg-danger-950/30 dark:text-danger-400',
  keluar: 'bg-danger-50 text-danger-700 dark:bg-danger-950/30 dark:text-danger-400',
  batal_daftar: 'bg-warning-50 text-warning-700 dark:bg-warning-950/30 dark:text-warning-400',
  naik_kelas: 'bg-success-50 text-success-700 dark:bg-success-950/30 dark:text-success-400',
  alumni: 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300',
  tidak_lanjut: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  cuti: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
};

const labels: Record<DisplayStatus, string> = {
  calon: 'Calon',
  aktif: 'Aktif',
  lulus: 'Lulus',
  berhenti: 'Berhenti',
  keluar: 'Keluar',
  batal_daftar: 'Batal Daftar',
  naik_kelas: 'Naik Kelas',
  alumni: 'Alumni',
  tidak_lanjut: 'Tidak Lanjut',
  cuti: 'Cuti',
};

export default function StatusBadgeSiswa({ status }: { status: DisplayStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${styles[status]}`}>{labels[status]}</span>;
}
