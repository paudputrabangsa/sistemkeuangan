import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuthStore } from './store/authStore';
import ToastContainer from './components/ui/ToastContainer';
import GlobalConfirmProvider from './components/ui/GlobalConfirmProvider';
import AppShell from './layouts/AppShell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TahunAjaranPage from './pages/TahunAjaranPage';
import TahunAjaranDetailPage from './pages/TahunAjaranDetailPage';
import TahunAjaranShortcutPage from './pages/TahunAjaranShortcutPage';
import SetupTahunAjaranDraftPage from './pages/SetupTahunAjaranDraftPage';
import SiswaListPage from './pages/SiswaListPage';
import SiswaCreatePage from './pages/SiswaCreatePage';
import SiswaDetailPage from './pages/SiswaDetailPage';
import SiswaEditPage from './pages/SiswaEditPage';
import SiswaImportDapodikPage from './pages/SiswaImportDapodikPage';
import TagihanPage from './pages/TagihanPage';
import TagihanCreatePage from './pages/TagihanCreatePage';
import TagihanBatchCancelPage from './pages/TagihanBatchCancelPage';
import PembayaranPage from './pages/PembayaranPage';
import PembayaranFormPage from './pages/PembayaranFormPage';
import ProfilSekolahPage from './pages/ProfilSekolahPage';

import SettingListPage from './pages/SettingListPage';
import ProsesNaikKelasPage from './pages/ProsesNaikKelasPage';
import PenempatanSiswaBaruPage from './pages/PenempatanSiswaBaruPage';
import SppGenerateCutoffPage from './pages/SppGenerateCutoffPage';
import LaporanPage from './pages/LaporanPage';
import LaporanPenerimaanPage from './pages/LaporanPenerimaanPage';
import LaporanTunggakanPage from './pages/LaporanTunggakanPage';
import LaporanPerSiswaPage from './pages/LaporanPerSiswaPage';
import LaporanPendaftaranPage from './pages/LaporanPendaftaranPage';
import LaporanAktivasiPage from './pages/LaporanAktivasiPage';
import LaporanAuditPage from './pages/LaporanAuditPage';
import LaporanDiskonPage from './pages/LaporanDiskonPage';
import PengaturanPage from './pages/PengaturanPage';
import SetupAwalPage from './pages/SetupAwalPage';
import AkunAksesPage from './pages/AkunAksesPage';
import MigrasiPage from './pages/MigrasiPage';
import MigrasiCalonSiswaPage from './pages/MigrasiCalonSiswaPage';
import MigrasiSiswaTahunBerjalanPage from './pages/MigrasiSiswaTahunBerjalanPage';
import { getSetupStatus } from './services/setupStatusService';
import ResetDataPage from './pages/ResetDataPage';
import PromoPage from './pages/PromoPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function OperationalRequiredRoute({ children }: { children: React.ReactNode }) {
  const setupStatus = useLiveQuery(() => getSetupStatus(), [], null);
  if (!setupStatus) return null;
  if (!setupStatus.isComplete) return <Navigate to="/setup-awal" replace />;
  if (!setupStatus.isOperationalActive) return <Navigate to="/migrasi" replace />;
  return <>{children}</>;
}

function SetupCompleteRoute({ children }: { children: React.ReactNode }) {
  const setupStatus = useLiveQuery(() => getSetupStatus(), [], null);
  if (!setupStatus) return null;
  if (!setupStatus.isComplete) return <Navigate to="/setup-awal" replace />;
  return <>{children}</>;
}

