import { useMemo, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Save, Trash2, AlertTriangle } from 'lucide-react';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { SummaryGroupCard, SummaryGroupGrid, SummaryGroupRow } from '../components/ui/SummaryGroup';
import { db } from '../db';
import { getCurrentActor } from '../lib/actor';
import { formatRupiah, formatKelasLabel } from '../lib/format';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { getActivationPreview, type ActivationDecision } from '../services/aktivasiTahunAjaranService';
import { prosesNaikKelas, validateDaftarUlangForPromotedStudents, validatePendaftaranForCalonStudents, validateAllTagihanGenerated, checkLulusTunggakan } from '../services/naikKelasService';
import { checkAdministrasiMasalah } from '../services/administrasiCheckService';
import { ServiceError } from '../services/service-errors';
import { useAuthStore } from '../store/authStore';
import { useConfirmStore } from '../store/confirmStore';
import { useToastStore } from '../store/toastStore';

type StepId = 'pilih' | 'cek_administrasi' | 'mapping' | 'review' | 'preview' | 'confirm';

type CaseType = 'lanjut' | 'aktivasi';

interface StepDef {
  id: StepId;
  label: string;
  description: string;
}

export default function ProsesNaikKelasPage() {
  const user = useAuthStore((state) => state.user);
  const actor = getCurrentActor(user);
  const years = useLiveQuery(() => listTahunAjaran(), [], []);
  const classes = useLiveQuery(() => db.kelas.toArray(), [], []);
  const students = useLiveQuery(() => db.siswa.toArray(), [], []);
  const assignments = useLiveQuery(() => db.siswa_kelas.toArray(), [], []);

  const activeYear = years.find((item) => item.aktif || item.status === 'aktif') ?? null;
  const caseType: CaseType = activeYear ? 'lanjut' : 'aktivasi';

  const steps: StepDef[] = caseType === 'lanjut'
    ? [
        { id: 'pilih', label: 'Pilih TA', description: 'Pilih tahun ajaran tujuan' },
        { id: 'mapping', label: 'Mapping Kelas', description: 'Petakan kelas asal ke tujuan' },
        { id: 'cek_administrasi', label: 'Cek Administrasi', description: 'Cek tunggakan daftar ulang/pendaftaran/SPP per kategori' },
        { id: 'review', label: 'Placement & Review', description: 'Periksa & atur kelas siswa' },
        { id: 'confirm', label: 'Konfirmasi', description: 'Cek lalu lanjutkan' },
      ]
    : [
        { id: 'pilih', label: 'Pilih TA', description: 'Pilih tahun ajaran draft' },
        { id: 'cek_administrasi', label: 'Cek Administrasi', description: 'Cek tunggakan pendaftaran/SPP' },
        { id: 'preview', label: 'Placement & Review', description: 'Verifikasi siswa & atur kelas' },
        { id: 'confirm', label: 'Konfirmasi', description: 'Cek lalu aktivasi' },
      ];

  const [stepIndex, setStepIndex] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [targetYearId, setTargetYearId] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  
  // States untuk fitur baru
  const [allowedArrearsIds, setAllowedArrearsIds] = useState<Record<string, boolean>>({});
  const [kelasOverrideMap, setKelasOverrideMap] = useState<Record<string, string>>({});
  
  const [toggleBawaTarif, setToggleBawaTarif] = useState(true);
  const [hapusPromoIds, setHapusPromoIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminPage, setAdminPage] = useState(1);
  const [adminPageSize, setAdminPageSize] = useState(25);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(25);
  const [searchParams] = useSearchParams();
  const urlTahunAjaranId = searchParams.get('tahunAjaranId');
  const addToast = useToastStore((state) => state.addToast);
  const requestConfirm = useConfirmStore((state) => state.requestConfirm);

  // Pre-check SPP completeness
  const [sppPrecheckDone, setSppPrecheckDone] = useState(false);
  const [sppPrecheckLoading, setSppPrecheckLoading] = useState(false);
  const [sppPrecheckError, setSppPrecheckError] = useState<string | null>(null);

  // Expanded Cek Administrasi states
  const [missingDaftarUlangData, setMissingDaftarUlangData] = useState<any[]>([]);
  const [allowedMissingDaftarUlangIds, setAllowedMissingDaftarUlangIds] = useState<Record<string, boolean>>({});
  const [missingPendaftaranData, setMissingPendaftaranData] = useState<any[]>([]);
  const [allowedMissingPendaftaranIds, setAllowedMissingPendaftaranIds] = useState<Record<string, boolean>>({});
  const [lulusTunggakanData, setLulusTunggakanData] = useState<Record<string, number>>({});
  const [allowedLulusTunggakanIds, setAllowedLulusTunggakanIds] = useState<Record<string, boolean>>({});
  const [cekAdminTab, setCekAdminTab] = useState<'naik' | 'lulus' | 'calon'>('naik');

  useEffect(() => {
    if (urlTahunAjaranId && !targetYearId) {
      setTargetYearId(urlTahunAjaranId);
      setMaxStepReached(1);
      setStepIndex(1);
    }
  }, []);

  const currentStep = steps[stepIndex];
  const isCaseB = caseType === 'aktivasi';

  const availableTargetYears = years.filter((item) => (item.status ?? (item.aktif ? 'aktif' : 'draft')) === 'draft');
  const currentYearClasses = classes.filter((item) => !item.deleted_at && item.tahun_ajaran_id === activeYear?.id);
  const targetYearClasses = classes.filter((item) => !item.deleted_at && item.tahun_ajaran_id === targetYearId);

  const activeAssignments = assignments.filter((item) => !item.selesai && item.kelas_id !== undefined);
  const siswaMap = new Map(students.filter((item) => !item.deleted_at).map((item) => [item.id, item]));

  // Mengambil issue administrasi saat targetYearId berubah
  const rawAdminIssues = useLiveQuery(
    async () => {
      if (!targetYearId) return [];
      return checkAdministrasiMasalah(targetYearId);
    },
    [targetYearId],
    []
  );

  const isAllowedToProceed = (siswaId: string) => {
    const issue = rawAdminIssues?.find(i => i.siswa.id === siswaId);
    if (issue && !allowedArrearsIds[siswaId]) return false;
    if (missingDaftarUlangData.find(i => i.siswaId === siswaId) && !allowedMissingDaftarUlangIds[siswaId]) return false;
    const pendaftaran = missingPendaftaranData.find(i => i.siswaId === siswaId);
    if (pendaftaran && !allowedMissingPendaftaranIds[siswaId]) return false;
    if (lulusTunggakanData[siswaId] !== undefined && lulusTunggakanData[siswaId] > 0 && !allowedLulusTunggakanIds[siswaId]) return false;
    return true;
  };

  // Mengambil calon siswa yang menuju ke TA ini (dipakai di case Lanjut maupun Aktivasi)
  const calonSiswaPreview = useLiveQuery(
    async () => {
      if (!targetYearId) return null;
      return getActivationPreview(targetYearId);
    },
    [targetYearId],
    null
  );

  const cutiStudents = useMemo(() => {
    if (isCaseB) return [];
    return students.filter((item) => !item.deleted_at && item.status === 'cuti');
  }, [students, isCaseB]);

  // Case A: siswa per kelas asal (untuk siswa aktif saat ini)
  const studentsByClass = useMemo(() => {
    if (isCaseB) return [];
    return currentYearClasses.map((kelas) => ({
      kelas,
      siswa: activeAssignments
        .filter((assignment) => assignment.kelas_id === kelas.id)
        .map((assignment) => siswaMap.get(assignment.siswa_id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    }));
  }, [activeAssignments, currentYearClasses, siswaMap, isCaseB]);

  const summary = useMemo(() => {
    let naik = 0;
    let lulus = 0;
    let batal = 0;
    let blocked = 0;
    if (!isCaseB) {
      for (const group of studentsByClass) {
        for (const siswa of group.siswa) {
          if (!isAllowedToProceed(siswa.id)) {
            blocked++;
            continue;
          }
          const mappedId = mapping[group.kelas.id];
          const currentVal = kelasOverrideMap[siswa.id] !== undefined ? kelasOverrideMap[siswa.id] : mappedId || '';
          if (currentVal) naik++;
          else lulus++;
        }
      }

      for (const siswa of cutiStudents) {
        if (!isAllowedToProceed(siswa.id)) {
          blocked++;
          continue;
        }
        const currentVal = kelasOverrideMap[siswa.id] !== undefined ? kelasOverrideMap[siswa.id] : '_cuti';
        if (currentVal === '_cuti') {
          // Tetap cuti, tidak dihitung naik/lulus/batal (atau mau dihitung khusus? kita abaikan di summary atau tambah field 'tetap_cuti')
        } else if (currentVal) {
          naik++;
        } else {
          batal++; // Berhenti
        }
      }
    }

    if (calonSiswaPreview) {
      for (const item of calonSiswaPreview.items) {
        if (!isAllowedToProceed(item.siswa.id)) {
          blocked++;
          continue;
        }
        if (isCaseB && item.siswa.status === 'aktif') {
          // Dalam kasus Aktivasi TA, jika aktif dan allowed
          const currentVal = kelasOverrideMap[item.siswa.id] !== undefined ? kelasOverrideMap[item.siswa.id] : item.kelasRencana?.id || '';
          if (currentVal) naik++;
          else lulus++;
        } else {
          // Calon siswa
          const currentVal = kelasOverrideMap[item.siswa.id] !== undefined ? kelasOverrideMap[item.siswa.id] : item.kelasRencana?.id || '';
          if (currentVal) naik++;
          else batal++;
        }
      }
    }

    return { naik, lulus, batal, blocked };
  }, [studentsByClass, mapping, kelasOverrideMap, calonSiswaPreview, isCaseB, allowedArrearsIds, rawAdminIssues]);

  const candidateNaikIdsRaw = useMemo(() => {
    if (isCaseB) return new Set<string>();
    const ids = new Set<string>();
    for (const group of studentsByClass) {
      for (const siswa of group.siswa) {
        const mappedId = mapping[group.kelas.id];
        const currentVal = kelasOverrideMap[siswa.id] !== undefined ? kelasOverrideMap[siswa.id] : mappedId || '';
        if (currentVal) ids.add(siswa.id);
      }
    }
    if (calonSiswaPreview) {
      for (const item of calonSiswaPreview.items) {
        if (item.siswa.status !== 'calon') continue;
        const currentVal = kelasOverrideMap[item.siswa.id] !== undefined ? kelasOverrideMap[item.siswa.id] : item.kelasRencana?.id || '';
        if (currentVal) ids.add(item.siswa.id);
      }
    }
    return ids;
  }, [studentsByClass, mapping, kelasOverrideMap, calonSiswaPreview, isCaseB]);

  function getCandidateLulusIds() {
    if (isCaseB) return new Set<string>();
    const naikIds = candidateNaikIdsRaw;
    const ids = new Set<string>();
    for (const group of studentsByClass) {
      for (const siswa of group.siswa) {
        if (!naikIds.has(siswa.id)) ids.add(siswa.id);
      }
    }
    return ids;
  }

  // Pre-check SPP completeness when entering wizard (targetYearId selected)
  useEffect(() => {
    if (!targetYearId) return;
    if (sppPrecheckDone) return;
    if (!activeYear) return;

    setSppPrecheckLoading(true);
    setSppPrecheckError(null);
    (async () => {
      try {
        const result = await validateAllTagihanGenerated(activeYear.id);
        if (!result.lengkap) {
          setSppPrecheckError(result.message);
        }
      } catch (error) {
        setSppPrecheckError('Gagal memeriksa kelengkapan SPP. Silakan coba lagi.');
      } finally {
        setSppPrecheckLoading(false);
        setSppPrecheckDone(true);
      }
    })();
  }, [targetYearId, activeYear]);

  // Cek daftar ulang untuk siswa naik
  useEffect(() => {
    if (!targetYearId || isCaseB) return;
    if (candidateNaikIdsRaw.size === 0) return;
    (async () => {
      const decisions = [...candidateNaikIdsRaw].map(siswaId => ({ siswaId, action: 'naik' as const }));
      const result = await validateDaftarUlangForPromotedStudents(targetYearId, decisions);
      setMissingDaftarUlangData(result.missing.map(m => ({
        siswaId: m.siswaId,
        masalah: 'Tagihan daftar ulang belum tersedia',
        nominalTunggakan: 0,
      })));
    })();
  }, [candidateNaikIdsRaw, targetYearId, isCaseB]);

  // Cek pendaftaran untuk calon siswa
  useEffect(() => {
    if (!targetYearId || isCaseB) return;
    if (!calonSiswaPreview) return;
    const calonIds = calonSiswaPreview.items.filter(i => i.siswa.status === 'calon').map(i => i.siswa.id);
    if (calonIds.length === 0) return;
    (async () => {
      const result = await validatePendaftaranForCalonStudents(targetYearId);
      const filtered = result.filter(r => calonIds.includes(r.siswaId));
      setMissingPendaftaranData(filtered.map(r => ({
        siswaId: r.siswaId,
        masalah: r.masalah === 'missing' ? 'Tagihan pendaftaran belum tersedia' : 'Pendaftaran belum lunas',
        nominalTunggakan: 0,
      })));
    })();
  }, [calonSiswaPreview, targetYearId, isCaseB]);

  // Cek tunggakan untuk siswa lulus
  useEffect(() => {
    if (!targetYearId || isCaseB) return;
    const lulusIds = [...getCandidateLulusIds()];
    if (lulusIds.length === 0) return;
    (async () => {
      const result = await checkLulusTunggakan(lulusIds);
      const record: Record<string, number> = {};
      for (const r of result) {
        record[r.siswaId] = r.totalTunggakan;
      }
      setLulusTunggakanData(record);
    })();
  }, [targetYearId, isCaseB, candidateNaikIdsRaw, studentsByClass]);

  // Helper
  function toggleHapusPromo(siswaId: string) {
    setHapusPromoIds((prev) =>
      prev.includes(siswaId) ? prev.filter((id) => id !== siswaId) : [...prev, siswaId],
    );
  }

  function handleOverrideKelas(siswaId: string, value: string) {
    setKelasOverrideMap((prev) => ({ ...prev, [siswaId]: value }));
  }

  function goNext() {
    if (currentStep.id === 'pilih' && !isCaseB && sppPrecheckError) {
      addToast({ type: 'error', title: 'Pre-check Gagal', message: sppPrecheckError });
      return;
    }
    if (currentStep.id === 'pilih' && !isCaseB) {
      setCekAdminTab('naik');
    }
    const next = Math.min(stepIndex + 1, steps.length - 1);
    setMaxStepReached((m) => Math.max(m, next));
    setStepIndex(next);
  }

  function goBack() {
    setStepIndex((c) => Math.max(c - 1, 0));
  }

  function goToStep(index: number) {
    if (index > maxStepReached && index > stepIndex + 1) return;
    setMaxStepReached((m) => Math.max(m, index));
    setStepIndex(index);
  }

  async function handleSubmit() {
    if (!actor) {
      addToast({ type: 'error', title: 'Gagal', message: 'Sesi pengguna tidak ditemukan.' });
      return;
    }

    if (isCaseB) {
      // Aktivasi
      const targetYearName = years.find((item) => item.id === targetYearId)?.nama ?? '-';
      requestConfirm({
        title: 'Aktivasi Tahun Ajaran?',
        description: `Aktivasi "${targetYearName}" akan mengaktifkan tahun ajaran dan menempatkan siswa eligible. Lanjutkan?`,
        confirmLabel: 'Ya, Aktivasi',
        onConfirm: async () => {
          setIsSubmitting(true);
          try {
            const decisions: ActivationDecision[] = [];
            for (const item of calonSiswaPreview?.items ?? []) {
              if (!isAllowedToProceed(item.siswa.id)) {
                decisions.push({
                  siswaId: item.siswa.id,
                  action: item.siswa.status === 'aktif' ? 'berhenti' : 'batal_daftar',
                  hapusPromo: false,
                });
                continue;
              }
              decisions.push({
                siswaId: item.siswa.id,
                kelasOverrideId: kelasOverrideMap[item.siswa.id] !== undefined ? kelasOverrideMap[item.siswa.id] : item.kelasRencana?.id || null,
                hapusPromo: hapusPromoIds.includes(item.siswa.id),
              });
            }
            const { executeActivation } = await import('../services/aktivasiTahunAjaranService');
            await executeActivation(actor, targetYearId, toggleBawaTarif, decisions);
            addToast({ type: 'success', title: 'Berhasil', message: `Tahun ajaran ${targetYearName} berhasil diaktivasi.` });
            setStepIndex(0);
            setTargetYearId('');
            setKelasOverrideMap({});
            setHapusPromoIds([]);
            setAllowedArrearsIds({});
          } catch (error) {
            addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal aktivasi tahun ajaran.' });
          } finally {
            setIsSubmitting(false);
          }
        },
      });
    } else {
      // Lanjut TA
      requestConfirm({
        title: 'Lanjutkan Tahun Ajaran?',
        description: `Proses penempatan ke tahun ajaran ${years.find((item) => item.id === targetYearId)?.nama ?? '-'} akan dijalankan. Lanjutkan?`,
        confirmLabel: 'Ya, Lanjutkan',
        onConfirm: async () => {
          setIsSubmitting(true);
          try {
            const decisions: Array<{ siswaId: string, kelasTujuanId: string | null, action: 'naik' | 'lulus' | 'berhenti' | 'batal_daftar' | 'tetap_cuti' }> = [];
            
            // 1. Siswa Lama
            for (const group of studentsByClass) {
              for (const siswa of group.siswa) {
                if (!isAllowedToProceed(siswa.id)) {
                  decisions.push({ siswaId: siswa.id, kelasTujuanId: null, action: 'berhenti' });
                  continue;
                }
                const mappedId = mapping[group.kelas.id] || null;
                const overridenId = kelasOverrideMap[siswa.id] !== undefined ? kelasOverrideMap[siswa.id] : mappedId;
                
                if (overridenId) {
                  decisions.push({ siswaId: siswa.id, kelasTujuanId: overridenId, action: 'naik' });
                } else {
                  decisions.push({ siswaId: siswa.id, kelasTujuanId: null, action: 'lulus' });
                }
              }
            }

            // 1b. Siswa Cuti
            for (const siswa of cutiStudents) {
              if (!isAllowedToProceed(siswa.id)) {
                decisions.push({ siswaId: siswa.id, kelasTujuanId: null, action: 'berhenti' });
                continue;
              }
              const overridenId = kelasOverrideMap[siswa.id] !== undefined ? kelasOverrideMap[siswa.id] : '_cuti';
              if (overridenId === '_cuti') {
                decisions.push({ siswaId: siswa.id, kelasTujuanId: null, action: 'tetap_cuti' });
              } else if (overridenId) {
                decisions.push({ siswaId: siswa.id, kelasTujuanId: overridenId, action: 'naik' });
              } else {
                decisions.push({ siswaId: siswa.id, kelasTujuanId: null, action: 'berhenti' });
              }
            }

            // 2. Calon Siswa
            if (calonSiswaPreview) {
              for (const item of calonSiswaPreview.items) {
                if (item.siswa.status !== 'calon') continue; // Pastikan hanya calon siswa yang diproses di bagian ini
                if (!isAllowedToProceed(item.siswa.id)) {
                  decisions.push({ siswaId: item.siswa.id, kelasTujuanId: null, action: 'batal_daftar' });
                  continue;
                }
                const overridenId = kelasOverrideMap[item.siswa.id] !== undefined ? kelasOverrideMap[item.siswa.id] : item.kelasRencana?.id || null;
                if (overridenId) {
                  decisions.push({ siswaId: item.siswa.id, kelasTujuanId: overridenId, action: 'naik' });
                } else {
                  decisions.push({ siswaId: item.siswa.id, kelasTujuanId: null, action: 'batal_daftar' });
                }
              }
            }

            await prosesNaikKelas(actor, {
              tahunAjaranTujuanId: targetYearId,
              decisions,
              toggleBawaTarif,
              hapusPromoSiswaIds: hapusPromoIds,
            });
            addToast({ type: 'success', title: 'Berhasil', message: 'Lanjut Tahun Ajaran berhasil dijalankan.' });
            setStepIndex(0);
            setTargetYearId('');
            setMapping({});
            setKelasOverrideMap({});
            setHapusPromoIds([]);
            setAllowedArrearsIds({});
          } catch (error) {
            addToast({ type: 'error', title: 'Gagal', message: error instanceof ServiceError ? error.message : 'Gagal menjalankan Lanjut Tahun Ajaran.' });
          } finally {
            setIsSubmitting(false);
          }
        },
      });
    }
  }

  // ===================== Step 1: Pilih TA =====================
  function renderPilih() {
    return (
      <div className="space-y-5">
        <FormField label="Tahun ajaran tujuan" htmlFor="tahun_tujuan">
          <select
            id="tahun_tujuan"
            value={targetYearId}
            onChange={(event) => {
              setTargetYearId(event.target.value);
              setSppPrecheckDone(false);
              setSppPrecheckError(null);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
          >
            <option value="">Pilih tahun ajaran</option>
            {availableTargetYears.map((item) => (
              <option key={item.id} value={item.id}>{item.nama}</option>
            ))}
          </select>
        </FormField>
        {isCaseB && targetYearId && (
          <div className="rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-brand-700 dark:border-brand-950/40 dark:bg-brand-950/20 dark:text-brand-300">
            Tidak ada tahun ajaran aktif saat ini. Tahun ajaran yang dipilih akan langsung diaktivasi.
          </div>
        )}
        {!isCaseB && targetYearId && sppPrecheckLoading && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
            Memeriksa kelengkapan tagihan SPP tahun ajaran berjalan...
          </div>
        )}
        {!isCaseB && targetYearId && sppPrecheckError && (
          <div className="flex items-start gap-3 rounded-2xl border border-danger-100 bg-danger-50/70 px-4 py-3 text-sm text-danger-700 dark:border-danger-950/40 dark:bg-danger-950/20 dark:text-danger-400">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Tagihan SPP Belum Lengkap</p>
              <p className="mt-1">{sppPrecheckError}</p>
              <p className="mt-2 text-xs text-danger-500">Silakan generate SPP massal terlebih dahulu sebelum lanjut ke Mapping Kelas.</p>
            </div>
          </div>
        )}
        {!isCaseB && targetYearId && sppPrecheckDone && !sppPrecheckError && (
          <div className="flex items-center gap-2 rounded-2xl border border-success-100 bg-success-50/70 px-4 py-3 text-sm text-success-700 dark:border-success-950/40 dark:bg-success-950/20 dark:text-success-400">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>Semua tagihan SPP tahun ajaran berjalan sudah lengkap.</span>
          </div>
        )}
      </div>
    );
  }

  // ===================== Step 3: Cek Administrasi =====================
  function renderCekAdministrasi() {
    const naikSiswaIds = candidateNaikIdsRaw;
    const lulusSiswaIds = getCandidateLulusIds();
    const calonItems = calonSiswaPreview?.items.filter(i => i.siswa.status === 'calon') ?? [];

    // Merge data sources per group
    const naikIssues = rawAdminIssues?.filter(i => naikSiswaIds.has(i.siswa.id)) ?? [];
    const duNaik = missingDaftarUlangData.filter(i => naikSiswaIds.has(i.siswaId));
    const naikMerged = [...naikIssues.map(i => ({
      id: i.siswa.id,
      nama: i.siswa.nama,
      tunggakan: i.totalTunggakan,
      items: [
        ...(!i.tagihanPendaftaranLunas ? [{ label: 'Pendaftaran belum lunas' }] : []),
        ...(i.tagihanDaftarUlang && !i.tagihanDaftarUlang.lunas ? [{ label: 'Daftar Ulang belum lunas' }] : []),
        ...i.tunggakanLainnya.map(t => ({ label: t.nama })),
      ],
    }))];
    for (const d of duNaik) {
      const existing = naikMerged.find(m => m.id === d.siswaId);
      if (existing) {
        existing.items.push({ label: d.masalah });
        existing.tunggakan = (existing.tunggakan || 0) + (d.nominalTunggakan || 0);
      } else {
        naikMerged.push({
          id: d.siswaId,
          nama: siswaMap.get(d.siswaId)?.nama ?? '-',
          tunggakan: d.nominalTunggakan || 0,
          items: [{ label: d.masalah }],
        });
      }
    }

    const lulusTunggakanArr = Object.entries(lulusTunggakanData)
      .filter(([id]) => lulusSiswaIds.has(id))
      .map(([id, total]) => ({
        id,
        nama: siswaMap.get(id)?.nama ?? '-',
        tunggakan: total,
      }));

    const calonIssues = rawAdminIssues?.filter(i => calonItems.some(c => c.siswa.id === i.siswa.id)) ?? [];
    const calonPendaftaran = missingPendaftaranData.filter(i => calonItems.some(c => c.siswa.id === i.siswaId));
    const calonMerged = [...calonIssues.map(i => ({
      id: i.siswa.id,
      nama: i.siswa.nama,
      tunggakan: i.totalTunggakan,
      items: [
        ...(!i.tagihanPendaftaranLunas ? [{ label: 'Pendaftaran belum lunas' }] : []),
        ...(i.tagihanDaftarUlang && !i.tagihanDaftarUlang.lunas ? [{ label: 'Daftar Ulang belum lunas' }] : []),
        ...i.tunggakanLainnya.map(t => ({ label: t.nama })),
      ],
    }))];
    for (const d of calonPendaftaran) {
      const existing = calonMerged.find(m => m.id === d.siswaId);
      if (existing) {
        existing.items.push({ label: d.masalah + (d.nominalTunggakan ? ` (${formatRupiah(d.nominalTunggakan)})` : '') });
      } else {
        calonMerged.push({
          id: d.siswaId,
          nama: siswaMap.get(d.siswaId)?.nama ?? '-',
          tunggakan: d.nominalTunggakan || 0,
          items: [{ label: d.masalah }],
        });
      }
    }

    const tabs = [
      { id: 'naik' as const, label: 'Naik Kelas', count: naikMerged.length, desc: 'Daftar ulang & tunggakan siswa yang akan naik' },
      { id: 'lulus' as const, label: 'Lulus', count: lulusTunggakanArr.length, desc: 'Peringatan tunggakan siswa yang akan lulus' },
      { id: 'calon' as const, label: 'Calon', count: calonMerged.length, desc: 'Pendaftaran & tunggakan calon siswa baru' },
    ];

    return (
      <div className="space-y-5">
        {/* Tab Navigation */}
        <div className="flex gap-1 rounded-2xl border border-slate-100 bg-white/70 p-1 dark:border-slate-800 dark:bg-slate-900/30">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCekAdminTab(tab.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                cekAdminTab === tab.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                  cekAdminTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Naik Tab */}
        {cekAdminTab === 'naik' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{tabs[0].desc}</p>
            {naikMerged.length === 0 ? (
              <EmptyState title="Semua Aman" description="Tidak ada masalah administrasi untuk siswa yang akan naik kelas." />
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-2xl border border-warning-100 bg-warning-50/70 px-4 py-3 text-sm text-warning-700 dark:border-warning-950/40 dark:bg-warning-950/20 dark:text-warning-400">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <p>
                    Terdapat <strong>{naikMerged.length}</strong> siswa dengan masalah administrasi (daftar ulang belum dibayar, tunggakan SPP, atau lainnya).
                    Jika Anda <strong>TIDAK</strong> mencentang "Izinkan", siswa akan diubah statusnya menjadi <strong>Berhenti</strong>.
                  </p>
                </div>
                <div className="-mx-4 sm:mx-0 overflow-x-auto">
                  <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                        <th className="px-3 py-2 font-semibold">Nama Siswa</th>
                        <th className="px-3 py-2 font-semibold">Masalah Administrasi</th>
                        <th className="px-3 py-2 font-semibold text-right">Total Tunggakan</th>
                        <th className="px-3 py-2 font-semibold text-center">Izinkan Lanjut?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {paginateData(naikMerged, adminPage, adminPageSize).map((item) => (
                        <tr key={item.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                          <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-100">{item.nama}</td>
                          <td className="px-3 py-3">
                            <ul className="list-disc pl-4 text-xs text-danger-600 dark:text-danger-400">
                              {item.items.map((mi, i) => <li key={i}>{mi.label}</li>)}
                            </ul>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                            {formatRupiah(item.tunggakan)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={!!allowedMissingDaftarUlangIds[item.id] || !!allowedArrearsIds[item.id]}
                              onChange={(e) => {
                                setAllowedMissingDaftarUlangIds(prev => ({ ...prev, [item.id]: e.target.checked }));
                                setAllowedArrearsIds(prev => ({ ...prev, [item.id]: e.target.checked }));
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination currentPage={adminPage} totalItems={naikMerged.length} pageSize={adminPageSize} onPageChange={setAdminPage} onPageSizeChange={setAdminPageSize} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Lulus Tab */}
        {cekAdminTab === 'lulus' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{tabs[1].desc}</p>
            {lulusTunggakanArr.length === 0 ? (
              <EmptyState title="Tidak Ada Tunggakan" description="Semua siswa yang akan lulus tidak memiliki tunggakan." />
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-700 dark:border-amber-950/40 dark:bg-amber-950/20 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <p>
                    Terdapat <strong>{lulusTunggakanArr.length}</strong> siswa yang akan lulus namun masih memiliki tunggakan. 
                    Anda dapat mengizinkan mereka tetap lulus (tunggakan tetap tercatat), atau mengubah statusnya menjadi <strong>Berhenti</strong>.
                  </p>
                </div>
                <div className="-mx-4 sm:mx-0 overflow-x-auto">
                  <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                        <th className="px-3 py-2 font-semibold">Nama Siswa</th>
                        <th className="px-3 py-2 font-semibold text-right">Total Tunggakan</th>
                        <th className="px-3 py-2 font-semibold text-center">Tetap Lulus?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {paginateData(lulusTunggakanArr, adminPage, adminPageSize).map((item) => (
                        <tr key={item.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                          <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-100">{item.nama}</td>
                          <td className="px-3 py-3 text-right font-semibold text-danger-600 dark:text-danger-400">
                            {formatRupiah(item.tunggakan)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={!!allowedLulusTunggakanIds[item.id]}
                              onChange={(e) => setAllowedLulusTunggakanIds(prev => ({ ...prev, [item.id]: e.target.checked }))}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination currentPage={adminPage} totalItems={lulusTunggakanArr.length} pageSize={adminPageSize} onPageChange={setAdminPage} onPageSizeChange={setAdminPageSize} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Calon Tab */}
        {cekAdminTab === 'calon' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{tabs[2].desc}</p>
            {calonMerged.length === 0 && calonPendaftaran.length === 0 ? (
              <EmptyState title="Semua Aman" description="Tidak ada masalah administrasi untuk calon siswa baru." />
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-2xl border border-warning-100 bg-warning-50/70 px-4 py-3 text-sm text-warning-700 dark:border-warning-950/40 dark:bg-warning-950/20 dark:text-warning-400">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <p>
                    Terdapat <strong>{calonMerged.length}</strong> calon siswa dengan masalah pendaftaran atau tunggakan.
                    Jika Anda <strong>TIDAK</strong> mencentang "Izinkan", calon siswa akan dibatalkan pendaftarannya.
                  </p>
                </div>
                <div className="-mx-4 sm:mx-0 overflow-x-auto">
                  <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                        <th className="px-3 py-2 font-semibold">Nama Calon</th>
                        <th className="px-3 py-2 font-semibold">Masalah</th>
                        <th className="px-3 py-2 font-semibold text-right">Nominal</th>
                        <th className="px-3 py-2 font-semibold text-center">Izinkan?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {paginateData(calonMerged, adminPage, adminPageSize).map((item) => (
                        <tr key={item.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                          <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-100">{item.nama}</td>
                          <td className="px-3 py-3">
                            <ul className="list-disc pl-4 text-xs text-danger-600 dark:text-danger-400">
                              {item.items.map((mi, i) => <li key={i}>{mi.label}</li>)}
                            </ul>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                            {formatRupiah(item.tunggakan)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={!!allowedMissingPendaftaranIds[item.id] || !!allowedArrearsIds[item.id]}
                              onChange={(e) => {
                                setAllowedMissingPendaftaranIds(prev => ({ ...prev, [item.id]: e.target.checked }));
                                setAllowedArrearsIds(prev => ({ ...prev, [item.id]: e.target.checked }));
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination currentPage={adminPage} totalItems={calonMerged.length} pageSize={adminPageSize} onPageChange={setAdminPage} onPageSizeChange={setAdminPageSize} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ===================== Step 3: Mapping Kelas (Case A) =====================
  function renderMapping() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500 mb-4">Pemetaan kelas secara massal. Anda tetap bisa mengubah kelas tujuan per siswa pada langkah berikutnya.</p>
        {currentYearClasses.map((kelas) => (
          <div key={kelas.id} className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-100 bg-white/70 p-4 md:grid-cols-2 dark:border-slate-800 dark:bg-slate-900/30">
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100">{formatKelasLabel(kelas)}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tarif SPP saat ini: {formatRupiah(kelas.tarif_spp)}</p>
            </div>
            <select
              value={mapping[kelas.id] ?? ''}
              onChange={(event) => setMapping((current) => ({ ...current, [kelas.id]: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
            >
              <option value="">Tidak dipetakan — default lulus</option>
              {targetYearClasses.map((item) => (
                <option key={item.id} value={item.id}>{formatKelasLabel(item)}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    );
  }

  // ===================== Step 4: Preview/Review Siswa =====================
  function renderReviewOrPreview() {
    const isReview = !isCaseB;

    // Global toggle row
    const toggleRow = (
      <div className="mb-4 rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/30">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={toggleBawaTarif}
            onChange={(event) => setToggleBawaTarif(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Bawa nominal SPP saat ini ke tahun ajaran baru (Siswa Aktif)</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              ON: siswa dengan tarif khusus dipertahankan, siswa tanpa tarif khusus disimpan ke profil sebagai tarif khusus.
              OFF: semua siswa pakai tarif kelas tujuan.
            </p>
          </div>
        </label>
      </div>
    );

    if (isReview) {
      // Case A: Review Siswa (Siswa Lama + Calon Siswa)
      return (
        <div>
          {toggleRow}
          <div className="space-y-6">
            
            {/* Bagian Siswa Lama */}
            <div>
              <h3 className="mb-3 text-base font-extrabold text-slate-800 dark:text-slate-100">Siswa Lama (Aktif)</h3>
              {studentsByClass.length === 0 && <p className="text-sm text-slate-500">Tidak ada siswa aktif saat ini.</p>}
              <div className="space-y-4">
                {studentsByClass.map((group) => {
                  const validSiswa = group.siswa.filter(s => isAllowedToProceed(s.id));
                  if (validSiswa.length === 0) return null;

                  const mappedId = mapping[group.kelas.id];
                  const kelasTujuanNama = targetYearClasses.find((item) => item.id === mappedId)
                    ? formatKelasLabel(targetYearClasses.find((item) => item.id === mappedId)!)
                    : 'Belum dipetakan';

                  return (
                    <div key={group.kelas.id} className="rounded-2xl border border-slate-100 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                      <div className="mb-3">
                        <p className="font-bold text-slate-800 dark:text-slate-100">{formatKelasLabel(group.kelas)}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Default Kelas Tujuan: {kelasTujuanNama}</p>
                      </div>
                      <div className="space-y-2">
                        {validSiswa.map((siswa) => {
                          const currentVal = kelasOverrideMap[siswa.id] !== undefined ? kelasOverrideMap[siswa.id] : mappedId || '';
                          const currentTargetKelas = targetYearClasses.find(k => k.id === currentVal);
                          const tarifLama = siswa.flag_diskon_spp ? (siswa.nominal_diskon_spp ?? group.kelas.tarif_spp) : group.kelas.tarif_spp;
                          const hasPromo = !!siswa.daftar_promo && siswa.daftar_promo.length > 0;
                          
                          return (
                            <div key={siswa.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/40">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-800 dark:text-slate-100">{siswa.nama}</p>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                  Tarif: {formatRupiah(tarifLama)} → {formatRupiah(currentTargetKelas?.tarif_spp ?? 0)}
                                  {siswa.flag_diskon_spp && <span className="ml-1 text-brand-600">(khusus)</span>}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <select
                                  value={currentVal}
                                  onChange={(e) => handleOverrideKelas(siswa.id, e.target.value)}
                                  className="w-40 rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                                >
                                  <option value="">Tidak dilanjutkan (Lulus)</option>
                                  {targetYearClasses.map((k) => (
                                    <option key={k.id} value={k.id}>{formatKelasLabel(k)}</option>
                                  ))}
                                </select>
                                {hasPromo && (
                                  <button
                                    type="button"
                                    onClick={() => toggleHapusPromo(siswa.id)}
                                    className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${hapusPromoIds.includes(siswa.id) ? 'bg-danger-100 text-danger-700' : 'bg-slate-100 text-slate-600 hover:bg-danger-50 hover:text-danger-600 dark:bg-slate-800 dark:text-slate-300'}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    {hapusPromoIds.includes(siswa.id) ? 'Promo akan dihapus' : 'Hapus Promo'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bagian Siswa Cuti */}
            {cutiStudents.length > 0 && (
              <div>
                <h3 className="mb-3 text-base font-extrabold text-slate-800 dark:text-slate-100">Siswa Cuti</h3>
                <div className="space-y-2">
                  {cutiStudents.filter(s => isAllowedToProceed(s.id)).map((siswa) => {
                    const currentVal = kelasOverrideMap[siswa.id] !== undefined ? kelasOverrideMap[siswa.id] : '_cuti';
                    
                    
                    return (
                      <div key={siswa.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/30">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{siswa.nama}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Status saat ini: Cuti
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <select
                            value={currentVal}
                            onChange={(e) => handleOverrideKelas(siswa.id, e.target.value)}
                            className="w-40 rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                          >
                            <option value="_cuti">Tetap Cuti</option>
                            <option value="">Berhenti / Keluar</option>
                            <optgroup label="Aktif di Kelas">
                              {targetYearClasses.map((k) => (
                                <option key={k.id} value={k.id}>{formatKelasLabel(k)}</option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bagian Calon Siswa */}
            {calonSiswaPreview && (
              <div>
                <h3 className="mb-3 text-base font-extrabold text-slate-800 dark:text-slate-100">Calon Siswa Baru</h3>
                <div className="space-y-2">
                  {calonSiswaPreview.items.filter(item => item.siswa.status === 'calon' && isAllowedToProceed(item.siswa.id)).map((item) => {
                    const currentVal = kelasOverrideMap[item.siswa.id] !== undefined ? kelasOverrideMap[item.siswa.id] : item.kelasRencana?.id || '';
                    const currentTargetKelas = targetYearClasses.find(k => k.id === currentVal);
                    const tarifLama = item.tarifLama ?? 0;
                    const hasPromo = item.hasPromo;

                    return (
                      <div key={item.siswa.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/30">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{item.siswa.nama}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Tarif Rencana: {formatRupiah(currentTargetKelas?.tarif_spp ?? tarifLama)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <select
                            value={currentVal}
                            onChange={(e) => handleOverrideKelas(item.siswa.id, e.target.value)}
                            className="w-40 rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                          >
                            <option value="">Batal Daftar</option>
                            {targetYearClasses.map((k) => (
                              <option key={k.id} value={k.id}>{formatKelasLabel(k)}</option>
                            ))}
                          </select>
                          {hasPromo && (
                            <button
                              type="button"
                              onClick={() => toggleHapusPromo(item.siswa.id)}
                              className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${hapusPromoIds.includes(item.siswa.id) ? 'bg-danger-100 text-danger-700' : 'bg-slate-100 text-slate-600 hover:bg-danger-50 hover:text-danger-600 dark:bg-slate-800 dark:text-slate-300'}`}
                            >
                              <Trash2 className="h-3 w-3" />
                              {hapusPromoIds.includes(item.siswa.id) ? 'Hapus' : 'Promo'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {calonSiswaPreview.items.filter(item => item.siswa.status === 'calon' && isAllowedToProceed(item.siswa.id)).length === 0 && (
                    <p className="text-sm text-slate-500">Tidak ada calon siswa baru yang lolos administrasi.</p>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      );
    }

    // Case B: Preview Aktivasi (Placement & Review)
    if (!calonSiswaPreview) {
      return <div className="text-sm text-slate-500">Pilih tahun ajaran draft terlebih dahulu.</div>;
    }

    const validPreviewItems = calonSiswaPreview.items.filter(item => isAllowedToProceed(item.siswa.id));

    return (
      <div>
        {toggleRow}
        {validPreviewItems.length === 0 ? (
          <EmptyState title="Tidak ada siswa" description="Tidak ada siswa yang terdaftar atau diizinkan di tahun ajaran ini." />
        ) : (
          <div className="space-y-4">
            <div className="-mx-4 sm:mx-0 overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-3 py-2 font-semibold">Nama</th>
                    <th className="px-3 py-2 font-semibold">Status Awal</th>
                    <th className="px-3 py-2 font-semibold">Kelas Tujuan</th>
                    <th className="px-3 py-2 font-semibold">Tarif</th>
                    <th className="px-3 py-2 font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {paginateData(validPreviewItems, previewPage, previewPageSize).map((item) => {
                    const currentVal = kelasOverrideMap[item.siswa.id] !== undefined ? kelasOverrideMap[item.siswa.id] : item.kelasRencana?.id || '';
                    const tarifDisplay = toggleBawaTarif
                      ? `${formatRupiah(item.tarifLama ?? 0)}${item.siswa.flag_diskon_spp ? ' (khusus)' : ''}`
                      : formatRupiah(item.tarifBaru);
                      
                    return (
                      <tr key={item.siswa.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                        <td className="px-3 py-3">
                          <p className="font-bold text-slate-800 dark:text-slate-100">{item.siswa.nama}</p>
                          {item.pesan.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {item.pesan.map((msg, i) => (
                                <p key={i} className="text-[11px] text-danger-600 dark:text-danger-400">{msg}</p>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                           <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            item.siswa.status === 'aktif' ? 'bg-success-50 text-success-700 dark:bg-success-950/30 dark:text-success-400' :
                            'bg-warning-50 text-warning-700 dark:bg-warning-950/30 dark:text-warning-400'
                          }`}>
                            {item.siswa.status === 'aktif' ? 'Siswa Lama (Aktif)' : 'Calon Siswa'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={currentVal}
                            onChange={(e) => handleOverrideKelas(item.siswa.id, e.target.value)}
                            className="w-full max-w-[160px] rounded-lg border border-slate-200 bg-white/70 px-2 py-1 text-xs text-slate-800 outline-none focus:border-brand-400 dark:border-slate-700 dark:bg-slate-900/50"
                          >
                            <option value="">{item.siswa.status === 'aktif' ? 'Berhenti / Lulus' : 'Batal Daftar'}</option>
                            {targetYearClasses.map((k) => (
                              <option key={k.id} value={k.id}>{formatKelasLabel(k)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
                          {tarifDisplay}
                        </td>
                        <td className="px-3 py-3">
                          {item.hasPromo && (
                            <button
                              type="button"
                              onClick={() => toggleHapusPromo(item.siswa.id)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                                hapusPromoIds.includes(item.siswa.id)
                                  ? 'bg-danger-100 text-danger-700'
                                  : 'bg-slate-100 text-slate-600 hover:bg-danger-50 hover:text-danger-600 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              <Trash2 className="h-3 w-3" />
                              {hapusPromoIds.includes(item.siswa.id) ? 'Hapus' : 'Promo'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination currentPage={previewPage} totalItems={validPreviewItems.length} pageSize={previewPageSize} onPageChange={setPreviewPage} onPageSizeChange={setPreviewPageSize} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===================== Step 5/4: Konfirmasi =====================
  function renderConfirm() {
    const targetYearName = years.find((item) => item.id === targetYearId)?.nama ?? '-';

    return (
      <div>
        <SummaryGroupGrid>
          <SummaryGroupCard title="Penempatan Siswa" tone="brand" variant="featured">
            <SummaryGroupRow label={isCaseB ? 'Aktif ke Kelas' : 'Naik Kelas'} value={summary.naik} highlight valueClassName="text-2xl" />
            <SummaryGroupRow label="Tidak Dilanjutkan / Lulus" value={summary.lulus} />
            <SummaryGroupRow label="Batal Daftar" value={summary.batal} />
          </SummaryGroupCard>
          <SummaryGroupCard title="Administrasi & Lainnya" tone="amber" variant="receipt">
            <SummaryGroupRow label="Diblokir (Tunggakan)" value={summary.blocked} />

            <SummaryGroupRow label="Promo Dihapus" value={hapusPromoIds.length} />
            <SummaryGroupRow label="Bawa Tarif Khusus" value={toggleBawaTarif ? 'Ya' : 'Tidak'} />
            <SummaryGroupRow label="TA Tujuan" value={targetYearName} />
          </SummaryGroupCard>
        </SummaryGroupGrid>
        <div className="mt-4 rounded-2xl border border-slate-100 bg-white/70 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-300">
          Siswa yang diblokir karena tunggakan administrasi akan otomatis diubah statusnya menjadi <strong>Berhenti</strong> (untuk siswa lama) atau <strong>Batal Daftar</strong> (untuk calon siswa).
        </div>
      </div>
    );
  }

  // ===================== Step Router =====================
  function renderStepContent() {
    switch (currentStep.id) {
      case 'pilih': return renderPilih();
      case 'cek_administrasi': return renderCekAdministrasi();
      case 'mapping': return renderMapping();
      case 'review':
      case 'preview': return renderReviewOrPreview();
      case 'confirm': return renderConfirm();
      default: return null;
    }
  }

  const isReviewStep = currentStep.id === 'review' || currentStep.id === 'preview' || currentStep.id === 'confirm';

  return (
    <div className="mx-auto w-full max-w-7xl rounded-3xl border border-slate-200 bg-white/90 shadow-soft animate-fade-in dark:border-slate-800 dark:bg-slate-950/80">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800 md:px-6">
        {/* Mobile stepper */}
        <div className="md:hidden">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
                {isCaseB ? 'Aktivasi TA' : 'Lanjut TA'}
              </p>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                Langkah {stepIndex + 1}/{steps.length}: {currentStep.label}
              </p>
            </div>
            <p className="text-xs font-bold text-slate-400">{Math.round(((stepIndex + 1) / steps.length) * 100)}%</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
          </div>
          <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((step, index) => {
              const active = index === stepIndex;
              const complete = index < maxStepReached;
              const available = index <= maxStepReached || index === stepIndex + 1;
              return (
                <button key={step.id} type="button" onClick={() => goToStep(index)} disabled={!available}
                  className={`h-7 rounded-lg text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    active ? 'bg-brand-600 text-white' :
                    complete ? 'bg-success-100 text-success-700 dark:bg-success-950/30 dark:text-success-400' :
                    'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-500'
                  }`}>
                  {complete ? <CheckCircle2 className="mx-auto h-3.5 w-3.5" /> : index + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop stepper */}
        <div className="hidden items-center gap-2 md:grid" style={{ gridTemplateColumns: `8rem repeat(${steps.length}, minmax(0, 1fr))` }}>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
              {isCaseB ? 'Aktivasi TA' : 'Lanjut TA'}
            </p>
            <p className="mt-0.5 text-xs font-bold text-slate-400">{stepIndex + 1}/{steps.length} langkah</p>
          </div>
          {steps.map((step, index) => {
            const active = index === stepIndex;
            const complete = index < maxStepReached;
            const available = index <= maxStepReached || index === stepIndex + 1;
            return (
              <button key={step.id} type="button" onClick={() => goToStep(index)} disabled={!available}
                className={`rounded-xl border px-2 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                  active ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-950/60 dark:bg-brand-950/20 dark:text-brand-300' :
                  complete ? 'border-success-100 bg-success-50/70 text-success-700 dark:border-success-950/40 dark:bg-success-950/10 dark:text-success-400' :
                  'border-slate-100 bg-slate-50/70 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/60'
                }`}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold ${
                    active || complete ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 dark:bg-slate-950'
                  }`}>
                    {complete ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
                  </span>
                  <span className="truncate text-[11px] font-extrabold">{step.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <main className="px-4 py-4 md:px-6 md:py-5">
        <div className="mb-5">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white md:text-xl">
            {isCaseB ? 'Aktivasi Tahun Ajaran' : 'Lanjut Tahun Ajaran'}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isCaseB
              ? 'Tidak ada tahun ajaran aktif saat ini. Pilih dan aktivasi tahun ajaran draft untuk mulai operasional.'
              : `Wizard pergantian periode. Tahun ajaran aktif saat ini: ${activeYear?.nama ?? '-'}`}
          </p>
        </div>

        {!targetYearId && currentStep.id !== 'pilih' ? (
          <EmptyState title="Pilih tahun ajaran terlebih dahulu" description="Kembali ke langkah pertama untuk memilih tahun ajaran tujuan." />
        ) : (
          renderStepContent()
        )}
      </main>

      <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-slate-100 bg-white/95 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/95 md:flex md:items-center md:justify-between md:px-6">
        <button type="button" onClick={goBack} disabled={stepIndex === 0 || isSubmitting}
          className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
          Kembali
        </button>
        <div className="flex gap-3">
          {isReviewStep ? (
            <button type="button" onClick={goNext}
              disabled={isSubmitting || currentStep.id === 'confirm'}
              className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-60">
              Lanjut
            </button>
          ) : null}
          {currentStep.id === 'confirm' ? (
            <button type="button" onClick={handleSubmit} disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-60">
              <Save className="h-4 w-4" />
              {isSubmitting ? 'Memproses...' : (isCaseB ? 'Aktivasi Tahun Ajaran' : 'Lanjutkan Tahun Ajaran')}
            </button>
          ) : currentStep.id === 'review' || currentStep.id === 'preview' ? null : (
            <button type="button" onClick={goNext} disabled={!targetYearId || isSubmitting}
              className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-500 disabled:opacity-60">
              Lanjut
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

