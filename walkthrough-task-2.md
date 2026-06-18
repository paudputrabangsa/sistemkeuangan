# Walkthrough - FASE 4 Task 2: Halaman Siswa List

## Tujuan

Mengganti placeholder route `/siswa` dengan halaman daftar siswa nyata yang:

1. membaca data live dari IndexedDB
2. mendukung filter status, search, dan filter kelas
3. menyediakan tombol aksi yang semuanya berfungsi
4. tetap tidak menulis business logic ke UI

Task ini hanya mengerjakan halaman daftar siswa.

## File Baru

### `src/pages/SiswaListPage.tsx`

Halaman ini menjadi implementasi route `/siswa`.

Fitur yang diimplementasikan:

1. daftar siswa live dari IndexedDB via `useLiveQuery`
2. search berdasarkan nama siswa atau nama wali
3. filter status dengan tab
4. filter kelas aktif melalui dropdown
5. tabel siswa dengan data turunan:
   - kelas aktif
   - status siswa
   - nama wali
   - sisa tagihan
6. tombol `Tambah Siswa`
7. tombol `Lihat Detail`
8. tombol `Edit`
9. empty state yang tetap punya tombol aksi

## File Yang Diubah

### `src/App.tsx`

Perubahan route:

1. route `/siswa` tidak lagi memakai `PlaceholderPage`
2. route sekarang mengarah ke `SiswaListPage`

## Read Path

Semua data dibaca dari IndexedDB.

### Query utama siswa

Halaman memakai:

1. `listSiswaWithFilters({ status, search, kelasId })`

Query ini sudah menggabungkan:

1. `siswa`
2. `siswa_kelas`
3. `kelas`
4. `tagihan`

Sehingga halaman tidak perlu menghitung ulang:

1. kelas aktif siswa
2. total sisa tagihan per siswa

### Query dropdown kelas

Halaman juga memakai:

1. `listActiveKelas()`

untuk mengisi opsi dropdown kelas aktif.

### Live updates

Kedua query dijalankan dengan `useLiveQuery`, jadi tampilan akan ikut berubah otomatis setelah task berikutnya menambah atau mengubah data siswa.

## Write Path

Task ini tidak membuat write baru.

Semua aksi di halaman ini adalah:

1. navigasi ke halaman tambah siswa
2. navigasi ke detail siswa
3. navigasi ke edit siswa

Dengan begitu task ini tetap mematuhi aturan bahwa UI tidak menulis langsung ke `db.*`.

## Detail Implementasi UI

### Header halaman

Header memakai `PageHeader` dengan tombol utama:

1. `Tambah Siswa`

Tombol ini bernavigasi ke route:

1. `/siswa/new`

### Section filter

Filter dibagi menjadi:

1. input search
2. dropdown kelas aktif
3. tab status

Tab status yang tersedia:

1. `Semua`
2. `Calon`
3. `Aktif`
4. `Tidak Aktif`
5. `Arsip`

### Tabel siswa

Kolom yang ditampilkan:

1. nama siswa
2. kelas aktif
3. status
4. wali
5. sisa tagihan
6. aksi

Komponen status memakai:

1. `StatusBadgeSiswa`

Nominal sisa tagihan memakai:

1. `formatRupiah`

### Empty state

Jika tidak ada data yang cocok dengan filter saat ini, halaman menampilkan `EmptyState` dengan tombol `Tambah Siswa` yang tetap aktif.

## Button Yang Sudah Berfungsi

1. `Tambah Siswa` -> `/siswa/new`
2. `Lihat Detail` -> `/siswa/:id`
3. `Edit` -> `/siswa/:id/edit`
4. semua tab filter status
5. search input
6. dropdown filter kelas

Tidak ada button pajangan tanpa aksi.

## Konsistensi Style

Halaman mengikuti gaya visual repo saat ini:

1. `PageHeader`
2. `SectionCard`
3. glass card
4. tombol gradient untuk CTA utama
5. tombol border untuk aksi sekunder
6. typography dan spacing yang sejalan dengan `Dashboard` dan `AppShell`

Saya tidak mengubah design system global.

## Hasil Verifikasi

Perintah:

```bash
npm run build
```

Hasil:

```text
vite v8.0.14 building client environment for production...
✓ built in 3.07s
```

Tidak ada error TypeScript.

## Skenario Manual Yang Perlu Dicek

1. buka `/siswa`
2. klik `Tambah Siswa`
3. klik `Lihat Detail` pada salah satu siswa jika data tersedia
4. klik `Edit` pada salah satu siswa jika data tersedia
5. ubah tab status dan cek daftar berubah
6. ketik search nama siswa atau wali
7. pilih kelas aktif dari dropdown
8. cek empty state saat hasil filter kosong

## Status Task

Task 2 selesai dan build bersih.

Task berikutnya yang siap dikerjakan: `Task 3 - Halaman Pendaftaran Siswa`.
