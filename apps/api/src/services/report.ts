import PDFDocument from 'pdfkit';
import type { CollectionSummary } from './versionCompare';
import type { ValidationResult } from '../types';

export interface ReportLayerInfo {
  name: string;
  description?: string | null;
  category: string;
  status: string;
  owner_name?: string | null;
  source?: string | null;
  data_date?: string | null;
  geometry_type: string;
  feature_count: number;
  current_version: number;
  updated_at: string;
}

export interface ReportCategoryRow {
  category: string;
  featureCount: number;
  areaM2: number;
  lengthKm?: number;
}

export interface LayerReportInput {
  layer: ReportLayerInfo;
  summary: CollectionSummary;
  categories: ReportCategoryRow[];
  validation?: ValidationResult | null;
  versions: Array<{ version: number; change_summary: string | null; feature_count: number; created_at: string; created_by_name?: string | null }>;
  generatedAt: Date;
}

export interface AnalysisReportInput {
  title: string;
  type: string;
  createdAt: string;
  createdBy?: string | null;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  generatedAt: Date;
}

const COLORS = {
  ink: '#17332a',
  muted: '#5b6f67',
  accent: '#2f7d5a',
  line: '#d7e2dc',
  danger: '#b23c3c',
  warning: '#a86b12',
};

function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value);
}

function formatArea(areaM2: number): string {
  if (areaM2 >= 1_000_000) return `${formatNumber(areaM2 / 1_000_000)} km²`;
  return `${formatNumber(areaM2)} m²`;
}

function createDoc(): PDFKit.PDFDocument {
  return new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Creator: 'GIS Tata Ruang' } });
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, title: string, subtitle?: string): void {
  doc.fillColor(COLORS.accent).fontSize(10).text('PORTAL GIS TATA RUANG', { characterSpacing: 1.5 });
  doc.moveDown(0.4);
  doc.fillColor(COLORS.ink).fontSize(22).font('Helvetica-Bold').text(title);
  if (subtitle) {
    doc.moveDown(0.2);
    doc.fillColor(COLORS.muted).fontSize(10).font('Helvetica').text(subtitle);
  }
  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(COLORS.line).lineWidth(1).stroke();
  doc.moveDown(1);
}

function keyValue(doc: PDFKit.PDFDocument, label: string, value: string): void {
  const y = doc.y;
  doc.fillColor(COLORS.muted).fontSize(9).font('Helvetica').text(label.toUpperCase(), 50, y, { width: 140, characterSpacing: 0.5 });
  doc.fillColor(COLORS.ink).fontSize(10).font('Helvetica').text(value, 195, y, { width: 350 });
  doc.moveDown(0.55);
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.6);
  doc.fillColor(COLORS.ink).fontSize(13).font('Helvetica-Bold').text(title);
  doc.moveDown(0.4);
}

function table(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  widths: number[],
): void {
  if (rows.length === 0) {
    doc.fillColor(COLORS.muted).fontSize(9).font('Helvetica-Oblique').text('Tidak ada data.');
    doc.moveDown(0.5);
    return;
  }
  const startX = 50;
  let y = doc.y;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.muted);
  let x = startX;
  headers.forEach((header, index) => {
    doc.text(header.toUpperCase(), x, y, { width: widths[index], characterSpacing: 0.3 });
    x += widths[index];
  });
  doc.moveDown(0.2);
  y = doc.y;
  doc.moveTo(startX, y).lineTo(545, y).strokeColor(COLORS.line).stroke();
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink);

  for (const row of rows) {
    if (doc.y > 750) {
      doc.addPage();
      y = doc.y;
    }
    const rowY = doc.y;
    x = startX;
    row.forEach((cell, index) => {
      doc.text(cell, x, rowY, { width: widths[index] - 6, lineBreak: true });
      x += widths[index];
    });
    doc.moveDown(0.35);
  }
}

function footer(doc: PDFKit.PDFDocument, generatedAt: Date): void {
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(index);
    doc
      .fillColor(COLORS.muted)
      .fontSize(8)
      .font('Helvetica')
      .text(
        `Dibuat ${generatedAt.toLocaleString('id-ID')} · GIS Tata Ruang · Halaman ${index + 1} dari ${pages.count}`,
        50,
        790,
        { width: 495, align: 'center' },
      );
  }
}

