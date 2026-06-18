# Style Reference — Sistem Tagihan PAUD
**Versi:** 1.0
**Berdasarkan:** PRD v3.0 + Implementation Plan
**Tujuan:** Panduan visual untuk AI agent saat implementasi UI

> Baca dokumen ini sebelum membuat komponen apapun.
> Setiap keputusan visual harus mengacu ke sini.

---

## 1. Prinsip Visual

| Prinsip | Implementasi |
|---|---|
| **Flat** | Tidak ada gradient, shadow, blur, atau efek dekoratif |
| **Minimal** | Hanya tampilkan informasi yang dibutuhkan per layar |
| **Konsisten** | Gunakan komponen dan token yang sama di seluruh aplikasi |
| **Terbaca** | Kontras teks wajib memadai di light dan dark mode |
| **Fungsional** | Setiap elemen visual punya tujuan, tidak ada ornamen |

---

## 2. Palet Warna

### 2.1 Warna primer — Teal (c-teal)

Digunakan untuk: aksi utama (CTA button), navigasi aktif, status sukses, elemen brand.

| Stop | Hex | Penggunaan |
|---|---|---|
| 50 | `#E1F5EE` | Background badge aktif, background highlight |
| 100 | `#9FE1CB` | Border elemen aktif |
| 200 | `#5DCAA5` | Border tombol outline primer |
| 400 | `#1D9E75` | Ikon aktif, teks link |
| **600** | **`#0F6E56`** | **Background tombol primer, warna brand utama** |
| 800 | `#085041` | Teks pada background teal-50 |
| 900 | `#04342C` | Teks gelap pada background teal terang |

```tsx
// Tombol primer
<button className="bg-[#0F6E56] text-[#E1F5EE] ...">Tambah siswa</button>

// Badge aktif
<span style={{ background: '#E1F5EE', color: '#085041' }}>Aktif</span>
```

### 2.2 Warna aksen — Coral (c-coral)

Digunakan untuk: aksi destruktif (set berhenti, hapus), tagihan terlambat, peringatan kritis.

| Stop | Hex | Penggunaan |
|---|---|---|
| 50 | `#FAECE7` | Background badge/peringatan |
| 200 | `#F0997B` | Border tombol destruktif |
| **400** | **`#D85A30`** | **Aksen utama, teks tunggakan terlambat** |
| 600 | `#993C1D` | Teks pada background coral-50 |
| 800 | `#712B13` | Teks gelap pada background coral |

```tsx
// Tombol destruktif
<button style={{ background: '#FAECE7', color: '#993C1D', border: '0.5px solid #F0997B' }}>
  Set berhenti
</button>
```

### 2.3 Warna semantik — Green, Amber, Red, Gray

Gunakan hanya sesuai makna — jangan gunakan untuk dekorasi.

| Warna | Kode | Hex (fill 50 / teks 600) | Penggunaan |
|---|---|---|---|
| Green | `c-green` | `#EAF3DE` / `#3B6D11` | Status lunas, sukses |
| Amber | `c-amber` | `#FAEEDA` / `#854F0B` | Status sebagian, offline, peringatan |
| Red | `c-red` | `#FCEBEB` / `#A32D2D` | Status belum bayar, error |
| Gray | `c-gray` | `#F1EFE8` / `#5F5E5A` | Status calon, netral, arsip |
| Purple | `c-purple` | `#EEEDFE` / `#534AB7` | Jenis tagihan pendaftaran |
| Blue | `c-blue` | `#E6F1FB` / `#185FA5` | Jenis tagihan kegiatan, info |

### 2.4 Aturan penerapan warna

```
BENAR:
- Background badge: stop 50
- Teks badge: stop 800 dari ramp yang SAMA
- Tombol primer: stop 600 sebagai background, stop 50 sebagai teks
- Border elemen: stop 200 dari ramp yang sama

SALAH:
- Teks hitam (#000 atau var(--color-text-primary)) pada background berwarna
- Gradient apapun
- Kombinasi ramp berbeda dalam satu komponen
- Stop yang tidak ada dalam tabel (misal #0F7060 — tidak valid)
```

---

## 3. Tipografi

### 3.1 Skala teks

