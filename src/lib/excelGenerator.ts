import ExcelJS from 'exceljs';
import { formatTanggal, formatKelasLabel, formatMonthYear } from './format';
import { calculateAgeInYears, getTahunAjaranCutoffDate } from '../services/service-helpers';

// Helper for formatting
const getAdminName = (id: string, akunMap?: Map<string, string>) => {
  return akunMap?.get(id) || 'Sistem';
};

async function downloadExcel(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function addDataToSheet(ws: ExcelJS.Worksheet, data: any[], filterContext: string) {
  ws.addRow([`Filter: ${filterContext}`]);
  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    ws.addRow(headers);
    data.forEach(item => {
      const row: any[] = [];
      headers.forEach(h => row.push(item[h]));
      ws.addRow(row);
    });
  }
}

export async function exportDaftarTunggakanExcel(
  siswaTunggakan: any[],
  allTagihanTunggakan: any[],
  _fromDate: string, 
  _toDate: string,
  filterContext?: string,
  tahunAjaranMap?: Map<string, string>
) {
  const ctx = filterContext || '';
  const sheet1Data = siswaTunggakan.map(s => {
    let spp = 0, pendaftaran = 0, kegiatan = 0;
    s.tunggakanList.forEach((t: any) => {
      const sisa = t.jumlah_total - t.sudah_dibayar;
      if (t.jenis === 'spp') spp += sisa;
      else if (t.jenis === 'pendaftaran') pendaftaran += sisa;
      else kegiatan += sisa;
    });
    return {
      'Nama Siswa': s.siswa.nama,
      'Kelas': s.kelas ? formatKelasLabel(s.kelas) : '-',
      'Status Siswa': s.siswa.status,
      'Total Tunggakan SPP': spp,
      'Total Tunggakan Pendaftaran': pendaftaran,
      'Total Tunggakan Kegiatan': kegiatan,
      'Grand Total': spp + pendaftaran + kegiatan
    };
  });

  const sheet2Data = allTagihanTunggakan.map(t => ({
    'Nama Siswa': t.siswa?.nama || '-',
    'Kelas': t.activeClass ? formatKelasLabel(t.activeClass) : '-',
    'Jenis Tagihan': t.nama_tagihan || t.jenis,
    'Bulan': t.bulan_tahun ? formatMonthYear(t.bulan_tahun) : '-',
    'Asal TA': (t.tahun_ajaran?.nama) || tahunAjaranMap?.get(t.tahun_ajaran_id) || '-',
    'Nominal Tagihan': t.jumlah_total,
    'Sudah Dibayar': t.sudah_dibayar,
    'Sisa': t.jumlah_total - t.sudah_dibayar
  }));

  const wb = new ExcelJS.Workbook();
  const ws1 = wb.addWorksheet('Ringkasan per Siswa');
  const ws2 = wb.addWorksheet('Detail per Tagihan');
  
  addDataToSheet(ws1, sheet1Data, ctx);
  addDataToSheet(ws2, sheet2Data, ctx);
  
  await downloadExcel(wb, `Laporan_Tunggakan.xlsx`);
}

