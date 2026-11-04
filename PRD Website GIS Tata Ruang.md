# PRD: Website GIS Tata Ruang

Nov 4, 2026 · @Albar

Website GIS ini menyediakan peta tata ruang yang bisa dibuka publik dan dikelola oleh admin instansi, sehingga data spasial tidak lagi tersebar di berkas terpisah.

## 1. Ringkasan & latar belakang

**Masalah.** Data tata ruang (RTRW/RDTR, zonasi, aset, infrastruktur) umumnya tersimpan sebagai Shapefile atau PDF di komputer masing-masing unit. Akibatnya masyarakat sulit mengecek peruntukan lahan, dan petugas memakai versi data yang berbeda-beda.

**Solusi.** Satu platform web dengan dua sisi: portal peta publik (hanya lihat dan cari) dan panel admin (unggah, gambar, edit, analisis, dan terbitkan data).

**Tujuan**

- Menjadi satu sumber data spasial resmi yang selalu terbaru.
- Memudahkan masyarakat mengecek informasi lahan tanpa datang ke kantor.
- Mempercepat kerja petugas lewat analisis spasial dasar (buffer, overlay, radius, statistik wilayah).

**Sasaran terukur (target 6 bulan setelah rilis, dapat disesuaikan)**

| Metrik | Target |
| --- | --- |
| Waktu muat peta awal | < 3 detik pada koneksi 4G |
| Layer resmi yang terbit | minimal 15 layer |
| Pengguna publik aktif bulanan | 1.000 |
| Waktu admin menerbitkan layer baru | < 15 menit dari unggah sampai tayang |

## 2. Pengguna & persona

Ada tiga peran: publik tanpa login, petugas yang mengelola data, dan super admin yang mengatur sistem.

| Peran | Siapa | Kebutuhan utama | Akses |
| --- | --- | --- | --- |
| Publik | Warga, pengembang properti, notaris, mahasiswa | Mengecek peruntukan ruang di suatu lokasi, mencari alamat, mengunduh peta | Tanpa login, hanya layer berstatus terbit |
| Editor | Petugas teknis di dinas | Mengunggah dan mengedit data, menganalisis, menyiapkan layer | Login, bisa edit layer milik unitnya, tidak bisa menerbitkan |
| Admin / Approver | Kepala bidang atau pengelola GIS | Meninjau dan menerbitkan layer, mengelola pengguna, melihat statistik | Login, bisa menerbitkan dan menarik layer, kelola pengguna |

**Persona singkat**

- **Bu Rina, warga.** Ingin tahu apakah tanahnya boleh dibangun ruko. Ia membuka peta di ponsel, mencari alamat, mengetuk lokasi, dan membaca zona serta aturannya.
- **Pak Dimas, editor.** Menerima Shapefile revisi zona dari konsultan. Ia mengunggahnya, mencocokkan atribut, memeriksa geometri, lalu mengajukan penerbitan.
- **Bu Sari, admin.** Meninjau layer yang diajukan, membandingkannya dengan versi sebelumnya, lalu menerbitkannya.

## 3. Ruang lingkup

Versi pertama (MVP) fokus pada peta publik dan manajemen data oleh admin; fitur lanjutan sengaja ditunda.

**Termasuk (in-scope)**

- Portal peta publik: basemap, layer tematik, popup atribut, pencarian alamat dan koordinat, ukur jarak dan luas, cetak dan unduh peta.
- Panel admin: login berperan, unggah GeoJSON/Shapefile/KML/CSV koordinat, gambar dan edit fitur, validasi geometri, alur tinjau-lalu-terbitkan.
- Analisis spasial dasar: buffer, overlay (intersect), pencarian radius, statistik per wilayah.
- Dashboard ringkas dan ekspor laporan (PDF, CSV).
- Log aktivitas dan riwayat versi layer.

**Tidak termasuk (out-of-scope) untuk MVP**

- Aplikasi mobile native (cukup web responsif).
- Pengumpulan data lapangan offline.
- Analisis lanjutan seperti raster, routing jaringan jalan, atau pemodelan 3D.
- Integrasi perizinan (OSS/PBG) dan pembayaran.

**Asumsi**

