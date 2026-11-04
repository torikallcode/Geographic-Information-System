import { describe, expect, it } from 'vitest';
import { parseImportBuffer } from '../src/services/importService';

describe('impor berkas', () => {
  it('membaca CSV dengan kolom lat/lon', async () => {
    const csv = 'nama,lat,lon,kategori\nSekolah A,-6.9,107.6,Pendidikan\nSekolah B,-6.91,107.61,Pendidikan\n';
    const result = await parseImportBuffer(Buffer.from(csv, 'utf8'), 'sekolah.csv');
    expect(result.featureCount).toBe(2);
    expect(result.geometryType).toBe('Point');
    expect(result.fields).toContain('nama');
    expect(result.geojson.features[0].geometry?.type).toBe('Point');
    expect(result.validation.valid).toBe(true);
  });

  it('melewati baris CSV tanpa koordinat valid', async () => {
    const csv = 'nama,lat,lon\nValid,-6.9,107.6\nRusak,,,\n';
    const result = await parseImportBuffer(Buffer.from(csv, 'utf8'), 'data.csv');
    expect(result.featureCount).toBe(1);
    expect(result.warnings.join(' ')).toContain('1 baris dilewati');
  });

  it('membaca GeoJSON dan memberi ID fitur', async () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [107.6, -6.9] },
          properties: { nama: 'Titik A' },
        },
      ],
    };
    const result = await parseImportBuffer(Buffer.from(JSON.stringify(geojson)), 'titik.geojson');
    expect(result.featureCount).toBe(1);
    expect(result.geojson.features[0].id).toBe('f-1');
  });

  it('membaca KML sederhana', async () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Lokasi Uji</name>
      <Point><coordinates>107.6191,-6.9175,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;
    const result = await parseImportBuffer(Buffer.from(kml, 'utf8'), 'lokasi.kml');
    expect(result.featureCount).toBe(1);
    expect(result.geojson.features[0].geometry?.type).toBe('Point');
  });

  it('menolak format yang tidak didukung', async () => {
    await expect(parseImportBuffer(Buffer.from('abc'), 'data.txt')).rejects.toThrow(/tidak didukung/i);
  });

  it('menolak CSV tanpa kolom koordinat', async () => {
    await expect(parseImportBuffer(Buffer.from('nama,nilai\nA,1\n', 'utf8'), 'data.csv')).rejects.toThrow(/kolom koordinat/i);
  });
});
