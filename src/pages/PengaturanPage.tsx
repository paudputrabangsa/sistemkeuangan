import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Calendar, CreditCard, FileText, Layers, Settings, Users, Ticket } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { getSetupStatus } from '../services/setupStatusService';

type SettingItem = { title: string; description: string; href: string; icon: React.ComponentType<{ className?: string }>; disabled?: boolean };

const settings: SettingItem[] = [
  { title: 'Profil Sekolah', description: 'Nama, alamat, kontak, dan identitas sekolah.', href: '/pengaturan/profil-sekolah', icon: Settings },
  { title: 'Jenis Tagihan', description: 'Daftar jenis tagihan aktif untuk transaksi.', href: '/pengaturan/jenis-tagihan', icon: FileText },
  { title: 'Promo / Diskon', description: 'Kelola daftar promo yang aktif.', href: '/pengaturan/promo', icon: Ticket },
  { title: 'Metode Pembayaran', description: 'Daftar metode pembayaran yang dapat dipilih.', href: '/pengaturan/metode-pembayaran', icon: CreditCard },
  { title: 'Cutoff SPP Pindahan', description: 'Atur cutoff tanggal untuk generate SPP siswa pindahan.', href: '/pengaturan/spp-generate-cutoff', icon: Calendar },

  { title: 'Akun', description: 'Kelola akun admin aplikasi.', href: '/pengaturan/akun', icon: Users },
  { title: 'Permission', description: 'Kelola hak akses role aplikasi.', href: '/pengaturan/permission', icon: Layers },
  { title: 'Reset Data', description: 'Kosongkan data lokal atau kembali ke Setup Awal.', href: '/pengaturan/reset-data', icon: AlertTriangle },
];

export default function PengaturanPage() {
  const setupStatus = useLiveQuery(() => getSetupStatus(), [], null);
  const visibleSettings = setupStatus && (!setupStatus.isComplete || !setupStatus.isOperationalActive)
    ? settings.filter((item) => {
        if (!setupStatus.isComplete) {
          // Hanya saat setup awal belum selesai
          return item.href === '/pengaturan/akun' ||
                 item.href === '/pengaturan/permission' ||
                 item.href === '/pengaturan/reset-data';
        }
        return true;
      })
    : settings;
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Pengaturan" description="Kelola konfigurasi aplikasi yang tidak sering berubah." />
      <SectionCard title="Daftar pengaturan" description="Pengaturan tahun ajaran seperti kelas, tarif SPP, biaya pendaftaran, dan early bird sebaiknya dikelola dari menu Tahun Ajaran.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleSettings.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <div key={item.href} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 opacity-50 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900/20">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-slate-100 p-3 text-slate-400 dark:bg-slate-800 dark:text-slate-500"><Icon className="h-5 w-5" /></div>
                    <div>
                      <p className="font-bold text-slate-400 dark:text-slate-500">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{item.description}</p>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <Link key={item.href} to={item.href} className="rounded-2xl border border-slate-100 bg-white/70 p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-600/5 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-brand-900/60">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-brand-50 p-3 text-brand-600 dark:bg-brand-950/30 dark:text-brand-300"><Icon className="h-5 w-5" /></div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-100">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