export async function buildLayerReport(input: LayerReportInput): Promise<Buffer> {
  const doc = createDoc();
  header(doc, input.layer.name, 'Laporan ringkas layer tata ruang');
  keyValue(doc, 'Kategori', input.layer.category);
  keyValue(doc, 'Status', input.layer.status);
  keyValue(doc, 'Tipe geometri', input.layer.geometry_type);
  keyValue(doc, 'Pemilik', input.layer.owner_name ?? '-');
  keyValue(doc, 'Sumber', input.layer.source ?? '-');
  keyValue(doc, 'Tanggal data', input.layer.data_date ?? '-');
  keyValue(doc, 'Jumlah fitur', formatNumber(input.layer.feature_count, 0));
  keyValue(doc, 'Luas total', formatArea(input.summary.areaM2));
  keyValue(doc, 'Panjang total', `${formatNumber(input.summary.lengthKm)} km`);
  keyValue(doc, 'Versi', `v${input.layer.current_version}`);
  keyValue(doc, 'Terakhir diperbarui', new Date(input.layer.updated_at).toLocaleString('id-ID'));
  if (input.layer.description) {
    sectionTitle(doc, 'Deskripsi');
    doc.fillColor(COLORS.ink).fontSize(10).font('Helvetica').text(input.layer.description, { width: 495 });
  }

  sectionTitle(doc, 'Statistik per kategori atribut');
  table(
    doc,
    ['Kategori', 'Fitur', 'Luas', 'Panjang'],
    input.categories.map((row) => [
      row.category,
      formatNumber(row.featureCount, 0),
      formatArea(row.areaM2),
      `${formatNumber(row.lengthKm ?? 0)} km`,
    ]),
    [250, 80, 110, 105],
  );

  if (input.validation) {
    sectionTitle(doc, 'Hasil validasi geometri');
    doc
      .fillColor(input.validation.valid ? COLORS.accent : COLORS.danger)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(input.validation.valid ? 'Lolos validasi' : 'Perlu perbaikan');
    doc.moveDown(0.3);
    if (input.validation.issues.length === 0) {
      doc.fillColor(COLORS.muted).fontSize(9).font('Helvetica').text('Tidak ditemukan masalah geometri maupun atribut.');
      doc.moveDown(0.4);
    } else {
      input.validation.issues.slice(0, 30).forEach((issue) => {
        doc
          .fillColor(issue.severity === 'error' ? COLORS.danger : COLORS.warning)
          .fontSize(9)
          .font('Helvetica')
          .text(`• [${issue.severity === 'error' ? 'Error' : 'Peringatan'}] ${issue.message}${issue.featureIndex !== undefined ? ` (fitur #${issue.featureIndex + 1})` : ''}`);
      });
      doc.moveDown(0.4);
    }
  }

  sectionTitle(doc, 'Riwayat versi');
  table(
    doc,
    ['Versi', 'Fitur', 'Ringkasan', 'Oleh', 'Waktu'],
    input.versions.map((version) => [
      `v${version.version}`,
      formatNumber(version.feature_count, 0),
      version.change_summary ?? '-',
      version.created_by_name ?? '-',
      new Date(version.created_at).toLocaleString('id-ID'),
    ]),
    [55, 55, 220, 100, 115],
  );

  footer(doc, input.generatedAt);
  return collect(doc);
}

export async function buildAnalysisReport(input: AnalysisReportInput): Promise<Buffer> {
  const doc = createDoc();
  header(doc, input.title, `Laporan analisis spasial · ${input.type}`);
  keyValue(doc, 'Jenis analisis', input.type);
  keyValue(doc, 'Dibuat oleh', input.createdBy ?? '-');
  keyValue(doc, 'Waktu dibuat', new Date(input.createdAt).toLocaleString('id-ID'));

  sectionTitle(doc, 'Parameter');
  for (const [key, value] of Object.entries(input.params)) {
    keyValue(doc, key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }

  sectionTitle(doc, 'Hasil');
  for (const [key, value] of Object.entries(input.result)) {
    if (key === 'geojson' || key === 'features' || key === 'preview') continue;
    keyValue(doc, key, typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
  }

  if (typeof input.result.geojson === 'object' && input.result.geojson !== null) {
    const geojson = input.result.geojson as { features?: unknown[] };
    if (Array.isArray(geojson.features)) {
      sectionTitle(doc, 'Cuplikan geometri');
      doc
        .fillColor(COLORS.muted)
        .fontSize(9)
        .font('Helvetica')
        .text(`Hasil memuat ${geojson.features.length} geometri. Ekspor GeoJSON dari halaman analisis untuk detail lengkap.`);
    }
  }

  footer(doc, input.generatedAt);
  return collect(doc);
}
