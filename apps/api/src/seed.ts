import { pool, withTransaction } from './db';
import { hashPassword } from './utils/password';
import { insertFeatures, createLayerSnapshot } from './services/featuresService';
import { normalizeStyle } from './utils/geo';
import { slugify } from './utils/geo';
import type { FeatureCollection, GeoFeature, LayerStatus, LayerStyle, LegendItem } from './types';

interface SeedLayer {
  name: string;
  slug: string;
  description: string;
  category: string;
  geometryType: string;
  source: string;
  dataDate: string;
  status: LayerStatus;
  ownerEmail: string;
  metadata: Record<string, unknown>;
  attributeLabels: Record<string, string>;
  style: LayerStyle;
  legend: LegendItem[];
  features: GeoFeature[];
}

function feature(id: string, geometryType: string, coordinates: unknown, properties: Record<string, unknown>): GeoFeature {
  return {
    type: 'Feature',
    id,
    geometry: { type: geometryType, coordinates },
    properties,
  };
}

function polygon(id: string, ring: number[][], properties: Record<string, unknown>): GeoFeature {
  return feature(id, 'Polygon', [ring], properties);
}

function featureCollection(features: GeoFeature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

const SEED_USERS = [
  {
    name: 'Sari Wulandari',
    email: 'admin@tataruang.go.id',
    password: 'Admin123!',
    role: 'admin',
    unit: 'Bidang Tata Ruang dan GIS',
  },
  {
    name: 'Dimas Prakoso',
    email: 'editor@tataruang.go.id',
    password: 'Editor123!',
    role: 'editor',
    unit: 'Dinas Pekerjaan Umum',
  },
];

const LAYERS: SeedLayer[] = [
  {
    name: 'Pola Ruang RTRW Kota Bandung',
    slug: 'pola-ruang-rtrw-kota-bandung',
    description:
      'Pola ruang Rencana Tata Ruang Wilayah Kota Bandung. Menampilkan pembagian zona peruntukan lahan beserta ringkasan aturan pemanfaatan ruang.',
    category: 'pola_ruang',
    geometryType: 'Polygon',
    source: 'RTRW Kota Bandung 2021-2041 (data contoh)',
    dataDate: '2025-12-01',
    status: 'published',
    ownerEmail: 'admin@tataruang.go.id',
    metadata: {
      agency: 'Bappeda Kota Bandung',
      statsField: 'kode',
      rules: 'KDB, KLB, dan KDH mengikuti ketentuan per zona. Pratinjau ini memakai data contoh untuk pembelajaran.',
      notes: 'Zona disederhanakan untuk keperluan demo.',
    },
    attributeLabels: { zona: 'Zona', kode: 'Kode Zona', aturan: 'Ringkasan Aturan', kdb: 'KDB maks (%)', klb: 'KLB maks', kdh: 'KDH min (%)' },
    style: {
      fillColor: '#2f7d5a',
      fillOpacity: 0.62,
      lineColor: '#1b4d38',
      lineWidth: 1.2,
      classification: {
        field: 'kode',
        fallbackColor: '#9aa8a2',
        classes: [
          { value: 'R-1', color: '#f2c94c', label: 'Perumahan' },
          { value: 'K-2', color: '#eb5757', label: 'Perdagangan & Jasa' },
          { value: 'I-1', color: '#9b51e0', label: 'Industri' },
          { value: 'H-1', color: '#27ae60', label: 'Hijau & Lindung' },
          { value: 'C-1', color: '#f2994a', label: 'Campuran' },
          { value: 'P-1', color: '#56ccf2', label: 'Pendidikan' },
        ],
      },
    },
    legend: [
      { label: 'R-1 Perumahan', color: '#f2c94c', description: 'KDB 60%, KLB 2.4, KDH 20%' },
      { label: 'K-2 Perdagangan & Jasa', color: '#eb5757', description: 'KDB 70%, KLB 3.5, KDH 15%' },
      { label: 'I-1 Industri', color: '#9b51e0', description: 'KDB 60%, KLB 2.0, KDH 20%' },
      { label: 'H-1 Hijau & Lindung', color: '#27ae60', description: 'Bangunan terbatas, KDH 80%' },
      { label: 'C-1 Campuran', color: '#f2994a', description: 'KDB 65%, KLB 3.0, KDH 20%' },
      { label: 'P-1 Pendidikan', color: '#56ccf2', description: 'Sarana pendidikan dan penunjang' },
    ],
    features: [
      polygon(
        'zone-r1',
        [
          [107.6, -6.93],
          [107.615, -6.93],
          [107.615, -6.918],
          [107.6, -6.918],
          [107.6, -6.93],
        ],
        { zona: 'Perumahan Kepadatan Sedang', kode: 'R-1', aturan: 'Diperbolehkan rumah tinggal, KDB maks 60%, KLB maks 2.4, KDH min 20%.', kdb: 60, klb: 2.4, kdh: 20 },
      ),
      polygon(
        'zone-k2',
        [
          [107.61, -6.925],
          [107.625, -6.925],
          [107.625, -6.912],
          [107.61, -6.912],
          [107.61, -6.925],
        ],
        { zona: 'Perdagangan dan Jasa', kode: 'K-2', aturan: 'Ruko dan gedung usaha diizinkan, KDB maks 70%, KLB maks 3.5, KDH min 15%.', kdb: 70, klb: 3.5, kdh: 15 },
      ),
      polygon(
        'zone-i1',
        [
          [107.625, -6.94],
          [107.645, -6.94],
          [107.645, -6.925],
          [107.625, -6.925],
          [107.625, -6.94],
        ],
        { zona: 'Kawasan Industri', kode: 'I-1', aturan: 'Kegiatan industri ringan, KDB maks 60%, KLB maks 2.0, KDH min 20%, wajib kajian lingkungan.', kdb: 60, klb: 2.0, kdh: 20 },
      ),
      polygon(
        'zone-h1',
        [
          [107.595, -6.915],
          [107.61, -6.915],
          [107.61, -6.9],
          [107.595, -6.9],
          [107.595, -6.915],
        ],
        { zona: 'Kawasan Hijau dan Lindung', kode: 'H-1', aturan: 'Tidak diperbolehkan bangunan permanen. KDH minimal 80% dan fungsi resapan wajib dipertahankan.', kdb: 5, klb: 0.1, kdh: 80 },
      ),
      polygon(
        'zone-c1',
        [
          [107.615, -6.95],
          [107.64, -6.95],
          [107.64, -6.935],
          [107.615, -6.935],
          [107.615, -6.95],
        ],
        { zona: 'Zona Campuran', kode: 'C-1', aturan: 'Hunian dan usaha skala kecil, KDB maks 65%, KLB maks 3.0, KDH min 20%.', kdb: 65, klb: 3.0, kdh: 20 },
      ),
      polygon(
        'zone-p1',
        [
          [107.6, -6.905],
          [107.615, -6.905],
          [107.615, -6.892],
          [107.6, -6.892],
          [107.6, -6.905],
        ],
        { zona: 'Kawasan Pendidikan', kode: 'P-1', aturan: 'Diarahkan untuk sarana pendidikan; penggunaan lain harus mendapat izin dan tidak mengganggu kegiatan belajar.', kdb: 50, klb: 1.8, kdh: 30 },
      ),
    ],
  },
  {
    name: 'Batas Kecamatan Kota Bandung',
    slug: 'batas-kecamatan-kota-bandung',
    description: 'Batas administrasi kecamatan (data contoh, disederhanakan) untuk analisis statistik per wilayah.',
    category: 'administrasi',
    geometryType: 'Polygon',
    source: 'Batas administrasi (data contoh)',
    dataDate: '2025-11-15',
    status: 'published',
    ownerEmail: 'admin@tataruang.go.id',
    metadata: {
      agency: 'Bagian Tata Pemerintahan',
      statsField: 'nama',
      rules: 'Batas administrasi hanya untuk referensi, bukan penetapan batas resmi.',
    },
    attributeLabels: { nama: 'Kecamatan', kode: 'Kode Wilayah', jumlah_penduduk: 'Jumlah Penduduk' },
    style: {
      fillColor: '#4f7cac',
      fillOpacity: 0.16,
      lineColor: '#2c4f75',
      lineWidth: 2,
    },
    legend: [{ label: 'Batas kecamatan', color: '#4f7cac' }],
    features: [
      polygon(
        'kec-sukajadi',
        [
          [107.585, -6.905],
          [107.605, -6.905],
          [107.605, -6.89],
          [107.585, -6.89],
          [107.585, -6.905],
        ],
        { nama: 'Sukajadi', kode: '3273010', jumlah_penduduk: 98750 },
      ),
      polygon(
        'kec-coblong',
        [
          [107.615, -6.905],
          [107.635, -6.905],
          [107.635, -6.888],
          [107.615, -6.888],
          [107.615, -6.905],
        ],
        { nama: 'Coblong', kode: '3273020', jumlah_penduduk: 128300 },
      ),
      polygon(
        'kec-lengkong',
        [
          [107.61, -6.935],
          [107.635, -6.935],
          [107.635, -6.915],
          [107.61, -6.915],
          [107.61, -6.935],
        ],
        { nama: 'Lengkong', kode: '3273030', jumlah_penduduk: 143200 },
      ),
      polygon(
        'kec-bandung-wetan',
        [
          [107.605, -6.915],
          [107.625, -6.915],
          [107.625, -6.9],
          [107.605, -6.9],
          [107.605, -6.915],
        ],
        { nama: 'Bandung Wetan', kode: '3273040', jumlah_penduduk: 76400 },
      ),
      polygon(
        'kec-andir',
        [
          [107.595, -6.93],
          [107.61, -6.93],
          [107.61, -6.915],
          [107.595, -6.915],
          [107.595, -6.93],
        ],
        { nama: 'Andir', kode: '3273050', jumlah_penduduk: 112900 },
      ),
    ],
  },
  {
    name: 'Kawasan Rawan Banjir',
    slug: 'kawasan-rawan-banjir',
    description: 'Zona rawan genangan berdasarkan kajian risiko bencana (data contoh). Gunakan bersama layer pola ruang untuk melihat batasan tambahan.',
    category: 'risiko',
    geometryType: 'Polygon',
    source: 'BPBD Kota Bandung (data contoh)',
    dataDate: '2025-10-20',
    status: 'published',
    ownerEmail: 'admin@tataruang.go.id',
    metadata: {
      agency: 'BPBD Kota Bandung',
      statsField: 'tingkat',
      rules: 'Pada zona rawan tinggi, disarankan meninggikan lantai bangunan, menyediakan drainase memadai, dan menghindari basement.',
    },
    attributeLabels: { kecamatan: 'Kecamatan', tingkat: 'Tingkat Risiko', tinggi_air: 'Tinggi Genangan (cm)', periode: 'Periode Ulang' },
    style: {
      fillColor: '#d64545',
      fillOpacity: 0.55,
      lineColor: '#8f2323',
      lineWidth: 1,
      classification: {
        field: 'tingkat',
        fallbackColor: '#e8c547',
        classes: [
          { value: 'Tinggi', color: '#d64545', label: 'Risiko tinggi' },
          { value: 'Sedang', color: '#e58e3a', label: 'Risiko sedang' },
          { value: 'Rendah', color: '#e8c547', label: 'Risiko rendah' },
        ],
      },
    },
    legend: [
      { label: 'Risiko tinggi', color: '#d64545', description: 'Genangan > 60 cm' },
      { label: 'Risiko sedang', color: '#e58e3a', description: 'Genangan 30-60 cm' },
      { label: 'Risiko rendah', color: '#e8c547', description: 'Genangan < 30 cm' },
    ],
    features: [
      polygon(
        'banjir-1',
        [
          [107.6, -6.94],
          [107.61, -6.94],
          [107.61, -6.932],
          [107.6, -6.932],
          [107.6, -6.94],
        ],
        { kecamatan: 'Andir', tingkat: 'Tinggi', tinggi_air: 80, periode: '5 tahunan' },
      ),
      polygon(
        'banjir-2',
        [
          [107.62, -6.93],
          [107.632, -6.93],
          [107.632, -6.92],
          [107.62, -6.92],
          [107.62, -6.93],
        ],
        { kecamatan: 'Lengkong', tingkat: 'Sedang', tinggi_air: 45, periode: '5 tahunan' },
      ),
      polygon(
        'banjir-3',
        [
          [107.59, -6.92],
          [107.6, -6.92],
          [107.6, -6.91],
          [107.59, -6.91],
          [107.59, -6.92],
        ],
        { kecamatan: 'Sukajadi', tingkat: 'Rendah', tinggi_air: 20, periode: '2 tahunan' },
      ),
    ],
  },
  {
    name: 'Jaringan Jalan Utama',
    slug: 'jaringan-jalan-utama',
    description: 'Jaringan jalan arteri dan kolektor utama Kota Bandung (data contoh).',
    category: 'infrastruktur',
    geometryType: 'LineString',
    source: 'Dinas Bina Marga (data contoh)',
    dataDate: '2025-09-30',
    status: 'published',
    ownerEmail: 'admin@tataruang.go.id',
    metadata: {
      agency: 'Dinas Bina Marga',
      statsField: 'kelas',
    },
    attributeLabels: { nama: 'Nama Jalan', kelas: 'Kelas Jalan', panjang_km: 'Panjang (km)', kondisi: 'Kondisi' },
    style: {
      lineColor: '#37474f',
      lineWidth: 3,
      lineOpacity: 0.9,
    },
    legend: [{ label: 'Jalan arteri/kolektor', color: '#37474f' }],
    features: [
      feature('road-asia-afrika', 'LineString', [
        [107.61, -6.9215],
        [107.618, -6.921],
        [107.623, -6.9205],
      ], { nama: 'Jalan Asia Afrika', kelas: 'Arteri', panjang_km: 1.4, kondisi: 'Baik' }),
      feature('road-dago', 'LineString', [
        [107.613, -6.9],
        [107.6145, -6.908],
        [107.616, -6.916],
      ], { nama: 'Jalan Ir. H. Juanda (Dago)', kelas: 'Arteri', panjang_km: 2.1, kondisi: 'Baik' }),
      feature('road-pasteur', 'LineString', [
        [107.595, -6.9],
        [107.5965, -6.91],
        [107.598, -6.918],
      ], { nama: 'Jalan Dr. Djunjunan (Pasteur)', kelas: 'Arteri', panjang_km: 2.3, kondisi: 'Sedang' }),
      feature('road-soekarno-hatta', 'LineString', [
        [107.63, -6.95],
        [107.635, -6.935],
        [107.64, -6.92],
      ], { nama: 'Jalan Soekarno-Hatta', kelas: 'Arteri Primer', panjang_km: 3.8, kondisi: 'Baik' }),
    ],
  },
  {
    name: 'Sebaran Sekolah',
    slug: 'sebaran-sekolah',
    description: 'Lokasi sekolah negeri dan perguruan tinggi di wilayah contoh.',
    category: 'aset',
    geometryType: 'Point',
    source: 'Dinas Pendidikan (data contoh)',
    dataDate: '2025-08-12',
    status: 'published',
    ownerEmail: 'admin@tataruang.go.id',
    metadata: {
      agency: 'Dinas Pendidikan Kota Bandung',
      statsField: 'jenjang',
    },
    attributeLabels: { nama: 'Nama Sekolah', jenjang: 'Jenjang', status: 'Status', murid: 'Jumlah Murid' },
    style: {
      circleColor: '#1f6feb',
      circleRadius: 7,
      circleStrokeColor: '#ffffff',
      lineColor: '#1f6feb',
    },
    legend: [
      { label: 'SMA/SMK', color: '#1f6feb' },
      { label: 'SMP', color: '#56ccf2' },
      { label: 'Perguruan tinggi', color: '#9b51e0' },
    ],
    features: [
      feature('sch-sman1', 'Point', [107.618, -6.914], { nama: 'SMAN 1 Bandung', jenjang: 'SMA', status: 'Negeri', murid: 1080 }),
      feature('sch-sman3', 'Point', [107.6175, -6.9157], { nama: 'SMAN 3 Bandung', jenjang: 'SMA', status: 'Negeri', murid: 1040 }),
      feature('sch-smpn5', 'Point', [107.61, -6.908], { nama: 'SMPN 5 Bandung', jenjang: 'SMP', status: 'Negeri', murid: 860 }),
      feature('sch-sdn-sukajadi', 'Point', [107.592, -6.895], { nama: 'SDN Sukajadi', jenjang: 'SD', status: 'Negeri', murid: 540 }),
      feature('sch-sman8', 'Point', [107.618, -6.902], { nama: 'SMAN 8 Bandung', jenjang: 'SMA', status: 'Negeri', murid: 990 }),
      feature('sch-unpad', 'Point', [107.616, -6.893], { nama: 'Universitas Padjadjaran', jenjang: 'Perguruan Tinggi', status: 'Negeri', murid: 32000 }),
    ],
  },
  {
    name: 'Jaringan Sungai',
    slug: 'jaringan-sungai',
    description: 'Jaringan sungai utama yang melintasi wilayah contoh.',
    category: 'infrastruktur',
    geometryType: 'LineString',
    source: 'Dinas Sumber Daya Air (data contoh)',
    dataDate: '2025-07-05',
    status: 'published',
    ownerEmail: 'admin@tataruang.go.id',
    metadata: { agency: 'Dinas Sumber Daya Air', statsField: 'kelas' },
    attributeLabels: { nama: 'Nama Sungai', lebar_m: 'Lebar (m)', kelas: 'Kelas' },
    style: { lineColor: '#2f80ed', lineWidth: 2.5, lineOpacity: 0.85 },
    legend: [{ label: 'Sungai', color: '#2f80ed' }],
    features: [
      feature('river-cikapundung', 'LineString', [
        [107.615, -6.89],
        [107.617, -6.9],
        [107.619, -6.91],
        [107.621, -6.92],
      ], { nama: 'Sungai Cikapundung', lebar_m: 12, kelas: 'Kota' }),
      feature('river-citepus', 'LineString', [
        [107.605, -6.93],
        [107.61, -6.935],
        [107.616, -6.94],
      ], { nama: 'Sungai Citepus', lebar_m: 8, kelas: 'Kota' }),
    ],
  },
  {
    name: 'Sempadan Sungai Cikapundung',
    slug: 'sempadan-sungai-cikapundung',
    description: 'Usulan delineasi sempadan Sungai Cikapundung. Menunggu tinjauan admin sebelum terbit.',
    category: 'risiko',
    geometryType: 'Polygon',
    source: 'Konsultan perencanaan (data contoh)',
    dataDate: '2026-01-10',
    status: 'submitted',
    ownerEmail: 'editor@tataruang.go.id',
    metadata: {
      agency: 'Dinas Sumber Daya Air',
      statsField: 'sungai',
      rules: 'Sempadan sungai minimal 10 meter dari tepi luar tanggul. Dilarang mendirikan bangunan permanen.',
      submittedNote: 'Mohon tinjau kesesuaian sempadan dengan RDTR.',
    },
    attributeLabels: { sungai: 'Sungai', sisi: 'Sisi', lebar_sempadan_m: 'Lebar Sempadan (m)' },
    style: { fillColor: '#2d9cdb', fillOpacity: 0.35, lineColor: '#1b6f9e', lineWidth: 1.4 },
    legend: [{ label: 'Sempadan sungai', color: '#2d9cdb' }],
    features: [
      polygon(
        'sempadan-cikapundung-timur',
        [
          [107.618, -6.897],
          [107.621, -6.897],
          [107.625, -6.921],
          [107.622, -6.921],
          [107.618, -6.897],
        ],
        { sungai: 'Cikapundung', sisi: 'Timur', lebar_sempadan_m: 10 },
      ),
    ],
  },
  {
    name: 'RDTR Kecamatan Sukajadi (Draf)',
    slug: 'rdtr-kecamatan-sukajadi-draf',
    description: 'Rancangan RDTR Kecamatan Sukajadi yang masih dalam penyusunan editor.',
    category: 'pola_ruang',
    geometryType: 'Polygon',
    source: 'Draf internal',
    dataDate: '2026-02-01',
    status: 'draft',
    ownerEmail: 'editor@tataruang.go.id',
    metadata: {
      agency: 'Dinas Tata Ruang',
      statsField: 'subzona',
      rules: 'Draf belum disahkan. Jangan digunakan sebagai dasar perizinan.',
    },
    attributeLabels: { subzona: 'Subzona', kode: 'Kode' },
    style: { fillColor: '#e0a13b', fillOpacity: 0.4, lineColor: '#a8721f', lineWidth: 1.2 },
    legend: [{ label: 'Rancangan subzona', color: '#e0a13b' }],
    features: [
      polygon(
        'rdtr-sukajadi-1',
        [
          [107.585, -6.91],
          [107.6, -6.91],
          [107.6, -6.9],
          [107.585, -6.9],
          [107.585, -6.91],
        ],
        { subzona: 'Perumahan kepadatan rendah', kode: 'R-2' },
      ),
      polygon(
        'rdtr-sukajadi-2',
        [
          [107.585, -6.9],
          [107.6, -6.9],
          [107.6, -6.89],
          [107.585, -6.89],
          [107.585, -6.9],
        ],
        { subzona: 'Perdagangan lokal', kode: 'K-3' },
      ),
    ],
  },
];

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const existing = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM layers');
  const hasLayers = existing.rows[0].count > 0;

  if (hasLayers && !force) {
    console.log('Basis data sudah berisi layer. Jalankan "npm run seed -- --force" untuk mengisi ulang data contoh.');
    await pool.end();
    return;
  }

  await withTransaction(async (client) => {
    if (force) {
      await client.query('DELETE FROM analyses');
      await client.query('DELETE FROM layers');
      await client.query('DELETE FROM audit_logs');
      await client.query('DELETE FROM site_stats');
      console.log('Data lama dihapus karena --force.');
    }

    const userIds = new Map<string, string>();
    for (const user of SEED_USERS) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash, role, unit)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, unit = EXCLUDED.unit
         RETURNING id`,
        [user.name, user.email, hashPassword(user.password), user.role, user.unit],
      );
      userIds.set(user.email, result.rows[0].id);
    }

    const layerIds: string[] = [];
    for (const [index, layer] of LAYERS.entries()) {
      const ownerId = userIds.get(layer.ownerEmail)!;
      const created = await client.query<{ id: string }>(
        `INSERT INTO layers
           (name, slug, description, category, geometry_type, source_crs, status, source, data_date,
            owner_id, metadata, attribute_labels, hidden_attributes, sort_order, current_version,
            published_at, submitted_at)
         VALUES ($1, $2, $3, $4, $5, 'EPSG:4326', $6::layer_status, $7, $8, $9, $10, $11, '[]'::jsonb, $12, 1,
                 CASE WHEN $6::text = 'published' THEN now() - interval '7 days' ELSE NULL END,
                 CASE WHEN $6::text = 'submitted' THEN now() - interval '2 days' ELSE NULL END)
         RETURNING id`,
        [
          layer.name,
          layer.slug,
          layer.description,
          layer.category,
          layer.geometryType,
          layer.status,
          layer.source,
          layer.dataDate,
          ownerId,
          JSON.stringify(layer.metadata),
          JSON.stringify(layer.attributeLabels),
          index * 10,
        ],
      );
      const layerId = created.rows[0].id;
      layerIds.push(layerId);

      await client.query('INSERT INTO layer_styles (layer_id, style, legend) VALUES ($1, $2, $3)', [
        layerId,
        JSON.stringify(normalizeStyle(layer.style)),
        JSON.stringify(layer.legend),
      ]);

      await insertFeatures(client, layerId, featureCollection(layer.features), ownerId, 1);
      await createLayerSnapshot(client, layerId, 1, ownerId, 'Versi awal data contoh');
    }

    const submittedLayer = layerIds[6];
    const publishedLayer = layerIds[0];

    await client.query(
      `INSERT INTO audit_logs (user_id, action, object_type, object_id, details, ip)
       VALUES ($1, 'import_layer', 'layer', $2, $3, '127.0.0.1')`,
      [userIds.get('editor@tataruang.go.id'), submittedLayer, JSON.stringify({ filename: 'sempadan-cikapundung.geojson' })],
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, object_type, object_id, details, ip)
       VALUES ($1, 'publish_layer', 'layer', $2, $3, '127.0.0.1')`,
      [userIds.get('admin@tataruang.go.id'), publishedLayer, JSON.stringify({ note: 'Penerbitan awal setelah validasi' })],
    );

    for (let dayOffset = 13; dayOffset >= 0; dayOffset -= 1) {
      const visits = 45 + ((dayOffset * 17) % 90) + (13 - dayOffset) * 4;
      await client.query(
        `INSERT INTO site_stats (day, visits) VALUES (CURRENT_DATE - $1::int, $2)
         ON CONFLICT (day) DO UPDATE SET visits = EXCLUDED.visits`,
        [dayOffset, visits],
      );
    }

    console.log(`Seeding selesai: ${LAYERS.length} layer, 2 pengguna, ${layerIds.length} snapshot versi.`);
    console.log('Akun demo:');
    console.log('  Admin  : admin@tataruang.go.id / Admin123!');
    console.log('  Editor : editor@tataruang.go.id / Editor123!');
    console.log('Catatan: slug dibuat tetap agar tautan demo stabil.');
  });

  await pool.end();
}

main().catch(async (error) => {
  console.error('Seeding gagal:', error);
  await pool.end();
  process.exit(1);
});
