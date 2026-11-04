# GIS Tata Ruang — Portal Peta & Panel Admin

Implementasi MVP dari **PRD Website GIS Tata Ruang**: satu platform web dengan portal peta publik (hanya lihat, cari, ukur, cetak, unduh) dan panel admin (unggah, validasi, gambar, edit, tinjau, terbitkan, analisis). Data spasial disimpan di **PostgreSQL + PostGIS**.

Demo menggunakan data contoh Kota Bandung. Ini proyek pembelajaran, bukan sistem resmi instansi.

---

## 1. Fitur yang tersedia

| ID | Fitur | Status |
| --- | --- | --- |
| F-01 | Peta interaktif MapLibre, zoom/geser, basemap jalan/satelit/terang | ✅ |
| F-02 | Daftar layer, toggle, transparansi, legenda, filter | ✅ |
| F-03 | Popup/panel atribut saat fitur diklik | ✅ |
| F-04 | Cek lokasi: klik titik, tampilkan zona, kode, aturan (server-side PostGIS) | ✅ |
| F-05 | Pencarian alamat (Nominatim), nama tempat, dan koordinat | ✅ |
| F-06 | Ukur jarak dan luas, cetak peta (browser print/PDF) + gambar | ✅ |
| F-07 | Bagikan tautan dengan posisi, basemap, dan layer aktif | ✅ |
| F-08 | Login, peran editor/admin, reset kata sandi | ✅ |
| F-09 | Unggah GeoJSON, Shapefile `.zip`, KML, CSV koordinat + pratinjau | ✅ |
| F-10 | Validasi geometri, CRS, koordinat, atribut, ID duplikat | ✅ |
| F-11 | Gambar titik/garis/poligon dengan Terra Draw, edit atribut | ✅ |
| F-12 | Gaya layer (warna, opasitas, klasifikasi), urutan lewat panel, metadata | ✅ |
| F-13 | Alur draf → diajukan → terbit/arsip dengan tinjauan admin | ✅ |
| F-14 | Riwayat versi, perbandingan, dan pemulihan versi | ✅ |
| F-15 | Buffer, overlay intersect, pencarian radius | ✅ |
| F-16 | Statistik per kategori dan per wilayah | ✅ |
| F-17 | Dashboard ringkas, grafik, aktivitas terbaru | ✅ |
| F-18 | Ekspor layer (GeoJSON/CSV), laporan layer & analisis (PDF) | ✅ |
| F-19 | Log aktivitas / audit trail | ✅ |
| F-20 | WMS/WFS OGC | ⏳ backlog (arsitektur siap ditambah GeoServer) |
| F-21 | Antarmuka ID/EN untuk portal publik | ✅ (panel admin berbahasa Indonesia) |

Tambahan: atribut sensitif dapat disembunyikan per kolom dari publik (tile, ekspor, dan cek lokasi memfilter kolom tersebut).

---

## 2. Arsitektur

```
┌──────────────────────┐        ┌───────────────────────────┐
│  Web (React + Vite)  │  /api  │  API (Fastify + TS)       │
│  MapLibre GL JS      │ ─────► │  JWT, RBAC, validasi,     │
│  Terra Draw, Turf    │        │  impor, analisis, PDF     │
└──────────┬───────────┘        └────────────┬──────────────┘
           │ vector tiles (MVT)              │ SQL
           └─────────────────────────────────┼────────────┐
                                             ▼            ▼
                                  ┌────────────────────────────┐
                                  │ PostgreSQL 16 + PostGIS     │
                                  │ fitur, layer, versi, audit  │
                                  └────────────────────────────┘
```

- **Frontend:** React 18 + TypeScript + Vite, MapLibre GL JS, Terra Draw (editor), Turf.js (ukur), Recharts (dashboard).
- **Backend:** Fastify 5 + TypeScript, `pg`, Zod, JWT, scrypt.
- **Impor:** `shpjs` (Shapefile), `@tmcw/togeojson` + `xmldom` (KML), `csv-parse`, `proj4` (reproyeksi).
- **Laporan:** PDFKit.
- **Vector tiles:** endpoint API `GET /api/tiles/:layerId/:z/:x/:y` memakai `ST_AsMVT`/`ST_AsMVTGeom` langsung dari PostGIS. Ini memenuhi kebutuhan vector tiles tanpa server tile terpisah; Martin/pg_tileserv dapat ditambahkan di depan view `published_features` bila dibutuhkan.
- **Basemap:** OpenStreetMap dan Esri (tanpa API key). Pencarian memakai Nominatim.

### Struktur repo

```
apps/api                 API Fastify + seed + tes
  src/routes             auth, users, public, layers, tiles, import, analysis, dashboard, audit
  src/services           validasi, CRS, impor, fitur, versi, statistik, laporan
  tests                  unit test Vitest
apps/web                 React + Vite
  src/pages              portal publik, auth, admin
  src/components          MapView, panel publik, UI
db/init/001_schema.sql   skema + ekstensi PostGIS
scripts/                 backup PowerShell/bash
docker-compose.yml       PostGIS (+ API/web dengan profil full)
```

