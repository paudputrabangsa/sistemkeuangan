import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, Edit } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { getCurrentActor } from '../lib/actor';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { newId } from '../services/service-helpers';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';
import FormField from '../components/ui/FormField';
import Modal from '../components/ui/Modal';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { db } from '../db';
import type { DiskonItem } from '../db/types';

const compactInputClass = 'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function formatNumberInput(value: string | number) {
  if (!value) return '';
  return Number(value).toLocaleString('id-ID');
}
function parseNumberInput(value: string) {
  return value.replace(/[^\d]/g, '');
}

export default function PromoPage() {
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const items = (useLiveQuery(() => getPengaturanByKunci<DiskonItem[]>('diskon'), [], [] as DiskonItem[]) ?? []) as DiskonItem[];
  const jenisTagihanList = (useLiveQuery(() => getPengaturanByKunci<{ id: string, nama: string, aktif: boolean }[]>('jenis_tagihan'), [], [])) ?? [];

  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const activeKomponenBiaya = useLiveQuery(async () => {
    const activeYear = (await db.tahun_ajaran.toArray()).find((t) => !t.deleted_at && (t.aktif || t.status === 'aktif'));
    if (!activeYear) return null;
    const pengaturan = await db.pengaturan_pendaftaran_tahun_ajaran.where('tahun_ajaran_id').equals(activeYear.id).first();
    if (!pengaturan || pengaturan.deleted_at || pengaturan.mode_tagihan_biaya !== 'pisah') return null;
    return pengaturan.komponen_biaya || [];
  }, [], null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DiskonItem | null>(null);

  function openAddModal() {
    setEditingItem({
      id: newId(),
      nama: '',
      aktif: true,
      tipe_diskon: 'persen',
      persen_diskon: 0,
      nominal_diskon: 0,
      jenis_tagihan: 'semua',
      target_jenis_tagihan: ['semua'],
      berulang: true,
      klaim_mulai: '',
      klaim_selesai: '',
      batas_kali_penggunaan: null,
      kuota: null,
    });
    setErrors({});
    setIsModalOpen(true);
  }

  function openEditModal(item: DiskonItem) {
    setEditingItem({ ...item });
    setErrors({});
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingItem(null);
  }

  function updateEditingField(changes: Partial<DiskonItem>) {
    if (editingItem) {
      setEditingItem({ ...editingItem, ...changes });
    }
  }

  function inputClassFor(fieldId: string) {
    return errors[fieldId] ? `${compactInputClass} border-danger-300 focus:border-danger-400 focus:ring-danger-100 dark:border-danger-800` : compactInputClass;
  }

  async function saveList(newList: DiskonItem[]) {
    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan.' });
      return;
    }

    try {
      const record = await db.pengaturan.where('kunci').equals('diskon').first();
      if (record) {
        await db.pengaturan.put({ ...record, nilai: newList, updated_at: new Date().toISOString() });
        const { enqueueSync } = await import('../services/service-helpers');
        await enqueueSync('pengaturan', record.id, 'update', { ...record, nilai: newList });
      }
    } catch (error: any) {
      addToast({ type: 'error', title: 'Gagal', message: error.message || 'Terjadi kesalahan.' });
      throw error;
    }
  }

  async function toggleAktif(id: string, currentAktif: boolean) {
    const newList = items.map((d) => d.id === id ? { ...d, aktif: !currentAktif } : d);
    try {
      await saveList(newList);
      addToast({ type: 'success', title: 'Berhasil', message: `Promo di${!currentAktif ? 'aktifkan' : 'nonaktifkan'}.` });
    } catch (e) {
      // error handled in saveList
    }
  }

  function handleDelete(id: string) {
    requestConfirm({
      title: 'Hapus Promo?',
      description: 'Apakah Anda yakin ingin menghapus promo ini?',
      confirmLabel: 'Ya, Hapus',
      onConfirm: async () => {
        const newList = items.filter((d) => d.id !== id);
        try {
          await saveList(newList);
          addToast({ type: 'success', title: 'Berhasil', message: 'Promo dihapus.' });
        } catch (e) {
          // error handled
        }
      }
    });
  }

  async function handleSaveModal() {
    if (!editingItem) return;

    const nextErrors: Record<string, string> = {};
    const d = editingItem;

    if (!d.nama.trim()) nextErrors[`nama`] = `Nama promo wajib diisi.`;
    const targets = d.target_jenis_tagihan?.length ? d.target_jenis_tagihan : [d.jenis_tagihan || 'semua'];
    if (!targets.length) nextErrors[`target_jenis_tagihan`] = `Pilih minimal satu tagihan target.`;

    for (const target of targets) {
      const pt = d.potongan_per_target?.[target] || { tipe_diskon: d.tipe_diskon, persen_diskon: d.persen_diskon, nominal_diskon: d.nominal_diskon };
      if (pt.tipe_diskon === 'persen' && (Number(pt.persen_diskon) < 0 || Number(pt.persen_diskon) > 100)) {
        nextErrors[`persen_diskon_${target}`] = `Persen harus 0-100.`;
      }
    }

    if (d.klaim_mulai && d.klaim_selesai && d.klaim_selesai < d.klaim_mulai) nextErrors[`klaim_selesai`] = `Harus setelah tanggal mulai.`;
    if (d.kuota && Number(d.kuota) < 1) nextErrors[`kuota`] = `Kuota harus lebih besar dari 0.`;

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      addToast({ type: 'error', title: 'Gagal', message: 'Ada data yang belum valid.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const targetsPayload = d.target_jenis_tagihan?.length ? d.target_jenis_tagihan : (d.jenis_tagihan === 'semua' ? ['semua'] : [d.jenis_tagihan || 'semua']);
      const payload: DiskonItem = {
        ...d,
        nama: d.nama.trim(),
        klaim_mulai: d.klaim_mulai || null,
        klaim_selesai: d.klaim_selesai || null,
        batas_kali_penggunaan: d.batas_kali_penggunaan ? Number(d.batas_kali_penggunaan) : null,
        kuota: d.kuota ? Number(d.kuota) : null,
        target_jenis_tagihan: targetsPayload,
      };

      const existingIndex = items.findIndex((i) => i.id === payload.id);
      let newList = [...items];
      if (existingIndex >= 0) {
        newList[existingIndex] = payload;
      } else {
        newList.push(payload);
      }

      await saveList(newList);
      addToast({ type: 'success', title: 'Berhasil', message: 'Promo/diskon berhasil disimpan.' });
      closeModal();
    } catch (error: any) {
      // error handled in saveList
    } finally {
      setIsSubmitting(false);
    }
  }

  function getNilaiDisplay(d: DiskonItem) {
    const targets = d.target_jenis_tagihan?.length ? d.target_jenis_tagihan : [d.jenis_tagihan || 'semua'];
    if (targets.length === 0) return '-';

    // Check if all targets have the same discount value
    const firstTarget = targets[0];
    const ptFirst = d.potongan_per_target?.[firstTarget] || { tipe_diskon: d.tipe_diskon, persen_diskon: d.persen_diskon, nominal_diskon: d.nominal_diskon };

    let isSame = true;
    for (const t of targets) {
      const pt = d.potongan_per_target?.[t] || { tipe_diskon: d.tipe_diskon, persen_diskon: d.persen_diskon, nominal_diskon: d.nominal_diskon };
      if (pt.tipe_diskon !== ptFirst.tipe_diskon || pt.persen_diskon !== ptFirst.persen_diskon || pt.nominal_diskon !== ptFirst.nominal_diskon) {
        isSame = false;
        break;
      }
    }

    if (isSame) {
      if (ptFirst.tipe_diskon === 'persen') return `${ptFirst.persen_diskon}%`;
      return `Rp ${formatNumberInput(ptFirst.nominal_diskon)}`;
    }

    return 'Bervariasi (per target)';
  }

  function getJenisDisplay(d: DiskonItem) {
    const targets = d.target_jenis_tagihan?.length ? d.target_jenis_tagihan : [d.jenis_tagihan || 'semua'];
    if (targets.includes('semua')) return 'Semua Tagihan';

    const names = targets.map((t) => {
      if (t === 'spp') return 'SPP';
      if (t === 'pendaftaran') return 'Pendaftaran';
      const customMatch = jenisTagihanList.find((j) => j.id === t || j.nama.toLowerCase() === t.toLowerCase());
      return customMatch ? customMatch.nama : t;
    });

    return names.join(', ');
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Promo / Diskon" description="Kelola daftar promo atau potongan harga yang bisa diterapkan pada tagihan siswa." actions={<button type="button" onClick={openAddModal} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500"><Plus className="h-4 w-4" />Tambah Promo</button>} />

      <SectionCard title="Daftar Promo" description="Promo yang aktif bisa ditempelkan ke tagihan saat transaksi atau dicatat pada menu pengaturan siswa.">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-4">Nama Promo</th>
                <th className="px-4 py-4">Jenis Tagihan</th>
                <th className="px-4 py-4">Nilai Potongan</th>
                <th className="px-4 py-4">Masa Klaim & Penggunaan</th>
                <th className="px-4 py-4">Kuota</th>
                <th className="px-4 py-4">Status Aktif</th>
                <th className="px-4 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/50 dark:divide-slate-800/50 dark:bg-slate-900/20">
              {paginateData(items, page, pageSize).map((d) => (
                <tr key={d.id} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/20">
                  <td className="px-4 py-4 font-bold text-slate-800 dark:text-slate-100">{d.nama}</td>
                  <td className="px-4 py-4">
                    {getJenisDisplay(d)}
                  </td>
                  <td className="px-4 py-4 font-semibold text-brand-600 dark:text-brand-400">{getNilaiDisplay(d)}</td>
                  <td className="px-4 py-4 text-xs">
                    {(d.klaim_mulai || d.klaim_selesai) ? (
                      <div className="mb-1"><span className="font-semibold text-slate-500 dark:text-slate-400">Klaim:</span> {d.klaim_mulai || '...'} s/d {d.klaim_selesai || '...'}</div>
                    ) : <div className="mb-1"><span className="font-semibold text-slate-500 dark:text-slate-400">Klaim:</span> Selamanya</div>}

                    {d.batas_kali_penggunaan ? (
                      <div><span className="font-semibold text-slate-500 dark:text-slate-400">Pemakaian:</span> Max {d.batas_kali_penggunaan} kali per siswa</div>
                    ) : <div><span className="font-semibold text-slate-500 dark:text-slate-400">Pemakaian:</span> Selamanya</div>}
                  </td>
                  <td className="px-4 py-4">
                    {d.kuota ? <span className="font-semibold text-slate-800 dark:text-slate-200">Max {d.kuota}</span> : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => toggleAktif(d.id, d.aktif)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${d.aktif ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${d.aktif ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => openEditModal(d)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"><Edit className="h-4 w-4" /></button>
                      <button type="button" onClick={() => handleDelete(d.id)} className="rounded-lg border border-danger-100 p-2 text-danger-600 hover:bg-danger-50 dark:border-danger-950/50 dark:text-danger-400"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">Belum ada promo terdaftar. Klik "Tambah Promo" untuk memulai.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalItems={items.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </SectionCard>

      <Modal open={isModalOpen} onClose={closeModal} size="lg">
        {editingItem && (
          <div className="flex flex-col h-full max-h-[85vh]">
            <div className="flex-shrink-0 border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{items.some(i => i.id === editingItem.id) ? 'Edit Promo' : 'Tambah Promo Baru'}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Atur rincian promo, syarat klaim, dan masa berlakunya.</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <FormField label="Nama Promo" htmlFor="nama" error={errors['nama']}>
                    <input id="nama" value={editingItem.nama} onChange={(e) => updateEditingField({ nama: e.target.value })} placeholder="misal: Promo Akhir Tahun" className={inputClassFor('nama')} />
                  </FormField>
                </div>

                <FormField label="Target Tagihan" htmlFor="target_jenis_tagihan" error={errors['target_jenis_tagihan']}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {[
                      { id: 'semua', label: 'Semua' },
                      { id: 'spp', label: 'SPP' },
                      { id: 'pendaftaran', label: 'Pendaftaran' },
                      ...jenisTagihanList.filter(j => j.nama.toLowerCase() !== 'spp' && j.nama.toLowerCase() !== 'pendaftaran').map(j => ({ id: j.id, label: j.nama }))
                    ].map(opt => {
                      const currentTargets = editingItem.target_jenis_tagihan?.length ? editingItem.target_jenis_tagihan : [editingItem.jenis_tagihan || 'semua'];
                      const isChecked = currentTargets.includes(opt.id) || currentTargets.includes('semua');
                      return (
                        <label key={opt.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                            checked={opt.id === 'semua' ? currentTargets.includes('semua') : isChecked}
                            onChange={(e) => {
                              let current = [...currentTargets];

                              if (e.target.checked) {
                                if (opt.id === 'semua') current = ['semua'];
                                else {
                                  current = current.filter(x => x !== 'semua');
                                  if (!current.includes(opt.id)) current.push(opt.id);
                                }
                              } else {
                                if (opt.id === 'semua') current = [];
                                else current = current.filter(x => x !== opt.id);
                              }
                              updateEditingField({ target_jenis_tagihan: current, jenis_tagihan: current.length === 1 ? current[0] : 'multi' });
                            }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                </FormField>

                <div className="md:col-span-2 space-y-4">
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Nilai Potongan per Target</p>
                  {(editingItem.target_jenis_tagihan?.length ? editingItem.target_jenis_tagihan : [editingItem.jenis_tagihan || 'semua']).map(targetId => {
                    const targetLabel = targetId === 'semua' ? 'Semua Tagihan' : targetId === 'spp' ? 'SPP' : targetId === 'pendaftaran' ? 'Pendaftaran' : (jenisTagihanList.find(j => j.id === targetId)?.nama || targetId);
                    const pt = editingItem.potongan_per_target?.[targetId] || { tipe_diskon: editingItem.tipe_diskon, persen_diskon: editingItem.persen_diskon, nominal_diskon: editingItem.nominal_diskon };

                    return (
                      <div key={targetId} className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-end rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/30">
                        <div>
                          <label className="mb-1 block text-[13px] font-bold text-slate-700 dark:text-slate-300">Target</label>
                          <div className="h-10 flex items-center px-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 text-sm font-semibold truncate">{targetLabel}</div>
                        </div>
                        <FormField label="Tipe Potongan" htmlFor={`tipe_diskon_${targetId}`}>
                          <select id={`tipe_diskon_${targetId}`} value={pt.tipe_diskon} onChange={(e) => {
                            const newPt = { ...(editingItem.potongan_per_target || {}), [targetId]: { ...pt, tipe_diskon: e.target.value as 'persen' | 'nominal' } };
                            updateEditingField({ potongan_per_target: newPt, ...(targetId === 'semua' || targetId === (editingItem.target_jenis_tagihan?.[0] || 'semua') ? { tipe_diskon: e.target.value as 'persen' | 'nominal' } : {}) });
                          }} className={compactInputClass}>
                            <option value="persen">Persentase (%)</option>
                            <option value="nominal">Nominal Rupiah (Rp)</option>
                          </select>
                        </FormField>
                        {pt.tipe_diskon === 'persen' ? (
                          <FormField label="Nilai Potongan (%)" htmlFor={`persen_diskon_${targetId}`} error={errors[`persen_diskon_${targetId}`]}>
                            <input id={`persen_diskon_${targetId}`} inputMode="numeric" value={pt.persen_diskon} onChange={(e) => {
                              const val = Number(e.target.value.replace(/[^\d.]/g, ''));
                              const newPt = { ...(editingItem.potongan_per_target || {}), [targetId]: { ...pt, persen_diskon: val } };
                              updateEditingField({ potongan_per_target: newPt, ...(targetId === 'semua' || targetId === (editingItem.target_jenis_tagihan?.[0] || 'semua') ? { persen_diskon: val } : {}) });
                            }} className={inputClassFor(`persen_diskon_${targetId}`)} />
                          </FormField>
                        ) : (
                          <FormField label="Nilai Potongan (Rp)" htmlFor={`nominal_diskon_${targetId}`}>
                            <input id={`nominal_diskon_${targetId}`} inputMode="numeric" value={formatNumberInput(pt.nominal_diskon)} onChange={(e) => {
                              const val = Number(parseNumberInput(e.target.value));
                              const newPt = { ...(editingItem.potongan_per_target || {}), [targetId]: { ...pt, nominal_diskon: val } };
                              updateEditingField({ potongan_per_target: newPt, ...(targetId === 'semua' || targetId === (editingItem.target_jenis_tagihan?.[0] || 'semua') ? { nominal_diskon: val } : {}) });
                            }} className={compactInputClass} />
                          </FormField>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* KHUSUS PENDAFTARAN JIKA DIPISAH: Pilih Komponen */}
              {(editingItem.target_jenis_tagihan?.includes('pendaftaran') || editingItem.target_jenis_tagihan?.includes('semua') || editingItem.jenis_tagihan === 'semua' || editingItem.jenis_tagihan === 'pendaftaran') && activeKomponenBiaya && activeKomponenBiaya.length > 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-900/30 dark:bg-amber-900/10">
                  <div>
                    <h3 className="text-sm font-extrabold text-amber-800 dark:text-amber-300">Target Komponen Pendaftaran</h3>
                    <p className="mt-0.5 text-[11px] leading-tight text-amber-600/80 dark:text-amber-400/80">Karena tagihan pendaftaran pada tahun ajaran aktif dipisah, Anda bisa membatasi potongan ini hanya untuk komponen tertentu secara default.</p>
                  </div>
                  <div className="mt-4">
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                          checked={!editingItem.target_komponen_biaya || editingItem.target_komponen_biaya.length === 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateEditingField({ target_komponen_biaya: [] });
                            }
                          }}
                        />
                        <span className={(!editingItem.target_komponen_biaya || editingItem.target_komponen_biaya.length === 0) ? "font-bold text-brand-700 dark:text-brand-400" : ""}>Berlaku untuk semua komponen Pendaftaran</span>
                      </label>
                      <div className="ml-6 flex flex-col gap-2 border-l-2 border-slate-200 pl-4 mt-1 dark:border-slate-700">
                        {activeKomponenBiaya.map(kb => {
                          const isChecked = editingItem.target_komponen_biaya?.includes(kb.nama) ?? false;
                          return (
                            <label key={kb.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                                checked={isChecked}
                                onChange={(e) => {
                                  let current = [...(editingItem.target_komponen_biaya || [])];
                                  if (e.target.checked) {
                                    if (!current.includes(kb.nama)) current.push(kb.nama);
                                  } else {
                                    current = current.filter(x => x !== kb.nama);
                                  }
                                  updateEditingField({ target_komponen_biaya: current });
                                }}
                              />
                              <span className={isChecked ? "font-semibold" : ""}>{kb.nama || '(Tanpa Nama)'}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* KHUSUS SPP: Konfigurasi Berulang */}
              {(editingItem.target_jenis_tagihan?.includes('spp') || editingItem.target_jenis_tagihan?.includes('semua') || editingItem.jenis_tagihan === 'semua' || editingItem.jenis_tagihan === 'spp') && (
                <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-4 dark:border-brand-900/30 dark:bg-brand-900/10">
                  <div>
                    <h3 className="text-sm font-extrabold text-brand-800 dark:text-brand-300">Siklus Potongan SPP</h3>
                    <p className="mt-0.5 text-[11px] leading-tight text-brand-600/80 dark:text-brand-400/80">Karena SPP ditagih setiap bulan, tentukan di bulan apa saja potongan ini berlaku.</p>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField label="Berlaku Pada" htmlFor="mode_tagihan_berulang">
                      <select
                        id="mode_tagihan_berulang"
                        value={editingItem.mode_tagihan_berulang || 'otomatis'}
                        onChange={(e) => updateEditingField({ mode_tagihan_berulang: e.target.value as 'otomatis' | 'manual' })}
                        className={compactInputClass}
                      >
                        <option value="otomatis">Setiap Bulan (Selama setahun penuh)</option>
                        <option value="tertentu">Bulan-bulan tertentu saja</option>
                      </select>
                    </FormField>

                    {editingItem.mode_tagihan_berulang === 'tertentu' && (
                      <div className="md:col-span-2">
                        <p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">Pilih Bulan Berlakunya Promo SPP</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                          {['Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'].map((bln, idx) => {
                            const mNumber = idx < 6 ? idx + 7 : idx - 5; // Jul=7...Jun=6
                            const isChecked = editingItem.bulan_tertentu?.includes(mNumber) ?? false;
                            return (
                              <label key={mNumber} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    let current = [...(editingItem.bulan_tertentu || [])];
                                    if (e.target.checked) {
                                      if (!current.includes(mNumber)) current.push(mNumber);
                                    } else {
                                      current = current.filter(x => x !== mNumber);
                                    }
                                    updateEditingField({ bulan_tertentu: current });
                                  }}
                                />
                                {bln}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/30">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Masa Klaim Promo</h3>
                    <p className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">Rentang waktu admin dapat menautkan promo ini ke profil siswa.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <FormField label="Mulai (opsional)" htmlFor="klaim_mulai">
                      <input id="klaim_mulai" type="date" value={editingItem.klaim_mulai || ''} onChange={(e) => updateEditingField({ klaim_mulai: e.target.value })} className={compactInputClass} />
                    </FormField>
                    <FormField label="Selesai (opsional)" htmlFor="klaim_selesai" error={errors['klaim_selesai']}>
                      <input id="klaim_selesai" type="date" value={editingItem.klaim_selesai || ''} onChange={(e) => updateEditingField({ klaim_selesai: e.target.value })} className={inputClassFor('klaim_selesai')} />
                    </FormField>
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/30">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">Batas Kali Penggunaan</h3>
                    <p className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">Berapa kali promo ini maksimal memotong tagihan per siswa.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <FormField label="Maksimal Pemakaian (opsional)" htmlFor="batas_kali_penggunaan" error={errors['batas_kali_penggunaan']}>
                      <input id="batas_kali_penggunaan" inputMode="numeric" value={editingItem.batas_kali_penggunaan || ''} onChange={(e) => updateEditingField({ batas_kali_penggunaan: e.target.value ? Number(e.target.value.replace(/\\D/g, '')) : null })} placeholder="Kosongkan untuk selamanya" className={inputClassFor('batas_kali_penggunaan')} />
                    </FormField>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="md:w-1/2">
                  <FormField label="Kuota Maksimal Penerima (opsional)" htmlFor="kuota" error={errors['kuota']}>
                    <input id="kuota" inputMode="numeric" value={editingItem.kuota || ''} onChange={(e) => updateEditingField({ kuota: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} placeholder="Kosongkan jika tidak ada batas kuota" className={inputClassFor('kuota')} />
                  </FormField>
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Jika diisi, promo tidak bisa dipilih lagi ketika batas pemakai sudah tercapai.</p>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-slate-100 p-6 flex justify-end gap-3 dark:border-slate-800">
              <button type="button" onClick={closeModal} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Batal</button>
              <button type="button" onClick={handleSaveModal} disabled={isSubmitting} className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-500 disabled:opacity-60 disabled:cursor-not-allowed">{isSubmitting ? 'Menyimpan...' : 'Simpan Promo'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