| Level | Size | Weight | Penggunaan |
|---|---|---|---|
| H1 | 22px | 500 | Judul halaman utama |
| H2 | 18px | 500 | Judul section |
| H3 | 16px | 500 | Sub-judul, judul card |
| Label form | 15px | 500 | Label field, header kolom tabel |
| Body | 14px | 400 | Konten utama |
| Secondary | 13px | 400 | Teks pendukung, caption |
| Small | 12px | 400 | Badge text, label kecil |
| Section label | 11px | 500 | Separator section (uppercase, letter-spacing 0.08em) |
| Angka metrik | 24px | 500 | Angka besar di kartu dashboard |

### 3.2 Aturan tipografi

```
WAJIB:
- Hanya dua weight: 400 (regular) dan 500 (medium)
- Tidak pernah weight 600 atau 700
- Sentence case selalu — tidak pernah Title Case atau ALL CAPS
  (kecuali section label yang menggunakan uppercase + letter-spacing)
- Line-height body text: 1.7
- Font: var(--font-sans) — Anthropic Sans

DILARANG:
- Bold (weight 700) di mana pun
- Italic untuk konten UI (hanya boleh untuk placeholder)
- Underline kecuali untuk link
- Teks di bawah 11px
```

### 3.3 Format angka

```typescript
// Rupiah — selalu format dengan Intl
const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
// Output: "Rp 300.000"

// Tanggal — format Indonesia
const formatTanggal = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
// Output: "10 Oktober 2025"

// Persentase
const formatPersen = (n: number) => `${n}%`;
```

---

## 4. Komponen

### 4.1 Badge status

Selalu gunakan pill shape (border-radius: 999px), ikon opsional.

```tsx
// Status siswa
const BadgeSiswa = ({ status }: { status: string }) => {
  const map = {
    aktif:       { bg: '#E1F5EE', color: '#085041', label: 'Aktif' },
    calon:       { bg: '#F1EFE8', color: '#444441', label: 'Calon' },
    tidak_aktif: { bg: '#FCEBEB', color: '#791F1F', label: 'Tidak aktif' },
    arsip:       { bg: '#D3D1C7', color: '#2C2C2A', label: 'Arsip' },
  };
  const s = map[status];
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 8px',
      borderRadius: '999px', fontSize: '12px', fontWeight: 500 }}>
      {s.label}
    </span>
  );
};

// Status tagihan
const BadgeTagihan = ({ status }: { status: string }) => {
  const map = {
    belum_bayar: { bg: '#FCEBEB', color: '#791F1F', label: 'Belum bayar', icon: 'ti-circle-dot' },
    sebagian:    { bg: '#FAEEDA', color: '#633806', label: 'Sebagian',    icon: 'ti-circle-half' },
    lunas:       { bg: '#EAF3DE', color: '#27500A', label: 'Lunas',       icon: 'ti-circle-check' },
  };
  const s = map[status];
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 8px',
      borderRadius: '999px', fontSize: '12px', fontWeight: 500,
      display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <i className={`ti ${s.icon}`} style={{ fontSize: '12px' }} aria-hidden="true" />
      {s.label}
    </span>
  );
};

// Jenis tagihan
const BadgeJenis = ({ jenis }: { jenis: string }) => {
  const map = {
    spp:          { bg: '#E1F5EE', color: '#085041' },
    pendaftaran:  { bg: '#EEEDFE', color: '#3C3489' },
    seragam:      { bg: '#FAEEDA', color: '#633806' },
    kegiatan:     { bg: '#E6F1FB', color: '#0C447C' },
    administrasi: { bg: '#F1EFE8', color: '#444441' },
    lainnya:      { bg: '#F1EFE8', color: '#444441' },
  };
  const s = map[jenis] ?? map.lainnya;
  const label = jenis.charAt(0).toUpperCase() + jenis.slice(1);
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 8px',
      borderRadius: '999px', fontSize: '12px', fontWeight: 500 }}>
      {label}
    </span>
  );
};
```

### 4.2 Tombol