---

## 3. Menjalankan di lokal

Prasyarat: **Node.js 20+**, **Docker Desktop** (dengan daemon berjalan), npm 9+.

```bash
# 1. Dependensi
npm install

# 2. Konfigurasi
cp .env.example .env          # Windows: copy .env.example .env

# 3. Basis data PostGIS (port host 5433 agar tidak bentrok dengan PostgreSQL lokal)
npm run db:up

# 4. Data contoh (8 layer, 2 pengguna, statistik kunjungan)
npm run seed

# 5. Jalankan API + web
npm run dev
```

Buka:

- Portal publik: <http://localhost:5173>
- API health: <http://localhost:4000/api/health>
- Panel admin: <http://localhost:5173/login>

**Akun demo**

| Peran | Email | Kata sandi |
| --- | --- | --- |
| Admin / Approver | `admin@tataruang.go.id` | `Admin123!` |
| Editor | `editor@tataruang.go.id` | `Editor123!` |

Ganti `JWT_SECRET` di `.env` sebelum dipakai di luar laptop. Untuk mengisi ulang data contoh: `npm run seed -- --force` (menghapus layer, analisis, audit, statistik; pengguna dipertahankan).

---

## 4. Perintah penting

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | API (4000) + Vite (5173) bersamaan |
| `npm run dev:api` / `npm run dev:web` | Jalankan salah satu |
| `npm run typecheck` | TypeScript API + web |
| `npm test` | Unit test API (Vitest) |
| `npm run build` | Build produksi web (`apps/web/dist`) |
| `npm run db:up` / `db:down` | Nyalakan/hentikan PostGIS |
| `npm run db:reset` | Hapus volume DB lalu buat ulang skema |
| `npm run db:backup` | Backup `pg_dump` ke `backups/` (PowerShell) |
| `npm run seed -- --force` | Isi ulang data contoh |

### Backup & restore

```powershell
npm run db:backup
# atau
.\scripts\backup.ps1

# Restore (hentikan API terlebih dahulu)
docker exec -i gis-tataruang-db pg_restore -U gis -d gis_tataruang --clean --if-exists < backups\gis_YYYYMMDD-HHMMSS.dump
```

Linux/macOS: `./scripts/backup.sh`. Jadwalkan lewat Task Scheduler/cron dan simpan hasil di penyimpanan terpisah.

---

## 5. Alur kerja data

1. **Editor** masuk → *Unggah Layer*.
2. Pilih berkas (GeoJSON/Shapefile zip/KML/CSV), tentukan CRS sumber, unggah.
3. Sistem mem-parsing, mereproyeksikan ke EPSG:4326, lalu memvalidasi (geometri, ring, self-intersection, koordinat, atribut, ID duplikat).
4. Editor memetakan label atribut, menyembunyikan kolom sensitif, mengatur gaya/klasifikasi, lalu menyimpan sebagai **draf**.
5. Di **Editor Layer**, editor menggambar/mengubah geometri (Terra Draw), mengedit tabel atribut, gaya, dan metadata. Setiap simpan menciptakan **versi baru**.
6. Editor menekan **Ajukan**. Status menjadi **diajukan**.
7. **Admin** membuka *Tinjauan*, melihat validasi, perbandingan versi (fitur ditambah/dihapus/diubah), lalu **Setujui & terbitkan** atau **Tolak dengan catatan**.
8. Layer terbit langsung muncul di portal publik (vector tiles). Admin dapat mengarsipkan atau memulihkan versi lama.

Status: `draft → submitted → published → archived`; penolakan mengembalikan ke `draft` dengan `rejection_note`.

---

## 6. API ringkas

Semua endpoint admin memerlukan `Authorization: Bearer <token>`.

**Publik**

- `GET /api/public/layers` — layer terbit + gaya, legenda, bbox, jumlah fitur
- `GET /api/public/layers/:id/geojson` · `GET /api/public/layers/:id/export?format=geojson|csv`
- `POST /api/public/check-location` `{lat, lon}` — zona yang melingkupi titik
- `GET /api/public/search?q=` — koordinat atau Nominatim
- `GET /api/public/reverse?lat=&lon=`
- `POST /api/public/visit`
- `GET /api/tiles/:layerId/:z/:x/:y` — MVT (hanya layer terbit)

