# task-namafase.md

## FASE 4 — HALAMAN UI
Tujuan: setiap halaman terhubung ke service/repository layer, semua operasi tulis ke IndexedDB melalui service layer, dan semua tampilan membaca dari IndexedDB.

## Aturan Eksekusi
1. Fase ini dikerjakan satu halaman per task.
2. Semua read harus dari IndexedDB.
3. Semua write wajib lewat service layer.
4. Komponen UI dilarang menulis langsung ke `db.*`.
5. Setiap button yang terlihat harus berfungsi.
6. Jika fitur belum siap karena service belum ada, button boleh disabled dengan label alasan yang jelas.
7. Ikuti style visual yang sudah hidup di repo saat ini, terutama `AppShell`, `Login`, dan `Dashboard`.
8. Jangan tambah dependency baru.
9. Gunakan `dexie-react-hooks` untuk read live dari IndexedDB.
10. Setelah setiap task, jalankan `npm run build` dan lakukan cek manual halaman itu.

## Arsitektur UI Wajib
1. Read path: `Page -> useLiveQuery / query helper -> IndexedDB`
2. Write path: `Page -> service layer -> IndexedDB + sync_queue`
3. Session path: `Page -> useAuthStore -> actor helper -> service`
4. Error path: `service error -> mapped message -> inline alert`

## Urutan Task
1. Task 0 — Fondasi UI dan read layer
2. Task 1 — Halaman Tahun Ajaran
3. Task 2 — Halaman Siswa List
4. Task 3 — Halaman Pendaftaran Siswa
5. Task 4 — Halaman Detail Siswa
6. Task 5 — Halaman Edit Siswa
7. Task 6 — Halaman Tagihan
8. Task 7 — Halaman Pembayaran
9. Task 8 — Refactor Dashboard live data
10. Task 9 — Halaman yang ditunda sampai service tersedia

## Task 0 — Fondasi UI dan Read Layer
Tujuan: menyiapkan util, read helper, route dasar, dan komponen kecil reusable.

Route:
1. Tidak fokus ke halaman tertentu.
2. Tambah route yang akan dipakai task berikutnya.

Files:
1. `src/App.tsx`
2. `src/store/authStore.ts`
3. `src/lib/actor.ts` atau `src/utils/actor.ts`
4. `src/lib/format.ts` atau `src/utils/format.ts`
5. `src/components/ui/*`
6. `src/queries/*` atau `src/read-models/*`

Implement:
1. Buat helper `getCurrentActor(user)` untuk membentuk `ServiceActor`.
2. Buat formatter `formatRupiah`.
3. Buat formatter `formatTanggal`.
4. Buat formatter `formatShortDate`.
5. Buat formatter `formatMonthYear`.
6. Buat komponen kecil reusable `PageHeader`.
7. Buat komponen kecil reusable `SectionCard`.
8. Buat komponen kecil reusable `EmptyState`.
9. Buat komponen kecil reusable `FormField`.
10. Buat komponen badge `StatusBadgeSiswa`.
11. Buat komponen badge `StatusBadgeTagihan`.
12. Buat komponen badge `JenisTagihanBadge`.
13. Buat query helper `listTahunAjaran`.
14. Buat query helper `listActiveKelas`.
15. Buat query helper `listSiswaWithFilters`.
16. Buat query helper `getSiswaDetail`.
17. Buat query helper `listTagihanWithFilters`.
18. Buat query helper `listPembayaranWithFilters`.
19. Buat query helper `getDashboardSummary`.
20. Pakai `useLiveQuery` untuk semua read halaman.
21. Tambah route `/siswa/new`.
22. Tambah route `/siswa/:id`.
23. Tambah route `/siswa/:id/edit`.
24. Tambah route `/pembayaran/new`.
25. Hubungkan `pendingSyncCount` ke `db.sync_queue`, bukan counter manual.

Done when:
1. Tidak ada write langsung di komponen.
2. Route dasar siap dipakai halaman berikutnya.
3. Formatter dan badge reusable siap dipakai.
4. `pendingSyncCount` dibaca dari IndexedDB.
5. `npm run build` hijau.

Manual check:
1. App masih bisa login.
2. Route baru tidak merusak route lama.
3. Badge pending sync berubah sesuai isi `sync_queue`.

