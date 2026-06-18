import path from 'node:path';
import { mkdirSync } from 'node:fs';
import XLSX from 'xlsx';

const outDir = path.resolve('excel-templates');
mkdirSync(outDir, { recursive: true });

function sheet(rows) {
  return XLSX.utils.json_to_sheet(rows);
}

function fitColumns(ws, widths) {
  ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

function writeWorkbook(fileName, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, ws] of sheets) {
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, path.join(outDir, fileName));
}

const referensiUmum = [
  { kategori: 'tahun_ajaran', nilai: '2025/2026', keterangan: 'Tahun ajaran aktif contoh untuk migrasi' },
  { kategori: 'kelas', nilai: 'Kelompok Bermain Melati', keterangan: 'Contoh kelas aktif KB' },
  { kategori: 'kelas', nilai: 'TK A Mawar', keterangan: 'Contoh kelas aktif TK A' },
  { kategori: 'kelas', nilai: 'TK B Anggrek', keterangan: 'Contoh kelas aktif TK B' },
  { kategori: 'tingkat_kelas', nilai: 'Kelompok Bermain', keterangan: 'Tingkat untuk kelas KB' },
  { kategori: 'tingkat_kelas', nilai: 'TK A', keterangan: 'Tingkat untuk kelas TK A' },
  { kategori: 'tingkat_kelas', nilai: 'TK B', keterangan: 'Tingkat untuk kelas TK B' },
  { kategori: 'metode_pembayaran', nilai: 'Tunai', keterangan: 'Metode pembayaran aktif default' },
  { kategori: 'metode_pembayaran', nilai: 'Transfer Bank', keterangan: 'Metode pembayaran aktif default' },
  { kategori: 'jenis_tagihan', nilai: 'spp', keterangan: 'Tagihan SPP bulanan' },
  { kategori: 'jenis_tagihan', nilai: 'pendaftaran', keterangan: 'Tagihan pendaftaran' },
  { kategori: 'jenis_tagihan', nilai: 'daftar_ulang', keterangan: 'Tagihan daftar ulang, hanya jika dipakai sekolah' },
  { kategori: 'jenis_tagihan', nilai: 'seragam', keterangan: 'Contoh tagihan non-SPP' },
];

const siswaCalonRows = [
  {
    kode_import_siswa: 'CALON-001',
    nama_siswa: 'Bella Anindita',
    tanggal_lahir: '2021-03-14',
    jenis_kelamin: 'P',
    nama_wali: 'Maya Sari',
    hubungan_wali: 'ibu',
    kontak_wali: '081211110001',
    email_wali: 'maya@example.com',
    alamat: 'Jl. Cempaka 1 No. 2',
    tahun_ajaran_target: '2026/2027',
    tanggal_daftar: '2026-01-05',
    jatuh_tempo_pendaftaran: '2026-01-20',
    biaya_pendaftaran: 1500000,
    opsi_pembayaran_awal: 'full',
    catatan: 'Calon siswa reguler',
  },
  {
    kode_import_siswa: 'CALON-002',
    nama_siswa: 'Farhan Akbar',
    tanggal_lahir: '2020-11-02',
    jenis_kelamin: 'L',
    nama_wali: 'Rudi Hartono',
    hubungan_wali: 'ayah',
    kontak_wali: '081211110002',
    email_wali: 'rudi@example.com',
    alamat: 'Jl. Flamboyan 3 No. 8',
    tahun_ajaran_target: '2026/2027',
    tanggal_daftar: '2026-01-10',
    jatuh_tempo_pendaftaran: '2026-02-10',
    biaya_pendaftaran: 1750000,
    opsi_pembayaran_awal: 'cicil',
    catatan: 'Pembayaran pendaftaran boleh dicicil bebas sampai jatuh tempo',
  },
  {
    kode_import_siswa: 'CALON-003',
    nama_siswa: 'Naila Zahra',
    tanggal_lahir: '2021-07-21',
    jenis_kelamin: 'P',
    nama_wali: 'Dewi Lestari',
    hubungan_wali: 'ibu',
    kontak_wali: '081211110003',
    email_wali: 'dewi@example.com',
    alamat: 'Jl. Kenari 5 No. 11',
    tahun_ajaran_target: '2026/2027',
    tanggal_daftar: '2026-02-01',
    jatuh_tempo_pendaftaran: '2026-02-15',
    biaya_pendaftaran: 1500000,
    opsi_pembayaran_awal: 'full',
    catatan: 'Pendaftaran gelombang 2',
  },
];

