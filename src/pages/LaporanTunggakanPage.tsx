import { useMemo, useState, Fragment } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import FilterInput from '../components/ui/FilterInput';
import SectionCard from '../components/ui/SectionCard';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { SummaryGroupCard, SummaryGroupGrid, SummaryGroupMiniCard } from '../components/ui/SummaryGroup';
import { formatRupiah, formatKelasLabel, formatMonthYear } from '../lib/format';
import { db } from '../db';
import { exportDaftarTunggakanExcel } from '../lib/excelGenerator';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { generateDaftarTunggakanPdf } from '../lib/pdfGenerator';
import type { FilterChip } from '../components/ui/FilterChipBar';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';
import TunggakanSourceBadge from '../components/ui/TunggakanSourceBadge';

interface SettingOption { id: string; nama: string; aktif: boolean; }

type TunggakanSource = 'tahun_berjalan' | 'tunggakan_lama' | 'piutang_arsip';

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

import { useSearchParams } from 'react-router-dom';

export default function LaporanTunggakanPage() {
  const [searchParams] = useSearchParams();
  const [taFilter, setTaFilter] = useState('');
  const [asalTaFilter, setAsalTaFilter] = useState('');
  const [kelasFilter, setKelasFilter] = useState('');
  const [jenisFilter, setJenisFilter] = useState('');
  const [statusSiswaFilter, setStatusSiswaFilter] = useState('');
  const [konteksFilter, setKonteksFilter] = useState(searchParams.get('konteks') || 'ta_aktif');
  const [sumberFilter, setSumberFilter] = useState(searchParams.get('sumber') || 'aktif_dan_lama');
  const [jatuhTempoFilter, setJatuhTempoFilter] = useState('lewat_jatuh_tempo');
  const [minimalSisaFilter, setMinimalSisaFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedSiswaId, setExpandedSiswaId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const tahunAjaranOptions = useLiveQuery(() => listTahunAjaran(), [], []);
  const jenisTagihanOptions = useLiveQuery(() => getPengaturanByKunci<SettingOption[]>('jenis_tagihan'), [], [] as SettingOption[]);
  const activeTahunAjaran = useLiveQuery(async () => {
    const years = (await db.tahun_ajaran.toArray()).filter((i) => !i.deleted_at);
    return years.find((i) => i.aktif || i.status === 'aktif') ?? null;
  }, [], null);

  const rawData = useLiveQuery(async () => {
    const [tagihan, siswa, kelas, assignments, tahunAjaran] = await Promise.all([
      db.tagihan.toArray(), db.siswa.toArray(), db.kelas.toArray(), db.siswa_kelas.toArray(), db.tahun_ajaran.toArray()
    ]);
    const siswaMap = new Map(siswa.filter((s) => !s.deleted_at).map((s) => [s.id, s]));
    const kelasMap = new Map(kelas.filter((k) => !k.deleted_at).map((k) => [k.id, k]));
    const taMap = new Map(tahunAjaran.filter((t) => !t.deleted_at).map((t) => [t.id, t]));
    const activeAssignments = assignments.filter((a) => !a.selesai);

    const unpaid = tagihan
      .filter((t) => !t.deleted_at && t.status !== 'lunas' && t.status !== 'dibatalkan' && (t.jumlah_total - t.sudah_dibayar) > 0)
      .map((t) => {
        const s = siswaMap.get(t.siswa_id);
        const activeYearId = tahunAjaran.find((item) => !item.deleted_at && (item.aktif || item.status === 'aktif'))?.id ?? '';
        const source: TunggakanSource = s?.status === 'aktif'
          ? (t.tahun_ajaran_id === activeYearId ? 'tahun_berjalan' : 'tunggakan_lama')
          : 'piutang_arsip';
        return { ...t, source, remaining: Math.max(0, t.jumlah_total - t.sudah_dibayar) };
      });

    const bySiswa = new Map<string, typeof unpaid>();
    unpaid.forEach((t) => bySiswa.set(t.siswa_id, [...(bySiswa.get(t.siswa_id) ?? []), t]));

    return Array.from(bySiswa.entries()).map(([siswaId, items]) => {
      const s = siswaMap.get(siswaId);
      const assignment = activeAssignments.find((a) => a.siswa_id === siswaId);
      const kls = assignment ? kelasMap.get(assignment.kelas_id) : null;
      const totalSisa = items.reduce((sum, t) => sum + Math.max(0, t.jumlah_total - t.sudah_dibayar), 0);
      const jenisSet = new Set(items.map((t) => t.jenis));
      const taIds = new Set(items.map((t) => t.tahun_ajaran_id));
      return {
        siswaId, siswa: s, kelas: kls, items, totalSisa, jenisSet, taIds,
        taNames: Array.from(taIds).map((id) => taMap.get(id)?.nama ?? '?').join(', '),
      };
    });
  }, [], []);

  const filteredData = useMemo(() => {
    const effectiveYearId = taFilter === 'all' ? '' : (taFilter || activeTahunAjaran?.id || '');
    const activeYearId = activeTahunAjaran?.id ?? '';
    const today = getToday();
    const minimalSisa = Number(minimalSisaFilter || 0);

    return rawData.map((row) => {
      const filteredItems = row.items.filter((item) => {
        if (asalTaFilter && item.tahun_ajaran_id !== asalTaFilter) return false;
        if (jenisFilter && item.jenis !== jenisFilter) return false;
        if (konteksFilter === 'ta_aktif' && item.tahun_ajaran_id !== activeYearId) return false;
        if (konteksFilter === 'pra_ta' && item.jenis !== 'pendaftaran' && item.jenis !== 'daftar_ulang') return false;
        if (sumberFilter === 'aktif_dan_lama' && item.source !== 'tahun_berjalan' && item.source !== 'tunggakan_lama') return false;
        if (sumberFilter === 'tahun_berjalan' && item.source !== 'tahun_berjalan') return false;
        if (sumberFilter === 'tunggakan_lama' && item.source !== 'tunggakan_lama') return false;
        if (sumberFilter === 'piutang_arsip' && item.source !== 'piutang_arsip') return false;
        if (jatuhTempoFilter === 'lewat_jatuh_tempo' && item.jatuh_tempo >= today) return false;
        if (jatuhTempoFilter === 'bulan_ini' && item.jatuh_tempo.slice(0, 7) !== today.slice(0, 7)) return false;
        if (minimalSisa > 0 && item.remaining < minimalSisa) return false;
        return true;
      });
      const jenisSet = new Set(filteredItems.map((t) => t.jenis));
      const taIds = new Set(filteredItems.map((t) => t.tahun_ajaran_id));
      return {
        ...row,
        items: filteredItems,
        totalSisa: filteredItems.reduce((sum, t) => sum + t.remaining, 0),
        jenisSet,
        taIds,
        taNames: Array.from(taIds).map((id) => tahunAjaranOptions.find((t) => t.id === id)?.nama ?? '?').join(', '),
      };
    }).filter((row) => {
      if (!row.siswa) return false;
      if (row.items.length === 0) return false;
      // TA siswa filter
      if (effectiveYearId) {
        const assignment = row.kelas;
        if (assignment && assignment.tahun_ajaran_id !== effectiveYearId && row.siswa.tahun_ajaran_target_id !== effectiveYearId) return false;
      }
      // kelas filter
      if (kelasFilter && row.kelas?.id !== kelasFilter) return false;
      // status siswa filter
      if (statusSiswaFilter === 'aktif' && row.siswa.status !== 'aktif') return false;
      if (statusSiswaFilter === 'calon' && row.siswa.status !== 'calon') return false;
      if (statusSiswaFilter === 'alumni' && row.siswa.status !== 'lulus') return false;
      if (statusSiswaFilter === 'keluar' && row.siswa.status !== 'berhenti') return false;
      // search
      if (search) {
        const q = search.toLowerCase();
        if (!row.siswa.nama.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.totalSisa - a.totalSisa);
  }, [rawData, taFilter, asalTaFilter, kelasFilter, jenisFilter, statusSiswaFilter, konteksFilter, sumberFilter, jatuhTempoFilter, minimalSisaFilter, search, activeTahunAjaran, tahunAjaranOptions]);

  // summary
  const totalTunggakan = filteredData.reduce((s, r) => s + r.totalSisa, 0);
  const jumlahSiswaMenunggak = filteredData.length;
  const totalItemTagihan = filteredData.reduce((s, r) => s + r.items.length, 0);
  const totalTahunBerjalan = filteredData.reduce((sum, r) => sum + r.items.filter((t) => t.source === 'tahun_berjalan').reduce((s, t) => s + t.remaining, 0), 0);
  const totalTunggakanLama = filteredData.reduce((sum, r) => sum + r.items.filter((t) => t.source === 'tunggakan_lama').reduce((s, t) => s + t.remaining, 0), 0);
  const totalPiutangArsip = filteredData.reduce((sum, r) => sum + r.items.filter((t) => t.source === 'piutang_arsip').reduce((s, t) => s + t.remaining, 0), 0);
  const totalLewatTempo = filteredData.reduce((sum, r) => sum + r.items.filter((t) => t.jatuh_tempo < getToday()).reduce((s, t) => s + t.remaining, 0), 0);
  const breakdownJenis = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach((r) => r.items.forEach((t) => {
      map.set(t.jenis, (map.get(t.jenis) ?? 0) + t.remaining);
    }));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredData]);

  const kelasOptions = useLiveQuery(() => db.kelas.filter((k) => !k.deleted_at).toArray(), [], []);

  const formatKelasFilterLabel = (kelas: typeof kelasOptions[number]) => {
    const tahun = tahunAjaranOptions.find((item) => item.id === kelas.tahun_ajaran_id)?.nama;
    return `${formatKelasLabel(kelas)}${tahun ? ` (${tahun})` : ''}`;
  };

  const prepareSummary = () => {
    let spp = 0; let pendaftaran = 0; let kegiatan = 0;
    breakdownJenis.forEach(([j, v]) => {
      if (j === 'spp') spp += v;
      else if (j === 'pendaftaran') pendaftaran += v;
      else kegiatan += v;
    });
    return { totalTunggakan, countSiswa: jumlahSiswaMenunggak, spp, pendaftaran, kegiatan };
  };

  const subtitleFilter = [
    `Tahun Ajaran: ${tahunAjaranOptions.find(t => t.id === taFilter)?.nama || 'Semua'}`,
    asalTaFilter ? `TA Asal: ${tahunAjaranOptions.find(t => t.id === asalTaFilter)?.nama || asalTaFilter}` : '',
    `Kelas: ${kelasOptions?.find(k => k.id === kelasFilter)?.nama_kelas || 'Semua'}`,
    jenisFilter ? `Jenis: ${jenisFilter}` : '',
    `Status: ${statusSiswaFilter === 'aktif' ? 'Aktif' : statusSiswaFilter === 'calon' ? 'Calon' : statusSiswaFilter === 'alumni' ? 'Alumni' : statusSiswaFilter === 'keluar' ? 'Keluar' : 'Semua'}`,
    `Konteks: ${konteksFilter === 'ta_aktif' ? 'TA Aktif' : konteksFilter === 'tunggakan_lama' ? 'Tunggakan Lama' : konteksFilter === 'arsip' ? 'Arsip' : 'Semua'}`,
    `Jatuh Tempo: ${jatuhTempoFilter === 'lewat_jatuh_tempo' ? 'Lewat' : jatuhTempoFilter === 'bulan_ini' ? 'Bulan Ini' : 'Semua'}`,
    minimalSisaFilter ? `Min Sisa: Rp${Number(minimalSisaFilter).toLocaleString('id-ID')}` : '',
    search ? `Cari: ${search}` : '',
  ].filter(Boolean).join(' | ');

  const tahunAjaranExportMap = new Map(tahunAjaranOptions.map((t: any) => [t.id, t.nama]));

  const handleExportPdf = () => {
    generateDaftarTunggakanPdf(
      filteredData.map(r => ({ ...r, tunggakanList: r.items })),
      prepareSummary(),
      subtitleFilter
    );
  };
  const handleExportExcel = () => {
    const flat = filteredData.flatMap((r) => r.items.map((t) => ({ ...t, siswa: r.siswa, activeClass: r.kelas })));
    exportDaftarTunggakanExcel(
      filteredData.map(r => ({ ...r, tunggakanList: r.items })), 
      flat, 
      '', '',
      subtitleFilter,
      tahunAjaranExportMap
    );
  };

  function resetFilters() {
    setTaFilter('');
    setAsalTaFilter('');
    setKelasFilter('');
    setJenisFilter('');
    setStatusSiswaFilter('aktif');
    setKonteksFilter('ta_aktif');
    setSumberFilter('aktif_dan_lama');
    setJatuhTempoFilter('lewat_jatuh_tempo');
    setMinimalSisaFilter('');
    setSearch('');
  }

  const filterChips: FilterChip[] = [
    { key: 'status', label: `Status Siswa: ${statusSiswaFilter === 'aktif' ? 'Aktif' : statusSiswaFilter === 'calon' ? 'Calon' : statusSiswaFilter === 'alumni' ? 'Alumni' : statusSiswaFilter === 'keluar' ? 'Keluar' : 'Semua'}` },
    { key: 'jatuhTempo', label: `Jatuh Tempo: ${jatuhTempoFilter === 'lewat_jatuh_tempo' ? 'Lewat' : jatuhTempoFilter === 'bulan_ini' ? 'Bulan Ini' : 'Semua'}` },
    { key: 'sumber', label: `Sumber: ${sumberFilter === 'aktif_dan_lama' ? 'Tahun Berjalan + Lama' : sumberFilter === 'tahun_berjalan' ? 'Tahun Berjalan' : sumberFilter === 'tunggakan_lama' ? 'Tunggakan Lama' : sumberFilter === 'piutang_arsip' ? 'Piutang Arsip' : 'Semua'}` },
  ];

  const utamaFilters = useMemo(() => [
    { id: 'kelas', label: 'Kelas', type: 'select' as const, value: kelasFilter, onChange: setKelasFilter, options: [
      { value: '', label: 'Semua Kelas' },
      ...(kelasOptions ?? []).map((k) => ({ value: k.id, label: formatKelasFilterLabel(k) })),
    ]},
    { id: 'jenis', label: 'Jenis', type: 'select' as const, value: jenisFilter, onChange: setJenisFilter, options: [
      { value: '', label: 'Semua Jenis' },
      ...(jenisTagihanOptions ?? []).filter((i) => i.aktif).map((i) => ({ value: i.nama.toLowerCase(), label: i.nama })),
    ]},
    { id: 'jatuhTempo', label: 'Jatuh Tempo', type: 'select' as const, value: jatuhTempoFilter, onChange: setJatuhTempoFilter, options: [
      { value: 'lewat_jatuh_tempo', label: 'Lewat Jatuh Tempo' }, { value: 'bulan_ini', label: 'Jatuh Tempo Bulan Ini' }, { value: 'semua', label: 'Semua Jatuh Tempo' },
    ]},
  ], [kelasFilter, jenisFilter, jatuhTempoFilter, kelasOptions, jenisTagihanOptions]);

  const advancedFilters = useMemo(() => [
    { id: 'asalTa', label: 'Tahun Asal', type: 'select' as const, value: asalTaFilter, onChange: setAsalTaFilter, options: [
      { value: '', label: 'Semua Periode Asal' },
      ...tahunAjaranOptions.map((t) => ({ value: t.id, label: t.nama })),
    ]},
    { id: 'konteks', label: 'Konteks', type: 'select' as const, value: konteksFilter, onChange: setKonteksFilter, options: [
      { value: 'ta_aktif', label: 'TA Aktif' }, { value: 'pra_ta', label: 'Pra TA' }, { value: 'semua', label: 'Semua Konteks' },
    ]},
    { id: 'sumber', label: 'Sumber', type: 'select' as const, value: sumberFilter, onChange: setSumberFilter, options: [
      { value: 'aktif_dan_lama', label: 'Tahun Berjalan + Lama' }, { value: 'tahun_berjalan', label: 'Tahun Berjalan' }, { value: 'tunggakan_lama', label: 'Tunggakan Lama' }, { value: 'piutang_arsip', label: 'Piutang Arsip' }, { value: 'semua', label: 'Semua Sumber' },
    ]},
    { id: 'statusSiswa', label: 'Status Siswa', type: 'select' as const, value: statusSiswaFilter, onChange: setStatusSiswaFilter, options: [
      { value: '', label: 'Semua Status Siswa' }, { value: 'aktif', label: 'Aktif' },
      { value: 'calon', label: 'Calon' }, { value: 'alumni', label: 'Alumni' }, { value: 'keluar', label: 'Keluar' },
    ]},
    { id: 'minimalSisa', label: 'Minimal Sisa', type: 'search' as const, value: minimalSisaFilter, onChange: setMinimalSisaFilter, placeholder: '0' },
  ], [asalTaFilter, konteksFilter, sumberFilter, statusSiswaFilter, minimalSisaFilter, search, tahunAjaranOptions]);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader title="Laporan Tunggakan" description="Daftar siswa yang masih memiliki tagihan belum lunas." actions={
        <div className="flex gap-2">
          <button type="button" onClick={handleExportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Cetak Excel</button>
          <button type="button" onClick={handleExportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Cetak PDF</button>
        </div>
      } />

      <CollapsibleFilterCard
        chips={filterChips}
        summary={`Menampilkan ${totalItemTagihan} tagihan dari ${jumlahSiswaMenunggak} siswa`}
        mobileSummary={`${filterChips.map((chip) => chip.label).join(' · ')}`}
        onReset={resetFilters}
      >
        <FilterInput type="select" value={taFilter} onChange={setTaFilter} label="Tahun Ajaran" compact options={[{ value: '', label: 'Aktif' }, { value: 'all', label: 'Semua Periode' }, ...tahunAjaranOptions.map((t) => ({ value: t.id, label: t.nama }))]} />
        {[...utamaFilters, ...advancedFilters].map((filter) => (
          <FilterInput key={filter.id} type={filter.type} value={filter.value} onChange={filter.onChange} label={filter.label} options={filter.options} placeholder={'placeholder' in filter ? filter.placeholder : undefined} compact />
        ))}
      </CollapsibleFilterCard>

      <SummaryGroupGrid>
        <SummaryGroupCard title="Ringkasan" tone="danger" layout="mini">
          <SummaryGroupMiniCard label="Total Tunggakan" value={formatRupiah(totalTunggakan)} highlight />
          <SummaryGroupMiniCard label="Jumlah Tagihan" value={totalItemTagihan} />
          <SummaryGroupMiniCard label="Siswa Menunggak" value={jumlahSiswaMenunggak} />
        </SummaryGroupCard>
        <SummaryGroupCard title="Per Periode" tone="amber" layout="mini">
          <SummaryGroupMiniCard label="Tahun Berjalan" value={formatRupiah(totalTahunBerjalan)} />
          <SummaryGroupMiniCard label="Tunggakan Lama" value={formatRupiah(totalTunggakanLama)} />
          <SummaryGroupMiniCard label="Piutang Arsip" value={formatRupiah(totalPiutangArsip)} />
          <SummaryGroupMiniCard label="Lewat Tempo" value={formatRupiah(totalLewatTempo)} />
        </SummaryGroupCard>
      </SummaryGroupGrid>

      {/* Tabel per Siswa expandable */}
      <SectionCard
        title="Daftar Tunggakan"
        actions={<FilterInput type="search" value={search} onChange={setSearch} label="Cari" placeholder="Nama siswa..." compact />}
      >
        {filteredData.length === 0 ? (
          <EmptyState title="Tidak Ada Tunggakan" description="Semua tagihan sudah lunas atau tidak ada data yang cocok." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3 font-semibold">Nama Siswa</th>
                    <th className="px-4 py-3 font-semibold">Kelas</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Komposisi</th>
                    <th className="px-4 py-3 font-semibold">Asal TA</th>
                    <th className="px-4 py-3 font-semibold text-right">Sisa Tagihan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {paginateData(filteredData, page, pageSize).map((row) => {
                    const isExpanded = expandedSiswaId === row.siswaId;
                    return (
                      <Fragment key={row.siswaId}>
                        <tr className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => setExpandedSiswaId(isExpanded ? null : row.siswaId)}>
                          <td className="px-4 py-3">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{row.siswa?.nama ?? '-'}</td>
                          <td className="px-4 py-3">{row.kelas ? formatKelasLabel(row.kelas) : '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.siswa?.status === 'aktif' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                              {row.siswa?.status === 'lulus' ? 'Alumni' : row.siswa?.status ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {row.items.some((t) => t.source === 'tahun_berjalan') ? <TunggakanSourceBadge source="tahun_berjalan" /> : null}
                              {row.items.some((t) => t.source === 'tunggakan_lama') ? <TunggakanSourceBadge source="tunggakan_lama" /> : null}
                              {row.items.some((t) => t.source === 'piutang_arsip') ? <TunggakanSourceBadge source="piutang_arsip" /> : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">{row.taNames}</td>
                          <td className="px-4 py-3 text-right font-bold text-danger-600 dark:text-danger-400">{formatRupiah(row.totalSisa)}</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="bg-slate-50/50 px-8 py-3 dark:bg-slate-800/30">
                              <div className="space-y-2">
                                {row.items.map((t) => (
                                  <div key={t.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-2.5 text-sm shadow-sm dark:bg-slate-900">
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="font-medium text-slate-700 dark:text-slate-200">{t.nama_tagihan}</span>
                                      <TunggakanSourceBadge source={t.source} />
                                      <span className="text-xs font-semibold text-slate-400">{tahunAjaranOptions.find((ta) => ta.id === t.tahun_ajaran_id)?.nama ?? '-'}</span>
                                      <span className="text-xs text-slate-400 capitalize">{t.jenis}</span>
                                      {t.bulan_tahun && <span className="text-xs text-slate-400">{formatMonthYear(t.bulan_tahun)}</span>}
                                    </div>
                                    <div className="flex items-center gap-4 text-right">
                                      <span className="text-xs text-slate-400">Nominal: {formatRupiah(t.jumlah_total)}</span>
                                      <span className="font-bold text-danger-600 dark:text-danger-400">Sisa: {formatRupiah(t.remaining)}</span>
                                    </div>
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
            <Pagination currentPage={page} totalItems={filteredData.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </SectionCard>
    </div>
  );
}
