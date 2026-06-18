import { Navigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import EmptyState from '../components/ui/EmptyState';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';

interface TahunAjaranShortcutPageProps {
  tab: 'ringkasan' | 'kelas' | 'pendaftaran';
}

export default function TahunAjaranShortcutPage({ tab }: TahunAjaranShortcutPageProps) {
  const tahunAjaran = useLiveQuery(() => listTahunAjaran(), [], null);

  if (!tahunAjaran) {
    return null;
  }

  const target = tahunAjaran.find((item) => item.aktif || item.status === 'aktif')
    ?? tahunAjaran.find((item) => (item.status ?? 'draft') === 'draft')
    ?? tahunAjaran[0];

  if (!target) {
    return <EmptyState title="Belum ada tahun ajaran" description="Buat tahun ajaran terlebih dahulu sebelum mengelola kelas atau pendaftaran." />;
  }

  return <Navigate to={`/tahun-ajaran/${target.id}?tab=${tab}`} replace />;
}