const siswaMigrasiRows = [
  {
    kode_import_siswa: 'MIG-SISWA-001',
    nama_siswa: 'Aisyah Humaira',
    tanggal_lahir: '2020-05-12',
    jenis_kelamin: 'P',
    nama_wali: 'Siti Aminah',
    hubungan_wali: 'ibu',
    kontak_wali: '081234567890',
    email_wali: 'aminah@example.com',
    alamat: 'Jl. Melati 1 No. 10',
    status_siswa: 'aktif',
    jenis_masuk: 'awal_tahun',
    tahun_ajaran: '2025/2026',
    tingkat_kelas: 'TK A',
    kelas_aktif: 'TK A Mawar',
    tanggal_daftar: '2025-07-10',
    alasan_keluar: '',
    tanggal_keluar: '',
    catatan: 'Siswa aktif reguler',
  },
  {
    kode_import_siswa: 'MIG-SISWA-002',
    nama_siswa: 'Rafa Saputra',
    tanggal_lahir: '2019-08-03',
    jenis_kelamin: 'L',
    nama_wali: 'Budi Santoso',
    hubungan_wali: 'ayah',
    kontak_wali: '081298765432',
    email_wali: 'budi@example.com',
    alamat: 'Jl. Anggrek 7 No. 2',
    status_siswa: 'aktif',
    jenis_masuk: 'pindahan',
    tahun_ajaran: '2025/2026',
    tingkat_kelas: 'TK B',
    kelas_aktif: 'TK B Anggrek',
    tanggal_daftar: '2025-10-01',
    alasan_keluar: '',
    tanggal_keluar: '',
    catatan: 'Masuk sebagai pindahan',
  },
  {
    kode_import_siswa: 'MIG-SISWA-003',
    nama_siswa: 'Nadia Putri',
    tanggal_lahir: '2018-11-21',
    jenis_kelamin: 'P',
    nama_wali: 'Rina Lestari',
    hubungan_wali: 'ibu',
    kontak_wali: '081355577799',
    email_wali: 'rina@example.com',
    alamat: 'Jl. Kenanga 4 No. 5',
    status_siswa: 'keluar',
    jenis_masuk: 'awal_tahun',
    tahun_ajaran: '2025/2026',
    tingkat_kelas: 'TK B',
    kelas_aktif: 'TK B Anggrek',
    tanggal_daftar: '2024-07-08',
    alasan_keluar: 'berhenti_lainnya',
    tanggal_keluar: '2026-06-20',
    catatan: 'Siswa keluar pada tahun ajaran berjalan',
  },
  {
    kode_import_siswa: 'MIG-SISWA-004',
    nama_siswa: 'Dimas Prakoso',
    tanggal_lahir: '2019-02-15',
    jenis_kelamin: 'L',
    nama_wali: 'Agus Prakoso',
    hubungan_wali: 'ayah',
    kontak_wali: '081377788899',
    email_wali: 'agus@example.com',
    alamat: 'Jl. Dahlia 9 No. 1',
    status_siswa: 'keluar',
    jenis_masuk: 'awal_tahun',
    tahun_ajaran: '2025/2026',
    tingkat_kelas: 'Kelompok Bermain',
    kelas_aktif: 'Kelompok Bermain Melati',
    tanggal_daftar: '2025-07-15',
    alasan_keluar: 'pindah_sekolah',
    tanggal_keluar: '2026-01-12',
    catatan: 'Pindah ke kota lain',
  },
];

