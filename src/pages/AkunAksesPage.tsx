import { useEffect, useState } from 'react';
import { ShieldCheck, Users, Plus, Trash2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';

type Tab = 'akun' | 'permission';

interface User {
  id: string;
  email: string;
  nama: string;
  role: string;
  aktif: boolean;
}

export default function AkunAksesPage() {
  const [tab, setTab] = useState<Tab>('akun');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formRole, setFormRole] = useState('admin');
  
  const token = useAuthStore(state => state.user?.token);
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();

  const isLocalFirst = !import.meta.env.VITE_SUPABASE_URL;

  useEffect(() => {
    if (tab === 'akun' && token && !isLocalFirst) {
      fetchUsers();
    }
  }, [tab, token, isLocalFirst]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setUsers(data);
    } catch (e: any) {
      addToast({ type: 'error', title: 'Gagal', message: 'Gagal memuat akun: ' + e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ email: formEmail, password: formPassword, nama: formNama, role: formRole })
      });
      if (!res.ok) throw new Error(await res.text());
      
      addToast({ type: 'success', title: 'Berhasil', message: 'Akun berhasil dibuat' });
      setShowForm(false);
      setFormEmail(''); setFormPassword(''); setFormNama('');
      fetchUsers();
    } catch (e: any) {
      addToast({ type: 'error', title: 'Gagal', message: 'Gagal membuat akun: ' + e.message });
    } finally {
      setLoading(false);
    }
  }

  function handleDelete(id: string) {
    requestConfirm({
      title: 'Hapus Akun',
      description: 'Anda yakin ingin menghapus akun ini secara permanen?',
      confirmLabel: 'Hapus',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/users/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) throw new Error(await res.text());
          addToast({ type: 'success', title: 'Berhasil', message: 'Akun dihapus' });
          fetchUsers();
        } catch (e: any) {
          addToast({ type: 'error', title: 'Gagal', message: 'Gagal menghapus: ' + e.message });
        }
      }
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Akun & Akses" description="Kelola akun admin dan hak akses role dari satu tempat." />
      
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-900/40">
        {[{ key: 'akun', label: 'Akun', icon: Users }, { key: 'permission', label: 'Permission', icon: ShieldCheck }].map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return <button key={item.key} type="button" onClick={() => setTab(item.key as Tab)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${active ? 'bg-brand-600 text-white shadow-md shadow-brand-600/10' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}><Icon className="h-4 w-4" />{item.label}</button>;
        })}
      </div>

      {tab === 'akun' && (
        <SectionCard 
          title="Akun" 
          description={isLocalFirst ? "Aplikasi berjalan dalam mode lokal (tanpa Supabase backend)." : "Kelola akun yang bisa mengakses sistem."}
        >
          {isLocalFirst ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
              Manajemen akun Cloudflare Workers dinonaktifkan dalam mode lokal.<br/>
              Harap konfigurasikan VITE_SUPABASE_URL untuk menggunakan fitur ini.
            </div>
          ) : (
            <div className="space-y-4">
              {!showForm && (
                <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-500">
                  <Plus className="h-4 w-4" /> Tambah Akun
                </button>
              )}

              {showForm && (
                <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <h3 className="font-bold">Buat Akun Baru</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input required type="text" placeholder="Nama" value={formNama} onChange={e => setFormNama(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700" />
                    <input required type="email" placeholder="Email" value={formEmail} onChange={e => setFormEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700" />
                    <input required type="password" placeholder="Password (min 6 karakter)" minLength={6} value={formPassword} onChange={e => setFormPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700" />
                    <select value={formRole} onChange={e => setFormRole(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700">
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={loading} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-500 disabled:opacity-50">
                      Simpan
                    </button>
                    <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      Batal
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Nama</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900/20">
                    {loading && users.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-4 text-center text-slate-500">Memuat data...</td></tr>
                    ) : users.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-4 text-center text-slate-500">Belum ada akun.</td></tr>
                    ) : (
                      users.map(u => (
                        <tr key={u.id}>
                          <td className="px-4 py-3 font-medium">{u.nama}</td>
                          <td className="px-4 py-3 text-slate-500">{u.email}</td>
                          <td className="px-4 py-3"><span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-bold text-brand-700 dark:bg-brand-950/30 dark:text-brand-400 capitalize">{u.role}</span></td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => handleDelete(u.id)} className="rounded-lg p-2 text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-950/30">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'akun' && (
        <SectionCard title="Keamanan Akses Lokal" description="Ubah kata sandi darurat dan PIN kasir untuk penggunaan offline.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Form PIN Kasir */}
            <form onSubmit={async (e) => {
              e.preventDefault();
              const pin = new FormData(e.currentTarget).get('pin') as string;
              if (pin.length < 4) return addToast({ type: 'error', title: 'Gagal', message: 'PIN minimal 4 angka' });
              
              setLoading(true);
              try {
                const { setPinKasir } = await import('../services/authService');
                await setPinKasir(pin);
                addToast({ type: 'success', title: 'Berhasil', message: 'PIN Kasir berhasil diubah' });
                (e.target as HTMLFormElement).reset();
              } catch (err: any) {
                addToast({ type: 'error', title: 'Gagal', message: err.message });
              } finally {
                setLoading(false);
              }
            }} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/30">
              <div>
                <h3 className="font-bold mb-1">PIN Kasir</h3>
                <p className="text-xs text-slate-500 mb-4">Gunakan angka yang mudah diingat (min 4 digit). Bawaan: 123456</p>
                <input required name="pin" type="password" inputMode="numeric" pattern="[0-9]*" placeholder="Masukkan PIN baru" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700 mb-3" />
                <button type="submit" disabled={loading} className="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-500 disabled:opacity-50">
                  Ubah PIN Kasir
                </button>
              </div>
            </form>

            {/* Form Sandi Darurat */}
            <form onSubmit={async (e) => {
              e.preventDefault();
              const sandi = new FormData(e.currentTarget).get('sandi') as string;
              if (sandi.length < 6) return addToast({ type: 'error', title: 'Gagal', message: 'Sandi minimal 6 karakter' });
              
              setLoading(true);
              try {
                const { setSandiDarurat } = await import('../services/authService');
                await setSandiDarurat(sandi);
                addToast({ type: 'success', title: 'Berhasil', message: 'Sandi Darurat berhasil diubah' });
                (e.target as HTMLFormElement).reset();
              } catch (err: any) {
                addToast({ type: 'error', title: 'Gagal', message: err.message });
              } finally {
                setLoading(false);
              }
            }} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/30">
              <div>
                <h3 className="font-bold mb-1">Sandi Darurat</h3>
                <p className="text-xs text-slate-500 mb-4">Gunakan password yang kuat (min 6 karakter). Bawaan: doomsday123</p>
                <input required name="sandi" type="password" placeholder="Masukkan Sandi Darurat baru" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700 mb-3" />
                <button type="submit" disabled={loading} className="w-full rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-500 disabled:opacity-50">
                  Ubah Sandi Darurat
                </button>
              </div>
            </form>
          </div>
        </SectionCard>
      )}

      {tab === 'permission' && (
        <SectionCard title="Permission" description="Hak akses admin dan role berikutnya akan dikonfigurasi di tab ini.">
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            Sistem saat ini menggunakan mode Single Role (Admin).<br/>
            Extensibility untuk multiple role telah disiapkan via API.
          </div>
        </SectionCard>
      )}
    </div>
  );
}
