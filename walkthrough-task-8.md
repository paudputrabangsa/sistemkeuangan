# Walkthrough - FASE 4 Task 8: Refactor Dashboard Live Data

## Tujuan

Menghapus data mock hardcoded dari dashboard dan menggantinya dengan data live dari IndexedDB.

Task ini hanya mengerjakan halaman Dashboard.

## File Baru

### `src/pages/Dashboard.tsx`

Halaman dashboard ditulis ulang agar:

1. membaca summary live dari IndexedDB
2. membaca pembayaran terbaru live dari IndexedDB
3. menampilkan pending sync dari IndexedDB
4. memastikan tombol quick action benar-benar menavigasi

## File Yang Diubah

### `src/queries/dashboardQueries.ts`

Query dashboard diperluas agar tidak hanya mengembalikan angka kasar, tetapi juga data join yang dibutuhkan UI.

Tambahan yang dihitung:

1. `activeYear`
2. `calonStudents`
3. `unpaidStudents`
4. `recentPayments` dengan join ke siswa, tagihan, dan kelas aktif

## Read Path

Dashboard membaca data hanya dari IndexedDB melalui:

1. `useLiveQuery(() => getDashboardSummary())`

Query ini sekarang menggabungkan data dari:

1. `siswa`
2. `tagihan`
3. `pembayaran`
4. `sync_queue`
5. `kelas`
6. `siswa_kelas`
7. `tahun_ajaran`

## Data Yang Sekarang Live

### Kartu metrik

Metrik yang dibaca live:

1. jumlah siswa aktif
2. jumlah calon pendaftar
3. total pembayaran tercatat
4. total tunggakan
5. jumlah siswa yang masih punya sisa tagihan
6. jumlah pending sync

### Banner tahun ajaran

Badge banner sekarang membaca:

1. `tahun_ajaran` aktif dari IndexedDB

Jika belum ada yang aktif, dashboard menampilkan fallback yang sesuai.

### Pembayaran terkini

Tabel pembayaran terkini sekarang tidak lagi memakai array mock.

Tabel membaca:

1. nama siswa
2. kelas aktif siswa
3. nama tagihan
4. nominal pembayaran
5. metode pembayaran
6. tanggal pembayaran

semua dari IndexedDB.

### Sync card

Bagian sinkronisasi sekarang membaca jumlah pending sync real dari summary query, bukan angka dummy.

## Button Yang Sudah Berfungsi

1. `Lihat Semua` -> `/pembayaran`
2. quick action `Daftar Siswa` -> `/siswa`
3. quick action `Catat Bayar` -> `/pembayaran`

Tidak ada button pajangan tanpa aksi.

## Konsistensi Style

Dashboard tetap mengikuti style repo yang sudah ada:

1. banner hero gradient
2. glass card
3. icon card konsisten
4. tabel pembayaran terbaru tetap memakai struktur visual lama, hanya sumber datanya yang diganti

## Hasil Verifikasi

Perintah:

```bash
npm run build
```

Hasil:

```text
vite v8.0.14 building client environment for production...
✓ built in 3.28s
```

Tidak ada error TypeScript.

## Skenario Manual Yang Perlu Dicek

1. buka `/`
2. cek kartu metrik tidak lagi menampilkan angka mock lama
3. cek badge tahun ajaran aktif
4. cek tabel pembayaran terbaru berubah setelah ada pembayaran baru
5. klik `Lihat Semua`
6. klik quick action `Daftar Siswa`
7. klik quick action `Catat Bayar`

## Status Task

Task 8 selesai dan build bersih.

Sisa task pada plan masuk kategori blocked karena service layer untuk halaman-halaman tersebut belum tersedia.
