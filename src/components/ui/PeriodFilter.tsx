export type PeriodMode = 'hari_ini' | 'minggu_ini' | 'bulan_ini' | 'tahun_ajaran_ini' | 'custom';

interface PeriodFilterProps {
  mode: PeriodMode;
  fromDate: string;
  toDate: string;
  onChangeMode: (mode: PeriodMode) => void;
  onChangeFromDate: (value: string) => void;
  onChangeToDate: (value: string) => void;
}

const inputCls = 'h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

export default function PeriodFilter({ mode, fromDate, toDate, onChangeMode, onChangeFromDate, onChangeToDate }: PeriodFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-extrabold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        <span>Periode:</span>
        <select value={mode} onChange={(event) => onChangeMode(event.target.value as PeriodMode)} className="h-8 border-0 bg-transparent px-0 text-xs font-semibold text-slate-700 outline-none focus:ring-0 dark:text-slate-200">
          <option value="hari_ini">Hari ini</option>
          <option value="minggu_ini">Minggu ini</option>
          <option value="bulan_ini">Bulan ini</option>
          <option value="tahun_ajaran_ini">Tahun ajaran ini</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      {mode === 'custom' ? (
        <>
          <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-extrabold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <span>Dari:</span>
            <input type="date" value={fromDate} onChange={(event) => onChangeFromDate(event.target.value)} className={`${inputCls} border-0 bg-transparent px-0 focus:ring-0`} />
          </label>
          <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-extrabold text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <span>Sampai:</span>
            <input type="date" value={toDate} onChange={(event) => onChangeToDate(event.target.value)} className={`${inputCls} border-0 bg-transparent px-0 focus:ring-0`} />
          </label>
        </>
      ) : null}
    </div>
  );
}