const tagihanRows = [
  {
    kode_import_tagihan: 'MIG-TAG-001',
    kode_import_siswa: 'MIG-SISWA-001',
    jenis_tagihan: 'spp',
    nama_tagihan: 'SPP Januari 2026',
    jumlah_total: 250000,
    jatuh_tempo: '2026-01-10',
    bisa_cicil: 'false',
    bulan_tahun: '2026-01',
    catatan: 'SPP aktif siswa Aisyah',
  },
  {
    kode_import_tagihan: 'MIG-TAG-002',
    kode_import_siswa: 'MIG-SISWA-001',
    jenis_tagihan: 'seragam',
    nama_tagihan: 'Seragam Baru Semester Genap',
    jumlah_total: 450000,
    jatuh_tempo: '2026-01-20',
    bisa_cicil: 'true',
    bulan_tahun: '',
    catatan: 'Boleh dicicil 3 kali',
  },
  {
    kode_import_tagihan: 'MIG-TAG-003',
    kode_import_siswa: 'MIG-SISWA-002',
    jenis_tagihan: 'pendaftaran',
    nama_tagihan: 'Administrasi Pindahan',
    jumlah_total: 500000,
    jatuh_tempo: '2025-10-05',
    bisa_cicil: 'false',
    bulan_tahun: '',
    catatan: 'Tagihan lama saat pindahan',
  },
  {
    kode_import_tagihan: 'MIG-TAG-004',
    kode_import_siswa: 'MIG-SISWA-004',
    jenis_tagihan: 'spp',
    nama_tagihan: 'SPP Desember 2025',
    jumlah_total: 250000,
    jatuh_tempo: '2025-12-10',
    bisa_cicil: 'false',
    bulan_tahun: '2025-12',
    catatan: 'Masih ada saldo sebelum berhenti',
  },
];

const pembayaranRows = [
  {
    kode_import_pembayaran: 'MIG-BYR-001',
    kode_import_tagihan: 'MIG-TAG-001',
    tanggal_pembayaran: '2026-01-08',
    jumlah: 250000,
    metode_pembayaran: 'Transfer Bank',
    catatan: 'Lunas sebelum jatuh tempo',
  },
  {
    kode_import_pembayaran: 'MIG-BYR-002',
    kode_import_tagihan: 'MIG-TAG-002',
    tanggal_pembayaran: '2026-01-18',
    jumlah: 150000,
    metode_pembayaran: 'Tunai',
    catatan: 'Cicilan 1 seragam',
  },
  {
    kode_import_pembayaran: 'MIG-BYR-003',
    kode_import_tagihan: 'MIG-TAG-003',
    tanggal_pembayaran: '2025-10-03',
    jumlah: 500000,
    metode_pembayaran: 'Tunai',
    catatan: 'Tagihan pindahan lunas',
  },
  {
    kode_import_pembayaran: 'MIG-BYR-004',
    kode_import_tagihan: 'MIG-TAG-004',
    tanggal_pembayaran: '2025-12-15',
    jumlah: 100000,
    metode_pembayaran: 'Tunai',
    catatan: 'Pembayaran sebagian sebelum berhenti',
  },
];

writeWorkbook('template_migrasi_siswa_dummy.xlsx', [
  ['petunjuk', fitColumns(sheet([
    { langkah: 1, keterangan: 'Isi data pada sheet siswa_migrasi.' },
    { langkah: 2, keterangan: 'Kolom kode_import_siswa harus unik dan dipakai lagi pada file tagihan.' },
    { langkah: 3, keterangan: 'Setiap baris migrasi wajib mencantumkan tingkat_kelas dan kelas_aktif.' },
    { langkah: 4, keterangan: 'Jika status_siswa = aktif maka kelas_aktif wajib cocok dengan master kelas aktif.' },
    { langkah: 5, keterangan: 'Jika status_siswa = berhenti maka alasan_keluar wajib diisi.' },
    { langkah: 6, keterangan: 'Tanggal gunakan format YYYY-MM-DD.' },
  ]), [12, 120])],
  ['siswa_migrasi', fitColumns(sheet(siswaMigrasiRows), [18, 24, 14, 14, 22, 16, 18, 24, 28, 14, 14, 14, 18, 24, 14, 18, 14, 28])],
  ['referensi', fitColumns(sheet(referensiUmum), [20, 28, 48])],
]);