export async function exportRekapPenerimaanExcel(
  transaksiList: any[],
  akunMap: Map<string, string>,
  fromDate: string, 
  toDate: string,
  filterContext?: string
) {
  const ctx = filterContext || '';
  let totalNominal = 0, totalTunai = 0, totalTransfer = 0, totalTabungan = 0;

  const formattedData = transaksiList.map(item => {
    totalNominal += item.jumlah;
    if (item.metode === 'Tunai') totalTunai += item.jumlah;
    if (item.metode === 'Transfer') totalTransfer += item.jumlah;
    if (item.metode === 'Tabungan') totalTabungan += item.jumlah;

    return {
      'Nomor Kwitansi': item.no_kuitansi || '-',
      'Tanggal': formatTanggal(item.tanggal),
      'Nama Siswa': item.siswa?.nama || '-',
      'Kelas': item.activeClass ? formatKelasLabel(item.activeClass) : '-',
      'Tagihan yang dibayar': item.tagihan?.nama_tagihan || item.tagihan?.jenis || '-',
      'Nominal per Tagihan': item.jumlah,
      'Total Transaksi': item.jumlah,
      'Tunai': item.metode === 'Tunai' ? item.jumlah : 0,
      'Transfer': item.metode === 'Transfer' ? item.jumlah : 0,
      'Tabungan': item.metode === 'Tabungan' ? item.jumlah : 0,
      'Status': item.status_verifikasi === 'terverifikasi' ? 'Valid' : item.status_verifikasi === 'menunggu_verifikasi' ? 'Menunggu' : 'Batal',
      'Admin Pencatat': getAdminName(item.user_id, akunMap)
    };
  });

  formattedData.push({
    'Nomor Kwitansi': 'SUBTOTAL', 'Tanggal': '', 'Nama Siswa': '', 'Kelas': '',
    'Tagihan yang dibayar': '', 'Nominal per Tagihan': totalNominal,
    'Total Transaksi': totalNominal, 'Tunai': totalTunai, 'Transfer': totalTransfer,
    'Tabungan': totalTabungan, 'Status': '', 'Admin Pencatat': ''
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Penerimaan');
  addDataToSheet(ws, formattedData, ctx);
  await downloadExcel(wb, `Laporan_Penerimaan_${fromDate}_${toDate}.xlsx`);
}

export async function exportLaporanPerSiswaExcel(
  siswaData: any, 
  tagihanList: any[],
  pembayaranMap: Map<string, any[]>,
  filterContext?: string,
  tahunAjaranMap?: Map<string, string>
) {
  const ctx = filterContext || '';
  const formattedData = tagihanList.map(t => {
    const bayar = pembayaranMap.get(t.id) || [];
    const validBayar = bayar.filter(b => b.status === 'valid');
    const lastBayar = validBayar.length > 0 ? validBayar[validBayar.length - 1] : null;
    return {
      'Asal TA': (t.tahun_ajaran?.nama) || tahunAjaranMap?.get(t.tahun_ajaran_id) || '-',
      'Jenis Tagihan': t.nama_tagihan || t.jenis,
      'Bulan': t.bulan_tahun ? formatMonthYear(t.bulan_tahun) : '-',
      'Nominal': t.jumlah_total,
      'Sudah Dibayar': t.sudah_dibayar,
      'Sisa': t.jumlah_total - t.sudah_dibayar,
      'Status': t.status,
      'Tanggal Bayar Terakhir': lastBayar ? formatTanggal(lastBayar.tanggal) : '-',
      'Nomor Kwitansi Terakhir': lastBayar?.no_kuitansi || '-'
    };
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rekap Siswa');
  addDataToSheet(ws, formattedData, ctx);
  await downloadExcel(wb, `Rekap_Siswa_${siswaData?.nama?.replace(/\s+/g, '_')}.xlsx`);
}

export async function exportLaporanPendaftaranExcel(
  siswaList: any[],
  tagihanPendaftaranMap: Map<string, any>,
  activationDateMap: Map<string, string>,
  tahunAjaranMap: Map<string, string>,
  kelasMap: Map<string, any>,
  filterContext?: string
) {
  const ctx = filterContext || '';
  const formattedData = siswaList.map(siswa => {
    const tagihan = tagihanPendaftaranMap.get(siswa.id);
    const nominalTagihan = tagihan ? tagihan.jumlah_total : 0;
    const sudahDibayar = tagihan ? tagihan.sudah_dibayar : 0;
    const sisaTagihan = nominalTagihan - sudahDibayar;
    const statusPembayaran = tagihan ? tagihan.status : 'belum_bayar';
    const tglAktivasi = activationDateMap.get(siswa.id);
    
    const taTarget = { id: siswa.tahun_ajaran_target_id, nama: tahunAjaranMap.get(siswa.tahun_ajaran_target_id) || '' };
    const cutoffDate = getTahunAjaranCutoffDate(taTarget as any, 7, 1);
    const age = calculateAgeInYears(siswa.tanggal_lahir, cutoffDate);
    const kelasRencana = siswa.kelas_rencana_id ? kelasMap.get(siswa.kelas_rencana_id) : null;

    return {
      'NIS': siswa.nis || '-',
      'No Pendaftaran': siswa.no_pendaftaran || '-',
      'Nama Siswa': siswa.nama,
      'Usia (Tahun)': Math.floor(age),
      'Usia (Bulan)': Math.floor((age % 1) * 12),
      'Tanggal Daftar': formatTanggal(siswa.tanggal_daftar),
      'Tanggal Aktivasi': tglAktivasi ? formatTanggal(tglAktivasi) : '-',
      'Jalur Registrasi': siswa.jalur_registrasi === 'migrasi' ? 'Migrasi' : siswa.jalur_registrasi === 'pindahan' ? 'Pindahan' : 'Baru',
      'Rencana Kelas': kelasRencana ? formatKelasLabel(kelasRencana) : '-',
      'Tahun Ajaran Target': taTarget.nama || '-',
      'Biaya Pendaftaran': nominalTagihan,
      'Sudah Dibayar': sudahDibayar,
      'Sisa Tagihan': sisaTagihan,
      'Status': statusPembayaran,
      'Nama Wali': siswa.nama_wali,
      'Kontak Wali': siswa.kontak_wali,
    };
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pendaftaran');
  addDataToSheet(ws, formattedData, ctx);
  await downloadExcel(wb, `Laporan_Pendaftaran.xlsx`);
}

export async function exportLaporanAktivasiExcel(
  siswaList: any[],
  taAsal: any,
  taTujuan: any,
  filterContext?: string
) {
  const ctx = filterContext || '';
  const formattedData = siswaList.map(siswa => {
    const kelasLabel = siswa.kelasAsal ? formatKelasLabel(siswa.kelasAsal) : '-';
    const asalSiswa = siswa.jalur_registrasi === 'migrasi' ? 'Migrasi' :
      siswa.jalur_registrasi === 'pindahan' ? 'Pindahan' :
        siswa.status === 'calon' ? 'Calon Baru' : 'Baru';
    return {
      'NIS': siswa.nis || '-',
      'No Pendaftaran': siswa.no_pendaftaran || '-',
      'Nama Siswa': siswa.nama,
      'Kelas': kelasLabel,
      'Tanggal Daftar': formatTanggal(siswa.tanggal_daftar),
      'Tanggal Aktivasi': formatTanggal(siswa.updated_at),
      'Jalur Registrasi': siswa.jalur_registrasi === 'migrasi' ? 'Migrasi' : siswa.jalur_registrasi === 'pindahan' ? 'Pindahan' : 'Baru',
      'Sumber': siswa.sumber_data === 'import_excel' ? 'Import Excel' : 'Manual',
      'Asal': asalSiswa,
      'TA Asal': taAsal?.nama ?? '-',
      'TA Tujuan': taTujuan?.nama ?? '-',
      'Status': 'Aktif',
    };
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Aktivasi');
  addDataToSheet(ws, formattedData, ctx);
  await downloadExcel(wb, `Laporan_Aktivasi.xlsx`);
}

export async function exportLaporanAuditExcel(
  logs: any[],
  akunMap: Map<string, string>,
  filterContext?: string
) {
  const ctx = filterContext || '';
  const formattedData = logs.map(log => ({
    'Waktu': formatTanggal(log.created_at),
    'Tabel': log.tabel,
    'Aksi': log.aksi,
    'Admin': getAdminName(log.user_id, akunMap),
    'Detail': log.deskripsi || '-',
  }));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Audit');
  addDataToSheet(ws, formattedData, ctx);
  await downloadExcel(wb, `Laporan_Audit.xlsx`);
}

export async function exportLaporanDaftarUlangExcel(
  tagihanList: any[],
  siswaMap: Map<string, any>,
  kelasMap: Map<string, any>,
  kelasRencanaMap: Map<string, string>,
  duPembayaranMap: Map<string, any[]>,
  tunggakanMap: Map<string, number>,
  diskonMap: Map<string, string>,
  tahunAjaranMap: Map<string, string>,
  filterContext?: string
) {
  const ctx = filterContext || '';
  const formattedData = tagihanList.map(t => {
    const siswa = siswaMap.get(t.siswa_id);
    const kelasId = kelasRencanaMap.get(t.siswa_id);
    const kelas = kelasMap.get(kelasId ?? '');
    const bayar = duPembayaranMap.get(t.id) || [];
    const totalBayar = bayar.reduce((s, b) => s + (b.jumlah || 0), 0);
    const tunggakan = tunggakanMap.get(t.siswa_id) || 0;
    const promoNames = t.promo_ids?.map((id: string) => diskonMap.get(id) || 'Promo').join(', ') || '-';
    return {
      'NIS': siswa?.nis || '-',
      'Nama Siswa': siswa?.nama || '-',
      'Kelas Tujuan': kelas ? formatKelasLabel(kelas) : '-',
      'TA Tujuan': tahunAjaranMap.get(t.tahun_ajaran_id) || '-',
      'Tagihan': t.nama_tagihan || t.jenis,
      'Tunggakan Tahun Sebelumnya': tunggakan,
      'Promo': promoNames,
      'Nominal Tagihan': t.jumlah_total,
      'Sudah Dibayar': t.sudah_dibayar,
      'Total Dibayar': totalBayar,
      'Sisa Tagihan': t.jumlah_total - t.sudah_dibayar,
      'Status': t.status,
    };
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Daftar Ulang');
  addDataToSheet(ws, formattedData, ctx);
  await downloadExcel(wb, `Laporan_Daftar_Ulang.xlsx`);
}

export async function exportLaporanDiskonExcel(
  tagihanList: any[],
  siswaMap: Map<string, any>,
  kelasMap: Map<string, any>,
  activeKelasMap: Map<string, string>,
  tahunAjaranMap: Map<string, string>,
  _summary: any,
  filterContext?: string
) {
  const ctx = filterContext || '';
  const formattedData = tagihanList.map((t) => {
    const siswa = siswaMap.get(t.siswa_id);
    const tarifNormal = t.jumlah_total + (t.potongan_diskon ?? 0);
    const kelasId = activeKelasMap.get(t.siswa_id);
    const kelas = kelasMap.get(kelasId ?? '');
    return {
      'Nama Siswa': siswa?.nama ?? '-',
      'Kelas': kelas ? formatKelasLabel(kelas) : '-',
      'Jenis Tagihan': t.jenis,
      'Promo': t.nama_promo || '-',
      'Tarif Normal': tarifNormal,
      'Diskon': t.potongan_diskon ?? 0,
      'Tagihan Akhir': t.jumlah_total,
      'Sumber': t.nama_promo ? 'Promo' : 'Manual',
      'TA': tahunAjaranMap.get(t.tahun_ajaran_id) || '-',
    };
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Detail Diskon');
  addDataToSheet(ws, formattedData, ctx);
  await downloadExcel(wb, `Laporan_Diskon.xlsx`);
}

export async function exportSiswaToExcel(
  siswaList: any[],
  kelasMap: Map<string, any>,
  assignments: any[],
  filterContext?: string
) {
  const ctx = filterContext || '';
  const formattedData = siswaList.map(siswa => {
    const assignment = assignments.find((a: any) => a.siswa_id === siswa.id && !a.selesai);
    const kelas = assignment ? kelasMap.get(assignment.kelas_id) : null;
    return {
      'Nama Siswa': siswa.nama,
      'NIS': siswa.nis || '-',
      'Jenis Kelamin': siswa.jenis_kelamin === 'L' ? 'Laki-laki' : siswa.jenis_kelamin === 'P' ? 'Perempuan' : '-',
      'Tanggal Lahir': siswa.tanggal_lahir ? formatTanggal(siswa.tanggal_lahir) : '-',
      'Status': siswa.status,
      'Kelas Aktif': kelas ? formatKelasLabel(kelas) : '-',
      'Nama Wali': siswa.nama_wali || '-',
      'Kontak Wali': siswa.kontak_wali || '-',
      'Tanggal Daftar': siswa.tanggal_daftar ? formatTanggal(siswa.tanggal_daftar) : '-'
    };
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Daftar Siswa');
  addDataToSheet(ws, formattedData, ctx);
  await downloadExcel(wb, `Data_Siswa.xlsx`);
}