**Auth**

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/change-password`

**Layer (login)**

- `GET /api/layers`, `GET /api/layers/:id`, `PATCH /api/layers/:id`, `PUT /api/layers/:id/style`
- `GET|PUT /api/layers/:id/features`, `POST /api/layers/:id/validate`
- `POST /api/layers/:id/submit`, `/approve` (admin), `/reject` (admin), `/publish` (admin), `/archive` (admin)
- `GET /api/layers/:id/versions`, `GET /api/layers/:id/versions/:version`, `POST /api/layers/:id/restore`
- `POST /api/layers/:id/reorder` `{direction: "up" | "down"}` (admin)
- `GET /api/layers/:id/compare` (admin), `GET /api/layers/:id/export`, `GET /api/layers/:id/report.pdf`

**Impor**

- `POST /api/import/preview` (multipart `file`, field `sourceCrs`)
- `POST /api/import/commit` `{importId, layer: {...}}`

**Analisis**

- `POST /api/analysis/buffer|intersect|radius|statistics`
- `GET /api/analysis`, `GET /api/analysis/:id`, `GET /api/analysis/:id/report.pdf`, `POST /api/analysis/:id/save-as-layer`

**Admin**

- `GET /api/dashboard`, `GET /api/audit-logs`, `GET|POST /api/users`, `PATCH /api/users/:id`

---

## 7. Keamanan & operasional

- JWT Bearer + hash kata sandi `scrypt` (salt per pengguna).
- Otorisasi per peran; editor hanya dapat mengubah layer miliknya yang belum terbit; admin dapat menerbitkan dan mengelola pengguna.
- Layer draf/diajukan **tidak pernah** disajikan tile atau endpoint publik; semua query publik memfilter `status = 'published'`.
- Kolom sensitif (`hidden_attributes`) difilter di tiga jalur: MVT, cek lokasi, dan ekspor publik.
- Seluruh query memakai parameter PostgreSQL; input divalidasi Zod; React meng-escape atribut dan template cetak memakai `escapeHtml`.
- Rate limit API (global 300/menit; pencarian 30/menit; login 10/menit; tile 6000/menit), Helmet headers, CORS terbatas.
- `POST /api/public/visit` dipanggil sekali per sesi; statistik harian disimpan di `site_stats`.
- Log audit mencatat login, impor, perubahan fitur/gaya/metadata, pengajuan, penerbitan, penolakan, arsip, pemulihan versi, dan pengelolaan pengguna.

**Batasan MVP yang disengaja**

- Analisis/ekspor memuat data ke memori; untuk ratusan ribu fitur gunakan worker/streaming dan Martin di depan `published_features`.
- Editor Terra Draw memuat fitur satu layer sekaligus; layer sangat besar sebaiknya diedit per wilayah.
- Simbol titik memakai lingkaran berwarna (warna, radius, garis tepi) dan klasifikasi warna; pustaka ikon piktogram khusus belum disertakan.
- Format dukungan: GeoJSON, Shapefile `.zip`, KML, CSV lat/lon. KMZ, DWG, dan DGN-95 belum didukung; CRS umum WGS84/Web Mercator/UTM zona 46S–54S.
- Tidak ada email transaksional; token reset ditampilkan di respons API saat `EXPOSE_RESET_TOKEN=true` (lokal). Set `false` di produksi dan sambungkan penyedia email.
- Pencarian alamat bergantung pada Nominatim publik; jika tidak dapat dihubungi, pencarian koordinat tetap berfungsi.

---

## 8. Deployment Docker (profil penuh)

```bash
# Set JWT_SECRET yang kuat di .env terlebih dahulu
docker compose --profile full up -d --build
```

- Web: <http://localhost:8080>
- API: <http://localhost:4000>
- Database host: `localhost:5433`
- Upload disimpan di volume `uploads`; data DB di volume `pgdata`.

Seed di container: `docker compose exec api npx tsx src/seed.ts`.

---

## 9. Pengujian

```bash
npm test               # Vitest: validasi geometri, CRS, impor CSV/GeoJSON/KML, kata sandi, diff versi
npm run typecheck      # tsc --noEmit untuk API dan web
npm run build          # build produksi frontend
```

Tes API yang membutuhkan database (integrasi) sengaja dipisah agar unit test dapat berjalan tanpa PostGIS. Uji end-to-end manual: login admin → tinjau layer contoh → setujui; login sebagai admin/editor → unggah berkas dari folder `samples/` → ajukan.

---

## 10. Troubleshooting

| Gejala | Solusi |
| --- | --- |
| `ECONNREFUSED 5433` | Docker Desktop belum berjalan atau container DB mati: `npm run db:up`, cek `docker ps` |
| Port 5433 dipakai | Ubah mapping di `docker-compose.yml` dan `DATABASE_URL` |
| Peta kosong | Cek `/api/health`, pastikan layer berstatus terbit, periksa konsol browser |
| Tile 404 | Layer belum terbit atau diarsipkan; tile sengaja tidak tersedia |
| Basemap tidak muncul | Jaringan memblokir tile OSM/Esri; coba basemap lain |
| Pencarian alamat gagal | Nominatim tidak dapat dihubungi; gunakan pencarian koordinat `lat, lon` |
| Reset password | Pada mode lokal token ditampilkan di halaman lupa kata sandi; di produksi sambungkan email |

---

Dibangun dari PRD `PRD Website GIS Tata Ruang.md` · Next.js tidak dipakai; stack mengikuti rekomendasi React + MapLibre + PostgreSQL/PostGIS dengan API TypeScript.
