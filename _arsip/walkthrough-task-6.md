# Walkthrough - FASE 4 Task 6: Halaman Tagihan

## Tujuan

Mengganti placeholder route `/tagihan` dengan halaman tagihan nyata yang:

1. membaca daftar tagihan lintas siswa dari IndexedDB
2. mendukung filter lokal dari IndexedDB
3. membuat tagihan baru hanya lewat service layer
4. menghapus tagihan hanya lewat service layer
5. menyediakan shortcut ke halaman pembayaran

Task ini hanya mengerjakan halaman Tagihan.

## File Baru

### `src/pages/TagihanPage.tsx`

Halaman ini menjadi implementasi route `/tagihan`.

Fitur yang diimplementasikan:

1. daftar tagihan live dari IndexedDB
2. filter bulan/tahun
3. filter kelas
4. filter jenis
5. filter status
6. form `Generate SPP Bulanan`
7. form `Buat Tagihan Manual`
8. preview jumlah target untuk tagihan manual
9. tombol `Catat Pembayaran`
10. tombol `Hapus`
11. error state dan success message untuk dua form utama

## File Yang Diubah

### `src/App.tsx`

Perubahan route:

1. route `/tagihan` tidak lagi memakai `PlaceholderPage`
2. route sekarang mengarah ke `TagihanPage`

## Read Path

Semua data dibaca dari IndexedDB.

### Query utama daftar tagihan

Halaman memakai:

1. `listTagihanWithFilters()`

Query ini sudah menggabungkan:

1. `tagihan`
2. `siswa`
3. `kelas`
4. `siswa_kelas`

Sehingga halaman bisa langsung menampilkan:

1. nama siswa
2. kelas aktif
3. sisa tagihan
4. status tagihan

### Query referensi tambahan

Halaman juga membaca:

1. `listActiveKelas()`
2. `listSiswaWithFilters({ status: 'aktif' })`
3. `getPengaturanByKunci('jenis_tagihan')`

Data ini dipakai untuk dropdown filter, target tagihan manual, dan pilihan jenis tagihan.

## Write Path

Semua write dilakukan hanya lewat service:

1. `generateSppBulanan()`
2. `createManualTagihan()`
3. `deleteTagihan()`

UI tidak menulis langsung ke Dexie.

## Detail Implementasi UI

### Section Generate SPP Bulanan

Field:

1. `bulan_tahun`
2. `jatuh_tempo`

Submit akan memanggil `generateSppBulanan(actor, input)`.

Service tetap memegang aturan:

1. hanya siswa aktif yang diproses
2. skip duplikat SPP
3. hormati diskon SPP
4. hormati aturan pindahan

Halaman hanya menampilkan summary hasil:

1. berapa tagihan dibuat
2. berapa siswa dilewati

### Section Buat Tagihan Manual

Field:

1. nama tagihan
2. jenis
3. jumlah total
4. jatuh tempo
5. toggle bisa dicicil
6. target siswa: semua, per kelas, per individu

Untuk target:

1. `per kelas` -> render checkbox daftar kelas aktif
2. `per individu` -> render checkbox daftar siswa aktif

Preview target count dihitung dari data live IndexedDB untuk membantu admin memahami berapa siswa yang akan menerima tagihan.

### Section Daftar Tagihan

Tabel menampilkan:

1. siswa
2. kelas
3. nama tagihan
4. jenis
5. jatuh tempo
6. total
7. sisa
8. status
9. aksi

Filter yang tersedia:

1. bulan/tahun
2. kelas
3. jenis
4. status

### Aksi pada tabel

1. `Catat Pembayaran` -> navigasi ke `/pembayaran/new?tagihanId=...`
2. `Hapus` -> konfirmasi browser lalu panggil `deleteTagihan()`

Jika service menolak hapus karena tagihan sudah dibayar, halaman menampilkan error dari service.

## Button Yang Sudah Berfungsi

1. `Generate SPP`
2. `Simpan Tagihan Manual`
3. `Catat Pembayaran`
4. `Hapus`
5. semua filter
6. semua checkbox target kelas
7. semua checkbox target siswa

Tidak ada button pajangan tanpa aksi.

## Konsistensi Style

Halaman tetap mengikuti style repo yang sudah ada:

1. glass section
2. CTA gradient
3. badge reusable untuk jenis dan status tagihan
4. spacing dan typography konsisten dengan task sebelumnya

## Hasil Verifikasi

Perintah:

```bash
npm run build
```

Hasil:

```text
vite v8.0.14 building client environment for production...
✓ built in 3.26s
```

Tidak ada error TypeScript.

## Skenario Manual Yang Perlu Dicek

1. buka `/tagihan`
2. generate SPP untuk satu bulan
3. generate lagi di bulan yang sama dan cek duplikat di-skip
4. buat tagihan manual target semua siswa aktif
5. buat tagihan manual target per kelas
6. buat tagihan manual target per individu
7. klik `Catat Pembayaran`
8. coba hapus tagihan tanpa pembayaran
9. coba hapus tagihan yang sudah punya pembayaran dan pastikan gagal

## Status Task

Task 6 selesai dan build bersih.

Task berikutnya yang siap dikerjakan: `Task 7 - Halaman Pembayaran`.
