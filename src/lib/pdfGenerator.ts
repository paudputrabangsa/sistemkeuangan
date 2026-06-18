import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../db';
import { formatRupiah, formatTanggal, formatKelasLabel, formatMonthYear } from './format';

async function getSchoolProfile() {
  const profiles = await db.profil_sekolah.toArray();
  return profiles.find((p) => !p.deleted_at) || {
    nama_sekolah: 'PAUD / TK AL-FALAH',
    alamat_jalan: 'Jl. Contoh Alamat No. 123',
    telepon: '081234567890',
    nama_kepsek: 'Kepala Sekolah',
    nama_bendahara: 'Bendahara',
    alamat_kecamatan: 'Jakarta'
  };
}

function addHeader(doc: jsPDF, profile: any, title: string, subtitle?: string) {
  const pageWidth = doc.internal.pageSize.width;
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(profile.nama_sekolah.toUpperCase(), pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const alamat = profile.alamat_jalan || profile.alamat || '';
  const telp = profile.telepon ? `Telp: ${profile.telepon}` : '';
  doc.text(`${alamat} ${telp}`, pageWidth / 2, 21, { align: 'center' });
  
  doc.line(14, 25, pageWidth - 14, 25);
  doc.line(14, 26, pageWidth - 14, 26);
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 35, { align: 'center' });
  
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, pageWidth / 2, 41, { align: 'center' });
  }
}

function addOfficialSignatures(doc: jsPDF, profile: any, endY: number) {
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  
  let footerY = endY + 20;
  if (footerY > pageHeight - 40) {
    doc.addPage();
    footerY = 40;
  }

  const today = formatTanggal(new Date().toISOString().substring(0, 10));
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const kota = profile.alamat_kecamatan || 'Jakarta';
  doc.text(`${kota}, ${today}`, pageWidth - 14, footerY, { align: 'right' });
  
  doc.text('Mengetahui,', 40, footerY + 5, { align: 'center' });
  doc.text('Kepala Sekolah', 40, footerY + 10, { align: 'center' });
  doc.text(profile.nama_kepsek || '(_______________________)', 40, footerY + 30, { align: 'center' });
  
  doc.text('Bendahara', pageWidth - 40, footerY + 10, { align: 'center' });
  doc.text(profile.nama_bendahara || '(_______________________)', pageWidth - 40, footerY + 30, { align: 'center' });
}