- Data awal tersedia dalam format Shapefile/GeoJSON dengan sistem koordinat yang diketahui (umumnya WGS 84 / EPSG:4326 atau UTM/DGN-95).
- Basemap memakai OpenStreetMap atau penyedia tile gratis, tanpa biaya lisensi.
- Anda sendiri bertanggung jawab atas kualitas data; ini proyek belajar bergaya ATR/BPN, bukan sistem resmi instansi.
- Skala awal: satu kabupaten/kota, puluhan layer, ratusan ribu fitur.

## 4. Kebutuhan fungsional

Prioritas memakai MoSCoW: **M** = wajib di MVP, **S** = sebaiknya ada, **C** = bisa ditunda.

| ID | Modul | Kebutuhan | Prioritas |
| --- | --- | --- | --- |
| F-01 | Peta publik | Tampilkan peta interaktif dengan zoom, geser, dan pilihan basemap (jalan, citra satelit) | M |
| F-02 | Peta publik | Daftar layer dengan toggle tampil/sembunyi, pengaturan transparansi, dan legenda | M |
| F-03 | Peta publik | Popup atribut saat fitur diketuk atau diklik | M |
| F-04 | Peta publik | Cek lokasi: klik titik, tampilkan zona/peruntukan yang melingkupinya | M |
| F-05 | Peta publik | Pencarian alamat, nama tempat, atau koordinat | M |
| F-06 | Peta publik | Ukur jarak dan luas, cetak peta ke PDF/gambar | S |
| F-07 | Peta publik | Bagikan tautan dengan posisi dan layer aktif | S |
| F-08 | Admin: akun | Login, peran (editor, admin), reset kata sandi | M |
| F-09 | Admin: data | Unggah GeoJSON, Shapefile (.zip), KML, CSV koordinat; pratinjau sebelum simpan | M |
| F-10 | Admin: data | Validasi otomatis: geometri tidak valid, CRS tidak cocok, atribut kosong | M |
| F-11 | Admin: edit | Gambar titik, garis, poligon; ubah bentuk; edit atribut | M |
| F-12 | Admin: layer | Atur gaya (warna, ikon, klasifikasi), urutan layer, dan metadata | M |
| F-13 | Admin: alur | Status draf, diajukan, terbit, arsip; tinjauan oleh admin sebelum terbit | M |
| F-14 | Admin: versi | Riwayat versi layer dan kemampuan mengembalikan versi lama | S |
| F-15 | Analisis | Buffer, overlay (intersect), pencarian radius | M |
| F-16 | Analisis | Statistik per wilayah (jumlah fitur, total luas, per kategori) | S |
| F-17 | Dashboard | Grafik dan tabel ringkas (jumlah layer, fitur, kunjungan) | S |
| F-18 | Ekspor | Unduh layer terbit sebagai GeoJSON/CSV; laporan hasil analisis PDF | S |
| F-19 | Sistem | Log aktivitas pengguna (siapa mengubah apa dan kapan) | S |
| F-20 | Layanan | Akses data via standar OGC (WMS/WFS) untuk instansi lain | C |
| F-21 | Peta publik | Bahasa Inggris dan Indonesia | C |

**Kriteria penerimaan contoh (F-04, cek lokasi)**

- Saat pengguna mengklik titik di peta, sistem menampilkan nama zona, kode, dan ringkasan aturan dalam kurang dari 2 detik.
- Jika titik berada di luar wilayah data, sistem menampilkan pesan yang jelas, bukan layar kosong.
- Hasil hanya berasal dari layer berstatus terbit.

## 5. Kebutuhan non-fungsional

