# task-roadmap-prd-revisi.md

## Roadmap Implementasi PRD Revisi
Tujuan: menurunkan PRD di `AGENTS.md` menjadi urutan kerja implementasi yang bisa dieksekusi bertahap di codebase ini.

## Prinsip Eksekusi
1. `AGENTS.md` adalah source of truth bisnis terbaru.
2. Semua read tetap dari IndexedDB melalui query/read model.
3. Semua write wajib lewat service layer.
4. UI tidak boleh menulis langsung ke `db.*`.
5. Semua perubahan multi-tabel harus enqueue ke `sync_queue`.
6. Setelah setiap fase selesai, jalankan `npm run build`.
7. Prioritaskan perubahan kecil yang menjaga kode yang sudah hidup.

## Snapshot Repo Saat Ini
Codebase sudah punya fondasi berikut:
1. routing utama di `src/App.tsx`
2. halaman inti:
   - `src/pages/SiswaListPage.tsx`
   - `src/pages/SiswaCreatePage.tsx`
   - `src/pages/SiswaDetailPage.tsx`
   - `src/pages/SiswaEditPage.tsx`
   - `src/pages/SiswaImportDapodikPage.tsx`
   - `src/pages/TagihanPage.tsx`
   - `src/pages/PembayaranPage.tsx`
   - `src/pages/KelasPage.tsx`
   - `src/pages/TahunAjaranPage.tsx`
   - `src/pages/ProsesNaikKelasPage.tsx`
3. service layer utama:
   - `src/services/siswaService.ts`
   - `src/services/siswaStatusService.ts`
   - `src/services/tagihanService.ts`
   - `src/services/pembayaranService.ts`
   - `src/services/kelasService.ts`
   - `src/services/tahunAjaranService.ts`
   - `src/services/placementService.ts`
   - `src/services/naikKelasService.ts`
4. query layer utama:
   - `src/queries/siswaQueries.ts`
   - `src/queries/tagihanQueries.ts`
   - `src/queries/pembayaranQueries.ts`
   - `src/queries/kelasQueries.ts`
   - `src/queries/tahunAjaranQueries.ts`
   - `src/queries/pengaturanQueries.ts`

## Gap Utama Terhadap PRD Revisi
1. enum status siswa lama harus diselaraskan ke `calon`, `aktif`, `lulus`, `berhenti`
2. jalur `daftar_ulang` harus dihapus dari alur siswa utama
3. `Import Dapodik` harus diganti arah menjadi:
   - import batch siswa baru/calon
   - migrasi siswa
4. migrasi siswa harus dipisah dari migrasi tagihan dan migrasi riwayat pembayaran
5. aksi `Set Lulus` harus hidup end-to-end
6. proses naik kelas harus menutup siswa menjadi `lulus` atau `berhenti`, bukan `arsip`
7. laporan dan filter harus ikut enum baru

## Urutan Fase yang Disarankan
1. Fase 6 — Penyelarasan Model Data dan Enum
2. Fase 7 — Form Siswa Operasional Normal
3. Fase 8 — Import Batch Siswa Baru/Calon
4. Fase 9 — Migrasi Siswa
5. Fase 10 — Migrasi Tagihan dan Riwayat Pembayaran
6. Fase 11 — Status Siswa, Pembayaran, dan Penempatan
7. Fase 12 — Proses Naik Kelas dan Kelas
8. Fase 13 — Laporan dan Kuitansi
9. Fase 14 — PWA, Sync, dan Final Hardening

---

## FASE 6 — PENYELARASAN MODEL DATA DAN ENUM
Tujuan: menyamakan schema lokal, type, query, dan badge UI dengan PRD revisi.

### Scope
1. ubah enum status siswa menjadi `calon`, `aktif`, `lulus`, `berhenti`
2. ubah `jenis_masuk` menjadi `awal_tahun` / `pindahan`
3. ubah `jalur_registrasi` menjadi `baru` / `pindahan` / `migrasi`
4. ubah `sumber_data` menjadi `manual` / `import_excel`
5. tambah field `alasan_keluar`
6. tambah field `tanggal_keluar`
7. tambah `penempatan_sumber = import_excel`

### Files utama
1. `src/db/types.ts`
2. `src/db/index.ts`
3. `src/db/seed.ts`
4. `src/components/ui/StatusBadgeSiswa.tsx`
5. `src/queries/siswaQueries.ts`
6. `src/queries/dashboardQueries.ts`
7. `src/lib/format.ts` jika ada formatter label enum

### Implementasi minimum
1. update type TypeScript untuk semua enum terkait siswa
2. update seed mock agar tidak membuat nilai status lama
3. update badge siswa dan label filter
4. update query list/detail agar tidak mengandalkan enum lama
5. siapkan data migration lokal bila Dexie version perlu dinaikkan

### Done when
1. tidak ada referensi aktif ke `tidak_aktif`, `arsip`, `daftar_ulang`, `dapodik_import`
2. build hijau
3. halaman list dan detail siswa masih render

---

## FASE 7 — FORM SISWA OPERASIONAL NORMAL
Tujuan: menyesuaikan input siswa normal ke dua jalur: `baru` dan `pindahan`.

