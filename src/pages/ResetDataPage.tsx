import { useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { getCurrentActor } from '../lib/actor';
import { resetLocalAppData, resetToSetupAwal } from '../services/pengaturanService';
import { ServiceError } from '../services/service-errors';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

export default function ResetDataPage() {
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const [setupConfirmation, setSetupConfirmation] = useState('');
  const [fullConfirmation, setFullConfirmation] = useState('');
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [isSubmitting, setIsSubmitting] = useState<'setup' | 'full' | null>(null);

  async function runReset(kind: 'setup' | 'full') {
    if (!actor) return;
    setIsSubmitting(kind);
    try {
      if (kind === 'setup') {
        await resetToSetupAwal(actor);
        addToast({ type: 'success', title: 'Berhasil', message: 'Data operasional dikosongkan. Setup Awal dapat diisi ulang.' });
        setSetupConfirmation('');
      } else {
        await resetLocalAppData(actor);
        addToast({ type: 'success', title: 'Berhasil', message: 'Semua data lokal direset dan data awal aplikasi dibuat ulang.' });
        setFullConfirmation('');
      }
    } catch (error) {
      addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal melakukan reset data.' });
    } finally {
      setIsSubmitting(null);
    }
  }

  function handleReset(kind: 'setup' | 'full') {
    if (!actor) return;
    const label = kind === 'setup' ? 'Reset ke Setup Awal' : 'Reset Semua Data Lokal';
    requestConfirm({
      title: `Konfirmasi ${label}`,
      description: 'Tindakan ini tidak bisa dibatalkan. Semua data yang terhapus tidak dapat dikembalikan.',
      confirmLabel: 'Ya, Reset',
      variant: 'danger',
      onConfirm: () => runReset(kind),
    });
  }

  const setupDisabled = setupConfirmation !== 'RESET-SETUP' || isSubmitting !== null;
  const fullDisabled = fullConfirmation !== 'RESET-SEMUA' || isSubmitting !== null;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Reset Data" description="Area berisiko tinggi. Hapus data operasional atau seluruh data aplikasi." />

      {/* Reset ke Setup Awal */}
      <SectionCard
        title="Reset ke Setup Awal"
        description="Kosongkan data operasional dan kembali ke tahap Setup Awal. Data pengguna dan hak akses tetap dipertahankan."
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-950/40 dark:bg-amber-950/20">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Data yang dihapus:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-700 dark:text-amber-400">
              <li>Tahun Ajaran, Kelas &amp; Tingkat, dan konfigurasi pendaftaran</li>
              <li>Semua data Siswa (calon, aktif, lulus, berhenti) dan riwayat kelas</li>
              <li>Semua Tagihan dan Pembayaran</li>
              <li>Antrian sinkronisasi (sync queue) dan log</li>
              <li>Draft setup/migrasi di localStorage</li>
              <li>Pengaturan metode pembayaran, jenis tagihan, dan promo hasil setup</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-950/40 dark:bg-emerald-950/20">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Data yang dipertahankan:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-emerald-700 dark:text-emerald-400">
              <li>Akun pengguna dan hak akses (permission)</li>
              <li>Profil sekolah (nama, alamat, kontak) — dikosongkan untuk diisi ulang</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Ketik <span className="font-mono text-amber-600 dark:text-amber-400">RESET-SETUP</span> untuk mengaktifkan tombol reset:</p>
            <input
              value={setupConfirmation}
              onChange={(event) => setSetupConfirmation(event.target.value)}
              placeholder="Ketik RESET-SETUP"
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-danger-400 focus:ring-2 focus:ring-danger-100 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <button
            type="button"
            onClick={() => handleReset('setup')}
            disabled={setupDisabled}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger-700 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-danger-700/20 transition hover:bg-danger-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-700"
          >
            <RotateCcw className="h-4 w-4" />
            {isSubmitting === 'setup' ? 'Mereset...' : 'Reset ke Setup Awal'}
          </button>
        </div>
      </SectionCard>

      {/* Reset Semua Data Lokal */}
      <div className="rounded-2xl border-2 border-danger-200 dark:border-danger-950/40">
      <SectionCard
        title="Reset Semua Data Lokal"
        description="Hapus seluruh data lokal dan buat ulang dari awal. Semua konfigurasi, akun, dan data hilang."
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-danger-200 bg-danger-50/80 p-4 dark:border-danger-950/40 dark:bg-danger-950/20">
            <p className="text-sm font-bold text-danger-800 dark:text-danger-300">Data yang dihapus:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-danger-700 dark:text-danger-400">
              <li>Semua data operasional: Siswa, Tagihan, Pembayaran, Kelas, Tahun Ajaran</li>
              <li>Profil sekolah dan semua pengaturan</li>
              <li>Akun pengguna dan hak akses (permission)</li>
              <li>Antrian sinkronisasi dan log</li>
              <li>Draft setup/migrasi di localStorage</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-950/40 dark:bg-emerald-950/20">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Setelah reset:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-emerald-700 dark:text-emerald-400">
              <li>Database lokal dibuat ulang dengan data awal (seed)</li>
              <li>Akun admin default dan permission dibuat kembali</li>
              <li>Metode pembayaran dan jenis tagihan kembali ke default</li>
              <li>Aplikasi siap untuk Setup Awal dari awal</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-danger-700 dark:text-danger-300">Ketik <span className="font-mono text-danger-600 dark:text-danger-400">RESET-SEMUA</span> untuk mengaktifkan tombol reset:</p>
            <input
              value={fullConfirmation}
              onChange={(event) => setFullConfirmation(event.target.value)}
              placeholder="Ketik RESET-SEMUA"
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-danger-400 focus:ring-2 focus:ring-danger-100 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <button
            type="button"
            onClick={() => handleReset('full')}
            disabled={fullDisabled}
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-danger-500 bg-white px-5 py-3 text-sm font-extrabold text-danger-700 shadow-lg shadow-danger-700/10 transition hover:bg-danger-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:shadow-none dark:border-danger-400 dark:bg-transparent dark:text-danger-400 dark:hover:bg-danger-950/20 dark:disabled:border-slate-700 dark:disabled:text-slate-600"
          >
            <AlertTriangle className="h-4 w-4" />
            {isSubmitting === 'full' ? 'Mereset...' : 'Reset Semua Data Lokal'}
          </button>
        </div>
      </SectionCard>
      </div>
    </div>
  );
}
