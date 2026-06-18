import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, X as XIcon, Trash2, Printer } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import FilterInput from '../components/ui/FilterInput';
import SectionCard from '../components/ui/SectionCard';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { SummaryGroupCard, SummaryGroupEmpty, SummaryGroupGrid, SummaryGroupRow } from '../components/ui/SummaryGroup';
import { formatRupiah, formatTanggal } from '../lib/format';
import { listPembayaranWithFilters } from '../queries/pembayaranQueries';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { getCurrentActor } from '../lib/actor';
import { batalkanPembayaran, confirmPaymentGroup, rejectPaymentGroup } from '../services/pembayaranService';
import { generateKwitansiPdf } from '../lib/pdfGenerator';
import { ServiceError } from '../services/service-errors';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';
import PeriodFilter, { type PeriodMode } from '../components/ui/PeriodFilter';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';

interface SettingOption { id: string; nama: string; aktif: boolean; }

const getToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const getStartOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const getEndOfMonth = () => { const d = new Date(); const end = new Date(d.getFullYear(), d.getMonth() + 1, 0); return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`; };
const getWeekStart = () => { const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6); return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`; };
export default function PembayaranPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [tahunAjaranFilter, setTahunAjaranFilter] = useState('');
  const [periodeMode, setPeriodeMode] = useState<PeriodMode>('bulan_ini');
  const [fromDate, setFromDate] = useState(getStartOfMonth());
  const [toDate, setToDate] = useState(getEndOfMonth());
  const [jenisFilter, setJenisFilter] = useState('');
  const [metode, setMetode] = useState('');
  const [statusFilter, setStatusFilter] = useState('valid');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const tahunAjaranOptions = useLiveQuery(() => listTahunAjaran(), [], []);
  const activeYear = tahunAjaranOptions.find((item) => item.aktif || item.status === 'aktif') ?? null;
  const jenisTagihanOptions = useLiveQuery(() => getPengaturanByKunci<SettingOption[]>('jenis_tagihan'), [], [] as SettingOption[]);
  const metodePembayaran = useLiveQuery(() => getPengaturanByKunci<SettingOption[]>('metode_pembayaran'), [], [] as SettingOption[]);
  const pembayaran = useLiveQuery(() => listPembayaranWithFilters({ fromDate: fromDate || undefined, toDate: toDate || undefined, tahunAjaranId: tahunAjaranFilter || undefined }), [fromDate, toDate, tahunAjaranFilter], []);

  function applyPeriodMode(mode: PeriodMode) {
    setPeriodeMode(mode);
    if (mode === 'hari_ini') { setFromDate(getToday()); setToDate(getToday()); }
    if (mode === 'minggu_ini') { setFromDate(getWeekStart()); setToDate(getToday()); }
    if (mode === 'bulan_ini') { setFromDate(getStartOfMonth()); setToDate(getEndOfMonth()); }
    if (mode === 'tahun_ajaran_ini' && activeYear) { setFromDate(activeYear.mulai); setToDate(activeYear.selesai); }
  }

  function resetFilters() {
    setTahunAjaranFilter('');
    setPeriodeMode('hari_ini');
    setFromDate(getToday());
    setToDate(getToday());
    setJenisFilter('');
    setMetode('');
    setStatusFilter('valid');
    setSearch('');
    setPage(1);
  }

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return pembayaran.filter((item) => {
      if (metode && item.metode !== metode) return false;
      if (jenisFilter && item.tagihan?.jenis !== jenisFilter) return false;
      if (statusFilter === 'valid' && (item.deleted_at || item.status_verifikasi === 'ditolak')) return false;
      if (statusFilter === 'dibatalkan' && !item.deleted_at && item.status_verifikasi !== 'ditolak') return false;
      if (keyword && !`${item.siswa?.nama ?? ''} ${item.siswa?.nama_wali ?? ''} ${item.tagihan?.nama_tagihan ?? ''}`.toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [metode, pembayaran, search, jenisFilter, statusFilter]);

  // Build payment groups for confirm/reject/cancel/print (1 kwitansi per group)
  const groupMap = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((item) => {
      const gid = item.payment_group_id || item.id;
      map.set(gid, [...(map.get(gid) ?? []), item]);
    });
    return map;
  }, [filtered]);

  const summary = useMemo(() => {
    const byMethod = new Map<string, number>();
    let total = 0;
    let count = 0;
    filtered.forEach((item) => {
      if ((item.status_verifikasi ?? 'terverifikasi') !== 'terverifikasi') return;
      if (item.deleted_at) return;
      total += item.jumlah;
      count += 1;
      byMethod.set(item.metode, (byMethod.get(item.metode) ?? 0) + item.jumlah);
    });
    return { total, count, byMethod: Array.from(byMethod.entries()).sort((a, b) => b[1] - a[1]) };
  }, [filtered]);

  const renderStatus = (item: typeof filtered[0]) => {
    if (item.deleted_at || item.status_verifikasi === 'ditolak') return <span className="inline-flex rounded-full bg-danger-50 px-2.5 py-1 text-[11px] font-bold text-danger-700 dark:bg-danger-950/30 dark:text-danger-400">Dibatalkan</span>;
    if (item.status_verifikasi === 'menunggu_verifikasi') return <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 dark:bg-brand-950/30 dark:text-brand-400">Menunggu</span>;
    return <span className="inline-flex rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-bold text-success-700 dark:bg-success-950/30 dark:text-success-400">Valid</span>;
  };

  // --- Handlers ---
  async function handleVerify(groupId: string, action: 'confirm' | 'reject') {
    if (!actor) return;
    requestConfirm({
      title: action === 'confirm' ? 'Konfirmasi Pembayaran?' : 'Tolak Pembayaran?',
      description: action === 'confirm' ? 'Apakah Anda yakin ingin mengkonfirmasi pembayaran ini?' : 'Apakah Anda yakin ingin menolak pembayaran ini?',
      confirmLabel: action === 'confirm' ? 'Ya, Konfirmasi' : 'Ya, Tolak',
      variant: action === 'confirm' ? 'info' : 'danger',
      onConfirm: async () => {
        setProcessingId(groupId);
        try {
          if (action === 'confirm') {
            await confirmPaymentGroup(actor, groupId);
            addToast({ type: 'success', title: 'Berhasil', message: 'Pembayaran berhasil dikonfirmasi.' });
          } else {
            await rejectPaymentGroup(actor, groupId);
            addToast({ type: 'success', title: 'Berhasil', message: 'Pembayaran ditolak.' });
          }
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : error instanceof Error ? error.message : 'Gagal memproses.' });
        } finally {
          setProcessingId(null);
        }
      }
    });
  }

  async function handleCancel(item: typeof filtered[0]) {
    if (!actor) return;
    const groupId = item.payment_group_id || item.id;
    const groupItems = groupMap.get(groupId) ?? [item];
    const total = groupItems.reduce((s, i) => s + i.jumlah, 0);
    requestConfirm({
      title: 'Batalkan pembayaran?',
      description: `Batalkan pembayaran sebesar ${formatRupiah(total)}? Status tagihan akan diperbarui.`,
      confirmLabel: 'Ya, Batalkan',
      variant: 'danger',
      requireInput: true,
      inputLabel: 'Alasan Pembatalan',
      onConfirm: async (catatan?: string) => {
        setProcessingId(groupId);
        try {
          for (const gi of groupItems) {
            await batalkanPembayaran(actor, gi.id, catatan || '-');
          }
          addToast({ type: 'success', title: 'Berhasil', message: `${groupItems.length} pembayaran berhasil dibatalkan.` });
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal membatalkan.' });
        } finally {
          setProcessingId(null);
        }
      }
    });
  }

  function handlePrint(item: typeof filtered[0]) {
    const groupId = item.payment_group_id || item.id;
    const groupItems = groupMap.get(groupId) ?? [item];
    const total = groupItems.reduce((s, i) => s + i.jumlah, 0);
    generateKwitansiPdf({
      groupId,
      items: groupItems,
      first: groupItems[0],
      total,
      status: 'terverifikasi',
    }).catch(console.error);
  }

  // Determine which group IDs already have a row rendered (so we only show action on the first row per group)
  const renderedGroupActions = new Set<string>();

  const pembayaranFilters = useMemo(() => [
    { id: 'jenis', label: 'Jenis', type: 'select' as const, value: jenisFilter, onChange: setJenisFilter, options: [
      { value: '', label: 'Semua Jenis' },
      ...(jenisTagihanOptions ?? []).filter((i) => i.aktif).map((i) => ({ value: i.nama.toLowerCase(), label: i.nama })),
    ], compact: false },
    { id: 'metode', label: 'Metode', type: 'select' as const, value: metode, onChange: setMetode, options: [
      { value: '', label: 'Semua Metode' },
      ...(metodePembayaran ?? []).filter((i) => i.aktif).map((i) => ({ value: i.nama, label: i.nama })),
    ], compact: false },
    { id: 'status', label: 'Status', type: 'select' as const, value: statusFilter, onChange: setStatusFilter, options: [
      { value: '', label: 'Semua Status' }, { value: 'valid', label: 'Valid' }, { value: 'dibatalkan', label: 'Dibatalkan/Ditolak' },
    ], compact: false },
  ], [jenisFilter, metode, statusFilter, jenisTagihanOptions, metodePembayaran]);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader
        title="Pembayaran"
        description="Overview semua aktivitas pembayaran lintas siswa."
        actions={
          <button type="button" onClick={() => navigate('/pembayaran/new')} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:from-brand-500 hover:to-indigo-500">
            <Plus className="h-3.5 w-3.5" />
            Catat Pembayaran
          </button>
        }
      />

      <SummaryGroupGrid>
        <SummaryGroupCard title="Penerimaan" tone="emerald" variant="featured">
          <SummaryGroupRow label="Total Penerimaan" value={formatRupiah(summary.total)} highlight valueClassName="text-2xl" />
          <SummaryGroupRow label="Jumlah Transaksi" value={summary.count} />
        </SummaryGroupCard>
        <SummaryGroupCard title="Per Metode" tone="violet" variant="receipt">
          {summary.byMethod.length === 0 ? <SummaryGroupEmpty /> : summary.byMethod.map(([name, total]) => (
            <SummaryGroupRow key={name} label={name} value={formatRupiah(total)} />
          ))}
        </SummaryGroupCard>
      </SummaryGroupGrid>

      <CollapsibleFilterCard
        chips={[
          { key: 'periode', label: `Periode: ${fromDate === toDate ? formatTanggal(fromDate) : `${formatTanggal(fromDate)} - ${formatTanggal(toDate)}`}` },
          { key: 'status', label: `Status: ${statusFilter === 'valid' ? 'Valid' : statusFilter === 'dibatalkan' ? 'Dibatalkan/Ditolak' : 'Semua'}` },
          { key: 'metode', label: `Metode: ${metode || 'Semua'}` },
        ]}
        summary={`Menampilkan ${filtered.length} transaksi`}
        mobileSummary={`${fromDate === toDate ? formatTanggal(fromDate) : `${formatTanggal(fromDate)} - ${formatTanggal(toDate)}`} · Status: ${statusFilter === 'valid' ? 'Valid' : statusFilter || 'Semua'}`}
        onReset={resetFilters}
      >
        <div className="col-span-full">
          <PeriodFilter mode={periodeMode} fromDate={fromDate} toDate={toDate} onChangeMode={applyPeriodMode} onChangeFromDate={(value) => { setPeriodeMode('custom'); setFromDate(value); }} onChangeToDate={(value) => { setPeriodeMode('custom'); setToDate(value); }} />
        </div>
        <FilterInput type="select" value={tahunAjaranFilter} onChange={setTahunAjaranFilter} label="Tahun Ajaran" compact options={[{ value: '', label: 'Aktif & Draft' }, { value: 'all', label: 'Semua Periode' }, ...tahunAjaranOptions.map((t) => ({ value: t.id, label: t.nama }))]} />
        {pembayaranFilters.map((filter) => (
          <FilterInput key={filter.id} type={filter.type} value={filter.value} onChange={filter.onChange} label={filter.label} options={filter.options} placeholder={'placeholder' in filter ? String(filter.placeholder) : undefined} compact />
        ))}
      </CollapsibleFilterCard>
      
      {/* Tabel Pembayaran */}
      <SectionCard
        title="Daftar Pembayaran"
        actions={<FilterInput type="search" value={search} onChange={setSearch} label="Cari" placeholder="Nama siswa..." compact />}
      >
        {filtered.length === 0 ? (
          <EmptyState title="Tidak ada pembayaran" description="Belum ada riwayat pembayaran yang tercatat." />
        ) : (
          <>
            {/* MOBILE: card list per payment group */}
            <div className="space-y-3 sm:hidden">
              {(() => {
                const paginated = paginateData(filtered, page, pageSize);
                const seen = new Set<string>();
                const groups: string[] = [];
                for (const item of paginated) {
                  const gid = item.payment_group_id || item.id;
                  if (!seen.has(gid)) { seen.add(gid); groups.push(gid); }
                }
                return groups.map((groupId) => {
                  const groupItems = groupMap.get(groupId) ?? [];
                  const firstItem = groupItems[0];
                  if (!firstItem) return null;
                  const isCancelled = Boolean(firstItem.deleted_at) || (firstItem.status_verifikasi ?? 'terverifikasi') === 'ditolak';
                  const groupHasPending = groupItems.some((gi) => !gi.deleted_at && gi.status_verifikasi === 'menunggu_verifikasi');
                  const groupAllVerified = groupItems.every((gi) => gi.deleted_at || gi.status_verifikasi === 'terverifikasi');
                  const total = groupItems.reduce((s, gi) => s + gi.jumlah, 0);
                  return (
                    <div key={groupId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{firstItem.siswa?.nama ?? '-'}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{formatTanggal(firstItem.tanggal)}</p>
                        </div>
                        <div className="shrink-0">{renderStatus(firstItem)}</div>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {Array.from(new Set(groupItems.map((gi) => gi.tagihan?.nama_tagihan ?? '-'))).join(', ')}
                      </p>
                      <div className="mt-2 space-y-1">
                        {groupItems.map((gi) => (
                          <div key={gi.id} className="flex items-start justify-between text-xs gap-2">
                            <span className="text-slate-500 break-words flex-1">{groupItems.length > 1 ? `${gi.tagihan?.nama_tagihan ?? '-'} - ${gi.metode}` : gi.metode}</span>
                            <span className="font-semibold shrink-0 text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatRupiah(gi.jumlah)}</span>
                          </div>
                        ))}
                        {groupItems.length > 1 && (
                          <>
                            <div className="border-t border-dashed border-slate-200 dark:border-slate-700" />
                            <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-100">
                              <span>Total</span>
                              <span>{formatRupiah(total)}</span>
                            </div>
                          </>
                        )}
                      </div>
                      {firstItem.no_kuitansi && <p className="mt-2 text-[11px] text-slate-400">Kwitansi: {firstItem.no_kuitansi}</p>}
                      {(groupHasPending || (groupAllVerified && !isCancelled)) && (
                        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          {groupHasPending && (
                            <>
                              <button type="button" onClick={() => handleVerify(groupId, 'confirm')} disabled={processingId === groupId} className="inline-flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-success-700 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Konfirmasi</button>
                              <button type="button" onClick={() => handleVerify(groupId, 'reject')} disabled={processingId === groupId} className="inline-flex items-center gap-1.5 rounded-lg border border-danger-200 bg-white px-3 py-2 text-xs font-bold text-danger-700 transition hover:bg-danger-50 disabled:opacity-50 dark:border-danger-900/50 dark:bg-slate-800 dark:text-danger-400"><XIcon className="h-3.5 w-3.5" />Tolak</button>
                            </>
                          )}
                          {groupAllVerified && !isCancelled && (
                            <>
                              <button type="button" onClick={() => handlePrint(firstItem)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"><Printer className="h-3.5 w-3.5" />Cetak</button>
                              <button type="button" onClick={() => handleCancel(firstItem)} disabled={processingId === groupId} className="inline-flex items-center gap-1.5 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-xs font-bold text-danger-700 transition hover:bg-danger-100 disabled:opacity-50 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400"><Trash2 className="h-3.5 w-3.5" />Batalkan</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* DESKTOP: table */}
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Tanggal</th>
                    <th className="px-4 py-3 font-semibold">Nama Siswa</th>
                    <th className="px-4 py-3 font-semibold">Nama Tagihan</th>
                    <th className="px-4 py-3 font-semibold text-right">Nominal</th>
                    <th className="px-4 py-3 font-semibold">Metode</th>
                    <th className="px-4 py-3 font-semibold text-center">Status</th>
                    <th className="px-4 py-3 font-semibold">No Kwitansi</th>
                    <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {paginateData(filtered, page, pageSize).map((item) => {
                    const groupId = item.payment_group_id || item.id;
                    const isFirstInGroup = !renderedGroupActions.has(groupId);
                    if (isFirstInGroup) renderedGroupActions.add(groupId);
                    const isCancelled = Boolean(item.deleted_at) || (item.status_verifikasi ?? 'terverifikasi') === 'ditolak';

                    const groupItems = groupMap.get(groupId) ?? [item];
                    const groupHasPending = groupItems.some((gi) => !gi.deleted_at && gi.status_verifikasi === 'menunggu_verifikasi');
                    const groupAllVerified = groupItems.every((gi) => gi.deleted_at || gi.status_verifikasi === 'terverifikasi');

                    return (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="whitespace-nowrap px-4 py-3">{formatTanggal(item.tanggal)}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{item.siswa?.nama ?? '-'}</td>
                        <td className="px-4 py-3 font-medium">{item.tagihan?.nama_tagihan ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatRupiah(item.jumlah)}</td>
                        <td className="px-4 py-3">{item.metode}</td>
                        <td className="px-4 py-3 text-center">{renderStatus(item)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{item.no_kuitansi || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          {isFirstInGroup && (
                            <div className="flex justify-end gap-1.5">
                              {groupHasPending && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleVerify(groupId, 'confirm')}
                                    disabled={processingId === groupId}
                                    className="inline-flex items-center gap-1 rounded-lg bg-success-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-success-700 disabled:opacity-50"
                                    title="Konfirmasi"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleVerify(groupId, 'reject')}
                                    disabled={processingId === groupId}
                                    className="inline-flex items-center gap-1 rounded-lg border border-danger-200 bg-white px-2.5 py-1.5 text-xs font-bold text-danger-700 transition hover:bg-danger-50 disabled:opacity-50 dark:border-danger-900/50 dark:bg-slate-800 dark:text-danger-400"
                                    title="Tolak"
                                  >
                                    <XIcon className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              {groupAllVerified && !isCancelled && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handlePrint(item)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                    title="Cetak Kwitansi"
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCancel(item)}
                                    disabled={processingId === groupId}
                                    className="inline-flex items-center gap-1 rounded-lg border border-danger-100 bg-danger-50 px-2.5 py-1.5 text-xs font-bold text-danger-700 transition hover:bg-danger-100 disabled:opacity-50 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400"
                                    title="Batalkan"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </SectionCard>
    </div>
  );
}