### Scope
1. `Siswa Baru / Calon Manual`
2. `Siswa Pindahan Manual`
3. hapus flow `daftar_ulang` dari form utama
4. pertahankan early bird untuk jalur `baru`

### Files utama
1. `src/pages/SiswaCreatePage.tsx`
2. `src/pages/SiswaEditPage.tsx`
3. `src/services/siswaService.ts`
4. `src/queries/kelasQueries.ts`
5. `src/queries/pengaturanQueries.ts`

### Implementasi minimum
1. form punya konteks `Operasional Normal` dan `Migrasi`
2. mode `baru` membuat siswa `calon`
3. mode `pindahan` membuat siswa `aktif`
4. `pindahan` wajib pilih kelas tujuan
5. tagihan `pendaftaran` tetap dibuat untuk alur normal
6. `pindahan` tidak mendapat diskon early bird
7. field dan validasi form mengikuti PRD baru

### Done when
1. create siswa baru normal berhasil
2. create siswa pindahan berhasil
3. data masuk ke `siswa`, `tagihan`, `siswa_kelas`, `sync_queue` sesuai jalur

---

## FASE 8 — IMPORT BATCH SISWA BARU/CALON
Tujuan: mengganti import batch lama menjadi import batch calon berbasis template baru.

### Scope
1. import file `template_import_siswa_calon.xlsx`
2. biaya pendaftaran per baris
3. early bird dihitung per baris
4. siswa hasil import berstatus `calon`

### Files utama
1. `src/pages/SiswaImportDapodikPage.tsx`
2. `src/services/siswaService.ts`
3. `src/queries/tahunAjaranQueries.ts`
4. `src/queries/pengaturanQueries.ts`
5. util parser Excel yang sudah dipakai proyek

### Catatan refactor
1. halaman lama boleh dipertahankan filenya, tetapi fungsi dan copy-nya harus berubah
2. nama route boleh tetap sementara, tapi target akhir sebaiknya diganti agar tidak menyisakan istilah Dapodik

### Implementasi minimum
1. preview isi file import
2. validasi kolom wajib sesuai template
3. tampilkan total valid dan total gagal
4. generate siswa + tagihan pendaftaran per baris valid
5. jangan buat `siswa_kelas` aktif pada import calon
6. hasil gagal tampil sebagai daftar error yang bisa dibaca admin

### Done when
1. import satu file dengan banyak calon berhasil
2. tiap baris membuat biaya pendaftaran masing-masing
3. siswa hasil import berstatus `calon`

---

## FASE 9 — MIGRASI SISWA
Tujuan: membuat jalur migrasi siswa terpisah dari operasional normal.

### Scope
1. `Migrasi Manual`
2. `Migrasi Excel`
3. status hasil migrasi: `aktif`, `lulus`, `berhenti`
4. tidak membuat tagihan awal otomatis

### Files utama
1. `src/pages/SiswaCreatePage.tsx`
2. halaman baru opsional: `src/pages/SiswaMigrasiPage.tsx`
3. `src/services/siswaService.ts`
4. `src/queries/kelasQueries.ts`
5. parser Excel migrasi siswa

### Implementasi minimum
1. mode migrasi menampilkan field status hasil migrasi
2. status `aktif` wajib punya kelas aktif
3. status `lulus` dan `berhenti` tidak punya kelas aktif terbuka
4. import Excel melakukan mapping kelas
5. mapping gagal masuk review manual
6. tidak buat tagihan `pendaftaran` atau `daftar_ulang`

### Done when
1. migrasi manual siswa aktif berhasil
2. migrasi manual siswa lulus/berhenti berhasil
3. import migrasi Excel bisa auto-assign kelas jika mapping cocok

---

## FASE 10 — MIGRASI TAGIHAN DAN RIWAYAT PEMBAYARAN
Tujuan: memasukkan saldo/tagihan lama dan histori pembayaran lama secara terpisah.

### Scope
1. import `template_migrasi_tagihan.xlsx`
2. import `template_migrasi_pembayaran.xlsx`
3. recalc `sudah_dibayar` dan `status` tagihan setelah import pembayaran

### Files utama
1. halaman baru `src/pages/MigrasiTagihanPage.tsx`
2. halaman baru `src/pages/MigrasiPembayaranPage.tsx`
3. `src/services/tagihanService.ts`
4. `src/services/pembayaranService.ts`
5. query helper untuk lookup `kode_import_*`

### Implementasi minimum
1. simpan `kode_import_siswa` dan `kode_import_tagihan` dalam mekanisme migrasi internal
2. validasi `kode_import_*` unik dalam satu file
3. validasi `bulan_tahun` wajib untuk tagihan SPP
4. hubungkan pembayaran ke tagihan migrasi
5. recalc semua tagihan setelah import pembayaran selesai
6. tagihan/pembayaran migrasi tidak mengubah status siswa otomatis

### Done when
1. tagihan lama bisa masuk tanpa manual entry satu-satu
2. pembayaran lama bisa masuk dan memperbarui saldo tagihan
3. hasil recalc sama dengan total pembayaran per tagihan

---

