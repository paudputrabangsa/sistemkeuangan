# task-fase-5.md

## FASE 5 — PENYEMPURNAAN STATUS CALON DAN IMPORT DAPODIK BATCH
Tujuan: merapikan perilaku siswa `calon` agar tidak memakai aksi `Set Berhenti`, dan menegaskan bahwa `Import Dapodik` hanya untuk input banyak siswa tahun berjalan, bukan input satu siswa.

## Aturan Eksekusi
1. Semua read tetap dari IndexedDB.
2. Semua write wajib lewat service layer.
3. Komponen UI dilarang menulis langsung ke `db.*`.
4. Jangan ubah flow siswa `aktif` yang sudah benar.
5. `Import Dapodik` harus tetap batch, bukan mode terselubung di form satu siswa.
6. Setelah task selesai, jalankan `npm run build`.
7. Lakukan cek manual untuk jalur `calon`, `aktif`, dan import batch.

## Scope Fase
Fase ini hanya mengerjakan:
1. aksi status siswa `calon`
2. pemisahan tegas import Dapodik batch dari form registrasi tunggal

## Task 1 — Siswa Calon: Tidak Jadi Masuk
Tujuan: siswa dengan status `calon` tidak memakai aksi `Set Berhenti`, tetapi memakai aksi `Tidak Jadi Masuk`.

### Perilaku yang diinginkan
1. Jika `siswa.status = aktif`
   - tombol tetap `Set Berhenti`
   - hasil akhir: `tidak_aktif`
2. Jika `siswa.status = calon`
   - tombol menjadi `Tidak Jadi Masuk`
   - hasil akhir: `arsip`
3. Untuk siswa `calon`, penanganan tagihan tetap tersedia:
   - `Tandai lunas`
   - `Hapus tagihan`
   - `Biarkan`
4. Jika ada `siswa_kelas` aktif pada siswa `calon`, assignment ditutup.
5. Semua perubahan tetap masuk `sync_queue`.

### Files
1. `src/pages/SiswaDetailPage.tsx`
2. `src/services/siswaStatusService.ts`
3. `src/queries/siswaQueries.ts` jika butuh penyesuaian read model

### Use services
1. `setSiswaBerhenti`
2. `setSiswaTidakJadiMasuk` (baru)

### Implementasi minimum
1. Tambah service `setSiswaTidakJadiMasuk(actor, siswaId, input)`
2. Validasi hanya boleh untuk `status = calon`
3. Update status akhir menjadi `arsip`
4. Tutup `siswa_kelas` aktif bila ada
5. Terapkan penanganan tagihan yang sama seperti flow status lain
6. Ubah label, title, dan deskripsi modal/panel pada halaman detail siswa
7. Tombol aksi harus mengikuti status siswa secara dinamis

### Done when
1. siswa `aktif` tetap memakai `Set Berhenti`
2. siswa `calon` memakai `Tidak Jadi Masuk`
3. hasil akhir siswa `calon` adalah `arsip`
4. build hijau

### Manual check
1. buka detail siswa `calon`
2. pastikan tombol berbunyi `Tidak Jadi Masuk`
3. jalankan aksi dan cek status jadi `arsip`
4. cek penanganan tagihan bekerja
5. buka detail siswa `aktif`
6. pastikan tombol tetap `Set Berhenti`

## Task 2 — Import Dapodik Hanya Batch
Tujuan: menegaskan bahwa `Import Dapodik` hanya untuk input banyak siswa dari file Excel, bukan opsi input satu siswa di form registrasi biasa.

### Perilaku yang diinginkan
1. Form `Registrasi Siswa` hanya untuk:
   - `baru`
   - `pindahan`
   - `daftar_ulang` manual satu siswa
2. `Import Dapodik` hanya tersedia sebagai halaman batch terpisah
3. Form tunggal tidak boleh menampilkan sumber data `dapodik_import` sebagai opsi satu siswa
4. Jika admin ingin input satu siswa tahun berjalan, gunakan `daftar_ulang` manual
5. Jika admin ingin input banyak siswa, gunakan halaman import batch

### Files
1. `src/pages/SiswaCreatePage.tsx`
2. `src/pages/SiswaImportDapodikPage.tsx`
3. `src/pages/SiswaListPage.tsx`
4. `src/App.tsx`
5. `src/services/siswaService.ts`

### Use services
1. `registerSiswa`
2. `importSiswaDapodik`

### Implementasi minimum
1. Hapus opsi `dapodik_import` dari form registrasi tunggal
2. Biarkan `daftar_ulang` manual tetap tersedia di form tunggal
3. Tambahkan penjelasan eksplisit di form bahwa import banyak siswa harus lewat halaman import batch
4. Pertahankan tombol `Import Dapodik` di daftar siswa
5. Pertahankan route batch import terpisah
6. Pastikan service `importSiswaDapodik` tetap menerima banyak baris sekaligus
7. Pastikan hasil import tetap:
   - `status = aktif`
   - `jalur_registrasi = daftar_ulang`
   - `sumber_data = dapodik_import`
8. Jangan gunakan istilah `tanggal daftar` pada import batch. Gunakan istilah yang sesuai konteks:
   - `tanggal efektif masuk`
   - `jatuh tempo daftar ulang`
9. Jika file Excel memiliki kolom `tanggal masuk`, gunakan nilai itu per siswa.
10. Jika file tidak punya kolom `tanggal masuk`, fallback ke `tanggal efektif masuk` dari form import.

### Done when
1. form tunggal tidak lagi menawarkan `dapodik_import`
2. import batch tetap berjalan dari Excel
3. tombol menuju halaman import batch tetap ada
4. build hijau

### Manual check
1. buka `/siswa/new`
2. pastikan tidak ada opsi `Import Dapodik` untuk satu siswa
3. pastikan `daftar_ulang` manual masih bisa dipakai
4. buka `/siswa/import-dapodik`
5. upload file contoh
6. pastikan preview banyak siswa tetap muncul
7. pastikan field tanggal di form import bukan `tanggal daftar`
8. pastikan preview memakai `tanggal masuk` dari file jika ada
9. import dan cek banyak siswa masuk sekaligus

## Verifikasi Akhir
1. `npm run build`
2. cek detail siswa `calon`
3. cek detail siswa `aktif`
4. cek form registrasi tunggal
5. cek halaman import batch
6. cek data hasil import di:
   - `siswa`
   - `siswa_kelas`
   - `tagihan`
   - `sync_queue`

## Catatan
1. Jangan mengubah flow `auto-placement` di fase ini.
2. Jangan mengubah `pembayaranService` kecuali ada efek samping langsung dari task ini.
3. Jika ada istilah yang masih membingungkan di UI, prioritaskan istilah:
   - `Tidak Jadi Masuk` untuk siswa `calon`
   - `Import Dapodik` untuk batch
   - `Daftar Ulang Manual` untuk input satu siswa tahun berjalan
