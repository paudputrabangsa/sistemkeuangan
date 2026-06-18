import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import PageHeader from '../components/ui/PageHeader';
import CollapsibleFilterCard from '../components/ui/CollapsibleFilterCard';
import FilterInput from '../components/ui/FilterInput';
import type { FilterChip } from '../components/ui/FilterChipBar';
import SectionCard from '../components/ui/SectionCard';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { paginateData } from '../components/ui/Pagination';
import StatusBadgeSiswa from '../components/ui/StatusBadgeSiswa';
import StatusBadgeTagihan from '../components/ui/StatusBadgeTagihan';
import { SummaryGroupCard, SummaryGroupGrid, SummaryGroupRow } from '../components/ui/SummaryGroup';
import { formatTanggal, formatRupiah, formatKelasLabel } from '../lib/format';
import { calculateAgeInYears, getTahunAjaranCutoffDate } from '../services/service-helpers';
import { listSiswaWithFilters } from '../queries/siswaQueries';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { db } from '../db';
import { exportLaporanPendaftaranExcel, exportLaporanDaftarUlangExcel } from '../lib/excelGenerator';
import { generateLaporanPendaftaranPdf, generateLaporanDaftarUlangPdf } from '../lib/pdfGenerator';
import type { Siswa } from '../db/types';

type Konteks = 'pendaftaran' | 'daftar_ulang';

