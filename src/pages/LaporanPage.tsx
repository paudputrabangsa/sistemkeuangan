import { Link } from 'react-router-dom';
import { BarChart3, FileText, Sparkles, Users } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';

const reports = [
  { title: 'Laporan per Siswa', description: 'Lihat riwayat tagihan dan pembayaran spesifik per siswa.', href: '/laporan/riwayat-siswa', icon: Users },
  { title: 'Rekap Penerimaan', description: 'Rekapitulasi seluruh uang masuk berdasarkan metode dan jenis.', href: '/laporan/rekap-penerimaan', icon: BarChart3 },
  { title: 'Daftar Tunggakan', description: 'Pantau daftar tagihan jatuh tempo dan sisa piutang sekolah.', href: '/laporan/tunggakan', icon: FileText },
  { title: 'Laporan Pendaftaran', description: 'Rekapitulasi siswa baru dan uang pendaftaran masuk.', href: '/laporan/pendaftaran', icon: FileText },
  { title: 'Laporan Aktivasi', description: 'Log hasil perpindahan tahun ajaran (naik kelas, lulus).', href: '/laporan/aktivasi', icon: Sparkles },
  { title: 'Laporan Audit', description: 'Penelusuran jejak rekam perubahan data oleh admin.', href: '/laporan/audit', icon: FileText },
  { title: 'Laporan Diskon', description: 'Rekap seluruh diskon promo dan potongan manual yang dinikmati siswa.', href: '/laporan/diskon', icon: FileText },
];

export default function LaporanPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Laporan" description="Pilih jenis laporan yang ingin dilihat atau diekspor." />
      <SectionCard title="Daftar laporan" description="Semua laporan membaca data lokal sehingga tetap bisa diakses saat offline.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((item) => {
            const Icon = item.icon;
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
