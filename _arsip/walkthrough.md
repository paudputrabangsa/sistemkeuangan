# Walkthrough — FASE 2: Setup Dexie.js & Lapisan Data Lokal

## Yang Telah Dikerjakan

### Dependensi
- ✅ Memasang `dexie` dan `dexie-react-hooks`

### File yang Dibuat

#### [`src/db/types.ts`](file:///c:/pembayaran_paud/src/db/types.ts)
Definisi interface TypeScript lengkap untuk seluruh entitas database sesuai PRD:

| Interface | Keterangan |
|---|---|
| `BaseEntity` | Kolom umum: `id`, `created_at`, `updated_at`, `deleted_at` + metadata sinkronisasi (`_sync_status`, `_sync_at`, `_local_only`) |
| `ProfilSekolah` | Data singleton profil sekolah |
| `Pengaturan` | Key-value config: `early_bird`, `metode_pembayaran`, `jenis_tagihan` |
| `Akun` | Akun admin untuk login |
| `Permission` | Hak akses per role × modul × aksi |
| `TahunAjaran` | Periode tahun ajaran (hanya 1 yang `aktif = true`) |
| `Kelas` | Data kelas dengan tarif SPP |
| `Siswa` | Profil siswa lengkap + flag diskon Early Bird |
| `SiswaKelas` | Riwayat kelas siswa (historis) |
| `Tagihan` | Data tagihan SPP maupun non-SPP |
| `Pembayaran` | Record pembayaran manual oleh admin |
| `SyncQueue` | Antrian operasi offline yang menunggu di-push ke Supabase |
| `SyncLog` | Log hasil sinkronisasi (success / failed) |

#### [`src/db/index.ts`](file:///c:/pembayaran_paud/src/db/index.ts)
Class `AppDatabase extends Dexie` dengan skema Dexie v1 untuk **12 tabel** sesuai PRD §4.1:
```
profil_sekolah, pengaturan, tahun_ajaran, kelas, akun, permission,
siswa, siswa_kelas, tagihan, pembayaran, sync_queue, sync_log
```
Diekspor sebagai singleton `db` — siap diimpor di seluruh bagian aplikasi.

#### [`src/db/seed.ts`](file:///c:/pembayaran_paud/src/db/seed.ts)
Fungsi `seedDatabase()` yang berjalan sekali (idempotent) saat aplikasi pertama dibuka:

| Data yang di-seed | Detail |
|---|---|
| **Profil Sekolah** | Singleton ID `000...0001`, nama "TK PAUD Melati Indah" |
| **Pengaturan `early_bird`** | `aktif: false`, belum ada periode aktif |
| **Pengaturan `metode_pembayaran`** | Tunai, Transfer Bank |
| **Pengaturan `jenis_tagihan`** | SPP, Pendaftaran, Seragam, Kegiatan, Administrasi, Lainnya |
| **Akun admin default** | `admin@paud.sch.id`, role `admin`, sinkron dengan auth mock |
| **Permission admin** | 9 baris untuk semua modul sesuai PRD §6.4 |

### File yang Dimodifikasi

#### [`src/main.tsx`](file:///c:/pembayaran_paud/src/main.tsx)
Memanggil `seedDatabase()` di awal bootstrap aplikasi (fire-and-forget, non-blocking rendering).

## Hasil Verifikasi

```
✓ build selesai dalam 2.32s
  dist/assets/index-B55lIakn.js   365.68 kB │ gzip: 115.50 kB
  Tidak ada error TypeScript
  Tidak ada error Vite
```

## Cara Memverifikasi Secara Manual

1. Jalankan `npm run dev`
2. Login ke aplikasi
3. Buka **Chrome DevTools** → **Application** → **IndexedDB**
4. Cek database `paud_db` — harus terlihat 12 tabel
5. Buka tabel `profil_sekolah` — harus ada 1 baris dengan nama "TK PAUD Melati Indah"
6. Buka tabel `pengaturan` — harus ada 3 baris: `early_bird`, `metode_pembayaran`, `jenis_tagihan`
7. Buka tabel `permission` — harus ada 9 baris untuk role `admin`

## Catatan Arsitektur

> **Singleton `db`**: `import { db } from '@/db'` — dapat digunakan langsung di service layer, store Zustand, maupun komponen React (via `dexie-react-hooks`).

> **Idempotent seed**: Seeding tidak akan dijalankan ulang selama data `profil_sekolah` dengan ID `000...0001` sudah ada di IndexedDB.

> **Offline-first siap**: Semua record di-seed dengan `_sync_status: 'synced'` agar tidak masuk sync queue saat pertama kali dibuka.