export async function generateDaftarTunggakanPdf(
  siswaTunggakan: any[], 
  summary: { totalTunggakan: number; countSiswa: number; spp: number; pendaftaran: number; kegiatan: number },
  subtitleFilter: string
) {
  const doc = new jsPDF();
  const profile = await getSchoolProfile();
  
  addHeader(doc, profile, 'LAPORAN TUNGGAKAN SISWA', subtitleFilter);
  
  // Ringkasan
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Keseluruhan Tunggakan : ${formatRupiah(summary.totalTunggakan)}`, 14, 50);
  doc.text(`Jumlah Siswa Menunggak     : ${summary.countSiswa} Siswa`, 14, 55);
  doc.text(`Tunggakan SPP              : ${formatRupiah(summary.spp)}`, 110, 50);
  doc.text(`Tunggakan Pendaftaran      : ${formatRupiah(summary.pendaftaran)}`, 110, 55);
  doc.text(`Tunggakan Kegiatan         : ${formatRupiah(summary.kegiatan)}`, 110, 60);
  
  const tableData: any[] = [];
  siswaTunggakan.forEach((s, index) => {
    let spp = 0, pendaftaran = 0, kegiatan = 0;
    
    s.tunggakanList.forEach((t: any) => {
      const sisa = t.jumlah_total - t.sudah_dibayar;
      if (t.jenis === 'spp') spp += sisa;
      else if (t.jenis === 'pendaftaran') pendaftaran += sisa;
      else kegiatan += sisa;
    });

    const grandTotal = spp + pendaftaran + kegiatan;

    tableData.push([
      index + 1,
      s.siswa.nama,
      s.kelas ? formatKelasLabel(s.kelas) : '-',
      s.siswa.status,
      formatRupiah(spp),
      formatRupiah(pendaftaran),
      formatRupiah(kegiatan),
      formatRupiah(grandTotal)
    ]);
  });
  
  autoTable(doc, {
    startY: 68,
    head: [['No', 'Nama Siswa', 'Kelas', 'Status', 'Tgk. SPP', 'Tgk. Pendaftaran', 'Tgk. Kegiatan', 'Grand Total']],
    body: tableData,
    foot: [['', '', '', 'Total', formatRupiah(summary.spp), formatRupiah(summary.pendaftaran), formatRupiah(summary.kegiatan), formatRupiah(summary.totalTunggakan)]],
    theme: 'grid',
    headStyles: { fillColor: [192, 57, 43], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
    styles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' }
    }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY;
  addOfficialSignatures(doc, profile, finalY);
  
  doc.save(`Laporan_Tunggakan.pdf`);
}

export async function generateRekapPenerimaanPdf(
  transaksiList: any[], 
  summary: { total: number; spp: number; pendaftaran: number; kegiatan: number; tunai: number; transfer: number; tabungan: number },
  subtitleFilter: string
) {
  const doc = new jsPDF();
  const profile = await getSchoolProfile();
  
  addHeader(doc, profile, 'LAPORAN PENERIMAAN', subtitleFilter);
  
  // Ringkasan
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Penerimaan : ${formatRupiah(summary.total)}`, 14, 50);
  
  doc.text(`SPP         : ${formatRupiah(summary.spp)}`, 14, 57);
  doc.text(`Pendaftaran : ${formatRupiah(summary.pendaftaran)}`, 14, 62);
  doc.text(`Kegiatan    : ${formatRupiah(summary.kegiatan)}`, 14, 67);

  doc.text(`Tunai    : ${formatRupiah(summary.tunai)}`, 110, 57);
  doc.text(`Transfer : ${formatRupiah(summary.transfer)}`, 110, 62);
  doc.text(`Tabungan : ${formatRupiah(summary.tabungan)}`, 110, 67);
  
  const tableData = transaksiList.map(item => [
    formatTanggal(item.tanggal),
    item.siswa?.nama || '-',
    item.activeClass ? formatKelasLabel(item.activeClass) : '-',
    item.tagihan?.nama_tagihan || item.tagihan?.jenis || '-',
    formatRupiah(item.jumlah),
    item.metode
  ]);
  
  autoTable(doc, {
    startY: 75,
    head: [['Tanggal', 'Nama Siswa', 'Kelas', 'Tagihan', 'Nominal', 'Metode']],
    body: tableData,
    foot: [['', '', '', 'Total', formatRupiah(summary.total), '']],
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
    styles: { fontSize: 8 },
    columnStyles: {
      4: { halign: 'right' }
    }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY;
  addOfficialSignatures(doc, profile, finalY);
  
  doc.save(`Laporan_Penerimaan.pdf`);
}

export async function generateLaporanPerSiswaPdf(
  siswaData: any,
  tagihanList: any[],
  pembayaranMap: Map<string, any[]>,
  summary: { totalTagihan: number; totalDibayar: number; sisaUtang: number },
  subtitleFilter?: string,
  tahunAjaranMap?: Map<string, string>
) {
  const doc = new jsPDF();
  const profile = await getSchoolProfile();
  
  const subtitle = [`Tanggal Cetak: ${formatTanggal(new Date().toISOString().substring(0, 10))}`, subtitleFilter].filter(Boolean).join(' | ');
  addHeader(doc, profile, 'REKAP POSISI KEUANGAN SISWA', subtitle);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nama Siswa : ${siswaData?.nama}`, 14, 48);
  doc.text(`Kelas      : ${siswaData?.activeClass ? formatKelasLabel(siswaData.activeClass) : '-'}`, 14, 53);
  doc.text(`Status     : ${siswaData?.status}`, 14, 58);

  doc.text(`Total Tagihan : ${formatRupiah(summary.totalTagihan)}`, 110, 48);
  doc.text(`Total Dibayar : ${formatRupiah(summary.totalDibayar)}`, 110, 53);
  doc.text(`Sisa Outstanding : ${formatRupiah(summary.sisaUtang)}`, 110, 58);
  
  let currentY = 68;

  tagihanList.forEach((t) => {
    const sisa = t.jumlah_total - t.sudah_dibayar;
    const tableData = [
      [
        (t.tahun_ajaran?.nama) || tahunAjaranMap?.get(t.tahun_ajaran_id) || '-',
        t.jenis,
        t.bulan_tahun ? formatMonthYear(t.bulan_tahun) : '-',
        formatRupiah(t.jumlah_total),
        formatRupiah(t.sudah_dibayar),
        formatRupiah(sisa),
        t.status
      ]
    ];

    autoTable(doc, {
      startY: currentY,
      head: [['Asal TA', 'Jenis', 'Bulan', 'Nominal', 'Sudah Dibayar', 'Sisa', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [44, 62, 80], textColor: 255 },
      styles: { fontSize: 8 },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY;

    const bayar = pembayaranMap.get(t.id) || [];
    const validBayar = bayar.filter((b) => b.status === 'valid');
    
    if (validBayar.length > 0) {
      const historyData = validBayar.map(b => [
        formatTanggal(b.tanggal),
        formatRupiah(b.jumlah),
        b.metode,
        b.no_kuitansi || '-'
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Tanggal Pembayaran', 'Nominal', 'Metode', 'No Kwitansi']],
        body: historyData,
        theme: 'plain',
        headStyles: { fillColor: [240, 240, 240], textColor: 100 },
        styles: { fontSize: 8, textColor: 100 },
        margin: { left: 24 }, // Indent
        columnStyles: {
          1: { halign: 'right' }
        }
      });
      currentY = (doc as any).lastAutoTable.finalY + 5;
    } else {
      currentY += 5;
    }
  });
  
  doc.save(`Rekap_Siswa_${siswaData?.nama?.replace(/\s+/g, '_')}.pdf`);
}

export async function generateLaporanPendaftaranPdf(
  calonSiswaList: any[],
  _tahunAjaranMap: Map<string, string>,
  pendaftaranTagihanMap: Map<string, any>,
  aktivasiDateMap: Map<string, string>,
  summary: { totalPendaftar: number; aktif: number; batal: number },
  subtitleFilter: string
) {
  const doc = new jsPDF();
  const profile = await getSchoolProfile();
  
  addHeader(doc, profile, 'REKAP PENERIMAAN SISWA BARU', subtitleFilter);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Calon Mendaftar : ${summary.totalPendaftar} Anak`, 14, 48);
  doc.text(`Sudah Diaktifkan      : ${summary.aktif} Anak`, 14, 53);
  doc.text(`Batal                 : ${summary.batal} Anak`, 14, 58);
  
  const tableData = calonSiswaList.map((s) => {
    const tagihan = pendaftaranTagihanMap.get(s.id);
    const statusBayar = tagihan ? tagihan.status : 'belum';
    const aktivasi = s.periodStatus === 'aktif' ? aktivasiDateMap.get(s.id) : null;
    const periodStatus = s.periodStatus === 'batal_daftar' ? 'Batal' : (s.periodStatus === 'calon' ? 'Calon' : 'Aktif');

    return [
      s.nama,
      formatTanggal(s.tanggal_daftar),
      periodStatus,
      statusBayar,
      aktivasi ? formatTanggal(aktivasi) : '-'
    ];
  });
  
  autoTable(doc, {
    startY: 65,
    head: [['Nama Calon Siswa', 'Tgl Daftar', 'Status Pendaftaran', 'Status Bayar Pendaf.', 'Tgl Aktivasi']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [39, 174, 96], textColor: 255 },
    styles: { fontSize: 8 }
  });
  
  doc.save(`Laporan_Pendaftaran.pdf`);
}