| Aspek | Kebutuhan |
| --- | --- |
| Performa | Peta awal tampil < 3 detik (4G); layer besar disajikan sebagai vector tiles, bukan GeoJSON utuh; mendukung 100 pengguna bersamaan pada MVP |
| Skalabilitas | Layer hingga ±500.000 fitur tetap lancar; arsitektur bisa ditambah server tanpa menulis ulang |
| Keamanan | HTTPS wajib; kata sandi di-hash; kontrol akses berbasis peran; layer draf tidak pernah bisa diakses publik; perlindungan dari SQL injection, XSS, dan CSRF; pembatasan laju (rate limit) pada API publik |
| Privasi | Atribut sensitif (mis. nama pemilik lahan) bisa disembunyikan dari tampilan publik per kolom |
| Ketersediaan | Berjalan stabil selama dipakai di laptop; cadangan basis data berkala (pg\_dump) ke penyimpanan terpisah |
| Kompatibilitas | Chrome, Edge, Firefox, Safari versi terbaru; tampilan responsif untuk ponsel dan tablet |
| Aksesibilitas | Mengikuti WCAG 2.1 AA untuk elemen non-peta (kontras, navigasi keyboard, label) |
| Standar data | Penyimpanan dalam EPSG:4326 dengan dukungan transformasi dari CRS lokal; metadata mengacu pada profil metadata Kebijakan Satu Peta / BIG bila relevan |
| Kepatuhan | Perhatikan UU Pelindungan Data Pribadi (UU PDP) dan kebijakan hosting data pemerintah (PDN/server dalam negeri) bila instansi mensyaratkannya |
| Pemeliharaan | Kode dengan dokumentasi dan pengujian otomatis untuk fungsi kritis (validasi, hak akses, analisis) |

## 6. Arsitektur & rekomendasi tech stack

Rekomendasi: aplikasi web tiga lapis dengan PostgreSQL + PostGIS sebagai satu-satunya sumber data, memakai perangkat lunak open source agar tanpa biaya lisensi.

&#91;embedded content: arsitektur sistem · 4 lapisan\]

Publik hanya membaca tile vektor dan memanggil API untuk cek lokasi; semua penulisan data lewat API yang mewajibkan login.

| Lapisan | Pilihan utama | Alasan | Alternatif |
| --- | --- | --- | --- |
| Peta (frontend) | MapLibre GL JS | Open source, cepat untuk vector tiles, tanpa token berbayar | Leaflet (lebih sederhana, kurang cepat untuk data besar) |
| UI | React + TypeScript | Ekosistem luas, mudah mencari pengembang | Vue / Svelte |
| Gambar & edit fitur | Terra Draw atau mapbox-gl-draw | Menggambar titik/garis/poligon di MapLibre | OpenLayers Draw |
| Analisis di browser | Turf.js | Buffer, radius, ukur jarak/luas ringan | — |
| Backend / API | FastAPI (Python) atau NestJS (Node.js) | Pilih sesuai keahlian tim; Python unggul untuk pustaka geospasial | Django + GeoDjango |
| Pemrosesan berkas | GDAL/OGR (via ogr2ogr) + Shapely | Membaca Shapefile/KML, transformasi CRS, validasi geometri | GeoPandas |
| Basis data | PostgreSQL + PostGIS | Standar industri GIS, analisis spasial kuat, indeks spasial | — |
| Server tile | Martin atau pg\_tileserv | Menyajikan vector tiles langsung dari PostGIS | GeoServer (jika perlu WMS/WFS penuh) |
| Cache | Redis atau cache tile di reverse proxy | Mempercepat tile dan hasil pencarian | Nginx cache |
| Penyimpanan berkas | MinIO atau S3 | Menyimpan unggahan asli dan hasil ekspor | Disk server pada tahap awal |
| Penerapan | Docker Compose di laptop sendiri | Tanpa biaya hosting; cukup untuk belajar dan demo | VPS murah atau tier gratis bila ingin dibagikan online |

**Catatan.** Jika kelak perlu layanan standar OGC (WMS/WFS) untuk instansi lain (F-20), tambahkan GeoServer di samping Martin, bukan menggantinya.

## 7. Model data & sumber data spasial

Data spasial disimpan di PostgreSQL + PostGIS; setiap layer punya tabel fitur sendiri dan satu baris metadata.

**Entitas utama**