```tsx
// Primer — aksi utama halaman
<button className="bg-[#0F6E56] text-[#E1F5EE] border-none px-4 py-2 rounded-lg
  text-sm font-medium flex items-center gap-1.5 cursor-pointer">
  <i className="ti ti-plus text-base" aria-hidden="true" />
  Tambah siswa
</button>

// Sekunder — aksi pendukung
<button className="bg-background border border-border-secondary px-4 py-2
  rounded-lg text-sm font-medium cursor-pointer">
  Edit
</button>

// Destruktif — aksi berbahaya (konfirmasi dulu sebelum eksekusi)
<button style={{ background: '#FAECE7', color: '#993C1D',
  border: '0.5px solid #F0997B', padding: '8px 16px',
  borderRadius: 'var(--border-radius-md)', fontSize: '14px', fontWeight: 500 }}>
  Set berhenti
</button>

// Outline teal — export, aksi sekunder positif
<button style={{ background: 'transparent', color: '#0F6E56',
  border: '0.5px solid #5DCAA5', padding: '6px 12px',
  borderRadius: 'var(--border-radius-md)', fontSize: '13px', fontWeight: 500 }}>
  Export PDF
</button>

// Disabled
<button disabled style={{ background: 'var(--color-background-secondary)',
  color: 'var(--color-text-tertiary)', cursor: 'not-allowed',
  border: '0.5px solid var(--color-border-tertiary)', padding: '8px 16px',
  borderRadius: 'var(--border-radius-md)' }}>
  Tidak tersedia
</button>
```

### 4.3 Kartu metrik (dashboard)

```tsx
interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  subColor?: string; // default: var(--color-text-tertiary)
}

const MetricCard = ({ label, value, sub, subColor }: MetricCardProps) => (
  <div style={{ background: 'var(--color-background-secondary)',
    borderRadius: 'var(--border-radius-md)', padding: '1rem', flex: 1, minWidth: '120px' }}>
    <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)',
      margin: '0 0 6px', fontWeight: 500 }}>{label}</p>
    <p style={{ fontSize: '22px', fontWeight: 500,
      color: 'var(--color-text-primary)', margin: 0 }}>{value}</p>
    {sub && (
      <p style={{ fontSize: '11px', color: subColor ?? 'var(--color-text-tertiary)',
        margin: '4px 0 0' }}>{sub}</p>
    )}
  </div>
);

// Penggunaan di Dashboard
<div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
  <MetricCard label="Total penerimaan bulan ini" value="Rp 12.400.000"
    sub="↑ 8% dari bulan lalu" subColor="#0F6E56" />
  <MetricCard label="Tagihan belum bayar" value="24"
    sub="5 jatuh tempo hari ini" subColor="#993C1D" />
  <MetricCard label="Siswa aktif" value="87" sub="3 kelas aktif" />
  <MetricCard label="Pending sync" value="12"
    sub="Offline" subColor="#BA7517" />
</div>
```

### 4.4 Card container

```tsx
// Card standar — wrap bounded object
<div style={{
  background: 'var(--color-background-primary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 'var(--border-radius-lg)',   // 12px
  padding: '1rem 1.25rem',
}}>
  {children}
</div>

// Card dengan header section
<div style={{ background: 'var(--color-background-primary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
  <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <p style={{ margin: 0, fontWeight: 500, fontSize: '15px' }}>Judul section</p>
    {/* aksi header */}
  </div>
  <div style={{ padding: '1rem 1.25rem' }}>
    {children}
  </div>
</div>
```

### 4.5 Avatar inisial siswa

```tsx
// Warna avatar dari nama (deterministik)
const getAvatarColor = (nama: string) => {
  const colors = [
    { bg: '#E1F5EE', color: '#085041' },  // teal
    { bg: '#EEEDFE', color: '#3C3489' },  // purple
    { bg: '#FAECE7', color: '#712B13' },  // coral
    { bg: '#E6F1FB', color: '#0C447C' },  // blue
    { bg: '#FAEEDA', color: '#633806' },  // amber
    { bg: '#EAF3DE', color: '#27500A' },  // green
  ];
  const idx = nama.charCodeAt(0) % colors.length;
  return colors[idx];
};

const getInisial = (nama: string) =>
  nama.split(' ').slice(0, 2).map(n => n[0].toUpperCase()).join('');

const Avatar = ({ nama, size = 28 }: { nama: string; size?: number }) => {
  const { bg, color } = getAvatarColor(nama);
  return (
    <div style={{ width: size, height: size, borderRadius: '50%',
      background: bg, color, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: size * 0.39, fontWeight: 500, flexShrink: 0 }}>
      {getInisial(nama)}
    </div>
  );
};
```

