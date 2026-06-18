# Walkthrough - FASE 4 Task 7: Halaman Pembayaran

## Tujuan

Mengganti placeholder route `/pembayaran` dan `/pembayaran/new` dengan halaman pembayaran nyata yang:

1. membaca siswa, tagihan, metode bayar, dan riwayat pembayaran dari IndexedDB
2. menulis pembayaran hanya lewat `recordPembayaran()`
3. menampilkan preview status setelah pembayaran
4. memastikan semua tombol utama benar-benar berfungsi

Task ini hanya mengerjakan halaman Pembayaran.

## File Baru

### `src/pages/PembayaranPage.tsx`

Halaman ini menjadi implementasi route:

1. `/pembayaran`
2. `/pembayaran/new`

Fitur yang diimplementasikan:

1. form catat pembayaran
2. dropdown siswa
3. dropdown tagihan belum lunas milik siswa terpilih
4. input tanggal bayar
5. input jumlah bayar
6. dropdown metode pembayaran
7. textarea catatan
8. preview total, sudah dibayar, sisa, dan status setelah bayar
9. prefill dari query param `tagihanId`
10. daftar riwayat pembayaran terbaru
11. state sukses dan error
12. tombol `Cetak Kuitansi` disabled dengan alasan jelas

## File Yang Diubah

### `src/App.tsx`

Perubahan route:

1. route `/pembayaran` tidak lagi memakai `PlaceholderPage`
2. route `/pembayaran/new` tidak lagi memakai `PlaceholderPage`
3. kedua route sekarang mengarah ke `PembayaranPage`

## Read Path

Semua data dibaca dari IndexedDB.

### Data siswa

Halaman memakai:

1. `listSiswaWithFilters({ status: 'semua' })`

untuk dropdown siswa.

### Data tagihan

Halaman memakai:

1. `listTagihanWithFilters()`

lalu memfilter hanya:

1. tagihan milik siswa terpilih
2. tagihan dengan status bukan `lunas`

### Metode pembayaran

Halaman memakai:

1. `getPengaturanByKunci('metode_pembayaran')`

lalu hanya menampilkan opsi yang `aktif = true`.

### Riwayat pembayaran

Halaman memakai:

1. `listPembayaranWithFilters()`

untuk menampilkan pembayaran terbaru langsung dari IndexedDB.

## Write Path

Semua pembayaran ditulis hanya lewat:

1. `recordPembayaran(actor, input)`

UI tidak melakukan write langsung ke:

1. `db.pembayaran`
2. `db.tagihan`
3. `db.siswa`

Semua perubahan status tagihan dan aktivasi siswa `calon` tetap terjadi di service layer.

## Detail Implementasi UI

### Prefill dari query param

Jika halaman dibuka dengan:

1. `/pembayaran/new?tagihanId=...`

maka halaman akan:

1. mencari tagihan yang sesuai
2. otomatis mengisi `siswa_id`
3. otomatis mengisi `tagihan_id`
4. mengisi `jumlah` awal dengan nilai sisa tagihan

### Ringkasan tagihan

Saat tagihan dipilih, halaman menampilkan:

1. siswa
2. nama tagihan
3. total tagihan
4. sudah dibayar
5. sisa tagihan
6. preview status setelah pembayaran

Preview status dihitung di UI hanya untuk tampilan. Status final tetap dihitung oleh service saat submit.

### Riwayat pembayaran terbaru

Di sisi kanan halaman, admin bisa melihat pembayaran terbaru untuk membantu cross-check transaksi yang baru saja dicatat.

## Button Yang Sudah Berfungsi

1. `Simpan Pembayaran`
2. `Catat Pembayaran Lain`
3. `Selesai`
4. `Kembali ke Tagihan`

Button yang sengaja disabled dengan alasan jelas:

1. `Cetak Kuitansi - Segera Tersedia`

## Alur Sukses

Saat submit berhasil:

1. halaman memanggil `recordPembayaran()`
2. service menambahkan pembayaran ke IndexedDB
3. service memperbarui tagihan di IndexedDB
4. jika tagihan pendaftaran lunas semua, service mengubah siswa `calon` menjadi `aktif`
5. halaman menampilkan pesan sukses
6. form dibersihkan sebagian untuk pembayaran berikutnya

## Konsistensi Style

Halaman tetap mengikuti visual repo:

1. glass section
2. CTA gradient
3. shared `PageHeader`, `SectionCard`, `FormField`
4. layout dua kolom serupa halaman data kompleks lain

## Hasil Verifikasi

Perintah:

```bash
npm run build
```

Hasil:

```text
vite v8.0.14 building client environment for production...
✓ built in 3.11s
```

Tidak ada error TypeScript.

## Skenario Manual Yang Perlu Dicek

1. buka `/pembayaran`
2. pilih siswa
3. pilih tagihan belum lunas
4. isi tanggal, jumlah, dan metode
5. klik `Simpan Pembayaran`
6. cek pesan sukses
7. cek ringkasan status berubah
8. klik `Catat Pembayaran Lain`
9. buka halaman dari `/pembayaran/new?tagihanId=...`
10. cek prefill bekerja

## Status Task

Task 7 selesai dan build bersih.

Task berikutnya yang siap dikerjakan: `Task 8 - Refactor Dashboard`.
