import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileDown,
  History,
  Layers3,
  MapPin,
  MousePointer2,
  Palette,
  Pentagon,
  Save,
  Send,
  Slash,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { api, ApiError, downloadFile, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import type { Category, FeatureCollection, GeoFeature, Layer, LayerStyle, LayerVersion, ValidationResult } from '../../lib/types';
import {
  CATEGORY_ORDER,
  categoryLabel,
  formatDateTime,
  formatNumber,
  labelForAttribute,
  statusLabel,
  STATUS_META,
} from '../../lib/format';
import { MapView } from '../../components/MapView';
import { Badge, EmptyState, LoadingBlock, Modal } from '../../components/ui';

type DrawTool = 'select' | 'point' | 'linestring' | 'polygon';

const MODE_FOR_GEOMETRY: Record<string, DrawTool> = {
  Point: 'point',
  MultiPoint: 'point',
  LineString: 'linestring',
  MultiLineString: 'linestring',
  Polygon: 'polygon',
  MultiPolygon: 'polygon',
  Geometry: 'polygon',
};

function geometryGroup(geometryType: string): 'point' | 'line' | 'polygon' | 'mixed' {
  if (geometryType === 'Point' || geometryType === 'MultiPoint') return 'point';
  if (geometryType === 'LineString' || geometryType === 'MultiLineString') return 'line';
  if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') return 'polygon';
  return 'mixed';
}

function withDrawMode(features: GeoFeature[]): Array<Record<string, unknown>> {
  return features
    .filter((feature) => feature.geometry)
    .map((feature, index) => ({
      type: 'Feature',
      id: String(feature.id ?? index),
      geometry: feature.geometry,
      properties: {
        ...(feature.properties ?? {}),
        mode: MODE_FOR_GEOMETRY[feature.geometry?.type ?? ''] ?? 'polygon',
      },
    }));
}

function stripDrawProperties(fc: FeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((feature) => {
      const properties = { ...(feature.properties ?? {}) };
      delete properties.mode;
      return { ...feature, properties };
    }),
  };
}

