import { formatRupiah, formatTanggal } from '../../lib/format';
import JenisTagihanBadge from '../ui/JenisTagihanBadge';
import StatusBadgeTagihan from '../ui/StatusBadgeTagihan';
import type { Tagihan, Siswa, Kelas } from '../../db/types';

export interface TagihanWithRelation extends Tagihan {
  siswa?: Siswa | null;
  activeClass?: Kelas | null;
}

interface TagihanListProps {
  tagihan: TagihanWithRelation[];
  showSiswa?: boolean;
  onClickSiswa?: (siswaId: string) => void;
  actionRenderer?: (item: TagihanWithRelation) => React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function TagihanList({ 
  tagihan, 
  showSiswa = true, 
  onClickSiswa,
  actionRenderer,
  emptyTitle = 'Tidak ada tagihan',
  emptyDescription = 'Daftar tagihan kosong untuk filter yang dipilih.'
}: TagihanListProps) {
  
  if (tagihan.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/50">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{emptyTitle}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mobile Card View (Hidden on medium screens and up) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {tagihan.map((item) => {
          const sisa = item.jumlah_total - item.sudah_dibayar;
          const isLunas = item.status === 'lunas';
          
          return (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{item.nama_tagihan}</p>
                  <JenisTagihanBadge jenis={item.jenis} className="mt-1" />
                </div>
                <StatusBadgeTagihan status={item.status} />
              </div>

              {showSiswa && item.siswa && (
                <div 
                  className={`mt-3 mb-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900/50 ${onClickSiswa ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors' : ''}`}
                  onClick={() => onClickSiswa && item.siswa && onClickSiswa(item.siswa.id)}
                >
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">Siswa</p>
                  <p className="font-bold text-slate-800 text-sm dark:text-slate-200">{item.siswa.nama}</p>
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-4 border-t border-slate-100 pt-3 dark:border-slate-700">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Jatuh Tempo</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatTanggal(item.jatuh_tempo)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Tagihan</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatRupiah(item.jumlah_total)}</p>
                </div>
                <div className="col-span-2 flex justify-between items-center rounded-lg bg-brand-50/50 p-2 dark:bg-brand-900/10">
                  <span className="text-sm font-bold text-brand-800 dark:text-brand-300">Sisa Tagihan</span>
                  <span className={`text-sm font-bold ${isLunas ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'}`}>{formatRupiah(sisa)}</span>
                </div>
              </div>

              {actionRenderer && (
                <div className="mt-3 flex justify-end border-t border-slate-100 pt-3 dark:border-slate-700">
                  {actionRenderer(item)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Table View (Hidden on mobile) */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 md:block">
        <table className="w-full min-w-[800px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
              {showSiswa && <th className="px-4 py-3 font-semibold">Siswa</th>}
              <th className="px-4 py-3 font-semibold">Tagihan</th>
              <th className="px-4 py-3 font-semibold">Jatuh Tempo</th>
              <th className="px-4 py-3 font-semibold text-right">Total</th>
              <th className="px-4 py-3 font-semibold text-right">Sisa</th>
              <th className="px-4 py-3 font-semibold text-center">Status</th>
              {actionRenderer && <th className="px-4 py-3 font-semibold text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {tagihan.map((item) => {
              const sisa = item.jumlah_total - item.sudah_dibayar;
              const isLunas = item.status === 'lunas';

              return (
                <tr key={item.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                  {showSiswa && (
                    <td className="px-4 py-3 align-top">
                      <div 
                        className={`font-bold text-slate-800 dark:text-slate-100 ${onClickSiswa ? 'cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors' : ''}`}
                        onClick={() => onClickSiswa && item.siswa && onClickSiswa(item.siswa.id)}
                      >
                        {item.siswa?.nama ?? '-'}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">{item.siswa?.nama_wali ?? '-'}</div>
                    </td>
                  )}
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">{item.nama_tagihan}</div>
                    <JenisTagihanBadge jenis={item.jenis} className="mt-1.5" />
                  </td>
                  <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                    {formatTanggal(item.jatuh_tempo)}
                  </td>
                  <td className="px-4 py-3 align-top text-right font-bold text-slate-700 dark:text-slate-200">
                    {formatRupiah(item.jumlah_total)}
                  </td>
                  <td className={`px-4 py-3 align-top text-right font-bold ${isLunas ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'}`}>
                    {formatRupiah(sisa)}
                  </td>
                  <td className="px-4 py-3 align-top text-center">
                    <StatusBadgeTagihan status={item.status} />
                  </td>
                  {actionRenderer && (
                    <td className="px-4 py-3 align-top text-right">
                      <div className="flex justify-end items-center gap-2">
                        {actionRenderer(item)}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
