import { AlertCircle, MapPin, X } from 'lucide-react';
import type { MapSelection } from '../../lib/types';
import { attributeValue, categoryLabel, labelForAttribute } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Spinner } from '../ui';

const INTERNAL_KEYS = new Set(['fid', 'id', 'layer_id', 'bukan_atribut']);

function AttributeList({
  attributes,
  labels,
  limit = 14,
}: {
  attributes: Record<string, unknown>;
  labels: Record<string, string>;
  limit?: number;
}) {
  const entries = Object.entries(attributes)
    .filter(([key]) => !INTERNAL_KEYS.has(key) && !key.startsWith('_'))
    .slice(0, limit);
  if (entries.length === 0) return null;
  return (
    <dl className="attribute-list">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{labelForAttribute(key, labels)}</dt>
          <dd>{attributeValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InfoPanel({ selection, onClose }: { selection: MapSelection; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [lon, lat] = selection.lngLat;

  return (
    <aside className="info-panel" aria-label={t('info.title')} aria-live="polite">
      <div className="panel-header">
        <div>
          <h2>
            <MapPin size={18} /> {t('info.title')}
          </h2>
          <span className="coordinate-chip">
            {lat.toFixed(6)}, {lon.toFixed(6)}
          </span>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t('info.close')}>
          <X size={18} />
        </button>
      </div>

      <div className="info-body">
        {selection.loading ? (
          <div className="info-loading">
            <Spinner size={20} />
            <span>{t('info.loading')}</span>
          </div>
        ) : null}

        {!selection.loading && selection.address ? (
          <div className="info-address">
            <span>{t('info.address')}</span>
            <p>{selection.address}</p>
          </div>
        ) : null}

        {!selection.loading && selection.matches.length > 0 ? (
          <div className="zone-summary">
            <span className="info-section-label">
              {selection.matches.length} {t('info.layersFound')}
            </span>
            {selection.matches.map((match) => {
              const zoneName =
                String(match.attributes.zona ?? match.attributes.nama ?? match.attributes.subzona ?? match.layer_name);
              const code = match.attributes.kode ?? match.attributes.subzona ?? null;
              const rules =
                typeof match.rules === 'string'
                  ? match.rules
                  : typeof match.metadata?.rules === 'string'
                    ? (match.metadata.rules as string)
                    : null;
              const color =
                match.style?.fillColor ??
                match.style?.classification?.fallbackColor ??
                match.legend?.[0]?.color ??
                '#2f7d5a';

              return (
                <article className="zone-card" key={`${match.layer_id}-${match.fid}`}>
                  <header>
                    <span className="zone-color" style={{ background: color }} />
                    <div>
                      <h3>{zoneName}</h3>
                      <small>
                        {match.layer_name} · {categoryLabel(match.category, lang)}
                      </small>
                    </div>
                    {code !== null && code !== '' ? <span className="zone-code">{String(code)}</span> : null}
                  </header>
                  {rules ? (
                    <div className="zone-rules">
                      <span>{t('info.rules')}</span>
                      <p>{rules}</p>
                    </div>
                  ) : null}
                  <AttributeList attributes={match.attributes} labels={match.attribute_labels} />
                </article>
              );
            })}
          </div>
        ) : null}

        {!selection.loading && selection.feature ? (
          <div className="feature-card">
            <h3>
              {t('info.selectedFeature')}
              <small>{selection.feature.layerName}</small>
            </h3>
            <AttributeList attributes={selection.feature.properties} labels={selection.feature.attributeLabels} limit={18} />
          </div>
        ) : null}

        {!selection.loading && !selection.feature && selection.matches.length === 0 ? (
          <div className="info-empty">
            <AlertCircle size={22} />
            <p>{selection.error ?? selection.outsideMessage ?? t('info.outside')}</p>
          </div>
        ) : null}

        {!selection.loading && selection.matches.length === 0 && selection.feature ? (
          <div className="info-empty subtle">
            <AlertCircle size={18} />
            <p>{selection.outsideMessage ?? t('info.outside')}</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
