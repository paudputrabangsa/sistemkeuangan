import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import PageHeader from '../components/ui/PageHeader';
import FilterInput from '../components/ui/FilterInput';
import SectionCard from '../components/ui/SectionCard';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { SummaryGroupCard, SummaryGroupEmpty, SummaryGroupGrid, SummaryGroupMiniCard, SummaryGroupRow } from '../components/ui/SummaryGroup';
import { formatRupiah, formatTanggal, formatKelasLabel } from '../lib/format';
import { listPembayaranWithFilters } from '../queries/pembayaranQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { listActiveKelas } from '../queries/kelasQueries';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { db } from '../db';
import { exportRekapPenerimaanExcel } from '../lib/excelGenerator';
import { generateRekapPenerimaanPdf } from '../lib/pdfGenerator';

import PeriodFilter, { type PeriodMode } from '../components/ui/PeriodFilter';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';

interface SettingOption { id: string; nama: string; aktif: boolean; }

const getStartOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const getEndOfMonth = () => { const d = new Date(); const end = new Date(d.getFullYear(), d.getMonth() + 1, 0); return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`; };
const getToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const getWeekStart = () => { const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6); return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`; };

export default function LaporanPenerimaanPage() {
  const [taFilter, setTaFilter] = useState('');
  const [periodeMode, setPeriodeMode] = useState<PeriodMode>('bulan_ini');
  const [fromDate, setFromDate] = useState(getStartOfMonth());
  const [toDate, setToDate] = useState(getEndOfMonth());
  const [jenisFilter, setJenisFilter] = useState('');
  const [metodeFilter, setMetodeFilter] = useState('');
  const [kelasFilter, setKelasFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const tahunAjaranOptions = useLiveQuery(() => listTahunAjaran(), [], []);
  const activeYear = tahunAjaranOptions.find((item) => item.aktif || item.status === 'aktif') ?? null;
  const jenisTagihanOptions = useLiveQuery(() => getPengaturanByKunci<SettingOption[]>('jenis_tagihan'), [], [] as SettingOption[]);
  const metodePembayaran = useLiveQuery(() => getPengaturanByKunci<SettingOption[]>('metode_pembayaran'), [], [] as SettingOption[]);
  const kelasOptions = useLiveQuery(() => listActiveKelas(), [], []);
  const pembayaran = useLiveQuery(() => listPembayaranWithFilters({ fromDate: fromDate || undefined, toDate: toDate || undefined, tahunAjaranId: taFilter || undefined }), [fromDate, toDate, taFilter], []);

  const formatKelasFilterLabel = (kelas: typeof kelasOptions[number]) => {
    const tahun = tahunAjaranOptions.find((item) => item.id === kelas.tahun_ajaran_id)?.nama;
    return `${formatKelasLabel(kelas)}${tahun ? ` (${tahun})` : ''}`;
  };

  function applyPeriodMode(mode: PeriodMode) {
    setPeriodeMode(mode);
    if (mode === 'hari_ini') { setFromDate(getToday()); setToDate(getToday()); }
    if (mode === 'minggu_ini') { setFromDate(getWeekStart()); setToDate(getToday()); }
    if (mode === 'bulan_ini') { setFromDate(getStartOfMonth()); setToDate(getEndOfMonth()); }
    if (mode === 'tahun_ajaran_ini' && activeYear) { setFromDate(activeYear.mulai); setToDate(activeYear.selesai); }
  }

  function resetFilters() {
    setTaFilter('');
    setPeriodeMode('bulan_ini');
    setFromDate(getStartOfMonth());
    setToDate(getEndOfMonth());
    setJenisFilter('');
    setMetodeFilter('');
    setKelasFilter('');
    setSearch('');
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pembayaran.filter((item) => {
      if ((item.status_verifikasi ?? 'terverifikasi') !== 'terverifikasi') return false;
      if (item.deleted_at) return false;
      if (jenisFilter && item.tagihan?.jenis !== jenisFilter) return false;
      if (metodeFilter && item.metode !== metodeFilter) return false;
      if (kelasFilter && item.activeClass?.id !== kelasFilter) return false;
      if (q && !`${item.siswa?.nama ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pembayaran, jenisFilter, metodeFilter, kelasFilter, search]);

  const summary = useMemo(() => {
    let total = 0;
    const byJenis = new Map<string, number>();
    const byMetode = new Map<string, number>();
    filtered.forEach((item) => {
      total += item.jumlah;
      const jenis = item.tagihan?.jenis ?? 'lainnya';
      byJenis.set(jenis, (byJenis.get(jenis) ?? 0) + item.jumlah);
      byMetode.set(item.metode, (byMetode.get(item.metode) ?? 0) + item.jumlah);
    });
    return {
      total,
      count: filtered.length,
      byJenis: Array.from(byJenis.entries()).sort((a, b) => b[1] - a[1]),
      byMetode: Array.from(byMetode.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [filtered]);

  const jenisTotals = useMemo(() => {
    let spp = 0; let pendaftaran = 0; let daftarUlang = 0; let lainnya = 0;
    summary.byJenis.forEach(([jenis, total]) => {
      const lower = jenis.toLowerCase();
      if (lower === 'spp') spp += total;
      else if (lower === 'pendaftaran') pendaftaran += total;
      else if (lower === 'daftar ulang' || lower === 'daftar_ulang') daftarUlang += total;
      else lainnya += total;
    });
    return { spp, pendaftaran, daftarUlang, lainnya };
  }, [summary.byJenis]);

  const akunMap = useLiveQuery(async () => {
    const arr = await db.akun.toArray();
    return new Map<string, string>(arr.map((a: any) => [a.id, a.nama || a.email]));
  }, [], new Map<string, string>());

  const prepareSummary = () => {
    let spp = 0; let pendaftaran = 0; let daftarUlang = 0; let kegiatan = 0;
    summary.byJenis.forEach(([j, v]) => {
      const lower = j.toLowerCase();
      if (lower === 'spp') spp += v;
      else if (lower === 'pendaftaran') pendaftaran += v;
      else if (lower === 'daftar ulang' || lower === 'daftar_ulang') daftarUlang += v;
      else kegiatan += v;
    });
    
    let tunai = 0; let transfer = 0; let tabungan = 0;
    summary.byMetode.forEach(([m, v]) => {
      const lower = m.toLowerCase();
      if (lower === 'tunai') tunai += v;
      else if (lower === 'transfer') transfer += v;
      else if (lower === 'tabungan') tabungan += v;
    });

    return {
      total: summary.total,
      spp, pendaftaran, daftarUlang, kegiatan,
      tunai, transfer, tabungan
    };
  };

  const taLabel = taFilter === 'all' ? 'Semua Periode' 
    : (tahunAjaranOptions.find(t => t.id === taFilter)?.nama || (activeYear?.nama ?? 'Semua'));

  const filterContext = [
    `TA: ${taLabel}`,
    `Periode: ${fromDate ? formatTanggal(fromDate) : 'Awal'} - ${toDate ? formatTanggal(toDate) : 'Akhir'}`,
    jenisFilter ? `Jenis: ${jenisFilter}` : '',
    metodeFilter ? `Metode: ${metodeFilter}` : '',
    kelasFilter ? `Kelas: ${kelasOptions.find(k => k.id === kelasFilter)?.nama_kelas || kelasFilter}` : '',
    search ? `Cari: ${search}` : '',
  ].filter(Boolean).join(' | ');

  const handleExportExcel = () => exportRekapPenerimaanExcel(filtered, akunMap, fromDate, toDate, filterContext);
  const handleExportPdf = () => generateRekapPenerimaanPdf(
    filtered, 
    prepareSummary(), 
    filterContext
  );

  const penerimaanFilters = useMemo(() => [
    { id: 'jenis', label: 'Jenis', type: 'select' as const, value: jenisFilter, onChange: setJenisFilter, options: [
      { value: '', label: 'Semua Jenis' },
      ...(jenisTagihanOptions ?? []).filter((i) => i.aktif).map((i) => ({ value: i.nama.toLowerCase(), label: i.nama })),
    ]},
    { id: 'metode', label: 'Metode', type: 'select' as const, value: metodeFilter, onChange: setMetodeFilter, options: [
      { value: '', label: 'Semua Metode' },
      ...(metodePembayaran ?? []).filter((i) => i.aktif).map((i) => ({ value: i.nama, label: i.nama })),
    ]},
    { id: 'kelas', label: 'Kelas', type: 'select' as const, value: kelasFilter, onChange: setKelasFilter, options: [
      { value: '', label: 'Semua Kelas' },
      ...(kelasOptions ?? []).map((k) => ({ value: k.id, label: formatKelasFilterLabel(k) })),
    ]},
  ], [jenisFilter, metodeFilter, kelasFilter, jenisTagihanOptions, metodePembayaran, kelasOptions]);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader title="Laporan Penerimaan" description="Rekap penerimaan keuangan untuk kebutuhan laporan ke yayasan atau dinas." actions={
        <div className="flex gap-2">
          <button type="button" onClick={handleExportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Cetak Excel</button>
          <button type="button" onClick={handleExportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Cetak PDF</button>
        </div>
      } />

      <CollapsibleFilterCard
        chips={[
          { key: 'periode', label: `Periode: ${formatTanggal(fromDate)} - ${formatTanggal(toDate)}` },
          { key: 'jenis', label: `Jenis: ${jenisFilter || 'Semua'}` },
          { key: 'metode', label: `Metode: ${metodeFilter || 'Semua'}` },
        ]}
        summary={`Menampilkan ${filtered.length} transaksi penerimaan`}
        mobileSummary={`${formatTanggal(fromDate)} - ${formatTanggal(toDate)} · ${jenisFilter || 'Semua Jenis'}`}
        onReset={resetFilters}
      >
        <div className="col-span-full">
          <PeriodFilter mode={periodeMode} fromDate={fromDate} toDate={toDate} onChangeMode={applyPeriodMode} onChangeFromDate={(value) => { setPeriodeMode('custom'); setFromDate(value); }} onChangeToDate={(value) => { setPeriodeMode('custom'); setToDate(value); }} />
        </div>
        <FilterInput type="select" value={taFilter} onChange={setTaFilter} label="Tahun Ajaran" compact options={[{ value: '', label: 'Aktif' }, { value: 'all', label: 'Semua Periode' }, ...tahunAjaranOptions.map((t) => ({ value: t.id, label: t.nama }))]} />
        {penerimaanFilters.map((filter) => (
          <FilterInput key={filter.id} type={filter.type} value={filter.value} onChange={filter.onChange} label={filter.label} options={filter.options} placeholder={'placeholder' in filter ? String(filter.placeholder) : undefined} compact />
        ))}
      </CollapsibleFilterCard>

      <SummaryGroupGrid>
        <SummaryGroupCard title="Total Penerimaan" tone="emerald" variant="featured">
          <SummaryGroupRow label="Total" value={formatRupiah(summary.total)} highlight valueClassName="text-2xl" />
          {summary.byMetode.length === 0 ? <SummaryGroupEmpty /> : summary.byMetode.map(([name, total]) => (
            <SummaryGroupRow key={name} label={name} value={formatRupiah(total)} />
          ))}
        </SummaryGroupCard>
        <SummaryGroupCard title="Per Jenis" tone="violet" layout="mini">
          <SummaryGroupMiniCard label="SPP" value={formatRupiah(jenisTotals.spp)} />
          <SummaryGroupMiniCard label="Pendaftaran" value={formatRupiah(jenisTotals.pendaftaran)} />
          <SummaryGroupMiniCard label="Daftar Ulang" value={formatRupiah(jenisTotals.daftarUlang)} />
          <SummaryGroupMiniCard label="Lainnya" value={formatRupiah(jenisTotals.lainnya)} />
        </SummaryGroupCard>
      </SummaryGroupGrid>

      {/* Tabel */}
      <SectionCard
        title="Detail Transaksi"
        actions={<FilterInput type="search" value={search} onChange={setSearch} label="Cari" placeholder="Nama siswa..." compact />}
      >
        {filtered.length === 0 ? (
          <EmptyState title="Tidak ada data" description="Tidak ditemukan transaksi penerimaan untuk filter yang dipilih." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Tanggal</th>
                    <th className="px-4 py-3 font-semibold">Nama Siswa</th>
                    <th className="px-4 py-3 font-semibold">Kelas</th>
                    <th className="px-4 py-3 font-semibold">Nama Tagihan</th>
                    <th className="px-4 py-3 font-semibold text-right">Nominal</th>
                    <th className="px-4 py-3 font-semibold">Metode</th>
                    <th className="px-4 py-3 font-semibold">No Kwitansi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {paginateData(filtered, page, pageSize).map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="whitespace-nowrap px-4 py-3">{formatTanggal(item.tanggal)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{item.siswa?.nama ?? '-'}</td>
                      <td className="px-4 py-3">{item.activeClass ? formatKelasLabel(item.activeClass) : '-'}</td>
                      <td className="px-4 py-3 font-medium">{item.tagihan?.nama_tagihan ?? '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatRupiah(item.jumlah)}</td>
                      <td className="px-4 py-3">{item.metode}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{item.no_kuitansi || '-'}</td>
                    </tr>
                  ))}
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
