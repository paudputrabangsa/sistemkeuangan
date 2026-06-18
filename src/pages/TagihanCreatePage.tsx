import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import FormField from '../components/ui/FormField';
import { useAuthStore } from '../store/authStore';
import { getCurrentActor } from '../lib/actor';
import { formatRupiah, formatNumberInput, parseNumberInput } from '../lib/format';
import { useToastStore } from '../store/toastStore';
import { listActiveKelas } from '../queries/kelasQueries';
import { listSiswaWithFilters } from '../queries/siswaQueries';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import {
  previewGenerateSpp,
  previewManualTagihan,
  previewGenerateDaftarUlang,
  saveTagihanPreview,
  type GenerateSppInput,
  type GenerateDaftarUlangInput,
  type ManualTagihanInput,
  type TagihanPreviewResult
} from '../services/tagihanService';

interface SettingOption {
  id: string;
  nama: string;
  aktif: boolean;
}

const today = new Date();
const defaultDate = today.toISOString().slice(0, 10);
const defaultMonth = today.toISOString().slice(0, 7);

export default function TagihanCreatePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'manual' ? 'manual' : searchParams.get('tab') === 'daftar_ulang' ? 'daftar_ulang' : 'spp';

  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const { addToast } = useToastStore();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Queries
  const kelasOptions = useLiveQuery(() => listActiveKelas(), [], []);
  const siswaAktif = useLiveQuery(() => listSiswaWithFilters({ status: 'aktif' }), [], []);
  const jenisTagihanOptions = useLiveQuery(() => getPengaturanByKunci<SettingOption[]>('jenis_tagihan'), [], [] as SettingOption[]);

  const manualJenisOptions = useMemo(() => (jenisTagihanOptions ?? []).filter((item) => item.aktif && !['spp', 'daftar ulang'].includes(item.nama.toLowerCase())), [jenisTagihanOptions]);

  // Form States
  const [sppMode, setSppMode] = useState<'single' | 'range'>('single');
  const [sppForm, setSppForm] = useState<GenerateSppInput>({
    bulan_mulai: defaultMonth,
    bulan_selesai: defaultMonth,
    tanggal_jatuh_tempo: 10,
    target: 'semua',
    siswa_ids: [],
  });

  const [manualForm, setManualForm] = useState<ManualTagihanInput>({
    nama_tagihan: '',
    jenis: '',
    jumlah_total: 0,
    jatuh_tempo: defaultDate,
    bisa_cicil: false,
    target: 'semua',
    kelas_ids: [],
    siswa_ids: [],
    tahun_ajaran_id: '',
  });

  const [duForm, setDuForm] = useState<GenerateDaftarUlangInput>({
    tahun_ajaran_id: '',
    biaya_default: 0,
    jatuh_tempo: defaultDate,
    nama_tagihan: '',
    target: 'individu',
    siswa_ids: [],
    kelas_ids: [],
  });

  const draftTahunAjaranOptions = useLiveQuery(
    () => listTahunAjaran().then((items) => items.filter((item) => item.status === 'draft')),
    [],
    [],
  );

  const calonSiswaByDraftYear = useLiveQuery(
    () => {
      if (!manualForm.tahun_ajaran_id) return [];
      return listSiswaWithFilters({ status: 'calon', tahunAjaranId: manualForm.tahun_ajaran_id });
    },
    [manualForm.tahun_ajaran_id],
    [],
  );

  const pindahanSiswa = useMemo(() => (siswaAktif ?? []).filter((s) => s.jenis_masuk === 'pindahan'), [siswaAktif]);

  const [pendaftaranMode, setPendaftaranMode] = useState<'calon' | 'pindahan' | ''>('');
  const isCalonMode = pendaftaranMode === 'calon';
  const isPindahanMode = pendaftaranMode === 'pindahan';

  const [manualJumlahText, setManualJumlahText] = useState('');

  // Preview State
  const [previewData, setPreviewData] = useState<TagihanPreviewResult | null>(null);

  function setActiveTab(tab: 'spp' | 'daftar_ulang' | 'manual') {
    setSearchParams({ tab });
    setPreviewData(null);
  }

  // Handle Select Multiple
  const handleSiswaSppToggle = (id: string) => {
    setSppForm(prev => ({
      ...prev,
      siswa_ids: prev.siswa_ids?.includes(id) ? prev.siswa_ids.filter(x => x !== id) : [...(prev.siswa_ids || []), id]
    }));
  };

  const handleKelasManualToggle = (id: string) => {
    setManualForm(prev => ({
      ...prev,
      kelas_ids: prev.kelas_ids?.includes(id) ? prev.kelas_ids.filter(x => x !== id) : [...(prev.kelas_ids || []), id]
    }));
  };

  const handleSiswaManualToggle = (id: string) => {
    setManualForm(prev => ({
      ...prev,
      siswa_ids: prev.siswa_ids?.includes(id) ? prev.siswa_ids.filter(x => x !== id) : [...(prev.siswa_ids || []), id]
    }));
  };

  const handleKelasDuToggle = (id: string) => {
    setDuForm(prev => ({
      ...prev,
      kelas_ids: prev.kelas_ids?.includes(id) ? prev.kelas_ids.filter(x => x !== id) : [...(prev.kelas_ids || []), id]
    }));
  };

  const handleSiswaDuToggle = (id: string) => {
    setDuForm(prev => ({
      ...prev,
      siswa_ids: prev.siswa_ids?.includes(id) ? prev.siswa_ids.filter(x => x !== id) : [...(prev.siswa_ids || []), id]
    }));
  };

  async function handlePreview() {
    if (!actor) return;
    setIsLoading(true);
    setPreviewData(null);
    try {
      if (activeTab === 'spp') {
        const result = await previewGenerateSpp(actor, sppForm);
        setPreviewData(result);
      } else if (activeTab === 'daftar_ulang') {
        if (!duForm.tahun_ajaran_id) throw new Error('Pilih tahun ajaran target.');
        if (!duForm.nama_tagihan.trim()) throw new Error('Nama tagihan wajib diisi.');
        if (duForm.biaya_default <= 0) throw new Error('Biaya daftar ulang wajib diisi.');
        if (!duForm.jatuh_tempo) throw new Error('Jatuh tempo wajib diisi.');
        const result = await previewGenerateDaftarUlang(actor, duForm);
        setPreviewData(result);
      } else {
        if (!manualForm.jenis) throw new Error('Pilih jenis tagihan.');
        if (manualForm.jenis === 'pendaftaran' && !pendaftaranMode) throw new Error('Pilih untuk Calon atau Pindahan.');
        if (manualForm.jenis === 'pendaftaran' && isCalonMode && !manualForm.tahun_ajaran_id) throw new Error('Pilih tahun ajaran target.');
        if (!manualForm.nama_tagihan.trim()) throw new Error('Nama tagihan wajib diisi.');
        if (manualForm.jumlah_total <= 0) throw new Error('Jumlah total tidak boleh 0.');

        const result = await previewManualTagihan(actor, manualForm);
        setPreviewData(result);
      }
    } catch (e: any) {
      addToast({ type: 'error', title: 'Gagal', message: e.message });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!actor || !previewData || previewData.created.length === 0) return;
    setIsSaving(true);
    try {
      const tagihans = previewData.created.map(p => p.tagihan);
      await saveTagihanPreview(actor, tagihans);
      addToast({ type: 'success', title: 'Berhasil', message: `${tagihans.length} tagihan berhasil disimpan.` });
      navigate('/tagihan');
    } catch (e: any) {
      addToast({ type: 'error', title: 'Gagal', message: e.message });
      setIsSaving(false);
    }
  }

  const inputClass = "block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Buat Tagihan Baru"
        description="Pilih mode pembuatan tagihan dan lihat pratinjau nominal sebelum menyimpan."
        actions={<button onClick={() => navigate('/tagihan')} className="text-sm font-bold text-slate-500 hover:text-slate-800">Kembali</button>}
      />

      <div className="mt-8 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('spp')}
            className={`flex-1 border-b-2 py-4 px-1 text-center text-sm font-bold transition-colors ${activeTab === 'spp'
                ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700'
              }`}
          >
            Generate SPP Bulanan
          </button>
          <button
            onClick={() => setActiveTab('daftar_ulang')}
            className={`flex-1 border-b-2 py-4 px-1 text-center text-sm font-bold transition-colors ${activeTab === 'daftar_ulang'
                ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700'
              }`}
          >
            Generate Daftar Ulang
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 border-b-2 py-4 px-1 text-center text-sm font-bold transition-colors ${activeTab === 'manual'
                ? 'border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700'
              }`}
          >
            Buat Tagihan Lainnya
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'spp' ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <FormField label="Periode Generate">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                      <input
                        type="radio"
                        checked={sppMode === 'single'}
                        onChange={() => {
                          setSppMode('single');
                          setSppForm(p => ({ ...p, bulan_selesai: p.bulan_mulai }));
                        }}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      1 Bulan
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                      <input
                        type="radio"
                        checked={sppMode === 'range'}
                        onChange={() => setSppMode('range')}
                        className="text-brand-600 focus:ring-brand-500"
                      />
                      Beberapa Bulan
                    </label>
                  </div>
                </FormField>
              </div>
              {sppMode === 'single' ? (
                <FormField label="Bulan" htmlFor="spp_bulan">
                  <input
                    id="spp_bulan"
                    type="month"
                    value={sppForm.bulan_mulai}
                    onChange={e => setSppForm(p => ({ ...p, bulan_mulai: e.target.value, bulan_selesai: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
              ) : (
                <>
                  <FormField label="Bulan Mulai" htmlFor="spp_bulan_mulai">
                    <input
                      id="spp_bulan_mulai"
                      type="month"
                      value={sppForm.bulan_mulai}
                      onChange={e => setSppForm(p => ({ ...p, bulan_mulai: e.target.value }))}
                      className={inputClass}
                    />
                  </FormField>
                  <FormField label="Bulan Selesai" htmlFor="spp_bulan_selesai">
                    <input
                      id="spp_bulan_selesai"
                      type="month"
                      value={sppForm.bulan_selesai}
                      onChange={e => setSppForm(p => ({ ...p, bulan_selesai: e.target.value }))}
                      className={inputClass}
                    />
                  </FormField>
                </>
              )}
              <div className="md:col-span-2">
                <FormField label="Tanggal Jatuh Tempo (Per Bulan)" htmlFor="spp_tanggal_jatuh_tempo">
                  <input
                    id="spp_tanggal_jatuh_tempo"
                    type="number"
                    min={1}
                    max={31}
                    value={sppForm.tanggal_jatuh_tempo}
                    onChange={e => setSppForm(p => ({ ...p, tanggal_jatuh_tempo: Number(e.target.value) || 10 }))}
                    className={inputClass}
                  />
                </FormField>
              </div>
              <div className="md:col-span-2">
                <FormField label="Target Pembuatan" htmlFor="spp_target">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                      <input type="radio" checked={sppForm.target === 'semua'} onChange={() => setSppForm(p => ({ ...p, target: 'semua' }))} className="text-brand-600 focus:ring-brand-500" />
                      Semua Siswa Aktif
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                      <input type="radio" checked={sppForm.target === 'individu'} onChange={() => setSppForm(p => ({ ...p, target: 'individu' }))} className="text-brand-600 focus:ring-brand-500" />
                      Pilih Siswa Tertentu
                    </label>
                  </div>
                </FormField>

                {sppForm.target === 'individu' && (
                  <div className="mt-4 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <p className="mb-2 text-xs font-bold text-slate-500">Pilih Siswa:</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {siswaAktif.map(s => (
                        <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input type="checkbox" checked={sppForm.siswa_ids?.includes(s.id)} onChange={() => handleSiswaSppToggle(s.id)} className="rounded border-slate-300 text-brand-600" />
                          {s.nama}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'daftar_ulang' ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <FormField label="Tahun Ajaran Target" htmlFor="du_tahun_ajaran">
                  <select id="du_tahun_ajaran" value={duForm.tahun_ajaran_id} onChange={e => {
                    const ta = draftTahunAjaranOptions.find(t => t.id === e.target.value);
                    setDuForm(p => ({
                      ...p,
                      tahun_ajaran_id: e.target.value,
                      nama_tagihan: ta ? `Pendaftaran Ulang TA ${ta.nama}` : p.nama_tagihan,
                      siswa_ids: [],
                    }));
                  }} className={inputClass}>
                    <option value="">Pilih Tahun Ajaran Draft...</option>
                    {draftTahunAjaranOptions.map(ta => <option key={ta.id} value={ta.id}>{ta.nama}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Nama Tagihan" htmlFor="du_nama">
                <input id="du_nama" placeholder="Contoh: Pendaftaran Ulang TA 2026/2027" value={duForm.nama_tagihan} onChange={e => setDuForm(p => ({ ...p, nama_tagihan: e.target.value }))} className={inputClass} />
              </FormField>
              <FormField label="Biaya Daftar Ulang" htmlFor="du_biaya">
                <input id="du_biaya" inputMode="numeric" value={formatNumberInput(String(duForm.biaya_default || ''))} onChange={e => setDuForm(p => ({ ...p, biaya_default: Number(parseNumberInput(e.target.value)) || 0 }))} placeholder="0" className={inputClass} />
              </FormField>
              <FormField label="Jatuh Tempo" htmlFor="du_jatuh_tempo">
                <input id="du_jatuh_tempo" type="date" value={duForm.jatuh_tempo} onChange={e => setDuForm(p => ({ ...p, jatuh_tempo: e.target.value }))} className={inputClass} />
              </FormField>
              <div className="md:col-span-2">
                <FormField label="Target Pembuatan">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                      <input type="radio" checked={duForm.target === 'kelas'} onChange={() => setDuForm(p => ({ ...p, target: 'kelas' }))} className="text-brand-600 focus:ring-brand-500" />
                      Pilih Kelas
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                      <input type="radio" checked={duForm.target === 'individu'} onChange={() => setDuForm(p => ({ ...p, target: 'individu' }))} className="text-brand-600 focus:ring-brand-500" />
                      Pilih Siswa
                    </label>
                  </div>
                </FormField>

                {duForm.target === 'kelas' && (
                  <div className="mt-4 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {kelasOptions.map(k => (
                        <label key={k.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input type="checkbox" checked={duForm.kelas_ids?.includes(k.id)} onChange={() => handleKelasDuToggle(k.id)} className="rounded border-slate-300 text-brand-600" />
                          {k.nama_kelas}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {duForm.target === 'individu' && (
                  <div className="mt-4 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <p className="mb-2 text-xs font-bold text-slate-500">Pilih Siswa:</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {siswaAktif.map(s => (
                        <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input type="checkbox" checked={duForm.siswa_ids?.includes(s.id)} onChange={() => handleSiswaDuToggle(s.id)} className="rounded border-slate-300 text-brand-600" />
                          {s.nama}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FormField label="Jenis Tagihan" htmlFor="manual_jenis">
                <select id="manual_jenis" value={manualForm.jenis} onChange={e => {
                  const val = e.target.value;
                  setManualForm(p => ({ ...p, jenis: val, tahun_ajaran_id: '', kelas_ids: [], siswa_ids: [] }));
                  if (val !== 'pendaftaran') setPendaftaranMode('');
                }} className={inputClass}>
                  <option value="">Pilih Jenis...</option>
                  {manualJenisOptions.map(j => <option key={j.id} value={j.nama.toLowerCase().replace(/\s+/g, '_')}>{j.nama}</option>)}
                </select>
              </FormField>

              {manualForm.jenis === 'pendaftaran' && (
                <div className="md:col-span-2">
                  <FormField label="Untuk">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                        <input type="radio" name="pendaftaran_mode" checked={pendaftaranMode === 'calon'} onChange={() => setPendaftaranMode('calon')} className="text-brand-600 focus:ring-brand-500" />
                        Calon Siswa Baru (Tahun Draft)
                      </label>
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                        <input type="radio" name="pendaftaran_mode" checked={pendaftaranMode === 'pindahan'} onChange={() => setPendaftaranMode('pindahan')} className="text-brand-600 focus:ring-brand-500" />
                        Siswa Pindahan (Tahun Berjalan)
                      </label>
                    </div>
                  </FormField>
                </div>
              )}

              {isCalonMode && (
                <FormField label="Tahun Ajaran Target" htmlFor="manual_tahun_ajaran">
                  <select id="manual_tahun_ajaran" value={manualForm.tahun_ajaran_id} onChange={e => setManualForm(p => ({ ...p, tahun_ajaran_id: e.target.value, kelas_ids: [], siswa_ids: [] }))} className={inputClass}>
                    <option value="">Pilih Tahun Ajaran Draft...</option>
                    {draftTahunAjaranOptions.map(ta => <option key={ta.id} value={ta.id}>{ta.nama}</option>)}
                  </select>
                </FormField>
              )}
              <FormField label="Nama Tagihan (Keterangan)" htmlFor="manual_nama">
                <input id="manual_nama" placeholder="Contoh: Pembayaran Buku Paket Semester 1" value={manualForm.nama_tagihan} onChange={e => setManualForm(p => ({ ...p, nama_tagihan: e.target.value }))} className={inputClass} />
              </FormField>
              <FormField label="Jumlah/Nominal Tagihan" htmlFor="manual_jumlah">
                <input id="manual_jumlah" inputMode="numeric" value={manualJumlahText} onChange={e => {
                  const val = formatNumberInput(e.target.value);
                  setManualJumlahText(val);
                  setManualForm(p => ({ ...p, jumlah_total: Number(parseNumberInput(val)) || 0 }));
                }} placeholder="0" className={inputClass} />
              </FormField>
              <FormField label="Jatuh Tempo" htmlFor="manual_jatuh_tempo">
                <input id="manual_jatuh_tempo" type="date" value={manualForm.jatuh_tempo} onChange={e => setManualForm(p => ({ ...p, jatuh_tempo: e.target.value }))} className={inputClass} />
              </FormField>
              <div className="md:col-span-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={manualForm.bisa_cicil} onChange={e => setManualForm(p => ({ ...p, bisa_cicil: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
                  Boleh dicicil / dibayar sebagian
                </label>
              </div>

              <div className="md:col-span-2 mt-4 border-t border-slate-100 pt-6 dark:border-slate-800">
                <FormField label="Target Pembuatan" htmlFor="manual_target">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                      <input type="radio" checked={manualForm.target === 'semua'} onChange={() => setManualForm(p => ({ ...p, target: 'semua' }))} className="text-brand-600 focus:ring-brand-500" />
                      {isCalonMode ? 'Semua Calon Siswa' : isPindahanMode ? 'Semua Siswa Pindahan' : 'Semua Siswa Aktif'}
                    </label>
                    {!isCalonMode && !isPindahanMode && (
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                        <input type="radio" checked={manualForm.target === 'kelas'} onChange={() => setManualForm(p => ({ ...p, target: 'kelas' }))} className="text-brand-600 focus:ring-brand-500" />
                        Pilih Kelas
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                      <input type="radio" checked={manualForm.target === 'individu'} onChange={() => setManualForm(p => ({ ...p, target: 'individu' }))} className="text-brand-600 focus:ring-brand-500" />
                      Pilih Siswa
                    </label>
                  </div>
                </FormField>

                {manualForm.target === 'kelas' && !isCalonMode && !isPindahanMode && (
                  <div className="mt-4 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {kelasOptions.map(k => (
                        <label key={k.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input type="checkbox" checked={manualForm.kelas_ids?.includes(k.id)} onChange={() => handleKelasManualToggle(k.id)} className="rounded border-slate-300 text-brand-600" />
                          {k.nama_kelas}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {manualForm.target === 'individu' && (
                  <div className="mt-4 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    {isCalonMode ? (
                      <>
                        <p className="mb-2 text-xs font-bold text-slate-500">Pilih Calon Siswa ({calonSiswaByDraftYear.length}):</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                          {calonSiswaByDraftYear.map(s => (
                            <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                              <input type="checkbox" checked={manualForm.siswa_ids?.includes(s.id)} onChange={() => handleSiswaManualToggle(s.id)} className="rounded border-slate-300 text-brand-600" />
                              {s.nama}
                            </label>
                          ))}
                        </div>
                      </>
                    ) : isPindahanMode ? (
                      <>
                        <p className="mb-2 text-xs font-bold text-slate-500">Pilih Siswa Pindahan ({pindahanSiswa.length}):</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                          {pindahanSiswa.map(s => (
                            <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                              <input type="checkbox" checked={manualForm.siswa_ids?.includes(s.id)} onChange={() => handleSiswaManualToggle(s.id)} className="rounded border-slate-300 text-brand-600" />
                              {s.nama}
                            </label>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="mb-2 text-xs font-bold text-slate-500">Pilih Siswa:</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                          {siswaAktif.map(s => (
                            <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                              <input type="checkbox" checked={manualForm.siswa_ids?.includes(s.id)} onChange={() => handleSiswaManualToggle(s.id)} className="rounded border-slate-300 text-brand-600" />
                              {s.nama}
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-end">
            <button
              onClick={handlePreview}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-700 focus:ring-4 focus:ring-slate-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {isLoading ? 'Memproses...' : 'Lihat Pratinjau Tagihan'}
            </button>
          </div>
        </div>
      </div>

      {previewData && (
        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 dark:border-brand-900/50 dark:bg-brand-950/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-brand-900 dark:text-brand-100">Pratinjau Berhasil</h3>
                <p className="text-sm text-brand-700 dark:text-brand-300">
                  {previewData.created.length} tagihan siap dibuat, {previewData.skipped.length} siswa dilewati.
                </p>
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving || previewData.created.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-500 focus:ring-4 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {isSaving ? 'Menyimpan...' : 'Simpan Semua Tagihan'}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
              <h4 className="font-bold text-slate-800 dark:text-slate-100">Daftar Tagihan yang Akan Dibuat ({previewData.created.length})</h4>
            </div>
            {previewData.created.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Nama Siswa</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Kelas</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Tagihan</th>
                      {activeTab === 'daftar_ulang' && <th className="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">Status DU</th>}
                      <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Diskon/Promo</th>
                      <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Total Akhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {previewData.created.map((item, idx) => {
                      const statusDu = item.tagihan.status_daftar_ulang;
                      return (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-slate-900 dark:text-slate-100">{item.nama_siswa}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{item.kelas_nama}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{item.tagihan.nama_tagihan}</td>
                          {activeTab === 'daftar_ulang' && (
                            <td className="whitespace-nowrap px-6 py-4 text-center">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusDu === 'aktif' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'}`}>
                                {statusDu === 'aktif' ? 'Aktif' : 'Tertahan'}
                              </span>
                            </td>
                          )}
                          <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-brand-600 dark:text-brand-400">
                            {item.tagihan.potongan_diskon ? `- ${formatRupiah(item.tagihan.potongan_diskon)}` : '-'}
                            {item.tagihan.nama_promo && <div className="text-[10px] uppercase tracking-wider">{item.tagihan.nama_promo}</div>}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-bold text-slate-900 dark:text-slate-100">{formatRupiah(item.tagihan.jumlah_total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-8 text-center text-sm text-slate-500">Tidak ada tagihan yang akan dibuat.</div>
            )}
          </div>

          {previewData.skipped.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                <h4 className="font-bold text-slate-800 dark:text-slate-100">Siswa yang Dilewati ({previewData.skipped.length})</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Nama Siswa</th>
                      <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Alasan Dilewati</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {previewData.skipped.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-slate-900 dark:text-slate-100">{item.nama_siswa}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
