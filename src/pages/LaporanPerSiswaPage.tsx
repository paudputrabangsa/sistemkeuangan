import { Fragment, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';
import FilterInput from '../components/ui/FilterInput';
import type { FilterChip } from '../components/ui/FilterChipBar';
import SectionCard from '../components/ui/SectionCard';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { SummaryGroupCard, SummaryGroupGrid, SummaryGroupRow } from '../components/ui/SummaryGroup';
import StatusBadgeTagihan from '../components/ui/StatusBadgeTagihan';
import JenisTagihanBadge from '../components/ui/JenisTagihanBadge';
import { formatRupiah, formatTanggal, formatKelasLabel, formatMonthYear } from '../lib/format';
import { listSiswaWithFilters } from '../queries/siswaQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { db } from '../db';
import { exportLaporanPerSiswaExcel } from '../lib/excelGenerator';
import { generateLaporanPerSiswaPdf } from '../lib/pdfGenerator';

interface SettingOption { id: string; nama: string; aktif: boolean; }

export default function LaporanPerSiswaPage() {
  const [selectedSiswaId, setSelectedSiswaId] = useState('');
  const [taFilter, setTaFilter] = useState('all'); // default semua TA
  const [jenisFilter, setJenisFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchSiswa, setSearchSiswa] = useState('');
  const [expandedTagihanId, setExpandedTagihanId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  function resetFilters() {
    setTaFilter('all');
    setJenisFilter('');
    setStatusFilter('');
    setPage(1);
  }

  const tahunAjaranOptions = useLiveQuery(() => listTahunAjaran(), [], []);
  const jenisTagihanOptions = useLiveQuery(() => getPengaturanByKunci<SettingOption[]>('jenis_tagihan'), [], [] as SettingOption[]);

  const filterChips: FilterChip[] = [
    { key: 'ta', label: `TA: ${tahunAjaranOptions.find((t) => t.id === taFilter)?.nama ?? 'Semua'}` },
    { key: 'jenis', label: `Jenis: ${jenisFilter ? jenisFilter.charAt(0).toUpperCase() + jenisFilter.slice(1) : 'Semua'}` },
    { key: 'status', label: `Status: ${statusFilter ? statusFilter.replace('_', ' ') : 'Semua'}` },
  ];
  const siswaList = useLiveQuery(() => listSiswaWithFilters({ tahunAjaranId: 'all' }), [], []);
  const taMap = new Map(tahunAjaranOptions.map((t) => [t.id, t]));
  const tahunAjaranMap = new Map(tahunAjaranOptions.map((t) => [t.id, t.nama]));

  const filteredSiswaList = useMemo(() => {
    if (!searchSiswa) return siswaList.slice(0, 50);
    const q = searchSiswa.toLowerCase();
    return siswaList.filter((s) => s.nama.toLowerCase().includes(q) || s.nama_wali.toLowerCase().includes(q)).slice(0, 50);
  }, [siswaList, searchSiswa]);

  const selectedSiswa = useMemo(() => siswaList.find((s) => s.id === selectedSiswaId) ?? null, [siswaList, selectedSiswaId]);

  // siswa detail: tagihan + pembayaran
  const detail = useLiveQuery(async () => {
    if (!selectedSiswaId) return null;
    const [tagihan, pembayaran] = await Promise.all([
      db.tagihan.where('siswa_id').equals(selectedSiswaId).toArray(),
      db.pembayaran.toArray(),
    ]);
    const activeBills = tagihan.filter((t) => !t.deleted_at);
    const billIds = new Set(activeBills.map((t) => t.id));
    const payments = pembayaran.filter((p) => billIds.has(p.tagihan_id) && !p.deleted_at).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    return { tagihan: activeBills, pembayaran: payments };
  }, [selectedSiswaId], null);

  const filteredTagihan = useMemo(() => {
    if (!detail) return [];
    return detail.tagihan.filter((t) => {
      if (taFilter && taFilter !== 'all' && t.tahun_ajaran_id !== taFilter) return false;
      if (jenisFilter && t.jenis !== jenisFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [detail, taFilter, jenisFilter, statusFilter]);

  const totalTagihan = filteredTagihan.reduce((s, t) => s + t.jumlah_total, 0);
  const totalDibayar = filteredTagihan.reduce((s, t) => s + t.sudah_dibayar, 0);
  const sisaOutstanding = Math.max(0, totalTagihan - totalDibayar);

  const filterContext = [
    taFilter !== 'all' ? `TA: ${tahunAjaranOptions.find(t => t.id === taFilter)?.nama || taFilter}` : '',
    searchSiswa ? `Cari: ${searchSiswa}` : '',
  ].filter(Boolean).join(' | ');

  const handleExportPdf = () => {
    if (!selectedSiswa || !detail) return;
    const summary = { totalTagihan, totalDibayar, sisaUtang: sisaOutstanding };
    const pembayaranMap = new Map<string, any[]>();
    filteredTagihan.forEach(t => {
      pembayaranMap.set(t.id, detail.pembayaran.filter(p => p.tagihan_id === t.id));
    });
    generateLaporanPerSiswaPdf(selectedSiswa, filteredTagihan, pembayaranMap, summary, filterContext, tahunAjaranMap);
  };

  const handleExportExcel = () => {
    if (!selectedSiswa || !detail) return;
    const pembayaranMap = new Map<string, any[]>();
    filteredTagihan.forEach(t => {
      pembayaranMap.set(t.id, detail.pembayaran.filter(p => p.tagihan_id === t.id));
    });
    exportLaporanPerSiswaExcel(selectedSiswa, filteredTagihan, pembayaranMap, filterContext, tahunAjaranMap);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader title="Laporan Per Siswa" description="Lihat posisi keuangan dan riwayat tagihan per siswa." actions={
        selectedSiswa ? (
          <div className="flex gap-2">
            <button type="button" onClick={handleExportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Cetak Excel
            </button>
            <button type="button" onClick={handleExportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Cetak PDF
            </button>
          </div>
        ) : undefined
      } />

      {/* Pilih Siswa */}
      <SectionCard title="Pilih Siswa">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Ketik nama siswa atau wali..." value={searchSiswa} onChange={(e) => setSearchSiswa(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/70 pl-10 pr-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
        </div>
        {filteredSiswaList.length > 0 && !selectedSiswaId && (
          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {filteredSiswaList.map((s) => (
              <button key={s.id} type="button" onClick={() => { setSelectedSiswaId(s.id); setSearchSiswa(''); }} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white/70 px-4 py-3 text-left text-sm transition hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-brand-700">
                <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">{s.nama.charAt(0)}</div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{s.nama}</p>
                  <p className="text-xs text-slate-400">{s.activeClass ? formatKelasLabel(s.activeClass) : '-'} · {s.status}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {selectedSiswa && (
          <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3 dark:border-brand-900/40 dark:bg-brand-950/20">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">{selectedSiswa.nama.charAt(0)}</div>
              <div>
                <p className="font-bold text-slate-800 dark:text-slate-100">{selectedSiswa.nama}</p>
                <p className="text-xs text-slate-500">{selectedSiswa.activeClass ? formatKelasLabel(selectedSiswa.activeClass) : '-'} · <span className="capitalize">{selectedSiswa.status}</span></p>
              </div>
            </div>
            <button type="button" onClick={() => setSelectedSiswaId('')} className="text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400">Ganti siswa</button>
          </div>
        )}
      </SectionCard>

      {selectedSiswa && detail && (
        <>
          {/* Filter */}
          <CollapsibleFilterCard chips={filterChips} summary={`Menampilkan ${filteredTagihan.length} tagihan`} onReset={resetFilters}>
            <FilterInput type="select" value={taFilter} onChange={setTaFilter} label="Tahun Ajaran" compact options={[{ value: 'all', label: 'Semua TA' }, ...tahunAjaranOptions.map((t) => ({ value: t.id, label: t.nama }))]} />
            <FilterInput type="select" value={jenisFilter} onChange={setJenisFilter} label="Jenis" compact options={[{ value: '', label: 'Semua Jenis' }, ...(jenisTagihanOptions ?? []).filter((i) => i.aktif).map((i) => ({ value: i.nama.toLowerCase(), label: i.nama }))]} />
            <FilterInput type="select" value={statusFilter} onChange={setStatusFilter} label="Status" compact options={[{ value: '', label: 'Semua Status' }, { value: 'belum_bayar', label: 'Belum Bayar' }, { value: 'sebagian', label: 'Sebagian' }, { value: 'lunas', label: 'Lunas' }]} />
          </CollapsibleFilterCard>

          {/* Ringkasan */}
          <SummaryGroupGrid>
            <SummaryGroupCard title="Status Siswa" tone="slate" variant="featured">
              <SummaryGroupRow label="Nama" value={selectedSiswa.nama} highlight valueClassName="text-2xl" />
              <SummaryGroupRow label="Status" value={<span className="capitalize">{selectedSiswa.status}</span>} />
            </SummaryGroupCard>
            <SummaryGroupCard title="Tagihan" tone="brand" variant="receipt">
              <SummaryGroupRow label="Total Tagihan" value={formatRupiah(totalTagihan)} highlight />
              <SummaryGroupRow label="Sudah Dibayar" value={formatRupiah(totalDibayar)} />
              <SummaryGroupRow label="Sisa" value={formatRupiah(sisaOutstanding)} />
            </SummaryGroupCard>
          </SummaryGroupGrid>

          {/* Tabel Tagihan */}
          <SectionCard title="Daftar Tagihan">
            {filteredTagihan.length === 0 ? (
              <EmptyState title="Tidak ada tagihan" description="Belum ada tagihan untuk filter yang dipilih." />
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3 w-8"></th>
                        <th className="px-4 py-3 font-semibold">Asal TA</th>
                        <th className="px-4 py-3 font-semibold">Jenis</th>
                        <th className="px-4 py-3 font-semibold">Bulan</th>
                        <th className="px-4 py-3 font-semibold text-right">Tarif Awal</th>
                        <th className="px-4 py-3 font-semibold text-right">Diskon</th>
                        <th className="px-4 py-3 font-semibold text-right">Tagihan Bersih</th>
                        <th className="px-4 py-3 font-semibold text-right">Sudah Dibayar</th>
                        <th className="px-4 py-3 font-semibold text-right">Sisa</th>
                        <th className="px-4 py-3 font-semibold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                      {paginateData(filteredTagihan, page, pageSize).map((t) => {
                        const isExpanded = expandedTagihanId === t.id;
                        const payments = detail.pembayaran.filter((p) => p.tagihan_id === t.id);
                        const sisa = Math.max(0, t.jumlah_total - t.sudah_dibayar);
                        return (
                          <Fragment key={t.id}>
                            <tr className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => setExpandedTagihanId(isExpanded ? null : t.id)}>
                              <td className="px-4 py-3">
                                {payments.length > 0 && (isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />)}
                              </td>
                              <td className="px-4 py-3 text-xs">{taMap.get(t.tahun_ajaran_id)?.nama ?? '-'}</td>
                              <td className="px-4 py-3"><JenisTagihanBadge jenis={t.jenis} /></td>
                              <td className="px-4 py-3">{t.bulan_tahun ? formatMonthYear(t.bulan_tahun) : '-'}</td>
                              <td className="px-4 py-3 text-right font-medium">
                                {formatRupiah(t.jumlah_total + (t.potongan_diskon || 0))}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {t.potongan_diskon && t.potongan_diskon > 0 ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-brand-600 dark:text-brand-400 font-medium">
                                      {formatRupiah(t.potongan_diskon)}
                                    </span>
                                    <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-400" title={t.nama_promo || 'Diskon'}>
                                      {t.nama_promo ? (t.nama_promo.length > 15 ? t.nama_promo.substring(0, 15) + '...' : t.nama_promo) : 'Promo'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-100">
                                {formatRupiah(t.jumlah_total)}
                              </td>
                              <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{formatRupiah(t.sudah_dibayar)}</td>
                              <td className="px-4 py-3 text-right font-bold text-danger-600 dark:text-danger-400">{formatRupiah(sisa)}</td>
                              <td className="px-4 py-3 text-center"><StatusBadgeTagihan status={t.status} /></td>
                            </tr>
                            {isExpanded && payments.length > 0 && (
                              <tr>
                                <td colSpan={8} className="bg-slate-50/50 px-8 py-3 dark:bg-slate-800/30">
                                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Riwayat Pembayaran</p>
                                  <div className="space-y-1.5">
                                    {payments.map((p) => (
                                      <div key={p.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 text-sm shadow-sm dark:bg-slate-900">
                                        <div className="flex items-center gap-4">
                                          <span className="text-slate-600 dark:text-slate-300">{formatTanggal(p.tanggal)}</span>
                                          <span className="font-semibold text-slate-800 dark:text-slate-200">{formatRupiah(p.jumlah)}</span>
                                          <span className="text-xs text-slate-400">{p.metode}</span>
                                        </div>
                                        <span className="text-xs text-slate-400">{p.no_kuitansi || '-'}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination currentPage={page} totalItems={filteredTagihan.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
