import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'id' | 'en';

type Dictionary = Record<string, { id: string; en: string }>;

const MESSAGES: Dictionary = {
  'app.name': { id: 'Tata Ruang', en: 'Tata Ruang' },
  'app.tagline': { id: 'Portal GIS Kota Bandung', en: 'Bandung City GIS Portal' },
  'nav.map': { id: 'Peta', en: 'Map' },
  'nav.about': { id: 'Tentang', en: 'About' },
  'nav.login': { id: 'Masuk', en: 'Sign in' },
  'nav.admin': { id: 'Panel Admin', en: 'Admin Panel' },
  'nav.logout': { id: 'Keluar', en: 'Sign out' },
  'nav.publicMap': { id: 'Peta Publik', en: 'Public Map' },
  'search.placeholder': { id: 'Cari alamat, tempat, atau koordinat…', en: 'Search address, place, or coordinates…' },
  'search.searching': { id: 'Mencari…', en: 'Searching…' },
  'search.noResults': { id: 'Tidak ada hasil. Coba kata kunci lain atau koordinat.', en: 'No results. Try another keyword or coordinates.' },
  'search.coordinate': { id: 'Koordinat', en: 'Coordinate' },
  'search.attribution': { id: 'Pencarian alamat oleh OpenStreetMap Nominatim', en: 'Address search by OpenStreetMap Nominatim' },
  'search.clear': { id: 'Hapus pencarian', en: 'Clear search' },
  'layers.title': { id: 'Layer Peta', en: 'Map Layers' },
  'layers.filter': { id: 'Filter layer…', en: 'Filter layers…' },
  'layers.all': { id: 'Semua', en: 'All' },
  'layers.count': { id: 'fitur', en: 'features' },
  'layers.opacity': { id: 'Transparansi', en: 'Opacity' },
  'layers.legend': { id: 'Legenda', en: 'Legend' },
  'layers.empty': { id: 'Belum ada layer terbit.', en: 'No published layers yet.' },
  'layers.hide': { id: 'Sembunyikan semua', en: 'Hide all' },
  'layers.show': { id: 'Tampilkan semua', en: 'Show all' },
  'layers.download': { id: 'Unduh layer', en: 'Download layer' },
  'layers.more': { id: 'Detail layer', en: 'Layer details' },
  'basemap.title': { id: 'Basemap', en: 'Basemap' },
  'basemap.streets': { id: 'Jalan', en: 'Streets' },
  'basemap.satellite': { id: 'Citra Satelit', en: 'Satellite' },
  'basemap.light': { id: 'Terang', en: 'Light' },
  'tools.measureDistance': { id: 'Ukur jarak', en: 'Measure distance' },
  'tools.measureArea': { id: 'Ukur luas', en: 'Measure area' },
  'tools.print': { id: 'Cetak peta', en: 'Print map' },
  'tools.downloadImage': { id: 'Unduh gambar peta', en: 'Download map image' },
  'tools.share': { id: 'Bagikan tautan', en: 'Share link' },
  'tools.locate': { id: 'Lokasi saya', en: 'My location' },
  'tools.reset': { id: 'Kembali ke tampilan awal', en: 'Reset view' },
  'tools.layers': { id: 'Layer', en: 'Layers' },
  'tools.close': { id: 'Tutup panel', en: 'Close panel' },
  'measure.distance': { id: 'Jarak', en: 'Distance' },
  'measure.area': { id: 'Luas', en: 'Area' },
  'measure.hint': { id: 'Klik peta untuk menambah titik. Klik dua kali untuk mengakhiri.', en: 'Click the map to add points. Double-click to finish.' },
  'measure.clear': { id: 'Bersihkan', en: 'Clear' },
  'measure.finish': { id: 'Selesai', en: 'Finish' },
  'measure.points': { id: 'titik', en: 'points' },
  'measure.start': { id: 'Klik peta untuk mulai mengukur', en: 'Click the map to start measuring' },
  'info.title': { id: 'Informasi Lokasi', en: 'Location Information' },
  'info.address': { id: 'Alamat', en: 'Address' },
  'info.zone': { id: 'Zona', en: 'Zone' },
  'info.code': { id: 'Kode', en: 'Code' },
  'info.rules': { id: 'Ringkasan aturan', en: 'Rules summary' },
  'info.attributes': { id: 'Atribut', en: 'Attributes' },
  'info.selectedFeature': { id: 'Fitur terpilih', en: 'Selected feature' },
  'info.outside': { id: 'Titik ini berada di luar wilayah data terbit. Coba klik area yang memiliki layer pola ruang.', en: 'This point is outside published data. Try an area covered by a spatial plan layer.' },
  'info.loading': { id: 'Memeriksa lokasi…', en: 'Checking location…' },
  'info.close': { id: 'Tutup', en: 'Close' },
  'info.layersFound': { id: 'layer mencakup titik ini', en: 'layers cover this point' },
  'info.clickHint': { id: 'Klik peta untuk memeriksa peruntukan lahan di titik tersebut.', en: 'Click the map to check land use at that point.' },
  'share.copied': { id: 'Tautan disalin ke papan klip.', en: 'Link copied to clipboard.' },
  'share.failed': { id: 'Tidak dapat menyalin otomatis. Salin tautan dari bilah alamat.', en: 'Could not copy automatically. Copy the link from the address bar.' },
  'print.title': { id: 'Peta Tata Ruang', en: 'Spatial Plan Map' },
  'print.generated': { id: 'Dicetak', en: 'Printed' },
  'print.legend': { id: 'Legenda', en: 'Legend' },
  'print.note': { id: 'Dokumen ini dihasilkan dari portal GIS Tata Ruang. Data contoh untuk pembelajaran, bukan dokumen resmi.', en: 'This document was generated from the Tata Ruang GIS portal. Sample data for learning, not an official document.' },
  'about.title': { id: 'Tentang Portal', en: 'About the Portal' },
  'about.body': {
    id: 'Portal ini menyediakan peta tata ruang yang dapat diakses publik dan panel admin untuk mengelola data spasial. Data contoh mencakup pola ruang, batas administrasi, infrastruktur, aset, dan risiko di Kota Bandung.',
    en: 'This portal provides a publicly accessible spatial plan map and an admin panel for managing spatial data. Sample data covers spatial plans, administrative boundaries, infrastructure, assets, and risks in Bandung.',
  },
  'about.sourcesTitle': { id: 'Sumber data', en: 'Data sources' },
  'about.disclaimerTitle': { id: 'Disclaimer', en: 'Disclaimer' },
  'about.sources': {
    id: 'Basemap: OpenStreetMap, citra satelit Esri, dan Esri Light Gray. Pencarian alamat: OpenStreetMap Nominatim.',
    en: 'Basemap: OpenStreetMap, Esri satellite imagery, and Esri Light Gray. Address search: OpenStreetMap Nominatim.',
  },
  'about.disclaimer': {
    id: 'Proyek pembelajaran. Bukan sistem resmi instansi dan tidak boleh dipakai sebagai dasar hukum perizinan.',
    en: 'Learning project. Not an official government system and must not be used as a legal basis for permits.',
  },
  'about.close': { id: 'Mengerti', en: 'Got it' },
  'footer.data': { id: 'Data contoh untuk pembelajaran', en: 'Sample data for learning' },
  'footer.updated': { id: 'Diperbarui', en: 'Updated' },
  'common.loading': { id: 'Memuat…', en: 'Loading…' },
  'common.error': { id: 'Terjadi kesalahan.', en: 'Something went wrong.' },
  'common.retry': { id: 'Coba lagi', en: 'Retry' },
  'common.cancel': { id: 'Batal', en: 'Cancel' },
  'common.save': { id: 'Simpan', en: 'Save' },
  'common.close': { id: 'Tutup', en: 'Close' },
  'lang.label': { id: 'Bahasa', en: 'Language' },
};

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('gis_lang') === 'en' ? 'en' : 'id'));

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('gis_lang', lang);
  }, [lang]);

  const setLang = useCallback((value: Lang) => setLangState(value), []);
  const t = useCallback((key: string) => MESSAGES[key]?.[lang] ?? MESSAGES[key]?.id ?? key, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useI18n harus dipakai di dalam LanguageProvider');
  return context;
}
