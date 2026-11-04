import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { LocateFixed, Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Spinner } from '../ui';

interface SearchResult {
  label: string;
  lat: number;
  lon: number;
  type: string;
  bbox?: [number, number, number, number];
}

export function SearchBox({ map }: { map: MapLibreMap | null }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      markerRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(() => void runSearch(query), 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function runSearch(value: string): Promise<void> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setWarning(null);
    try {
      const response = await api.get<{ results: SearchResult[]; warning?: string }>(
        `/api/public/search?q=${encodeURIComponent(value.trim())}`,
        { signal: controller.signal },
      );
      setResults(response.results);
      setWarning(response.warning ?? null);
      setOpen(true);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setResults([]);
        setWarning('Layanan pencarian tidak dapat dihubungi.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function selectResult(result: SearchResult): void {
    if (!map) return;
    setSelectedLabel(result.label);
    setOpen(false);
    markerRef.current?.remove();
    markerRef.current = new maplibregl.Marker({ color: '#1f7a54' }).setLngLat([result.lon, result.lat]).addTo(map);
    if (result.bbox && result.bbox.length === 4) {
      map.fitBounds(
        [
          [result.bbox[0], result.bbox[1]],
          [result.bbox[2], result.bbox[3]],
        ],
        { padding: 90, maxZoom: 16, duration: 1200 },
      );
    } else {
      map.flyTo({ center: [result.lon, result.lat], zoom: 16, essential: true });
    }
  }

  function clear(): void {
    setQuery('');
    setResults([]);
    setSelectedLabel(null);
    setOpen(false);
    markerRef.current?.remove();
    markerRef.current = null;
  }

  return (
    <div className="search-box" ref={containerRef}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim().length >= 2) void runSearch(query);
        }}
      >
        <span className="search-icon" aria-hidden="true">
          {loading ? <Spinner size={17} /> : <Search size={17} />}
        </span>
        <input
          type="search"
          value={query}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedLabel(null);
            setOpen(true);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        />
        {query ? (
          <button type="button" className="search-clear" onClick={clear} aria-label={t('search.clear')}>
            <X size={15} />
          </button>
        ) : (
          <span className="search-hint" aria-hidden="true">
            <LocateFixed size={14} />
          </span>
        )}
      </form>

      {open && (results.length > 0 || loading || (query.trim().length >= 3 && !loading)) ? (
        <div className="search-dropdown" id="search-results" role="listbox">
          {loading ? (
            <div className="search-status">
              <Spinner size={15} /> {t('search.searching')}
            </div>
          ) : results.length === 0 ? (
            <div className="search-status">{warning ?? t('search.noResults')}</div>
          ) : (
            <>
              {results.map((result, index) => (
                <button
                  type="button"
                  key={`${result.lat}-${result.lon}-${index}`}
                  className="search-result"
                  onClick={() => selectResult(result)}
                  role="option"
                  aria-selected={false}
                >
                  <span className="search-result-icon">
                    <LocateFixed size={15} />
                  </span>
                  <span>
                    <strong>{result.type === 'coordinate' ? t('search.coordinate') : result.type}</strong>
                    <small>{result.label}</small>
                  </span>
                </button>
              ))}
              <div className="search-attribution">{t('search.attribution')}</div>
            </>
          )}
        </div>
      ) : null}

      {selectedLabel ? <div className="search-selected">{selectedLabel}</div> : null}
    </div>
  );
}