### 4.6 Tabel data

```tsx
// Wrapper tabel standar
<div style={{ background: 'var(--color-background-primary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
    <thead>
      <tr style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <th style={{ textAlign: 'left', padding: '10px 14px',
          fontWeight: 500, color: 'var(--color-text-secondary)', fontSize: '12px' }}>
          Nama siswa
        </th>
        {/* kolom lainnya */}
      </tr>
    </thead>
    <tbody>
      {data.map((row, i) => (
        <tr key={row.id}
          style={{ borderBottom: i < data.length - 1
            ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
          <td style={{ padding: '10px 14px' }}>{row.nama}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

// Aturan tabel:
// - Header: fontSize 12px, fontWeight 500, color text-secondary
// - Baris data: fontSize 13px, fontWeight 400, color text-primary
// - Kolom nominal (Rupiah): text-align right, fontWeight 500
// - Kolom aksi: text-align right, tombol text tanpa border
// - Border antar baris: 0.5px, bukan antar kolom
```

### 4.7 Form field

```tsx
// Label + Input standar
<div style={{ marginBottom: '12px' }}>
  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
    Nama siswa <span style={{ color: '#D85A30' }}>*</span>
  </label>
  <input type="text" placeholder="Masukkan nama lengkap"
    style={{ width: '100%', boxSizing: 'border-box' }} />
  {/* Error state */}
  {error && (
    <p style={{ fontSize: '12px', color: '#993C1D', margin: '4px 0 0',
      display: 'flex', alignItems: 'center', gap: '4px' }}>
      <i className="ti ti-alert-circle" style={{ fontSize: '12px' }} aria-hidden="true" />
      {error}
    </p>
  )}
</div>

// Grid form 2 kolom
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
  {/* field-field */}
</div>

// Info box dalam form (preview sisa tagihan, preview cicilan, dll)
<div style={{ background: 'var(--color-background-secondary)',
  borderRadius: 'var(--border-radius-md)', padding: '10px 12px',
  fontSize: '13px', display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '8px 0' }}>
  <span style={{ color: 'var(--color-text-secondary)' }}>
    Sisa tagihan: <strong style={{ color: 'var(--color-text-primary)' }}>Rp 270.000</strong>
  </span>
  <span style={{ color: 'var(--color-text-secondary)' }}>
    Setelah bayar: <strong style={{ color: '#0F6E56' }}>Lunas ✓</strong>
  </span>
</div>
```

### 4.8 Section label pemisah

```tsx
// Digunakan untuk memisahkan section dalam halaman pengaturan atau form panjang
<p style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--color-text-tertiary)',
  margin: '2rem 0 0.75rem', paddingBottom: '6px',
  borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
  Data orang tua / wali
</p>
```

### 4.9 Indikator online/offline

```tsx
// Komponen header — status koneksi + pending sync
const SyncStatus = () => {
  const { isOnline, pendingSyncCount } = useAppStore();

  if (isOnline && pendingSyncCount === 0) return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px', background: '#E1F5EE',
      borderRadius: '999px', fontSize: '12px', fontWeight: 500, color: '#085041' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%',
        background: '#0F6E56' }} />
      Online
    </div>
  );

  if (isOnline && pendingSyncCount > 0) return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px', background: '#FAEEDA',
      borderRadius: '999px', fontSize: '12px', fontWeight: 500, color: '#633806' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%',
        background: '#BA7517' }} />
      {pendingSyncCount} menunggu sync
    </div>
  );

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px', background: '#FAEEDA',
      borderRadius: '999px', fontSize: '12px', fontWeight: 500, color: '#633806' }}>
      <i className="ti ti-wifi-off" style={{ fontSize: '14px' }} aria-hidden="true" />
      Offline — {pendingSyncCount} perubahan lokal
    </div>
  );
};
```

