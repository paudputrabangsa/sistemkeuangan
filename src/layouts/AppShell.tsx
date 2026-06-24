import { useState, useEffect } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuthStore } from '../store/authStore';
import { db } from '../db';
import { getSetupStatus } from '../services/setupStatusService';
import {
  BarChart3,
  Calendar,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  Sparkles,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import SyncQueueManager from '../components/ui/SyncQueueManager';

type NavigationItem = { name: string; href?: string; icon: LucideIcon; children?: Array<{ name: string; href: string; disabled?: boolean }> };

export default function AppShell() {
  const { user, logout, isOffline, setOfflineStatus, forceOffline, toggleForceOffline } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarHidden, setDesktopSidebarHidden] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [isQueueManagerOpen, setQueueManagerOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const pendingSyncCount = useLiveQuery(async () => db.sync_queue.where('status').equals('pending').count(), [], 0);
  const failedSyncCount = useLiveQuery(async () => db.sync_queue.where('status').equals('failed').count(), [], 0);
  const setupStatus = useLiveQuery(() => getSetupStatus(), [], null);
  const schoolProfile = useLiveQuery(
    async () => db.profil_sekolah.get('00000000-0000-0000-0000-000000000001'),
    [],
    null,
  );
  const activeYear = useLiveQuery(
    async () => db.tahun_ajaran.where('aktif').equals(1).first(),
    [],
    null,
  );
  const lastBackup = useLiveQuery(
    async () => db.pengaturan.where('kunci').equals('last_local_backup_date').first(),
    [],
    null,
  );

  // Listen to connection changes as per PRD
  useEffect(() => {
    const handleOnline = () => {
      setOfflineStatus(false);
      // Hanya auto-sync kalau tidak dalam forceOffline mode
      if (!useAuthStore.getState().forceOffline) {
        import('../services/syncService').then(({ triggerFullSync }) => {
          triggerFullSync();
        });
      }
    };
    const handleOffline = () => setOfflineStatus(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setOfflineStatus(!navigator.onLine);

    // Background sync interval every 30 seconds
    const interval = setInterval(() => {
      // Baca state terbaru untuk memastikan kita tidak sync saat offline dipaksa
      const state = useAuthStore.getState();
      if (navigator.onLine && !state.forceOffline) {
        import('../services/syncService').then(({ triggerFullSync }) => {
          triggerFullSync();
        });
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [setOfflineStatus]);

  const isSetupComplete = setupStatus?.isComplete ?? false;
  const isOperationalActive = setupStatus?.isOperationalActive ?? false;
  const navigation: NavigationItem[] = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    ...(!isSetupComplete ? [{ name: 'Setup Awal', icon: Sparkles, children: [{ name: 'Wizard Setup', href: '/setup-awal' }] }] : []),
    ...(!isSetupComplete ? [{
      name: 'Pengaturan',
      icon: Settings,
      children: [
        { name: 'Indeks Pengaturan', href: '/pengaturan' },
        { name: 'Akun', href: '/pengaturan/akun' },
        { name: 'Permission', href: '/pengaturan/permission' },
        { name: 'Reset Data', href: '/pengaturan/reset-data' },
      ],
    }] : !isOperationalActive ? [
      {
        name: 'Migrasi Data Awal',
        icon: RefreshCw,
        children: [
          { name: 'Indeks Migrasi', href: '/migrasi' },
          { name: 'Migrasi Calon Siswa', href: '/migrasi/calon-siswa' },
          { name: 'Migrasi Siswa Tahun Berjalan', href: '/migrasi/siswa-tahun-berjalan' },
        ],
      },
      {
        name: 'Tahun Ajaran',
        icon: Calendar,
        children: [
          { name: 'Daftar Tahun Ajaran', href: '/tahun-ajaran' },
          { name: 'Kelas & Tingkat', href: '/kelas' },
          { name: 'Komponen Biaya', href: '/tahun-ajaran/kelola-pendaftaran' },
        ],
      },
      {
        name: 'Pengaturan',
        icon: Settings,
        children: [
          { name: 'Indeks Pengaturan', href: '/pengaturan' },
          { name: 'Profil Sekolah', href: '/pengaturan/profil-sekolah' },
          { name: 'Jenis Tagihan', href: '/pengaturan/jenis-tagihan' },
          { name: 'Promo / Diskon', href: '/pengaturan/promo' },
          { name: 'Metode Pembayaran', href: '/pengaturan/metode-pembayaran' },
          { name: 'Akun', href: '/pengaturan/akun' },
          { name: 'Permission', href: '/pengaturan/permission' },
          { name: 'Reset Data', href: '/pengaturan/reset-data' },
        ],
      },
    ] : [
      {
        name: 'Siswa',
        icon: UserRound,
        children: [
          { name: 'Daftar Siswa', href: '/siswa' },
          { name: 'Tambah Calon Siswa', href: '/siswa/new?mode=calon' },
          ...(activeYear ? [{ name: 'Tambah Siswa Aktif', href: '/siswa/new?mode=aktif' }] : []),
        ],
      },
      {
        name: 'Keuangan',
        icon: CreditCard,
        children: [
          { name: 'Tagihan', href: '/tagihan' },
          { name: 'Pembayaran', href: '/pembayaran' },
        ],
      },
      {
        name: 'Tahun Ajaran',
        icon: Calendar,
        children: [
          { name: 'Daftar Tahun Ajaran', href: '/tahun-ajaran' },
          { name: 'Kelas & Tingkat', href: '/kelas' },
          { name: 'Komponen Biaya', href: '/tahun-ajaran/kelola-pendaftaran' },
          { name: 'Lanjut / Aktivasi TA', href: '/lanjut-tahun-ajaran' },
        ],
      },
      {
        name: 'Laporan',
        icon: BarChart3,
        children: [
          { name: 'Indeks Laporan', href: '/laporan' },
          { name: 'Laporan per Siswa', href: '/laporan/riwayat-siswa' },
          { name: 'Rekap Penerimaan', href: '/laporan/rekap-penerimaan' },
          { name: 'Daftar Tunggakan', href: '/laporan/tunggakan' },
          { name: 'Laporan Pendaftaran', href: '/laporan/pendaftaran' },
          { name: 'Laporan Aktivasi', href: '/laporan/aktivasi' },
          { name: 'Laporan Audit', href: '/laporan/audit' },
          { name: 'Laporan Diskon', href: '/laporan/diskon' },
        ],
      },
      {
        name: 'Pengaturan',
        icon: Settings,
        children: [
          { name: 'Indeks Pengaturan', href: '/pengaturan' },
          { name: 'Profil Sekolah', href: '/pengaturan/profil-sekolah' },
          { name: 'Jenis Tagihan', href: '/pengaturan/jenis-tagihan' },
          { name: 'Promo / Diskon', href: '/pengaturan/promo' },
          { name: 'Metode Pembayaran', href: '/pengaturan/metode-pembayaran' },
          { name: 'Akun', href: '/pengaturan/akun' },
          { name: 'Permission', href: '/pengaturan/permission' },
          { name: 'Reset Data', href: '/pengaturan/reset-data' },
        ],
      },
    ]),
  ];

  function isActiveHref(href: string) {
    return location.pathname === href || (href !== '/' && location.pathname.startsWith(`${href}/`));
  }

  const handleLogout = () => {
    setAccountMenuOpen(false);
    logout();
    navigate('/login');
  };

  const handleSidebarToggle = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setDesktopSidebarHidden((current) => !current);
      return;
    }
    setSidebarOpen(true);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 font-sans text-slate-700 dark:text-slate-200">

      {/* Dynamic Offline Banner */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-danger-600 text-white text-center py-2 text-xs font-bold shadow-md animate-bounce">
          Kamu sedang offline. Data akan disimpan lokal dan disinkronkan otomatis saat online.
        </div>
      )}

      {/* MOBILE SIDEBAR MOBILE DRAWER OVERLAY */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-66 glass border-r border-slate-100 dark:border-slate-800/80 flex flex-col transform lg:translate-x-0 transition-transform duration-300 ease-in-out lg:static lg:h-screen ${desktopSidebarHidden ? 'lg:hidden' : 'lg:flex'} ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Logo Brand */}
          <div className="h-20 flex items-center px-6 border-b border-slate-100 dark:border-slate-800/80 gap-3 shrink-0">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-brand-500 to-indigo-600 text-white shadow-md shadow-brand-500/20">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 tracking-tight leading-none">PAUD Billing</h2>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Admin Panel</span>
            </div>
            <button
              className="lg:hidden ml-auto p-1 text-slate-400 hover:text-slate-600"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto mt-4 px-4 pb-4 space-y-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              if (!item.children) {
                const href = item.href ?? '/';
                const parentActive = isActiveHref(href);
                return (
                  <Link key={item.name} to={href} onClick={() => setSidebarOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${parentActive ? 'bg-brand-600 text-white shadow-md shadow-brand-600/10' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-100'}`}>
                    <Icon className="h-4.5 w-4.5" />
                    {item.name}
                  </Link>
                );
              }

              const parentActive = item.children.some((child) => isActiveHref(child.href));
              const isExpanded = expandedMenus[item.name] ?? parentActive;

              return (
                <div key={item.name} className="space-y-1">
                  <button type="button" onClick={() => setExpandedMenus((current) => ({ ...current, [item.name]: !isExpanded }))} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${parentActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-100'}`}>
                    <Icon className="h-4.5 w-4.5" />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded ? (
                    <div className="ml-5 space-y-0.5 border-l border-slate-200 pl-3 dark:border-slate-800">
                      {item.children.map((child) => {
                        if (child.disabled) {
                          return (
                            <span key={child.name} className="block rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 dark:text-slate-600 cursor-not-allowed">
                              {child.name}
                            </span>
                          );
                        }
                        const childActive = isActiveHref(child.href);
                        return (
                          <Link key={child.name} to={child.href} onClick={() => setSidebarOpen(false)} className={`block rounded-lg px-3 py-2 text-xs font-semibold transition ${childActive ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/10' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-500 dark:hover:bg-slate-900/70 dark:hover:text-slate-200'}`}>
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </div>

      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto max-h-screen">

        {/* HEADER */}
        <header className="sticky top-0 z-30 shrink-0 border-b border-slate-100 bg-white/85 px-4 py-3 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/85 md:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={handleSidebarToggle}
                aria-label={desktopSidebarHidden ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-slate-400">Sistem Pencatatan Tagihan</p>
                <h1 className="mt-0.5 truncate text-lg font-extrabold leading-tight text-slate-900 dark:text-slate-100">{schoolProfile?.nama_sekolah ?? 'TK PAUD Melati Indah'}</h1>
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
              <button onClick={() => { if (failedSyncCount > 0) setQueueManagerOpen(true); }} className={`inline-flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/90 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70 ${failedSyncCount > 0 ? 'cursor-pointer hover:bg-danger-50 dark:hover:bg-danger-950/20 hover:border-danger-200 transition' : 'cursor-default'}`}>
                <RefreshCw className={`h-4 w-4 text-slate-400 ${pendingSyncCount > 0 && !isOffline ? 'animate-spin text-brand-500' : ''}`} />
                <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300">
                  {pendingSyncCount > 0 ? `${pendingSyncCount} pending` : failedSyncCount > 0 ? <span className="text-danger-500">{failedSyncCount} gagal sync</span> : 'Synced'}
                </span>
              </button>

              {isOffline || forceOffline ? (
                <button type="button" onClick={toggleForceOffline} title="Klik untuk mematikan Mode Offline Paksa" className="inline-flex items-center gap-2 rounded-2xl border border-danger-100 bg-danger-50 px-3 py-2 text-xs font-extrabold text-danger-700 transition hover:bg-danger-100 dark:border-danger-950/30 dark:bg-danger-950/20 dark:text-danger-400 dark:hover:bg-danger-950/40">
                  <WifiOff className="h-4 w-4" /> {forceOffline ? 'Offline (Paksa)' : 'Offline'}
                </button>
              ) : (
                <button type="button" onClick={toggleForceOffline} title="Klik untuk mengaktifkan Mode Offline Paksa" className="inline-flex items-center gap-2 rounded-2xl border border-success-100 bg-success-50 px-3 py-2 text-xs font-extrabold text-success-700 transition hover:bg-success-100 dark:border-success-950/30 dark:bg-success-950/20 dark:text-success-400 dark:hover:bg-success-950/40">
                  <Wifi className="h-4 w-4" /> Online
                </button>
              )}

              <div className="relative">
                <button type="button" onClick={() => setAccountMenuOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-2xl bg-transparent px-1.5 py-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-900" aria-expanded={accountMenuOpen} aria-label="Menu akun">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-extrabold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300 relative">
                    {(user?.nama || 'A').slice(0, 2).toUpperCase()}
                    {(!lastBackup || lastBackup.nilai?.date ? Math.floor((Date.now() - new Date(lastBackup?.nilai?.date || 0).getTime()) / 86400000) > 7 : true) && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3 rounded-full bg-danger-500 border-2 border-white dark:border-slate-950"></span>
                    )}
                  </span>
                  <ChevronDown className={`hidden h-4 w-4 text-slate-400 transition-transform sm:block ${accountMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {accountMenuOpen ? (
                  <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-100 bg-white p-3 shadow-xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/50">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-extrabold text-brand-700 dark:bg-brand-950/50 dark:text-brand-300">
                        {(user?.nama || 'A').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-slate-800 dark:text-slate-100">{user?.nama}</p>
                        <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-slate-400">{user?.role}</p>
                      </div>
                    </div>
                    <button onClick={handleLogout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-danger-100 px-4 py-2.5 text-sm font-extrabold text-danger-600 transition hover:bg-danger-50 dark:border-danger-950/40 dark:text-danger-400 dark:hover:bg-danger-950/20">
                      <LogOut className="h-4 w-4" /> {isOffline ? 'Kunci Layar' : 'Keluar'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT CONTAINER */}
        <main className={`flex-1 p-6 md:p-8 ${isOffline ? 'mt-8' : ''}`}>
          <Outlet />
        </main>
      </div>

      {isQueueManagerOpen && <SyncQueueManager onClose={() => setQueueManagerOpen(false)} />}
    </div>
  );
}
