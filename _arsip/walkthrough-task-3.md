# Walkthrough - FASE 4 Task 3: Halaman Pendaftaran Siswa

## Tujuan

Mengganti placeholder route `/siswa/new` dengan halaman form pendaftaran siswa yang:

1. membaca data referensi dari IndexedDB
2. menulis seluruh proses pendaftaran hanya lewat service layer
3. menampilkan feedback real-time untuk early bird dan cicilan
4. memastikan semua tombol di halaman benar-benar berfungsi

Task ini hanya mengerjakan halaman pendaftaran siswa.

## File Baru

### `src/pages/SiswaCreatePage.tsx`

Halaman ini menjadi implementasi route `/siswa/new`.

Fitur yang diimplementasikan:

1. form data siswa
2. form data wali
3. form data pendaftaran
4. pembacaan pengaturan `early_bird` dari IndexedDB
5. pembacaan daftar kelas aktif dari IndexedDB
6. badge early bird real-time
7. preview estimasi cicilan real-time
8. validasi input dasar di UI
9. submit lewat `registerSiswa`
10. redirect ke halaman detail siswa setelah sukses

## File Yang Diubah

### `src/App.tsx`

Perubahan route:

1. route `/siswa/new` tidak lagi memakai `PlaceholderPage`
2. route sekarang mengarah ke `SiswaCreatePage`

## Read Path

Semua data referensi dibaca dari IndexedDB.

### Pengaturan early bird

Halaman memakai:

1. `useLiveQuery(() => getPengaturanByKunci('early_bird'))`

Data ini dipakai hanya untuk informasi UI real-time.
Aturan bisnis final tetap hidup di `registerSiswa()` pada service layer.

### Daftar kelas aktif

Halaman memakai:

1. `useLiveQuery(() => listActiveKelas())`

Data ini dipakai untuk dropdown `kelas tujuan` saat jenis masuk = `pindahan`.

## Write Path

Semua write dilakukan hanya lewat:

1. `registerSiswa(actor, payload)`

UI tidak menulis langsung ke:

1. `db.siswa`
2. `db.tagihan`
3. `db.siswa_kelas`

Semua proses domain tetap dijalankan service layer, termasuk:

1. cek early bird
2. override pindahan tanpa diskon
3. create siswa
4. create tagihan pendaftaran
5. create siswa_kelas untuk pindahan
6. enqueue sync

## Detail Implementasi UI

### Section 1 - Data siswa

Field:

1. nama lengkap
2. tanggal lahir
3. jenis kelamin

### Section 2 - Data orang tua / wali

Field:

1. nama wali
2. hubungan wali
3. nomor HP / WhatsApp
4. email wali
5. alamat

### Section 3 - Data pendaftaran

Field:

1. tanggal daftar
2. jenis masuk
3. kelas tujuan, hanya muncul saat `pindahan`
4. biaya pendaftaran
5. opsi bayar `full` atau `cicil`
6. jumlah termin, hanya muncul saat `cicil`

### Early bird indicator

Halaman menampilkan badge early bird jika:

1. setting `early_bird.aktif = true`
2. jenis masuk = `baru`
3. tanggal daftar berada dalam range early bird

Ini hanya preview UI. Penentuan final tetap diputuskan ulang oleh service saat submit.

### Preview cicilan

Saat opsi bayar = `cicil`, halaman menghitung:

1. `biaya_pendaftaran / jumlah_termin`

lalu menampilkan estimasi nominal per cicilan.

## Validasi UI Yang Ditambahkan

Halaman melakukan validasi form dasar sebelum memanggil service:

1. nama siswa minimal 2 karakter
2. tanggal lahir tidak boleh di masa depan
3. nama wali minimal 2 karakter
4. nomor HP minimal 10 digit angka
5. email wali harus valid jika diisi
6. tanggal daftar wajib diisi
7. kelas tujuan wajib diisi untuk pindahan
8. biaya pendaftaran harus angka >= 0
9. jumlah termin harus 2 sampai 12 jika cicil

Validasi domain yang lebih penting tetap ada di service.

## Button Yang Sudah Berfungsi

1. `Kembali ke Daftar Siswa`
2. `Simpan`
3. `Batal`
4. toggle `Baru`
5. toggle `Pindahan`
6. toggle `Full`
7. toggle `Cicil`

Tidak ada button pajangan tanpa aksi.

## Alur Sukses

Saat submit berhasil:

1. halaman memanggil `registerSiswa()`
2. service membuat record siswa dan tagihan pendaftaran
3. jika pindahan, service juga membuat `siswa_kelas`
4. halaman redirect ke `/siswa/:id`

## Konsistensi Style

Halaman tetap mengikuti bahasa visual repo:

1. glass card
2. gradient CTA button
3. spacing dan typography konsisten dengan `Dashboard` dan `AppShell`
4. section terpisah dengan `SectionCard`

Saya tidak mengubah design system global.

## Hasil Verifikasi

Perintah:

```bash
npm run build
```

Hasil:

```text
vite v8.0.14 building client environment for production...
✓ built in 3.36s
```

Tidak ada error TypeScript.

## Skenario Manual Yang Perlu Dicek

1. buka `/siswa/new`
2. isi data siswa baru biasa lalu simpan
3. isi data siswa pindahan lalu simpan
4. ubah opsi bayar ke `Cicil`
5. isi jumlah termin dan cek preview cicilan
6. ubah tanggal daftar dan cek badge early bird berubah
7. pastikan setelah submit sukses, route pindah ke detail siswa

## Status Task

Task 3 selesai dan build bersih.

Task berikutnya yang siap dikerjakan: `Task 4 - Halaman Detail Siswa`.