## Task 1 — Halaman Tahun Ajaran
Tujuan: mengganti placeholder `/tahun-ajaran` menjadi halaman nyata yang membaca live dari IndexedDB dan menulis lewat service.

Route:
1. `/tahun-ajaran`

Files:
1. `src/pages/TahunAjaranPage.tsx`
2. `src/App.tsx`
3. `src/queries/tahunAjaranQueries.ts` jika dipisah

Use services:
1. `createTahunAjaran`
2. `updateTahunAjaran`
3. `activateTahunAjaran`

Read from IndexedDB:
1. daftar semua tahun ajaran
2. status aktif
3. periode mulai-selesai

UI minimum:
1. page header
2. tombol `Buat tahun ajaran baru`
3. daftar atau tabel tahun ajaran
4. badge `Aktif` atau `Arsip`
5. tombol `Edit`
6. tombol `Aktifkan`
7. modal atau inline form tambah/edit

Buttons that must work:
1. `Buat tahun ajaran baru`
2. `Simpan`
3. `Batal`
4. `Edit`
5. `Aktifkan`

Done when:
1. data tampil live dari IndexedDB
2. tambah berhasil
3. edit berhasil
4. aktifkan berhasil
5. hanya satu tahun ajaran aktif

Manual check:
1. buat 2 tahun ajaran
2. aktifkan salah satu
3. pastikan yang lain jadi nonaktif
4. refresh halaman dan data tetap benar

## Task 2 — Halaman Siswa List
Tujuan: mengganti placeholder `/siswa` menjadi halaman daftar siswa live dari IndexedDB.

Route:
1. `/siswa`

Files:
1. `src/pages/SiswaListPage.tsx`
2. `src/App.tsx`
3. `src/queries/siswaQueries.ts`

Use services:
1. Tidak ada write utama selain navigasi.

Read from IndexedDB:
1. `siswa`
2. `siswa_kelas`
3. `kelas`
4. `tagihan`

UI minimum:
1. page header
2. tombol `Tambah siswa`
3. tab filter status
4. search nama siswa atau wali
5. filter kelas aktif
6. tabel siswa
7. kolom nama
8. kolom kelas aktif
9. kolom status
10. kolom total sisa tagihan
11. kolom aksi

Buttons that must work:
1. `Tambah siswa` -> `/siswa/new`
2. `Lihat detail` -> `/siswa/:id`
3. `Edit` -> `/siswa/:id/edit`
4. tab filter status
5. search
6. filter kelas

Done when:
1. list siswa live dari IndexedDB
2. kelas aktif tampil benar
3. total sisa tagihan benar
4. filter bekerja lokal tanpa network

Manual check:
1. keadaan kosong tetap render empty state
2. setelah tambah siswa baru, list update otomatis
3. filter status memfilter benar
4. filter kelas memfilter benar

## Task 3 — Halaman Pendaftaran Siswa
Tujuan: membuat halaman form pendaftaran siswa yang sepenuhnya menulis lewat `registerSiswa`.

Route:
1. `/siswa/new`

Files:
1. `src/pages/SiswaCreatePage.tsx`
2. `src/App.tsx`
3. `src/queries/pengaturanQueries.ts`
4. `src/queries/kelasQueries.ts`

Use services:
1. `registerSiswa`

Read from IndexedDB:
1. `pengaturan` key `early_bird`
2. kelas aktif untuk opsi pindahan

UI minimum:
1. section data siswa
2. section data wali
3. section data pendaftaran
4. tanggal daftar default hari ini
5. radio `baru`
6. radio `pindahan`
7. dropdown kelas tujuan hanya untuk pindahan
8. radio `full`
9. radio `cicil`
10. input jumlah termin hanya saat cicil
11. badge info early bird real-time
12. preview estimasi cicilan
13. inline error message

Buttons that must work:
1. `Simpan`
2. `Batal`
3. toggle `Baru/Pindahan`
4. toggle `Full/Cicil`

Done when:
1. submit memanggil `registerSiswa`
2. siswa tersimpan ke IndexedDB
3. tagihan pendaftaran ikut dibuat
4. `siswa_kelas` ikut dibuat bila pindahan
5. UI redirect ke list atau detail setelah sukses

Manual check:
1. buat siswa baru biasa
2. buat siswa pindahan
3. coba cicil dengan termin valid
4. coba cicil dengan termin tidak valid
5. cek data masuk ke `siswa`
6. cek data masuk ke `tagihan`
7. cek data masuk ke `siswa_kelas` untuk pindahan

