import { db } from '../db';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { CreditCard, FilePlus2, Trash2, Eye } from 'lucide-react';
import FilterInput from '../components/ui/FilterInput';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import JenisTagihanBadge from '../components/ui/JenisTagihanBadge';
import StatusBadgeTagihan from '../components/ui/StatusBadgeTagihan';
import Modal from '../components/ui/Modal';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { getCurrentActor } from '../lib/actor';
import { formatKelasLabel, formatRupiah, formatTanggal } from '../lib/format';
import { listActiveKelas } from '../queries/kelasQueries';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';

import { listTagihanWithFilters } from '../queries/tagihanQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { listPembayaranWithFilters } from '../queries/pembayaranQueries';
import { deleteTagihan } from '../services/tagihanService';
import { ServiceError } from '../services/service-errors';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';
import type { FilterChip } from '../components/ui/FilterChipBar';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';
import { SummaryGroupCard, SummaryGroupGrid, SummaryGroupMiniCard } from '../components/ui/SummaryGroup';

interface SettingOption {
  id: string;
  nama: string;
  aktif: boolean;
}

type TagihanTab = 'semua' | 'aktif' | 'pendaftaran' | 'tunggakan_lama' | 'dibatalkan';

const today = new Date();
const defaultDate = today.toISOString().slice(0, 10);

