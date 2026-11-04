import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  Download,
  Layers3,
  LayoutTemplate,
  Map,
  Route,
  Search,
  X,
  ZoomIn,
} from 'lucide-react';
import type { Category, Layer } from '../../lib/types';
import { CATEGORY_ORDER, categoryLabel, formatDate, formatNumber } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { downloadFile } from '../../lib/api';
import { useToast } from '../../lib/toast';

const CATEGORY_ICONS: Record<Category, ReactNode> = {
  pola_ruang: <LayoutTemplate size={15} />,
  administrasi: <Map size={15} />,
  infrastruktur: <Route size={15} />,
  aset: <Building2 size={15} />,
  risiko: <AlertTriangle size={15} />,
};

function layerColor(layer: Layer): string {
  return (
    layer.style.classification?.classes[0]?.color ??
    layer.style.fillColor ??
    layer.style.lineColor ??
    layer.style.circleColor ??
    '#2f7d5a'
  );
}

export function LayerPanel({
  layers,
  enabled,
  opacity,
  onToggle,
  onOpacity,
  onToggleAll,
  onZoom,
  onClose,
}: {
  layers: Layer[];
  enabled: Record<string, boolean>;
  opacity: Record<string, number>;
  onToggle: (id: string, value: boolean) => void;
  onOpacity: (id: string, value: number) => void;
  onToggleAll: (value: boolean) => void;
  onZoom: (layer: Layer) => void;
  onClose?: () => void;
}) {
  const { t, lang } = useI18n();
  const { notify } = useToast();
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return layers;
    return layers.filter(
      (layer) =>
        layer.name.toLowerCase().includes(keyword) ||
        (layer.description ?? '').toLowerCase().includes(keyword) ||
        categoryLabel(layer.category, lang).toLowerCase().includes(keyword),
    );
  }, [filter, layers, lang]);

  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        items: filtered.filter((layer) => layer.category === category),
      })).filter((group) => group.items.length > 0),
    [filtered],
  );

  const enabledCount = layers.filter((layer) => enabled[layer.id]).length;

  async function downloadLayer(layer: Layer, format: 'geojson' | 'csv'): Promise<void> {
    try {
      await downloadFile(`/api/public/layers/${layer.id}/export?format=${format}`, `${layer.slug}.${format === 'geojson' ? 'geojson' : 'csv'}`);
      notify(`${layer.name} diunduh (${format.toUpperCase()}).`, 'success');
    } catch (error) {
      notify((error as Error).message || 'Unduhan gagal.', 'error');
    }
  }

  return (
    <aside className="layer-panel" aria-label={t('layers.title')}>
      <div className="panel-header">
        <div>
          <h2>
            <Layers3 size={18} /> {t('layers.title')}
          </h2>
          <span>
            {layers.length} {lang === 'id' ? 'layer terbit' : 'published layers'} · {enabledCount} {lang === 'id' ? 'aktif' : 'active'}
          </span>
        </div>
        {onClose ? (
          <button type="button" className="icon-button panel-close" onClick={onClose} aria-label={t('tools.close')}>
            <X size={18} />
          </button>
        ) : null}
      </div>

      <div className="panel-tools">
        <label className="input-with-icon">
          <Search size={15} />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('layers.filter')}
            aria-label={t('layers.filter')}
          />
        </label>
        <div className="bulk-actions">
          <button type="button" onClick={() => onToggleAll(true)}>
            {t('layers.show')}
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => onToggleAll(false)}>
            {t('layers.hide')}
          </button>
        </div>
      </div>

      <div className="layer-groups">
        {groups.length === 0 ? <p className="panel-empty">{t('layers.empty')}</p> : null}
        {groups.map((group) => (
          <section className="layer-group" key={group.category}>
            <h3>
              {CATEGORY_ICONS[group.category]}
              {categoryLabel(group.category, lang)}
              <span>{group.items.length}</span>
            </h3>
            {group.items.map((layer) => {
              const isOpen = expanded === layer.id;
              const isOn = Boolean(enabled[layer.id]);
              const value = opacity[layer.id] ?? 1;
              return (
                <article className={`layer-item ${isOn ? 'is-on' : ''}`} key={layer.id}>
                  <div className="layer-item-main">
                    <label className="switch" aria-label={`${t('layers.title')}: ${layer.name}`}>
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={(event) => onToggle(layer.id, event.target.checked)}
                      />
                      <span className="switch-track" aria-hidden="true" />
                    </label>
                    <button
                      type="button"
                      className="layer-item-title"
                      onClick={() => setExpanded(isOpen ? null : layer.id)}
                      aria-expanded={isOpen}
                    >
                      <span className="layer-name">
                        <span className="layer-dot" style={{ background: layerColor(layer) }} />
                        {layer.name}
                      </span>
                      <span className="layer-meta">
                        {formatNumber(layer.feature_count)} {t('layers.count')} · {layer.geometry_type}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`icon-button chevron ${isOpen ? 'open' : ''}`}
                      onClick={() => setExpanded(isOpen ? null : layer.id)}
                      aria-label={isOpen ? 'Tutup detail' : 'Buka detail'}
                      aria-expanded={isOpen}
                    >
                      <ChevronDown size={15} />
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="layer-item-details">
                      {layer.description ? <p className="layer-description">{layer.description}</p> : null}

                      <label className="opacity-control">
                        <span>
                          {t('layers.opacity')} <b>{Math.round(value * 100)}%</b>
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(value * 100)}
                          onChange={(event) => onOpacity(layer.id, Number(event.target.value) / 100)}
                          aria-label={`${t('layers.opacity')} ${layer.name}`}
                        />
                      </label>

                      {layer.legend.length > 0 ? (
                        <div className="legend">
                          <h4>{t('layers.legend')}</h4>
                          <ul>
                            {layer.legend.map((item) => (
                              <li key={`${item.label}-${item.color}`}>
                                <span className="legend-swatch" style={{ background: item.color }} />
                                <span>
                                  <b>{item.label}</b>
                                  {item.description ? <small>{item.description}</small> : null}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <dl className="layer-facts">
                        {layer.source ? (
                          <div>
                            <dt>Sumber</dt>
                            <dd>{layer.source}</dd>
                          </div>
                        ) : null}
                        <div>
                          <dt>{t('footer.updated')}</dt>
                          <dd>{formatDate(layer.updated_at ?? layer.published_at, lang)}</dd>
                        </div>
                      </dl>

                      <div className="layer-actions">
                        <button type="button" className="btn btn-outline btn-xs" onClick={() => onZoom(layer)}>
                          <ZoomIn size={13} /> Zoom
                        </button>
                        <button type="button" className="btn btn-outline btn-xs" onClick={() => void downloadLayer(layer, 'geojson')}>
                          <Download size={13} /> GeoJSON
                        </button>
                        <button type="button" className="btn btn-outline btn-xs" onClick={() => void downloadLayer(layer, 'csv')}>
                          <Download size={13} /> CSV
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ))}
      </div>

      <div className="panel-foot">
        <span className="live-dot" aria-hidden="true" />
        {t('footer.data')}
      </div>
    </aside>
  );
}
