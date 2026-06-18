import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import PageHeader from '../components/ui/PageHeader';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';
import FilterInput from '../components/ui/FilterInput';
import type { FilterChip } from '../components/ui/FilterChipBar';
import SectionCard from '../components/ui/SectionCard';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { db } from '../db';
import { formatTanggal } from '../lib/format';
import { exportLaporanAuditExcel } from '../lib/excelGenerator';

const get7DaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};
const getToday = () => new Date().toISOString().slice(0, 10);

const aksiLabels: Record<string, string> = {
  create: 'Tambah',
  update: 'Edit',
  delete: 'Hapus',
  batal: 'Batalkan',
  lainnya: 'Lainnya',
};

const aksiBadgeColors: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  update: 'bg-brand-100 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300',
  delete: 'bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300',
  batal: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  lainnya: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function LaporanAuditPage() {
  const [fromDate, setFromDate] = useState(get7DaysAgo());
  const [toDate, setToDate] = useState(getToday());
  const [aksiFilter, setAksiFilter] = useState('');
  const [adminFilter, setAdminFilter] = useState('');
  const [modulFilter, setModulFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  function resetFilters() {
    setFromDate(get7DaysAgo());
    setToDate(getToday());
    setAksiFilter('');
    setAdminFilter('');
    setModulFilter('');
    setSearch('');
    setPage(1);
  }

  const filterChips: FilterChip[] = [
    { key: 'periode', label: `${fromDate || 'Awal'} - ${toDate || 'Akhir'}` },
    { key: 'aksi', label: `Aksi: ${aksiFilter ? aksiLabels[aksiFilter] ?? aksiFilter : 'Semua'}` },
    { key: 'modul', label: `Modul: ${modulFilter || 'Semua'}` },
  ];

  // Fetch audit logs
  const auditLogs = useLiveQuery(async () => {
    const logs = await db.table('audit_log').toArray();
    return logs.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
  }, [], []);

  // Fetch akun for admin lookup
  const akun = useLiveQuery(async () => {
    try { return await db.akun.toArray(); } catch { return []; }
  }, [], []);
  const akunMap = new Map(akun.map((a) => [a.id, a.nama]));
  const akunOptions = useMemo(() => akun.filter((a) => !a.deleted_at), [akun]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return auditLogs.filter((log: any) => {
      // date range
      const logDate = log.created_at.slice(0, 10);
      if (fromDate && logDate < fromDate) return false;
      if (toDate && logDate > toDate) return false;

      if (aksiFilter && log.aksi !== aksiFilter) return false;
      if (adminFilter && log.user_id !== adminFilter) return false;
      if (modulFilter && log.tabel !== modulFilter) return false;

      if (q) {
        const desc = (log.deskripsi ?? '').toLowerCase();
        const payloadStr = JSON.stringify(log.payload ?? {}).toLowerCase();
        if (!desc.includes(q) && !payloadStr.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, fromDate, toDate, aksiFilter, adminFilter, modulFilter, search]);

  const auditFilterCtx = [
    fromDate || toDate ? `Periode: ${fromDate ? formatTanggal(fromDate) : 'Awal'} - ${toDate ? formatTanggal(toDate) : 'Akhir'}` : '',
    aksiFilter ? `Aksi: ${aksiFilter}` : '',
    adminFilter ? `Admin: ${akunOptions.find(a => a.id === adminFilter)?.nama || adminFilter}` : '',
    modulFilter ? `Modul: ${modulFilter}` : '',
    search ? `Cari: ${search}` : '',
  ].filter(Boolean).join(' | ');

  const handleExportExcel = () => exportLaporanAuditExcel(filtered, akunMap, auditFilterCtx);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader title="Audit Log" description="Catatan seluruh perubahan data dalam sistem. Halaman ini bersifat read-only." actions={
        <div className="flex gap-2">
          <button type="button" onClick={handleExportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Excel</button>
        </div>
      } />

      <CollapsibleFilterCard chips={filterChips} summary={`Menampilkan ${filtered.length} log`} onReset={resetFilters}>
        <FilterInput type="date" value={fromDate} onChange={setFromDate} label="Dari Tgl" compact />
        <FilterInput type="date" value={toDate} onChange={setToDate} label="Sampai Tgl" compact />
        <FilterInput type="select" value={aksiFilter} onChange={setAksiFilter} label="Aksi" compact options={[{ value: '', label: 'Semua Aksi' }, { value: 'create', label: 'Tambah' }, { value: 'update', label: 'Edit' }, { value: 'delete', label: 'Hapus' }, { value: 'batal', label: 'Batalkan' }, { value: 'lainnya', label: 'Lainnya / Import' }]} />
        <FilterInput type="select" value={adminFilter} onChange={setAdminFilter} label="Admin" compact options={[{ value: '', label: 'Semua Admin' }, ...akunOptions.map((a) => ({ value: a.id, label: a.nama }))]} />
        <FilterInput type="select" value={modulFilter} onChange={setModulFilter} label="Modul" compact options={[{ value: '', label: 'Semua Modul' }, { value: 'tagihan', label: 'Tagihan' }, { value: 'pembayaran', label: 'Pembayaran' }, { value: 'siswa', label: 'Siswa' }, { value: 'siswa_kelas', label: 'Penempatan Kelas' }, { value: 'kelas', label: 'Kelas' }, { value: 'tahun_ajaran', label: 'Tahun Ajaran' }]} />
        <FilterInput type="search" value={search} onChange={setSearch} placeholder="Cari siswa/entitas..." compact />
      </CollapsibleFilterCard>

      {/* Langsung tabel, tidak ada ringkasan */}
      <SectionCard>
        {filtered.length === 0 ? (
          <EmptyState title="Tidak ada log" description="Tidak ditemukan catatan audit untuk filter yang dipilih." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Waktu</th>
                    <th className="px-4 py-3 font-semibold">Admin</th>
                    <th className="px-4 py-3 font-semibold text-center">Jenis Aksi</th>
                    <th className="px-4 py-3 font-semibold">Modul</th>
                    <th className="px-4 py-3 font-semibold">Entitas Terdampak</th>
                    <th className="px-4 py-3 font-semibold">Nilai Sebelum → Sesudah</th>
                    <th className="px-4 py-3 font-semibold">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {paginateData(filtered, page, pageSize).map((log: any) => {
                    const adminName = akunMap.get(log.user_id) ?? 'Sistem';
                    const payload = log.payload ?? {};
                    const entitas = payload.nama_siswa ? `${payload.nama_siswa}${payload.no_referensi ? ` (${payload.no_referensi})` : ''}` : log.record_id?.slice(0, 8) ?? '-';
                    const hasBefore = log.aksi === 'update' && payload.before;
                    const hasAfter = log.aksi === 'update' && payload.after;
                    const flagMigrasi = payload.flag_migrasi ? '🔄' : '';

                    return (
                      <tr key={log.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                          {new Date(log.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium">{adminName}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${aksiBadgeColors[log.aksi] ?? aksiBadgeColors.lainnya}`}>
                            {aksiLabels[log.aksi] ?? log.aksi}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs capitalize">{log.tabel} {flagMigrasi}</td>
                        <td className="px-4 py-3 text-xs max-w-48 truncate">{entitas}</td>
                        <td className="px-4 py-3 text-xs max-w-56">
                          {hasBefore || hasAfter ? (
                            <div className="space-y-0.5">
                              {hasBefore && <span className="block text-danger-500 line-through truncate">{typeof payload.before === 'string' ? payload.before : JSON.stringify(payload.before).slice(0, 60)}</span>}
                              {hasAfter && <span className="block text-emerald-600 truncate">{typeof payload.after === 'string' ? payload.after : JSON.stringify(payload.after).slice(0, 60)}</span>}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-64 truncate" title={log.deskripsi}>{log.deskripsi || '-'}</td>
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
