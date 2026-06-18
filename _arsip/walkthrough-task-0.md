# Walkthrough - FASE 4 Task 0: Fondasi UI dan Read Layer

## Tujuan

Menyiapkan fondasi agar setiap halaman berikutnya bisa:

1. membaca data live dari IndexedDB
2. menulis hanya lewat service layer
3. memakai util dan komponen UI yang konsisten

Task ini sengaja tidak membangun halaman modul penuh. Fokusnya hanya infrastruktur UI dasar.

## File Baru

### `src/lib/actor.ts`

Menambahkan helper `getCurrentActor(user)` untuk mengubah session auth menjadi `ServiceActor` yang siap dipakai oleh service layer.

### `src/lib/format.ts`

Menambahkan formatter bersama:

1. `formatRupiah`
2. `formatTanggal`
3. `formatShortDate`
4. `formatMonthYear`

Formatter ini dipakai lintas halaman agar tampilan angka dan tanggal konsisten.

### `src/components/ui/PageHeader.tsx`

Komponen header halaman dengan:

1. judul
2. deskripsi opsional
3. area action opsional

### `src/components/ui/SectionCard.tsx`

Wrapper section berbasis style glass yang sudah dipakai di repo, untuk menjaga konsistensi antar halaman.

### `src/components/ui/EmptyState.tsx`

Komponen empty state reusable dengan:

1. title
2. description
3. action opsional

### `src/components/ui/FormField.tsx`

Wrapper field form dengan:

1. label
2. hint
3. error

### `src/components/ui/StatusBadgeSiswa.tsx`

Badge status siswa untuk nilai:

1. `calon`
2. `aktif`
3. `tidak_aktif`
4. `arsip`

### `src/components/ui/StatusBadgeTagihan.tsx`

Badge status tagihan untuk nilai:

1. `belum_bayar`
2. `sebagian`
3. `lunas`

### `src/components/ui/JenisTagihanBadge.tsx`

Badge reusable untuk menampilkan jenis tagihan seperti `spp`, `pendaftaran`, `seragam`, dan fallback umum.

### `src/queries/tahunAjaranQueries.ts`

Read helper `listTahunAjaran()` untuk membaca daftar tahun ajaran aktif dari IndexedDB.

### `src/queries/kelasQueries.ts`

Read helper `listActiveKelas()` untuk membaca kelas non-soft-delete beserta jumlah siswa aktifnya.

### `src/queries/siswaQueries.ts`

Menambahkan:

1. `listSiswaWithFilters()`
2. `getSiswaDetail()`

Read model ini menggabungkan data dari:

1. `siswa`
2. `siswa_kelas`
3. `kelas`
4. `tagihan`
5. `pembayaran`

### `src/queries/tagihanQueries.ts`

Read helper `listTagihanWithFilters()` untuk daftar tagihan lintas siswa dengan join ke siswa dan kelas aktif.

### `src/queries/pembayaranQueries.ts`

Read helper `listPembayaranWithFilters()` untuk daftar pembayaran yang sudah diperkaya dengan data siswa dan tagihan.

### `src/queries/pengaturanQueries.ts`

Read helper generic `getPengaturanByKunci()` untuk membaca setting JSON dari tabel `pengaturan`.

### `src/queries/dashboardQueries.ts`

Read helper `getDashboardSummary()` untuk menyiapkan:

1. jumlah siswa aktif
2. total tunggakan
3. total pembayaran
4. jumlah pending sync
5. recent payments

Task dashboard penuh belum dikerjakan di task ini, tapi query dasarnya sudah siap.

## File Yang Diubah

### `src/store/authStore.ts`

Perubahan:

1. menghapus `pendingSyncCount` dari Zustand store
2. menghapus method manual increment/decrement/clear untuk pending sync

Alasan:

`pendingSyncCount` sekarang harus dibaca langsung dari IndexedDB, bukan disimpan sebagai angka manual di state.

### `src/layouts/AppShell.tsx`

Perubahan:

1. menambahkan `useLiveQuery`
2. membaca `db.sync_queue.count()` secara live untuk badge pending sync
3. membaca `profil_sekolah` secara live untuk judul sekolah di header

Hasil:

1. badge sync sekarang benar-benar berasal dari IndexedDB
2. nama sekolah di header tidak lagi hardcoded penuh

### `src/App.tsx`

Menambahkan route dasar untuk task-task berikutnya:

1. `/siswa/new`
2. `/siswa/:id`
3. `/siswa/:id/edit`
4. `/pembayaran/new`

Saat ini route tersebut masih mengarah ke placeholder page, karena halaman modulnya akan dikerjakan satu per satu pada task selanjutnya.

## Boundary Yang Sudah Tercapai

Setelah Task 0:

1. read helper sudah tersedia di `src/queries/*`
2. shared UI primitives dasar sudah tersedia di `src/components/ui/*`
3. pending sync sudah benar-benar live dari IndexedDB
4. route dasar halaman detail dan form sudah tersedia

Ini menjadi pondasi untuk Task 1 dan seterusnya tanpa perlu mengulang util yang sama.

## Hal Yang Sengaja Belum Dikerjakan

Task 0 tidak mengerjakan:

1. halaman Tahun Ajaran
2. halaman Siswa
3. halaman Tagihan
4. halaman Pembayaran
5. halaman Dashboard live penuh

Semua itu tetap ditunda ke task masing-masing agar sesuai instruksi `satu task satu halaman`.

## Hasil Verifikasi

Perintah:

```bash
npm run build
```

Hasil:

```text
vite v8.0.14 building client environment for production...
✓ built in 4.28s
```

Tidak ada error TypeScript.

## Status Task

Task 0 selesai dan bersih.

Task berikutnya yang siap dikerjakan: `Task 1 - Halaman Tahun Ajaran`.