### 4.10 Jatuh tempo terlambat

```tsx
// Teks jatuh tempo di tabel/card — merah jika terlambat
const JatuhTempo = ({ tanggal, status }: { tanggal: string; status: string }) => {
  const isLate = status !== 'lunas' && new Date(tanggal) < new Date();
  const selisihHari = isLate
    ? Math.floor((Date.now() - new Date(tanggal).getTime()) / 86400000)
    : 0;

  return (
    <span style={{ fontSize: '12px',
      color: isLate ? '#993C1D' : 'var(--color-text-secondary)' }}>
      {formatTanggal(tanggal)}
      {isLate && ` — Terlambat ${selisihHari} hari`}
    </span>
  );
};
```

---

## 5. Layout & Spacing

### 5.1 Spacing scale

| Token | Value | Penggunaan |
|---|---|---|
| 4px | `gap-1` | Jarak dalam komponen kecil (ikon + teks badge) |
| 6px | — | Jarak badge item |
| 8px | `gap-2` | Jarak antar elemen inline |
| 12px | `gap-3` | Gap grid kartu, jarak field form |
| 16px | `gap-4` | Padding konten dalam card |
| 20px | — | Padding horizontal card (1.25rem) |
| 24px | `gap-6` | Jarak antar section |
| 32px | — | Margin section besar |

### 5.2 Border radius

| Token | Value | Penggunaan |
|---|---|---|
| `var(--border-radius-md)` | 8px | Tombol, input, badge persegi, metric card |
| `var(--border-radius-lg)` | 12px | Card, container utama, dialog |
| `var(--border-radius-xl)` | 16px | Modal besar |
| `999px` | — | Badge pill, status chip, avatar |

### 5.3 Border

Selalu gunakan `0.5px solid` — tidak pernah `1px`:

```css
/* Default border */
border: 0.5px solid var(--color-border-tertiary);

/* Hover / emphasis */
border: 0.5px solid var(--color-border-secondary);

/* Featured item (satu-satunya pengecualian ke 2px) */
border: 2px solid var(--color-border-info);
```

### 5.4 Grid layout halaman

```tsx
// Layout 2 kolom konten
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

// Grid metric cards (4 kolom di desktop, 2 di mobile)
<div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
  {/* setiap MetricCard punya flex:1 minWidth:120px */}

// Grid form 2 kolom
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

// List section vertikal dengan divider
<div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
```

### 5.5 AppShell layout

```
┌──────────────────────────────────────────────────────┐
│  Header: [Logo+NamaSekolah] [judul halaman] [sync] [avatar] │
├─────────┬────────────────────────────────────────────┤
│         │                                            │
│ Sidebar │  Konten halaman (<Outlet />)               │
│ 240px   │                                            │
│         │  padding: 1.5rem                           │
│         │  max-width: 100%                           │
│         │                                            │
└─────────┴────────────────────────────────────────────┘

Sidebar collapsed di < 768px → hamburger menu
```

---

## 6. Ikon

Gunakan **Tabler Icons outline** — class `ti ti-[name]`.
Tidak pernah menggambar path SVG manual untuk ikon.

| Konteks | Ikon | Class |
|---|---|---|
| Tambah data | plus | `ti-plus` |
| Edit | edit | `ti-edit` |
| Hapus / berhenti | trash | `ti-trash` |
| Siswa berhenti | user-x | `ti-user-x` |
| Siswa baru | user-plus | `ti-user-plus` |
| Kelas | school | `ti-school` |
| Tagihan | receipt | `ti-receipt` |
| Pembayaran | cash | `ti-cash` |
| Generate SPP | refresh | `ti-refresh` |
| Laporan | chart-bar | `ti-chart-bar` |
| Pengaturan | settings | `ti-settings` |
| Export PDF | file-export | `ti-file-export` |
| Export Excel | table-export | `ti-table-export` |
| Cetak kuitansi | printer | `ti-printer` |
| Lunas | circle-check | `ti-circle-check` |
| Belum bayar | circle-dot | `ti-circle-dot` |
| Sebagian | circle-half | `ti-circle-half` |
| Terlambat | alert-circle | `ti-alert-circle` |
| Online | wifi | `ti-wifi` |
| Offline | wifi-off | `ti-wifi-off` |
| Sync | refresh | `ti-refresh` |
| Kembali | arrow-left | `ti-arrow-left` |
| Lanjut / detail | arrow-right | `ti-arrow-right` |
| Pencarian | search | `ti-search` |
| Filter | filter | `ti-filter` |
| Kalender | calendar | `ti-calendar` |
| Early bird | clock | `ti-clock` |
| Diskon | discount | `ti-discount` |

