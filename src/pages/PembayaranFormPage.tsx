import { useEffect, useMemo, useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plus, Save, Trash2, Search, X } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import { getCurrentActor } from '../lib/actor';
import { formatNumberInput, formatRupiah, parseNumberInput } from '../lib/format';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { listSiswaWithFilters } from '../queries/siswaQueries';
import { listTagihanWithFilters } from '../queries/tagihanQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { recordPembayaranBatch } from '../services/pembayaranService';
import { ServiceError } from '../services/service-errors';
import { todayDate } from '../services/service-helpers';
import { generateKwitansiPdf } from '../lib/pdfGenerator';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useConfirmStore } from '../store/confirmStore';
import type { Tagihan } from '../db/types';

interface SettingOption {
  id: string;
  nama: string;
  aktif: boolean;
}

interface FormState {
  siswa_id: string;
  tanggal: string;
  catatan: string;
}

interface PaymentItemState { id: string; metode: string; jumlah: string; catatan: string; }

const initialForm: FormState = {
  siswa_id: '',
  tanggal: todayDate(),
  catatan: '',
};

function newPaymentItem(jumlah = ''): PaymentItemState {
  return { id: crypto.randomUUID(), metode: '', jumlah, catatan: '' };
}

export default function PembayaranFormPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const [searchParams] = useSearchParams();
  const initialTagihanId = searchParams.get('tagihanId') ?? '';

  const [form, setForm] = useState<FormState>(initialForm);
  const [paymentItems, setPaymentItems] = useState<PaymentItemState[]>([newPaymentItem()]);
  const [selectedTagihans, setSelectedTagihans] = useState<Record<string, boolean>>({});
  const [tagihanAmounts, setTagihanAmounts] = useState<Record<string, string>>({});
  const [tagihanDiscounts, setTagihanDiscounts] = useState<Record<string, string>>({});
  const [uangDiterima, setUangDiterima] = useState<string>('');

  const [siswaSearch, setSiswaSearch] = useState('');
  const [isSiswaDropdownOpen, setIsSiswaDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const { addToast } = useToastStore();
  const { requestConfirm } = useConfirmStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const siswaOptions = useLiveQuery(() => listSiswaWithFilters({ status: 'semua', tahunAjaranId: 'all' }), [], []);
  const metodePembayaran = useLiveQuery(() => getPengaturanByKunci<SettingOption[]>('metode_pembayaran'), [], [] as SettingOption[]);
  const allTagihan = useLiveQuery(() => listTagihanWithFilters({ context: 'semua', tahunAjaranId: 'all' }), [], []);
  const tahunAjaranOptions = useLiveQuery(() => listTahunAjaran(), [], []);
  const activeYear = tahunAjaranOptions.find((item) => item.aktif || item.status === 'aktif') ?? null;

  const activeMetode = useMemo(() => (metodePembayaran ?? []).filter((item) => item.aktif && item.nama.trim().toLowerCase() !== 'split'), [metodePembayaran]);
  
  const selectedSiswa = useMemo(() => siswaOptions.find((item) => item.id === form.siswa_id) ?? null, [form.siswa_id, siswaOptions]);

  const filteredSiswa = useMemo(() => {
    if (!siswaSearch) return siswaOptions.slice(0, 50);
    const lowerSearch = siswaSearch.toLowerCase();
    return siswaOptions.filter(s => s.nama.toLowerCase().includes(lowerSearch) || s.nama_wali?.toLowerCase().includes(lowerSearch)).slice(0, 50);
  }, [siswaOptions, siswaSearch]);

  const availableTagihan = useMemo(() => {
    if (!form.siswa_id) return [];
    const unpaid = allTagihan.filter((item) => item.siswa_id === form.siswa_id && item.status !== 'lunas' && item.status !== 'dibatalkan');

    const daysUntilDue = (t: typeof unpaid[0]) => Math.ceil((new Date(t.jatuh_tempo).getTime() - Date.now()) / 86400000);

    unpaid.sort((a, b) => {
      const aOld = a.tahun_ajaran_id !== activeYear?.id ? 1 : 0;
      const bOld = b.tahun_ajaran_id !== activeYear?.id ? 1 : 0;
      if (aOld !== bOld) return bOld - aOld;
      const aOverdue = daysUntilDue(a) < 0 ? 1 : 0;
      const bOverdue = daysUntilDue(b) < 0 ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      return a.jatuh_tempo.localeCompare(b.jatuh_tempo);
    });

    return unpaid;
  }, [allTagihan, form.siswa_id, activeYear]);
  
  const { sppTagihan, nonSppTagihan } = useMemo(() => {
    return {
      sppTagihan: availableTagihan.filter(t => t.jenis === 'spp'),
      nonSppTagihan: availableTagihan.filter(t => t.jenis !== 'spp')
    };
  }, [availableTagihan]);

  // Handle click outside dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSiswaDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initial target behavior
  useEffect(() => {
    if (!initialTagihanId || allTagihan.length === 0) return;
    const targetTagihan = allTagihan.find((item) => item.id === initialTagihanId);
    if (!targetTagihan) return;

    if (targetTagihan.jenis === 'spp' && targetTagihan.bulan_tahun) {
      const earlierSppExists = allTagihan.some(
        (t) => t.siswa_id === targetTagihan.siswa_id && t.jenis === 'spp' && t.id !== targetTagihan.id && t.status !== 'lunas' && t.bulan_tahun && t.bulan_tahun < targetTagihan.bulan_tahun!,
      );
      if (earlierSppExists) {
        addToast({ type: 'error', title: 'Gagal', message: 'Tagihan SPP harus dibayar berurutan. Selesaikan SPP yang lebih awal terlebih dahulu.' });
        return;
      }
    }

    setForm((current) => ({ ...current, siswa_id: targetTagihan.siswa_id }));
    const sisa = Math.max(0, targetTagihan.jumlah_total - targetTagihan.sudah_dibayar);
    setSelectedTagihans({ [targetTagihan.id]: true });
    setTagAmountsWithAutoFill({ [targetTagihan.id]: String(sisa) });
  }, [allTagihan, initialTagihanId, addToast]);

  const setTagAmountsWithAutoFill = (amounts: Record<string, string>) => {
    setTagihanAmounts(amounts);
  };

  // Reset tagihan selections if siswa changes
  useEffect(() => {
    if (!form.siswa_id) return;
    const hasInvalid = Object.keys(selectedTagihans).some(id => {
      const t = allTagihan.find(item => item.id === id);
      return t && t.siswa_id !== form.siswa_id;
    });
    if (hasInvalid) {
      setSelectedTagihans({});
      setTagAmountsWithAutoFill({});
      setTagihanDiscounts({});
      setPaymentItems([newPaymentItem()]);
      setUangDiterima('');
    }
  }, [form.siswa_id, allTagihan, selectedTagihans]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updatePaymentItem(id: string, patch: Partial<PaymentItemState>) {
    setPaymentItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function handleToggleTagihan(tagihanId: string, isChecked: boolean, sisa: number) {
    const t = availableTagihan.find(item => item.id === tagihanId);
    if (!t) return;

    if (t.jenis === 'spp') {
      if (isChecked) {
        const updates: Record<string, boolean> = {};
        const amounts: Record<string, string> = {};
        for (const spp of sppTagihan) {
          if (spp.jatuh_tempo <= t.jatuh_tempo) {
            updates[spp.id] = true;
            amounts[spp.id] = String(Math.max(0, spp.jumlah_total - spp.sudah_dibayar - Number(tagihanDiscounts[spp.id] || 0)));
          }
        }
        setSelectedTagihans(curr => ({ ...curr, ...updates }));
        setTagihanAmounts(curr => ({ ...curr, ...amounts }));
      } else {
        const toDelete: string[] = [];
        for (const spp of sppTagihan) {
          if (spp.jatuh_tempo >= t.jatuh_tempo) {
            toDelete.push(spp.id);
          }
        }
        setSelectedTagihans(curr => {
          const copy = { ...curr };
          for (const id of toDelete) delete copy[id];
          return copy;
        });
        setTagihanAmounts(curr => {
          const copy = { ...curr };
          for (const id of toDelete) delete copy[id];
          return copy;
        });
        setTagihanDiscounts(curr => {
          const copy = { ...curr };
          for (const id of toDelete) delete copy[id];
          return copy;
        });
      }
    } else {
      setSelectedTagihans(curr => ({ ...curr, [tagihanId]: isChecked }));
      if (isChecked) {
        setTagihanAmounts(curr => ({ ...curr, [tagihanId]: String(Math.max(0, sisa - Number(tagihanDiscounts[tagihanId] || 0))) }));
      } else {
        setTagihanAmounts(curr => {
          const copy = { ...curr };
          delete copy[tagihanId];
          return copy;
        });
        setTagihanDiscounts(curr => {
          const copy = { ...curr };
          delete copy[tagihanId];
          return copy;
        });
      }
    }
    setErrors(curr => ({ ...curr, tagihan_items: undefined }));
  }

  const handleDiscountChange = (tagihanId: string, discount: string, originalSisa: number, isFull: boolean) => {
    const numDiscount = Number(discount || 0);
    setTagihanDiscounts(curr => ({...curr, [tagihanId]: discount}));
    
    if (isFull) {
       const newSisa = Math.max(0, originalSisa - numDiscount);
       setTagihanAmounts(curr => ({...curr, [tagihanId]: String(newSisa)}));
    }
  }

  const selectedTagihanIds = Object.keys(selectedTagihans).filter(id => selectedTagihans[id]);
  const totalTagihanSelected = selectedTagihanIds.reduce((sum, id) => sum + Number(tagihanAmounts[id] || 0), 0);
  const enteredAmount = paymentItems.reduce((total, item) => total + Number(item.jumlah || 0), 0);
  
  const parsedUangDiterima = Number(uangDiterima || 0);
  const kembalian = parsedUangDiterima > totalTagihanSelected ? parsedUangDiterima - totalTagihanSelected : 0;

  useEffect(() => {
    if (paymentItems.length === 1 && (!paymentItems[0].jumlah || Number(paymentItems[0].jumlah) === 0 || Number(paymentItems[0].jumlah) !== totalTagihanSelected)) {
      setPaymentItems(curr => [{ ...curr[0], jumlah: String(totalTagihanSelected || '') }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalTagihanSelected]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan. Silakan login ulang.' });
      return;
    }

    const nextErrors: Partial<Record<string, string>> = {};

    if (!form.siswa_id) nextErrors.siswa_id = 'Pilih siswa terlebih dahulu.';
    if (!form.tanggal) nextErrors.tanggal = 'Tanggal pembayaran wajib diisi.';
    if (selectedTagihanIds.length === 0) nextErrors.tagihan_items = 'Pilih minimal satu tagihan untuk dibayar.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const parsedItems = paymentItems.map((item) => ({ metode: item.metode, jumlah: Number(item.jumlah), catatan: item.catatan.trim() || null }));
    if (parsedItems.some((item) => !item.metode)) {
      addToast({ type: 'error', title: 'Gagal', message: 'Setiap baris pembayaran wajib memilih metode.' });
      return;
    }
    if (parsedItems.some((item) => !Number.isFinite(item.jumlah) || item.jumlah <= 0)) {
      addToast({ type: 'error', title: 'Gagal', message: 'Jumlah pembayaran tiap metode harus lebih dari nol.' });
      return;
    }
    
    // Check if duplicate methods exist
    const usedMethods = new Set<string>();
    for (const item of parsedItems) {
      if (usedMethods.has(item.metode)) {
        addToast({ type: 'error', title: 'Gagal', message: `Metode pembayaran ${item.metode} dipilih lebih dari satu kali. Gunakan metode yang berbeda.` });
        return;
      }
      usedMethods.add(item.metode);
    }
    
    const totalInput = parsedItems.reduce((total, item) => total + item.jumlah, 0);
    if (totalInput !== totalTagihanSelected) {
      addToast({ type: 'error', title: 'Gagal', message: `Total input metode (Rp ${totalInput.toLocaleString('id-ID')}) tidak sama dengan total tagihan yang akan dibayar (Rp ${totalTagihanSelected.toLocaleString('id-ID')}).` });
      return;
    }

    const tagihanItemsPayload = selectedTagihanIds.map(id => ({
      tagihan_id: id,
      nominal_dibayar: Number(tagihanAmounts[id] || 0),
      diskon_tambahan: Number(tagihanDiscounts[id] || 0)
    }));

    requestConfirm({
      title: 'Simpan Pembayaran?',
      description: `Apakah Anda yakin ingin menyimpan pembayaran sebesar ${formatRupiah(totalInput)} untuk ${selectedTagihanIds.length} tagihan?`,
      confirmLabel: 'Ya, Simpan',
      onConfirm: async () => {
        setIsSubmitting(true);

        try {
          const result = await recordPembayaranBatch(actor, {
            siswa_id: form.siswa_id,
            tanggal: form.tanggal,
            catatan: form.catatan.trim() || null,
            payment_methods: parsedItems,
            tagihan_items: tagihanItemsPayload,
          });

          // Reset selection state
          setSelectedTagihans({});
          setTagihanAmounts({});
          setTagihanDiscounts({});
          setPaymentItems([newPaymentItem()]);
          setUangDiterima('');

          addToast({ type: 'success', title: 'Berhasil', message: 'Pembayaran berhasil dicatat.' });

          if (result.requiresVerification) {
            requestConfirm({
              title: 'Pembayaran Menunggu Verifikasi',
              description: 'Pembayaran telah tersimpan namun menunggu verifikasi admin. Kuitansi baru dapat dicetak setelah statusnya divalidasi/dikonfirmasi.',
              confirmLabel: 'Oke, Kembali',
              onConfirm: async () => {
                navigate('/pembayaran');
              }
            });
          } else {
            requestConfirm({
              title: 'Pembayaran Berhasil!',
              description: 'Pembayaran telah sukses dicatat. Apakah Anda ingin mencetak kuitansi sekarang?',
              confirmLabel: 'Ya, Cetak Kuitansi',
              cancelLabel: 'Tidak, Kembali',
              onConfirm: async () => {
                try {
                  const groupItems = result.pembayaran.map(p => {
                    const tagihan = allTagihan.find(t => t.id === p.tagihan_id) || null;
                    return {
                      ...p,
                      siswa: selectedSiswa,
                      tagihan,
                      activeClass: selectedSiswa?.activeClass || null
                    };
                  });
                  
                  await generateKwitansiPdf({
                    groupId: result.payment_group_id,
                    items: groupItems,
                    first: groupItems[0],
                    total: totalInput,
                    status: 'terverifikasi'
                  });
                  navigate('/pembayaran');
                } catch (error) {
                  addToast({ type: 'error', title: 'Gagal', message: 'Gagal mencetak kuitansi' });
                  navigate('/pembayaran');
                }
              },
              onCancel: () => {
                navigate('/pembayaran');
              }
            });
          }
          
        } catch (error) {
          addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal mencatat pembayaran.' });
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  }

  const renderTagihanItem = (t: Tagihan) => {
    const isSelected = selectedTagihans[t.id] || false;
    const originalSisa = Math.max(0, t.jumlah_total - t.sudah_dibayar);
    const isFull = !t.bisa_cicil;
    const isTerlambat = t.jatuh_tempo < todayDate() && !isSelected;
    const isDuTertahan = t.jenis === 'daftar_ulang' && t.status_daftar_ulang === 'tertahan';

    return (
      <div key={t.id} className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors md:flex-row md:items-start md:justify-between ${isSelected ? 'border-brand-400 bg-brand-50/50 dark:border-brand-500/50 dark:bg-brand-900/20' : isDuTertahan ? 'border-slate-200 bg-slate-100/50 dark:border-slate-700 dark:bg-slate-800/30 opacity-60' : isTerlambat ? 'border-danger-200 bg-danger-50/50 dark:border-danger-900/50 dark:bg-danger-950/20' : 'border-slate-200 bg-white/70 dark:border-slate-700 dark:bg-slate-900/50'}`}>
        <label className={`flex flex-1 items-start gap-3 mt-2 ${isDuTertahan ? '' : 'cursor-pointer'}`}>
          <input 
            type="checkbox" 
            checked={isSelected} 
            disabled={isDuTertahan}
            onChange={(e) => handleToggleTagihan(t.id, e.target.checked, originalSisa)} 
            className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50" 
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-800 dark:text-slate-200">{t.nama_tagihan}</p>
              {isDuTertahan && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">Tertahan</span>}
              {isTerlambat && <span className="rounded bg-danger-100 px-1.5 py-0.5 text-[10px] font-bold text-danger-700 dark:bg-danger-900/40 dark:text-danger-400">Terlambat</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              {isDuTertahan ? (
                <span className="italic text-slate-400">Selesaikan tunggakan terlebih dahulu</span>
              ) : (
                <>
                  Sisa Awal: <span className="font-bold">{formatRupiah(originalSisa)}</span> {isFull ? '• (Wajib Lunas)' : '• (Bisa Dicicil)'}
                  {t.potongan_diskon && t.potongan_diskon > 0 ? (
                     <span className="ml-1 text-[10px] text-slate-400 line-through">
                        {formatRupiah(t.jumlah_total + t.potongan_diskon)}
                     </span>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </label>
        {isSelected && !isDuTertahan && (
          <div className="flex flex-col gap-2 w-full md:w-auto">
            <div className="flex items-center gap-2">
               <div className="w-full md:w-36">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 px-1">Diskon Tambahan</p>
                  <input 
                     type="text" 
                     inputMode="numeric" 
                     value={formatNumberInput(tagihanDiscounts[t.id] || '')} 
                     onChange={(e) => handleDiscountChange(t.id, parseNumberInput(e.target.value), originalSisa, isFull)} 
                     className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-right text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" 
                     placeholder="0" 
                  />
               </div>
               <div className="w-full md:w-36">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-1 px-1">Nominal Bayar</p>
                  <input 
                     type="text" 
                     inputMode="numeric" 
                     value={formatNumberInput(tagihanAmounts[t.id] || '')} 
                     onChange={(e) => setTagihanAmounts(curr => ({...curr, [t.id]: parseNumberInput(e.target.value)}))} 
                     disabled={isFull} 
                     className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-right text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-400" 
                     placeholder="Nominal bayar" 
                  />
               </div>
            </div>
            {isFull && <p className="text-right text-[10px] text-warning-600 dark:text-warning-400">Nominal bayar terkunci ke sisa akhir</p>}
          </div>
        )}
      </div>
    );
  };

  const selectedMethods = paymentItems.map(item => item.metode).filter(Boolean);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Catat Pembayaran"
        description="Pilih satu atau lebih tagihan siswa, tentukan nominal bayar, dan catat metode pembayaran."
        actions={
          <button
            type="button"
            onClick={() => navigate('/pembayaran')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)] items-start">
        <SectionCard title="Form Catat Pembayaran" description="Cari siswa, centang tagihan yang belum lunas, lalu masukkan nominal yang diterima.">
          <form id="payment-form" className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Pencarian Siswa" htmlFor="siswa_search" error={errors.siswa_id}>
                <div className="relative" ref={dropdownRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="siswa_search"
                      type="text"
                      placeholder="Ketik nama siswa..."
                      value={selectedSiswa ? `${selectedSiswa.nama} - ${selectedSiswa.nama_wali}` : siswaSearch}
                      onChange={(e) => {
                        setSiswaSearch(e.target.value);
                        setIsSiswaDropdownOpen(true);
                        if (selectedSiswa) updateField('siswa_id', '');
                      }}
                      onFocus={() => setIsSiswaDropdownOpen(true)}
                      className="w-full rounded-xl border border-slate-200 bg-white/70 py-3 pl-10 pr-10 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    />
                    {selectedSiswa && (
                      <button type="button" onClick={() => { updateField('siswa_id', ''); setSiswaSearch(''); setIsSiswaDropdownOpen(true); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {isSiswaDropdownOpen && !selectedSiswa && (
                    <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                      {filteredSiswa.length > 0 ? (
                        filteredSiswa.map(s => (
                          <div 
                            key={s.id} 
                            onClick={() => { updateField('siswa_id', s.id); setIsSiswaDropdownOpen(false); }}
                            className="cursor-pointer rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <p className="font-bold text-slate-800 dark:text-slate-100">{s.nama}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Wali: {s.nama_wali}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-center text-sm text-slate-500">Siswa tidak ditemukan</div>
                      )}
                    </div>
                  )}
                </div>
              </FormField>

              <FormField label="Tanggal bayar" htmlFor="tanggal_bayar" error={errors.tanggal}>
                <input
                  id="tanggal_bayar"
                  type="date"
                  value={form.tanggal}
                  onChange={(event) => updateField('tanggal', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                />
              </FormField>
            </div>

            {form.siswa_id ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Pilih Tagihan yang Akan Dibayar</p>
                  {errors.tagihan_items && <p className="text-xs font-semibold text-danger-600">{errors.tagihan_items}</p>}
                </div>
                {availableTagihan.length > 0 ? (
                  <div className="max-h-[500px] space-y-6 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/20">
                    
                    {nonSppTagihan.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tunggakan & Tagihan Lainnya</p>
                        <div className="grid grid-cols-1 gap-3">
                          {nonSppTagihan.map(renderTagihanItem)}
                        </div>
                      </div>
                    )}
                    
                    {sppTagihan.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tagihan SPP (Berurutan)</p>
                          <span className="text-[10px] text-slate-400">Centang bulan untuk otomatis memilih bulan sebelumnya</span>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {sppTagihan.map(renderTagihanItem)}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyState title="Tidak Ada Tagihan" description="Siswa ini tidak memiliki tunggakan/tagihan." />
                )}
              </div>
            ) : null}



            <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Rincian Metode Pembayaran</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pilih metode bayar. Jika lebih dari satu, metode harus berbeda.</p>
                </div>
                <button
                  type="button"
                  disabled={paymentItems.length >= activeMetode.length}
                  onClick={() => setPaymentItems((current) => [...current, newPaymentItem()])}
                  className="inline-flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-900/40 dark:bg-brand-950/20 dark:text-brand-300"
                >
                  <Plus className="h-3.5 w-3.5" /> Tambah Metode
                </button>
              </div>
              
              {paymentItems.map((item, index) => {
                return (
                  <div key={item.id} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/50 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <select value={item.metode} onChange={(event) => updatePaymentItem(item.id, { metode: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100">
                      <option value="">Pilih metode</option>
                      {activeMetode.map((method) => {
                        const isSelectedElsewhere = selectedMethods.includes(method.nama) && item.metode !== method.nama;
                        return (
                          <option key={method.id} value={method.nama} disabled={isSelectedElsewhere}>
                            {method.nama} {isSelectedElsewhere ? '(Sudah dipakai)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    <input inputMode="numeric" value={formatNumberInput(item.jumlah)} onChange={(event) => updatePaymentItem(item.id, { jumlah: parseNumberInput(event.target.value) })} placeholder="Nominal" className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100" />
                    <button type="button" disabled={paymentItems.length === 1} onClick={() => setPaymentItems((current) => current.filter((row) => row.id !== item.id))} className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-danger-700 hover:bg-danger-50 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-danger-400 dark:hover:bg-danger-950/20">
                      <Trash2 className="h-3.5 w-3.5" /> {index + 1}
                    </button>
                  </div>
                );
              })}
              
              <div className="flex flex-wrap items-center justify-between rounded-xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm font-bold text-brand-700 dark:border-brand-900/40 dark:bg-brand-950/20 dark:text-brand-300">
                <span>Total Metode: {formatRupiah(enteredAmount)}</span>
                <span>Total Tagihan: {formatRupiah(totalTagihanSelected)}</span>
              </div>
              
              {enteredAmount !== totalTagihanSelected && totalTagihanSelected > 0 ? (
                <div className="rounded-xl border border-danger-100 bg-danger-50 px-4 py-3 text-xs font-semibold text-danger-700 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400">
                  Total metode pembayaran harus persis sama dengan total tagihan yang akan dibayar ({formatRupiah(totalTagihanSelected)}). Selisih: {formatRupiah(Math.abs(totalTagihanSelected - enteredAmount))}
                </div>
              ) : null}
            </div>

            <FormField label="Catatan Transaksi" htmlFor="catatan_bayar">
              <textarea
                id="catatan_bayar"
                rows={2}
                value={form.catatan}
                onChange={(event) => updateField('catatan', event.target.value)}
                placeholder="Contoh: Pembayaran kolektif via Transfer BCA 123456"
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </FormField>

          </form>
        </SectionCard>

        <div className="sticky top-24 space-y-6">
          <SectionCard title="Ringkasan Pembayaran" description="Informasi ini berubah otomatis sesuai tagihan yang Anda pilih.">
            {!selectedSiswa || selectedTagihanIds.length === 0 ? (
              <EmptyState title="Belum ada tagihan dipilih" description="Cari siswa dan centang tagihan terlebih dahulu untuk melihat ringkasan pembayaran." />
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Siswa</p>
                  <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{selectedSiswa.nama}</p>
                  <p className="mt-1 text-xs text-slate-400">{selectedSiswa.nama_wali}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tagihan Dipilih ({selectedTagihanIds.length})</p>
                  <div className="mt-2 space-y-2">
                    {selectedTagihanIds.map(id => {
                      const t = availableTagihan.find(item => item.id === id);
                      return t ? (
                        <div key={id} className="flex justify-between text-sm text-slate-700 dark:text-slate-300">
                          <span className="truncate pr-4">{t.nama_tagihan}</span>
                          <span className="shrink-0 font-semibold">{formatRupiah(Number(tagihanAmounts[id] || 0))}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
                <MetricRow label="Total Tagihan" value={formatRupiah(totalTagihanSelected)} />

                {/* Kalkulator Kembalian Tunai */}
                <div className="mt-4 space-y-3 rounded-2xl border border-brand-100 bg-brand-50/50 p-4 dark:border-brand-900/30 dark:bg-brand-950/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">Kalkulator Kembalian Tunai</p>
                  <div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNumberInput(uangDiterima)}
                      onChange={(e) => setUangDiterima(parseNumberInput(e.target.value))}
                      placeholder="Masukkan uang diterima..."
                      className="w-full rounded-xl border border-brand-200 bg-white px-4 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-brand-800 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  {parsedUangDiterima > 0 && (
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Kembalian:</span>
                      <span className={`text-lg ${kembalian > 0 ? 'text-success-600 dark:text-success-400' : 'text-slate-400'}`}>{formatRupiah(kembalian)}</span>
                    </div>
                  )}
                </div>

              </div>
            )}
          </SectionCard>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <button
              type="submit"
              form="payment-form"
              disabled={isSubmitting || enteredAmount !== totalTagihanSelected || totalTagihanSelected <= 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500 focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {isSubmitting ? 'Menyimpan...' : 'Simpan Pembayaran'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/pembayaran')}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
