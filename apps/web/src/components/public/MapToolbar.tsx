import { useEffect, useRef, useState } from 'react';
import { Check, Download, LocateFixed, Map as MapIcon, Printer, RotateCcw, Ruler, Share2, SquareDashed } from 'lucide-react';
import { BASEMAPS, type BasemapId } from '../../lib/mapStyle';
import { useI18n } from '../../lib/i18n';

export function MapToolbar({
  basemap,
  onBasemap,
  measureMode,
  onMeasure,
  onPrint,
  onDownloadImage,
  onShare,
  onLocate,
  onReset,
}: {
  basemap: BasemapId;
  onBasemap: (id: BasemapId) => void;
  measureMode: 'distance' | 'area' | null;
  onMeasure: (mode: 'distance' | 'area') => void;
  onPrint: () => void;
  onDownloadImage: () => void;
  onShare: () => void;
  onLocate: () => void;
  onReset: () => void;
}) {
  const { t, lang } = useI18n();
  const [basemapOpen, setBasemapOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setBasemapOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="map-toolbar" aria-label="Alat peta">
      <div className="tool-group" ref={menuRef}>
        <button
          type="button"
          className={`map-tool ${basemapOpen ? 'active' : ''}`}
          onClick={() => setBasemapOpen((open) => !open)}
          aria-label={t('basemap.title')}
          aria-expanded={basemapOpen}
          data-tooltip={t('basemap.title')}
        >
          <MapIcon size={19} />
          <span className="tool-basemap-label">{BASEMAPS[basemap].label[lang]}</span>
        </button>
        {basemapOpen ? (
          <div className="basemap-menu" role="menu">
            <h4>{t('basemap.title')}</h4>
            {Object.values(BASEMAPS).map((option) => (
              <button
                type="button"
                key={option.id}
                className={`basemap-option ${basemap === option.id ? 'active' : ''}`}
                onClick={() => {
                  onBasemap(option.id);
                  setBasemapOpen(false);
                }}
                role="menuitem"
              >
                <span className={`basemap-preview basemap-preview-${option.id}`} />
                <span>{option.label[lang]}</span>
                {basemap === option.id ? <Check size={15} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="tool-divider" />

      <button
        type="button"
        className={`map-tool ${measureMode === 'distance' ? 'active' : ''}`}
        onClick={() => onMeasure('distance')}
        aria-label={t('tools.measureDistance')}
        aria-pressed={measureMode === 'distance'}
        data-tooltip={t('tools.measureDistance')}
      >
        <Ruler size={19} />
      </button>
      <button
        type="button"
        className={`map-tool ${measureMode === 'area' ? 'active' : ''}`}
        onClick={() => onMeasure('area')}
        aria-label={t('tools.measureArea')}
        aria-pressed={measureMode === 'area'}
        data-tooltip={t('tools.measureArea')}
      >
        <SquareDashed size={19} />
      </button>

      <div className="tool-divider" />

      <button type="button" className="map-tool" onClick={onPrint} aria-label={t('tools.print')} data-tooltip={t('tools.print')}>
        <Printer size={19} />
      </button>
      <button type="button" className="map-tool" onClick={onDownloadImage} aria-label={t('tools.downloadImage')} data-tooltip={t('tools.downloadImage')}>
        <Download size={19} />
      </button>
      <button type="button" className="map-tool" onClick={onShare} aria-label={t('tools.share')} data-tooltip={t('tools.share')}>
        <Share2 size={19} />
      </button>
      <button type="button" className="map-tool" onClick={onLocate} aria-label={t('tools.locate')} data-tooltip={t('tools.locate')}>
        <LocateFixed size={19} />
      </button>
      <button type="button" className="map-tool" onClick={onReset} aria-label={t('tools.reset')} data-tooltip={t('tools.reset')}>
        <RotateCcw size={19} />
      </button>
    </div>
  );
}
