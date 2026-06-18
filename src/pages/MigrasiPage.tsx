import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Sparkles, Users } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { getCurrentActor } from '../lib/actor';
import { db } from '../db';
import { completeMigrasiDataAwal, getOnboardingStatus, skipMigrasiDataAwal, type MigrasiWizardStatus } from '../services/onboardingService';
import { resetMigrasiCalonSiswaData, resetMigrasiSiswaTahunBerjalanData } from '../services/migrasiService';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';

const steps = [
  { title: 'Migrasi Calon Siswa', description: 'Satu siklus lengkap: data calon, tagihan pendaftaran, pembayaran, lalu review simpan.', href: '/migrasi/calon-siswa', icon: Sparkles },
  { title: 'Migrasi Siswa Tahun Berjalan', description: 'Satu siklus lengkap: siswa aktif/keluar, tagihan SPP/piutang, pembayaran, lalu review simpan.', href: '/migrasi/siswa-tahun-berjalan', icon: Users },
];

export default function MigrasiPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const onboarding = useLiveQuery(() => getOnboardingStatus(), [], null);
  const { addToast } = useToastStore();
  const [showMissingPanel, setShowMissingPanel] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState<{ skipped: string[] } | null>(null);
  const [confirmReset, setConfirmReset] = useState<'calon_siswa' | 'siswa_tahun_berjalan' | null>(null);

  const siswaImported = useLiveQuery(() => db.siswa.filter(s => s.jalur_registrasi === 'migrasi' && !s.deleted_at).toArray(), [], []);
  const calonCount = siswaImported.filter(s => s.status === 'calon').length;
  const siswaCount = siswaImported.filter(s => s.status !== 'calon').length;

  const calonSelesai = onboarding?.migrasi_calon_siswa_status === 'selesai';
  const siswaSelesai = onboarding?.migrasi_siswa_tahun_berjalan_status === 'selesai';
  const hasCompletedMigration = Boolean(calonSelesai || siswaSelesai);

  useEffect(() => {
    const state = location.state as { message?: string } | null;
    if (!state?.message) return;
    addToast({ type: 'success', title: 'Info', message: state.message });
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.state, navigate, addToast]);

  const handleSkipConfirmed = useCallback(async () => {
    if (!actor) return;
    try {
      await skipMigrasiDataAwal(actor);
      addToast({ type: 'success', title: 'Berhasil', message: 'Migrasi dilewati. Operasional sudah aktif.' });
      navigate('/');
    } catch (error) {
      addToast({ type: 'error', title: 'Gagal', message: error instanceof Error ? error.message : 'Gagal mengaktifkan operasional.' });
    } finally {
      setConfirmSkip(false);
    }
  }, [actor, navigate, addToast]);

  const handleCompleteConfirmed = useCallback(async () => {
    if (!actor) return;
    try {
      await completeMigrasiDataAwal(actor);
      addToast({ type: 'success', title: 'Berhasil', message: 'Migrasi selesai. Operasional sudah aktif.' });
      navigate('/');
    } catch (error) {
      addToast({ type: 'error', title: 'Gagal', message: error instanceof Error ? error.message : 'Gagal mengaktifkan operasional.' });
    } finally {
      setConfirmComplete(null);
    }
  }, [actor, navigate, addToast]);

  const handleResetConfirmed = useCallback(async () => {
    if (!actor || !confirmReset) return;
    try {
      if (confirmReset === 'calon_siswa') {
        await resetMigrasiCalonSiswaData(actor);
        addToast({ type: 'success', title: 'Berhasil', message: 'Data migrasi calon siswa berhasil direset.' });
      } else {
        await resetMigrasiSiswaTahunBerjalanData(actor);
        addToast({ type: 'success', title: 'Berhasil', message: 'Data migrasi siswa tahun berjalan berhasil direset.' });
      }
    } catch (error) {
      addToast({ type: 'error', title: 'Gagal', message: error instanceof Error ? error.message : 'Gagal mereset data.' });
    } finally {
      setConfirmReset(null);
    }
  }, [actor, confirmReset, addToast]);

  function activateOperational(mode: 'skip' | 'complete') {
    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan. Silakan login ulang.' });
      return;
    }
    
    if (mode === 'skip') {
      setConfirmSkip(true);
    } else {
      if (!hasCompletedMigration) {
        setShowMissingPanel(true);
        addToast({ type: 'warning', title: 'Perhatian', message: 'Minimal satu wizard migrasi harus selesai. Jika tidak ingin migrasi, gunakan Lewati Semua dan Mulai Operasional.' });
        return;
      }
      const skipped = [];
      if (!calonSelesai) skipped.push('Migrasi Calon Siswa');
      if (!siswaSelesai) skipped.push('Migrasi Siswa Tahun Berjalan');
      setConfirmComplete({ skipped });
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Migrasi Data Awal" description="Gunakan hanya saat awal memakai sistem untuk memasukkan data existing sebelum menu operasional dibuka." />
      <SectionCard title="Mulai dari data awal" description="Jika sekolah punya data existing, jalankan wizard migrasi. Jika tidak, lewati migrasi dan mulai operasional normal.">
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void activateOperational('skip')} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Lewati Semua dan Mulai Operasional</button>
          <button type="button" onClick={() => void activateOperational('complete')} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500"><CheckCircle2 className="h-4 w-4" /> Selesai Migrasi Data Awal</button>
        </div>
        {!hasCompletedMigration ? <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Selesaikan minimal satu wizard migrasi, atau gunakan tombol lewati semua jika tidak ingin migrasi data awal.</p> : <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Jika ada wizard yang belum selesai, sistem akan meminta konfirmasi sebelum menandainya sebagai dilewati.</p>}
      </SectionCard>
      {showMissingPanel && !hasCompletedMigration ? <SectionCard title="Belum ada migrasi selesai" description="Selesaikan salah satu wizard, atau lewati semua migrasi jika ingin langsung operasional.">
        <div className="space-y-3">
          {!calonSelesai ? <MissingWizardRow title="Migrasi Calon Siswa" href="/migrasi/calon-siswa" /> : null}
          {!siswaSelesai ? <MissingWizardRow title="Migrasi Siswa Tahun Berjalan" href="/migrasi/siswa-tahun-berjalan" /> : null}
        </div>
      </SectionCard> : null}

      <SectionCard title="Wizard migrasi" description="Setiap wizard menyelesaikan satu siklus migrasi lengkap. Data baru ditulis saat Review & Simpan.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const status = index === 0 ? onboarding?.migrasi_calon_siswa_status : onboarding?.migrasi_siswa_tahun_berjalan_status;
            const isFinal = status === 'selesai' || status === 'dilewati';
            return (
              <div key={item.title} className="rounded-2xl border border-slate-100 bg-white/70 p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-600/5 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="mb-4 flex items-center justify-between"><span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-extrabold text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">{getStatusLabel(status)}</span><Icon className="h-5 w-5 text-brand-600 dark:text-brand-300" /></div>
                <p className="font-extrabold text-slate-800 dark:text-slate-100">{item.title}</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {isFinal && status === 'selesai' ? (
                    <div className="flex flex-col gap-3 w-full">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setConfirmReset(index === 0 ? 'calon_siswa' : 'siswa_tahun_berjalan')} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 hover:dark:bg-red-900/40">Hapus & Ulangi</button>
                        <Link to={item.href} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">Import Tambahan</Link>
                      </div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total di-import: {index === 0 ? calonCount : siswaCount} Siswa</p>
                    </div>
                  ) : isFinal ? (
                    <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">{getStatusLabel(status)}</span>
                  ) : (
                    <Link to={item.href} className="rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-500">{getStartLabel(status)}</Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmSkip}
        onClose={() => setConfirmSkip(false)}
        onConfirm={handleSkipConfirmed}
        title="Mulai operasional tanpa migrasi?"
        description="Lewati semua migrasi data awal dan mulai operasional sekarang? Migrasi Data Awal akan dikunci setelah ini."
        confirmLabel="Ya, Lewati & Mulai"
        variant="warning"
      />
      <ConfirmDialog
        open={confirmComplete !== null}
        onClose={() => setConfirmComplete(null)}
        onConfirm={handleCompleteConfirmed}
        title="Selesai migrasi data awal?"
        description={confirmComplete?.skipped.length
          ? `Aktifkan operasional sekarang? ${confirmComplete.skipped.join(' dan ')} akan ditandai dilewati. Setelah aktif, Migrasi Data Awal dikunci.`
          : 'Aktifkan operasional sekarang? Setelah aktif, Migrasi Data Awal dikunci dan input massal memakai import operasional.'}
        confirmLabel="Ya, Selesai Migrasi"
        variant="warning"
      />
      <ConfirmDialog
        open={confirmReset !== null}
        onClose={() => setConfirmReset(null)}
        onConfirm={handleResetConfirmed}
        title="Hapus & Ulangi Migrasi?"
        description={`Seluruh data siswa, kelas, tagihan, dan pembayaran yang dimasukkan dari wizard ini akan di-soft-delete dan status migrasi dikembalikan ke awal. Lanjutkan?`}
        confirmLabel="Ya, Hapus Data"
        variant="danger"
      />
    </div>
  );
}

function MissingWizardRow({ title, href }: { title: string; href: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 dark:border-amber-950/40 dark:bg-amber-950/20">
    <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{title} belum selesai atau belum dilewati.</p>
    <div className="flex gap-2">
      <Link to={href} className="rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-500">Buka</Link>
    </div>
  </div>;
}

function getStatusLabel(status?: MigrasiWizardStatus) {
  if (status === 'selesai') return 'Selesai';
  if (status === 'dilewati') return 'Dilewati';
  if (status === 'draft') return 'Draft';
  return 'Belum mulai';
}

function getStartLabel(status?: MigrasiWizardStatus) {
  if (status === 'draft') return 'Lanjutkan';
  return 'Mulai Migrasi';
}
