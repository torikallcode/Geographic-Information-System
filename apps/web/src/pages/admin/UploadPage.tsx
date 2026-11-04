import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as turf from '@turf/turf';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileUp,
  Layers3,
  MapPin,
  Palette,
  Save,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { CRS_OPTIONS } from '../../lib/crs';
import type { FeatureCollection, ImportPreview, LayerStyle, LegendItem } from '../../lib/types';
import { CATEGORY_ORDER, categoryLabel, formatNumber, labelForAttribute } from '../../lib/format';
import { MapView } from '../../components/MapView';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { LoadingBlock } from '../../components/ui';

const PALETTE = ['#2f7d5a', '#e0a13b', '#4f7cac', '#eb5757', '#9b51e0', '#56ccf2', '#f2994a', '#e8c547', '#27ae60', '#c26b3b'];

interface MetadataState {
  name: string;
  description: string;
  category: string;
  source: string;
  dataDate: string;
}

interface PreviewMapProps {
  data: FeatureCollection;
  bbox: [number, number, number, number] | null;
}

function PreviewMap({ data, bbox }: PreviewMapProps) {
  const [map, setMap] = useState<MapLibreMap | null>(null);

  const handleReady = useCallback(
    (readyMap: MapLibreMap) => {
      readyMap.addSource('import-preview', { type: 'geojson', data: data as never });
      readyMap.addLayer({
        id: 'import-fill',
        type: 'fill',
        source: 'import-preview',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#2f7d5a', 'fill-opacity': 0.42 },
      });
      readyMap.addLayer({
        id: 'import-line',
        type: 'line',
        source: 'import-preview',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#1f5c43', 'line-width': 1.4 },
      });
      readyMap.addLayer({
        id: 'import-point',
        type: 'circle',
        source: 'import-preview',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': '#1f6feb', 'circle-radius': 6, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
      });

      if (bbox) {
        readyMap.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 50, maxZoom: 16, duration: 0 },
        );
      } else {
        try {
          const bounds = turf.bbox(data as never);
          readyMap.fitBounds(
            [
              [bounds[0], bounds[1]],
              [bounds[2], bounds[3]],
            ],
            { padding: 50, maxZoom: 16, duration: 0 },
          );
        } catch {
          readyMap.setCenter([107.6191, -6.9175]);
          readyMap.setZoom(12);
        }
      }
      setMap(readyMap);
    },
    // Preview dibuat sekali per data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="preview-map">
      <MapView center={[107.6191, -6.9175]} zoom={11} onReady={handleReady} ariaLabel="Pratinjau data yang diunggah" />
      {map ? <span className="preview-map-badge">Pratinjau · {formatNumber(data.features.length)} fitur</span> : null}
    </div>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const { notify } = useToast();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [sourceCrs, setSourceCrs] = useState('EPSG:4326');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiddenAttributes, setHiddenAttributes] = useState<string[]>([]);
  const [attributeLabels, setAttributeLabels] = useState<Record<string, string>>({});
  const [classificationField, setClassificationField] = useState('');
  const [classes, setClasses] = useState<Array<{ value: string; color: string }>>([]);
  const [baseStyle, setBaseStyle] = useState({
    fillColor: '#2f7d5a',
    fillOpacity: 0.62,
    lineColor: '#1b4d38',
    lineWidth: 1.4,
    circleColor: '#1f6feb',
    circleRadius: 6,
    circleStrokeColor: '#ffffff',
  });
  const [meta, setMeta] = useState<MetadataState>({
    name: '',
    description: '',
    category: 'pola_ruang',
    source: '',
    dataDate: '',
  });

  function handleFile(event: ChangeEvent<HTMLInputElement>): void {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    setError(null);
    if (selected) {
      const base = selected.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      if (!meta.name) setMeta((current) => ({ ...current, name: base }));
    }
  }

  async function runPreview(): Promise<void> {
    if (!file) {
      setError('Pilih berkas terlebih dahulu.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sourceCrs', sourceCrs);
      const response = await api.post<ImportPreview>('/api/import/preview', formData);
      setPreview(response);
      setStep(2);
      setAttributeLabels(Object.fromEntries(response.fields.map((field) => [field, labelForAttribute(field)])));
      setHiddenAttributes([]);
      setClassificationField('');
      setClasses([]);
      if (response.geometryType === 'LineString' || response.geometryType === 'MultiLineString') {
        setBaseStyle((current) => ({ ...current, lineColor: '#37474f', lineWidth: 2.4 }));
      }
      if (!meta.name) {
        setMeta((current) => ({
          ...current,
          name: response.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(),
        }));
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUploading(false);
    }
  }

  const uniqueValues = useMemo(() => {
    if (!preview || !classificationField) return [];
    const values = new Set<string>();
    for (const feature of preview.preview.features) {
      const value = feature.properties?.[classificationField];
      if (value !== null && value !== undefined && String(value).trim() !== '') values.add(String(value));
      if (values.size >= 10) break;
    }
    return [...values];
  }, [preview, classificationField]);

  useEffect(() => {
    setClasses((current) =>
      uniqueValues.map((value, index) => ({
        value,
        color: current.find((item) => item.value === value)?.color ?? PALETTE[index % PALETTE.length],
      })),
    );
  }, [uniqueValues]);

  const stylePayload: LayerStyle = useMemo(() => {
    const base: LayerStyle = {
      fillColor: baseStyle.fillColor,
      fillOpacity: baseStyle.fillOpacity,
      lineColor: baseStyle.lineColor,
      lineWidth: baseStyle.lineWidth,
      lineOpacity: 0.9,
      circleColor: baseStyle.circleColor,
      circleRadius: baseStyle.circleRadius,
      circleStrokeColor: baseStyle.circleStrokeColor,
    };
    if (classificationField && classes.length > 0) {
      return { ...base, classification: { field: classificationField, classes, fallbackColor: '#9aa8a2' } };
    }
    return base;
  }, [baseStyle, classificationField, classes]);

  const legendPayload: LegendItem[] = useMemo(() => {
    if (classificationField && classes.length > 0) {
      return classes.map((item) => ({ label: item.value, color: item.color }));
    }
    const color =
      preview?.geometryType === 'Point' || preview?.geometryType === 'MultiPoint'
        ? baseStyle.circleColor
        : baseStyle.fillColor;
    return [{ label: meta.name || 'Layer baru', color }];
  }, [classificationField, classes, preview, baseStyle, meta.name]);

  async function commit(): Promise<void> {
    if (!preview) return;
    if (!meta.name.trim()) {
      setError('Nama layer wajib diisi.');
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const response = await api.post<{ layer: { id: string } }>('/api/import/commit', {
        importId: preview.importId,
        layer: {
          name: meta.name.trim(),
          description: meta.description.trim(),
          category: meta.category,
          source: meta.source.trim(),
          dataDate: meta.dataDate || null,
          metadata: {
            originalFilename: preview.filename,
            importCrs: preview.detectedCrs,
            importedAt: new Date().toISOString(),
          },
          attributeLabels,
          hiddenAttributes,
          style: stylePayload,
          legend: legendPayload,
        },
        geometryType: preview.geometryType,
      });
      notify('Layer berhasil dibuat sebagai draf.', 'success');
      navigate(`/admin/layers/${response.layer.id}/edit`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setCommitting(false);
    }
  }

  const errorCount = preview?.validation.issues.filter((issue) => issue.severity === 'error').length ?? 0;
  const warningCount = preview?.validation.issues.filter((issue) => issue.severity === 'warning').length ?? 0;
  const canCommit = Boolean(preview && preview.validation.valid && !committing);

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="page-toolbar-copy">
          <h2>Impor data spasial</h2>
          <p>Unggah berkas, periksa validasi, cocokkan atribut, lalu simpan sebagai draf.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate('/admin/layers')}>
          <ArrowLeft size={15} /> Kembali
        </button>
      </div>

      <ol className="wizard-steps" aria-label="Langkah impor">
        {['Sumber data', 'Pratinjau & atribut', 'Simpan'].map((label, index) => (
          <li key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}>
            <span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {error ? (
        <div className="alert alert-error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="card upload-card">
          <div className="upload-dropzone">
            <span className="upload-icon">
              <UploadCloud size={30} />
            </span>
            <h3>Pilih berkas data spasial</h3>
            <p>GeoJSON, Shapefile (.zip), KML, atau CSV koordinat. Maksimum 50 MB.</p>
            <label className="btn btn-primary file-button">
              <FileUp size={16} /> Pilih berkas
              <input type="file" accept=".geojson,.json,.zip,.kml,.csv" onChange={handleFile} hidden />
            </label>
            {file ? (
              <div className="selected-file">
                <FileUp size={16} />
                <span>
                  <strong>{file.name}</strong>
                  <small>{formatNumber(file.size / 1024, 1)} KB</small>
                </span>
              </div>
            ) : null}
          </div>

          <div className="upload-options">
            <label className="field">
              <span>Sistem koordinat sumber</span>
              <select value={sourceCrs} onChange={(event) => setSourceCrs(event.target.value)}>
                {CRS_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>Shapefile dengan berkas .prj akan diproyeksikan otomatis oleh pembaca. Pilih manual bila .prj tidak ada.</small>
            </label>

            <label className="field">
              <span>Nama layer</span>
              <input
                value={meta.name}
                onChange={(event) => setMeta((current) => ({ ...current, name: event.target.value }))}
                placeholder="Contoh: Pola Ruang Kecamatan Sukajadi"
              />
            </label>

            <label className="field">
              <span>Kategori</span>
              <select value={meta.category} onChange={(event) => setMeta((current) => ({ ...current, category: event.target.value }))}>
                {CATEGORY_ORDER.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="card-actions">
            <button type="button" className="btn btn-primary" onClick={() => void runPreview()} disabled={!file || uploading}>
              {uploading ? 'Membaca berkas…' : 'Lanjut ke pratinjau'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 && preview ? (
        <div className="wizard-preview-grid">
          <div className="wizard-preview-main">
            <section className="card">
              <header className="card-header">
                <div>
                  <h3>Pratinjau geometri</h3>
                  <p>{preview.filename} · {preview.detectedCrs}</p>
                </div>
                <Layers3 size={18} className="muted-icon" />
              </header>
              <PreviewMap data={preview.preview} bbox={preview.bbox} />
            </section>

            <section className="card">
              <header className="card-header">
                <div>
                  <h3>Hasil validasi</h3>
                  <p>
                    {formatNumber(preview.featureCount)} fitur · {preview.geometryTypes.join(', ')}
                  </p>
                </div>
                {preview.validation.valid ? (
                  <span className="validation-pill ok">
                    <CheckCircle2 size={14} /> Lolos
                  </span>
                ) : (
                  <span className="validation-pill fail">
                    <TriangleAlert size={14} /> Perlu perbaikan
                  </span>
                )}
              </header>

              <div className="validation-summary">
                <div>
                  <span>Error</span>
                  <strong className={errorCount > 0 ? 'danger-text' : ''}>{errorCount}</strong>
                </div>
                <div>
                  <span>Peringatan</span>
                  <strong className={warningCount > 0 ? 'warn-text' : ''}>{warningCount}</strong>
                </div>
                <div>
                  <span>Luas total</span>
                  <strong>{formatNumber(preview.validation.totalAreaM2 / 1_000_000, 2)} km²</strong>
                </div>
                <div>
                  <span>Panjang total</span>
                  <strong>{formatNumber(preview.validation.totalLengthKm, 2)} km</strong>
                </div>
              </div>

              {preview.warnings.length > 0 ? (
                <ul className="issue-list">
                  {preview.warnings.map((warning) => (
                    <li key={warning} className="issue-warning">
                      <TriangleAlert size={14} /> {warning}
                    </li>
                  ))}
                </ul>
              ) : null}

              {preview.validation.issues.length > 0 ? (
                <ul className="issue-list">
                  {preview.validation.issues.slice(0, 20).map((issue, index) => (
                    <li key={`${issue.code}-${index}`} className={issue.severity === 'error' ? 'issue-error' : 'issue-warning'}>
                      {issue.severity === 'error' ? <AlertCircle size={14} /> : <TriangleAlert size={14} />}
                      <span>
                        {issue.message}
                        {issue.featureIndex !== undefined ? ` (fitur #${issue.featureIndex + 1})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-text">Tidak ditemukan masalah geometri maupun atribut.</p>
              )}
            </section>

            <section className="card">
              <header className="card-header">
                <div>
                  <h3>Pencocokan atribut</h3>
                  <p>Ubah label tampilan atau sembunyikan kolom sensitif dari publik.</p>
                </div>
                <MapPin size={18} className="muted-icon" />
              </header>
              <div className="table-wrap">
                <table className="data-table attribute-mapping">
                  <thead>
                    <tr>
                      <th>Kolom asli</th>
                      <th>Label tampilan</th>
                      <th className="align-center">Sembunyikan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.fields.slice(0, 60).map((field) => (
                      <tr key={field}>
                        <td className="mono">{field}</td>
                        <td>
                          <input
                            className="inline-input"
                            value={attributeLabels[field] ?? ''}
                            onChange={(event) => setAttributeLabels((current) => ({ ...current, [field]: event.target.value }))}
                          />
                        </td>
                        <td className="align-center">
                          <input
                            type="checkbox"
                            checked={hiddenAttributes.includes(field)}
                            onChange={(event) =>
                              setHiddenAttributes((current) =>
                                event.target.checked ? [...current, field] : current.filter((item) => item !== field),
                              )
                            }
                            aria-label={`Sembunyikan ${field}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.fields.length > 60 ? <p className="muted-text small">Menampilkan 60 kolom pertama dari {preview.fields.length} kolom.</p> : null}
            </section>
          </div>

          <aside className="wizard-preview-side">
            <section className="card">
              <header className="card-header">
                <div>
                  <h3>Gaya layer</h3>
                  <p>Warna dan klasifikasi awal</p>
                </div>
                <Palette size={18} className="muted-icon" />
              </header>
              <div className="form-grid">
                <label className="field">
                  <span>Warna isian / titik</span>
                  <input
                    type="color"
                    value={preview.geometryType === 'Point' ? baseStyle.circleColor : baseStyle.fillColor}
                    onChange={(event) =>
                      setBaseStyle((current) =>
                        preview.geometryType === 'Point'
                          ? { ...current, circleColor: event.target.value }
                          : { ...current, fillColor: event.target.value },
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>Warna garis</span>
                  <input type="color" value={baseStyle.lineColor} onChange={(event) => setBaseStyle((current) => ({ ...current, lineColor: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Opasitas isian</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(baseStyle.fillOpacity * 100)}
                    onChange={(event) => setBaseStyle((current) => ({ ...current, fillOpacity: Number(event.target.value) / 100 }))}
                  />
                </label>
                <label className="field">
                  <span>Klasifikasi berdasarkan kolom</span>
                  <select value={classificationField} onChange={(event) => setClassificationField(event.target.value)}>
                    <option value="">Tanpa klasifikasi</option>
                    {preview.fields.map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {classificationField && classes.length > 0 ? (
                <div className="class-list">
                  {classes.map((item) => (
                    <label key={item.value} className="class-row">
                      <input
                        type="color"
                        value={item.color}
                        onChange={(event) =>
                          setClasses((current) =>
                            current.map((entry) => (entry.value === item.value ? { ...entry, color: event.target.value } : entry)),
                          )
                        }
                      />
                      <span>{item.value}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="card">
              <header className="card-header">
                <div>
                  <h3>Metadata layer</h3>
                  <p>Informasi yang tampil di portal</p>
                </div>
              </header>
              <div className="form-grid">
                <label className="field">
                  <span>Nama layer</span>
                  <input value={meta.name} onChange={(event) => setMeta((current) => ({ ...current, name: event.target.value }))} required />
                </label>
                <label className="field">
                  <span>Kategori</span>
                  <select value={meta.category} onChange={(event) => setMeta((current) => ({ ...current, category: event.target.value }))}>
                    {CATEGORY_ORDER.map((category) => (
                      <option key={category} value={category}>
                        {categoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Deskripsi</span>
                  <textarea
                    rows={3}
                    value={meta.description}
                    onChange={(event) => setMeta((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Ringkasan isi layer dan aturan penting…"
                  />
                </label>
                <label className="field">
                  <span>Sumber data</span>
                  <input value={meta.source} onChange={(event) => setMeta((current) => ({ ...current, source: event.target.value }))} placeholder="Instansi / berkas sumber" />
                </label>
                <label className="field">
                  <span>Tanggal data</span>
                  <input type="date" value={meta.dataDate} onChange={(event) => setMeta((current) => ({ ...current, dataDate: event.target.value }))} />
                </label>
              </div>
            </section>

            <div className="card-actions sticky-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
                <ArrowLeft size={15} /> Ganti berkas
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)} disabled={!preview.validation.valid}>
                Lanjut <ArrowRight size={15} />
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {step === 3 && preview ? (
        <div className="card confirm-card">
          <header className="card-header">
            <div>
              <h3>Simpan sebagai draf</h3>
              <p>Periksa ringkasan berikut sebelum menyimpan.</p>
            </div>
            <Save size={18} className="muted-icon" />
          </header>

          <dl className="confirm-grid">
            <div>
              <dt>Nama layer</dt>
              <dd>{meta.name || '-'}</dd>
            </div>
            <div>
              <dt>Kategori</dt>
              <dd>{categoryLabel(meta.category)}</dd>
            </div>
            <div>
              <dt>Jumlah fitur</dt>
              <dd>{formatNumber(preview.featureCount)}</dd>
            </div>
            <div>
              <dt>Tipe geometri</dt>
              <dd>{preview.geometryType}</dd>
            </div>
            <div>
              <dt>Sistem koordinat</dt>
              <dd>{preview.detectedCrs}</dd>
            </div>
            <div>
              <dt>Kolom disembunyikan</dt>
              <dd>{hiddenAttributes.length > 0 ? hiddenAttributes.join(', ') : 'Tidak ada'}</dd>
            </div>
          </dl>

          <div className="alert alert-info">
            <CheckCircle2 size={17} />
            <span>
              Layer akan disimpan sebagai <strong>draf</strong> dan belum tampil publik. Setelah diperiksa, ajukan penerbitan agar admin dapat meninjau.
            </span>
          </div>

          <div className="card-actions">
            <button type="button" className="btn btn-outline" onClick={() => setStep(2)} disabled={committing}>
              <ArrowLeft size={15} /> Kembali
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void commit()} disabled={!canCommit}>
              {committing ? 'Menyimpan…' : 'Simpan sebagai draf'}
            </button>
          </div>
        </div>
      ) : null}

      {uploading ? <LoadingBlock label="Membaca dan memvalidasi berkas…" /> : null}
    </div>
  );
}
