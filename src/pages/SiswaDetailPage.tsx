import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileClock, Pencil, UserRound, MoreVertical } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import StatusBadgeSiswa from '../components/ui/StatusBadgeSiswa';
import { getCurrentActor } from '../lib/actor';
import { formatRupiah, formatTanggal, formatKelasLabel } from '../lib/format';
import { listActiveKelas } from '../queries/kelasQueries';
import { getSiswaDetail } from '../queries/siswaQueries';
import { ServiceError } from '../services/service-errors';
import {
  aturKelasSiswaManual,
  setSiswaBerhenti,
  setSiswaTidakJadiMasuk,
  setSiswaCuti,
  setSiswaAktifDariCuti,
  type PenangananTagihanBerhenti,
} from '../services/siswaStatusService';
import { useAuthStore } from '../store/authStore';
import { getPengaturanByKunci } from '../queries/pengaturanQueries';
import type { DiskonItem } from '../db/types';


export default function SiswaDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);

  const [isStatusActionOpen, setIsStatusActionOpen] = useState(false);
  const [statusActionType, setStatusActionType] = useState<'berhenti' | 'batal_daftar' | 'cuti' | null>(null);
  const [statusActionCatatan, setStatusActionCatatan] = useState('');
  const [statusActionError, setStatusActionError] = useState('');
  const [isProcessingStatusAction, setIsProcessingStatusAction] = useState(false);
  const [penangananTagihan, setPenangananTagihan] = useState<Record<string, PenangananTagihanBerhenti>>({});
  
  const [isPlacementOpen, setIsPlacementOpen] = useState(false);
  const [isActivateFromCutiOpen, setIsActivateFromCutiOpen] = useState(false);
  const [manualKelasId, setManualKelasId] = useState('');
  const [placementNote, setPlacementNote] = useState('');
  const [placementError, setPlacementError] = useState('');
  const [isSubmittingPlacement, setIsSubmittingPlacement] = useState(false);
  
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

  const detail = useLiveQuery(async () => (id ? getSiswaDetail(id) : null), [id], null);
  const kelasOptions = useLiveQuery(() => listActiveKelas(), [], []);
  const diskonPengaturan = useLiveQuery(() => getPengaturanByKunci<DiskonItem[]>('diskon'), [], [] as DiskonItem[]) ?? [];

  const statusLog = useLiveQuery(async () => {
    if (!detail?.siswa?.id) return null;
    const logs = await db.audit_log.where('record_id').equals(detail.siswa.id).reverse().toArray();
    return logs.find(l => l.aksi === 'update' && l.payload?.status_baru === detail.siswa.status && l.payload?.catatan) ?? null;
  }, [detail?.siswa?.id, detail?.siswa?.status], null);

  const activePromos = detail?.siswa.daftar_promo && detail.siswa.daftar_promo.length > 0
    ? diskonPengaturan.filter(p => detail.siswa.daftar_promo?.includes(p.id))
    : [];

  const openBills = (detail?.tagihan ?? []).filter((item) => item.status !== 'lunas');

  if (!id) {
    return <BackToListEmptyState title="ID siswa tidak ditemukan" description="Route detail siswa membutuhkan parameter ID yang valid." />;
  }

  if (!detail) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Detail Siswa" description="Memuat data siswa dari IndexedDB..." />
        <SectionCard>
          <div className="space-y-3">
            <div className="h-6 w-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900/60" />
          </div>
        </SectionCard>
      </div>
    );
  }

  if (!detail.siswa) {
    return <BackToListEmptyState title="Siswa tidak ditemukan" description="Data siswa yang Anda cari tidak ada atau sudah tidak tersedia di penyimpanan lokal." />;
  }

  const { siswa, tahunAjaranTarget, activeAssignment, riwayatKelas } = detail;
  const canSetBerhenti = siswa.status === 'aktif';
  const canBatalkanMasuk = siswa.status === 'calon';
  const canAturKelasManual = siswa.status === 'aktif' || siswa.status === 'calon';

  function openStatusDialog(type: 'berhenti' | 'batal_daftar' | 'cuti') {
    const nextState: Record<string, PenangananTagihanBerhenti> = {};
    for (const item of openBills) {
      nextState[item.id] = 'biarkan';
    }
    setPenangananTagihan(nextState);
    setStatusActionType(type);
    setStatusActionCatatan('');
    setStatusActionError('');
    setIsStatusActionOpen(true);
  }

  async function handleStatusAction() {
    if (!actor) {
      setStatusActionError('Sesi pengguna tidak ditemukan. Silakan login ulang.');
      return;
    }

    setIsProcessingStatusAction(true);
    setStatusActionError('');

    if (!statusActionCatatan.trim()) {
      setStatusActionError('Catatan atau alasan wajib diisi.');
      setIsProcessingStatusAction(false);
      return;
    }

    try {
      if (statusActionType === 'berhenti') {
        await setSiswaBerhenti(actor, siswa.id, { penangananTagihan, catatan: statusActionCatatan.trim() });
      } else if (statusActionType === 'batal_daftar') {
        await setSiswaTidakJadiMasuk(actor, siswa.id, { penangananTagihan, catatan: statusActionCatatan.trim() });
      } else if (statusActionType === 'cuti') {
        await setSiswaCuti(actor, siswa.id, { penangananTagihan });
      }
      setIsStatusActionOpen(false);
    } catch (error) {
      setStatusActionError(error instanceof ServiceError ? error.message : 'Gagal memproses perubahan status siswa.');
    } finally {
      setIsProcessingStatusAction(false);
    }
  }

  function openManualPlacement() {
    setManualKelasId(activeAssignment?.kelas?.id ?? '');
    setPlacementNote('');
    setPlacementError('');
    setIsPlacementOpen(true);
  }

  function openActivateFromCuti() {
    setManualKelasId('');
    setPlacementError('');
    setIsActivateFromCutiOpen(true);
  }

  async function handleManualPlacement() {
    if (!actor) {
      setPlacementError('Sesi pengguna tidak ditemukan. Silakan login ulang.');
      return;
    }
    if (!manualKelasId) {
      setPlacementError('Pilih kelas tujuan terlebih dahulu.');
      return;
    }

    setIsSubmittingPlacement(true);
    setPlacementError('');

    try {
      if (isActivateFromCutiOpen) {
        await setSiswaAktifDariCuti(actor, siswa.id, manualKelasId);
        setIsActivateFromCutiOpen(false);
      } else {
        await aturKelasSiswaManual(actor, siswa.id, {
          kelas_id: manualKelasId,
          alasan_override: placementNote,
        });
        setIsPlacementOpen(false);
      }
    } catch (error) {
      setPlacementError(error instanceof ServiceError ? error.message : 'Gagal mengatur kelas siswa secara manual.');
    } finally {
      setIsSubmittingPlacement(false);
    }
  }

  const statusActionTitle = statusActionType === 'berhenti' ? 'Konfirmasi siswa berhenti' : statusActionType === 'cuti' ? 'Konfirmasi Set Cuti' : 'Konfirmasi siswa tidak jadi masuk';
  const statusActionDescription = statusActionType === 'berhenti'
    ? 'Tutup kelas aktif siswa dan tentukan perlakuan untuk setiap tagihan yang masih tersisa.'
    : statusActionType === 'cuti'
    ? 'Ubah status siswa menjadi cuti, tutup kelas aktif, dan tentukan perlakuan untuk setiap tagihan yang masih tersisa.'
    : 'Tandai siswa calon yang batal masuk sebagai berhenti dan tentukan perlakuan untuk tagihan yang sudah terlanjur dibuat.';
  const statusActionButtonLabel = statusActionType === 'berhenti' ? 'Konfirmasi Berhenti' : statusActionType === 'cuti' ? 'Konfirmasi Cuti' : 'Konfirmasi Tidak Jadi Masuk';
  const statusActionEmptyDescription = statusActionType === 'berhenti'
    ? 'Siswa ini tidak memiliki tagihan tersisa. Status akan langsung diubah menjadi berhenti dan riwayat kelas aktif akan ditutup.'
    : statusActionType === 'cuti'
    ? 'Siswa ini tidak memiliki tagihan tersisa. Status akan langsung diubah menjadi cuti dan riwayat kelas aktif akan ditutup.'
    : 'Siswa ini tidak memiliki tagihan tersisa. Status akan langsung diubah menjadi berhenti karena calon tidak jadi masuk.';

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Detail Siswa"
        description="Pantau profil siswa, tagihan yang berjalan, riwayat pembayaran, dan hasil penempatan kelas siswa."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/siswa')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </button>
            <button
              type="button"
              onClick={() => navigate(`/siswa/${siswa.id}/edit`)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500"
            >
              <Pencil className="h-4 w-4" />
              Edit Profil
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <MoreVertical className="h-4 w-4" />
                Aksi Lainnya
              </button>
              
              {isActionMenuOpen && (
                <div 
                  className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-slate-100 bg-white shadow-lg shadow-slate-200/50 focus:outline-none z-10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/50"
                  onMouseLeave={() => setIsActionMenuOpen(false)}
                >
                  <div className="p-2 space-y-1">
                    {canAturKelasManual && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsActionMenuOpen(false);
                          openManualPlacement();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-brand-600 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-brand-400"
                      >
                        <UserRound className="h-4 w-4" />
                        Atur Kelas Manual
                      </button>
                    )}
                    {siswa.status === 'aktif' && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsActionMenuOpen(false);
                          openStatusDialog('cuti');
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                      >
                        <FileClock className="h-4 w-4" />
                        Set Cuti
                      </button>
                    )}
                    {siswa.status === 'cuti' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setIsActionMenuOpen(false);
                            openActivateFromCuti();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-success-50 hover:text-success-600 dark:text-slate-300 dark:hover:bg-success-900/30 dark:hover:text-success-400"
                        >
                          <UserRound className="h-4 w-4" />
                          Aktifkan dari Cuti
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsActionMenuOpen(false);
                            openStatusDialog('berhenti');
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/30"
                        >
                          <FileClock className="h-4 w-4" />
                          Set Berhenti
                        </button>
                      </>
                    )}
                    {(canSetBerhenti || canBatalkanMasuk) && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsActionMenuOpen(false);
                          if (canSetBerhenti) openStatusDialog('berhenti');
                          else if (canBatalkanMasuk) openStatusDialog('batal_daftar');
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-950/30"
                      >
                        <FileClock className="h-4 w-4" />
                        {canSetBerhenti ? 'Set Berhenti' : 'Tidak Jadi Masuk'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        }
      />

      {isPlacementOpen ? (
        <SectionCard title="Atur kelas manual" description="Gunakan override manual jika hasil penempatan otomatis perlu disesuaikan, termasuk untuk pertimbangan kecerdasan khusus.">
          <div className="space-y-4">
            {placementError ? (
              <div className="rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400">
                {placementError}
              </div>
            ) : null}
            <FormField label="Kelas tujuan" htmlFor="manual_kelas_id">
              <select
                id="manual_kelas_id"
                value={manualKelasId}
                onChange={(event) => setManualKelasId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              >
                <option value="">Pilih kelas tujuan</option>
                {kelasOptions
                  .filter((item) => item.tahun_ajaran_id === tahunAjaranTarget?.id || item.tahun_ajaran_id === activeAssignment?.kelas?.tahun_ajaran_id)
                  .map((kelas) => (
                    <option key={kelas.id} value={kelas.id}>
                      {formatKelasLabel(kelas)}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField label="Alasan override" htmlFor="placement_note">
              <textarea
                id="placement_note"
                rows={4}
                value={placementNote}
                onChange={(event) => setPlacementNote(event.target.value)}
                placeholder="Contoh: kecerdasan khusus, kesiapan akademik, pertimbangan sekolah"
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </FormField>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleManualPlacement}
                disabled={isSubmittingPlacement}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingPlacement ? 'Menyimpan...' : 'Simpan Penempatan'}
              </button>
              <button
                type="button"
                onClick={() => setIsPlacementOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Batal
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {isActivateFromCutiOpen ? (
        <SectionCard title="Aktifkan Siswa dari Cuti" description="Pilih kelas baru tempat siswa akan ditempatkan saat aktif kembali.">
          <div className="space-y-4">
            {placementError ? (
              <div className="rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400">
                {placementError}
              </div>
            ) : null}
            <FormField label="Kelas tujuan" htmlFor="activate_kelas_id">
              <select
                id="activate_kelas_id"
                value={manualKelasId}
                onChange={(event) => setManualKelasId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              >
                <option value="">Pilih kelas tujuan</option>
                {kelasOptions
                  .filter((item) => item.tahun_ajaran_id === activeAssignment?.kelas?.tahun_ajaran_id || !activeAssignment)
                  .map((kelas) => (
                    <option key={kelas.id} value={kelas.id}>
                      {formatKelasLabel(kelas)}
                    </option>
                  ))}
              </select>
            </FormField>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleManualPlacement}
                disabled={isSubmittingPlacement}
                className="inline-flex items-center gap-2 rounded-xl bg-success-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-success-600/20 transition-all hover:bg-success-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmittingPlacement ? 'Menyimpan...' : 'Aktifkan Siswa'}
              </button>
              <button
                type="button"
                onClick={() => setIsActivateFromCutiOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Batal
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}



      {isStatusActionOpen ? (
        <SectionCard title={statusActionTitle} description={statusActionDescription}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/40">
              <p><span className="font-semibold">Siswa:</span> {siswa.nama}</p>
              <p><span className="font-semibold">Kelas aktif:</span> {formatKelasLabel(activeAssignment?.kelas)}</p>
            </div>

            {statusActionError ? (
              <div className="rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400">
                {statusActionError}
              </div>
            ) : null}

            {openBills.length === 0 ? (
              <EmptyState title="Tidak ada tagihan terbuka" description={statusActionEmptyDescription} />
            ) : (
              <div className="space-y-3">
                {openBills.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">{item.nama_tagihan}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sisa tagihan: {formatRupiah(Math.max(0, item.jumlah_total - item.sudah_dibayar))}</p>
                      </div>
                      <select
                        value={penangananTagihan[item.id] ?? 'biarkan'}
                        onChange={(event) => setPenangananTagihan((current) => ({ ...current, [item.id]: event.target.value as PenangananTagihanBerhenti }))}
                        className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 md:max-w-xs dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                      >
                        <option value="biarkan">Biarkan sebagai piutang</option>
                        <option value="tandai_lunas">Tandai lunas</option>
                        <option value="hapus_tagihan">Batalkan tagihan</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <FormField label="Catatan / Alasan" htmlFor="status_action_catatan">
              <textarea
                id="status_action_catatan"
                rows={3}
                value={statusActionCatatan}
                onChange={(event) => setStatusActionCatatan(event.target.value)}
                placeholder="Masukkan alasan pemberhentian/batal daftar/cuti (wajib diisi)"
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              />
            </FormField>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleStatusAction}
                disabled={isProcessingStatusAction}
                className="inline-flex items-center gap-2 rounded-xl bg-danger-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-danger-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessingStatusAction ? 'Memproses...' : statusActionButtonLabel}
              </button>
              <button
                type="button"
                onClick={() => setIsStatusActionOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Batal
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard>
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-18 w-18 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-indigo-600 text-xl font-black text-white shadow-lg shadow-brand-600/20">
              {siswa.nama.slice(0, 2).toUpperCase()}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">{siswa.nama}</h2>
                <StatusBadgeSiswa status={siswa.status} />
                {siswa.flag_diskon_spp ? (
                  <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">
                    Tarif Khusus: {formatRupiah(siswa.nominal_diskon_spp || 0)}
                  </span>
                ) : null}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Kelas aktif: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatKelasLabel(activeAssignment?.kelas)}</span>
              </div>
              {siswa.status === 'calon' || siswa.status === 'batal_daftar' ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Tahun ajaran target: <span className="font-semibold text-slate-700 dark:text-slate-300">{tahunAjaranTarget?.nama ?? '-'}</span>
                </div>
              ) : (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Tahun ajaran masuk: <span className="font-semibold text-slate-700 dark:text-slate-300">{tahunAjaranTarget?.nama ?? '-'}</span>
                </div>
              )}
              {siswa.status === 'lulus' ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Tahun lulus: <span className="font-semibold text-slate-700 dark:text-slate-300">{riwayatKelas[0]?.tahun_ajaran?.nama ?? '-'}</span>
                </div>
              ) : null}
              {siswa.status === 'berhenti' ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  Tahun berhenti: <span className="font-semibold text-slate-700 dark:text-slate-300">{riwayatKelas[0]?.tahun_ajaran?.nama ?? '-'}</span>
                </div>
              ) : null}
            </div>
          </div>

          {statusLog && (
            <div className="w-full md:w-auto rounded-2xl border border-warning-200 bg-warning-50/80 p-4 dark:border-warning-900/40 dark:bg-warning-900/20">
              <p className="text-xs font-bold uppercase tracking-wide text-warning-600 dark:text-warning-500">Catatan {siswa.status === 'batal_daftar' ? 'Batal Daftar' : siswa.status === 'cuti' ? 'Cuti' : 'Pemberhentian'}</p>
              <p className="mt-1 text-sm font-medium text-warning-800 dark:text-warning-300">{statusLog.payload?.catatan || '-'}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:mt-0 mt-4">
            <InfoRow label="Nama wali" value={siswa.nama_wali} />
            <InfoRow label="Kontak wali" value={siswa.kontak_wali} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Profil siswa" description="Data identitas, wali, jalur registrasi, dan riwayat penempatan kelas siswa.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoRow label="Nama lengkap" value={siswa.nama} />
          <InfoRow label="Jenis kelamin" value={siswa.jenis_kelamin === 'L' ? 'Laki-laki' : siswa.jenis_kelamin === 'P' ? 'Perempuan' : '-'} />
          <InfoRow label="Tanggal lahir" value={siswa.tanggal_lahir ? formatTanggal(siswa.tanggal_lahir) : '-'} />
          <InfoRow label="No. Pendaftaran" value={siswa.no_pendaftaran || '-'} />
          <InfoRow label="NIS" value={siswa.nis || '-'} />
          <InfoRow label="Tanggal daftar" value={siswa.tanggal_daftar ? formatTanggal(siswa.tanggal_daftar) : '-'} />
          <InfoRow label="Jenis masuk" value={siswa.jenis_masuk === 'awal_tahun' ? 'Awal Tahun' : 'Pindahan'} />
          <InfoRow label="Jalur registrasi" value={capitalizeWords(siswa.jalur_registrasi.replace('_', ' '))} />
          <InfoRow label="Sumber data" value={capitalizeWords(siswa.sumber_data.replace('_', ' '))} />
          <InfoRow label="Nama wali" value={siswa.nama_wali} />
          <InfoRow label="Hubungan wali" value={siswa.hubungan_wali ? capitalizeWords(siswa.hubungan_wali) : '-'} />
          <InfoRow label="Kontak wali" value={siswa.kontak_wali} />
          <InfoRow label="Email wali" value={siswa.email_wali || '-'} />
        </div>

        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Alamat</p>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{siswa.alamat || '-'}</p>
        </div>

        <div className="mt-6 space-y-3">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Informasi Tambahan (Promo & Tarif)</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoRow label="Tarif SPP Khusus" value={siswa.flag_diskon_spp ? formatRupiah(siswa.nominal_diskon_spp || 0) : 'Tidak ada (Menggunakan tarif kelas)'} />
            <InfoRow label="Daftar Promo Aktif" value={activePromos.length > 0 ? activePromos.map(p => p.nama).join(', ') : 'Tidak ada promo yang melekat'} />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Riwayat kelas</h3>
          {riwayatKelas.length === 0 ? (
            <EmptyState title="Belum ada riwayat kelas" description="Siswa ini belum memiliki data penempatan kelas di penyimpanan lokal." />
          ) : (
            <div className="space-y-3">
              {riwayatKelas.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-100 bg-white/60 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-100">{item.kelas ? formatKelasLabel(item.kelas) : 'Kelas tidak ditemukan'}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatTanggal(item.mulai)} - {item.selesai ? formatTanggal(item.selesai) : 'Sekarang'}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Penempatan: {item.penempatan_sumber ? capitalizeWords(item.penempatan_sumber) : '-'}</p>
                      {item.catatan_penempatan ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Catatan: {item.catatan_penempatan}</p> : null}
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${!item.selesai ? 'bg-success-50 text-success-700 dark:bg-success-950/30 dark:text-success-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {!item.selesai ? 'Aktif' : 'Riwayat'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

function capitalizeWords(value: string) {
  return value.split(' ').map((item) => item.charAt(0).toUpperCase() + item.slice(1)).join(' ');
}

function BackToListEmptyState({ title, description }: { title: string; description: string }) {
  const navigate = useNavigate();
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <button
          type="button"
          onClick={() => navigate('/siswa')}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:from-brand-500 hover:to-indigo-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Daftar Siswa
        </button>
      }
    />
  );
}


