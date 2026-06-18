import { useEffect, useState, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Eye, Pencil, Plus, Search, Trash2, Hash, Download } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import EmptyState from '../components/ui/EmptyState';
import StatusBadgeSiswa from '../components/ui/StatusBadgeSiswa';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { listActiveKelas } from '../queries/kelasQueries';
import { listSiswaWithFilters, type SiswaPeriodStatus } from '../queries/siswaQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { formatRupiah, formatKelasLabel } from '../lib/format';
import { getCurrentActor } from '../lib/actor';
import { useAuthStore } from '../store/authStore';
import { deleteSiswa, generateNisMassal } from '../services/siswaService';
import { exportSiswaToExcel } from '../lib/excelGenerator';
import { db } from '../db';
import { ServiceError } from '../services/service-errors';
import { useToastStore } from '../store/toastStore';

type ContextTab = 'aktif' | 'calon' | 'arsip' | 'semua';
type StatusTab = SiswaPeriodStatus | 'semua';

const contextTabs = [
  { value: 'aktif', label: 'Siswa Aktif' },
  { value: 'calon', label: 'Calon Siswa' },
  { value: 'arsip', label: 'Alumni / Arsip' },
  { value: 'semua', label: 'Semua Data' },
] as const;

export default function SiswaListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);

  const [activeContext, setActiveContext] = useState<ContextTab>('aktif');
  const [status, setStatus] = useState<StatusTab>('semua');
  const [search, setSearch] = useState('');
  const [kelasId, setKelasId] = useState('');
  const [tahunAjaranId, setTahunAjaranId] = useState('');
  const { addToast } = useToastStore();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{ id: string; nama: string } | null>(null);

  const [confirmNisOpen, setConfirmNisOpen] = useState(false);
  const [isGeneratingNis, setIsGeneratingNis] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [tambahOpen, setTambahOpen] = useState(false);
  const tambahDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tambahDropdownRef.current && !tambahDropdownRef.current.contains(event.target as Node)) {
        setTambahOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const kelasOptions = useLiveQuery(() => listActiveKelas(), [], []);
  const tahunAjaranOptions = useLiveQuery(() => listTahunAjaran(), [], []);
  
  const activeYears = tahunAjaranOptions.filter(y => y.status === 'aktif' || y.aktif);
  const draftYears = tahunAjaranOptions.filter(y => y.status === 'draft');
  const archiveYears = tahunAjaranOptions.filter(y => y.status === 'arsip').sort((a,b) => b.mulai.localeCompare(a.mulai));
  
  const tahunAjaranMap = new Map(tahunAjaranOptions.map((item) => [item.id, item]));

  let defaultYearForContext = '';
  if (activeContext === 'aktif') defaultYearForContext = activeYears[0]?.id || '';
  if (activeContext === 'calon') defaultYearForContext = draftYears[0]?.id || '';
  if (activeContext === 'arsip') defaultYearForContext = archiveYears[0]?.id || '';

  const effectiveYearId = activeContext === 'semua' || tahunAjaranId === 'all'
    ? '' 
    : (tahunAjaranId || defaultYearForContext);

  const queryTahunAjaranId = activeContext === 'semua' || tahunAjaranId === 'all' 
    ? 'all' 
    : (effectiveYearId || 'none');

  const siswa = useLiveQuery(
    () => listSiswaWithFilters({ status, search, kelasId: kelasId || undefined, tahunAjaranId: queryTahunAjaranId }),
    [status, search, kelasId, queryTahunAjaranId],
    [],
  );

  // Effect to automatically select default year based on context tab
  useEffect(() => {
    if (activeContext === 'aktif') {
      setTahunAjaranId(activeYears[0]?.id || '');
      setStatus('aktif');
    } else if (activeContext === 'calon') {
      setTahunAjaranId(draftYears[0]?.id || '');
      setStatus('semua');
    } else if (activeContext === 'arsip') {
      setTahunAjaranId(archiveYears[0]?.id || '');
      setStatus('alumni');
    } else if (activeContext === 'semua') {
      setTahunAjaranId('all');
      setStatus('semua');
    }
    setPage(1);
  }, [activeContext, tahunAjaranOptions.length]);

  useEffect(() => {
    setPage(1);
  }, [search, status, kelasId, tahunAjaranId]);

  const filteredKelasOptions = kelasOptions.filter((kelas) => kelas.tahun_ajaran_id === queryTahunAjaranId);
  const statusWithoutClass = status === 'calon' || status === 'batal_daftar' || activeContext === 'semua';
  const isYearUnselected = queryTahunAjaranId === 'all' || queryTahunAjaranId === 'none';
  const disableClassFilter = statusWithoutClass || isYearUnselected;

  useEffect(() => {
    if (disableClassFilter && kelasId) {
      setKelasId('');
    }
  }, [kelasId, disableClassFilter]);

  const handleDeleteSiswaConfirmed = useCallback(async () => {
    if (!actor || deletingId || !confirmDeleteTarget) return;

    setDeletingId(confirmDeleteTarget.id);
    try {
      await deleteSiswa(actor, confirmDeleteTarget.id);
      addToast({ type: 'success', title: 'Berhasil', message: `Data siswa ${confirmDeleteTarget.nama} berhasil dihapus.` });
    } catch (error) {
      addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : error instanceof Error ? error.message : 'Gagal menghapus siswa.' });
    } finally {
      setDeletingId(null);
      setConfirmDeleteTarget(null);
    }
  }, [actor, deletingId, confirmDeleteTarget, addToast]);

  const handleGenerateNisMassal = async () => {
    if (!actor) return;
    const activeYearId = activeYears[0]?.id;
    if (!activeYearId) {
      addToast({ type: 'error', title: 'Gagal', message: 'Tahun ajaran aktif tidak ditemukan.' });
      return;
    }

    setIsGeneratingNis(true);
    try {
      const res = await generateNisMassal(actor, activeYearId);
      addToast({ type: 'success', title: 'Berhasil', message: `Berhasil men-generate NIS untuk ${res.count} siswa.` });
    } catch (error) {
      addToast({ type: 'error', title: 'Gagal', message: error instanceof Error ? error.message : 'Gagal men-generate NIS.' });
    } finally {
      setIsGeneratingNis(false);
      setConfirmNisOpen(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const kelasList = await db.kelas.toArray();
      const kelasMap = new Map(kelasList.map(k => [k.id, k]));
      const assignments = await db.siswa_kelas.toArray();
      
      const tahunNama = tahunAjaranId === 'all' || !tahunAjaranId ? 'Semua' : (tahunAjaranMap.get(tahunAjaranId)?.nama || tahunAjaranId);
      const kelasNama = kelasId ? (kelasMap.get(kelasId)?.nama_kelas || kelasId) : 'Semua';
      
      const filterCtx = `Konteks: ${activeContext}, Tahun: ${tahunNama}, Kelas: ${kelasNama}, Status: ${status}, Cari: ${search || '-'}`;
      await exportSiswaToExcel(siswa, kelasMap, assignments, filterCtx);
      addToast({ type: 'success', title: 'Berhasil', message: 'File Excel sedang diunduh.' });
    } catch (e: any) {
      addToast({ type: 'error', title: 'Gagal', message: 'Gagal mengekspor data: ' + e.message });
    } finally {
      setIsExporting(false);
    }
  };


  const paginatedSiswa = paginateData(siswa, page, pageSize);

  // Determine which years to show in the dropdown based on context
  let visibleYears = tahunAjaranOptions;
  if (activeContext === 'aktif') visibleYears = activeYears;
  else if (activeContext === 'calon') visibleYears = draftYears;
  else if (activeContext === 'arsip') visibleYears = archiveYears;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Siswa"
        description="Lihat seluruh data siswa, pantau status dan sisa tagihan, lalu buka detail atau edit profil sesuai kebutuhan."
        actions={
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'Mengekspor...' : 'Ekspor'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmNisOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Hash className="h-4 w-4" />
              Lengkapi NIS Kosong
            </button>
            <div className="relative" ref={tambahDropdownRef}>
              <button
                type="button"
                onClick={() => setTambahOpen(!tambahOpen)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Tambah Siswa
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>
              {tambahOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg z-10 dark:border-slate-800 dark:bg-slate-900">
                  <button onClick={() => navigate('/siswa/new?mode=calon')} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                    Tambah Calon Siswa
                  </button>
                  <button onClick={() => navigate('/siswa/new?mode=aktif')} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                    Tambah Siswa Aktif
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      />

      <SectionCard title="Filter siswa" description="Pilih konteks untuk melihat data yang sesuai, lalu cari berdasarkan nama atau kelas.">
        <div className="mb-4 flex flex-wrap gap-2">
          {contextTabs.map((tab) => {
            const active = activeContext === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveContext(tab.value)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                  active
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/10'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama siswa atau nama wali..."
              className="w-full rounded-xl border border-slate-200 bg-white/70 py-3 pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
            />
          </div>

          <select
            value={tahunAjaranId}
            onChange={(event) => {
              setTahunAjaranId(event.target.value);
              setKelasId('');
            }}
            disabled={activeContext === 'semua'}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 disabled:opacity-50"
          >
            <option value={activeContext === 'semua' ? 'all' : ''}>
              {activeContext === 'semua' ? 'Semua Tahun Ajaran' : 'Pilih Tahun Ajaran'}
            </option>
            {visibleYears.map((item) => (
              <option key={item.id} value={item.id}>{item.nama} - {item.status ?? 'draft'}</option>
            ))}
          </select>

          <select
            value={kelasId}
            onChange={(event) => setKelasId(event.target.value)}
            disabled={disableClassFilter}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 disabled:opacity-50"
          >
            <option value="">
              {statusWithoutClass 
                ? 'Filter kelas tidak berlaku' 
                : isYearUnselected 
                ? 'Pilih tahun ajaran dulu' 
                : 'Semua kelas di tahun terpilih'}
            </option>
            {filteredKelasOptions.map((kelas) => (
              <option key={kelas.id} value={kelas.id}>
                {formatKelasLabel(kelas)}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusTab)}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
          >
            {(activeContext === 'calon' || activeContext === 'semua') && (
              <option value="semua">Semua Status</option>
            )}
            {activeContext === 'aktif' && (
              <>
                <option value="aktif">Aktif</option>
                <option value="cuti">Cuti</option>
              </>
            )}
            {activeContext === 'calon' && (
              <>
                <option value="calon">Calon</option>
                <option value="batal_daftar">Batal Daftar</option>
              </>
            )}
            {activeContext === 'arsip' && (
              <>
                <option value="alumni">Alumni</option>
                <option value="tidak_lanjut">Tidak Lanjut</option>
              </>
            )}
            {activeContext === 'semua' && (
              <>
                <option value="aktif">Aktif</option>
                <option value="cuti">Cuti</option>
                <option value="calon">Calon</option>
                <option value="alumni">Alumni</option>
                <option value="naik_kelas">Naik Kelas</option>
                <option value="keluar">Keluar</option>
                <option value="batal_daftar">Batal Daftar</option>
                <option value="tidak_lanjut">Tidak Lanjut</option>
              </>
            )}
          </select>
        </div>
      </SectionCard>

      <SectionCard title="Daftar siswa" description="Data ini dibaca langsung dari IndexedDB dan akan ikut berubah saat ada penambahan atau pembaruan siswa.">
        {siswa.length === 0 ? (
          <EmptyState
            title="Belum ada siswa yang cocok"
            description="Coba ubah filter pencarian, atau mulai dengan menambahkan siswa baru ke sistem."
          />
        ) : (
          <>
            {/* MOBILE: card list per siswa */}
            <div className="space-y-3 sm:hidden">
              {paginatedSiswa.map((item) => {
                const itemYearId = item.activeClass?.tahun_ajaran_id ?? item.tahun_ajaran_target_id;
                const itemYear = tahunAjaranMap.get(itemYearId);
                const itemLocked = (itemYear?.status ?? (itemYear?.aktif ? 'aktif' : 'draft')) === 'arsip';
                return (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{item.nama}</p>
                        <p className="mt-0.5 text-xs text-slate-500">Daftar {item.tanggal_daftar}</p>
                      </div>
                      <StatusBadgeSiswa status={item.periodStatus} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Kelas</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{formatKelasLabel(item.periodClass) || '-'}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Wali</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{item.nama_wali}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Sisa Tagihan</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{formatRupiah(item.outstanding)}</span>
                    </div>
                    {item.kontak_wali && <p className="mt-2 text-[11px] text-slate-400">{item.kontak_wali}</p>}
                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <button type="button" onClick={() => navigate(`/siswa/${item.id}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"><Eye className="h-3.5 w-3.5" />Detail</button>
                      <button type="button" onClick={() => navigate(`/siswa/${item.id}/edit`)} disabled={itemLocked} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"><Pencil className="h-3.5 w-3.5" />Edit</button>
                      <button type="button" onClick={() => setConfirmDeleteTarget({ id: item.id, nama: item.nama })} disabled={itemLocked || deletingId === item.id} className="inline-flex items-center gap-1.5 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-xs font-bold text-danger-700 transition hover:bg-danger-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 dark:border-danger-950/50 dark:bg-danger-950/20 dark:text-danger-400 dark:hover:bg-danger-950/20 dark:disabled:border-slate-800 dark:disabled:text-slate-600"><Trash2 className="h-3.5 w-3.5" />{deletingId === item.id ? 'Menghapus...' : 'Hapus'}</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[840px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-4 py-3 font-semibold">Nama Siswa</th>
                    <th className="px-4 py-3 font-semibold">Kelas</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Wali</th>
                    <th className="px-4 py-3 font-semibold">Sisa Tagihan</th>
                    <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {paginatedSiswa.map((item) => {
                    const itemYearId = item.activeClass?.tahun_ajaran_id ?? item.tahun_ajaran_target_id;
                    const itemYear = tahunAjaranMap.get(itemYearId);
                    const itemLocked = (itemYear?.status ?? (itemYear?.aktif ? 'aktif' : 'draft')) === 'arsip';
                    return (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                      <td className="px-4 py-4">
                        <div className="font-bold text-slate-800 dark:text-slate-100">{item.nama}</div>
                        <div className="mt-1 text-xs text-slate-400">Daftar {item.tanggal_daftar}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                        {formatKelasLabel(item.periodClass)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadgeSiswa status={item.periodStatus} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-700 dark:text-slate-200">{item.nama_wali}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.kontak_wali}</div>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-800 dark:text-slate-100">
                        {formatRupiah(item.outstanding)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/siswa/${item.id}`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Lihat Detail
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/siswa/${item.id}/edit`)}
                            disabled={itemLocked}
                            title={itemLocked ? 'Data tahun ajaran arsip dikunci.' : undefined}
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTarget({ id: item.id, nama: item.nama })}
                            disabled={itemLocked || deletingId === item.id}
                            title={itemLocked ? 'Data tahun ajaran arsip dikunci.' : 'Hapus hanya untuk data salah input yang belum punya pembayaran dan riwayat kelas.'}
                            className="inline-flex items-center gap-1 rounded-lg border border-danger-100 bg-white/70 px-3 py-2 text-xs font-bold text-danger-700 transition hover:bg-danger-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 dark:border-danger-950/50 dark:bg-slate-900/50 dark:text-danger-400 dark:hover:bg-danger-950/20 dark:disabled:border-slate-800 dark:disabled:text-slate-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingId === item.id ? 'Menghapus...' : 'Hapus'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <Pagination currentPage={page} totalItems={siswa.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </SectionCard>

      <ConfirmDialog
        open={confirmDeleteTarget !== null}
        onClose={() => setConfirmDeleteTarget(null)}
        onConfirm={handleDeleteSiswaConfirmed}
        title="Hapus data siswa?"
        description={`Hapus data siswa ${confirmDeleteTarget?.nama ?? ''}? Aksi ini hanya bisa untuk data salah input yang belum punya pembayaran dan riwayat kelas.`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />

      <ConfirmDialog
        open={confirmNisOpen}
        onClose={() => setConfirmNisOpen(false)}
        onConfirm={handleGenerateNisMassal}
        title="Lengkapi NIS Kosong"
        description="Sistem akan menyisir seluruh siswa aktif yang NIS-nya masih kosong dan secara otomatis men-generate NIS berurutan menggunakan pola Tahun Ajaran Aktif (misal: 2526001). Apakah Anda yakin?"
        confirmLabel={isGeneratingNis ? 'Memproses...' : 'Ya, Generate NIS'}
        variant="warning"
      />
    </div>
  );
}
