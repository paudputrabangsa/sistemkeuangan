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
import { formatRupiah, formatKelasLabel } from '../lib/format';
import { listTahunAjaran } from '../queries/tahunAjaranQueries';
import { db } from '../db';
import { exportLaporanDiskonExcel } from '../lib/excelGenerator';
import { generateLaporanDiskonPdf } from '../lib/pdfGenerator';

type DiskonFilter = 'semua' | 'promo' | 'manual';

export default function LaporanDiskonPage() {
  const [taFilter, setTaFilter] = useState('');
  const [diskonFilter, setDiskonFilter] = useState<DiskonFilter>('semua');
  const [promoFilter, setPromoFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const tahunAjaranOptions = useLiveQuery(() => listTahunAjaran(), [], []);

  function resetFilters() {
    setTaFilter('');
    setDiskonFilter('semua');
    setPromoFilter('');
    setSearch('');
    setPage(1);
  }

  const filterChips: FilterChip[] = [
    { key: 'ta', label: `TA: ${tahunAjaranOptions.find((t) => t.id === taFilter)?.nama ?? 'Aktif'}` },
    { key: 'diskon', label: `Diskon: ${diskonFilter === 'promo' ? 'Promo' : diskonFilter === 'manual' ? 'Manual' : 'Semua'}` },
    { key: 'promo', label: `Promo: ${promoFilter || 'Semua'}` },
  ];
  const activeYear = tahunAjaranOptions.find((t) => t.aktif || t.status === 'aktif');
  const effectiveTaId = taFilter || activeYear?.id || '';
  const tahunAjaranMap = new Map(tahunAjaranOptions.map((t) => [t.id, t.nama]));

  const semuaSiswa = useLiveQuery(() => db.siswa.toArray(), [], []);
  const siswaMap = useMemo(() => new Map(semuaSiswa.map((s) => [s.id, s])), [semuaSiswa]);

  const allKelas = useLiveQuery(() => db.kelas.toArray(), [], []);
  const kelasMap = useMemo(() => new Map(allKelas.map((k) => [k.id, k])), [allKelas]);

  const allSiswaKelas = useLiveQuery(() => db.siswa_kelas.toArray(), [], []);
  const activeKelasMap = useMemo(() => {
    const map = new Map<string, string>();
    allSiswaKelas.forEach((sk) => {
      if (!sk.selesai) map.set(sk.siswa_id, sk.kelas_id);
    });
    return map;
  }, [allSiswaKelas]);

  allKelas.forEach((k) => kelasMap.set(k.id, k));

  const tagihanBerdiskon = useLiveQuery(async () => {
    const all = await db.tagihan.toArray();
    return all.filter((t) => !t.deleted_at && (t.potongan_diskon ?? 0) > 0);
  }, [], []);

  const filtered = useMemo(() => {
    let list = tagihanBerdiskon;

    if (effectiveTaId) list = list.filter((t) => t.tahun_ajaran_id === effectiveTaId);

    if (diskonFilter === 'promo') list = list.filter((t) => t.nama_promo);
    else if (diskonFilter === 'manual') list = list.filter((t) => !t.nama_promo);

    if (promoFilter) list = list.filter((t) => t.nama_promo === promoFilter);

    const q = search.toLowerCase();
    if (q) {
      list = list.filter((t) => {
        const siswa = siswaMap.get(t.siswa_id);
        return siswa?.nama.toLowerCase().includes(q);
      });
    }

    return list.sort((a, b) => (b.jatuh_tempo || '').localeCompare(a.jatuh_tempo || ''));
  }, [tagihanBerdiskon, effectiveTaId, diskonFilter, promoFilter, search, siswaMap]);

  const summary = useMemo(() => {
    let totalDiskon = 0;
    let totalDiskonPromo = 0;
    let totalDiskonManual = 0;
    const siswaSet = new Set<string>();
    const promoSet = new Set<string>();
    const breakdownPromo = new Map<string, { count: number; total: number }>();
    const breakdownJenis = new Map<string, number>();

    for (const t of filtered) {
      const diskon = t.potongan_diskon ?? 0;
      totalDiskon += diskon;
      siswaSet.add(t.siswa_id);

      if (t.nama_promo) {
        totalDiskonPromo += diskon;
        const promoList = t.nama_promo.split(',').map((s: string) => s.trim());
        promoList.forEach((p: string) => {
          promoSet.add(p);
          const existing = breakdownPromo.get(p) ?? { count: 0, total: 0 };
          existing.total += diskon;
          breakdownPromo.set(p, existing);
        });
      } else {
        totalDiskonManual += diskon;
      }

      const jns = t.jenis;
      breakdownJenis.set(jns, (breakdownJenis.get(jns) ?? 0) + diskon);
    }

    // Count unique students per promo
    for (const t of filtered) {
      if (t.nama_promo) {
        const promoList = t.nama_promo.split(',').map((s: string) => s.trim());
        promoList.forEach((p: string) => {
          const existing = breakdownPromo.get(p);
          if (existing) existing.count += 1;
        });
      }
    }

    return {
      totalDiskon,
      totalDiskonPromo,
      totalDiskonManual,
      siswaPenerima: siswaSet.size,
      promoAktif: promoSet.size,
      rataRata: siswaSet.size > 0 ? Math.round(totalDiskon / siswaSet.size) : 0,
      breakdownPromo,
      breakdownJenis,
    };
  }, [filtered]);

  const promoOptions = useMemo(() => {
    const names = new Set<string>();
    tagihanBerdiskon.forEach((t) => {
      if (t.nama_promo) {
        t.nama_promo.split(',').map((s: string) => s.trim()).forEach((p: string) => names.add(p));
      }
    });
    return [{ value: '', label: 'Semua Promo' }, ...Array.from(names).sort().map((n) => ({ value: n, label: n }))];
  }, [tagihanBerdiskon]);

  const diskonFilterCtx = [
    `Tahun Ajaran: ${tahunAjaranMap.get(effectiveTaId) ?? 'Semua'}`,
    `Jenis: ${diskonFilter === 'promo' ? 'Diskon Promo' : diskonFilter === 'manual' ? 'Potongan Manual' : 'Semua Diskon'}`,
    promoFilter ? `Promo: ${promoFilter}` : '',
    search ? `Cari: ${search}` : '',
  ].filter(Boolean).join(' | ');

  const handleExportExcel = () => exportLaporanDiskonExcel(filtered, siswaMap, kelasMap, activeKelasMap, tahunAjaranMap, summary, diskonFilterCtx);
  const handleExportPdf = () => {
    generateLaporanDiskonPdf(filtered, siswaMap, kelasMap, activeKelasMap, summary, diskonFilterCtx);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader title="Laporan Diskon" description="Rekap seluruh diskon dan potongan yang dinikmati siswa, termasuk diskon promo dan potongan manual." actions={
        <div className="flex gap-2">
          <button type="button" onClick={handleExportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Cetak Excel</button>
          <button type="button" onClick={handleExportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Cetak PDF</button>
        </div>
      } />

      <CollapsibleFilterCard chips={filterChips} summary={`Menampilkan ${filtered.length} tagihan berdiskon`} onReset={resetFilters}>
        <FilterInput type="select" value={taFilter} onChange={setTaFilter} label="Tahun Ajaran" compact options={[{ value: '', label: 'Aktif' }, ...tahunAjaranOptions.filter((t) => !t.deleted_at).map((t) => ({ value: t.id, label: t.nama }))]} />
        <FilterInput type="select" value={diskonFilter} onChange={(v) => setDiskonFilter(v as DiskonFilter)} label="Sumber Diskon" compact options={[{ value: 'semua', label: 'Semua Diskon' }, { value: 'promo', label: 'Diskon Promo' }, { value: 'manual', label: 'Potongan Manual' }]} />
        <FilterInput type="select" value={promoFilter} onChange={setPromoFilter} label="Promo" compact options={promoOptions} />
        <FilterInput type="search" value={search} onChange={setSearch} placeholder="Cari nama siswa..." compact />
      </CollapsibleFilterCard>

      {/* Ringkasan */}
      <SummaryGroupGrid>
        <SummaryGroupCard title="Ringkasan Diskon" tone="brand" variant="featured">
          <SummaryGroupRow label="Total Diskon" value={formatRupiah(summary.totalDiskon)} highlight valueClassName="text-2xl" />
          <SummaryGroupRow label="Siswa Penerima" value={`${summary.siswaPenerima} siswa`} />
          <SummaryGroupRow label="Rata-rata Diskon" value={formatRupiah(summary.rataRata)} />
        </SummaryGroupCard>
        <SummaryGroupCard title="Sumber Diskon" tone="emerald" variant="receipt">
          <SummaryGroupRow label="Diskon Promo" value={formatRupiah(summary.totalDiskonPromo)} />
          <SummaryGroupRow label="Potongan Manual" value={formatRupiah(summary.totalDiskonManual)} />
          <SummaryGroupRow label="Jenis Promo Aktif" value={`${summary.promoAktif} promo`} />
        </SummaryGroupCard>
      </SummaryGroupGrid>

      {/* Breakdown per Promo */}
      {summary.breakdownPromo.size > 0 && (
        <SectionCard title="Breakdown per Promo">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Promo</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Diskon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {Array.from(summary.breakdownPromo.entries()).sort((a, b) => b[1].total - a[1].total).map(([nama, data]) => (
                  <tr key={nama} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{nama}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatRupiah(data.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Breakdown per Jenis Tagihan */}
      {summary.breakdownJenis.size > 0 && (
        <SectionCard title="Breakdown per Jenis Tagihan">
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Jenis Tagihan</th>
                  <th className="px-4 py-3 font-semibold text-right">Total Diskon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {Array.from(summary.breakdownJenis.entries()).sort((a, b) => b[1] - a[1]).map(([jenis, total]) => (
                  <tr key={jenis} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-medium capitalize text-slate-800 dark:text-slate-200">{jenis}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatRupiah(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Detail per Siswa */}
      <SectionCard
        title="Detail Diskon per Siswa"
        actions={promoOptions.length > 1 && (
          <select
            value={promoFilter}
            onChange={(e) => setPromoFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="">Semua Promo</option>
            {promoOptions.slice(1).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      >
        {filtered.length === 0 ? (
          <EmptyState title="Tidak ada data diskon" description="Belum ada tagihan dengan diskon untuk filter yang dipilih." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nama Siswa</th>
                    <th className="px-4 py-3 font-semibold">Jenis Tagihan</th>
                    <th className="px-4 py-3 font-semibold">Promo</th>
                    <th className="px-4 py-3 font-semibold text-right">Tarif Normal</th>
                    <th className="px-4 py-3 font-semibold text-right">Diskon</th>
                    <th className="px-4 py-3 font-semibold text-right">Tagihan</th>
                    <th className="px-4 py-3 font-semibold">Sumber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {paginateData(filtered, page, pageSize).map((t) => {
                    const siswa = siswaMap.get(t.siswa_id);
                    const tarifNormal = t.jumlah_total + (t.potongan_diskon ?? 0);
                    const kelasId = activeKelasMap.get(t.siswa_id);
                    const kelas = kelasMap.get(kelasId ?? '');
                    return (
                      <tr key={t.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                          {siswa?.nama ?? '-'}
                          <span className="ml-2 text-xs text-slate-400">{kelas ? formatKelasLabel(kelas) : ''}</span>
                        </td>
                        <td className="px-4 py-3 capitalize">{t.jenis}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{t.nama_promo || '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatRupiah(tarifNormal)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-danger-600">{formatRupiah(t.potongan_diskon ?? 0)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatRupiah(t.jumlah_total)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.nama_promo ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                            {t.nama_promo ? 'Promo' : 'Manual'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
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