| Entitas | Isi utama | Relasi |
| --- | --- | --- |
| users | id, nama, email, kata sandi (hash), peran, unit kerja, status aktif | punya banyak layer dan log |
| layers | id, nama, deskripsi, kategori, tipe geometri, CRS asal, status (draf/diajukan/terbit/arsip), sumber, tanggal data, pemilik | punya banyak fitur dan versi |
| features | id, layer\_id, geometri (PostGIS), atribut (JSONB), versi | milik satu layer |
| layer\_styles | layer\_id, aturan gaya (warna, ikon, klasifikasi), legenda | satu per layer |
| layer\_versions | id, layer\_id, nomor versi, ringkasan perubahan, dibuat oleh, waktu | riwayat untuk pengembalian |
| analyses | id, jenis (buffer/overlay/radius), parameter, hasil, dibuat oleh | opsional disimpan sebagai layer baru |
| audit\_logs | id, user\_id, aksi, objek, waktu, IP | mencatat semua perubahan |

**Contoh layer awal untuk tata ruang**

| Kelompok | Layer |
| --- | --- |
| Rencana ruang | Pola ruang (RTRW/RDTR), struktur ruang, kawasan lindung, kawasan budidaya |
| Administrasi | Batas kabupaten/kota, kecamatan, desa/kelurahan |
| Infrastruktur | Jaringan jalan, sungai, jaringan listrik dan air |
| Aset & fasilitas | Sekolah, puskesmas, fasilitas umum, aset daerah |
| Risiko | Rawan banjir, rawan longsor, sempadan sungai dan pantai |

**Sumber data yang umum dipakai**

- Data instansi sendiri (Bappeda, Dinas PU/PUPR, Dinas Pertanahan).
- Portal data nasional, mis. Ina-Geoportal (BIG) dan Geoportal Kebijakan Satu Peta.
- OpenStreetMap untuk basemap dan jaringan jalan.
- Hasil survei atau konsultan (Shapefile/GeoJSON).

## 8. Alur pengguna

Ada dua alur utama: editor menerbitkan layer lewat tinjauan admin, dan warga mengecek peruntukan lahan di peta publik.

**Alur editor dan admin: menerbitkan layer**

&#91;embedded content: alur penerbitan layer · 5 langkah, 2 keputusan\]

Data yang gagal validasi atau ditolak admin kembali ke editor untuk diperbaiki, lalu diajukan ulang.

**Alur publik: mengecek peruntukan lahan**

1. Warga membuka portal peta; peta muncul dengan layer pola ruang aktif.
2. Warga mencari alamat atau menggeser peta ke lokasi tanahnya.
3. Warga mengetuk lokasi; sistem menampilkan zona, kode, dan ringkasan aturan di panel samping.
4. Warga menyalakan layer lain (mis. rawan banjir, sempadan sungai) untuk melihat batasan tambahan.
5. Warga membagikan tautan atau mencetak peta sebagai lampiran.

**Layar utama (wireframe dalam kata)**

| Layar | Isi utama |
| --- | --- |
| Peta publik | Peta penuh layar; kotak pencarian di kiri atas; panel layer dan legenda di kiri; tombol ukur, cetak, bagikan di kanan; panel informasi saat fitur dipilih |
| Login | Email, kata sandi, tautan lupa kata sandi |
| Daftar layer (admin) | Tabel layer dengan status, pemilik, tanggal; filter dan tombol unggah |
| Editor layer | Peta dengan alat gambar, tabel atribut di bawah, panel gaya dan metadata di kanan |
| Tinjauan penerbitan | Perbandingan versi baru dan lama, hasil validasi, tombol setujui atau tolak dengan catatan |
| Dashboard | Kartu ringkasan, grafik layer per kategori, kunjungan, aktivitas terbaru |

## 9. Roadmap & fase pengembangan

MVP dirilis dalam sekitar 22 minggu, dibagi lima fase; peta publik lebih dulu agar masukan pengguna datang lebih awal.

&#91;embedded content: roadmap · 5 fase, 2 gerbang\]

Setiap gerbang ditinjau oleh Anda sendiri sebagai pemilik produk sebelum fase berikutnya dimulai.

**Jalur tercepat untuk satu pengembang.** Karena dikerjakan sendiri dan ingin cepat, selesaikan dulu fase 1 sampai 3 hanya dengan kebutuhan berprioritas M (F-01 sampai F-05, F-08 sampai F-13, F-15). Itu sudah menghasilkan peta publik yang bisa dipakai dan panel untuk mengelola data. Fase 4 dan 5 dikerjakan bertahap sesudahnya.

