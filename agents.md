# PRD — Sistem Pencatatan Tagihan PAUD
**Versi:** 3.0
**Tanggal:** 30 Mei 2026
**Status:** Draft — ditujukan untuk AI Agent
**Scope:** Single role (Admin), offline-first PWA, sync ke Supabase

---

## Daftar Isi

1. [Ringkasan Sistem](#1-ringkasan-sistem)
2. [Prinsip Arsitektur](#2-prinsip-arsitektur)
3. [Stack Teknologi](#3-stack-teknologi)
4. [Lapisan Offline (Local-First)](#4-lapisan-offline-local-first)
5. [Lapisan Sync (Online)](#5-lapisan-sync-online)
6. [Skema Database](#6-skema-database)
7. [Spesifikasi Modul & Aksi](#7-spesifikasi-modul--aksi)
   - 7.1 [Pengaturan Sekolah](#71-pengaturan-sekolah)
   - 7.2 [Pengaturan Akun & Permission](#72-pengaturan-akun--permission)
   - 7.3 [Tahun Ajaran](#73-tahun-ajaran)
   - 7.4 [Kelas](#74-kelas)
   - 7.5 [Siswa](#75-siswa)
   - 7.6 [Lanjut Tahun Ajaran](#76-lanjut-tahun-ajaran)
   - 7.7 [Tagihan](#77-tagihan)
   - 7.8 [Pembayaran](#78-pembayaran)
   - 7.9 [Laporan](#79-laporan)
8. [Aturan Bisnis](#8-aturan-bisnis)
9. [Validasi & Error Handling](#9-validasi--error-handling)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Batasan & Di Luar Scope](#11-batasan--di-luar-scope)
12. [Prioritas Pengembangan](#12-prioritas-pengembangan)

---

## 1. Ringkasan Sistem

Sistem pencatatan tagihan PAUD adalah **Progressive Web App (PWA) berbasis local-first** untuk mengelola keuangan sekolah PAUD: pendaftaran siswa, tagihan (SPP dan non-SPP), pencatatan pembayaran manual, dan laporan keuangan.

### Prinsip utama

- **Offline-first:** Semua operasi berjalan dari IndexedDB lokal. Supabase hanya digunakan untuk backup dan sync antar perangkat.
- **Single role saat ini:** Hanya ada role `admin`. Sistem permission dirancang extensible untuk role tambahan di masa depan.
- **Tidak ada payment gateway:** Semua pembayaran dicatat manual oleh admin.
- **Data tidak pernah dihapus permanen:** Semua entitas menggunakan soft delete via kolom `deleted_at`.
- **Multi-jalur pencatatan siswa:** Sistem mendukung jalur operasional `baru` dan `pindahan`, serta mode `migrasi` untuk siswa existing dengan aturan status dan tagihan yang berbeda.
- **Tahun ajaran target:** Siswa baru dapat didaftarkan untuk tahun ajaran yang belum aktif tanpa langsung dianggap sebagai siswa aktif pada tahun ajaran berjalan.
- **Status siswa yang eksplisit:** Status siswa yang dipakai adalah `calon`, `aktif`, `lulus`, `berhenti`, dan `batal_daftar`. Atribut seperti `pindahan` dan `pindah sekolah` dicatat terpisah sebagai metadata, bukan status utama.
- **Status siswa berbasis periode:** Status utama siswa disimpan global, tetapi status yang ditampilkan di UI mengikuti tahun ajaran yang sedang dilihat. Pada tahun aktif tidak ada status `lulus`; siswa keluar ditampilkan sebagai `Keluar`, calon batal sebagai `Batal Daftar`. Pada tahun arsip, status historis ditampilkan sebagai `Naik Kelas`, `Alumni`, `Keluar`, `Batal Daftar`, atau `Tidak Lanjut`.
- **Penempatan kelas otomatis:** Saat tahun ajaran target diaktifkan, siswa baru yang sudah lunas dapat ditempatkan otomatis ke kelas berdasarkan umur dengan cutoff default 1 Juli dan tetap bisa dioverride manual oleh admin.
- **Status tahun ajaran eksplisit:** Tahun ajaran memiliki status `draft`, `aktif`, dan `arsip`. Tahun ajaran aktif hanya boleh satu. Tahun ajaran aktif hanya boleh menjadi `arsip` melalui proses naik kelas.
- **Normalisasi nama dan anti-duplikasi:** Nama tahun ajaran, kelas, metode pembayaran, dan jenis tagihan wajib dinormalisasi sebelum disimpan: trim spasi, collapse spasi berlebih, dan perbandingan duplikat case-insensitive. Nama tahun ajaran wajib setara format `YYYY/YYYY`; input dengan pemisah `/`, `-`, `–`, atau `—` dinormalisasi ke `YYYY/YYYY`, dan tahun kedua wajib tepat satu tahun setelah tahun pertama.
- **Lock tahun ajaran arsip:** Tahun ajaran `arsip` bersifat read-only. Admin boleh melihat data historis dan laporan, tetapi tidak boleh mengubah master/transaksi pada periode arsip.
- **Piutang lama tetap aktif:** Tagihan/tunggakan awal tetap menyimpan `tahun_ajaran_id` saat pertama dicatat dan tidak dipindahkan saat Lanjut Tahun Ajaran. Jika belum lunas, tagihan tersebut tetap tampil sebagai tunggakan aktif lintas tahun sampai lunas. Pembayaran piutang lama dari tahun ajaran arsip boleh dicatat secara terbatas, hanya untuk menambah record pembayaran dan memperbarui `sudah_dibayar`/`status` tagihan.
- **Filter periode default:** Semua halaman data operasional menampilkan data tahun ajaran aktif secara default. Data tahun ajaran arsip hanya tampil jika admin sengaja memilih tahun arsip melalui filter/dropdown periode.

### Struktur Menu Aplikasi

Struktur menu navigasi aplikasi dikelompokkan sebagai berikut:

* **Dashboard**
* **Setup Awal** *(hanya tampil jika setup belum lengkap)*
  * Wizard Setup
* **Siswa**
  * Daftar Siswa
  * Tambah Calon Siswa
  * Tambah Siswa Pindahan
  * Import Calon Siswa
  * Import Siswa Aktif
* **Keuangan**
  * Tagihan
  * Pembayaran
  * Promo & Diskon
* **Tahun Ajaran**
  * Daftar Tahun Ajaran
  * Kelas & Tarif SPP
  * Pendaftaran
  * Lanjut Tahun Ajaran
* **Migrasi Data Awal**
  * Migrasi Calon Siswa
  * Migrasi Siswa Tahun Berjalan
* **Laporan**
  * Rekap Penerimaan
  * Daftar Tunggakan
  * Riwayat per Siswa
  * Pendaftaran
  * Diskon Early Bird
  * Aktivasi Tahun Ajaran
  * Audit Log
* **Pengaturan**
  * Profil Sekolah
  * Jenis Tagihan
  * Metode Pembayaran
  * Akun & Akses
  * Koreksi Data
  * Reset Data

Catatan navigasi: Sidebar memakai menu accordion. Klik menu utama membuka/menutup submenu. Route lama tetap dipertahankan untuk kompatibilitas internal. Pada desktop sidebar wajib bisa disembunyikan/ditampilkan dari tombol header. Informasi akun login berada di header sebagai avatar/menu akun tanpa outline/border; klik avatar membuka detail akun dan tombol `Keluar`. Informasi akun dan tombol `Keluar` tidak berada di footer sidebar.

Catatan route tahun ajaran: Fitur pergantian periode memakai route utama `/lanjut-tahun-ajaran`. Route lama `/proses-naik-kelas` dipertahankan sebagai redirect internal untuk kompatibilitas, tetapi label UI dan dokumentasi memakai `Lanjut Tahun Ajaran`.

Catatan Setup Awal: Wizard Setup wajib memakai layout bertahap dengan progress stepper di atas, bukan menu samping dan bukan form panjang satu halaman. Label `Setup Awal` tetap tampil ringkas di area stepper, tanpa hero/header besar yang memakan tempat. Step berikutnya terkunci sampai step sebelumnya lolos validasi; admin hanya boleh kembali ke step sebelumnya atau step yang sudah pernah valid. Jika field wajib belum valid, sistem wajib menampilkan pesan error, menyorot field bermasalah, dan scroll/focus ke field tersebut; jika error sudah tampil pada field, tidak perlu duplikasi alert error di atas form. Pada mobile stepper tampil ringkas sebagai indikator langkah/progress. Langkah minimal: Profil Sekolah, Tahun Ajaran, Kelas & Tarif SPP, Pendaftaran, Metode Pembayaran & Jenis Tagihan, dan Review. Metode pembayaran dan jenis tagihan adalah master global di `pengaturan`, bukan konfigurasi per tahun ajaran. Data setup hanya boleh tersimpan dari tombol `Simpan Setup` di langkah Review; tombol `Lanjut` dari langkah mana pun, termasuk Metode Pembayaran & Jenis Tagihan, tidak boleh memanggil proses simpan. Pada langkah Tahun Ajaran, tanggal mulai dan tanggal selesai diisi manual oleh admin; sistem tidak boleh otomatis mengisi tanggal selesai, tetapi validasi tetap mewajibkan tanggal selesai tidak sebelum mulai dan tidak lebih dari satu tahun (`selesai <= mulai + 1 tahun - 1 hari`). Pada langkah Kelas & Tarif SPP, tabel input wajib menampilkan nama kolom secara eksplisit: `No`, `Nama Kelas`, `Tingkat`, `Tarif SPP`, `Kapasitas`, `Usia Minimal`, `Usia Maksimal`, dan `Aksi`. Default Setup Awal menampilkan tiga baris kelas dengan `Tingkat` terisi `Kelompok Bermain`, `TK A`, dan `TK B`, tetapi `Nama Kelas` harus kosong dan diisi manual oleh admin. Pada mobile, setiap input kelas wajib tetap memiliki label yang sama dalam bentuk card. Setup Awal tidak mengatur Early Bird; Early Bird dikonfigurasi global di Pengaturan.

Catatan gating setup: Selama Setup Awal belum selesai, menu operasional disembunyikan dan direct route operasional diarahkan kembali ke `/setup-awal`. Menu yang boleh diakses sebelum setup selesai hanya Dashboard, Setup Awal, dan Pengaturan terbatas seperti Akun & Akses serta Reset Data. Setup Awal menyimpan draft sementara di localStorage agar admin tidak perlu mengisi ulang jika halaman ditutup atau kembali ke langkah sebelumnya. Draft ini tidak masuk IndexedDB dan tidak masuk sync queue. Data setup baru ditulis ke IndexedDB saat klik `Simpan Setup` di langkah Review dan semua validasi lolos. Jika ada validasi gagal, tidak boleh ada data setup yang tersimpan sebagian ke DB.

Catatan onboarding migrasi: Setelah Setup Awal selesai, aplikasi masuk ke tahap `Migrasi Data Awal` sebelum menu operasional dibuka penuh. Dashboard hanya menampilkan pilihan `Migrasi Calon Siswa`, `Migrasi Siswa Tahun Berjalan`, `Selesai Migrasi Data Awal`, dan `Lewati Migrasi dan Mulai Operasional`. Menu operasional seperti Siswa, Keuangan, Laporan, dan Lanjut Tahun Ajaran tetap disembunyikan sampai admin menyelesaikan atau melewati migrasi. Menu Tahun Ajaran tetap boleh dibuka pada tahap ini untuk mengelola daftar tahun ajaran, kelas & tarif SPP, serta pendaftaran per tahun ajaran, karena data ini dibutuhkan untuk prasyarat migrasi calon maupun siswa tahun berjalan. Status onboarding disimpan di pengaturan `onboarding_status` dengan `setup_selesai`, `migrasi_data_awal_status`, dan `operasional_aktif`. Setelah `operasional_aktif = true`, menu Migrasi Data Awal disembunyikan dari sidebar dan migrasi tidak menjadi jalur input rutin. Import Excel operasional tetap disediakan pada menu operasional terkait untuk input massal normal dan harus mengikuti aturan bisnis normal.

Catatan Detail Tahun Ajaran: Halaman daftar tahun ajaran hanya menampilkan daftar periode dan aksi masuk detail/edit. Tahun ajaran baru selalu dibuat sebagai `draft` melalui tombol `Buat Tahun Ajaran Draft`; tidak ada tombol aktivasi manual. Detail tahun ajaran menjadi pusat konfigurasi periode dengan tab `Ringkasan`, `Kelas & Tarif`, `Pendaftaran`, dan `Penempatan & Usia`. Shortcut sidebar `Kelas & Tarif SPP` dan `Pendaftaran` membuka detail tahun ajaran aktif/default pada tab terkait. Konfigurasi kelas, biaya pendaftaran, jatuh tempo, dan cutoff umur bersifat per tahun ajaran; tahun ajaran `arsip` read-only pada semua tab. Early Bird dikonfigurasi global di Pengaturan.

Catatan Setup Tahun Ajaran Draft: Tombol `Buat Tahun Ajaran Draft` membuka wizard mini yang konsisten dengan Setup Awal, bukan form panjang. Langkah minimal: Tahun Ajaran, Kelas & Tarif SPP, Pendaftaran, dan Review. Draft wizard disimpan sementara di localStorage dan baru ditulis ke IndexedDB saat klik `Simpan Tahun Ajaran Draft` di langkah Review. Penyimpanan wajib atomic untuk record `tahun_ajaran`, `kelas`, dan `pengaturan_pendaftaran_tahun_ajaran`; jika validasi gagal, tidak boleh ada data tersimpan sebagian. Jika wizard dibuka dari Migrasi Calon Siswa, copy halaman menegaskan bahwa tahun ajaran draft ini dipakai sebagai target calon siswa migrasi.

Catatan validasi selesai migrasi: `onboarding_status` juga menyimpan status per wizard: `migrasi_calon_siswa_status` dan `migrasi_siswa_tahun_berjalan_status` dengan nilai `belum_mulai`, `draft`, `selesai`, atau `dilewati`. Tombol `Selesai Migrasi Data Awal` boleh mengaktifkan operasional jika minimal satu wizard sudah `selesai`; wizard lain yang belum selesai akan ditandai `dilewati` setelah admin menyetujui konfirmasi. Jika admin tidak ingin migrasi sama sekali, gunakan tombol `Lewati Semua dan Mulai Operasional`, yang menandai semua wizard sebagai `dilewati` dan membutuhkan konfirmasi kuat.

Catatan UX migrasi: Halaman indeks Migrasi Data Awal menjadi pusat kontrol status wizard. Setiap kartu wizard menampilkan status dan tombol `Mulai/Lanjutkan` hanya selama status belum final. Tidak ada tombol `Lewati` per wizard, baik di kartu indeks maupun di halaman wizard. Wizard yang sudah `selesai` atau `dilewati` hanya menampilkan label status non-aksi. Tombol `Selesai Migrasi Data Awal` tetap dapat diklik; jika belum ada wizard yang selesai, sistem menampilkan daftar wizard yang perlu dibuka. Jika satu wizard sudah selesai dan wizard lain belum selesai, sistem meminta konfirmasi untuk menandai wizard yang belum selesai sebagai `dilewati` sebelum operasional diaktifkan. Tombol global untuk melewati seluruh proses diberi label `Lewati Semua dan Mulai Operasional` dan membutuhkan konfirmasi kuat.

Catatan reset data: `Reset ke Setup Awal` wajib menghapus data operasional, pengaturan periode, sync queue/log, status onboarding, metode pembayaran dan jenis tagihan hasil setup, serta draft localStorage terkait setup/migrasi. Setelah reset, `onboarding_status` kembali ke default belum setup, metode pembayaran kembali ke default seed (`Tunai`, `Transfer`, `Tabungan`), dan jenis tagihan kembali ke default seed. `Reset Semua Data Lokal` menghapus semua tabel lokal dan menjalankan seed ulang.

Catatan koreksi data: Menu `Pengaturan > Koreksi Data` menyediakan fitur khusus `Tambah Data Tertinggal Migrasi`. Fitur ini bukan jalur tambah siswa harian dan hanya dipakai admin untuk koreksi data awal/data migrasi yang tertinggal. Siswa yang ditambahkan lewat fitur ini disimpan sebagai `status = aktif`, `jalur_registrasi = migrasi`, `sumber_data = manual`, `tahun_ajaran_target_id = tahun ajaran aktif`, dan wajib memiliki penempatan kelas aktif. Tagihan/tunggakan awal yang diinput disimpan dengan `tagihan.tahun_ajaran_id = tahun ajaran aktif saat dicatat`; setelah Lanjut Tahun Ajaran tagihan tersebut tetap berada pada tahun asal, tetapi jika belum lunas tetap tampil sebagai tunggakan aktif sampai lunas. Fitur ini tidak menerapkan aturan calon/draft/early bird dan tidak membuat tagihan pendaftaran otomatis kecuali admin menginputnya sebagai tagihan tertinggal.

Catatan upgrade fitur dan data lama: Jika fitur baru menambah tabel, field, atau setting global, implementasi wajib menyediakan migration/backfill/repair otomatis agar data lokal lama tetap bisa dipakai tanpa kembali ke Setup Awal. Field baru wajib punya Dexie version upgrade dan backfill. Setting global baru wajib punya default seed, repair record kosong/duplikat berdasarkan `kunci`, dan fallback pembacaan melalui helper repository pengaturan; jangan membaca `pengaturan` langsung dengan `.first()` untuk setting global. Fitur baru tidak boleh menjadi blocker `isComplete` Setup Awal untuk user lama kecuali benar-benar data inti setup. Semua perubahan default seed wajib mempertahankan custom item user kecuali ada keputusan eksplisit untuk membersihkan data dummy.

Catatan migrasi: Mode migrasi tidak berada di form Tambah Siswa. Migrasi Data Awal bersifat Excel-only melalui wizard per satu siklus lengkap: `Migrasi Calon Siswa` dan `Migrasi Siswa Tahun Berjalan`. Setiap wizard menyediakan download template Excel, upload file `.xlsx`, validasi kualitas data, preview error/sukses, lalu menyimpan seluruh siswa/tagihan/pembayaran secara atomic saat Review & Simpan. Pada Migrasi Siswa Tahun Berjalan, tersedia opsi untuk generate NIS otomatis bagi siswa yang NIS-nya dikosongkan. Menu `Migrasi Tagihan` dan `Migrasi Pembayaran` tidak menjadi alur utama terpisah; tagihan dan pembayaran lama masuk sebagai sheet dalam template wizard migrasi terkait. Migrasi hanya untuk data awal/saldo awal saat onboarding. Setelah operasional aktif, penambahan massal memakai jalur Import Operasional (Dapodik), bukan migrasi.

Catatan kualitas data migrasi Excel: Validasi migrasi dan import otomatis **mengabaikan (skip) baris kosong** (baris tanpa nama) agar perhitungan jumlah siswa valid. Setiap siswa, tagihan, pembayaran, dan relasi referensi wajib unik dan valid sebelum data disimpan. `kode_import_siswa`, `kode_import_tagihan`, dan `kode_import_pembayaran` wajib unik dalam file. Sistem juga wajib menolak natural-key duplikat siswa, orphan reference antar sheet, kelas/metode yang tidak cocok dengan master, tanggal/nominal tidak valid, pembayaran SPP di luar periode SPP auto, serta total pembayaran yang melebihi tagihan. Jika terdapat satu error pun, tidak ada data yang ditulis ke IndexedDB. Error ditampilkan per sheet, baris, kolom, dan pesan agar admin memperbaiki file Excel lalu upload ulang. Tanggal pada Excel boleh berupa date cell Excel atau teks `YYYY-MM-DD`; sistem boleh menormalisasi teks `DD/MM/YYYY` menjadi `YYYY-MM-DD` selama tanggal valid. Pada Migrasi Calon Siswa, sheet `calon_siswa` memakai kolom `tingkat` saja untuk kelas rencana; sistem memilih kelas rencana berdasarkan tingkat pada tahun ajaran target atau membiarkan kosong untuk auto-placement jika tingkat tidak diisi. Pada Migrasi Siswa Tahun Berjalan, sheet `siswa` wajib memisahkan kolom `tingkat` dan `kelas`; kombinasi keduanya harus cocok tepat dengan master kelas tahun ajaran aktif. Pembayaran SPP lama mengacu ke kombinasi `kode_import_siswa` + `bulan_tahun`, sedangkan pembayaran non-SPP mengacu ke `kode_import_tagihan`.

---

## 2. Prinsip Arsitektur

### 2.1 Local-First Architecture

```
┌─────────────────────────────────────────────────────┐
│                   PWA (Browser)                      │
│                                                     │
│  UI Layer (React/Vue)                               │
│       │                                             │
│  Service Layer (business logic)                     │
│       │                                             │
│  Repository Layer                                   │
│       │                                             │
│  IndexedDB (Dexie.js) ← sumber utama               │
│       │                                             │
│  Sync Engine                                        │
│       │ (hanya saat online)                        │
└───────┼─────────────────────────────────────────────┘
        │
        ▼
   Supabase (PostgreSQL)
   ← backup & sync antar perangkat
```

### 2.2 Alur baca & tulis data

**Baca (READ):**
```
UI request data
  → Baca dari IndexedDB
  → Tampilkan ke UI (cepat, tidak tunggu network)
  → Jika online: cek apakah ada data baru dari Supabase (background pull)
  → Jika ada perubahan: update IndexedDB → re-render UI
```

**Tulis (WRITE):**
```
User melakukan aksi (create/update/delete)
  → Tulis ke IndexedDB dengan status sync = "pending"
  → UI langsung update (optimistic UI)
  → Jika online: push ke Supabase → update status sync = "synced"
  → Jika offline: masuk sync queue → diproses saat online
```

### 2.3 Multi-device

- Admin bisa login di beberapa perangkat sekaligus
- Setiap perangkat menyimpan salinan data lokal di IndexedDB masing-masing
- Saat online, perubahan dari perangkat lain ditarik (pull) dan di-merge ke IndexedDB lokal
- Conflict resolution: **last-write-wins berdasarkan `updated_at`** — record dengan `updated_at` lebih baru menang

---

## 3. Stack Teknologi

### Frontend

| Komponen | Teknologi | Keterangan |
|---|---|---|
| Framework | React 18 + TypeScript | |
| Build tool | Vite | |
| PWA | Vite PWA Plugin (Workbox) | Service worker, manifest, install prompt |

## 2. Prinsip Arsitektur

### 2.1 Local-First Architecture

```
┌─────────────────────────────────────────────────────┐
│                   PWA (Browser)                      │
│                                                     │
│  UI Layer (React/Vue)                               │
│       │                                             │
│  Service Layer (business logic)                     │
│       │                                             │
│  Repository Layer                                   │
│       │                                             │
│  IndexedDB (Dexie.js) ← sumber utama               │
│       │                                             │
│  Sync Engine                                        │
│       │ (hanya saat online)                        │
└───────┼─────────────────────────────────────────────┘
        │
        ▼
   Supabase (PostgreSQL)
   ← backup & sync antar perangkat
```

### 2.2 Alur baca & tulis data

**Baca (READ):**
```
UI request data
  → Baca dari IndexedDB
  → Tampilkan ke UI (cepat, tidak tunggu network)
  → Jika online: cek apakah ada data baru dari Supabase (background pull)
  → Jika ada perubahan: update IndexedDB → re-render UI
```

**Tulis (WRITE):**
```
User melakukan aksi (create/update/delete)
  → Tulis ke IndexedDB dengan status sync = "pending"
  → UI langsung update (optimistic UI)
  → Jika online: push ke Supabase → update status sync = "synced"
  → Jika offline: masuk sync queue → diproses saat online
```

### 2.3 Multi-device

- Admin bisa login di beberapa perangkat sekaligus
- Setiap perangkat menyimpan salinan data lokal di IndexedDB masing-masing
- Saat online, perubahan dari perangkat lain ditarik (pull) dan di-merge ke IndexedDB lokal
- Conflict resolution: **last-write-wins berdasarkan `updated_at`** — record dengan `updated_at` lebih baru menang

---

## 3. Stack Teknologi

### Frontend

| Komponen | Teknologi | Keterangan |
|---|---|---|
| Framework | React 18 + TypeScript | |
| Build tool | Vite | |
| PWA | Vite PWA Plugin (Workbox) | Service worker, manifest, install prompt |
| State management | Zustand | Global state ringan |
| Routing | React Router v6 | |
| UI Library | Shadcn/ui + Tailwind CSS | |
| Local DB | Dexie.js (IndexedDB wrapper) | Sumber data utama |
| Sync client | Supabase JS Client v2 | Hanya untuk sync |
| PDF generator | jsPDF + jsPDF-AutoTable | Generate kuitansi & laporan di client |
| Excel generator | exceljs | Export laporan dan memproses import migrasi/Dapodik dari file Excel |
| Form validation | React Hook Form + Zod | |
| Date utility | date-fns | |

### Backend (Supabase)

| Komponen | Teknologi | Keterangan |
|---|---|---|
| Database | PostgreSQL 15 | Via Supabase |
| Auth | Supabase Auth | Email + password |
| Realtime | Supabase Realtime | Untuk pull perubahan saat online |
| Edge Functions | Supabase Edge Functions (Deno/TypeScript) | Proses batch server-side |
| Storage | Supabase Storage | Logo, foto siswa, tanda tangan |
| RLS | PostgreSQL Row Level Security | Isolasi data per user |

---

## 4. Lapisan Offline (Local-First)

### 4.1 IndexedDB Schema (via Dexie.js)

Semua tabel di Supabase memiliki mirror di IndexedDB dengan struktur yang sama, ditambah kolom metadata sync:

```typescript
// Dexie schema definition
class AppDatabase extends Dexie {
  profil_sekolah!: Table<ProfilSekolah>;
  pengaturan!: Table<Pengaturan>;
  tahun_ajaran!: Table<TahunAjaran>;
  kelas!: Table<Kelas>;
  pengaturan_pendaftaran_tahun_ajaran!: Table<PengaturanPendaftaranTahunAjaran>;
  akun!: Table<Akun>;
  permission!: Table<Permission>;
  siswa!: Table<Siswa>;
  siswa_kelas!: Table<SiswaKelas>;
  tagihan!: Table<Tagihan>;
  pembayaran!: Table<Pembayaran>;
  promo!: Table<Promo>;
  siswa_promo!: Table<SiswaPromo>;
  audit_log!: Table<AuditLog>;
  sync_queue!: Table<SyncQueue>;
  sync_log!: Table<SyncLog>;

  constructor() {
    super('paud_db');
    this.version(1).stores({
      profil_sekolah: 'id, updated_at, _sync_status',
      pengaturan: 'id, kunci, updated_at, _sync_status',
      tahun_ajaran: 'id, aktif, updated_at, _sync_status',
      kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
      pengaturan_pendaftaran_tahun_ajaran: 'id, tahun_ajaran_id, updated_at, _sync_status',
      akun: 'id, email, role, updated_at, _sync_status',
      permission: 'id, role, modul, updated_at, _sync_status',
      siswa: 'id, status, updated_at, _sync_status',
      siswa_kelas: 'id, siswa_id, kelas_id, updated_at, _sync_status',
      tagihan: 'id, siswa_id, jenis, status, bulan_tahun, updated_at, _sync_status',
      pembayaran: 'id, tagihan_id, updated_at, _sync_status',
      promo: 'id, nama, aktif, updated_at, _sync_status',
      siswa_promo: 'id, siswa_id, promo_id, updated_at, _sync_status',
      audit_log: 'id, entitas, aksi, created_at, _sync_status',
      sync_queue: '++id, tabel, record_id, aksi, created_at',
      sync_log: '++id, tabel, record_id, status, created_at',
    });
  }
}
  sync_log!: Table<SyncLog>;

  constructor() {
    super('paud_db');
    this.version(1).stores({
      profil_sekolah: 'id, updated_at, _sync_status',
      pengaturan: 'id, kunci, updated_at, _sync_status',
      tahun_ajaran: 'id, aktif, updated_at, _sync_status',
      kelas: 'id, tahun_ajaran_id, updated_at, _sync_status',
      pengaturan_pendaftaran_tahun_ajaran: 'id, tahun_ajaran_id, updated_at, _sync_status',
      akun: 'id, email, role, updated_at, _sync_status',
  }
}
```

### 4.2 Kolom metadata sync (ditambahkan ke setiap record)

Setiap record di IndexedDB memiliki kolom tambahan berikut — kolom ini **tidak ada di Supabase**:

| Kolom | Tipe | Nilai | Keterangan |
|---|---|---|---|
| `_sync_status` | string | `synced` / `pending` / `conflict` | Status sinkronisasi record ini |
| `_sync_at` | timestamp | | Waktu terakhir berhasil sync |
| `_local_only` | boolean | | True jika belum pernah ada di Supabase |

### 4.3 Sync Queue

Setiap operasi tulis offline menghasilkan satu entry di tabel `sync_queue`:

```typescript
interface SyncQueue {
  id?: number;           // auto increment
  tabel: string;         // nama tabel target: "siswa", "tagihan", dll
  record_id: string;     // uuid record yang berubah
  aksi: 'insert' | 'update' | 'delete';
  payload: object;       // data lengkap record
  retry_count: number;   // default 0
  created_at: string;
}
```

### 4.4 Service Worker (Workbox)

Dikonfigurasi via Vite PWA Plugin dengan strategi berikut:

| Resource | Strategi | Keterangan |
|---|---|---|
| Aset statis (JS, CSS, font, gambar) | Cache First | Selalu dari cache, update di background |
| HTML shell | Network First | Fallback ke cache jika offline |
| Supabase API calls | Network Only | Tidak di-cache, ditangani sync engine |
| Gambar dari Storage | Cache First (TTL 7 hari) | Logo, foto siswa |

### 4.5 Indikator status koneksi

- Header aplikasi menampilkan badge **"Offline"** (warna merah) atau **"Online"** (warna hijau)
- Saat offline: muncul banner "Kamu sedang offline. Data akan disimpan lokal dan disync otomatis saat online."
- Saat ada data pending sync: muncul badge jumlah pending di ikon sync di header

---

## 5. Lapisan Sync (Online)

### 5.1 Trigger sync

Sync dijalankan otomatis dalam kondisi berikut:

| Kondisi | Aksi |
|---|---|
| Aplikasi kembali online (event `online`) | Push semua `sync_queue` pending → Pull perubahan dari Supabase |
| Aplikasi dibuka saat sudah online | Pull perubahan dari Supabase sejak `last_pull_at` |
| Setiap 5 menit saat online | Pull incremental dari Supabase |
| User klik tombol sync manual di header | Force push + pull |

### 5.2 Push (lokal → Supabase)

```
Ambil semua sync_queue dengan status pending (urut berdasarkan created_at ASC)
  Untuk setiap item di queue:
    → Jalankan operasi ke Supabase (insert / update / delete)
    → Jika berhasil:
        ├── Hapus item dari sync_queue
        ├── Update _sync_status record = "synced"
        └── Catat ke sync_log (status: success)
    → Jika gagal (network error):
        ├── retry_count + 1
        ├── Jika retry_count >= 3: tandai _sync_status = "conflict", catat ke sync_log (status: failed)
        └── Lanjut ke item berikutnya
```

### 5.3 Pull (Supabase → lokal)

```
Baca last_pull_at dari localStorage
  → Query Supabase: SELECT * FROM [setiap tabel] WHERE updated_at > last_pull_at
  → Untuk setiap record yang diterima:
      → Cek apakah record ada di IndexedDB
          ├── Tidak ada → insert ke IndexedDB, _sync_status = "synced"
          └── Ada → bandingkan updated_at:
              ├── Supabase lebih baru → overwrite IndexedDB, _sync_status = "synced"
              └── Lokal lebih baru (dan masih pending) → pertahankan lokal, jangan overwrite
                  (lokal akan di-push saat giliran sync_queue)
  → Update last_pull_at = NOW()
```

### 5.4 Conflict resolution

Strategi: **last-write-wins berdasarkan `updated_at`**

- Jika record lokal `_sync_status = "pending"` dan ada versi lebih baru dari Supabase:
  - Simpan versi Supabase sebagai `_conflict_remote`
  - Tampilkan notifikasi konflik kepada admin (opsional untuk v1: auto-resolve dengan lokal menang jika pending)
- Jika record lokal `_sync_status = "synced"` dan ada versi lebih baru dari Supabase:
  - Overwrite lokal dengan versi Supabase

### 5.5 Initial sync (pertama kali login / perangkat baru)

```
Login berhasil
  → Cek apakah IndexedDB kosong
  → Jika kosong: pull SEMUA data dari Supabase ke IndexedDB (full sync)
  → Tampilkan loading screen "Menyiapkan data lokal..."
  → Setelah selesai: aplikasi siap digunakan
```

### 5.6 Supabase Realtime (opsional, aktifkan jika multi-device aktif)

- Subscribe ke channel perubahan tabel `tagihan` dan `pembayaran`
- Saat ada INSERT/UPDATE dari perangkat lain: jalankan pull incremental untuk record tersebut
- Tidak menggantikan periodic pull — hanya mempercepat propagasi perubahan

---

## 6. Skema Database

> Skema ini berlaku untuk **Supabase (PostgreSQL)** dan **IndexedDB** (dengan tambahan kolom `_sync_*`).
> Semua tabel menggunakan `uuid` sebagai primary key, di-generate di sisi klien (tidak bergantung server).
> Semua tabel memiliki kolom `created_at`, `updated_at`, dan `deleted_at` (soft delete).

### 6.1 `profil_sekolah`

Hanya ada **satu baris** di tabel ini (singleton).

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | uuid PK | Ya | Hard-coded: `'00000000-0000-0000-0000-000000000001'` |
| `nama_sekolah` | text | Ya | Tampil di header, kuitansi, laporan |
| `alamat` | text | Tidak | |
| `telepon` | text | Tidak | |
| `email` | text | Tidak | |
| `npsn` | text | Tidak | Nomor Pokok Sekolah Nasional |
| `nama_kepsek` | text | Tidak | Tampil di kuitansi & laporan |
| `logo_url` | text | Tidak | URL dari Supabase Storage |
| `tanda_tangan_url` | text | Tidak | URL dari Supabase Storage |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |
| `deleted_at` | timestamptz | Tidak | Selalu null untuk singleton ini |

### 6.2 `pengaturan`

Konfigurasi sistem disimpan sebagai key-value dengan nilai JSON.

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | uuid PK | Ya | |
| `kunci` | text UNIQUE | Ya | Identifier setting |
| `nilai` | jsonb | Ya | Nilai dalam format JSON |
| `keterangan` | text | Tidak | Deskripsi setting ini |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |
| `deleted_at` | timestamptz | Tidak | |

**Baris wajib yang harus ada (di-seed saat install):**

| `kunci` | Struktur `nilai` | Keterangan |
|---|---|---|
| `early_bird` | `{ "aktif": bool, "mulai": "YYYY-MM-DD", "selesai": "YYYY-MM-DD", "persen_diskon": number, "keterangan": string }` | Konfigurasi periode early bird |
| `metode_pembayaran` | `[{ "id": uuid, "nama": string, "aktif": bool }]` | Daftar metode bayar |
| `jenis_tagihan` | `[{ "id": uuid, "nama": string, "aktif": bool }]` | Daftar jenis tagihan |
| `penempatan_siswa_baru` | `{ "aktifkan_penempatan_otomatis": bool, "cutoff_bulan": number, "cutoff_tanggal": number, "keterangan": string }` | Pengaturan cutoff umur untuk penempatan kelas otomatis |

**Nilai default saat pertama install:**
```json
// early_bird
{ "aktif": false, "mulai": null, "selesai": null, "persen_diskon": 0, "keterangan": "" }

// penempatan_siswa_baru
{ "aktifkan_penempatan_otomatis": true, "cutoff_bulan": 7, "cutoff_tanggal": 1, "keterangan": "Cutoff umur default 1 Juli" }

// metode_pembayaran
[
  { "id": "uuid-1", "nama": "Tunai", "aktif": true },
  { "id": "uuid-2", "nama": "Transfer", "aktif": true },
  { "id": "uuid-3", "nama": "Tabungan", "aktif": true },
  { "id": "uuid-4", "nama": "Split", "aktif": true }
]

// jenis_tagihan
[
  { "id": "uuid-1", "nama": "SPP", "aktif": true },
  { "id": "uuid-2", "nama": "Pendaftaran", "aktif": true },
  { "id": "uuid-3", "nama": "Daftar Ulang", "aktif": true },
  { "id": "uuid-4", "nama": "Kegiatan", "aktif": true },
  { "id": "uuid-5", "nama": "Administrasi", "aktif": true },
  { "id": "uuid-6", "nama": "Lainnya", "aktif": true }
]
```

### 6.3 `akun`

Akun pengguna yang bisa login ke sistem.

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | uuid PK | Ya | Sinkron dengan Supabase Auth `user.id` |
| `nama` | text | Ya | |
| `email` | text UNIQUE | Ya | Digunakan untuk login |
| `role` | text | Ya | Saat ini hanya: `admin` |
| `aktif` | boolean | Ya | Default: true. Jika false, tidak bisa login |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |
| `deleted_at` | timestamptz | Tidak | |

### 6.4 `permission`

Mendefinisikan modul/aksi apa yang bisa diakses oleh setiap role.
Dirancang untuk extensible — saat role baru ditambahkan, cukup tambah baris di tabel ini.

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | uuid PK | Ya | |
| `role` | text | Ya | Contoh: `admin` |
| `modul` | text | Ya | Contoh: `siswa`, `tagihan`, `laporan` |
| `aksi` | text[] | Ya | Array aksi: `["baca", "tambah", "edit", "hapus"]` |
| `aktif` | boolean | Ya | Default: true |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |

**Daftar modul yang tersedia:**

| `modul` | Keterangan |
|---|---|
| `dashboard` | Halaman ringkasan |
| `siswa` | Data siswa |
| `kelas` | Data kelas |
| `tahun_ajaran` | Data tahun ajaran |
| `tagihan` | Generate & kelola tagihan |
| `pembayaran` | Catat pembayaran |
| `laporan` | Akses semua laporan |
| `akun` | Kelola akun pengguna |
| `pengaturan` | Pengaturan sistem & sekolah |

**Daftar aksi per modul:**

| `aksi` | Keterangan |
|---|---|
| `baca` | Melihat data |
| `tambah` | Membuat data baru |
| `edit` | Mengubah data |
| `hapus` | Soft delete data |
| `export` | Export PDF / Excel (khusus modul laporan) |

**Default permission untuk role `admin` (di-seed saat install):**

```json
[
  { "role": "admin", "modul": "dashboard",     "aksi": ["baca"] },
  { "role": "admin", "modul": "siswa",         "aksi": ["baca", "tambah", "edit", "hapus"] },
  { "role": "admin", "modul": "kelas",         "aksi": ["baca", "tambah", "edit", "hapus"] },
  { "role": "admin", "modul": "tahun_ajaran",  "aksi": ["baca", "tambah", "edit"] },
  { "role": "admin", "modul": "tagihan",       "aksi": ["baca", "tambah", "edit", "hapus"] },
  { "role": "admin", "modul": "pembayaran",    "aksi": ["baca", "tambah", "edit"] },
  { "role": "admin", "modul": "laporan",       "aksi": ["baca", "export"] },
  { "role": "admin", "modul": "akun",          "aksi": ["baca", "tambah", "edit", "hapus"] },
  { "role": "admin", "modul": "pengaturan",    "aksi": ["baca", "edit"] }
]
```

### 6.5 `tahun_ajaran`

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | uuid PK | Ya | |
| `nama` | text | Ya | Contoh: "2025/2026" |
| `mulai` | date | Ya | |
| `selesai` | date | Ya | |
| `aktif` | boolean | Ya | Default: false. Hanya satu yang true |
| `status` | text | Ya | `draft` / `aktif` / `arsip` |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |
| `deleted_at` | timestamptz | Tidak | |

**Constraint:** Tidak boleh ada dua baris dengan `aktif = true` atau `status = aktif` secara bersamaan. Nama tahun ajaran wajib berformat `YYYY/YYYY` setelah normalisasi dan tahun kedua wajib tahun pertama + 1. Setiap tahun ajaran wajib memiliki tanggal selesai yang tidak sebelum tanggal mulai dan tidak boleh lebih dari satu tahun: `selesai <= mulai + 1 tahun - 1 hari`. Nama tahun ajaran tidak boleh duplikat setelah normalisasi, periode mulai-selesai tidak boleh sama persis dengan tahun ajaran lain, dan periode tahun ajaran tidak boleh tumpang tindih dengan tahun ajaran lain yang belum soft delete.
Implementasi: tahun ajaran baru dibuat sebagai `draft`. Draft hanya bisa diaktifkan jika tidak ada tahun ajaran aktif. Jika sudah ada tahun aktif, pergantian periode wajib melalui Lanjut Tahun Ajaran; proses ini mengarsipkan tahun lama dan mengaktifkan tahun tujuan.

### 6.6 `kelas`

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | uuid PK | Ya | |
| `tahun_ajaran_id` | uuid FK | Ya | → `tahun_ajaran.id` |
| `nama_kelas` | text | Ya | Contoh: "Kelompok B" |
| `tingkat` | text | Tidak | Contoh: "TK A", "TK B" |
| `tarif_spp` | numeric | Ya | Tarif SPP default untuk kelas ini |
| `kapasitas_siswa` | integer | Tidak | Kapasitas maksimum siswa aktif dalam satu rombel. Jika null, kapasitas tidak dibatasi |
| `usia_min_tahun` | integer | Tidak | Usia minimum dalam tahun untuk auto-placement siswa baru |
| `usia_max_tahun` | integer | Tidak | Usia maksimum dalam tahun untuk auto-placement siswa baru |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |
| `deleted_at` | timestamptz | Tidak | |

**Constraint:** Dalam satu `tahun_ajaran_id`, kombinasi `tingkat` + `nama_kelas` tidak boleh duplikat setelah normalisasi case-insensitive dan collapse spasi.

### 6.7 `pengaturan_pendaftaran_tahun_ajaran`

Konfigurasi setup pendaftaran yang melekat pada satu tahun ajaran. Dipakai saat siswa baru/calon memilih tahun ajaran target.

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | uuid PK | Ya | |
| `tahun_ajaran_id` | uuid FK | Ya | → `tahun_ajaran.id`; harus unik untuk record aktif/tidak terhapus |
| `biaya_pendaftaran_default` | numeric | Ya | Default biaya pendaftaran calon siswa tahun ajaran ini, minimal 0 |
| `opsi_bayar_default` | text | Ya | `full` / `cicil` |
| `jatuh_tempo_mode` | text | Ya | `tanggal_tetap` / `hari_setelah_daftar` |
| `jatuh_tempo_tanggal` | date | Kondisional | Wajib jika mode `tanggal_tetap`, harus dalam periode tahun ajaran |
| `jatuh_tempo_hari_setelah_daftar` | integer | Kondisional | Wajib jika mode `hari_setelah_daftar`, minimal 0 |
| `cutoff_bulan` | integer | Ya | 1-12, default 7 |
| `cutoff_tanggal` | integer | Ya | Tanggal valid untuk bulan cutoff, default 1 |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |
| `deleted_at` | timestamptz | Tidak | |

### 6.8 `siswa`

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | uuid PK | Ya | |
| `no_pendaftaran` | text | Tidak | Nomor Pendaftaran calon siswa, misal: REG-2526-0001 |
| `nis` | text | Tidak | Nomor Induk Siswa, format TahunAjaran+Urut (misal: 2526001) |
| `nama` | text | Ya | |
| `tanggal_lahir` | date | Tidak | Wajib untuk siswa baru/calon karena dipakai validasi umur PAUD |
| `jenis_kelamin` | text | Tidak | `L` / `P` |
| `foto_url` | text | Tidak | URL Supabase Storage |
| `nama_wali` | text | Ya | |
| `jenis_kelamin` | text | Tidak | `L` / `P` |
| `foto_url` | text | Tidak | URL Supabase Storage |
| `nama_wali` | text | Ya | |
| `hubungan_wali` | text | Tidak | `ayah` / `ibu` / `wali` |
| `kontak_wali` | text | Ya | Nomor HP |
| `email_wali` | text | Tidak | |
| `alamat` | text | Tidak | |
| `status` | text | Ya | `calon` / `aktif` / `lulus` / `berhenti` / `batal_daftar` |
| `flag_diskon_spp` | boolean | Ya | Default: false |
| `persen_diskon` | numeric | Ya | Default: 0 |
| `tanggal_daftar` | date | Ya | Tanggal mendaftar |
| `jenis_masuk` | text | Ya | `awal_tahun` / `pindahan` |
| `tahun_ajaran_target_id` | uuid FK | Ya | → `tahun_ajaran.id`. Menentukan siswa ini masuk pada tahun ajaran mana |
| `kelas_rencana_id` | uuid FK | Tidak | → `kelas.id`. Kelas rencana untuk siswa `calon` jalur `baru`; diisi otomatis dari umur/cutoff dan boleh dioverride manual sebelum aktif |
| `jalur_registrasi` | text | Ya | `baru` / `pindahan` / `migrasi` |
| `sumber_data` | text | Ya | `manual` / `import_excel` |
| `alasan_keluar` | text | Tidak | `pindah_sekolah` / `berhenti_lainnya` |
| `tanggal_keluar` | date | Tidak | Diisi saat siswa `lulus` atau `berhenti` |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |
| `deleted_at` | timestamptz | Tidak | Soft delete |

### 6.9 `siswa_kelas`

Riwayat penempatan siswa di kelas — bersifat historis, tidak pernah dihapus.

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | uuid PK | Ya | |
| `siswa_id` | uuid FK | Ya | → `siswa.id` |
| `kelas_id` | uuid FK | Ya | → `kelas.id` |
| `mulai` | date | Ya | |
| `selesai` | date | Tidak | Null jika masih aktif di kelas ini |
| `penempatan_sumber` | text | Tidak | `otomatis` / `manual` / `import_excel` |
| `catatan_penempatan` | text | Tidak | Alasan override manual, termasuk kebutuhan kecerdasan khusus |
| `status_akhir_periode` | text | Tidak | Status historis saat penempatan ditutup: `naik_kelas` / `alumni` / `keluar` / `batal_daftar` / `tidak_lanjut` |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |

### 6.10 `tagihan`


| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | uuid PK | Ya | |
| `no_referensi` | text | Tidak | Nomor Invoice Tagihan, misal: INV-2526-06-0001 |
| `siswa_id` | uuid FK | Ya | → `siswa.id` |
| `tahun_ajaran_id` | uuid FK | Ya | → `tahun_ajaran.id`. Menentukan periode kepemilikan tagihan; tagihan pendaftaran calon memakai tahun ajaran target/draft |
| `jenis` | text | Ya | Dari daftar jenis_tagihan di pengaturan |
| `nama_tagihan` | text | Ya | Contoh: "SPP Oktober 2025" |
| `jumlah_total` | numeric | Ya | |
| `sudah_dibayar` | numeric | Ya | Default: 0. Dihitung ulang dari tabel pembayaran |
| `jatuh_tempo` | date | Ya | |
| `status` | text | Ya | `belum_bayar` / `sebagian` / `lunas` |
| `bisa_cicil` | boolean | Ya | Default: false |
| `bulan_tahun` | text | Tidak | Format: "YYYY-MM". Hanya untuk jenis SPP, mencegah duplikat |
| `created_by` | uuid FK | Ya | → `akun.id` |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |
| `deleted_at` | timestamptz | Tidak | Soft delete. Hanya jika belum ada pembayaran |

**Constraint:** Untuk jenis `spp`, kombinasi (`siswa_id`, `bulan_tahun`) harus unik (per siswa per bulan hanya satu tagihan SPP).

### 6.11 `pembayaran`
| `catatan` | text | Tidak | Contoh: nomor referensi transfer |
| `created_at` | timestamptz | Ya | |
| `updated_at` | timestamptz | Ya | |
| `deleted_at` | timestamptz | Tidak | Soft delete = void pembayaran |

---

## 7. Spesifikasi Modul & Aksi

> Setiap modul menjelaskan: layar yang dibutuhkan, field, validasi, dan logika bisnis yang harus diimplementasikan.

---

### 7.1 Pengaturan Sekolah

**Modul:** `pengaturan`
**Lokasi tabel:** `profil_sekolah`

#### Layar: Form Pengaturan Sekolah

Tampil sebagai satu form yang bisa diedit. Satu-satunya record di tabel `profil_sekolah`.

**Field:**

| Field | Tipe Input | Wajib | Keterangan |
|---|---|---|---|
| Nama sekolah | Text | Ya | Max 100 karakter |
| Alamat | Textarea | Tidak | |
| Nomor telepon | Text | Tidak | Format bebas |
| Website sekolah | Text | Tidak | Validasi format URL/domain sederhana |
| NPSN | Text | Tidak | Angka, tidak dibatasi 8 digit untuk kompatibilitas masa depan |
| Nama kepala sekolah | Text | Tidak | Tampil di kuitansi & laporan |
| Logo sekolah | Upload gambar | Tidak | Format: JPG/PNG, maks 2MB. Upload ke Supabase Storage bucket `sekolah-assets` |
| Tanda tangan kepala sekolah | Upload gambar | Tidak | Format: PNG (transparan), maks 1MB. Upload ke Supabase Storage |

**Aksi:**
- `Simpan` → update record `profil_sekolah` di IndexedDB → queue sync ke Supabase

#### Layar: Pengaturan Penempatan Siswa Baru

Konfigurasi ini dipakai saat sistem melakukan penempatan kelas otomatis untuk siswa baru yang sudah lunas dan tahun ajaran targetnya sudah aktif.

**Field:**

| Field | Tipe Input | Wajib | Keterangan |
|---|---|---|---|
| Aktifkan penempatan otomatis | Toggle | Ya | Default: aktif |
| Bulan cutoff umur | Dropdown bulan | Ya | Default: Juli |
| Tanggal cutoff umur | Number | Ya | Default: 1 |
| Keterangan | Textarea | Tidak | Catatan internal admin |

**Aksi:**
- `Simpan` → update `pengaturan.penempatan_siswa_baru` di IndexedDB → queue sync

**Aturan:**
- Default cutoff umur adalah **1 Juli**
- Admin dapat mengubah cutoff ini sewaktu-waktu dari menu Pengaturan
- Umur siswa dihitung dalam **tahun penuh** berdasarkan tanggal cutoff tersebut

---

### 7.2 Pengaturan Akun & Permission

**Modul:** `pengaturan`, `akun`

#### Layar: Daftar Akun

**Komponen:**
- Tabel akun: Nama, Email, Role, Status (Aktif/Nonaktif), Aksi (Edit, Nonaktifkan)
- Tombol "Tambah Akun"

**Kolom tabel:** `nama`, `email`, `role`, `aktif` (badge), aksi

#### Layar: Form Tambah / Edit Akun

**Field:**

| Field | Tipe Input | Wajib | Keterangan |
|---|---|---|---|
| Nama | Text | Ya | |
| Email | Email | Ya | Harus unik. Digunakan untuk login |
| Role | Dropdown | Ya | Saat ini hanya: `admin` |
| Password | Text (password) | Ya (tambah) / Tidak (edit) | Min 8 karakter. Kosongkan saat edit jika tidak ingin ubah |
| Status aktif | Toggle | Ya | Default: aktif |

**Aksi:**
- `Simpan` (tambah) → buat akun di Supabase Auth → buat record di tabel `akun` → sync
- `Simpan` (edit) → update tabel `akun` → jika password diisi, update password di Supabase Auth
- `Nonaktifkan` → set `aktif = false` → akun tidak bisa login, data tidak dihapus

#### Layar: Pengaturan Permission per Role

Halaman ini memungkinkan admin mengatur modul dan aksi apa yang bisa diakses oleh setiap role.
Dirancang untuk persiapan role tambahan di masa depan.

**Tampilan:**
- Dropdown pilih role (saat ini hanya `admin`)
- Tabel permission dengan baris = modul, kolom = aksi

```
Modul          | Baca | Tambah | Edit | Hapus | Export
---------------|------|--------|------|-------|-------
Dashboard      |  ☑   |   -    |  -   |   -   |   -
Siswa          |  ☑   |   ☑    |  ☑   |   ☑   |   -
Kelas          |  ☑   |   ☑    |  ☑   |   ☑   |   -
Tahun Ajaran   |  ☑   |   ☑    |  ☑   |   -   |   -
Tagihan        |  ☑   |   ☑    |  ☑   |   ☑   |   -
Pembayaran     |  ☑   |   ☑    |  ☑   |   -   |   -
Laporan        |  ☑   |   -    |  -   |   -   |   ☑
Akun           |  ☑   |   ☑    |  ☑   |   ☑   |   -
Pengaturan     |  ☑   |   -    |  ☑   |   -   |   -
```

- Checkbox yang tidak relevan untuk modul tertentu ditampilkan sebagai `-` (disabled)
- Perubahan langsung disimpan saat checkbox diubah (auto-save)
- Aksi: `Simpan perubahan` → update tabel `permission` → sync

**Implementasi di frontend:**
```typescript
// Setiap kali render halaman/menu, cek permission dari IndexedDB
async function canAccess(modul: string, aksi: string): Promise<boolean> {
  const userRole = getCurrentUserRole(); // dari session
  const perm = await db.permission
    .where({ role: userRole, modul })
    .first();
  return perm?.aktif && perm?.aksi.includes(aksi) || false;
}

// Contoh penggunaan di komponen
const canAddSiswa = await canAccess('siswa', 'tambah');
// Sembunyikan tombol "Tambah Siswa" jika false
```

---

### 7.3 Tahun Ajaran

**Modul:** `tahun_ajaran`
**Lokasi tabel:** `tahun_ajaran`

#### Layar: Daftar Tahun Ajaran

**Komponen:**
- List tahun ajaran: Nama, Periode, Status (`Draft` / `Aktif` / `Arsip`), Aksi
- Tombol "Buat Tahun Ajaran Baru"

**Aksi per item:**
- Tidak ada tombol `Aktifkan` manual di daftar tahun ajaran. Aktivasi tahun ajaran dilakukan melalui Lanjut Tahun Ajaran.
- Tahun ajaran `aktif` tidak punya aksi nonaktif manual.
- Tahun ajaran `aktif` menjadi `arsip` hanya melalui Lanjut Tahun Ajaran setelah periode benar-benar selesai.
- Tahun ajaran `arsip` tidak bisa diaktifkan kembali.
- Tahun ajaran `arsip` terkunci: tidak bisa diedit, tidak bisa menerima kelas baru, tidak bisa menjadi target tagihan/pembayaran/status siswa baru, dan hanya bisa dibuka melalui filter periode untuk keperluan baca/laporan.
- `Edit` → hanya tersedia untuk tahun ajaran `draft` dan `aktif`; membuka form edit nama dan periode.
- `Detail` → hanya tersedia untuk tahun ajaran `arsip`; menampilkan ringkasan read-only jumlah kelas, siswa, tagihan, pembayaran, total tagihan, total terbayar, dan sisa/tunggakan.

#### Layar: Form Tahun Ajaran

| Field | Tipe Input | Wajib | Validasi |
|---|---|---|---|
| Nama | Text | Ya | Contoh: "2025/2026" |
| Tanggal mulai | Date picker | Ya | Diisi manual oleh admin; tidak otomatis mengisi tanggal selesai |
| Tanggal selesai | Date picker | Ya | Tidak boleh sebelum mulai dan maksimal `mulai + 1 tahun - 1 hari` |

**Aksi:** `Simpan` → insert/update di IndexedDB → queue sync

#### Layar: Setup Tahun Ajaran Baru

Dipakai saat admin ingin membuka pendaftaran calon siswa untuk tahun ajaran berikutnya. Flow ini mengambil prinsip dari Setup Awal, tetapi hanya berisi data yang diperlukan untuk periode baru.

**Wizard langkah:**
1. Tahun Ajaran
2. Kelas & Tarif SPP
3. Pendaftaran
4. Review

**Aturan:**
- Tahun ajaran baru dibuat sebagai `draft`, tidak langsung aktif.
- Profil sekolah dan metode pembayaran tidak diisi ulang karena bersifat global.
- Durasi tahun ajaran tidak boleh lebih dari satu tahun.
- Data baru ditulis ke IndexedDB hanya saat Review & Simpan dan semua validasi lolos.
- Jika ada validasi gagal, tidak boleh ada data periode baru yang tersimpan sebagian.

---

### 7.4 Kelas

**Modul:** `kelas`
**Lokasi tabel:** `kelas`

#### Layar: Daftar Kelas

**Komponen:**
- Filter: dropdown pilih tahun ajaran (default: tahun ajaran aktif)
- List kelas: Nama kelas, Tingkat, Tarif SPP, Jumlah siswa aktif, Aksi

**Aksi per item:** Edit, Hapus (hanya jika tidak ada siswa aktif di kelas ini)

#### Layar: Form Kelas

| Field | Tipe Input | Wajib | Keterangan |
|---|---|---|---|
| Nama kelas | Text | Ya | Contoh: "Kelompok B" |
| Tingkat | Text | Tidak | Contoh: "TK A", "TK B" |
| Tarif SPP | Nominal (number) | Ya | Dalam Rupiah, tanpa desimal |
| Kapasitas siswa per rombel | Number | Tidak | Bilangan bulat minimal 1. Kosongkan jika kapasitas tidak dibatasi |
| Usia minimum | Number | Tidak | Dalam tahun, dipakai untuk auto-placement siswa baru |
| Usia maksimum | Number | Tidak | Dalam tahun, dipakai untuk auto-placement siswa baru |

**Aksi:** `Simpan` → insert/update di IndexedDB → queue sync

---

### 7.5 Siswa

**Modul:** `siswa`
**Lokasi tabel:** `siswa`, `siswa_kelas`, `tagihan`

#### Layar: Daftar Siswa

**Komponen:**
- Tab filter status: `Semua` | `Calon` | `Aktif` | `Lulus` | `Berhenti`
- Search: cari berdasarkan nama siswa atau nama wali
- Filter: dropdown kelas (hanya kelas aktif)
- Tabel siswa

**Kolom tabel:**

| Kolom | Keterangan |
|---|---|
| Nama | Nama lengkap siswa |
| Kelas | Kelas aktif saat ini (kosong jika belum di kelas) |
| Status | Badge berwarna: Calon (abu) / Aktif (hijau) / Lulus (biru) / Berhenti (merah) |
| Tagihan belum bayar | Total sisa tagihan yang belum lunas |
| Aksi | Lihat detail, Edit, Set Lulus, Set Berhenti |

**Status tampilan berdasarkan periode:**
- Jika filter tahun ajaran aktif: status yang ditampilkan adalah `Calon`, `Aktif`, `Keluar`, dan `Batal Daftar`.
- Jika filter tahun ajaran arsip: status yang ditampilkan adalah `Naik Kelas`, `Alumni`, `Keluar`, `Batal Daftar`, dan `Tidak Lanjut`.
- `Keluar` mencakup siswa yang pindah sekolah maupun berhenti karena alasan lain; detail alasan tetap disimpan di `alasan_keluar`.
- Siswa yang saat ini aktif tidak boleh tampil sebagai `Aktif` ketika admin sedang melihat tahun ajaran arsip; jika siswa tersebut lanjut ke tahun berikutnya, tampilkan `Naik Kelas`.

#### Layar: Form Registrasi Siswa (Tambah)

Form pencatatan siswa operasional normal memiliki **3 mode** yang berbeda:

1. `Siswa Baru / Calon Manual`
2. `Siswa Pindahan Manual`
3. `Import Batch Siswa Baru / Calon`

Mode migrasi tidak berada di form Tambah Siswa. Semua migrasi masuk melalui menu `Migrasi Data Awal`.

**Section 1 — Data Siswa:**

| Field | Tipe Input | Wajib | Validasi |
|---|---|---|---|
| Nama lengkap | Text | Ya | Min 2 karakter |
| Tanggal lahir | Date picker | Tidak | Tidak boleh di masa depan |
| Jenis kelamin | Radio (L / P) | Tidak | |
| Foto siswa | Upload gambar | Tidak | JPG/PNG, maks 2MB |

**Section 2 — Data Orang Tua / Wali:**

| Field | Tipe Input | Wajib | Validasi |
|---|---|---|---|
| Nama wali | Text | Ya | Min 2 karakter |
| Hubungan dengan siswa | Dropdown | Tidak | Pilihan: Ayah, Ibu, Wali |
| Nomor HP / WhatsApp | Text | Ya | Min 10 digit angka |
| Email | Email | Tidak | Validasi format email |
| Alamat | Textarea | Tidak | |

**Section 3 — Data Pendaftaran:**

| Field | Tipe Input | Wajib | Keterangan |
|---|---|---|---|
| Konteks input | Radio | Ya | `Operasional Normal` / `Migrasi` |
| Mode input | Radio | Ya | Menyesuaikan konteks yang dipilih |
| Jalur registrasi | Radio | Kondisional | `Baru` / `Pindahan`. Hanya untuk operasional normal |
| Tahun ajaran target | Dropdown | Ya | Untuk `baru` hanya boleh pilih tahun ajaran target berstatus `draft`. Untuk `pindahan` dan semua migrasi gunakan tahun ajaran aktif |
| Tanggal daftar | Date picker | Ya | Default: hari ini. Sistem cek early bird dari kolom ini |
| Jenis masuk | Radio | Kondisional | `Awal Tahun` / `Pindahan`. Disimpan ke kolom `jenis_masuk` |
| Kelas rencana / tujuan | Dropdown kelas | Kondisional | Untuk `baru`: kelas rencana pada tahun ajaran target, auto-fill dari umur dan cutoff tetapi boleh dioverride manual. Untuk `pindahan` dan migrasi `aktif`: wajib kelas aktif. Untuk migrasi `keluar`: wajib kelas terakhir pada tahun ajaran aktif |
| Status hasil migrasi | Dropdown | Kondisional | `aktif` / `keluar`. Hanya untuk mode migrasi. `keluar` disimpan internal sebagai `siswa.status = berhenti` |
| Sumber data | Radio | Kondisional | `Manual` / `Import Excel` |
| Biaya tagihan awal | Number | Kondisional | Dalam Rupiah. Menjadi tagihan `pendaftaran` pada operasional normal |
| Opsi bayar tagihan awal | Radio | Kondisional | `Full` / `Cicil` |
| Jatuh tempo tagihan awal | Date picker | Kondisional | Wajib untuk operasional normal. Dipakai sebagai `tagihan.jatuh_tempo` untuk tagihan `pendaftaran`, baik `full` maupun `cicil` |
| Alasan keluar | Radio | Kondisional | `Pindah Sekolah` / `Berhenti Lainnya`. Wajib jika status migrasi = `keluar` |
| Tanggal keluar | Date picker | Kondisional | Wajib jika status migrasi = `keluar` |

**Mode A — Siswa Baru / Calon Manual**

Dipakai untuk calon siswa yang akan masuk pada tahun ajaran target yang belum aktif atau baru akan segera diaktifkan.

Aturan target: siswa baru/calon hanya boleh didaftarkan ke tahun ajaran `draft`, tidak boleh ke tahun ajaran `aktif` atau `arsip`.

**Logika saat simpan:**

```
1. Generate uuid untuk siswa baru di client
2. Cek early bird:
   a. Baca pengaturan early_bird dari IndexedDB
   b. Jika aktif = true DAN tanggal_daftar BETWEEN mulai AND selesai:
      → flag_diskon_spp = true, persen_diskon = pengaturan.persen_diskon
   c. Jika tidak masuk periode ATAU aktif = false:
      → flag_diskon_spp = false, persen_diskon = 0
3. Insert record siswa ke IndexedDB dengan:
   → status = "calon"
   → jalur_registrasi = "baru"
   → jenis_masuk = "awal_tahun"
   → sumber_data = "manual"
   → tahun_ajaran_target_id = pilihan admin
   → kelas_rencana_id = kelas rencana hasil auto-fill atau override manual admin
4. Generate tagihan pendaftaran:
   a. Jika opsi = "full":
      → Buat 1 tagihan jenis `pendaftaran`: jumlah_total = biaya tagihan awal, jatuh_tempo = jatuh tempo tagihan awal, bisa_cicil = false
   b. Jika opsi = "cicil":
      → Buat 1 tagihan jenis `pendaftaran`: jumlah_total = biaya tagihan awal, jatuh_tempo = jatuh tempo tagihan awal, bisa_cicil = true
      → Cicilan dicatat via pembayaran parsial sampai tagihan lunas; tidak ada jumlah termin tetap
5. Insert tagihan ke IndexedDB
6. Siswa tidak langsung memiliki `siswa_kelas` aktif
7. Jika tagihan pendaftaran lunas sebelum tahun ajaran target aktif:
   → status tetap "calon"
8. Saat tahun ajaran target diaktifkan:
   → sistem memakai `kelas_rencana_id` jika masih valid dan kapasitas tersedia; jika kosong, sistem mencoba menempatkan siswa otomatis berdasarkan umur
9. Queue sync untuk siswa + tagihan ke Supabase
```

**Mode B — Siswa Pindahan Manual**

Dipakai untuk siswa yang masuk di tengah tahun ajaran aktif.

**Logika saat simpan:**

```
1. tahun_ajaran_target_id otomatis = tahun ajaran aktif
2. Kelas tujuan wajib diisi
3. Insert record siswa ke IndexedDB dengan:
   → status = "aktif"
   → jalur_registrasi = "pindahan"
   → jenis_masuk = "pindahan"
   → sumber_data = "manual"
4. Generate 1 tagihan jenis `pendaftaran`
5. Insert record siswa_kelas aktif sesuai kelas tujuan
6. Tagihan pendaftaran tidak menahan status aktif siswa pindahan
7. Queue sync semua perubahan
```

**Mode C — Import Batch Siswa Baru / Calon**

Dipakai untuk pendaftaran massal siswa baru melalui file Excel pada alur operasional normal.

**Logika saat simpan:**

```
1. Admin upload file `template_import_siswa_calon.xlsx`
2. Sistem validasi setiap baris:
   → `kode_import_siswa` unik dalam file
   → `tahun_ajaran_target` ada di master
   → `tanggal_daftar` valid
   → `tanggal_lahir` wajib dan valid untuk menghitung umur calon
   → `jatuh_tempo_pendaftaran` wajib dan valid
   → `biaya_pendaftaran` wajib per baris
3. Untuk setiap baris valid:
   → Insert siswa dengan `status = calon`
   → `jalur_registrasi = baru`
   → `jenis_masuk = awal_tahun`
   → `sumber_data = import_excel`
4. Hitung early bird per baris berdasarkan `tanggal_daftar`
5. Generate tagihan `pendaftaran` per baris sesuai `biaya_pendaftaran`
6. Jangan buat `siswa_kelas` aktif saat import calon
7. Queue sync semua siswa + tagihan valid
8. Baris gagal masuk daftar error untuk diperbaiki admin
```

**Template Excel — Import Batch Siswa Baru / Calon**

Nama file referensi: `template_import_siswa_calon.xlsx`

Sheet yang disediakan:
- `petunjuk`
- `siswa_calon`
- `referensi`

Kolom sheet `siswa_calon`:

| Kolom | Wajib | Keterangan |
|---|---|---|
| `kode_import_siswa` | Ya | Kode unik per baris, hanya untuk proses import |
| `nama_siswa` | Ya | Nama lengkap siswa |
| `tanggal_lahir` | Ya | Format `YYYY-MM-DD`; wajib untuk validasi umur calon |
| `jenis_kelamin` | Tidak | `L` / `P` |
| `nama_wali` | Ya | Nama orang tua atau wali |
| `hubungan_wali` | Tidak | `ayah` / `ibu` / `wali` |
| `kontak_wali` | Ya | Nomor HP / WhatsApp |
| `email_wali` | Tidak | Email wali |
| `alamat` | Tidak | Alamat lengkap |
| `tahun_ajaran_target` | Ya | Harus cocok dengan master tahun ajaran |
| `tanggal_daftar` | Ya | Dipakai untuk early bird |
| `jatuh_tempo_pendaftaran` | Ya | Format `YYYY-MM-DD`. Dipakai sebagai jatuh tempo tagihan pendaftaran; wajib untuk semua baris |
| `biaya_pendaftaran` | Ya | Nilai per baris |
| `opsi_pembayaran_awal` | Ya | `full` / `cicil` |
| `catatan` | Tidak | Catatan internal |

**Catatan Migrasi:** Migrasi tidak berada di form Tambah Siswa. Migrasi memakai menu `Migrasi Data Awal` dengan wizard siklus lengkap: `Migrasi Calon Siswa` dan `Migrasi Siswa Tahun Berjalan`. Setiap wizard memuat data siswa, tagihan terkait, pembayaran lama jika ada, validasi, preview, lalu Review & Simpan secara atomic. Jika ada validasi gagal, tidak ada data yang ditulis ke IndexedDB; draft sementara tetap tersimpan di localStorage.

#### Layar: Migrasi Data Awal

Menu migrasi dipakai saat aplikasi mulai digunakan pada awal maupun tengah tahun ajaran. Migrasi tidak boleh dicampur dengan form Tambah Siswa operasional.

**Submenu utama:**
- `Migrasi Calon Siswa`
- `Migrasi Siswa Tahun Berjalan`

##### Wizard Migrasi Calon Siswa

Dipakai untuk memasukkan calon siswa beserta tagihan dan pembayaran pendaftarannya dalam satu siklus.

**Langkah wizard:**
1. Prasyarat & Tahun Ajaran Target
2. Data Calon Siswa
3. Tagihan Pendaftaran
4. Pembayaran Pendaftaran
5. Review & Simpan

**Aturan:**
- Wajib ada tahun ajaran target yang sudah disiapkan. Jika belum ada, tombol lanjut/import dinonaktifkan dan admin diarahkan ke Setup Tahun Ajaran Baru.
- Data siswa calon, tagihan pendaftaran, dan pembayaran pendaftaran disimpan sekaligus hanya saat Review & Simpan.
- Tagihan pendaftaran dibuat otomatis dari pengaturan pendaftaran tahun ajaran target, dengan opsi override per siswa jika data migrasi membutuhkan.
- Early bird dihitung dari `tanggal_daftar` terhadap pengaturan early bird global. Calon yang masuk periode early bird baru mendapat `flag_diskon_spp = true` setelah tagihan pendaftaran lunas; jika belum lunas, statusnya eligible tetapi diskon belum aktif.
- Pembayaran pendaftaran bersifat opsional; jika diisi, jumlah pembayaran tidak boleh melebihi tagihan.
- Jika validasi gagal, tidak ada siswa/tagihan/pembayaran yang ditulis ke IndexedDB.

##### Wizard Migrasi Siswa Tahun Berjalan

Dipakai untuk memasukkan siswa yang sudah ada pada tahun ajaran aktif, baik yang masih aktif maupun yang sudah keluar.

**Langkah wizard:**
1. Prasyarat Tahun Ajaran Aktif & Kelas
2. Data Siswa
3. Tagihan
4. Pembayaran
5. Review & Simpan

**Status UI:**
- `Aktif`
- `Keluar`

**Penyimpanan internal:**
- `Aktif` disimpan sebagai `siswa.status = aktif`
- `Keluar` disimpan sebagai `siswa.status = berhenti`

**Aturan SPP auto untuk siswa migrasi tahun berjalan:**
- Wajib memiliki kelas aktif/terakhir yang cocok dengan master kelas tahun ajaran aktif.
- Sistem otomatis membuat tagihan SPP untuk siswa `aktif` maupun `keluar`.
- Untuk siswa `aktif`, SPP digenerate sampai bulan akhir tahun ajaran aktif.
- Untuk siswa `keluar`, SPP digenerate sampai bulan `tanggal_keluar`.
- Jika `jenis_masuk = awal_tahun`, SPP digenerate dari bulan mulai tahun ajaran aktif.
- Jika `jenis_masuk = pindahan`, SPP digenerate dari bulan `tanggal_daftar`.
- Nominal SPP default mengikuti tarif kelas, tetapi migrasi boleh mengisi `tarif_spp_khusus` per siswa sebagai nominal final per bulan jika siswa memiliki diskon khusus, mengikuti tarif tahun sebelumnya, subsidi, atau kesepakatan lain. Tarif khusus ini hanya dipakai untuk auto-generate SPP hasil migrasi tahun berjalan dan tidak mengubah `kelas.tarif_spp`.
- Jatuh tempo default SPP hasil migrasi adalah tanggal 10 pada setiap bulan tagihan, kecuali nanti ada pengaturan khusus.

**Aturan untuk siswa keluar:**
- Wajib memiliki kelas terakhir, tanggal keluar, dan alasan keluar.
- Sistem membuat `siswa_kelas` tertutup dengan `selesai = tanggal_keluar` dan `status_akhir_periode = keluar`.
- Jika siswa keluar masih memiliki piutang non-SPP, tagihan lama dimasukkan di sheet `tagihan` wizard yang sama.
- Pembayaran lama untuk SPP auto maupun tagihan non-SPP dimasukkan di sheet `pembayaran` wizard yang sama.
- Pembayaran SPP mengacu ke `kode_import_siswa` + `bulan_tahun`; pembayaran non-SPP mengacu ke `kode_import_tagihan`. Satu baris pembayaran tidak boleh mengisi dua jenis referensi sekaligus.

**Aturan atomic:**
- Draft wizard disimpan sementara di localStorage.
- IndexedDB baru ditulis saat Review & Simpan dan semua validasi lolos.
- Jika validasi gagal, sistem menampilkan baris/field bermasalah dan tidak menyimpan data sebagian.

**Informasi real-time yang ditampilkan saat mengisi form:**
- Badge "✓ Early Bird — Diskon SPP [X]%" jika tanggal daftar masuk periode (hanya untuk jenis = Baru)
- Jika cicil: tampilkan informasi bahwa pembayaran dapat dicicil bebas melalui pembayaran parsial sampai lunas/jatuh tempo, tanpa jumlah termin tetap
- Pada panel preview kelas, tampilkan umur siswa pada tanggal cutoff tahun ajaran target dalam format tahun dan bulan; usia harus minimal 2 tahun dan di bawah 7 tahun untuk pendaftaran PAUD
- Jangan tampilkan umur sebelum tahun ajaran target dipilih; jika target belum dipilih, tampilkan pesan agar admin memilih tahun ajaran target terlebih dahulu
- Preview dan auto-fill "Kelas rencana: [Tingkat - Nama Kelas]" untuk mode `baru`, berdasarkan umur pada tanggal cutoff tahun ajaran target, dengan opsi override manual
- Preview ringkasan hasil import: total valid, total gagal, dan total tagihan awal yang akan dibuat

#### Layar: Detail Siswa

Halaman utama untuk satu siswa dengan layout scroll satu halaman.

**Header halaman (selalu tampil):**
- Foto siswa (atau avatar placeholder)
- Nama siswa
- Badge status
- Kelas aktif saat ini
- Badge diskon SPP jika `flag_diskon_spp = true`: "Diskon SPP [X]%"
- Tombol "Edit Profil"
- Tombol "Set Lulus" (hanya jika status = aktif)
- Tombol "Set Berhenti" (hanya jika status = aktif)
- Tombol "Atur Kelas Manual" (untuk override hasil penempatan otomatis)

**Konten halaman:**
- Semua data siswa dan orang tua
- Riwayat kelas (accordion: kelas, periode masuk-selesai)
- Tabel tagihan siswa dengan filter status dan jenis

#### Layar: Edit Profil Siswa

Form yang sama dengan form tambah, tapi field pendaftaran (biaya, opsi cicil, dsb) tidak bisa diubah dari sini.

#### Aksi: Atur Kelas Manual

Dipakai untuk mengubah hasil penempatan kelas otomatis jika admin memiliki pertimbangan khusus, termasuk siswa dengan kecerdasan khusus.

**Field:**

| Field | Tipe Input | Wajib | Keterangan |
|---|---|---|---|
| Kelas tujuan | Dropdown kelas aktif | Ya | Kelas aktif yang akan menggantikan penempatan saat ini |
| Alasan override | Textarea | Tidak | Misalnya: kecerdasan khusus, kesiapan akademik, pertimbangan sekolah |

**Logika saat simpan:**

```
1. Jika ada siswa_kelas aktif lama: tutup dengan `selesai = today`
2. Buat siswa_kelas baru:
   → kelas_id = pilihan admin
   → penempatan_sumber = "manual"
   → catatan_penempatan = alasan override
3. Jika siswa masih `calon` dan semua syarat finansial terpenuhi:
   → ubah status siswa = "aktif"
4. Queue sync semua perubahan
```

#### Aksi: Set Siswa Berhenti

Tampil sebagai drawer/modal dari halaman Detail Siswa.

**Konten:**
- Informasi siswa (nama, kelas)
- Pilihan alasan keluar: `Pindah Sekolah` / `Berhenti Lainnya`
- List tagihan yang belum lunas (status `belum_bayar` atau `sebagian`) beserta sisa masing-masing
- Per tagihan: pilihan penanganan via dropdown/radio

| Pilihan penanganan | Aksi sistem |
|---|---|
| Tandai lunas | Set `sudah_dibayar = jumlah_total`, `status = lunas` |
| Hapus tagihan | Set `deleted_at = now()` (soft delete) |
| Biarkan (catat sebagai piutang) | Tidak ada perubahan pada tagihan |

**Konfirmasi:**
- Ringkasan aksi per tagihan
- Tombol "Konfirmasi Berhenti"

**Logika saat konfirmasi:**
```
1. Proses penanganan setiap tagihan sesuai pilihan
2. Set siswa_kelas aktif: selesai = today
3. Set siswa.status = "berhenti"
4. Set siswa.alasan_keluar = pilihan admin
5. Set siswa.tanggal_keluar = today
6. Set siswa.updated_at = now()
7. Queue sync semua perubahan ke Supabase
```

#### Aksi: Set Siswa Lulus

Tampil sebagai drawer/modal dari halaman Detail Siswa.

**Konten:**
- Informasi siswa (nama, kelas)
- Tanggal lulus
- Catatan opsional

**Logika saat konfirmasi:**
```
1. Set siswa_kelas aktif: selesai = tanggal lulus
2. Set siswa.status = "lulus"
3. Set siswa.tanggal_keluar = tanggal lulus
4. Set siswa.updated_at = now()
5. Queue sync semua perubahan ke Supabase
```

---

### 7.6 Lanjut Tahun Ajaran

**Modul:** `siswa`, `kelas`, `tahun_ajaran`

Fitur ini memindahkan siswa dari kelas lama ke kelas baru secara batch di akhir tahun ajaran.
Diimplementasikan sebagai **wizard 4 langkah**.

#### Langkah 1 — Pilih Tahun Ajaran Tujuan

- Tampilkan daftar tahun ajaran yang belum aktif
- Tombol "Buat Tahun Ajaran Baru" (buka form inline)
- Pilih satu tahun ajaran sebagai tujuan

#### Langkah 2 — Mapping Kelas

- Tabel: Kelas asal (dari tahun ajaran aktif) → Kelas tujuan (dari tahun ajaran yang dipilih di langkah 1)
- Per baris: dropdown pilih kelas tujuan (boleh kosong → siswa di kelas itu akan ditandai `lulus` atau `berhenti` saat konfirmasi)
- Tombol "Tambah Kelas Baru di Tahun Ajaran Tujuan" (buka form inline)

#### Langkah 3 — Review Siswa

- Expand per kelas → tampilkan daftar siswa
- Checkbox per siswa: unchecked = siswa ini **tidak** naik kelas dan harus diberi status akhir `lulus` atau `berhenti`
- Informasi tarif SPP: "Tarif kelas tujuan: Rp X"
- Override tarif per siswa: toggle "Gunakan tarif berbeda" → input nominal

#### Langkah 4 — Konfirmasi

- Ringkasan: X siswa naik kelas, Y lulus, Z berhenti
- Tombol "Lanjutkan Tahun Ajaran"

**Logika saat konfirmasi:**
```
Untuk setiap siswa aktif yang di-mapping:
  1. Tutup siswa_kelas lama: selesai = today
  2. Buat siswa_kelas baru: kelas_id = kelas_tujuan, mulai = today, penempatan_sumber = "manual"
  3. Update tarif SPP siswa jika ada override (simpan di profil siswa sebagai catatan)

Untuk siswa yang tidak di-mapping (kelas tanpa tujuan / unchecked):
  → Admin memilih status akhir `lulus` atau `berhenti`
  → Tutup siswa_kelas lama: selesai = today
  → Jika `lulus`: set siswa.status = "lulus", siswa.tanggal_keluar = today
  → Jika `berhenti`: set siswa.status = "berhenti", siswa.tanggal_keluar = today, siswa.alasan_keluar = pilihan admin

Setelah semua siswa diproses:
  → Set tahun_ajaran saat ini: aktif = false, status = arsip
  → Set tahun_ajaran tujuan: aktif = true, status = aktif
  → Jalankan penempatan otomatis untuk siswa `jalur_registrasi = baru` yang `tahun_ajaran_target_id` = tahun ajaran tujuan dan seluruh tagihan pendaftarannya sudah lunas
  → Queue sync semua perubahan
```

---

### 7.7 Tagihan

**Modul:** `tagihan`
**Lokasi tabel:** `tagihan`

#### Layar: Daftar Tagihan (Lintas Siswa)

**Komponen:**
- Tab konteks: `Tagihan Aktif`, `Tunggakan Lama`, `Tagihan Pendaftaran`, `Tagihan Dibatalkan`, dan `Semua Tagihan`
- Filter: bulan/tahun, kelas, jenis tagihan, status
- Tabel tagihan

**Definisi tab:**
- `Tagihan Aktif`: tagihan tahun ajaran aktif yang belum lunas. Ini menjadi tab default untuk operasional harian.
- `Tunggakan Lama`: tagihan belum lunas dari tahun ajaran selain tahun aktif. Pembayaran tetap boleh dicatat sampai lunas tanpa memindahkan `tagihan.tahun_ajaran_id`.
- `Tagihan Pendaftaran`: semua tagihan jenis `pendaftaran` yang belum soft delete, lintas status dan periode.
- `Tagihan Dibatalkan`: tagihan yang sudah soft delete (`deleted_at IS NOT NULL`). Tidak boleh menerima pembayaran atau aksi hapus ulang.
- `Semua Tagihan`: semua tagihan aktif/non-deleted lintas tahun. Tagihan dibatalkan hanya tampil di tab `Tagihan Dibatalkan`.

**Kolom tabel:** Nama siswa, Kelas, Nama tagihan, Tahun ajaran, Jenis, Jatuh tempo, Total, Sisa, Status, Aksi (Catat Pembayaran)

#### Generate SPP Massal (Multi-Bulan)

Admin dapat melakukan *generate* tagihan SPP untuk semua siswa aktif secara massal melalui tombol `Generate SPP Massal` di halaman Tagihan. Fitur ini memungkinkan admin untuk membuat tagihan SPP untuk rentang bulan tertentu sekaligus.

**Komponen form:**
- **Dari Bulan**: Bulan mulai *generate* SPP (format YYYY-MM).
- **Sampai Bulan**: Bulan akhir *generate* SPP (format YYYY-MM).
- **Tanggal Jatuh Tempo**: Pilihan tanggal jatuh tempo (1-31) yang akan berlaku untuk setiap bulan dalam rentang tersebut.
- **Override Nominal SPP (Opsional)**: Jika diisi, sistem akan mengabaikan tarif default kelas dan menggunakan nominal ini untuk SPP seluruh siswa target.

**Logika generate internal:**
           bulan_tahun = "YYYY-MM"
           bisa_cicil = false
           status = "belum_bayar"
           sudah_dibayar = 0
3. Queue sync semua tagihan baru ke Supabase
4. Proses otomatis melewati siswa yang sudah punya tagihan SPP pada bulan yang sama
```

#### Layar: Buat Tagihan Manual

Form tagihan manual dibuka dari tombol `Buat Tagihan Manual` pada halaman Daftar Tagihan. Form ini hanya untuk tagihan non-SPP.

**Form:**

| Field | Tipe Input | Wajib | Keterangan |
|---|---|---|---|
| Nama tagihan | Text | Ya | Contoh: "Kegiatan Outing" |
| Jenis | Dropdown | Ya | Dari daftar jenis_tagihan di pengaturan (kecuali SPP) |
| Jumlah total | Number | Ya | Dalam Rupiah |
| Jatuh tempo | Date picker | Ya | |
| Bisa dicicil | Toggle | Ya | Default: false |
| Target siswa | Radio | Ya | `Semua siswa aktif` / `Per kelas` / `Per individu` |
| Pilih kelas | Multi-select | Kondisional | Muncul jika target = Per kelas |
| Pilih siswa | Multi-select + search | Kondisional | Muncul jika target = Per individu |

**Preview:** "Tagihan ini akan dikirim ke X siswa"

**Logika simpan:**
```
1. Tentukan daftar siswa target berdasarkan pilihan:
   - Semua → ambil semua siswa status = "aktif"
   - Per kelas → ambil siswa aktif di kelas yang dipilih
   - Per individu → gunakan siswa yang dipilih
2. Untuk setiap siswa di daftar:
   → Insert tagihan baru dengan data dari form
   → jumlah_total, jatuh_tempo, bisa_cicil sama untuk semua
3. Queue sync ke Supabase
```

#### Aksi: Hapus Tagihan

- Hanya bisa dilakukan jika `sudah_dibayar = 0` (belum ada pembayaran sama sekali)
- Soft delete: set `deleted_at = now()`
- Tagihan yang sudah ada pembayaran tidak bisa dihapus

#### Layar: Migrasi Tagihan

Catatan: Alur ini bukan menu utama terpisah pada implementasi terbaru. Tagihan lama masuk sebagai langkah `Tagihan` di wizard `Migrasi Calon Siswa` atau `Migrasi Siswa Tahun Berjalan`. Bagian ini dipertahankan sebagai referensi struktur data/template jika nanti diperlukan koreksi lanjutan.

Dipakai untuk memasukkan tagihan lama setelah migrasi master siswa selesai.

**Prasyarat:**
- Siswa hasil migrasi sudah ada di sistem
- Kode import siswa dari file migrasi siswa tersedia

**Logika saat import:**
```
1. Admin upload file `template_migrasi_tagihan.xlsx`
2. Sistem validasi setiap baris:
   → `kode_import_tagihan` unik dalam file
   → `kode_import_siswa` ditemukan pada data siswa migrasi
   → `jenis_tagihan` valid
   → `bulan_tahun` wajib jika `jenis_tagihan = spp`
3. Untuk setiap baris valid:
   → buat record tagihan
   → `sudah_dibayar = 0`
   → `status = belum_bayar`
4. Queue sync semua tagihan valid
5. Pembayaran lama belum dimasukkan pada tahap ini
```

**Template Excel — Migrasi Tagihan**

Nama file referensi: `template_migrasi_tagihan.xlsx`

Sheet yang disediakan:
- `petunjuk`
- `tagihan`
- `referensi`

Kolom sheet `tagihan`:

| Kolom | Wajib | Keterangan |
|---|---|---|
| `kode_import_tagihan` | Ya | Kode unik per baris untuk menghubungkan file pembayaran |
| `kode_import_siswa` | Ya | Harus cocok dengan file migrasi siswa |
| `jenis_tagihan` | Ya | `spp`, `pendaftaran`, `daftar_ulang`, atau jenis aktif lain |
| `nama_tagihan` | Ya | Nama tagihan |
| `jumlah_total` | Ya | Nilai total tagihan |
| `jatuh_tempo` | Ya | Format `YYYY-MM-DD` |
| `bisa_cicil` | Ya | `true` / `false` |
| `bulan_tahun` | Kondisional | Wajib jika `jenis_tagihan = spp`, format `YYYY-MM` |
| `catatan` | Tidak | Catatan internal |

---

### 7.8 Pembayaran

**Modul:** `pembayaran`
**Lokasi tabel:** `pembayaran`, `tagihan`

#### Layar: Daftar Pembayaran

Halaman utama menu `Keuangan > Pembayaran` adalah overview semua aktivitas pembayaran lintas siswa. Tombol utama `Catat Pembayaran` membuka form pada route `/pembayaran/new`.

**Fitur:**
- Filter rentang tanggal
- Filter metode pembayaran
- Search nama siswa/nama tagihan
- Ringkasan di atas: total pemasukan periode/filter aktif, jumlah transaksi, dan breakdown nominal per metode pembayaran
- Tabel pembayaran lintas siswa

**Kolom tabel:** Nama siswa, jenis/nama tagihan, tanggal bayar, nominal, metode, status tagihan induk

**Aksi:**
- Klik baris pembayaran membuka detail siswa terkait sebagai titik masuk ke riwayat/tagihan siswa.
- Tombol `Catat Pembayaran` membuka form catat pembayaran.

#### Layar: Form Catat Pembayaran

Dapat diakses dari:
- Tombol `Catat Pembayaran` di halaman Pembayaran
- Tombol "Catat Pembayaran" di baris tagihan (siswa sudah terisi otomatis)

**Form:**

| Field | Tipe Input | Wajib | Keterangan |
|---|---|---|---|
| Siswa | Search + select | Ya | Autocomplete nama siswa dari IndexedDB |
| Tagihan | Dropdown | Ya | Hanya tampilkan tagihan milik siswa tersebut dengan status bukan `lunas` |
| Tanggal bayar | Date picker | Ya | Default: hari ini |
| Jumlah diterima | Number | Ya | Validasi: tidak boleh melebihi sisa tagihan |
| Metode pembayaran | Dropdown | Ya | Dari daftar metode_pembayaran di pengaturan |
| Catatan | Textarea | Tidak | Contoh: nomor referensi transfer |

Catatan split dan verifikasi:
- `Split` bukan master metode pembayaran. Split dilakukan dengan menambah lebih dari satu baris metode pada form Catat Pembayaran.
- Pembayaran split disimpan sebagai beberapa record `pembayaran` dengan `payment_group_id` yang sama, sehingga laporan per metode tetap akurat tetapi UI/kuitansi dapat menampilkan satu transaksi gabungan.
- Metode `Tunai/Cash` langsung `terverifikasi` dan langsung mengurangi tagihan.
- Metode `Transfer` dan `Tabungan` masuk status `menunggu_verifikasi`; tagihan belum berkurang sampai admin mengonfirmasi group pembayaran.
- Pada halaman Pembayaran, transaksi dengan `payment_group_id` yang sama ditampilkan sebagai satu baris dengan rincian metode, misalnya total Rp 500.000 berisi `Tabungan Rp 300.000` dan `Transfer Rp 200.000`.
- Ringkasan pemasukan hanya menghitung pembayaran `terverifikasi`; pembayaran `menunggu_verifikasi` dan `ditolak` tidak masuk total penerimaan.
- Admin dapat `Konfirmasi` atau `Tolak` pembayaran yang menunggu verifikasi. Konfirmasi mengubah semua record dalam group menjadi `terverifikasi` dan baru memperbarui `tagihan.sudah_dibayar`/`status`.

**Informasi yang ditampilkan saat tagihan dipilih:**
- Total tagihan: Rp X
- Sudah dibayar: Rp Y
- Sisa tagihan: Rp Z
- Preview status setelah pembayaran ini: "Lunas" / "Sebagian terbayar (sisa: Rp W)"

**Logika simpan:**
```
1. Validasi: jumlah <= (tagihan.jumlah_total - tagihan.sudah_dibayar)
2. Insert record pembayaran ke IndexedDB:
   - tagihan_id, dicatat_oleh = current_user.id
   - jumlah, metode, tanggal, catatan
3. Hitung ulang tagihan:
   - sudah_dibayar_baru = tagihan.sudah_dibayar + jumlah
   - status_baru:
       IF sudah_dibayar_baru >= tagihan.jumlah_total → "lunas"
       ELSE IF sudah_dibayar_baru > 0 → "sebagian"
       ELSE → "belum_bayar"
4. Update tagihan di IndexedDB:
   - sudah_dibayar = sudah_dibayar_baru
   - status = status_baru
   - updated_at = now()
5. Jika status baru = "lunas" DAN tagihan.jenis = "pendaftaran":
   → Cek apakah semua tagihan pendaftaran siswa ini sudah lunas
   → Jika jalur_registrasi = "baru" dan tahun_ajaran_target sudah aktif: jalankan penempatan otomatis ke kelas sesuai umur
   → Jika jalur_registrasi = "baru" dan tahun_ajaran_target belum aktif: status tetap `calon`
   → Jika jalur_registrasi = "pindahan": status siswa tetap `aktif`
6. Jika tagihan berasal dari data migrasi:
   → Tidak mengubah status siswa otomatis; migrasi hanya membangun saldo dan histori
7. Jika status baru = "lunas" DAN tagihan.jenis = "daftar_ulang":
   → Tidak ada perubahan status siswa otomatis
8. Queue sync pembayaran + tagihan + siswa (jika status berubah) ke Supabase
9. Tampilkan opsi: "Cetak Kuitansi" / "Catat Pembayaran Lain" / "Selesai"
```

#### Layar: Riwayat Pembayaran

**Filter:**
- Rentang tanggal
- Kelas
- Metode pembayaran

**Tabel:** Tanggal, Nama siswa, Nama tagihan, Jumlah, Metode, Dicatat oleh, Aksi (Cetak Kuitansi)

**Aksi:** Export Excel, Export PDF

#### Aksi: Cetak Kuitansi PDF

Generate PDF di sisi client menggunakan jsPDF. Template kuitansi:

```
┌────────────────────────────────────────────────┐
│  [Logo]   NAMA SEKOLAH                         │
│           Alamat Sekolah                       │
│           Telp | Email                         │
├────────────────────────────────────────────────┤
│  KUITANSI PEMBAYARAN           No: [ID]        │
│                                Tgl: [Tanggal]  │
├────────────────────────────────────────────────┤
│  Diterima dari : [Nama Wali]                   │
│  Untuk siswa   : [Nama Siswa] — [Kelas]        │
│  Keterangan    : [Nama Tagihan]                │
│  Jumlah        : Rp [Nominal]                  │
│  Metode        : [Metode Pembayaran]           │
│  Status        : [Lunas / Cicilan ke-N]        │
├────────────────────────────────────────────────┤
│  Catatan: [Catatan]                            │
├────────────────────────────────────────────────┤
│  Dicatat oleh: [Nama Admin]                    │
│                                                │
│                        [Nama Kepala Sekolah]   │
│                        [Tanda Tangan]          │
│                        [Nama Kepala Sekolah]   │
└────────────────────────────────────────────────┘
```

**Data yang dibutuhkan untuk generate:**
- Dari `profil_sekolah`: nama_sekolah, alamat, telepon, email, logo_url, nama_kepsek, tanda_tangan_url
- Dari `pembayaran`: id, jumlah, metode, tanggal, catatan, dicatat_oleh
- Dari `tagihan`: nama_tagihan, jumlah_total, sudah_dibayar (setelah pembayaran ini)
- Dari `siswa`: nama, nama_wali
- Dari `siswa_kelas` + `kelas`: nama kelas aktif
- Dari `akun`: nama admin yang mencatat

#### Layar: Migrasi Riwayat Pembayaran

Catatan: Alur ini bukan menu utama terpisah pada implementasi terbaru. Pembayaran lama masuk sebagai langkah `Pembayaran` di wizard `Migrasi Calon Siswa` atau `Migrasi Siswa Tahun Berjalan`. Bagian ini dipertahankan sebagai referensi struktur data/template jika nanti diperlukan koreksi lanjutan.

Dipakai untuk memasukkan pembayaran lama setelah migrasi tagihan selesai.

**Prasyarat:**
- Tagihan hasil migrasi sudah ada di sistem
- Kode import tagihan dari file migrasi tagihan tersedia

**Logika saat import:**
```
1. Admin upload file `template_migrasi_pembayaran.xlsx`
2. Sistem validasi setiap baris:
   → `kode_import_pembayaran` unik dalam file
   → `kode_import_tagihan` ditemukan pada data tagihan migrasi
   → `metode_pembayaran` valid
   → `jumlah` > 0
3. Untuk setiap baris valid:
   → buat record pembayaran
   → hubungkan ke tagihan berdasarkan `kode_import_tagihan`
4. Setelah semua pembayaran terimport:
   → hitung ulang `sudah_dibayar` per tagihan
   → update status tagihan menjadi `belum_bayar` / `sebagian` / `lunas`
5. Queue sync semua pembayaran dan hasil recalc ke Supabase
```

**Template Excel — Migrasi Riwayat Pembayaran**

Nama file referensi: `template_migrasi_pembayaran.xlsx`

Sheet yang disediakan:
- `petunjuk`
- `pembayaran`
- `referensi`

Kolom sheet `pembayaran`:

| Kolom | Wajib | Keterangan |
|---|---|---|
| `kode_import_pembayaran` | Ya | Kode unik per baris pembayaran |
| `kode_import_tagihan` | Ya | Harus cocok dengan file migrasi tagihan |
| `tanggal_pembayaran` | Ya | Format `YYYY-MM-DD` |
| `jumlah` | Ya | Nilai pembayaran |
| `metode_pembayaran` | Ya | Harus ada di master metode pembayaran |
| `catatan` | Tidak | Catatan internal |

---

### 7.9 Laporan

**Modul:** `laporan`

Semua laporan:
- Data diambil dari IndexedDB (tidak butuh online)
- Export PDF dan Excel dilakukan di sisi client

#### Sub-modul: Rekap Penerimaan

**Filter:** Bulan/tahun (rentang), Kelas, Jenis tagihan

**Tabel output:**

| Kolom | Keterangan |
|---|---|
| Jenis tagihan | |
| Jumlah tagihan | Banyaknya tagihan |
| Total tagihan | Total nominal yang seharusnya diterima |
| Total terbayar | Total yang sudah dibayar |
| Total belum terbayar | Selisih |

**Grafik:** Bar chart penerimaan per bulan (6 bulan terakhir)

**Export:** PDF (tabel + grafik), Excel (tabel saja)

---

#### Sub-modul: Daftar Tunggakan

**Filter:** Kelas, Jenis tagihan, Minimal sisa tagihan (Rp), Status jatuh tempo (semua / sudah lewat)

**Tabel output:**

| Kolom | Keterangan |
|---|---|
| Nama siswa | |
| Kelas | |
| Nama tagihan | |
| Jatuh tempo | Merah jika sudah lewat |
| Total tagihan | |
| Sudah dibayar | |
| Sisa | |
| Keterlambatan | Jumlah hari sejak jatuh tempo (0 jika belum lewat) |

**Urutan default:** Jatuh tempo terlama (paling tua di atas)

**Export:** PDF, Excel

---

#### Sub-modul: Riwayat per Siswa

**Filter:** Pilih siswa (search), Rentang tanggal

**Output:**
- Header: nama siswa, kelas, nama wali, status
- Tabel tagihan: semua tagihan siswa dalam periode
- Tabel pembayaran: semua pembayaran siswa dalam periode

**Export:** PDF (format laporan per siswa, siap diserahkan ke orang tua)

---

#### Sub-modul: Laporan Diskon Early Bird

**Filter:** Tahun ajaran

**Tabel output:**

| Kolom | Keterangan |
|---|---|
| Nama siswa | |
| Tanggal daftar | |
| Persen diskon | |
| Total SPP tanpa diskon | Dihitung dari tarif kelas × jumlah bulan SPP |
| Total diskon dinikmati | Selisih SPP normal vs SPP dengan diskon |

**Export:** Excel

---

#### Sub-modul: Laporan Pendaftaran

**Filter:** Status pembayaran pendaftaran, Tahun ajaran target, Jalur registrasi (`baru` / `pindahan`)

**Tabel output:**

| Kolom | Keterangan |
|---|---|
| Nama siswa | |
| Tanggal daftar | |
| Jalur registrasi | Baru / Pindahan |
| Jenis tagihan awal | Pendaftaran |
| Biaya tagihan awal | Total |
| Sudah dibayar | |
| Sisa | |
| Status | Belum bayar / Sebagian / Lunas |

**Export:** Excel, PDF

---

## 8. Aturan Bisnis

| Kode | Aturan | Lokasi pengecekan |
|---|---|---|
| BR-01 | Hanya satu tahun ajaran yang boleh `aktif = true` dan `status = aktif` pada satu waktu | Service layer, sebelum simpan |
| BR-01A | Tahun ajaran baru dibuat sebagai `draft`; tahun draft hanya bisa diaktifkan jika tidak ada tahun ajaran aktif | Service layer tahun ajaran |
| BR-01B | Tahun ajaran aktif hanya boleh menjadi `arsip` setelah Lanjut Tahun Ajaran dijalankan | Service layer naik kelas |
| BR-01C | Halaman operasional wajib menampilkan data tahun ajaran aktif secara default; data arsip hanya tampil saat admin memilih filter tahun ajaran arsip | Query/UI filter |
| BR-01D | Tahun ajaran `arsip` dikunci/read-only: data boleh dibaca dan diekspor, tetapi tidak boleh diedit, dihapus, diberi tagihan baru, menerima pembayaran baru, atau menjadi target perubahan status/kelas siswa | Service layer + UI guard |
| BR-01E | Tidak ada nonaktif manual untuk tahun ajaran aktif; status `arsip` hanya boleh dihasilkan oleh Lanjut Tahun Ajaran setelah periode benar-benar selesai | Service layer naik kelas |
| BR-02 | Status siswa yang valid adalah `calon`, `aktif`, `lulus`, `berhenti`, dan `batal_daftar` | Service layer siswa |
| BR-02C | Status `calon` dan `batal_daftar` hanya berlaku untuk siswa tahun ajaran baru/draft; siswa tahun berjalan tidak boleh dibuat sebagai `calon` atau `batal_daftar` | Service layer siswa |
| BR-02D | Setiap tagihan wajib menyimpan `tahun_ajaran_id`; filter periode tagihan dan pembayaran memakai kolom ini sebagai sumber utama | Service layer tagihan/query |
| BR-02A | Status siswa yang tampil di daftar mengikuti konteks tahun ajaran; tahun aktif tidak menampilkan `lulus`, tahun arsip tidak menampilkan siswa lanjut sebagai `aktif` | Query/UI siswa |
| BR-02B | Saat `siswa_kelas` ditutup, `status_akhir_periode` harus disimpan untuk kebutuhan histori arsip | Service layer siswa/naik kelas |
| BR-03 | Generate SPP hanya untuk siswa dengan `status = aktif` | Service layer generate SPP |
| BR-04 | Tidak boleh ada dua tagihan SPP dengan `siswa_id` dan `bulan_tahun` yang sama | Service layer, sebelum insert tagihan SPP |
| BR-05 | Diskon SPP (`flag_diskon_spp`) diterapkan saat generate SPP jika `flag_diskon_spp = true` | Service layer generate SPP |
| BR-06 | Diskon early bird calon hanya aktif jika pengaturan early bird global aktif, tanggal daftar masuk periode, dan tagihan pendaftaran sudah lunas | Service layer saat simpan/pembayaran siswa baru |
| BR-07 | Siswa dengan `jenis_masuk = pindahan` tidak pernah mendapat diskon early bird | Service layer saat simpan siswa baru |
| BR-08 | Siswa `baru` wajib memiliki `tahun_ajaran_target_id` berstatus `draft`; tidak boleh didaftarkan ke tahun ajaran aktif atau arsip | Service layer saat simpan siswa baru |
| BR-09 | Siswa `baru` yang pendaftarannya lunas tidak otomatis `aktif` jika tahun ajaran target belum aktif | Service layer pembayaran |
| BR-10 | Penempatan kelas otomatis hanya berlaku untuk siswa `jalur_registrasi = baru` yang sudah lunas dan tahun ajaran targetnya aktif | Service layer aktivasi tahun ajaran |
| BR-11 | Umur untuk auto-placement dihitung dalam tahun penuh berdasarkan tanggal cutoff pengaturan, default 1 Juli | Service layer penempatan otomatis |
| BR-11A | Pendaftaran siswa PAUD hanya valid jika umur pada tanggal cutoff tahun ajaran target minimal 2 tahun dan masih di bawah 7 tahun | Service layer/UI form siswa |
| BR-11B | Siswa `calon` jalur `baru` boleh menyimpan `kelas_rencana_id`; saat aktivasi/penempatan, kelas rencana dipakai lebih dulu jika masih valid dan kapasitas tersedia | Service layer penempatan otomatis |
| BR-12 | Jika tidak ditemukan kelas yang sesuai rentang umur, siswa tetap `calon` sampai admin menentukan kelas manual | Service layer penempatan otomatis |
| BR-13 | Admin dapat mengubah hasil penempatan otomatis menjadi penempatan manual | Service layer siswa_kelas |
| BR-14 | Hasil override manual harus menyimpan sumber penempatan `manual` dan catatan opsional alasan override | Service layer siswa_kelas |
| BR-15 | Siswa `pindahan` pada operasional normal langsung berstatus `aktif` setelah data siswa dan kelas tersimpan | Service layer saat simpan siswa pindahan |
| BR-16 | Tagihan `pendaftaran` siswa pindahan tidak menahan status `aktif` | Service layer pembayaran |
| BR-17 | Import batch siswa baru/calon membuat siswa berstatus `calon` dan dapat membuat tagihan `pendaftaran` per baris | Service layer import siswa calon |
| BR-18 | Pada mode migrasi siswa, sistem tidak membuat tagihan `pendaftaran` atau `daftar_ulang` otomatis | Service layer migrasi siswa |
| BR-19 | Migrasi memakai wizard satu siklus: data siswa, tagihan terkait, dan pembayaran lama divalidasi lalu disimpan atomic dalam wizard migrasi terkait | Service layer migrasi |
| BR-20 | Siswa migrasi dari Excel dengan status `aktif` harus otomatis dipasangkan ke kelas jika mapping kelas valid | Service layer migrasi siswa |
| BR-21 | Jika mapping kelas gagal pada migrasi siswa dari Excel, baris harus masuk daftar review manual | Service layer migrasi siswa |
| BR-22 | Tagihan atau pembayaran hasil migrasi tidak mengubah status siswa otomatis | Service layer migrasi pembayaran |
| BR-23 | Jumlah pembayaran tidak boleh melebihi sisa tagihan (`jumlah_total - sudah_dibayar`) | Service layer, validasi sebelum simpan pembayaran |
| BR-24 | Tagihan tidak bisa dihapus jika sudah ada pembayaran (`sudah_dibayar > 0`) | Service layer, sebelum soft delete tagihan |
| BR-25 | Setiap pembayaran menyimpan `dicatat_oleh` = id akun yang sedang login | Service layer, sebelum insert pembayaran |
| BR-26 | Status tagihan dihitung ulang setiap kali ada pembayaran baru atau import riwayat pembayaran | Service layer pembayaran |
| BR-27 | SPP tidak digenerate untuk siswa `calon`, `lulus`, atau `berhenti` | Service layer generate SPP |
| BR-28 | Saat siswa `berhenti`, kelas aktif harus ditutup dan `alasan_keluar` harus disimpan | Service layer status siswa |
| BR-29 | Saat siswa `lulus`, kelas aktif harus ditutup dan `tanggal_keluar` harus disimpan | Service layer status siswa |
| BR-30 | Semua data menggunakan soft delete — tidak ada hard delete | Repository layer |
| BR-30A | Hapus siswa hanya boleh untuk data salah input yang belum punya pembayaran, belum punya tagihan terbayar, dan belum punya riwayat kelas; jika tidak memenuhi syarat gunakan aksi status siswa | Service layer siswa |
| BR-31 | Akun dengan `aktif = false` tidak bisa login | Auth layer |
| BR-32 | UUID semua record di-generate di sisi client (bukan server) | Repository layer |
| BR-33 | Semua data di `profil_sekolah` (nama, logo, nama_kepsek) harus tampil di kuitansi dan laporan PDF | PDF generator |
| BR-34 | Setiap aksi diperiksa terhadap tabel `permission` sebelum dieksekusi | Middleware / guard di service layer |
| BR-35 | Jika `kelas.kapasitas_siswa` diisi, penempatan siswa aktif ke kelas tersebut tidak boleh melebihi kapasitas rombel | Service layer kelas/siswa_kelas |
| BR-36 | Kapasitas rombel tidak boleh diubah menjadi lebih kecil dari jumlah siswa aktif yang sudah menempati kelas | Service layer kelas |
| BR-37 | Nama tahun ajaran harus konsisten dan tidak boleh duplikat setelah normalisasi; periode tahun ajaran tidak boleh sama atau overlap dengan periode lain yang belum soft delete | Service layer tahun ajaran/setup |
| BR-38 | Kombinasi `tingkat` + `nama_kelas` tidak boleh duplikat dalam tahun ajaran yang sama setelah normalisasi | Service layer kelas/setup |
| BR-39 | Nama item master global seperti `metode_pembayaran` dan `jenis_tagihan` tidak boleh duplikat setelah normalisasi case-insensitive | Service layer pengaturan/setup |

---

## 9. Validasi & Error Handling

### 9.1 Validasi form (client-side, menggunakan Zod)

| Field | Rule |
|---|---|
| Nama siswa / wali | Required, min 2 karakter, max 100 karakter |
| Tanggal lahir | Tidak boleh di masa depan; wajib untuk siswa baru/calon; umur calon pada cutoff tahun ajaran target minimal 2 tahun dan di bawah 7 tahun |
| Tanggal selesai tahun ajaran | Wajib, tidak boleh sebelum tanggal mulai, dan maksimal `tanggal mulai + 1 tahun - 1 hari` |
| Biaya pendaftaran | Required, min 0, integer |
| Jatuh tempo pendaftaran | Required untuk pendaftaran normal/import calon, tidak boleh sebelum tanggal daftar |
| Tarif SPP kelas | Required, min 0, integer |
| Kapasitas siswa per rombel | Optional, integer, min 1, tidak boleh lebih kecil dari jumlah siswa aktif di kelas |
| Usia minimum / maksimum kelas | Integer, min 0, usia maksimum tidak boleh lebih kecil dari usia minimum |
| Jumlah pembayaran | Required, min 1, max = sisa tagihan |
| Email | Format email valid |
| Nomor HP | Min 10 digit, hanya angka |
| Status siswa | Hanya boleh `calon`, `aktif`, `lulus`, `berhenti` |
| Jenis masuk | Hanya boleh `awal_tahun` / `pindahan` |
| Alasan keluar | Wajib jika status siswa = `berhenti` |
| Tanggal keluar | Wajib jika status siswa = `lulus`/`berhenti`; pada mode migrasi wajib untuk input `keluar` |
| Kelas tujuan | Wajib untuk siswa pindahan dan migrasi manual dengan status `aktif` |
| `kode_import_siswa` | Wajib dan unik dalam satu file import |
| `kode_import_tagihan` | Wajib dan unik dalam satu file import |
| `kode_import_pembayaran` | Wajib dan unik dalam satu file import |
| Tahun ajaran target | Harus ada di master tahun ajaran |
| Kelas pada import migrasi | Harus cocok dengan master kelas jika status siswa = `aktif` |
| Biaya pendaftaran per baris | Wajib untuk import batch siswa baru/calon |
| `bulan_tahun` tagihan SPP | Wajib jika jenis tagihan = `spp`, format `YYYY-MM` |
| Tanggal cutoff umur | Kombinasi tanggal dan bulan valid |
| Upload file gambar | Maks 2MB untuk gambar, format JPG/PNG/GIF |
| Upload file import | Hanya `.xlsx` |
| Password | Min 8 karakter |

### 9.2 Error handling sync

| Kondisi | Penanganan |
|---|---|
| Network error saat push | Retry otomatis hingga 3x, lalu tandai `_sync_status = "conflict"` |
| Supabase menolak insert (constraint violation) | Catat ke sync_log dengan detail error, tampilkan notifikasi ke admin |
| IndexedDB penuh | Tampilkan error "Penyimpanan lokal penuh. Hapus cache browser dan coba lagi." |
| Conflict (kedua versi lebih baru dari kedua sisi) | Versi lokal yang pending menang (lokal-first), record remote disimpan di field `_conflict_remote` untuk referensi |

### 9.3 Offline error handling

| Aksi | Perilaku saat offline |
|---|---|
| Baca data | Selalu berhasil (dari IndexedDB) |
| Tulis data (insert/update) | Berhasil disimpan lokal, sync dijadwalkan |
| Upload file (foto, logo) | Tampilkan error: "Upload file membutuhkan koneksi internet." |
| Generate PDF | Berhasil (proses di client, tidak butuh internet) |
| Export Excel | Berhasil (proses di client) |

---

## 10. Non-Functional Requirements

### Performa

| Target | Ukuran |
|---|---|
| First Contentful Paint | < 2 detik pada WiFi |
| First Contentful Paint | < 4 detik pada 3G |
| Time to Interactive (setelah cache hangat) | < 1 detik |
| Kapasitas IndexedDB | Min 500 siswa + 5 tahun riwayat tagihan dan pembayaran |
| Ukuran bundle JS (gzip) | < 500KB untuk initial load |

### Keamanan

| Aspek | Implementasi |
|---|---|
| Autentikasi | Supabase Auth, email + password |
| Token | JWT dikelola Supabase Auth SDK, tidak disimpan manual |
| Otorisasi | Cek tabel `permission` di setiap aksi (lokal, dari IndexedDB) + RLS di Supabase |
| Session timeout | 8 jam tidak aktif → logout otomatis |
| HTTPS | Wajib di semua environment |
| RLS Supabase | Setiap tabel memiliki policy RLS yang membatasi akses hanya ke data milik user yang login |

### Kompatibilitas

| Platform | Versi minimum |
|---|---|
| Chrome | 90+ |
| Safari | 14+ |
| Firefox | 88+ |
| Android (Chrome) | Android 8+ |
| iOS (Safari) | iOS 14+ |
| Lebar layar minimum | 360px |

### PWA Requirements

| Requirement | Spesifikasi |
|---|---|
| Manifest | Nama app, ikon 192px + 512px, theme color, background color, display: standalone |
| Installable | Memenuhi PWA installability criteria Chrome |
| Offline | Seluruh UI dapat digunakan offline kecuali upload file |
| Update | Service worker mendeteksi versi baru, tampilkan banner "Versi baru tersedia — Perbarui sekarang" |

---

## 11. Batasan & Di Luar Scope

### Di luar scope versi ini

| Fitur | Keterangan |
|---|---|
| Payment gateway | Tidak ada integrasi Midtrans, Xendit, DANA, GoPay, dll |
| Notifikasi otomatis | Tidak ada WhatsApp, SMS, atau email blast ke orang tua |
| Role guru dan orang tua | Arsitektur permission sudah disiapkan, implementasi UI ditunda |
| Multi-sekolah | Satu instance = satu sekolah. Untuk multi-sekolah, tambahkan `sekolah_id` di semua tabel |
| Absensi | Di luar scope |
| Rapor / nilai akademik | Di luar scope |
| Penggajian guru | Di luar scope |
| Import generik semua master/transaksi di luar template resmi | Di luar scope versi ini |

### Asumsi

- Satu instance aplikasi untuk satu sekolah PAUD
- Admin memiliki akses internet minimal untuk sinkronisasi awal dan backup
- Semua pembayaran dicatat oleh admin — tidak ada self-service oleh orang tua
- UUID di-generate di sisi client menggunakan `crypto.randomUUID()`
- Import Excel yang termasuk scope hanya untuk **batch siswa baru/calon**, **migrasi siswa**, **migrasi tagihan**, dan **migrasi riwayat pembayaran**, bukan import generik semua modul

---

## 12. Prioritas Pengembangan

### P0 — Harus ada sebelum bisa digunakan

| # | Fitur |
|---|---|
| 1 | Setup PWA (manifest, service worker, offline shell) |
| 2 | Setup Dexie.js (IndexedDB schema, semua tabel) |
| 3 | Setup Supabase (auth, database, RLS, storage) |
| 4 | Sync engine (push queue, pull incremental, conflict resolution) |
| 5 | Login & session management |
| 6 | Pengaturan profil sekolah |
| 7 | Pengaturan akun & permission |
| 8 | Manajemen tahun ajaran & kelas |
| 9 | Form registrasi siswa multi-jalur (`baru`, `pindahan`, `migrasi`) + early bird detection |
| 10 | Import batch siswa baru/calon + tagihan pendaftaran per baris |
| 11 | Wizard Migrasi Calon Siswa dan Migrasi Siswa Tahun Berjalan dengan tagihan/pembayaran dalam satu siklus atomic |
| 12 | Generate SPP bulanan |
| 13 | Catat pembayaran + update status tagihan otomatis |
| 14 | Perubahan status siswa sesuai jalur registrasi dan tahun ajaran target |

### P1 — Penting, harus ada sebelum release

| # | Fitur |
|---|---|
| 15 | Detail siswa (semua tab) |
| 16 | Set siswa berhenti |
| 17 | Set siswa lulus |
| 18 | Proses naik kelas (wizard) |
| 19 | Tagihan manual (non-SPP) |
| 20 | Riwayat pembayaran |
| 21 | Laporan rekap penerimaan |
| 22 | Laporan daftar tunggakan |
| 23 | Kuitansi PDF |

### P2 — Lengkapi setelah P0 dan P1 stabil

| # | Fitur |
|---|---|
| 24 | Laporan riwayat per siswa (PDF per siswa) |
| 25 | Laporan diskon early bird |
| 26 | Laporan pendaftaran |
| 27 | Export Excel semua laporan |
| 28 | Supabase Realtime untuk multi-device sync cepat |
| 29 | Pengaturan permission per role (UI tabel centang) |
| 30 | Pengaturan cutoff umur dan penempatan otomatis siswa baru |

---

*Dokumen ini ditujukan untuk AI agent sebagai panduan implementasi. Setiap keputusan teknikal di dokumen ini adalah final kecuali ada revisi eksplisit.*