## Task 4 — Halaman Detail Siswa
Tujuan: membuat halaman detail siswa berbasis read model dari IndexedDB.

Route:
1. `/siswa/:id`

Files:
1. `src/pages/SiswaDetailPage.tsx`
2. `src/App.tsx`
3. `src/queries/siswaQueries.ts`
4. `src/queries/tagihanQueries.ts`
5. `src/queries/pembayaranQueries.ts`

Use services:
1. Belum ada write besar selain navigasi ke pembayaran.

Read from IndexedDB:
1. profil siswa
2. kelas aktif
3. riwayat kelas
4. tagihan siswa
5. pembayaran siswa

UI minimum:
1. header siswa
2. badge status
3. badge diskon jika ada
4. tombol `Edit profil`
5. tombol `Set berhenti`
6. tab `Profil`
7. tab `Tagihan`
8. tab `Riwayat Pembayaran`

Buttons that must work:
1. `Edit profil` -> `/siswa/:id/edit`
2. `Catat pembayaran` -> `/pembayaran/new?tagihanId=...`
3. `Lihat riwayat bayar` -> pindah tab pembayaran atau fokus section
4. `Set berhenti` -> disabled dengan label `Segera tersedia` jika service belum ada

Done when:
1. semua data siswa terbaca live
2. tab tagihan benar
3. tab riwayat pembayaran benar
4. semua tombol aksi valid

Manual check:
1. buka siswa tanpa kelas aktif
2. buka siswa dengan tagihan pendaftaran
3. buka siswa dengan beberapa pembayaran

## Task 5 — Halaman Edit Siswa
Tujuan: membuat halaman edit profil siswa yang menulis lewat `updateSiswa`.

Route:
1. `/siswa/:id/edit`

Files:
1. `src/pages/SiswaEditPage.tsx`
2. `src/App.tsx`

Use services:
1. `updateSiswa`

Read from IndexedDB:
1. data siswa by id

UI minimum:
1. form edit profil
2. field identitas siswa
3. field wali
4. field pendaftaran tidak editable atau tidak ditampilkan

Buttons that must work:
1. `Simpan perubahan`
2. `Batal`
3. `Kembali`

Done when:
1. data awal termuat dari Dexie
2. submit memanggil `updateSiswa`
3. redirect kembali ke detail setelah sukses
4. detail page langsung menampilkan data baru

Manual check:
1. ubah nama siswa
2. ubah kontak wali
3. refresh detail dan data tetap benar

## Task 6 — Halaman Tagihan
Tujuan: membuat halaman tagihan yang mendukung list, generate SPP, tagihan manual, hapus, dan shortcut ke pembayaran.

Route:
1. `/tagihan`

Files:
1. `src/pages/TagihanPage.tsx`
2. `src/App.tsx`
3. `src/queries/tagihanQueries.ts`
4. `src/queries/siswaQueries.ts`
5. `src/queries/kelasQueries.ts`
6. `src/queries/pengaturanQueries.ts`

Use services:
1. `generateSppBulanan`
2. `createManualTagihan`
3. `deleteTagihan`

Read from IndexedDB:
1. list tagihan lintas siswa
2. kelas aktif siswa
3. daftar jenis tagihan dari pengaturan
4. daftar siswa aktif
5. daftar kelas aktif

UI minimum:
1. page header
2. filter bulan/tahun
3. filter kelas
4. filter jenis
5. filter status
6. tabel tagihan
7. section `Generate SPP`
8. section `Tagihan manual`
9. tombol `Catat pembayaran`
10. tombol `Hapus`

Buttons that must work:
1. `Generate SPP`
2. `Simpan tagihan manual`
3. `Hapus tagihan`
4. `Catat pembayaran`
5. semua filter

Done when:
1. generate SPP langsung menambah data live
2. tagihan manual langsung menambah data live
3. hapus hanya sukses untuk tagihan tanpa pembayaran
4. `Catat pembayaran` membuka halaman pembayaran

Manual check:
1. generate SPP dua kali untuk bulan sama
2. pastikan duplikat di-skip
3. buat tagihan manual target semua
4. hapus tagihan tanpa pembayaran
5. coba hapus tagihan yang sudah dibayar dan pastikan gagal