**Ukuran ikon:**
- Inline dalam teks: `font-size: 14px`, `vertical-align: -2px`
- Dalam tombol: `font-size: 16px`
- Standalone dekoratif: `font-size: 20px` max
- Semua ikon dekoratif wajib `aria-hidden="true"`

---

## 7. Pola Wajib

### 7.1 Halaman dengan tabel data

```
[Judul halaman H1]
[Filter bar: search | dropdown kelas | dropdown status | tombol tambah]
[Tabel data]
  - Header kolom 12px/500/text-secondary
  - Baris data 13px/400/text-primary
  - Kolom Rupiah: text-align right, fontWeight 500
  - Kolom aksi: text-align right, tombol text teal
[Pagination jika perlu]
```

### 7.2 Halaman form

```
[Judul halaman H1]
[Card container]
  [Section label] — pemisah antar kelompok field
  [Grid form 2 kolom atau 1 kolom tergantung field]
  [Info box preview jika ada kalkulasi real-time]
  [Tombol submit primer + tombol batal sekunder]
```

### 7.3 Detail siswa (halaman dengan tab)

```
[Header: avatar | nama | badge status | kelas | badge diskon]
[Tab navigation: Profil | Tagihan | Riwayat Pembayaran]
[Konten tab aktif]
[Tombol aksi kontekstual di header atau atas tab]
```

### 7.4 Dialog / Drawer konfirmasi

```
[Judul dialog — deskripsi singkat aksi]
[Konten: data yang relevan, pilihan jika ada]
[Info box ringkasan aksi]
[Tombol konfirmasi (primer) | Tombol batal (sekunder)]
— konfirmasi destruktif pakai tombol coral
— konfirmasi normal pakai tombol teal
```

---

## 8. Dark Mode

Semua warna harus tetap terbaca di dark mode.

```tsx
// BENAR — gunakan CSS variables
color: 'var(--color-text-primary)'      // hitam di light, putih di dark
color: 'var(--color-text-secondary)'    // abu medium
background: 'var(--color-background-secondary)'  // surface abu terang di light, gelap di dark

// SALAH — hardcode warna yang tidak invert di dark mode
color: '#333333'  // tidak terlihat di dark mode
background: '#f9f9f9'  // tidak adapt ke dark mode

// Untuk warna ramp yang bernilai tetap (badge, tombol):
// stop 50 sebagai background → tetap terang di dark mode ✓
// stop 800 sebagai teks → tetap gelap ✓
// Kombinasi ini bekerja di keduanya
```

---

## 9. Checklist Komponen Baru

Sebelum menyelesaikan komponen, pastikan:

- [ ] Semua warna menggunakan CSS variables atau stop dari palet resmi
- [ ] Tidak ada hardcode hex kecuali dari tabel palet di dokumen ini
- [ ] Teks di atas background berwarna menggunakan stop 800 dari ramp yang sama
- [ ] Font weight hanya 400 atau 500
- [ ] Tidak ada gradient, shadow, atau blur
- [ ] Border width 0.5px (kecuali featured: 2px)
- [ ] Ikon dari Tabler outline dengan `aria-hidden="true"`
- [ ] Angka Rupiah diformat dengan `Intl.NumberFormat`
- [ ] Tanggal diformat dengan `toLocaleDateString('id-ID', ...)`
- [ ] Dark mode: tidak ada hardcode warna yang tidak adapt
- [ ] Tidak ada teks di bawah 11px

---

*Dokumen ini adalah referensi tunggal untuk semua keputusan visual.
Jika ada ambiguitas, utamakan: fungsional > konsisten > estetis.*