## FASE 11 — STATUS SISWA, PEMBAYARAN, DAN PENEMPATAN
Tujuan: menyelaraskan efek pembayaran dan perubahan status siswa dengan PRD revisi.

### Scope
1. `Set Siswa Berhenti`
2. `Set Siswa Lulus`
3. efek pembayaran pendaftaran terhadap siswa `baru`
4. penempatan otomatis dan override manual

### Files utama
1. `src/pages/SiswaDetailPage.tsx`
2. `src/services/siswaStatusService.ts`
3. `src/services/pembayaranService.ts`
4. `src/services/placementService.ts`
5. `src/queries/siswaQueries.ts`

### Implementasi minimum
1. siswa aktif bisa `Set Lulus`
2. siswa aktif bisa `Set Berhenti`
3. aksi berhenti wajib isi `alasan_keluar`
4. aksi lulus wajib isi `tanggal_keluar`
5. pelunasan `pendaftaran` siswa baru memicu auto-placement jika tahun ajaran target sudah aktif
6. siswa pindahan tetap `aktif` setelah pencatatan pembayaran
7. tagihan migrasi tidak memicu perubahan status otomatis

### Done when
1. `Set Lulus` dan `Set Berhenti` bekerja end-to-end
2. status siswa dan histori kelas konsisten setelah aksi
3. pembayaran pendaftaran memicu perubahan status sesuai PRD

---

## FASE 12 — PROSES NAIK KELAS DAN KELAS
Tujuan: menyesuaikan wizard naik kelas dengan status akhir `lulus` atau `berhenti`.

### Scope
1. mapping kelas asal ke kelas tujuan
2. siswa yang tidak naik kelas harus dipilih `lulus` atau `berhenti`
3. aktivasi tahun ajaran tujuan tetap memicu auto-placement calon yang sudah lunas

### Files utama
1. `src/pages/ProsesNaikKelasPage.tsx`
2. `src/services/naikKelasService.ts`
3. `src/services/tahunAjaranService.ts`
4. `src/services/kelasService.ts`

### Implementasi minimum
1. hapus hasil akhir `arsip`
2. ganti review siswa agar punya status akhir eksplisit
3. tutup `siswa_kelas` lama untuk semua siswa yang diproses
4. aktifkan tahun ajaran tujuan di akhir proses

### Done when
1. wizard naik kelas selesai tanpa enum status lama
2. siswa yang tidak naik kelas berakhir sebagai `lulus` atau `berhenti`

---

## FASE 13 — LAPORAN DAN KUITANSI
Tujuan: menyalakan laporan yang masih placeholder dan memastikan label mengikuti PRD revisi.

### Scope
1. Rekap Penerimaan
2. Daftar Tunggakan
3. Riwayat per Siswa
4. Laporan Pendaftaran
5. Laporan Diskon Early Bird
6. Kuitansi PDF

### Files utama
1. route placeholder di `src/App.tsx`
2. halaman laporan baru di `src/pages/*`
3. query laporan di `src/queries/*`
4. util PDF di `src/lib/*` atau `src/services/*`

### Implementasi minimum
1. filter laporan membaca dari IndexedDB
2. laporan pendaftaran hanya untuk jalur `baru` dan `pindahan`
3. status siswa di laporan ikut enum baru
4. kuitansi PDF memakai `profil_sekolah`

### Done when
1. semua route laporan tidak lagi placeholder
2. PDF kuitansi bisa digenerate dari pembayaran

---

## FASE 14 — PWA, SYNC, DAN FINAL HARDENING
Tujuan: menyelesaikan lapisan offline-first dan sinkronisasi online agar sesuai target PRD.

### Scope
1. indikator offline/online
2. pending sync count dari `sync_queue`
3. push queue dan pull incremental
4. conflict handling
5. initial sync dan periodic sync
6. service worker dan manifest

### Files utama
1. `src/db/index.ts`
2. layer sync baru di `src/services/*` atau `src/sync/*`
3. `src/layouts/AppShell.tsx`
4. konfigurasi Vite PWA

### Implementasi minimum
1. offline banner
2. badge pending sync live
3. trigger sync saat online
4. log sync success/failure
5. update banner untuk versi baru tersedia

### Done when
1. app tetap usable offline untuk operasi non-upload
2. data write masuk queue lalu bisa disinkronkan saat online

---

## Checklist Lintas Fase
1. update semua copy UI agar mengikuti istilah PRD baru
2. update route/menu yang masih menyebut Dapodik bila fitur sudah bergeser total
3. update data dummy dan seed untuk skenario:
   - calon baru
   - siswa aktif awal tahun
   - siswa aktif pindahan
   - siswa lulus
   - siswa berhenti
   - siswa migrasi
4. tambahkan test manual untuk setiap flow utama
5. build harus hijau setelah tiap fase

## Saran Eksekusi Nyata Berikutnya
1. kerjakan Fase 6 lebih dulu karena menyentuh enum dan data contract
2. lanjut Fase 7 dan Fase 8 karena memengaruhi form siswa utama
3. setelah itu baru buka Fase 9 dan Fase 10 agar migrasi transaksi tidak dibangun di atas schema lama