export async function generateLaporanAktivasiPdf(
  aktivasiList: any[],
  summary: { naikKelompok: number; tinggalKelas: number; lulus: number; tidakDaftarUlang: number },
  subtitleFilter: string
) {
  const doc = new jsPDF();
  const profile = await getSchoolProfile();

  addHeader(doc, profile, 'LAPORAN AKTIVASI (LANJUT TAHUN AJARAN)', subtitleFilter);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Naik Kelompok       : ${summary.naikKelompok} Siswa`, 14, 48);
  doc.text(`Tinggal Kelas        : ${summary.tinggalKelas} Siswa`, 14, 53);
  doc.text(`Lulus                : ${summary.lulus} Siswa`, 14, 58);
  doc.text(`Tidak Daftar Ulang   : ${summary.tidakDaftarUlang} Siswa`, 14, 63);

  const tableData = aktivasiList.map((item) => [
    item.siswa?.nama || '-',
    item.kelasAsal ? formatKelasLabel(item.kelasAsal) : '-',
    item.kelasTujuan ? formatKelasLabel(item.kelasTujuan) : '-',
    {
      naik_kelompok: 'Naik Kelompok',
      tinggal_kelas: 'Tinggal Kelas',
      lulus: 'Lulus',
      tidak_daftar_ulang: 'Tidak Daftar Ulang',
    }[item.kategori as string] ?? item.kategori ?? '-',
    formatTanggal(item.tanggal),
    item.detail || '-',
  ]);

  autoTable(doc, {
    startY: 70,
    head: [['Nama Siswa', 'Kelompok Asal', 'Kelompok Baru', 'Kategori', 'Tanggal', 'Detail']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [142, 68, 173], textColor: 255 },
    styles: { fontSize: 8 },
  });

  doc.save(`Laporan_Aktivasi.pdf`);
}

export async function generateLaporanAuditPdf(
  auditLogs: any[],
  akunMap: Map<string, string>,
  subtitleFilter: string
) {
  const doc = new jsPDF();
  const profile = await getSchoolProfile();
  
  addHeader(doc, profile, 'LOG AUDIT SISTEM', subtitleFilter);
  
  const tableData = auditLogs.map((log) => {
    const admin = akunMap.get(log.user_id) || 'Sistem';
    const payload = log.payload || {};
    const beforeStr = payload.before ? JSON.stringify(payload.before) : '-';
    const afterStr = payload.after ? JSON.stringify(payload.after) : '-';
    
    return [
      new Date(log.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      admin,
      log.aksi,
      log.tabel,
      payload.nama_siswa || '-',
      payload.no_referensi || '-',
      `${beforeStr} \n→\n ${afterStr}`
    ];
  });
  
  autoTable(doc, {
    startY: 48,
    head: [['Timestamp', 'Admin', 'Jenis Aksi', 'Modul', 'Nama Siswa', 'Nomor Tagihan', 'Nilai Sebelum → Sesudah']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [52, 73, 94], textColor: 255 },
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    columnStyles: {
      6: { cellWidth: 50 }
    }
  });
  
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100);
  doc.text('* Dokumen ini adalah log sistem otomatis yang tidak dapat dimanipulasi secara retroaktif.', 14, finalY);
  
  doc.save(`Laporan_Audit.pdf`);
}

export async function generateKwitansiPdf(group: any) {
  // Same as before
  const doc = new jsPDF();
  const profile = await getSchoolProfile();
  
  const title = 'KWITANSI PEMBAYARAN';
  const receiptNo = group.first?.no_kuitansi || `KW-${group.groupId.substring(0, 8).toUpperCase()}`;
  const subtitle = `No: ${receiptNo}`;
  
  addHeader(doc, profile, title, subtitle);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  
  const startY = 55;
  const lineSpacing = 8;
  
  doc.text('Telah terima dari', 14, startY);
  doc.text(':', 60, startY);
  doc.setFont('helvetica', 'bold');
  doc.text(group.first.siswa?.nama || '-', 65, startY);
  doc.setFont('helvetica', 'normal');
  
  doc.text('Kelas', 14, startY + lineSpacing);
  doc.text(':', 60, startY + lineSpacing);
  doc.text(group.first.activeClass ? formatKelasLabel(group.first.activeClass) : '-', 65, startY + lineSpacing);
  
  doc.text('Tanggal', 14, startY + lineSpacing * 2);
  doc.text(':', 60, startY + lineSpacing * 2);
  doc.text(formatTanggal(group.first.tanggal), 65, startY + lineSpacing * 2);
  
  const tableData = group.items.map((item: any) => {
    let namaTagihan = item.tagihan?.nama_tagihan || item.tagihan?.jenis || '-';
    if (item.tagihan?.jenis === 'spp' && item.tagihan?.bulan_tahun) {
      namaTagihan += ` (${formatMonthYear(item.tagihan.bulan_tahun)})`;
    }
    return [
      namaTagihan,
      item.metode || '-',
      formatRupiah(item.jumlah)
    ];
  });

  autoTable(doc, {
    startY: startY + lineSpacing * 3 + 2,
    head: [['Deskripsi Pembayaran (Tagihan)', 'Metode Pembayaran', 'Nominal']],
    body: tableData,
    foot: [['Total Pembayaran', '', formatRupiah(group.total)]],
    theme: 'grid',
    headStyles: { fillColor: [52, 73, 94], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
    styles: { fontSize: 10 },
    columnStyles: {
      2: { halign: 'right' }
    }
  });
  
  const nextY = (doc as any).lastAutoTable.finalY + 15;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const footerY = nextY + lineSpacing * 5;
  const pageWidth = doc.internal.pageSize.width;
  
  const kotaKec = profile.alamat_kecamatan || 'Jakarta';
  doc.text(`${kotaKec}, ${formatTanggal(group.first.tanggal)}`, pageWidth - 14, footerY, { align: 'right' });
  
  doc.text('Penyetor', 30, footerY + 5, { align: 'center' });
  doc.text('(_______________________)', 30, footerY + 25, { align: 'center' });
  
  doc.text('Penerima', pageWidth - 30, footerY + 5, { align: 'center' });
  doc.text('(_______________________)', pageWidth - 30, footerY + 25, { align: 'center' });
  
  doc.save(`Kwitansi_${receiptNo}.pdf`);
}

export async function generateLaporanDaftarUlangPdf(
  duTagihan: any[],
  siswaMap: Map<string, any>,
  kelasMap: Map<string, any>,
  kelasRencanaMap: Map<string, string>,
  pembayaranMap: Map<string, any[]>,
  summary: { total: number; lunas: number; belum: number },
  subtitleFilter: string,
  asalKelasMap?: Map<string, string>
) {
  const doc = new jsPDF();
  const profile = await getSchoolProfile();
  addHeader(doc, profile, 'LAPORAN DAFTAR ULANG', subtitleFilter);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Daftar Ulang : ${summary.total} Siswa`, 14, 48);
  doc.text(`Lunas              : ${summary.lunas} Siswa`, 14, 53);
  doc.text(`Belum Lunas        : ${summary.belum} Siswa`, 14, 58);

  const tableData = duTagihan.map((t: any) => {
    const siswa = siswaMap.get(t.siswa_id);
    const kelasBaruId = kelasRencanaMap.get(t.siswa_id);
    const kelasBaru = kelasMap.get(kelasBaruId ?? '');
    const asalKelasId = asalKelasMap?.get(t.siswa_id);
    const asalKelas = asalKelasId ? kelasMap.get(asalKelasId) : null;
    const bayarList = pembayaranMap.get(t.id) ?? [];
    const tglBayar = bayarList.length > 0 ? bayarList.sort((a, b) => b.tanggal.localeCompare(a.tanggal))[0].tanggal : null;
    return [
      siswa?.nama ?? '-',
      asalKelas ? formatKelasLabel(asalKelas) : '-',
      kelasBaru ? formatKelasLabel(kelasBaru) : '-',
      t.status,
      formatRupiah(t.jumlah_total),
      tglBayar ? formatTanggal(tglBayar) : '-',
    ];
  });

  autoTable(doc, {
    startY: 65,
    head: [['Nama Siswa', 'Kelompok Asal', 'Kelompok Baru', 'Status', 'Nominal', 'Tanggal Bayar']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [39, 174, 96], textColor: 255 },
    styles: { fontSize: 8 },
  });

  doc.save('Laporan_Daftar_Ulang.pdf');
}

