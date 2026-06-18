import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import PageHeader from '../components/ui/PageHeader';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';
import FilterInput from '../components/ui/FilterInput';
import type { FilterChip } from '../components/ui/FilterChipBar';
import SectionCard from '../components/ui/SectionCard';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { paginateData } from '../components/ui/Pagination';
import { SummaryGroupCard, SummaryGroupGrid, SummaryGroupRow } from '../components/ui/SummaryGroup';
import { formatTanggal, formatKelasLabel } from '../lib/format';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { db } from '../db';
import { exportLaporanAktivasiExcel } from '../lib/excelGenerator';
import { generateLaporanAktivasiPdf } from '../lib/pdfGenerator';

type Kategori = 'naik_kelompok' | 'tinggal_kelas' | 'lulus' | 'tidak_daftar_ulang';

const KATEGORI_LABEL: Record<Kategori, string> = {
  naik_kelompok: 'Naik Kelompok',
  tinggal_kelas: 'Tinggal Kelas',
  lulus: 'Lulus',
  tidak_daftar_ulang: 'Tidak Daftar Ulang',
};

const KATEGORI_COLORS: Record<Kategori, string> = {
  naik_kelompok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  tinggal_kelas: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  lulus: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  tidak_daftar_ulang: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

interface TransisiItem {
  id: string;
  siswa: any;
  kelasAsal: any;
  kelasTujuan: any;
  kategori: Kategori;
  tanggal: string;
  detail: string;
}

export default function LaporanAktivasiPage() {
  const [taAsalFilter, setTaAsalFilter] = useState('');
  const [kategoriFilter, setKategoriFilter] = useState('');
  const [kelasFilter, setKelasFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const tahunAjaranOptions = useLiveQuery(() => listTahunAjaran(), [], []);

  const allKategoriOptions: { value: string; label: string }[] = [
    { value: '', label: 'Semua Kategori' },
    { value: 'naik_kelompok', label: 'Naik Kelompok' },
    { value: 'tinggal_kelas', label: 'Tinggal Kelas' },
    { value: 'lulus', label: 'Lulus' },
    { value: 'tidak_daftar_ulang', label: 'Tidak Daftar Ulang' },
  ];

  function resetFilters() {
    setTaAsalFilter('');
    setKategoriFilter('');
    setKelasFilter('');
    setSearch('');
    setPage(1);
  }

  const filterChips: FilterChip[] = [
    { key: 'taAsal', label: `TA Asal: ${tahunAjaranOptions.find((t) => t.id === taAsalFilter)?.nama ?? 'Arsip terbaru'}` },
    { key: 'kategori', label: `Kategori: ${kategoriFilter ? allKategoriOptions.find((o) => o.value === kategoriFilter)?.label ?? kategoriFilter : 'Semua'}` },
    { key: 'kelas', label: `Kelas: ${kelasFilter ? 'Tertentu' : 'Semua'}` },
  ];

  const defaultTaAsal = useMemo(() => {
    const arsip = tahunAjaranOptions.slice().sort((a, b) => b.selesai.localeCompare(a.selesai)).find((t) => t.status === 'arsip');
    return arsip ?? null;
  }, [tahunAjaranOptions]);

  const taAsalId = taAsalFilter || defaultTaAsal?.id || '';
  const taAsal = useMemo(() => tahunAjaranOptions.find((t) => t.id === taAsalId) ?? null, [tahunAjaranOptions, taAsalId]);

  const taTujuan = useMemo(() => {
    if (!taAsal) return null;
    return tahunAjaranOptions
      .filter((t) => !t.deleted_at && t.mulai > taAsal.mulai)
      .sort((a, b) => a.mulai.localeCompare(b.mulai))[0] ?? null;
  }, [tahunAjaranOptions, taAsal]);

  const rawData = useLiveQuery(async () => {
    if (!taAsalId) return [];
    const [siswaList, kelasList, assignmentList] = await Promise.all([
      db.siswa.toArray(),
      db.kelas.toArray(),
      db.siswa_kelas.toArray(),
    ]);

    const siswaMap = new Map(siswaList.filter((s) => !s.deleted_at).map((s) => [s.id, s]));
    const kelasMap = new Map(kelasList.filter((k) => !k.deleted_at).map((k) => [k.id, k]));
    const taTujuanId = taTujuan?.id;

    // All assignments in TA Asal
    const asalAssignments = assignmentList.filter((a) => {
      const k = kelasMap.get(a.kelas_id);
      return k && k.tahun_ajaran_id === taAsalId;
    });

    // Active assignments in TA Tujuan (for determining continuing students)
    const tujuanActiveAssignments = taTujuanId
      ? new Map(
          assignmentList
            .filter((a) => a.selesai === null)
            .filter((a) => {
              const k = kelasMap.get(a.kelas_id);
              return k && k.tahun_ajaran_id === taTujuanId;
            })
            .map((a) => [a.siswa_id, a])
        )
      : new Map();

    const results: TransisiItem[] = [];

    for (const asalAssignment of asalAssignments) {
      const siswa = siswaMap.get(asalAssignment.siswa_id);
      if (!siswa) continue;

      const kelasAsal = kelasMap.get(asalAssignment.kelas_id);
      if (!kelasAsal) continue;

      const tujuanActive = tujuanActiveAssignments.get(asalAssignment.siswa_id);
      const kelasTujuan = tujuanActive ? kelasMap.get(tujuanActive.kelas_id) ?? null : null;

      let kategori: Kategori;
      let tanggal = asalAssignment.selesai ?? asalAssignment.mulai;
      let detail = '';

      if (tujuanActive && kelasTujuan) {
        const asalTingkat = kelasAsal.tingkat ?? '';
        const tujuanTingkat = kelasTujuan.tingkat ?? '';
        if (asalTingkat && tujuanTingkat && tujuanTingkat === asalTingkat) {
          kategori = 'tinggal_kelas';
          detail = `${formatKelasLabel(kelasAsal)} → ${formatKelasLabel(kelasTujuan)} (sama)`;
        } else {
          kategori = 'naik_kelompok';
          detail = `${formatKelasLabel(kelasAsal)} → ${formatKelasLabel(kelasTujuan)}`;
        }
        tanggal = tujuanActive.mulai;
      } else if (asalAssignment.status_akhir_periode === 'alumni') {
        kategori = 'lulus';
        detail = 'Tamat PAUD';
        tanggal = asalAssignment.selesai ?? asalAssignment.mulai;
      } else {
        kategori = 'tidak_daftar_ulang';
        detail = asalAssignment.status_akhir_periode ?? 'Tidak lanjut';
        tanggal = asalAssignment.selesai ?? asalAssignment.mulai;
      }

      results.push({
        id: asalAssignment.id,
        siswa,
        kelasAsal,
        kelasTujuan,
        kategori,
        tanggal,
        detail,
      });
    }

    return results.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [taAsalId, taTujuan], []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rawData.filter((r) => {
      if (kategoriFilter && r.kategori !== kategoriFilter) return false;
      if (kelasFilter && r.kelasAsal?.id !== kelasFilter) return false;
      if (q && !r.siswa.nama.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rawData, kategoriFilter, kelasFilter, search]);

  // Summary
  const summary = useMemo(() => {
    const map: Record<Kategori, number> = { naik_kelompok: 0, tinggal_kelas: 0, lulus: 0, tidak_daftar_ulang: 0 };
    rawData.forEach((r) => { map[r.kategori]++; });
    return map;
  }, [rawData]);

  const breakdownKelas = useMemo(() => {
    const map = new Map<string, number>();
    rawData.forEach((r) => {
      if (r.kelasAsal) {
        const label = formatKelasLabel(r.kelasAsal);
        map.set(label, (map.get(label) ?? 0) + 1);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rawData]);

  const kelasOptions = useMemo(() => {
    const seen = new Map<string, { id: string; label: string }>();
    rawData.forEach((r) => {
      if (r.kelasAsal && !seen.has(r.kelasAsal.id)) {
        seen.set(r.kelasAsal.id, { id: r.kelasAsal.id, label: formatKelasLabel(r.kelasAsal) });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rawData]);

  const totalAll = rawData.length;

  const taAsalOptions = useMemo(() =>
    tahunAjaranOptions.filter((t) => !t.deleted_at && (t.status === 'arsip' || t.status === 'aktif')),
    [tahunAjaranOptions]
  );

  const aktivasiFilterCtx = [
    `TA Asal: ${taAsal?.nama ?? '-'}`,
    `TA Tujuan: ${taTujuan?.nama ?? '-'}`,
    kategoriFilter ? `Kategori: ${kategoriFilter}` : '',
    kelasFilter ? `Kelas: ${kelasOptions.find(k => k.id === kelasFilter)?.label || kelasFilter}` : '',
    search ? `Cari: ${search}` : '',
  ].filter(Boolean).join(' | ');

  const handleExportExcel = () => exportLaporanAktivasiExcel(filtered, taAsal, taTujuan, aktivasiFilterCtx);
  const handleExportPdf = async () => {
    await generateLaporanAktivasiPdf(
      filtered,
      {
        naikKelompok: summary.naik_kelompok,
        tinggalKelas: summary.tinggal_kelas,
        lulus: summary.lulus,
        tidakDaftarUlang: summary.tidak_daftar_ulang,
      },
      aktivasiFilterCtx
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader title="Laporan Aktivasi" description="Rekap hasil proses lanjut tahun ajaran: naik kelompok, tinggal kelas, lulus, dan tidak daftar ulang." actions={
        <div className="flex gap-2">
          <button type="button" onClick={handleExportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Cetak Excel</button>
          <button type="button" onClick={handleExportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Cetak PDF</button>
        </div>
      } />

      <CollapsibleFilterCard chips={filterChips} summary={`Menampilkan ${filtered.length} siswa terdampak`} onReset={resetFilters}>
        <FilterInput type="select" value={taAsalFilter} onChange={setTaAsalFilter} label="TA Asal" compact options={[{ value: '', label: 'Arsip terbaru' }, ...taAsalOptions.map((t) => ({ value: t.id, label: t.nama }))]} />
        <FilterInput type="select" value={kategoriFilter} onChange={setKategoriFilter} label="Kategori" compact options={allKategoriOptions} />
        <FilterInput type="select" value={kelasFilter} onChange={setKelasFilter} label="Kelompok Asal" compact options={[{ value: '', label: 'Semua Kelompok' }, ...kelasOptions.map((k) => ({ value: k.id, label: k.label }))]} />
        <FilterInput type="search" value={search} onChange={setSearch} placeholder="Cari nama..." compact />
      </CollapsibleFilterCard>

      {/* Info transisi */}
      {taAsal && taTujuan && (
        <div className="rounded-xl border border-slate-200 bg-white/80 px-5 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          Menampilkan hasil transisi dari <strong className="text-slate-800 dark:text-slate-200">{taAsal.nama}</strong> ke <strong className="text-slate-800 dark:text-slate-200">{taTujuan.nama}</strong>
        </div>
      )}

      {/* Ringkasan */}
      <SummaryGroupGrid>
        <SummaryGroupCard title="Transisi" tone="brand" variant="featured">
          <SummaryGroupRow label="Total Siswa Terdampak" value={totalAll} highlight valueClassName="text-2xl" />
        </SummaryGroupCard>
        <SummaryGroupCard title="Naik Kelompok" tone="emerald" variant="receipt">
          <SummaryGroupRow label="Jumlah" value={summary.naik_kelompok} />
        </SummaryGroupCard>
        <SummaryGroupCard title="Tinggal Kelas" tone="amber" variant="receipt">
          <SummaryGroupRow label="Jumlah" value={summary.tinggal_kelas} />
        </SummaryGroupCard>
        <SummaryGroupCard title="Lulus / Tidak Daftar Ulang" tone="violet" variant="receipt">
          <SummaryGroupRow label="Lulus" value={summary.lulus} />
          <SummaryGroupRow label="Tidak Daftar Ulang" value={summary.tidak_daftar_ulang} />
        </SummaryGroupCard>
      </SummaryGroupGrid>

      {/* Breakdown per kelas asal */}
      {breakdownKelas.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {breakdownKelas.map(([name, count]) => (
            <div key={name} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              <div className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{count}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabel */}
      <SectionCard>
        {filtered.length === 0 ? (
          <EmptyState title="Tidak ada data aktivasi" description="Belum ada data transisi tahun ajaran untuk filter yang dipilih." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nama</th>
                    <th className="px-4 py-3 font-semibold">Kelompok Asal</th>
                    <th className="px-4 py-3 font-semibold">Kelompok Baru</th>
                    <th className="px-4 py-3 font-semibold">Kategori</th>
                    <th className="px-4 py-3 font-semibold">Tanggal</th>
                    <th className="px-4 py-3 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {paginateData(filtered, page, pageSize).map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.siswa.nama}</td>
                      <td className="px-4 py-3">{r.kelasAsal ? formatKelasLabel(r.kelasAsal) : '-'}</td>
                      <td className="px-4 py-3 font-semibold">{r.kelasTujuan ? formatKelasLabel(r.kelasTujuan) : '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${KATEGORI_COLORS[r.kategori]}`}>
                          {KATEGORI_LABEL[r.kategori]}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatTanggal(r.tanggal)}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </>
        )}
      </SectionCard>
    </div>
  );
}