// --- select class ---
export default function TagihanPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);

  // --- Filters ---
  const [tahunAjaranFilter, setTahunAjaranFilter] = useState('all');
  const [jenisFilter, setJenisFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('belum_bayar,sebagian');
  const [kelasFilter, setKelasFilter] = useState('');
  const [bulanFilter, setBulanFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTab, setActiveTab] = useState<TagihanTab>('semua');
  const [studentStatusFilter, setStudentStatusFilter] = useState('aktif,calon');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // --- Operational state ---
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [detailTagihanId, setDetailTagihanId] = useState<string | null>(null);



  // --- Queries ---
  const tagihan = useLiveQuery(
    () => listTagihanWithFilters({
      context: activeTab,
      bulanTahun: bulanFilter || undefined,
      kelasId: kelasFilter || undefined,
      tahunAjaranId: tahunAjaranFilter || undefined,
      jenis: jenisFilter || undefined,
      status: statusFilter || undefined,
      studentStatus: studentStatusFilter || undefined,
    }),
    [bulanFilter, kelasFilter, tahunAjaranFilter, jenisFilter, statusFilter, activeTab, studentStatusFilter],
    [],
  );
  const kelasOptions = useLiveQuery(() => listActiveKelas(), [], []);
  const tahunAjaranOptions = useLiveQuery(() => listTahunAjaran(), [], []);
  const tahunAjaranMap = new Map(tahunAjaranOptions.map((item) => [item.id, item]));
  const jenisTagihanOptions = useLiveQuery(() => getPengaturanByKunci<SettingOption[]>('jenis_tagihan'), [], [] as SettingOption[]);
  const activeYear = tahunAjaranOptions.find((item) => item.aktif || item.status === 'aktif') ?? null;
  const effectiveYearId = tahunAjaranFilter === 'all' ? '' : tahunAjaranFilter || activeYear?.id || '';
  const filteredKelasOptions = kelasOptions.filter((kelas) => !effectiveYearId || kelas.tahun_ajaran_id === effectiveYearId);

  // --- Pembayaran for detail modal ---
  const allPembayaran = useLiveQuery(() => listPembayaranWithFilters({}), [], []);
  const detailTagihanBatalLog = useLiveQuery(async () => {
    if (!detailTagihanId) return null;
    return await db.audit_log.where('record_id').equals(detailTagihanId).and((l) => l.aksi === 'delete').first() ?? null;
  }, [detailTagihanId], null);

  const displayedTagihan = useMemo(() => {
    if (!searchFilter) return tagihan;
    const lowerSearch = searchFilter.toLowerCase();
    return tagihan.filter((item) => item.siswa?.nama.toLowerCase().includes(lowerSearch));
  }, [tagihan, searchFilter]);

  // --- Summary ---
  const summaryStats = useMemo(() => {
    let totalTagihan = 0;
    let totalDibayar = 0;
    let sisaTagihan = 0;
    let jumlahBelumLunas = 0;
    let lewatJatuhTempo = 0;
    const siswaIds = new Set<string>();
    const todayIso = defaultDate;
    for (const item of displayedTagihan) {
      if (item.deleted_at || item.status === 'dibatalkan') continue;
      const remaining = Math.max(0, item.jumlah_total - item.sudah_dibayar);
      totalTagihan += item.jumlah_total;
      totalDibayar += item.sudah_dibayar;
      sisaTagihan += remaining;
      siswaIds.add(item.siswa_id);
      if (item.status !== 'lunas' && remaining > 0) jumlahBelumLunas += 1;
      if (item.status !== 'lunas' && remaining > 0 && item.jatuh_tempo < todayIso) lewatJatuhTempo += 1;
    }
    return { totalTagihan, totalDibayar, sisaTagihan, jumlahBelumLunas, siswaTerkait: siswaIds.size, lewatJatuhTempo };
  }, [displayedTagihan]);

  const earliestUnpaidSppPerSiswa = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of tagihan) {
      if (item.jenis === 'spp' && !item.deleted_at && item.status !== 'lunas' && item.status !== 'dibatalkan' && item.bulan_tahun) {
        const existing = map.get(item.siswa_id);
        if (!existing || item.bulan_tahun < existing) {
          map.set(item.siswa_id, item.bulan_tahun);
        }
      }
    }
    return map;
  }, [tagihan]);

  const activeJenisOptions = useMemo(() => (jenisTagihanOptions ?? []).filter((item) => item.aktif), [jenisTagihanOptions]);
  const formatKelasFilterLabel = (kelas: typeof kelasOptions[number]) => {
    const tahun = tahunAjaranMap.get(kelas.tahun_ajaran_id)?.nama;
    return `${formatKelasLabel(kelas)}${tahun ? ` (${tahun})` : ''}`;
  };

  // --- Detail modal data ---
  const detailTagihan = useMemo(() => {
    if (!detailTagihanId) return null;
    return displayedTagihan.find((t) => t.id === detailTagihanId) ?? null;
  }, [detailTagihanId, displayedTagihan]);

  const detailPembayaranList = useMemo(() => {
    if (!detailTagihanId) return [];
    return allPembayaran
      .filter((p) => p.tagihan_id === detailTagihanId && !p.deleted_at)
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [detailTagihanId, allPembayaran]);



  function resetTagihanFilters() {
    setTahunAjaranFilter('all');
    setJenisFilter('');
    setStatusFilter('belum_bayar,sebagian');
    setKelasFilter('');
    setBulanFilter('');
    setSearchFilter('');
    setActiveTab('semua');
    setStudentStatusFilter('aktif,calon');
  }

  function handleTabChange(tab: TagihanTab) {
    setActiveTab(tab);
    setJenisFilter('');
    setKelasFilter('');
    setBulanFilter('');
    setSearchFilter('');

    if (tab === 'semua') {
      setTahunAjaranFilter('all');
      setStatusFilter('belum_bayar,sebagian');
      setStudentStatusFilter('aktif,calon');
      return;
    }

    if (tab === 'aktif') {
      setTahunAjaranFilter(activeYear?.id ?? '');
      setStatusFilter('belum_bayar,sebagian');
      setStudentStatusFilter('aktif');
      return;
    }

    if (tab === 'pendaftaran') {
      setTahunAjaranFilter('all');
      setStatusFilter('belum_bayar,sebagian');
      setStudentStatusFilter('calon');
      return;
    }

    if (tab === 'tunggakan_lama') {
      setTahunAjaranFilter('all');
      setStatusFilter('belum_bayar,sebagian');
      setStudentStatusFilter('');
      return;
    }

    if (tab === 'dibatalkan') {
      setTahunAjaranFilter('all');
      setStatusFilter('dibatalkan');
      setStudentStatusFilter('');
    }
  }

  const tahunTagihanOptions = useMemo(() => {
    const years = tahunAjaranOptions.filter((i) => !i.deleted_at);
    if (activeTab === 'aktif') {
      return activeYear ? [{ value: activeYear.id, label: activeYear.nama }] : [{ value: '', label: 'Belum ada TA aktif' }];
    }
    if (activeTab === 'pendaftaran') {
      const draftYears = years.filter((i) => i.status === 'draft');
      return [{ value: 'all', label: 'Semua Tahun Draft' }, ...draftYears.map((i) => ({ value: i.id, label: i.nama }))];
    }
    if (activeTab === 'tunggakan_lama') {
      const oldYears = years.filter((i) => i.id !== activeYear?.id && i.status !== 'draft');
      return [{ value: 'all', label: 'Semua Tahun Sebelumnya' }, ...oldYears.map((i) => ({ value: i.id, label: i.nama }))];
    }
    return [{ value: 'all', label: 'Semua Tahun' }, ...years.map((i) => ({ value: i.id, label: i.nama }))];
  }, [activeTab, activeYear, tahunAjaranOptions]);

  const statusTagihanOptions = useMemo(() => {
    if (activeTab === 'tunggakan_lama') {
      return [
        { value: 'belum_bayar,sebagian', label: 'Belum Lunas' },
        { value: 'belum_bayar', label: 'Belum Bayar' },
        { value: 'sebagian', label: 'Sebagian' },
      ];
    }
    if (activeTab === 'dibatalkan') {
      return [{ value: 'dibatalkan', label: 'Dibatalkan' }];
    }
    return [
      { value: 'belum_bayar,sebagian', label: 'Belum Lunas' }, { value: '', label: 'Semua Status' }, { value: 'belum_bayar', label: 'Belum Bayar' },
      { value: 'sebagian', label: 'Sebagian' }, { value: 'lunas', label: 'Lunas' },
      { value: 'dibatalkan', label: 'Dibatalkan' },
    ];
  }, [activeTab]);

  const statusSiswaOptions = useMemo(() => {
    if (activeTab === 'aktif') return [{ value: 'aktif', label: 'Aktif' }];
    if (activeTab === 'pendaftaran') return [{ value: 'calon', label: 'Calon' }, { value: 'batal_daftar', label: 'Batal Daftar' }, { value: '', label: 'Semua Status Siswa' }];
    if (activeTab === 'tunggakan_lama' || activeTab === 'dibatalkan') return [
      { value: '', label: 'Semua Status Siswa' }, { value: 'aktif', label: 'Aktif' }, { value: 'calon', label: 'Calon' }, { value: 'lulus', label: 'Alumni' }, { value: 'lulus,berhenti,batal_daftar', label: 'Arsip' },
    ];
    return [
      { value: 'aktif,calon', label: 'Aktif + Calon' }, { value: 'aktif', label: 'Aktif' },
      { value: 'calon', label: 'Calon' }, { value: 'lulus', label: 'Alumni' }, { value: 'lulus,berhenti,batal_daftar', label: 'Arsip' }, { value: '', label: 'Semua Status Siswa' },
    ];
  }, [activeTab]);

  const mainTagihanFilters = useMemo(() => [
    { id: 'tahunAjaran', label: 'Tahun Tagihan', type: 'select' as const, value: tahunAjaranFilter, onChange: (v: string) => { setTahunAjaranFilter(v); setKelasFilter(''); }, options: tahunTagihanOptions, disabled: activeTab === 'aktif', compact: false },
    { id: 'jenis', label: 'Jenis', type: 'select' as const, value: jenisFilter, onChange: setJenisFilter, options: [
      { value: '', label: 'Semua Jenis' },
      ...activeJenisOptions
        .filter((i) => activeTab !== 'pendaftaran' || ['pendaftaran', 'daftar ulang', 'daftar_ulang'].includes(i.nama.toLowerCase()))
        .map((i) => ({ value: i.nama.toLowerCase(), label: i.nama })),
    ], compact: false },
    { id: 'status', label: 'Status Tagihan', type: 'select' as const, value: statusFilter, onChange: setStatusFilter, options: statusTagihanOptions, disabled: activeTab === 'dibatalkan', compact: false },
  ], [tahunAjaranFilter, tahunTagihanOptions, activeTab, jenisFilter, statusFilter, statusTagihanOptions, activeJenisOptions]);

  const advancedTagihanFilters = useMemo(() => {
    const filters = [
    { id: 'kelas', label: 'Kelas', type: 'select' as const, value: kelasFilter, onChange: setKelasFilter, options: [
      { value: '', label: 'Semua Kelas' },
      ...filteredKelasOptions.map((k) => ({ value: k.id, label: formatKelasFilterLabel(k) })),
    ], compact: false },
    { id: 'bulan', label: 'Periode', type: 'month' as const, value: bulanFilter, onChange: setBulanFilter, placeholder: 'Bulan', compact: false },
    { id: 'studentStatus', label: 'Status Siswa', type: 'select' as const, value: studentStatusFilter, onChange: setStudentStatusFilter, options: statusSiswaOptions, disabled: activeTab === 'aktif', compact: false },
    ];
    return filters.filter((filter) => {
      if (activeTab === 'pendaftaran' && filter.id === 'kelas') return false;
      if (activeTab === 'pendaftaran' && filter.id === 'bulan') return false;
      if (activeTab === 'dibatalkan' && filter.id === 'bulan') return false;
      return true;
    });
  }, [kelasFilter, bulanFilter, studentStatusFilter, filteredKelasOptions, statusSiswaOptions, activeTab]);

  const tabLabels: Record<TagihanTab, string> = {
    semua: 'Semua Tagihan',
    aktif: 'Tahun Ajaran Aktif',
    pendaftaran: 'Pra Tahun Ajaran',
    tunggakan_lama: 'Tunggakan Lama',
    dibatalkan: 'Dibatalkan',
  };
  const statusLabel = statusTagihanOptions.find((option) => option.value === statusFilter)?.label ?? 'Semua Status';
  const statusSiswaLabel = statusSiswaOptions.find((option) => option.value === studentStatusFilter)?.label ?? 'Semua Status Siswa';
  const tahunTagihanLabel = tahunTagihanOptions.find((option) => option.value === tahunAjaranFilter)?.label ?? 'Semua Tahun';
  const tagihanChips: FilterChip[] = [
    { key: 'tab', label: `Tab: ${tabLabels[activeTab]}` },
    { key: 'tahun', label: `Tahun Tagihan: ${tahunTagihanLabel}` },
    { key: 'status', label: `Status: ${statusLabel}` },
    { key: 'siswa', label: `Siswa: ${statusSiswaLabel}` },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader
        title="Tagihan"
        description="Kelola tagihan lintas siswa, buat tagihan manual non-SPP, dan catat pembayaran."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/tagihan/buat')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:from-brand-500 hover:to-indigo-500"
            >
              <FilePlus2 className="h-4 w-4" />
              Buat Tagihan
            </button>

            <button
              type="button"
              onClick={() => navigate('/tagihan/batalkan-massal')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-danger-600 transition hover:bg-danger-50 dark:border-slate-700 dark:bg-slate-800 dark:text-danger-400 dark:hover:bg-danger-950/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Batalkan Massal
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white/90 p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        {([
          { value: 'semua', label: 'Semua' },
          { value: 'aktif', label: 'Tahun Aktif' },
          { value: 'pendaftaran', label: 'Pra Tahun Ajaran' },
          { value: 'tunggakan_lama', label: 'Tunggakan Lama' },
          { value: 'dibatalkan', label: 'Dibatalkan' },
        ] as { value: TagihanTab; label: string }[]).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleTabChange(tab.value)}
            className={`h-9 rounded-lg px-3 text-xs font-extrabold transition ${activeTab === tab.value ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <SummaryGroupGrid>
        <SummaryGroupCard title="Nominal Tagihan" tone="brand" layout="mini">
          <SummaryGroupMiniCard label="Total Tagihan" value={formatRupiah(summaryStats.totalTagihan)} highlight />
          <SummaryGroupMiniCard label="Sudah Dibayar" value={formatRupiah(summaryStats.totalDibayar)} />
          <SummaryGroupMiniCard label="Sisa Tagihan" value={formatRupiah(summaryStats.sisaTagihan)} />
        </SummaryGroupCard>
        <SummaryGroupCard title="Status Tagihan" tone="amber" layout="mini">
          <SummaryGroupMiniCard label="Belum Lunas" value={`${summaryStats.jumlahBelumLunas} tagihan`} />
          <SummaryGroupMiniCard label="Siswa Ditagih" value={`${summaryStats.siswaTerkait} siswa`} />
          <SummaryGroupMiniCard label="Lewat Tempo" value={`${summaryStats.lewatJatuhTempo} tagihan`} />
        </SummaryGroupCard>
      </SummaryGroupGrid>

      <CollapsibleFilterCard
        chips={tagihanChips}
        summary={`Menampilkan ${displayedTagihan.length} tagihan`}
        mobileSummary={`${statusLabel} · ${tahunTagihanLabel} · ${statusSiswaLabel}`}
        onReset={resetTagihanFilters}
      >
        {[...mainTagihanFilters, ...advancedTagihanFilters].map((filter) => (
          <FilterInput key={filter.id} type={filter.type} value={filter.value} onChange={filter.onChange} label={filter.label} options={filter.options} placeholder={'placeholder' in filter ? filter.placeholder : undefined} disabled={'disabled' in filter ? filter.disabled : false} compact />
        ))}
      </CollapsibleFilterCard>
      


      {/* Tabel Tagihan */}
      <SectionCard
        title="Daftar Tagihan"
        actions={<FilterInput type="search" value={searchFilter} onChange={setSearchFilter} label="Cari" placeholder="Nama siswa..." compact />}
      >
        {displayedTagihan.length === 0 ? (
          <EmptyState title="Belum ada tagihan" description="Coba generate SPP atau buat tagihan manual agar daftar tagihan siswa mulai terisi." />
        ) : (
          <>
            {/* MOBILE: card list per tagihan */}
            <div className="space-y-3 sm:hidden">
              {paginateData(displayedTagihan, page, pageSize).map((item) => {
                const itemYearId = item.tahun_ajaran_id ?? item.activeClass?.tahun_ajaran_id ?? item.siswa?.tahun_ajaran_target_id ?? '';
                const itemYear = tahunAjaranMap.get(itemYearId);
                const itemLocked = (itemYear?.status ?? (itemYear?.aktif ? 'aktif' : 'draft')) === 'arsip';
                const isCancelled = Boolean(item.deleted_at) || item.status === 'dibatalkan';
                const isEarliestUnpaidSpp = item.jenis !== 'spp' || !item.bulan_tahun || earliestUnpaidSppPerSiswa.get(item.siswa_id) === item.bulan_tahun;
                const canPay = !isCancelled && item.status !== 'lunas' && isEarliestUnpaidSpp;
                return (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{item.siswa?.nama ?? '-'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.activeClass ? formatKelasLabel(item.activeClass) : '-'}</p>
                      </div>
                      <StatusBadgeTagihan status={item.status} />
                    </div>
                    <div className="mt-3">
                      <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                        {formatRupiah(item.jumlah_total)}
                      </p>
                      {item.potongan_diskon && item.potongan_diskon > 0 ? (
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-slate-400 line-through">
                            {formatRupiah(item.jumlah_total + item.potongan_diskon)}
                          </span>
                          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-400">
                            {item.nama_promo || 'Diskon'}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-400">{item.nama_tagihan}</p>
                    {item.jatuh_tempo && <p className="mt-1 text-xs text-slate-400">Jatuh tempo: {formatTanggal(item.jatuh_tempo)}</p>}
                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <button type="button" onClick={() => setDetailTagihanId(item.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"><Eye className="h-3.5 w-3.5" />Detail</button>
                      <button type="button" onClick={() => navigate(`/pembayaran/new?tagihanId=${item.id}`)} disabled={!canPay} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"><CreditCard className="h-3.5 w-3.5" />Bayar</button>
                      <button type="button" disabled={isCancelled || itemLocked || deleteId === item.id || item.jenis === 'spp' || item.jenis === 'daftar_ulang'} onClick={() => { requestConfirm({ title: 'Batalkan tagihan?', description: `Batalkan tagihan "${item.nama_tagihan}"?`, confirmLabel: 'Ya, Batalkan', variant: 'danger', requireInput: true, inputLabel: 'Alasan Pembatalan', onConfirm: async (catatan?: string) => { if (!actor) return; setDeleteId(item.id); try { await deleteTagihan(actor, item.id, catatan || '-'); addToast({ type: 'success', title: 'Berhasil', message: 'Tagihan berhasil dibatalkan.' }); } catch (error) { addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal membatalkan tagihan.' }); } finally { setDeleteId(null); } } }); }} className="inline-flex items-center gap-1.5 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-xs font-bold text-danger-700 transition hover:bg-danger-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400"><Trash2 className="h-3.5 w-3.5" />Batalkan</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP: table */}
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nama Siswa</th>
                  <th className="px-4 py-3 font-semibold">Kelas</th>
                  <th className="px-4 py-3 font-semibold">Nama Tagihan</th>
                  <th className="px-4 py-3 font-semibold">Jatuh Tempo</th>
                  <th className="px-4 py-3 font-semibold text-right">Tarif Awal</th>
                  <th className="px-4 py-3 font-semibold text-right">Diskon</th>
                  <th className="px-4 py-3 font-semibold text-right">Tagihan Bersih</th>
                  <th className="px-4 py-3 font-semibold text-center">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {paginateData(displayedTagihan, page, pageSize).map((item) => {
                  const itemYearId = item.tahun_ajaran_id ?? item.activeClass?.tahun_ajaran_id ?? item.siswa?.tahun_ajaran_target_id ?? '';
                  const itemYear = tahunAjaranMap.get(itemYearId);
                  const itemLocked = (itemYear?.status ?? (itemYear?.aktif ? 'aktif' : 'draft')) === 'arsip';
                  const isCancelled = Boolean(item.deleted_at) || item.status === 'dibatalkan';
                  const isEarliestUnpaidSpp = item.jenis !== 'spp' || !item.bulan_tahun || earliestUnpaidSppPerSiswa.get(item.siswa_id) === item.bulan_tahun;
                  const canPay = !isCancelled && item.status !== 'lunas' && isEarliestUnpaidSpp;

                  return (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{item.siswa?.nama ?? '-'}</td>
                      <td className="px-4 py-3">{item.activeClass ? formatKelasLabel(item.activeClass) : '-'}</td>
                      <td className="px-4 py-3 font-medium">{item.nama_tagihan}</td>
                      <td className="px-4 py-3">{item.jatuh_tempo ? formatTanggal(item.jatuh_tempo) : '-'}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatRupiah(item.jumlah_total + (item.potongan_diskon || 0))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.potongan_diskon && item.potongan_diskon > 0 ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-brand-600 dark:text-brand-400 font-medium">
                              {formatRupiah(item.potongan_diskon)}
                            </span>
                            <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-400" title={item.nama_promo || 'Diskon'}>
                              {item.nama_promo ? (item.nama_promo.length > 15 ? item.nama_promo.substring(0, 15) + '...' : item.nama_promo) : 'Promo'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-100">
                        {formatRupiah(item.jumlah_total)}
                      </td>
                      <td className="px-4 py-3 text-center"><StatusBadgeTagihan status={item.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => setDetailTagihanId(item.id)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" title="Detail">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/pembayaran/new?tagihanId=${item.id}`)}
                            disabled={!canPay}
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                            title="Catat Bayar"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isCancelled || itemLocked || deleteId === item.id || item.jenis === 'spp' || item.jenis === 'daftar_ulang'}
                            onClick={() => {
                              requestConfirm({
                                title: 'Batalkan tagihan?',
                                description: `Batalkan tagihan "${item.nama_tagihan}"?`,
                                confirmLabel: 'Ya, Batalkan',
                                variant: 'danger',
                                requireInput: true,
                                inputLabel: 'Alasan Pembatalan',
                                onConfirm: async (catatan?: string) => {
                                  if (!actor) return;
                                  setDeleteId(item.id);
                                  try {
                                    await deleteTagihan(actor, item.id, catatan || '-');
                                    addToast({ type: 'success', title: 'Berhasil', message: 'Tagihan berhasil dibatalkan.' });
                                  } catch (error) {
                                    addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal membatalkan tagihan.' });
                                  } finally {
                                    setDeleteId(null);
                                  }
                                }
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-danger-100 bg-danger-50 px-2.5 py-1.5 text-xs font-bold text-danger-700 transition hover:bg-danger-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400"
                            title="Batalkan"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <Pagination currentPage={page} totalItems={displayedTagihan.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </SectionCard>

      {/* Modal Detail Tagihan */}
      {detailTagihan && (
        <Modal open={true} onClose={() => setDetailTagihanId(null)}>
          <div className="p-6 space-y-5">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Detail Tagihan</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-400">Nama Tagihan</p>
                <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{detailTagihan.nama_tagihan}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Jenis</p>
                <div className="mt-1"><JenisTagihanBadge jenis={detailTagihan.jenis} /></div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Siswa</p>
                <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{detailTagihan.siswa?.nama ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Status</p>
                <div className="mt-1"><StatusBadgeTagihan status={detailTagihan.status} /></div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Nominal</p>
                <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{formatRupiah(detailTagihan.jumlah_total)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Sudah Dibayar</p>
                <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatRupiah(detailTagihan.sudah_dibayar)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Sisa</p>
                <p className="mt-1 text-sm font-bold text-danger-600 dark:text-danger-400">{formatRupiah(Math.max(0, detailTagihan.jumlah_total - detailTagihan.sudah_dibayar))}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Jatuh Tempo</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{formatTanggal(detailTagihan.jatuh_tempo)}</p>
              </div>
            </div>

            {detailTagihan.status === 'dibatalkan' && detailTagihanBatalLog && (
              <div className="rounded-2xl border border-danger-100 bg-danger-50/80 p-4 dark:border-danger-950/40 dark:bg-danger-950/20">
                <p className="text-xs font-bold uppercase tracking-wide text-danger-500">Alasan Pembatalan</p>
                <p className="mt-1 text-sm text-danger-700 dark:text-danger-400">{detailTagihanBatalLog.payload?.catatan || '-'}</p>
              </div>
            )}

            {detailPembayaranList.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Riwayat Pembayaran</p>
                <div className="space-y-2">
                  {detailPembayaranList.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
                      <div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatRupiah(p.jumlah)}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{formatTanggal(p.tanggal)} · {p.metode}</p>
                      </div>
                      <p className="text-xs text-slate-400">{p.no_kuitansi || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
