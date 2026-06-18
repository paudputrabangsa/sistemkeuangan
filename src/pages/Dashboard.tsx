import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  TrendingUp,
  AlertCircle,
  Database,
  ArrowUpRight,
  Clock,
  CheckCircle,
  CheckCircle2,
  Circle,
  FileSpreadsheet,
} from 'lucide-react';
import { formatRupiah, formatTanggal, formatKelasLabel } from '../lib/format';
import { getDashboardSummary } from '../queries/dashboardQueries';
import { getSetupStatus } from '../services/setupStatusService';
import { getCurrentActor } from '../lib/actor';
import { completeMigrasiDataAwal, skipMigrasiDataAwal } from '../services/onboardingService';
import { useAuthStore } from '../store/authStore';
import { useState } from 'react';

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const [actionError, setActionError] = useState('');
  const summary = useLiveQuery(() => getDashboardSummary(), [], null);
  const setupStatus = useLiveQuery(() => getSetupStatus(), [], null);

  async function activateOperational(mode: 'skip' | 'complete') {
    if (!actor) return;
    setActionError('');
    try {
      if (mode === 'skip') await skipMigrasiDataAwal(actor);
      else await completeMigrasiDataAwal(actor);
      navigate('/');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Gagal mengaktifkan operasional.');
    }
  }

  const stats = [
    {
      title: 'Siswa Aktif',
      value: summary ? `${summary.activeStudents} Siswa` : '-',
      change: summary ? `${summary.calonStudents} calon pendaftar` : 'Memuat data...',
      icon: Users,
      color: 'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/50',
    },
    {
      title: 'Penerimaan Bulan Ini',
      value: summary ? formatRupiah(summary.paidThisMonth) : '-',
      change: 'Total pembayaran bulan berjalan',
      icon: TrendingUp,
      color: 'text-success-600 bg-success-50 dark:text-success-400 dark:bg-success-950/50',
    },
    {
      title: 'Tunggakan Tahun Berjalan',
      value: summary ? formatRupiah(summary.currentYearOutstanding) : '-',
      change: 'Sisa tagihan tahun ajaran aktif',
      icon: AlertCircle,
      color: 'text-danger-600 bg-danger-50 dark:text-danger-400 dark:bg-danger-950/50',
    },
    {
      title: 'Tunggakan Lama',
      value: summary ? formatRupiah(summary.oldYearOutstanding) : '-',
      change: summary ? `${summary.unpaidOldStudents} siswa masih punya sisa tagihan tahun lalu` : 'Memuat data...',
      icon: Clock,
      color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50',
      action: () => navigate('/laporan/tunggakan?sumber=tunggakan_lama&konteks=semua'),
    },
  ].filter(stat => {
    if (stat.title === 'Tunggakan Lama') {
      return summary ? summary.oldYearOutstanding > 0 : false;
    }
    return true;
  });

  const recentPayments = summary?.recentPayments ?? [];

  if (setupStatus && !setupStatus.isComplete) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
        <div className="rounded-3xl border border-amber-100 bg-white p-6 shadow-sm dark:border-amber-950/40 dark:bg-slate-900/60">
          <p className="text-xs font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-300">Setup awal belum lengkap</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Lengkapi data dasar sekolah</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Aplikasi belum menampilkan ringkasan operasional sebelum profil sekolah, tahun ajaran aktif, kelas, dan pengaturan pendaftaran selesai.</p>
          <button onClick={() => navigate('/setup-awal')} className="mt-5 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500">Lanjutkan Setup Awal</button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {setupStatus.items.map((item) => {
            const Icon = item.done ? CheckCircle2 : Circle;
            return (
              <div key={item.key} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <Icon className={`mt-0.5 h-5 w-5 ${item.done ? 'text-success-600 dark:text-success-400' : 'text-amber-500'}`} />
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-100">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (setupStatus && setupStatus.isComplete && !setupStatus.isOperationalActive) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
        <div className="rounded-3xl border border-brand-100 bg-white p-6 shadow-sm dark:border-brand-950/40 dark:bg-slate-900/60">
          <p className="text-xs font-extrabold uppercase tracking-wide text-brand-700 dark:text-brand-300">Setup awal selesai</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Lanjutkan Migrasi Data Awal atau mulai operasional</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Sebelum menu operasional dibuka penuh, tentukan apakah sekolah perlu memasukkan data existing seperti calon, siswa aktif, piutang, dan pembayaran lama.</p>
          {actionError ? <div className="mt-4 rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400">{actionError}</div> : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={() => navigate('/migrasi')} className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500">Buka Migrasi Data Awal</button>
            <button onClick={() => void activateOperational('skip')} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Lewati Migrasi dan Mulai Operasional</button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <button onClick={() => navigate('/migrasi/calon-siswa')} className="rounded-2xl border border-slate-100 bg-white/70 p-5 text-left transition hover:border-brand-200 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/40">
            <FileSpreadsheet className="h-6 w-6 text-brand-600" />
            <p className="mt-4 font-extrabold text-slate-800 dark:text-slate-100">Migrasi Calon Siswa</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Masukkan data calon, tagihan pendaftaran, dan pembayaran lama dalam satu siklus.</p>
          </button>
          <button onClick={() => navigate('/migrasi/siswa-tahun-berjalan')} className="rounded-2xl border border-slate-100 bg-white/70 p-5 text-left transition hover:border-brand-200 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/40">
            <Users className="h-6 w-6 text-brand-600" />
            <p className="mt-4 font-extrabold text-slate-800 dark:text-slate-100">Migrasi Siswa Tahun Berjalan</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Masukkan siswa aktif/keluar beserta piutang dan pembayaran historis.</p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Dashboard</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Ringkasan operasional</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{summary?.activeYear ? `Tahun Ajaran ${summary.activeYear.nama} aktif` : 'Belum ada tahun ajaran aktif'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/siswa/new')} className="rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-500">Tambah Siswa</button>
          <button onClick={() => navigate('/pembayaran')} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Catat Bayar</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => {
          const IconComponent = item.icon;
          const CardContent = (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{item.title}</span>
                <span className={`rounded-xl p-2.5 ${item.color}`}>
                  <IconComponent className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 md:text-3xl">{item.value}</h3>
                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">{item.change}</p>
              </div>
            </>
          );

          if (item.action) {
            return (
              <button key={item.title} onClick={item.action} className="text-left glass flex flex-col justify-between rounded-2xl border border-slate-100 p-6 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md dark:border-slate-800">
                {CardContent}
              </button>
            );
          }

          return (
            <div key={item.title} className="glass flex flex-col justify-between rounded-2xl border border-slate-100 p-6 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md dark:border-slate-800">
              {CardContent}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="glass rounded-2xl border border-slate-100 p-6 shadow-sm dark:border-slate-800 lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Pembayaran Terkini</h3>
              <p className="text-xs text-slate-500">Daftar transaksi terbaru yang tercatat di IndexedDB</p>
            </div>
            <button onClick={() => navigate('/pembayaran')} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
              Lihat Semua <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          {recentPayments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/40 px-6 py-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
              Belum ada pembayaran yang tercatat.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase text-slate-400 dark:border-slate-800">
                    <th className="px-4 py-3">Siswa</th>
                    <th className="px-4 py-3">Kelas</th>
                    <th className="px-4 py-3">Tagihan</th>
                    <th className="px-4 py-3">Nominal</th>
                    <th className="px-4 py-3">Metode</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {recentPayments.map((payment) => (
                    <tr key={payment.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                      <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">
                        <div>{payment.siswa?.nama}</div>
                        <div className="text-[10px] font-normal text-slate-400">{formatTanggal(payment.tanggal)}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">{payment.activeClass ? formatKelasLabel(payment.activeClass) : '-'}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                          {payment.tagihan?.nama_tagihan}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">{formatRupiah(payment.jumlah)}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">{payment.metode}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-0.5 text-[11px] font-bold text-success-700 dark:bg-success-950/30 dark:text-success-400">
                          <CheckCircle className="h-3 w-3" /> Lunas
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass rounded-2xl border border-slate-100 p-6 shadow-sm dark:border-slate-800">
            <h3 className="mb-4 text-lg font-bold text-slate-800 dark:text-slate-100">Aksi Cepat</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => navigate('/siswa')}
                className="flex flex-col items-center justify-center rounded-xl border border-indigo-100/50 bg-indigo-50 p-4 text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-950/50 dark:bg-indigo-950/20 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
              >
                <Users className="mb-2 h-6 w-6" />
                <span className="text-xs font-bold">Daftar Siswa</span>
              </button>
              <button
                onClick={() => navigate('/pembayaran')}
                className="flex flex-col items-center justify-center rounded-xl border border-success-100/50 bg-success-50 p-4 text-success-700 transition-colors hover:bg-success-100 dark:border-success-950/50 dark:bg-success-950/20 dark:text-success-400 dark:hover:bg-success-950/40"
              >
                <TrendingUp className="mb-2 h-6 w-6" />
                <span className="text-xs font-bold">Catat Bayar</span>
              </button>
            </div>
          </div>

          <div className="glass rounded-2xl border border-slate-100 p-6 shadow-sm dark:border-slate-800">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
              <Clock className="h-4 w-4 text-slate-500" /> Sinkronisasi Offline
            </h3>
            <div className="space-y-4">
              <div className="flex gap-3 text-xs">
                <div className="mt-0.5 rounded-full bg-slate-100 p-1 text-slate-500 dark:bg-slate-800">
                  <Database className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">LocalDB Terhubung</p>
                  <p className="text-[10px] text-slate-400">Database lokal Dexie.js aktif dengan 12 tabel terindeks.</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <div className="mt-0.5 rounded-full bg-brand-50 p-1 text-brand-500 dark:bg-brand-950/40">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Sync Queue: {summary?.pendingSyncCount ?? 0} Transaksi Pending</p>
                  <p className="text-[10px] text-slate-400">Semua perubahan lokal aman di IndexedDB dan akan disinkronkan otomatis saat online.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
