# Walkthrough - FASE 3: Service Layer (Business Logic)

## Tujuan

Memindahkan aturan bisnis dari UI/store ke service layer agar seluruh aksi domain berjalan konsisten, bisa dipanggil ulang dari halaman mana pun, dan selaras dengan PRD `agents.md`.

## File Baru

### `src/services/service-errors.ts`

Error domain terstruktur untuk dipakai lintas service:

- `ServiceError`
- `ValidationError`
- `NotFoundError`
- `PermissionDeniedError`
- `AuthenticationError`

### `src/services/service-helpers.ts`

Helper shared untuk service layer:

- `nowIso()`, `todayDate()`, `newId()`
- `toPendingInsert()`, `toPendingUpdate()`
- `enqueueSync()` untuk menulis ke `sync_queue`
- `calculateTagihanStatus()`
- helper lookup aktif seperti `getActiveSiswaKelasBySiswaId()`
- helper format nama SPP `formatSppName()`

### `src/services/permissionService.ts`

Guard permission berbasis tabel `permission`:

- `canAccess(role, modul, aksi)`
- `assertCanAccess(role, modul, aksi)`

Ini menjadi fondasi BR-18 agar pengecekan akses hidup di service layer, bukan di komponen.

### `src/services/authService.ts`

Service autentikasi lokal sementara:

- `loginWithPassword(email, password)`

Perubahan penting:

- login sekarang membaca akun dari IndexedDB
- akun `aktif = false` ditolak login
- password masih mock `admin123` sampai fase Supabase Auth

Ini menutup BR-15 di auth/service boundary.

### `src/services/tahunAjaranService.ts`

Service untuk aturan bisnis tahun ajaran:

- `createTahunAjaran()`
- `updateTahunAjaran()`
- `activateTahunAjaran()`

Aturan yang ditangani:

- validasi periode `selesai > mulai`
- hanya satu `tahun_ajaran.aktif = true` pada satu waktu
- semua perubahan ditulis sebagai record pending dan masuk `sync_queue`

Ini menutup BR-01.

### `src/services/siswaService.ts`

Service pendaftaran dan edit siswa:

- `registerSiswa()`
- `updateSiswa()`

Aturan yang ditangani pada `registerSiswa()`:

- baca pengaturan `early_bird`
- diskon hanya aktif jika periode valid
- siswa `pindahan` dipaksa tanpa diskon
- siswa baru selalu dibuat dengan status `calon`
- tagihan pendaftaran otomatis dibuat
- jika `pindahan`, otomatis buat `siswa_kelas`
- semua insert masuk `sync_queue`

Ini menutup BR-06 dan BR-07.

### `src/services/tagihanService.ts`

Service domain tagihan:

- `generateSppBulanan()`
- `createManualTagihan()`
- `deleteTagihan()`

Aturan pada `generateSppBulanan()`:

- hanya siswa `aktif` yang ikut generate
- siswa `tidak_aktif` dan `arsip` otomatis tidak ikut
- tidak membuat duplikat SPP untuk kombinasi `siswa_id + bulan_tahun`
- diskon SPP diterapkan jika `flag_diskon_spp = true`
- siswa pindahan hanya ikut mulai bulan masuk

Aturan pada `deleteTagihan()`:

- tagihan dengan `sudah_dibayar > 0` ditolak hapus
- hapus dilakukan sebagai soft delete

Ini menutup BR-03, BR-04, BR-05, BR-08, BR-10, BR-14.

### `src/services/pembayaranService.ts`

Service pencatatan pembayaran:

- `recordPembayaran()`

Aturan yang ditangani:

- jumlah bayar wajib `> 0`
- jumlah bayar tidak boleh melebihi sisa tagihan
- `dicatat_oleh` selalu diisi dari actor yang login
- `sudah_dibayar` dan `status` tagihan dihitung ulang setiap pembayaran
- jika tagihan pendaftaran lunas dan semua tagihan pendaftaran siswa lunas, status siswa berubah dari `calon` ke `aktif`
- semua write masuk `sync_queue`

Ini menutup BR-02, BR-09, BR-12, BR-13.

## File yang Diubah

### `src/store/authStore.ts`

Store auth tidak lagi memuat aturan login. Sekarang store hanya:

- memanggil `loginWithPassword()` dari `authService`
- menyimpan session ke `localStorage`
- mempertahankan state UI auth

Dengan ini logic login tidak lagi hidup di store/UI.

## Boundary Arsitektur Baru

Sebelum:

`UI / Zustand -> logic campuran -> Dexie`

Sesudah:

`UI / Zustand -> service layer -> Dexie`

Prinsip yang dipakai:

- komponen UI hanya kirim input dan tampilkan hasil/error
- store hanya pegang state UI/session
- service memegang aturan bisnis, transaksi multi-tabel, dan enqueue sync

## Mapping BR ke Implementasi

| BR | Status | Lokasi |
|---|---|---|
| BR-01 | Selesai | `tahunAjaranService.ts` |
| BR-02 | Selesai | `pembayaranService.ts` |
| BR-03 | Selesai | `tagihanService.ts` |
| BR-04 | Selesai | `tagihanService.ts` |
| BR-05 | Selesai | `tagihanService.ts` |
| BR-06 | Selesai | `siswaService.ts` |
| BR-07 | Selesai | `siswaService.ts` |
| BR-08 | Selesai | `tagihanService.ts` |
| BR-09 | Selesai | `pembayaranService.ts` |
| BR-10 | Selesai | `tagihanService.ts` |
| BR-11 | Tetap di repository/data policy | Soft delete dipakai pada service write |
| BR-12 | Selesai | `pembayaranService.ts` |
| BR-13 | Selesai | `pembayaranService.ts` |
| BR-14 | Selesai | `tagihanService.ts` |
| BR-15 | Selesai | `authService.ts` |
| BR-16 | Selesai | `service-helpers.ts` |
| BR-17 | Belum fase ini | PDF generator belum dibuat |
| BR-18 | Selesai | `permissionService.ts` + seluruh service aksi |

## Hasil Verifikasi

Perintah:

```bash
npm run build
```

Hasil:

```text
vite v8.0.14 building client environment for production...
✓ built in 3.29s
```

Tidak ada error TypeScript.

## Cara Pakai di Fase Berikutnya

Contoh pemanggilan dari UI:

```ts
await registerSiswa(actor, input);
await generateSppBulanan(actor, { bulan_tahun: '2026-06', jatuh_tempo: '2026-06-10' });
await recordPembayaran(actor, { tagihan_id, jumlah, metode, tanggal });
```

Komponen tidak perlu lagi menghitung diskon, status tagihan, atau validasi domain lintas tabel.