## Task 7 — Halaman Pembayaran
Tujuan: membuat halaman pembayaran yang membaca siswa dan tagihan dari IndexedDB lalu menulis lewat `recordPembayaran`.

Route:
1. `/pembayaran`
2. `/pembayaran/new`

Files:
1. `src/pages/PembayaranPage.tsx`
2. `src/App.tsx`
3. `src/queries/pembayaranQueries.ts`
4. `src/queries/siswaQueries.ts`
5. `src/queries/tagihanQueries.ts`
6. `src/queries/pengaturanQueries.ts`

Use services:
1. `recordPembayaran`

Read from IndexedDB:
1. siswa
2. tagihan belum lunas per siswa
3. metode pembayaran dari pengaturan

UI minimum:
1. select siswa
2. select tagihan
3. tanggal bayar default hari ini
4. input jumlah
5. select metode
6. input catatan
7. info total
8. info sudah dibayar
9. info sisa
10. preview status setelah bayar

Buttons that must work:
1. `Simpan pembayaran`
2. `Catat pembayaran lain`
3. `Selesai`
4. `Cetak kuitansi` -> disabled dengan label `Segera tersedia` bila PDF belum ada

Done when:
1. pembayaran tersimpan via service
2. tagihan update live
3. status siswa `calon` bisa berubah `aktif`
4. query param `tagihanId` bisa prefill form

Manual check:
1. bayar sebagian
2. bayar lunas
3. coba bayar melebihi sisa
4. cek status tagihan berubah
5. cek siswa `calon` jadi `aktif` jika pendaftaran lunas semua

## Task 8 — Refactor Dashboard
Tujuan: mengganti semua mock hardcoded di dashboard menjadi data live dari IndexedDB.

Route:
1. `/`

Files:
1. `src/pages/Dashboard.tsx`
2. `src/queries/dashboardQueries.ts`

Use services:
1. Tidak wajib write.
2. Hanya navigasi.

Read from IndexedDB:
1. jumlah siswa aktif
2. total penerimaan bulan ini
3. total tunggakan
4. pending sync
5. pembayaran terbaru

Buttons that must work:
1. quick action `Daftar siswa`
2. quick action `Catat bayar`
3. `Lihat semua`

Done when:
1. tidak ada mock array hardcoded lagi
2. semua angka live dari IndexedDB
3. semua tombol quick action menavigasi benar

Manual check:
1. tambah siswa lalu dashboard berubah bila relevan
2. catat pembayaran lalu daftar pembayaran terbaru berubah
3. pending sync badge sesuai isi `sync_queue`

## Task 9 — Halaman Yang Ditunda
Jangan kerjakan dulu sampai service cukup.

Daftar:
1. `/kelas`
2. `/pengaturan/profil-sekolah`
3. `/pengaturan/akun`
4. `/pengaturan/permission`
5. `/pengaturan/jenis-tagihan`
6. `/pengaturan/metode-pembayaran`
7. `/pengaturan/early-bird`
8. `/proses-naik-kelas`
9. semua `/laporan/*`

Alasan:
1. service CRUD atau batch logic belum ada
2. beberapa butuh update pengaturan
3. beberapa butuh export PDF atau Excel

## Template Prompt Untuk Model Lebih Rendah

1. Implement `Task satu persatu`. tulis ke walktrough setiap task selesai. Setelah selesai, jalankan `npm run build` dan laporkan hasilnya. lanjutkan jika sudah tidak error.
2. Jangan sentuh task lain.
3. Semua read harus dari IndexedDB memakai `useLiveQuery` atau query helper.
4. Semua write harus lewat service layer yang sudah ada.
5. Jangan tambah dependency baru.
6. Pertahankan style visual yang sudah dipakai di `AppShell`, `Login`, dan `Dashboard`.
7. Pastikan semua button yang dirender benar-benar berfungsi.
8. Jika task blocked karena service belum ada, jangan pindahkan business logic ke UI.

## Definisi Done Global
1. Placeholder route untuk task itu sudah hilang.
2. UI membaca data live dari IndexedDB.
3. Semua write lewat service.
4. Semua button aktif berfungsi.
5. Empty state ada.
6. Loading state ada.
7. Error state ada.
8. Build hijau.
9. Manual flow utama halaman lolos.