function classificationColors(style: LayerStyle | undefined): string {
  return style?.classification?.classes[0]?.color ?? style?.fillColor ?? style?.lineColor ?? style?.circleColor ?? '#2f7d5a';
}

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useToast();

  const [layer, setLayer] = useState<Layer | null>(null);
  const [features, setFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<DrawTool>('select');
  const [tab, setTab] = useState<'style' | 'metadata'>('style');
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [changeSummary, setChangeSummary] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<LayerVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  const [styleForm, setStyleForm] = useState({
    fillColor: '#2f7d5a',
    fillOpacity: 0.62,
    lineColor: '#1b4d38',
    lineWidth: 1.4,
    circleColor: '#1f6feb',
    circleRadius: 6,
    circleStrokeColor: '#ffffff',
    classificationField: '',
  });
  const [classificationClasses, setClassificationClasses] = useState<Array<{ value: string; color: string }>>([]);
  const [metaForm, setMetaForm] = useState({
    name: '',
    description: '',
    category: 'pola_ruang' as Category,
    source: '',
    dataDate: '',
    rules: '',
  });
  const [hiddenAttributes, setHiddenAttributes] = useState<string[]>([]);

  const drawRef = useRef<TerraDraw | null>(null);
  const drawInitialized = useRef(false);
  const featuresRef = useRef(features);
  featuresRef.current = features;
  const mapRef = useRef<MapLibreMap | null>(null);
  const readonlyInitialized = useRef(false);

  const editable = useMemo(() => {
    if (!layer || !user) return false;
    if (layer.status === 'archived') return false;
    if (user.role === 'admin') return true;
    return layer.owner_id === user.id && layer.status !== 'published';
  }, [layer, user]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    drawInitialized.current = false;
    readonlyInitialized.current = false;
    try {
      const response = await api.get<{ layer: Layer; type: 'FeatureCollection'; features: GeoFeature[] }>(`/api/layers/${id}/features`);
      setLayer(response.layer);
      setFeatures({ type: 'FeatureCollection', features: response.features });
      const style = response.layer.style ?? {};
      setStyleForm({
        fillColor: style.fillColor ?? '#2f7d5a',
        fillOpacity: style.fillOpacity ?? 0.62,
        lineColor: style.lineColor ?? '#1b4d38',
        lineWidth: style.lineWidth ?? 1.4,
        circleColor: style.circleColor ?? '#1f6feb',
        circleRadius: style.circleRadius ?? 6,
        circleStrokeColor: style.circleStrokeColor ?? '#ffffff',
        classificationField: style.classification?.field ?? '',
      });
      setClassificationClasses(style.classification?.classes?.map((item) => ({ value: item.value, color: item.color })) ?? []);
      setMetaForm({
        name: response.layer.name,
        description: response.layer.description ?? '',
        category: response.layer.category,
        source: response.layer.source ?? '',
        dataDate: response.layer.data_date ?? '',
        rules: typeof response.layer.metadata?.rules === 'string' ? (response.layer.metadata.rules as string) : '',
      });
      setHiddenAttributes(response.layer.hidden_attributes ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
    };
  }, []);

  const handleMapReady = useCallback((readyMap: MapLibreMap) => {
    mapRef.current = readyMap;
    setMap(readyMap);
  }, []);

  // Inisialisasi Terra Draw atau tampilan baca-saja setelah peta dan data siap.
  useEffect(() => {
    if (!map || !layer || loading) return;

    if (!editable) {
      if (readonlyInitialized.current) return;
      readonlyInitialized.current = true;
      map.addSource('readonly-features', { type: 'geojson', data: featuresRef.current as never });
      map.addLayer({
        id: 'readonly-fill',
        type: 'fill',
        source: 'readonly-features',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': layer.style.fillColor ?? '#2f7d5a', 'fill-opacity': layer.style.fillOpacity ?? 0.5 },
      });
      map.addLayer({
        id: 'readonly-line',
        type: 'line',
        source: 'readonly-features',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': layer.style.lineColor ?? '#1b4d38', 'line-width': layer.style.lineWidth ?? 1.4 },
      });
      map.addLayer({
        id: 'readonly-point',
        type: 'circle',
        source: 'readonly-features',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': layer.style.circleColor ?? '#1f6feb', 'circle-radius': layer.style.circleRadius ?? 6 },
      });
      fitLayer();
      return;
    }

    if (drawInitialized.current) return;
    drawInitialized.current = true;

    const group = geometryGroup(layer.geometry_type);
    const modes: ConstructorParameters<typeof TerraDraw>[0]['modes'] = [
      new TerraDrawSelectMode({
        flags: {
          point: { feature: { draggable: true } },
          linestring: {
            feature: {
              draggable: true,
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
          polygon: {
            feature: {
              draggable: true,
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
        },
      }),
    ];
    if (group === 'point' || group === 'mixed') modes.push(new TerraDrawPointMode());
    if (group === 'line' || group === 'mixed') modes.push(new TerraDrawLineStringMode());
    if (group === 'polygon' || group === 'mixed') modes.push(new TerraDrawPolygonMode());

    let draw: TerraDraw | null = null;
    try {
      draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 9 }),
        modes,
        idStrategy: {
          isValidId: (featureId) => typeof featureId === 'string' && featureId.length > 0,
          getId: () => crypto.randomUUID(),
        },
      });
      draw.start();
      draw.setMode('select');
      const initial = withDrawMode(featuresRef.current.features);
      if (initial.length > 0) {
        const results = draw.addFeatures(initial as never);
        const rejected = results.filter((result) => !result.valid);
        if (rejected.length > 0) {
          notify(`${rejected.length} fitur tidak dapat dimuat ke editor (${rejected[0]?.reason ?? 'tidak diketahui'}).`, 'error');
        }
      }
      draw.on('change', () => {
        if (!draw) return;
        const snapshot = draw.getSnapshot() as unknown as FeatureCollection;
        const stripped = stripDrawProperties(snapshot);
        featuresRef.current = stripped;
        setFeatures(stripped);
      });
      drawRef.current = draw;
      fitLayer();
    } catch (caught) {
      drawInitialized.current = false;
      notify(`Editor geometri tidak dapat dimuat: ${errorMessage(caught)}`, 'error');
    }

    return () => {
      if (draw) {
        draw.stop();
        if (drawRef.current === draw) drawRef.current = null;
        drawInitialized.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, layer?.id, layer?.geometry_type, loading, editable]);

  function fitLayer(): void {
    if (!map) return;
    if (layer?.bbox) {
      const [minX, minY, maxX, maxY] = layer.bbox;
      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { padding: 70, maxZoom: 17, duration: 0 },
      );
    }
  }

  function selectTool(next: DrawTool): void {
    setTool(next);
    drawRef.current?.setMode(next);
  }

  const attributeFields = useMemo(() => {
    const fields = new Set<string>();
    for (const feature of features.features.slice(0, 200)) {
      for (const key of Object.keys(feature.properties ?? {})) {
        if (key !== 'mode') fields.add(key);
      }
    }
    if (layer) {
      for (const key of Object.keys(layer.attribute_labels ?? {})) fields.add(key);
    }
    return [...fields].sort((a, b) => a.localeCompare(b));
  }, [features, layer]);

  const uniqueValues = useMemo(() => {
    if (!styleForm.classificationField) return [];
    const values = new Set<string>();
    for (const feature of features.features) {
      const value = feature.properties?.[styleForm.classificationField];
      if (value !== null && value !== undefined && String(value).trim() !== '') values.add(String(value));
      if (values.size >= 10) break;
    }
    return [...values];
  }, [features, styleForm.classificationField]);

  useEffect(() => {
    if (!styleForm.classificationField) {
      setClassificationClasses([]);
      return;
    }
    const palette = ['#2f7d5a', '#e0a13b', '#4f7cac', '#eb5757', '#9b51e0', '#56ccf2', '#f2994a', '#e8c547', '#27ae60', '#c26b3b'];
    setClassificationClasses((current) =>
      uniqueValues.map((value, index) => ({
        value,
        color: current.find((item) => item.value === value)?.color ?? palette[index % palette.length],
      })),
    );
  }, [uniqueValues, styleForm.classificationField]);

  function updateAttribute(idValue: string, key: string, value: string): void {
    setFeatures((current) => {
      const next: FeatureCollection = {
        type: 'FeatureCollection',
        features: current.features.map((feature) =>
          String(feature.id) === idValue
            ? { ...feature, properties: { ...(feature.properties ?? {}), [key]: value } }
            : feature,
        ),
      };
      featuresRef.current = next;
      return next;
    });
  }

  async function saveFeatures(): Promise<void> {
    if (!layer) return;
    setSaving(true);
    try {
      const response = await api.put<{ message: string; version: number; featureCount: number }>(`/api/layers/${layer.id}/features`, {
        ...featuresRef.current,
        changeSummary: changeSummary.trim() || 'Perubahan geometri dan atribut',
      });
      notify(response.message, 'success');
      setSaveOpen(false);
      setChangeSummary('');
      setLayer((current) => (current ? { ...current, current_version: response.version, feature_count: response.featureCount } : current));
    } catch (caught) {
      if (caught instanceof ApiError && Array.isArray(caught.details)) {
        setValidation({
          valid: false,
          issues: caught.details as ValidationResult['issues'],
          featureCount: featuresRef.current.features.length,
          geometryTypes: [],
          totalAreaM2: 0,
          totalLengthKm: 0,
          vertexCount: 0,
        });
      }
      notify(errorMessage(caught), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function validateLayer(): Promise<void> {
    if (!layer) return;
    try {
      const response = await api.post<{ validation: ValidationResult }>(`/api/layers/${layer.id}/validate`);
      setValidation(response.validation);
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    }
  }

  async function submitLayer(): Promise<void> {
    if (!layer) return;
    if (!window.confirm('Ajukan layer ini untuk ditinjau admin? Pastikan perubahan sudah disimpan.')) return;
    setSaving(true);
    try {
      const response = await api.post<{ message: string }>(`/api/layers/${layer.id}/submit`);
      notify(response.message, 'success');
      setLayer((current) => (current ? { ...current, status: 'submitted' } : current));
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveStyle(): Promise<void> {
    if (!layer) return;
    setSaving(true);
    try {
      const style: LayerStyle = {
        fillColor: styleForm.fillColor,
        fillOpacity: styleForm.fillOpacity,
        lineColor: styleForm.lineColor,
        lineWidth: styleForm.lineWidth,
        lineOpacity: 0.9,
        circleColor: styleForm.circleColor,
        circleRadius: styleForm.circleRadius,
        circleStrokeColor: styleForm.circleStrokeColor,
      };
      if (styleForm.classificationField && classificationClasses.length > 0) {
        style.classification = {
          field: styleForm.classificationField,
          classes: classificationClasses.map((item) => ({ value: item.value, color: item.color, label: item.value })),
          fallbackColor: '#9aa8a2',
        };
      }
      const legend =
        style.classification?.classes.map((item) => ({ label: item.label ?? item.value, color: item.color })) ?? [
          { label: metaForm.name || layer.name, color: style.fillColor ?? style.lineColor ?? style.circleColor ?? '#2f7d5a' },
        ];
      await api.put(`/api/layers/${layer.id}/style`, { style, legend });
      setLayer((current) => (current ? { ...current, style, legend } : current));
      notify('Gaya layer disimpan.', 'success');
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveMetadata(): Promise<void> {
    if (!layer) return;
    setSaving(true);
    try {
      const metadata = { ...layer.metadata, rules: metaForm.rules };
      const response = await api.patch<{ layer: Layer }>(`/api/layers/${layer.id}`, {
        name: metaForm.name,
        description: metaForm.description,
        category: metaForm.category,
        source: metaForm.source,
        dataDate: metaForm.dataDate || null,
        metadata,
        hiddenAttributes,
      });
      setLayer(response.layer);
      notify('Metadata layer disimpan.', 'success');
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function openVersions(): Promise<void> {
    if (!layer) return;
    setVersionsOpen(true);
    setVersionsLoading(true);
    try {
      const response = await api.get<{ versions: LayerVersion[] }>(`/api/layers/${layer.id}/versions`);
      setVersions(response.versions);
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setVersionsLoading(false);
    }
  }

  async function restoreVersion(version: number): Promise<void> {
    if (!layer) return;
    if (!window.confirm(`Pulihkan versi ${version}? Versi saat ini tetap tersimpan.`)) return;
    setSaving(true);
    try {
      const response = await api.post<{ message: string }>(`/api/layers/${layer.id}/restore`, { version });
      notify(response.message, 'success');
      setVersionsOpen(false);
      await load();
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function download(path: string, filename: string): Promise<void> {
    try {
      await downloadFile(path, filename);
      notify('Unduhan dimulai.', 'success');
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    }
  }

  const group = layer ? geometryGroup(layer.geometry_type) : 'mixed';
  const canPoint = group === 'point' || group === 'mixed';
  const canLine = group === 'line' || group === 'mixed';
  const canPolygon = group === 'polygon' || group === 'mixed';

  if (loading) return <LoadingBlock label="Memuat layer dan fitur…" />;

  if (error || !layer) {
    return (
      <EmptyState
        icon={<AlertCircle size={22} />}
        title="Layer tidak dapat dimuat"
        description={error ?? 'Layer tidak ditemukan.'}
        action={
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => void load()}>
              Coba lagi
            </button>
            <Link to="/admin/layers" className="btn btn-outline">
              Kembali
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="page-stack editor-page">
      <div className="editor-header">
        <div className="editor-header-left">
          <button type="button" className="icon-button" onClick={() => navigate('/admin/layers')} aria-label="Kembali ke daftar layer">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="editor-title-row">
              <h2>{layer.name}</h2>
              <Badge tone={STATUS_META[layer.status]?.tone ?? 'neutral'}>{statusLabel(layer.status)}</Badge>
              <span className="version-chip">v{layer.current_version}</span>
            </div>
            <p>
              {categoryLabel(layer.category)} · {formatNumber(features.features.length)} fitur · {layer.geometry_type}
              {editable ? ' · perubahan tersimpan sebagai versi baru' : ' · mode baca-saja'}
            </p>
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void openVersions()}>
            <History size={15} /> Versi
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void download(`/api/layers/${layer.id}/export?format=geojson`, `${layer.slug}.geojson`)}
          >
            <Download size={15} /> GeoJSON
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void download(`/api/layers/${layer.id}/report.pdf`, `laporan-${layer.slug}.pdf`)}
          >
            <FileDown size={15} /> Laporan
          </button>
          {editable ? (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void validateLayer()}>
                <CheckCircle2 size={15} /> Validasi
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSaveOpen(true)}>
                <Save size={15} /> Simpan
              </button>
              {layer.status === 'draft' ? (
                <button type="button" className="btn btn-accent btn-sm" onClick={() => void submitLayer()} disabled={saving}>
                  <Send size={15} /> Ajukan
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {layer.rejection_note ? (
        <div className="alert alert-warning">
          <TriangleAlert size={17} />
          <span>
            <strong>Catatan penolakan dari admin:</strong> {layer.rejection_note}
          </span>
        </div>
      ) : null}

      {layer.status === 'submitted' ? (
        <div className="alert alert-info">
          <ClipboardCheck size={17} />
          <span>Layer sedang menunggu tinjauan admin. Perubahan baru akan membentuk versi tambahan.</span>
        </div>
      ) : null}

      <div className="editor-layout">
        <div className="editor-main">
          <div className="editor-map-wrap">
            <MapView
              center={layer.bbox ? [(layer.bbox[0] + layer.bbox[2]) / 2, (layer.bbox[1] + layer.bbox[3]) / 2] : [107.6191, -6.9175]}
              zoom={13}
              onReady={handleMapReady}
              ariaLabel={`Editor peta ${layer.name}`}
            />
            {editable ? (
              <div className="draw-toolbar" aria-label="Alat gambar">
                <button type="button" className={tool === 'select' ? 'active' : ''} onClick={() => selectTool('select')} title="Pilih dan geser fitur">
                  <MousePointer2 size={18} />
                </button>
                {canPoint ? (
                  <button type="button" className={tool === 'point' ? 'active' : ''} onClick={() => selectTool('point')} title="Gambar titik">
                    <MapPin size={18} />
                  </button>
                ) : null}
                {canLine ? (
                  <button type="button" className={tool === 'linestring' ? 'active' : ''} onClick={() => selectTool('linestring')} title="Gambar garis">
                    <Slash size={18} />
                  </button>
                ) : null}
                {canPolygon ? (
                  <button type="button" className={tool === 'polygon' ? 'active' : ''} onClick={() => selectTool('polygon')} title="Gambar poligon">
                    <Pentagon size={18} />
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="map-readonly-note">Mode baca-saja. Layer terbit hanya dapat diubah admin.</div>
            )}
            <div className="editor-map-hint">
              {editable
                ? 'Gunakan alat gambar, lalu pilih fitur untuk menggeser. Tekan Delete untuk menghapus fitur terpilih.'
                : 'Peta menampilkan geometri tersimpan.'}
            </div>
          </div>

          <section className="card attribute-card">
            <header className="card-header">
              <div>
                <h3>Tabel atribut</h3>
                <p>
                  {formatNumber(features.features.length)} fitur · {attributeFields.length} kolom
                  {features.features.length > 100 ? ' · menampilkan 100 fitur pertama' : ''}
                </p>
              </div>
            </header>
            {features.features.length === 0 ? (
              <p className="muted-text">Belum ada fitur. Gunakan alat gambar di peta untuk menambah fitur.</p>
            ) : (
              <div className="table-wrap attribute-table-wrap">
                <table className="data-table attribute-table">
                  <thead>
                    <tr>
                      <th className="sticky-col">ID</th>
                      {attributeFields.map((field) => (
                        <th key={field}>{labelForAttribute(field, layer.attribute_labels)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {features.features.slice(0, 100).map((feature, index) => (
                      <tr key={String(feature.id ?? index)}>
                        <td className="mono sticky-col">{String(feature.id ?? index).slice(0, 12)}</td>
                        {attributeFields.map((field) => (
                          <td key={field}>
                            <input
                              className="inline-input"
                              value={String(feature.properties?.[field] ?? '')}
                              disabled={!editable}
                              onChange={(event) => updateAttribute(String(feature.id ?? index), field, event.target.value)}
                              aria-label={`${labelForAttribute(field, layer.attribute_labels)} fitur ${index + 1}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="editor-side">
          <div className="editor-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'style'} className={tab === 'style' ? 'active' : ''} onClick={() => setTab('style')}>
              <Palette size={15} /> Gaya
            </button>
            <button type="button" role="tab" aria-selected={tab === 'metadata'} className={tab === 'metadata' ? 'active' : ''} onClick={() => setTab('metadata')}>
              <Layers3 size={15} /> Metadata
            </button>
          </div>

          {tab === 'style' ? (
            <section className="card side-card">
              <div className="form-grid">
                <label className="field">
                  <span>Warna isian</span>
                  <input type="color" value={styleForm.fillColor} disabled={!editable} onChange={(event) => setStyleForm((current) => ({ ...current, fillColor: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Opasitas isian</span>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={Math.round(styleForm.fillOpacity * 100)}
                    disabled={!editable}
                    onChange={(event) => setStyleForm((current) => ({ ...current, fillOpacity: Number(event.target.value) / 100 }))}
                  />
                </label>
                <label className="field">
                  <span>Warna garis</span>
                  <input type="color" value={styleForm.lineColor} disabled={!editable} onChange={(event) => setStyleForm((current) => ({ ...current, lineColor: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Lebar garis</span>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.2}
                    value={styleForm.lineWidth}
                    disabled={!editable}
                    onChange={(event) => setStyleForm((current) => ({ ...current, lineWidth: Number(event.target.value) }))}
                  />
                </label>
                <label className="field">
                  <span>Warna titik</span>
                  <input type="color" value={styleForm.circleColor} disabled={!editable} onChange={(event) => setStyleForm((current) => ({ ...current, circleColor: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Radius titik</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={styleForm.circleRadius}
                    disabled={!editable}
                    onChange={(event) => setStyleForm((current) => ({ ...current, circleRadius: Number(event.target.value) }))}
                  />
                </label>
                <label className="field">
                  <span>Klasifikasi berdasarkan kolom</span>
                  <select
                    value={styleForm.classificationField}
                    disabled={!editable}
                    onChange={(event) => setStyleForm((current) => ({ ...current, classificationField: event.target.value }))}
                  >
                    <option value="">Tanpa klasifikasi</option>
                    {attributeFields.map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {classificationClasses.length > 0 ? (
                <div className="class-list">
                  {classificationClasses.map((item) => (
                    <label key={item.value} className="class-row">
                      <input
                        type="color"
                        value={item.color}
                        disabled={!editable}
                        onChange={(event) =>
                          setClassificationClasses((current) =>
                            current.map((entry) => (entry.value === item.value ? { ...entry, color: event.target.value } : entry)),
                          )
                        }
                      />
                      <span>{item.value}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {editable ? (
                <button type="button" className="btn btn-primary btn-block btn-sm" onClick={() => void saveStyle()} disabled={saving}>
                  <Save size={15} /> Simpan gaya
                </button>
              ) : null}
            </section>
          ) : (
            <section className="card side-card">
              <div className="form-grid">
                <label className="field">
                  <span>Nama layer</span>
                  <input value={metaForm.name} disabled={!editable} onChange={(event) => setMetaForm((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Kategori</span>
                  <select value={metaForm.category} disabled={!editable} onChange={(event) => setMetaForm((current) => ({ ...current, category: event.target.value as Category }))}>
                    {CATEGORY_ORDER.map((category) => (
                      <option key={category} value={category}>
                        {categoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Deskripsi</span>
                  <textarea rows={3} value={metaForm.description} disabled={!editable} onChange={(event) => setMetaForm((current) => ({ ...current, description: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Ringkasan aturan zona</span>
                  <textarea
                    rows={3}
                    value={metaForm.rules}
                    disabled={!editable}
                    onChange={(event) => setMetaForm((current) => ({ ...current, rules: event.target.value }))}
                    placeholder="Aturan pemanfaatan ruang yang tampil di portal publik…"
                  />
                </label>
                <label className="field">
                  <span>Sumber data</span>
                  <input value={metaForm.source} disabled={!editable} onChange={(event) => setMetaForm((current) => ({ ...current, source: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Tanggal data</span>
                  <input type="date" value={metaForm.dataDate} disabled={!editable} onChange={(event) => setMetaForm((current) => ({ ...current, dataDate: event.target.value }))} />
                </label>
              </div>

              {attributeFields.length > 0 ? (
                <div className="hidden-fields">
                  <h4>Kolom disembunyikan dari publik</h4>
                  <div className="checkbox-grid">
                    {attributeFields.map((field) => (
                      <label key={field}>
                        <input
                          type="checkbox"
                          checked={hiddenAttributes.includes(field)}
                          disabled={!editable}
                          onChange={(event) =>
                            setHiddenAttributes((current) =>
                              event.target.checked ? [...current, field] : current.filter((item) => item !== field),
                            )
                          }
                        />
                        {field}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {editable ? (
                <button type="button" className="btn btn-primary btn-block btn-sm" onClick={() => void saveMetadata()} disabled={saving}>
                  <Save size={15} /> Simpan metadata
                </button>
              ) : null}
            </section>
          )}
        </aside>
      </div>

      <Modal
        open={saveOpen}
        title="Simpan perubahan"
        onClose={() => setSaveOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              Batal
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void saveFeatures()} disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan versi baru'}
            </button>
          </>
        }
      >
        <p>Seluruh perubahan geometri dan atribut akan disimpan sebagai versi baru. Versi lama tetap dapat dipulihkan.</p>
        <label className="field">
          <span>Ringkasan perubahan (opsional)</span>
          <input
            value={changeSummary}
            onChange={(event) => setChangeSummary(event.target.value)}
            placeholder="Contoh: Memperbaiki batas zona R-1 dan menambah 3 sekolah"
            maxLength={300}
          />
        </label>
      </Modal>

      <Modal open={Boolean(validation)} title="Hasil validasi" onClose={() => setValidation(null)} width={620}>
        {validation ? (
          <div>
            <div className={`validation-banner ${validation.valid ? 'ok' : 'fail'}`}>
              {validation.valid ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}
              <span>
                {validation.valid
                  ? `Lolos validasi · ${formatNumber(validation.featureCount)} fitur`
                  : `Ditemukan ${validation.issues.filter((issue) => issue.severity === 'error').length} error`}
              </span>
            </div>
            {validation.issues.length > 0 ? (
              <ul className="issue-list">
                {validation.issues.map((issue, index) => (
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
              <p className="muted-text">Tidak ada masalah geometri maupun atribut.</p>
            )}
            <div className="validation-stats">
              <span>Luas: {formatNumber(validation.totalAreaM2 / 1_000_000, 2)} km²</span>
              <span>Panjang: {formatNumber(validation.totalLengthKm, 2)} km</span>
              <span>Vertex: {formatNumber(validation.vertexCount)}</span>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={versionsOpen} title="Riwayat versi" onClose={() => setVersionsOpen(false)} width={700}>
        {versionsLoading ? <LoadingBlock label="Memuat versi…" /> : null}
        {!versionsLoading && versions.length === 0 ? <p className="muted-text">Belum ada versi.</p> : null}
        <ul className="version-list">
          {versions.map((version) => (
            <li key={version.version}>
              <span className="version-number">v{version.version}</span>
              <div>
                <strong>{version.change_summary ?? 'Perubahan data'}</strong>
                <small>
                  {formatNumber(version.feature_count)} fitur · {version.created_by_name ?? 'Sistem'} · {formatDateTime(version.created_at)}
                </small>
              </div>
              {editable ? (
                <button type="button" className="btn btn-outline btn-xs" onClick={() => void restoreVersion(version.version)} disabled={saving}>
                  Pulihkan
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </Modal>

      <div className="editor-footer">
        <span>Sumber: {layer.source ?? '-'}</span>
        <span>Terakhir diperbarui {formatDateTime(layer.updated_at)}</span>
        <span>Kolom disembunyikan: {layer.hidden_attributes.length}</span>
        <span style={{ color: classificationColors(layer.style) }}>●</span>
        <Link to="/admin/layers">Kembali ke daftar layer</Link>
      </div>
    </div>
  );
}