function MigrationRequiredRoute({ children }: { children: React.ReactNode }) {
  const setupStatus = useLiveQuery(() => getSetupStatus(), [], null);
  if (!setupStatus) return null;
  if (!setupStatus.isComplete) return <Navigate to="/setup-awal" replace />;
  if (setupStatus.isOperationalActive) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SetupNotCompleteRoute({ children }: { children: React.ReactNode }) {
  const setupStatus = useLiveQuery(() => getSetupStatus(), [], null);
  if (!setupStatus) return null;
  if (setupStatus.isComplete) {
    if (setupStatus.isOperationalActive) return <Navigate to="/" replace />;
    return <Navigate to="/migrasi" replace />;
  }
  return <>{children}</>;
}

function requireOperational(children: React.ReactNode) {
  return <OperationalRequiredRoute>{children}</OperationalRequiredRoute>;
}

function requireSetupComplete(children: React.ReactNode) {
  return <SetupCompleteRoute>{children}</SetupCompleteRoute>;
}

function requireMigration(children: React.ReactNode) {
  return <MigrationRequiredRoute>{children}</MigrationRequiredRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <GlobalConfirmProvider />
      <Routes>
        {/* Public Route */}
        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />

        {/* Protected Routes inside AppShell */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/setup-awal" element={<SetupNotCompleteRoute><SetupAwalPage /></SetupNotCompleteRoute>} />
          {/* Future module routes will be added here */}
          <Route path="/siswa" element={requireOperational(<SiswaListPage />)} />
          <Route path="/siswa/new" element={requireOperational(<SiswaCreatePage />)} />
          <Route path="/siswa/import-dapodik" element={requireOperational(<SiswaImportDapodikPage />)} />
          <Route path="/siswa/:id" element={requireOperational(<SiswaDetailPage />)} />
          <Route path="/siswa/:id/edit" element={requireOperational(<SiswaEditPage />)} />
          <Route path="/kelas" element={requireSetupComplete(<TahunAjaranShortcutPage tab="kelas" />)} />
          <Route path="/tahun-ajaran/kelola-pendaftaran" element={requireSetupComplete(<TahunAjaranShortcutPage tab="pendaftaran" />)} />
          <Route path="/tahun-ajaran/setup-draft" element={requireSetupComplete(<SetupTahunAjaranDraftPage />)} />
          <Route path="/tahun-ajaran" element={requireSetupComplete(<TahunAjaranPage />)} />
          <Route path="/tahun-ajaran/:id" element={requireSetupComplete(<TahunAjaranDetailPage />)} />
          <Route path="/tagihan" element={requireOperational(<TagihanPage />)} />
          <Route path="/tagihan/buat" element={requireOperational(<TagihanCreatePage />)} />
          <Route path="/tagihan/batalkan-massal" element={requireOperational(<TagihanBatchCancelPage />)} />
          <Route path="/pembayaran" element={requireOperational(<PembayaranPage />)} />
          <Route path="/pembayaran/new" element={requireOperational(<PembayaranFormPage />)} />
          <Route path="/lanjut-tahun-ajaran" element={requireOperational(<ProsesNaikKelasPage />)} />
          <Route path="/proses-naik-kelas" element={<Navigate to="/lanjut-tahun-ajaran" replace />} />
          <Route path="/migrasi" element={requireMigration(<MigrasiPage />)} />
          <Route path="/migrasi/calon-siswa" element={requireMigration(<MigrasiCalonSiswaPage />)} />
          <Route path="/migrasi/siswa-tahun-berjalan" element={requireMigration(<MigrasiSiswaTahunBerjalanPage />)} />

          {/* Laporan Routes */}
          <Route path="/laporan" element={requireOperational(<LaporanPage />)} />
          <Route path="/laporan/rekap-penerimaan" element={requireOperational(<LaporanPenerimaanPage />)} />
          <Route path="/laporan/tunggakan" element={requireOperational(<LaporanTunggakanPage />)} />
          <Route path="/laporan/riwayat-siswa" element={requireOperational(<LaporanPerSiswaPage />)} />
          <Route path="/laporan/pendaftaran" element={requireOperational(<LaporanPendaftaranPage />)} />
          <Route path="/laporan/aktivasi" element={requireOperational(<LaporanAktivasiPage />)} />
          <Route path="/laporan/audit" element={requireOperational(<LaporanAuditPage />)} />
          <Route path="/laporan/diskon" element={requireOperational(<LaporanDiskonPage />)} />

          {/* Pengaturan Routes */}
          <Route path="/pengaturan" element={<PengaturanPage />} />
          <Route path="/pengaturan/profil-sekolah" element={requireSetupComplete(<ProfilSekolahPage />)} />
          <Route path="/pengaturan/akun-akses" element={<AkunAksesPage />} />
          <Route path="/pengaturan/akun" element={<AkunAksesPage />} />
          <Route path="/pengaturan/permission" element={<AkunAksesPage />} />
          <Route path="/pengaturan/jenis-tagihan" element={requireSetupComplete(<SettingListPage title="Jenis Tagihan" description="Kelola daftar jenis tagihan yang tersedia di form tagihan manual dan tampilan filter." settingKey="jenis_tagihan" />)} />
          <Route path="/pengaturan/metode-pembayaran" element={requireSetupComplete(<SettingListPage title="Metode Pembayaran" description="Kelola daftar metode pembayaran yang tersedia saat mencatat transaksi." settingKey="metode_pembayaran" />)} />
          <Route path="/pengaturan/promo" element={requireSetupComplete(<PromoPage />)} />

          <Route path="/pengaturan/penempatan-siswa-baru" element={requireOperational(<PenempatanSiswaBaruPage />)} />
          <Route path="/pengaturan/spp-generate-cutoff" element={requireOperational(<SppGenerateCutoffPage />)} />
          <Route path="/pengaturan/reset-data" element={<ResetDataPage />} />
        </Route>

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