| Fase | Hasil yang diserahkan | Kebutuhan terkait |
| --- | --- | --- |
| 1. Persiapan | Daftar layer awal, desain UI/UX, server dan basis data siap | Seluruh data awal |
| 2. Peta publik | Portal peta dengan layer, popup, pencarian, cek lokasi | F-01 sampai F-07 |
| 3. Panel admin | Login berperan, unggah dan validasi, edit, gaya layer, alur terbit | F-08 sampai F-14 |
| 4. Analisis & dashboard | Buffer, overlay, radius, statistik, dashboard, ekspor | F-15 sampai F-19 |
| 5. Uji & rilis | Uji keamanan dan beban, uji penerimaan, pelatihan petugas, rilis | Semua kebutuhan non-fungsional |

**Backlog pasca-rilis**

- Layanan OGC (WMS/WFS) untuk instansi lain (F-20).
- Antarmuka dwibahasa (F-21).
- Notifikasi saat layer baru terbit atau diperbarui.
- Integrasi dengan sistem perizinan dan portal data daerah.
- Pengumpulan data lapangan lewat ponsel.

## 10. Risiko, metrik keberhasilan, dan pertanyaan terbuka

**Risiko utama**

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Kualitas data buruk (geometri rusak, CRS salah) | Peta salah, kepercayaan publik turun | Validasi otomatis saat unggah; wajib tinjauan admin sebelum terbit |
| Peta lambat pada layer besar | Pengguna meninggalkan situs | Vector tiles, simplifikasi geometri per zoom, indeks spasial |
| Data sensitif bocor | Masalah hukum dan reputasi | Kontrol akses per peran, sembunyikan kolom sensitif, audit log |
| Cakupan melebar (scope creep) | Jadwal molor | Patuhi daftar in-scope MVP; fitur baru masuk backlog fase berikutnya |
| Ketergantungan pada satu pengembang | Sulit dirawat | Dokumentasi, kode terstruktur, serah terima ke staf instansi |
| Data resmi belum siap atau belum disetujui | Peluncuran tertunda | Mulai dengan layer yang sudah final; tandai layer lain "akan datang" |

**Metrik keberhasilan**

- Adopsi: jumlah pengguna publik aktif bulanan dan jumlah pencarian lokasi per bulan.
- Kualitas: persentase layer terbit yang lolos validasi tanpa perbaikan ulang.
- Efisiensi: waktu dari unggah sampai terbit (target < 15 menit).
- Teknis: waktu muat peta (p95 < 3 detik), tingkat error < 1%.
- Kepuasan: skor survei singkat di portal (target ≥ 4 dari 5).

**Keputusan atas pertanyaan terbuka**

- [ ] Pemilik produk: Anda sendiri. Domainnya mengikuti ATR/BPN (tata ruang dan pertanahan), tetapi ini proyek pribadi untuk belajar dan dikerjakan seperti proyek nyata. Anda memegang semua peran: publik, editor, dan admin.
- [ ] Cakupan wilayah: satu kabupaten/kota. Pilih satu wilayah yang datanya mudah didapat dan Anda kenal baik.
- [ ] Hosting: lokal di laptop dengan Docker Compose (PostgreSQL + PostGIS, API, server tile, frontend). Gratis dan cukup untuk belajar. Bila nanti ingin dibagikan online, pakai VPS murah atau tier gratis.
- [ ] Atribut sensitif: jangan memuat data pribadi sama sekali (mis. nama pemilik lahan). Pakai data terbuka saja: batas administrasi, pola ruang yang dipublikasikan, OpenStreetMap. Fitur menyembunyikan kolom tetap masuk backlog.
- [ ] Anggaran: nol, memakai perangkat open source. Target: secepatnya, lewat jalur tercepat di bagian 9 (fase 1 sampai 3 dulu).
- [ ] Integrasi: tidak ada di MVP. Cukup impor berkas data terbuka (GeoJSON atau Shapefile) secara manual.
- [ ] Perawatan: Anda sendiri. Karena itu jaga stack tetap sederhana dan tulis catatan setup agar mudah dipulihkan.
