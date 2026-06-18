# Walkthrough - FASE 4 Task 1: Halaman Tahun Ajaran

## Tujuan

Mengganti placeholder route `/tahun-ajaran` dengan halaman nyata yang:

1. membaca data live dari IndexedDB
2. menulis perubahan hanya lewat service layer
3. memastikan semua button utama benar-benar berfungsi

Task ini hanya mengerjakan halaman Tahun Ajaran, tanpa menyentuh task halaman lain.

## File Baru

### `src/pages/TahunAjaranPage.tsx`

Halaman ini menjadi implementasi utama route `/tahun-ajaran`.

Fitur yang diimplementasikan:

1. daftar tahun ajaran live dari IndexedDB via `useLiveQuery`
2. tombol `Buat Tahun Ajaran Baru`
3. form tambah tahun ajaran
4. form edit tahun ajaran
5. tombol `Aktifkan`
6. badge status `Aktif` atau `Arsip`
7. badge status sinkronisasi berdasarkan `_sync_status`
8. state loading per aksi
9. inline error message dari service

### Read path

Halaman membaca data melalui:

1. `useLiveQuery(() => listTahunAjaran(), [], [])`

Artinya tampilan akan ikut berubah otomatis saat service menulis ke IndexedDB.

### Write path

Semua aksi tulis dilakukan lewat service:

1. `createTahunAjaran()`
2. `updateTahunAjaran()`
3. `activateTahunAjaran()`

Komponen tidak melakukan `db.tahun_ajaran.add()` atau `put()` secara langsung.

## File Yang Diubah

### `src/App.tsx`

Perubahan route:

1. route `/tahun-ajaran` tidak lagi mengarah ke `PlaceholderPage`
2. route sekarang mengarah ke `TahunAjaranPage`

## Detail Implementasi

### Actor service

Halaman mengambil session user dari `useAuthStore`, lalu membentuk actor menggunakan:

1. `getCurrentActor(user)`

Actor ini dipakai setiap kali memanggil service, agar boundary service tetap konsisten.

### Form tambah dan edit

Halaman memakai satu form state yang dipakai untuk dua mode:

1. create mode
2. edit mode

State yang dipakai:

1. `nama`
2. `mulai`
3. `selesai`
4. `aktif`

Saat tombol `Edit` ditekan, data record dipindahkan ke form.
Saat tombol `Buat Tahun Ajaran Baru` ditekan, form di-reset ke state kosong.

### Validasi UI minimum

Sebelum memanggil service, halaman mengecek:

1. nama wajib diisi
2. tanggal mulai wajib diisi
3. tanggal selesai wajib diisi

Validasi aturan `selesai > mulai` tetap hidup di service layer melalui `tahunAjaranService`, sesuai PRD.

### Aktivasi tahun ajaran

Tombol `Aktifkan` memanggil `activateTahunAjaran()`.

Perilaku:

1. tombol disabled jika record sudah aktif
2. tombol disabled sementara saat request berjalan
3. service akan menonaktifkan record aktif lain sesuai BR-01

### Sinkronisasi status

Tabel menampilkan `_sync_status` agar admin bisa melihat apakah record masih `pending`, `conflict`, atau sudah sinkron.

## Button Yang Sudah Berfungsi

1. `Buat Tahun Ajaran Baru`
2. `Simpan`
3. `Batal`
4. `Edit`
5. `Aktifkan`

Semua button di halaman ini punya aksi nyata.

## Tampilan dan Konsistensi Style

Halaman mengikuti bahasa visual yang sudah ada di repo:

1. memakai `PageHeader`
2. memakai `SectionCard`
3. memakai style glass yang sama seperti shell dan dashboard
4. memakai tombol gradient dan badge konsisten dengan halaman eksisting

Saya tidak mengubah design language global aplikasi pada task ini.

## Hasil Verifikasi

Perintah:

```bash
npm run build
```

Hasil:

```text
vite v8.0.14 building client environment for production...
✓ built in 3.47s
```

Tidak ada error TypeScript.

## Skenario Manual Yang Perlu Dicek

1. buka `/tahun-ajaran`
2. klik `Buat Tahun Ajaran Baru`
3. isi form lalu klik `Simpan`
4. klik `Edit` pada salah satu record
5. ubah nama atau periode lalu klik `Simpan`
6. klik `Aktifkan` pada record nonaktif
7. pastikan hanya satu record yang aktif setelah aksi
8. pastikan daftar langsung update tanpa reload penuh

## Status Task

Task 1 selesai dan build bersih.

Task berikutnya yang siap dikerjakan: `Task 2 - Halaman Siswa List`.