writeWorkbook('template_import_siswa_calon_dummy.xlsx', [
  ['petunjuk', fitColumns(sheet([
    { langkah: 1, keterangan: 'Isi data pada sheet siswa_calon.' },
    { langkah: 2, keterangan: 'Setiap baris calon WAJIB punya: kode_import_siswa, tahun_ajaran_target, tanggal_daftar, biaya_pendaftaran, dan opsi_pembayaran_awal.' },
    { langkah: 3, keterangan: 'kode_import_siswa harus unik dalam file.' },
    { langkah: 4, keterangan: 'tahun_ajaran_target harus cocok dengan master tahun ajaran yang belum aktif.' },
    { langkah: 5, keterangan: 'biaya_pendaftaran diisi per baris.' },
    { langkah: 6, keterangan: 'Jika opsi_pembayaran_awal = cicil maka jumlah_termin wajib diisi.' },
  ]), [12, 120])],
  ['siswa_calon', fitColumns(sheet(siswaCalonRows), [16, 24, 14, 14, 22, 16, 18, 24, 28, 18, 14, 16, 18, 14, 28])],
  ['referensi', fitColumns(sheet([
    ...referensiUmum,
    { kategori: 'tahun_ajaran', nilai: '2026/2027', keterangan: 'Contoh tahun ajaran target calon siswa' },
    { kategori: 'opsi_pembayaran_awal', nilai: 'full', keterangan: 'Pembayaran penuh' },
    { kategori: 'opsi_pembayaran_awal', nilai: 'cicil', keterangan: 'Pembayaran bertahap, jumlah_termin wajib' },
  ]), [20, 28, 48])],
]);

writeWorkbook('template_migrasi_tagihan_dummy.xlsx', [
  ['petunjuk', fitColumns(sheet([
    { langkah: 1, keterangan: 'Isi data pada sheet tagihan setelah siswa migrasi berhasil masuk ke sistem.' },
    { langkah: 2, keterangan: 'kode_import_siswa harus cocok dengan file migrasi siswa.' },
    { langkah: 3, keterangan: 'kode_import_tagihan harus unik dan dipakai lagi pada file migrasi pembayaran.' },
    { langkah: 4, keterangan: 'Jika jenis_tagihan = spp maka bulan_tahun wajib diisi dengan format YYYY-MM.' },
  ]), [12, 120])],
  ['tagihan', fitColumns(sheet(tagihanRows), [18, 18, 18, 32, 14, 14, 12, 14, 28])],
  ['referensi', fitColumns(sheet(referensiUmum), [20, 28, 48])],
]);

writeWorkbook('template_migrasi_pembayaran_dummy.xlsx', [
  ['petunjuk', fitColumns(sheet([
    { langkah: 1, keterangan: 'Isi data pada sheet pembayaran setelah tagihan migrasi berhasil masuk ke sistem.' },
    { langkah: 2, keterangan: 'kode_import_tagihan harus cocok dengan file migrasi tagihan.' },
    { langkah: 3, keterangan: 'kode_import_pembayaran harus unik untuk setiap baris.' },
    { langkah: 4, keterangan: 'Gunakan metode_pembayaran yang tersedia di master pengaturan.' },
  ]), [12, 120])],
  ['pembayaran', fitColumns(sheet(pembayaranRows), [20, 18, 18, 14, 20, 32])],
  ['referensi', fitColumns(sheet(referensiUmum), [20, 28, 48])],
]);

console.log(`Generated migration templates in ${outDir}`);