export async function generateLaporanDiskonPdf(
  tagihanBerdiskon: any[],
  siswaMap: Map<string, any>,
  kelasMap: Map<string, any>,
  activeKelasMap: Map<string, string>,
  summary: {
    totalDiskon: number;
    totalDiskonPromo: number;
    totalDiskonManual: number;
    siswaPenerima: number;
    promoAktif: number;
    rataRata: number;
    breakdownPromo: Map<string, { count: number; total: number }>;
    breakdownJenis: Map<string, number>;
  },
  subtitleFilter: string
) {
  const doc = new jsPDF();
  const profile = await getSchoolProfile();
  addHeader(doc, profile, 'LAPORAN DISKON', subtitleFilter);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Diskon           : ${formatRupiah(summary.totalDiskon)}`, 14, 48);
  doc.text(`Diskon Promo           : ${formatRupiah(summary.totalDiskonPromo)}`, 14, 53);
  doc.text(`Potongan Manual        : ${formatRupiah(summary.totalDiskonManual)}`, 14, 58);
  doc.text(`Siswa Penerima         : ${summary.siswaPenerima} Siswa`, 110, 48);
  doc.text(`Jenis Promo Aktif      : ${summary.promoAktif} Promo`, 110, 53);
  doc.text(`Rata-rata Diskon       : ${formatRupiah(summary.rataRata)}`, 110, 58);

  let currentY = 68;

  if (summary.breakdownPromo.size > 0) {
    const promoData = Array.from(summary.breakdownPromo.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([nama, data]) => [nama, formatRupiah(data.total)]);

    autoTable(doc, {
      startY: currentY,
      head: [['Promo', 'Total Diskon']],
      body: promoData,
      theme: 'grid',
      headStyles: { fillColor: [142, 68, 173], textColor: 255 },
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' } },
    });
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  const tableData = tagihanBerdiskon.map((t: any) => {
    const siswa = siswaMap.get(t.siswa_id);
    const tarifNormal = t.jumlah_total + (t.potongan_diskon ?? 0);
    const kelasId = activeKelasMap.get(t.siswa_id);
    const kelas = kelasMap.get(kelasId ?? '');
    return [
      siswa?.nama ?? '-',
      kelas ? formatKelasLabel(kelas) : '-',
      t.jenis,
      t.nama_promo || '-',
      formatRupiah(tarifNormal),
      formatRupiah(t.potongan_diskon ?? 0),
      formatRupiah(t.jumlah_total),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Nama Siswa', 'Kelas', 'Jenis', 'Promo', 'Tarif Normal', 'Diskon', 'Tagihan']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    styles: { fontSize: 7 },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right' },
    },
  });

  doc.save('Laporan_Diskon.pdf');
}
