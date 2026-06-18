import { Check, X as XIcon, Trash2, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import { useState } from 'react';
import { formatRupiah, formatTanggal } from '../../lib/format';
import type { Pembayaran, Tagihan, Siswa } from '../../db/types';

export interface PembayaranWithRelation extends Pembayaran {
  tagihan?: Tagihan | null;
  siswa?: Siswa | null;
}

export interface PembayaranGroup {
  groupId: string;
  items: PembayaranWithRelation[];
  first: PembayaranWithRelation;
  total: number;
  status: 'terverifikasi' | 'ditolak' | 'menunggu_verifikasi' | 'dibatalkan' | 'campuran';
}

interface PembayaranListProps {
  groups: PembayaranGroup[];
  showSiswa?: boolean;
  onVerify?: (groupId: string, action: 'confirm' | 'reject') => void;
  onCancel?: (group: PembayaranGroup) => void;
  onPrint?: (group: PembayaranGroup) => void;
  onClickSiswa?: (siswaId: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function PembayaranList({
  groups,
  showSiswa = true,
  onVerify,
  onCancel,
  onPrint,
  onClickSiswa,
  emptyTitle = 'Tidak ada pembayaran',
  emptyDescription = 'Belum ada riwayat pembayaran yang tercatat.'
}: PembayaranListProps) {
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/50">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{emptyTitle}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{emptyDescription}</p>
      </div>
    );
  }

  const renderStatus = (status: string) => {
    if (status === 'terverifikasi') return <span className="inline-flex rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-bold text-success-700 dark:bg-success-950/30 dark:text-success-400">Terverifikasi</span>;
    if (status === 'ditolak') return <span className="inline-flex rounded-full bg-danger-50 px-2.5 py-1 text-[11px] font-bold text-danger-700 dark:bg-danger-950/30 dark:text-danger-400">Ditolak</span>;
    if (status === 'dibatalkan') return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">Dibatalkan</span>;
    if (status === 'campuran') return <span className="inline-flex rounded-full bg-warning-50 px-2.5 py-1 text-[11px] font-bold text-warning-700 dark:bg-warning-950/30 dark:text-warning-400">Sebagian</span>;
    return <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 dark:bg-brand-950/30 dark:text-brand-400">Menunggu</span>;
  };

  return (
    <div className="space-y-4">
      {/* Mobile Card View (Hidden on medium screens and up) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {groups.map((group) => {
          const { first, total, status, items } = group;
          const isExpanded = expandedGroupId === group.groupId;
          const isMultiple = items.length > 1;
          const canVerify = onVerify && status === 'menunggu_verifikasi';
          const canCancel = onCancel && status === 'terverifikasi';
          const canPrint = onPrint && status === 'terverifikasi';

          return (
            <div key={group.groupId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatTanggal(first.tanggal)}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">{first.tagihan?.nama_tagihan ?? '-'}</p>
                </div>
                {renderStatus(status)}
              </div>

              {showSiswa && first.siswa && (
                <div 
                  className={`mb-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900/50 ${onClickSiswa ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors' : ''}`}
                  onClick={() => onClickSiswa && first.siswa && onClickSiswa(first.siswa.id)}
                >
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">Siswa</p>
                  <p className="font-bold text-slate-800 text-sm dark:text-slate-200">{first.siswa.nama}</p>
                </div>
              )}

              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/50 dark:bg-slate-900/20">
                <div className="flex justify-between items-center cursor-pointer" onClick={() => isMultiple && setExpandedGroupId(isExpanded ? null : group.groupId)}>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Metode & Nominal</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {isMultiple ? 'Pembayaran Split' : first.metode}
                      </p>
                      {isMultiple && (
                        isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
                    <p className="text-base font-bold text-slate-800 dark:text-slate-100">{formatRupiah(total)}</p>
                  </div>
                </div>

                {isMultiple && isExpanded && (
                  <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                    {items.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400">└ {item.metode}</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{formatRupiah(item.jumlah)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(canVerify || canCancel || canPrint) && (
                <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                  {canVerify && (
                    <>
                      <button onClick={() => onVerify(group.groupId, 'reject')} className="inline-flex items-center gap-1.5 rounded-lg border border-danger-200 bg-white px-3 py-1.5 text-xs font-bold text-danger-700 hover:bg-danger-50 dark:border-danger-900/50 dark:bg-slate-800 dark:text-danger-400 dark:hover:bg-danger-950/30">
                        <XIcon className="h-3.5 w-3.5" /> Tolak
                      </button>
                      <button onClick={() => onVerify(group.groupId, 'confirm')} className="inline-flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-success-700 dark:bg-success-700 dark:hover:bg-success-600">
                        <Check className="h-3.5 w-3.5" /> Terima
                      </button>
                    </>
                  )}
                  {canCancel && (
                    <button onClick={() => onCancel(group)} className="inline-flex items-center gap-1.5 rounded-lg text-xs font-bold text-danger-600 transition hover:text-danger-700 dark:text-danger-400 dark:hover:text-danger-300">
                      <Trash2 className="h-3.5 w-3.5" /> Batalkan
                    </button>
                  )}
                  {canPrint && (
                    <button onClick={() => onPrint(group)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                      <Printer className="h-3.5 w-3.5" /> Cetak
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Table View (Hidden on mobile) */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 md:block">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
              {showSiswa && <th className="px-4 py-3 font-semibold">Siswa</th>}
              <th className="px-4 py-3 font-semibold">Tagihan</th>
              <th className="px-4 py-3 font-semibold">Tanggal</th>
              <th className="px-4 py-3 font-semibold">Nominal</th>
              <th className="px-4 py-3 font-semibold">Metode</th>
              <th className="px-4 py-3 font-semibold text-center">Status</th>
              {(onVerify || onCancel || onPrint) && <th className="px-4 py-3 font-semibold text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {groups.map((group) => {
              const { first, total, status, items } = group;
              const isMultiple = items.length > 1;
              const canVerify = onVerify && status === 'menunggu_verifikasi';
              const canCancel = onCancel && status === 'terverifikasi';
              const canPrint = onPrint && status === 'terverifikasi';

              return (
                <tr key={group.groupId} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                  {showSiswa && (
                    <td className="px-4 py-3 align-top">
                      <div 
                        className={`font-bold text-slate-800 dark:text-slate-100 ${onClickSiswa ? 'cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors' : ''}`}
                        onClick={() => onClickSiswa && first.siswa && onClickSiswa(first.siswa.id)}
                      >
                        {first.siswa?.nama ?? '-'}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">{first.siswa?.nama_wali ?? '-'}</div>
                    </td>
                  )}
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">{first.tagihan?.nama_tagihan ?? '-'}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{first.tagihan?.jenis ?? '-'}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                    {formatTanggal(first.tanggal)}
                  </td>
                  <td className="px-4 py-3 align-top font-bold text-slate-800 dark:text-slate-100">
                    {formatRupiah(total)}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                    {!isMultiple ? (
                      first.metode
                    ) : (
                      <div className="space-y-1">
                        {items.map((item) => (
                          <div key={item.id} className="text-xs">
                            └ {item.metode} {formatRupiah(item.jumlah)}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-center">
                    {renderStatus(status)}
                  </td>
                  {(onVerify || onCancel || onPrint) && (
                    <td className="px-4 py-3 align-top text-right">
                      {canVerify && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => onVerify(group.groupId, 'reject')} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-danger-200 bg-white text-danger-700 hover:bg-danger-50 dark:border-danger-900/50 dark:bg-slate-800 dark:text-danger-400 dark:hover:bg-danger-950/30" title="Tolak">
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => onVerify(group.groupId, 'confirm')} className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-success-600 text-white hover:bg-success-700 dark:bg-success-700 dark:hover:bg-success-600" title="Terima">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {canCancel && (
                        <button onClick={() => onCancel(group)} className="inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold text-danger-600 transition hover:bg-danger-50 hover:text-danger-700 dark:text-danger-400 dark:hover:bg-danger-950/30 dark:hover:text-danger-300">
                          <Trash2 className="h-3.5 w-3.5" /> Batal
                        </button>
                      )}
                      {canPrint && (
                        <button onClick={() => onPrint(group)} className="inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                          <Printer className="h-3.5 w-3.5" /> Cetak
                        </button>
                      )}
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
