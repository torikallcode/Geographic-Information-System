import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { buildMapStyle } from '../lib/mapStyle';

interface MapViewProps {
  center: [number, number];
  zoom: number;
  onReady: (map: MapLibreMap) => void;
  className?: string;
  ariaLabel?: string;
}

export function MapView({ center, zoom, onReady, className, ariaLabel }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle('streets'),
      center,
      zoom,
      minZoom: 2,
      maxZoom: 21,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      attributionControl: false,
    });

    if (import.meta.env.DEV) {
      (window as unknown as { __gisMap?: MapLibreMap }).__gisMap = map;
    }
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left');
    map.on('load', () => readyRef.current(map));

    return () => {
      map.remove();
    };
    // Map dibuat sekali; perubahan center/zoom dikendalikan lewat instance peta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className ?? 'map-canvas'} role="application" aria-label={ariaLabel ?? 'Peta interaktif'} />;
}

export type { MapLibreMap };
