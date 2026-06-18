# Walkthrough - FASE 4 Task 5: Halaman Edit Siswa

## Tujuan

Mengganti placeholder route `/siswa/:id/edit` dengan halaman edit siswa yang:

1. memuat data siswa awal dari IndexedDB
2. hanya menulis perubahan lewat `updateSiswa()`
3. tidak mengizinkan perubahan data pendaftaran dari halaman ini
4. memastikan tombol utama benar-benar berfungsi

Task ini hanya mengerjakan halaman edit siswa.

## File Baru

### `src/pages/SiswaEditPage.tsx`

Halaman ini menjadi implementasi route `/siswa/:id/edit`.

Fitur yang diimplementasikan:

1. load data awal siswa dari `getSiswaDetail()`
2. form edit identitas siswa
3. form edit data wali
4. validasi UI dasar
5. submit lewat `updateSiswa()`
6. blok referensi read-only untuk data pendaftaran
7. redirect kembali ke detail siswa setelah sukses
8. loading state dan not-found state

## File Yang Diubah

### `src/App.tsx`

Perubahan route:

1. route `/siswa/:id/edit` tidak lagi memakai `PlaceholderPage`
2. route sekarang mengarah ke `SiswaEditPage`

## Read Path

Halaman memuat data awal dengan:

1. `useLiveQuery(() => getSiswaDetail(id))`

Data yang dipakai untuk mengisi form:

1. nama siswa
2. tanggal lahir
3. jenis kelamin
4. nama wali
5. hubungan wali
6. kontak wali
7. email wali
8. alamat

Data pendaftaran juga dibaca, tapi hanya ditampilkan sebagai read-only:

1. tanggal daftar
2. jenis masuk
3. status siswa

## Write Path

Semua perubahan ditulis lewat:

1. `updateSiswa(actor, id, payload)`

UI tidak melakukan write langsung ke Dexie.

## Detail Implementasi UI

### Section Profil Siswa

Bagian ini mengizinkan edit untuk:

1. nama lengkap
2. tanggal lahir
3. jenis kelamin
4. nama wali
5. hubungan wali
6. nomor HP / WhatsApp
7. email wali
8. alamat

### Section Data Pendaftaran

Bagian ini hanya sebagai referensi dan tidak bisa diubah dari halaman edit.

Nilai yang ditampilkan:

1. tanggal daftar
2. jenis masuk
3. status siswa

Ini mengikuti PRD bahwa field pendaftaran tidak diubah dari halaman edit profil.

## Validasi UI Yang Ditambahkan

Sebelum memanggil service, halaman memvalidasi:

1. nama siswa minimal 2 karakter
2. tanggal lahir tidak boleh di masa depan
3. nama wali minimal 2 karakter
4. nomor HP minimal 10 digit angka
5. email wali valid jika diisi

Validasi domain yang lebih dalam tetap di service.

## Button Yang Sudah Berfungsi

1. `Kembali ke Detail`
2. `Simpan Perubahan`
3. `Batal`

Semua button memiliki aksi nyata.

## Alur Sukses

Saat submit berhasil:

1. halaman memanggil `updateSiswa()`
2. service mengubah record siswa di IndexedDB
3. service menambahkan perubahan ke `sync_queue`
4. halaman redirect ke `/siswa/:id`

Karena detail siswa membaca data secara live dari IndexedDB, halaman detail akan langsung menampilkan data terbaru.

## Konsistensi Style

Halaman tetap mengikuti bahasa visual repo saat ini:

1. glass card
2. CTA gradient
3. shared `PageHeader`, `SectionCard`, `FormField`
4. spacing dan typography konsisten dengan task sebelumnya

## Hasil Verifikasi

Perintah:

```bash
npm run build
```

Hasil:

```text
vite v8.0.14 building client environment for production...
✓ built in 5.21s
```

Tidak ada error TypeScript.

## Skenario Manual Yang Perlu Dicek

1. buka `/siswa/:id/edit`
2. ubah nama siswa
3. ubah kontak wali
4. ubah email wali
5. klik `Simpan Perubahan`
6. pastikan redirect ke detail siswa
7. pastikan detail menampilkan data baru
8. cek bahwa field data pendaftaran hanya tampil read-only

## Status Task

Task 5 selesai dan build bersih.

Task berikutnya yang siap dikerjakan: `Task 6 - Halaman Tagihan`.
