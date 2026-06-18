# Walkthrough - FASE 4 Task 4: Halaman Detail Siswa

## Tujuan

Mengganti placeholder route `/siswa/:id` dengan halaman detail siswa yang:

1. membaca seluruh data siswa dari IndexedDB
2. menampilkan tab Profil, Tagihan, dan Riwayat Pembayaran
3. menyediakan tombol aksi yang valid
4. tetap tidak memindahkan business logic ke UI

Task ini hanya mengerjakan halaman detail siswa.

## File Baru

### `src/pages/SiswaDetailPage.tsx`

Halaman ini menjadi implementasi route `/siswa/:id`.

Fitur yang diimplementasikan:

1. membaca detail siswa via `getSiswaDetail()`
2. loading state sederhana saat query berjalan
3. not-found state bila ID tidak valid atau data tidak tersedia
4. header siswa dengan badge status dan badge diskon SPP
5. tab `Profil`
6. tab `Tagihan`
7. tab `Riwayat Pembayaran`
8. filter status untuk daftar tagihan
9. tombol `Edit Profil`
10. tombol `Catat Pembayaran`
11. tombol `Lihat Riwayat Bayar`
12. tombol `Set Berhenti` dalam state disabled yang jelas
13. tombol `Cetak Kuitansi` dalam state disabled yang jelas

## File Yang Diubah

### `src/App.tsx`

Perubahan route:

1. route `/siswa/:id` tidak lagi memakai `PlaceholderPage`
2. route sekarang mengarah ke `SiswaDetailPage`

## Read Path

Semua data dibaca dari IndexedDB melalui:

1. `useLiveQuery(() => getSiswaDetail(id))`

Read model `getSiswaDetail()` sudah menggabungkan:

1. `siswa`
2. `siswa_kelas`
3. `kelas`
4. `tagihan`
5. `pembayaran`

Sehingga komponen tidak perlu membuat query manual tambahan ke database.

## Write Path

Task ini tidak membuat write baru.

Semua aksi yang tersedia adalah:

1. navigasi ke edit siswa
2. navigasi ke form pembayaran
3. perpindahan tab lokal di halaman

Fitur `Set Berhenti` belum diaktifkan karena service-nya belum ada. Sesuai instruksi, saya tidak memindahkan business logic itu ke UI.

## Detail Implementasi UI

### Header siswa

Menampilkan:

1. avatar inisial
2. nama siswa
3. badge status siswa
4. badge diskon jika `flag_diskon_spp = true`
5. kelas aktif
6. tanggal masuk
7. data wali ringkas

### Tab Profil

Menampilkan:

1. data identitas siswa
2. data wali
3. alamat
4. riwayat kelas dari `siswa_kelas`

Riwayat kelas menampilkan status:

1. `Aktif` jika `selesai` masih null
2. `Riwayat` jika assignment sudah ditutup

### Tab Tagihan

Menampilkan:

1. filter status tagihan
2. tabel tagihan siswa
3. badge jenis tagihan
4. badge status tagihan
5. total, sudah dibayar, dan sisa

Button yang berfungsi di tab ini:

1. `Catat Pembayaran` -> `/pembayaran/new?tagihanId=...`
2. `Lihat Riwayat Bayar` -> pindah ke tab pembayaran

### Tab Riwayat Pembayaran

Menampilkan:

1. tanggal pembayaran
2. nama tagihan
3. jumlah
4. metode
5. catatan

Button `Cetak Kuitansi` belum aktif karena PDF generator belum ada.
Button tetap dirender sebagai disabled dengan label yang jelas.

## Button Yang Sudah Berfungsi

1. `Kembali`
2. `Edit Profil`
3. tab `Profil`
4. tab `Tagihan`
5. tab `Riwayat Pembayaran`
6. `Catat Pembayaran`
7. `Lihat Riwayat Bayar`

Button yang sengaja disabled dengan alasan jelas:

1. `Set Berhenti - Segera Tersedia`
2. `Cetak Kuitansi - Segera Tersedia`

## Konsistensi Style

Halaman tetap mengikuti gaya visual repo saat ini:

1. glass section
2. gradient CTA
3. typography dan spacing konsisten dengan task sebelumnya
4. shared component seperti `PageHeader`, `SectionCard`, `EmptyState`, dan badge reusable

## Hasil Verifikasi

Perintah:

```bash
npm run build
```

Hasil:

```text
vite v8.0.14 building client environment for production...
✓ built in 3.71s
```

Tidak ada error TypeScript.

## Skenario Manual Yang Perlu Dicek

1. buka `/siswa/:id` dengan ID yang valid
2. cek tab Profil menampilkan data siswa
3. cek riwayat kelas
4. pindah ke tab Tagihan
5. ubah filter status tagihan
6. klik `Catat Pembayaran` pada tagihan yang belum lunas
7. klik `Lihat Riwayat Bayar`
8. pindah ke tab Riwayat Pembayaran
9. cek state disabled `Set Berhenti`
10. cek state disabled `Cetak Kuitansi`

## Status Task

Task 4 selesai dan build bersih.

Task berikutnya yang siap dikerjakan: `Task 5 - Halaman Edit Siswa`.