export default function LaporanPendaftaranPage() {
  const [konteks, setKonteks] = useState<Konteks>('pendaftaran');
  const [taFilter, setTaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statusPembayaranFilter, setStatusPembayaranFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  function resetFilters() {
    setTaFilter('');
    setStatusFilter('');
    setStatusPembayaranFilter('');
    setFromDate('');
    setToDate('');
    setSearch('');
    setPage(1);
  }

  const tahunAjaranOptions = useLiveQuery(() => listTahunAjaran(), [], []);

  const defaultTargetTa = useMemo(() => {
    const draft = tahunAjaranOptions.find((t) => t.status === 'draft');
    const aktif = tahunAjaranOptions.find((t) => t.aktif || t.status === 'aktif');
    return draft ?? aktif ?? null;
  }, [tahunAjaranOptions]);

  const effectiveTaId = taFilter === 'all' ? '' : (taFilter || defaultTargetTa?.id || '');

  const filterChips: FilterChip[] = [
    { key: 'ta', label: `TA: ${taFilter === 'all' ? 'Semua Periode' : (tahunAjaranOptions.find((t) => t.id === effectiveTaId)?.nama ?? 'Bawaan')}` },
    ...(fromDate ? [{ key: 'from', label: `Dari: ${formatTanggal(fromDate)}` }] : []),
    ...(toDate ? [{ key: 'to', label: `Sampai: ${formatTanggal(toDate)}` }] : []),
    { key: 'status', label: `Status: ${statusFilter || 'Semua'}` },
  ];

  // --- PENDAFTARAN context ---
  const calon = useLiveQuery(() => {
    if (konteks !== 'pendaftaran' || !effectiveTaId) return Promise.resolve([]);
    return listSiswaWithFilters({ tahunAjaranId: effectiveTaId, status: 'semua' });
  }, [konteks, effectiveTaId], []);

  const pendaftaranTagihan = useLiveQuery(async () => {
    if (konteks !== 'pendaftaran') return [];
    const all = await db.tagihan.toArray();
    return all.filter((t) => !t.deleted_at && t.jenis.toLowerCase() === 'pendaftaran');
  }, [konteks], []);

  const assignments = useLiveQuery(async () => {
    if (konteks !== 'pendaftaran') return [];
    const all = await db.siswa_kelas.toArray();
    return all;
  }, [konteks], []);

  const statusPembayaranMap = useMemo(() => {
    const map = new Map<string, 'lunas' | 'belum'>();
    pendaftaranTagihan.forEach((t) => {
      map.set(t.siswa_id, t.status === 'lunas' ? 'lunas' : 'belum');
    });
    return map;
  }, [pendaftaranTagihan]);

  const activationDateMap = useMemo(() => {
    const map = new Map<string, string>();
    assignments.forEach((a) => {
      if (!map.has(a.siswa_id) || a.mulai < map.get(a.siswa_id)!) {
        map.set(a.siswa_id, a.mulai);
      }
    });
    return map;
  }, [assignments]);

  const filtered = useMemo(() => {
    if (konteks !== 'pendaftaran') return [];
    const q = search.toLowerCase();
    return calon.filter((s) => {
      const periodStatus = s.periodStatus;
      if (!['calon', 'aktif', 'batal_daftar'].includes(periodStatus)) return false;

      if (statusFilter === 'calon' && periodStatus !== 'calon') return false;
      if (statusFilter === 'aktif' && periodStatus !== 'aktif') return false;
      if (statusFilter === 'batal' && periodStatus !== 'batal_daftar') return false;

      if (statusPembayaranFilter) {
        const sp = statusPembayaranMap.get(s.id) ?? 'belum';
        if (statusPembayaranFilter !== sp) return false;
      }

      if (fromDate && s.tanggal_daftar < fromDate) return false;
      if (toDate && s.tanggal_daftar > toDate) return false;

      if (q && !s.nama.toLowerCase().includes(q) && !s.nama_wali.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b.tanggal_daftar.localeCompare(a.tanggal_daftar));
  }, [konteks, calon, statusFilter, statusPembayaranFilter, fromDate, toDate, search, statusPembayaranMap]);

  const totalCalon = filtered.filter((s) => s.periodStatus === 'calon').length;
  const totalAktif = filtered.filter((s) => s.periodStatus === 'aktif').length;
  const totalBatal = filtered.filter((s) => s.periodStatus === 'batal_daftar').length;
  const totalLunas = filtered.filter((s) => (statusPembayaranMap.get(s.id) ?? 'belum') === 'lunas').length;
  const totalBelumLunas = filtered.filter((s) => (statusPembayaranMap.get(s.id) ?? 'belum') === 'belum').length;

  const tahunAjaranMap = new Map<string, string>(tahunAjaranOptions.map(t => [t.id, t.nama]));

  const pendaftaranTagihanMap = new Map<string, any>();
  pendaftaranTagihan.forEach(t => pendaftaranTagihanMap.set(t.siswa_id, t));

  let sumPendaftaranTotal = 0;
  let sumPendaftaranTerbayar = 0;
  filtered.forEach(s => {
     const t = pendaftaranTagihanMap.get(s.id);
     if (t) {
        sumPendaftaranTotal += t.jumlah_total;
        sumPendaftaranTerbayar += t.sudah_dibayar;
     }
  });
  const sumPendaftaranSisa = sumPendaftaranTotal - sumPendaftaranTerbayar;

  const pendaftaranFilterCtx = [
    `Tahun Ajaran: ${tahunAjaranMap.get(effectiveTaId) ?? 'Semua'}`,
    statusFilter ? `Status: ${statusFilter}` : '',
    statusPembayaranFilter ? `Pembayaran: ${statusPembayaranFilter}` : '',
    fromDate || toDate ? `Periode: ${fromDate ? formatTanggal(fromDate) : 'Awal'} - ${toDate ? formatTanggal(toDate) : 'Akhir'}` : '',
    search ? `Cari: ${search}` : '',
  ].filter(Boolean).join(' | ');

  const handleExportPendaftaranExcel = () => exportLaporanPendaftaranExcel(filtered, pendaftaranTagihanMap, activationDateMap, tahunAjaranMap, kelasMap, pendaftaranFilterCtx);
  const handleExportPendaftaranPdf = () => {
    const summary = { totalPendaftar: totalCalon + totalAktif + totalBatal, aktif: totalAktif, batal: totalBatal };
    generateLaporanPendaftaranPdf(filtered, tahunAjaranMap, pendaftaranTagihanMap, activationDateMap, summary, pendaftaranFilterCtx);
  };

  // --- DAFTAR ULANG context ---
  const allSiswa = useLiveQuery(async () => {
    if (konteks !== 'daftar_ulang') return [];
    const items = await db.siswa.toArray();
    return items as Siswa[];
  }, [konteks], []);

  const allTagihan = useLiveQuery(async () => {
    if (konteks !== 'daftar_ulang') return [];
    return await db.tagihan.toArray();
  }, [konteks], []);

  const duTagihan = useMemo(() => {
    return allTagihan.filter((t) => !t.deleted_at && ['daftar_ulang', 'daftar ulang'].includes(t.jenis.toLowerCase()));
  }, [allTagihan]);

  const tunggakanMap = useMemo(() => {
    const map = new Map<string, number>();
    allTagihan.forEach(t => {
       if (t.deleted_at || ['daftar_ulang', 'daftar ulang'].includes(t.jenis.toLowerCase())) return;
       if (t.status !== 'lunas') {
          const sisa = t.jumlah_total - t.sudah_dibayar;
          map.set(t.siswa_id, (map.get(t.siswa_id) || 0) + sisa);
       }
    });
    return map;
  }, [allTagihan]);

  const diskonSetting = useLiveQuery(async () => {
    if (konteks !== 'daftar_ulang') return null;
    return await db.pengaturan.get({ kunci: 'diskon' });
  }, [konteks], null);

  const diskonMap = useMemo(() => {
    const map = new Map<string, string>();
    if (diskonSetting?.nilai) {
      try {
        const list = JSON.parse(diskonSetting.nilai);
        list.forEach((d: any) => map.set(d.id, d.nama));
      } catch (e) {}
    }
    return map;
  }, [diskonSetting]);

  const duPembayaran = useLiveQuery(async () => {
    if (konteks !== 'daftar_ulang') return [];
    const items = await db.pembayaran.toArray();
    return items;
  }, [konteks], []);

  const allKelas = useLiveQuery(async () => {
    const items = await db.kelas.toArray();
    return items;
  }, [], []);

  const allSiswaKelas = useLiveQuery(async () => {
    if (konteks !== 'daftar_ulang') return [];
    const items = await db.siswa_kelas.toArray();
    return items;
  }, [konteks], []);

  const siswaMap = useMemo(() => new Map(allSiswa.map((s) => [s.id, s])), [allSiswa]);
  const kelasMap = useMemo(() => new Map(allKelas.map((k) => [k.id, k])), [allKelas]);

  const kelasRencanaMap = useMemo(() => {
    const map = new Map<string, string>();
    const perSiswa = new Map<string, { kelas_id: string; mulai: string }[]>();
    allSiswaKelas.forEach((sk) => {
      const arr = perSiswa.get(sk.siswa_id) ?? [];
      arr.push({ kelas_id: sk.kelas_id, mulai: sk.mulai });
      perSiswa.set(sk.siswa_id, arr);
    });
    perSiswa.forEach((arr, siswaId) => {
      arr.sort((a, b) => b.mulai.localeCompare(a.mulai));
      if (arr.length > 0) {
        map.set(siswaId, arr[0].kelas_id);
      }
    });
    return map;
  }, [allSiswaKelas]);

  const asalKelasMap = useMemo(() => {
    const map = new Map<string, string>();
    const perSiswa = new Map<string, { kelas_id: string; mulai: string }[]>();
    allSiswaKelas.forEach((sk) => {
      const arr = perSiswa.get(sk.siswa_id) ?? [];
      arr.push({ kelas_id: sk.kelas_id, mulai: sk.mulai });
      perSiswa.set(sk.siswa_id, arr);
    });
    perSiswa.forEach((arr, siswaId) => {
      arr.sort((a, b) => b.mulai.localeCompare(a.mulai));
      if (arr.length > 1) {
        map.set(siswaId, arr[1].kelas_id);
      }
    });
    return map;
  }, [allSiswaKelas]);

  const duPembayaranMap = useMemo(() => {
    const map = new Map<string, { tanggal: string; jumlah: number }[]>();
    duPembayaran.forEach((p) => {
      if (p.deleted_at) return;
      const arr = map.get(p.tagihan_id) ?? [];
      arr.push({ tanggal: p.tanggal, jumlah: p.jumlah });
      map.set(p.tagihan_id, arr);
    });
    return map;
  }, [duPembayaran]);

  const filteredDu = useMemo(() => {
    if (konteks !== 'daftar_ulang') return [];
    const q = search.toLowerCase();
    let list = duTagihan;

    if (statusFilter === 'lunas') list = list.filter((t) => t.status === 'lunas');
    else if (statusFilter === 'belum') list = list.filter((t) => t.status === 'belum_bayar' || t.status === 'sebagian');

    if (statusPembayaranFilter === 'lunas') list = list.filter((t) => t.status === 'lunas');
    else if (statusPembayaranFilter === 'belum') list = list.filter((t) => t.status !== 'lunas');

    if (effectiveTaId) {
      list = list.filter((t) => t.tahun_ajaran_id === effectiveTaId);
    }

    if (fromDate) list = list.filter((t) => t.jatuh_tempo >= fromDate);
    if (toDate) list = list.filter((t) => t.jatuh_tempo <= toDate);

    if (q) {
      list = list.filter((t) => {
        const siswa = siswaMap.get(t.siswa_id);
        return siswa?.nama.toLowerCase().includes(q) || siswa?.nama_wali.toLowerCase().includes(q);
      });
    }

    return list.sort((a, b) => b.jatuh_tempo.localeCompare(a.jatuh_tempo));
  }, [konteks, duTagihan, statusFilter, statusPembayaranFilter, effectiveTaId, fromDate, toDate, search, siswaMap]);

  const duLunas = filteredDu.filter((t) => t.status === 'lunas').length;
  const duBelum = filteredDu.filter((t) => t.status === 'belum_bayar' || t.status === 'sebagian').length;
  const duTotal = filteredDu.length;

  let sumDuTotal = 0;
  let sumDuTerbayar = 0;
  filteredDu.forEach(t => {
     sumDuTotal += t.jumlah_total;
     sumDuTerbayar += t.sudah_dibayar;
  });
  const sumDuSisa = sumDuTotal - sumDuTerbayar;

  const duFilterCtx = [
    `Tahun Ajaran: ${tahunAjaranMap.get(effectiveTaId) ?? 'Semua'}`,
    statusFilter ? `Status: ${statusFilter}` : '',
    statusPembayaranFilter ? `Pembayaran: ${statusPembayaranFilter}` : '',
    fromDate || toDate ? `Periode: ${fromDate ? formatTanggal(fromDate) : 'Awal'} - ${toDate ? formatTanggal(toDate) : 'Akhir'}` : '',
    search ? `Cari: ${search}` : '',
  ].filter(Boolean).join(' | ');

  const handleExportDuExcel = () => exportLaporanDaftarUlangExcel(filteredDu, siswaMap, kelasMap, kelasRencanaMap, duPembayaranMap, tunggakanMap, diskonMap, tahunAjaranMap, duFilterCtx);
  const handleExportDuPdf = () => {
    generateLaporanDaftarUlangPdf(filteredDu, siswaMap, kelasMap, kelasRencanaMap, duPembayaranMap, { total: duTotal, lunas: duLunas, belum: duBelum }, duFilterCtx, asalKelasMap);
  };

  const handleExportExcel = konteks === 'pendaftaran' ? handleExportPendaftaranExcel : handleExportDuExcel;
  const handleExportPdf = konteks === 'pendaftaran' ? handleExportPendaftaranPdf : handleExportDuPdf;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader title="Laporan Pendaftaran" description="Rekap pendaftaran calon siswa dan daftar ulang per tahun ajaran." actions={
        <div className="flex gap-2">
          <button type="button" onClick={handleExportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Cetak Excel</button>
          <button type="button" onClick={handleExportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Cetak PDF</button>
        </div>
      } />

      {/* Tab selector */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white/90 p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        {([
          { value: 'pendaftaran', label: 'Pendaftaran' },
          { value: 'daftar_ulang', label: 'Daftar Ulang' },
        ] as { value: Konteks; label: string }[]).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setKonteks(tab.value); setPage(1); setStatusFilter(''); setStatusPembayaranFilter(''); setSearch(''); }}
            className={`h-9 rounded-lg px-4 text-xs font-extrabold transition ${konteks === tab.value ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <CollapsibleFilterCard chips={filterChips} summary={`Menampilkan ${konteks === 'pendaftaran' ? filtered.length : filteredDu.length} data`} onReset={resetFilters}>
        <FilterInput type="select" value={taFilter} onChange={setTaFilter} label="Tahun Ajaran" compact options={[{ value: '', label: `Bawaan (${defaultTargetTa?.nama ?? 'Memuat...'})` }, { value: 'all', label: 'Semua Periode' }, ...tahunAjaranOptions.filter((t) => !t.deleted_at).map((t) => ({ value: t.id, label: t.nama }))]} />
        <FilterInput type="date" value={fromDate} onChange={setFromDate} label="Dari Tgl" compact />
        <FilterInput type="date" value={toDate} onChange={setToDate} label="Sampai Tgl" compact />
        {konteks === 'pendaftaran' ? (
          <>
            <FilterInput type="select" value={statusFilter} onChange={setStatusFilter} label="Status" compact options={[{ value: '', label: 'Semua Status' }, { value: 'calon', label: 'Calon' }, { value: 'aktif', label: 'Aktif' }, { value: 'batal', label: 'Batal' }]} />
            <FilterInput type="select" value={statusPembayaranFilter} onChange={setStatusPembayaranFilter} label="Pembayaran" compact options={[{ value: '', label: 'Semua Status Bayar' }, { value: 'lunas', label: 'Lunas' }, { value: 'belum', label: 'Belum Lunas' }]} />
            <FilterInput type="search" value={search} onChange={setSearch} placeholder="Cari nama..." compact />
          </>
        ) : (
          <>
            <FilterInput type="select" value={statusPembayaranFilter} onChange={setStatusPembayaranFilter} label="Status Bayar" compact options={[{ value: '', label: 'Semua Status Bayar' }, { value: 'lunas', label: 'Lunas' }, { value: 'belum', label: 'Belum Lunas' }]} />
            <FilterInput type="search" value={search} onChange={setSearch} placeholder="Cari nama siswa..." compact />
          </>
        )}
      </CollapsibleFilterCard>

      {/* Ringkasan */}
      {konteks === 'pendaftaran' ? (
        <SummaryGroupGrid>
          <SummaryGroupCard title="Pendaftaran" tone="brand" variant="featured">
            <SummaryGroupRow label="Total Mendaftar" value={totalCalon + totalAktif + totalBatal} highlight valueClassName="text-2xl" />
            <SummaryGroupRow label="Batal Daftar" value={totalBatal} />
          </SummaryGroupCard>
          <SummaryGroupCard title="Status Pembayaran" tone="emerald" variant="receipt">
            <SummaryGroupRow label="Lunas" value={totalLunas} />
            <SummaryGroupRow label="Belum Lunas" value={totalBelumLunas} />
          </SummaryGroupCard>
          <SummaryGroupCard title="Nominal Tagihan" tone="amber" variant="receipt">
            <SummaryGroupRow label="Total Tagihan" value={formatRupiah(sumPendaftaranTotal)} />
            <SummaryGroupRow label="Sudah Dibayar" value={formatRupiah(sumPendaftaranTerbayar)} />
            <SummaryGroupRow label="Sisa Tagihan" value={formatRupiah(sumPendaftaranSisa)} />
          </SummaryGroupCard>
        </SummaryGroupGrid>
      ) : (
        <SummaryGroupGrid>
          <SummaryGroupCard title="Daftar Ulang" tone="brand" variant="featured">
            <SummaryGroupRow label="Total" value={duTotal} highlight valueClassName="text-2xl" />
            <SummaryGroupRow label="Lunas" value={duLunas} />
            <SummaryGroupRow label="Belum Lunas" value={duBelum} />
          </SummaryGroupCard>
          <SummaryGroupCard title="Nominal Tagihan" tone="amber" variant="receipt">
            <SummaryGroupRow label="Total Tagihan" value={formatRupiah(sumDuTotal)} />
            <SummaryGroupRow label="Sudah Dibayar" value={formatRupiah(sumDuTerbayar)} />
            <SummaryGroupRow label="Sisa Tagihan" value={formatRupiah(sumDuSisa)} />
          </SummaryGroupCard>
        </SummaryGroupGrid>
      )}

      {/* Tabel */}
      <SectionCard>
        {konteks === 'pendaftaran' ? (
          filtered.length === 0 ? (
            <EmptyState title="Tidak ada data pendaftaran" description="Belum ada calon siswa terdaftar untuk filter yang dipilih." />
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Siswa & Wali</th>
                      <th className="px-4 py-3 font-semibold">Usia</th>
                      <th className="px-4 py-3 font-semibold">Jalur</th>
                      <th className="px-4 py-3 font-semibold">Rencana Kelas</th>
                      <th className="px-4 py-3 font-semibold text-center">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Pembayaran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {paginateData(filtered, page, pageSize).map((s) => {
                      const taTarget = tahunAjaranOptions.find((t) => t.id === s.tahun_ajaran_target_id);
                      const cutoffDate = taTarget ? getTahunAjaranCutoffDate(taTarget, 7, 1) : new Date();
                      const age = calculateAgeInYears(s.tanggal_lahir || '', cutoffDate);
                      const tagihan = pendaftaranTagihanMap.get(s.id);
                      const sisaTagihan = (tagihan?.jumlah_total || 0) - (tagihan?.sudah_dibayar || 0);
                      const kelasRencana = s.kelas_rencana_id ? kelasMap.get(s.kelas_rencana_id) : null;
                      return (
                        <tr key={s.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800 dark:text-slate-200">{s.nama}</div>
                            <div className="text-[11px] text-slate-500">{s.nama_wali} - {s.kontak_wali || 'Tanpa No HP'}</div>
                          </td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">{Math.floor(age)} thn {Math.floor((age % 1) * 12)} bln</td>
                          <td className="px-4 py-3 text-xs capitalize">{s.jalur_registrasi || 'baru'}</td>
                          <td className="px-4 py-3 text-xs">
                            <div className="font-medium text-slate-700 dark:text-slate-300">{kelasRencana ? formatKelasLabel(kelasRencana) : '-'}</div>
                            <div className="text-[11px] text-slate-500">{taTarget?.nama ?? '-'}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadgeSiswa status={s.periodStatus} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {tagihan ? (
                              <>
                                <div className="font-semibold text-sm text-slate-700 dark:text-slate-300">{formatRupiah(tagihan.jumlah_total)}</div>
                                <div className={`text-[11px] font-medium ${sisaTagihan <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-500'}`}>
                                  {sisaTagihan <= 0 ? 'Lunas' : `Sisa: ${formatRupiah(sisaTagihan)}`}
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )
        ) : (
          filteredDu.length === 0 ? (
            <EmptyState title="Tidak ada data daftar ulang" description="Belum ada tagihan daftar ulang untuk filter yang dipilih." />
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Nama Siswa</th>
                      <th className="px-4 py-3 font-semibold">Tunggakan Lalu</th>
                      <th className="px-4 py-3 font-semibold">Promo</th>
                      <th className="px-4 py-3 font-semibold text-right">Nominal DU</th>
                      <th className="px-4 py-3 font-semibold text-center">Status</th>
                      <th className="px-4 py-3 font-semibold">Tanggal Bayar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {paginateData(filteredDu, page, pageSize).map((t) => {
                      const siswa = siswaMap.get(t.siswa_id);
                      const asalKelasId = asalKelasMap.get(t.siswa_id);
                      const pembayaranList = duPembayaranMap.get(t.id) ?? [];
                      const tglBayar = pembayaranList.length > 0 ? pembayaranList.sort((a, b) => b.tanggal.localeCompare(a.tanggal))[0].tanggal : null;
                      const tunggakan = tunggakanMap.get(t.siswa_id) || 0;
                      const promoNames = t.promo_ids?.map(id => diskonMap.get(id) || 'Promo').join(', ') || '-';
                      const sisaTagihan = t.jumlah_total - t.sudah_dibayar;
                      return (
                        <tr key={t.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3">
                             <div className="font-medium text-slate-800 dark:text-slate-200">{siswa?.nama ?? '-'}</div>
                             <div className="text-[11px] text-slate-500">{asalKelasId && kelasMap.get(asalKelasId) ? `Dari: ${formatKelasLabel(kelasMap.get(asalKelasId)!)}` : '-'}</div>
                          </td>
                          <td className="px-4 py-3 text-xs">
                             {tunggakan > 0 ? <span className="text-amber-600 font-semibold">{formatRupiah(tunggakan)}</span> : <span className="text-slate-400">Tidak ada</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{promoNames}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-semibold text-sm text-slate-700 dark:text-slate-300">{formatRupiah(t.jumlah_total)}</div>
                            <div className={`text-[11px] font-medium ${sisaTagihan <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-500'}`}>
                              {sisaTagihan <= 0 ? 'Lunas' : `Sisa: ${formatRupiah(sisaTagihan)}`}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center"><StatusBadgeTagihan status={t.status} /></td>
                          <td className="px-4 py-3">{tglBayar ? formatTanggal(tglBayar) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={page} totalItems={filteredDu.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )
        )}
      </SectionCard>
    </div>
  );
}
