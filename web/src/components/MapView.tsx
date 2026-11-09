import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { BusinessX } from '../lib/api.ts';

const COLORS: Record<string, string> = { has_site: '#c2410c', social_only: '#0f8a5f', none_found: '#0f8a5f', unverified: '#d97706' };

/** Mapa com tiles do OpenStreetMap (carregados pelo navegador do usuário). */
export function MapView({ items, selected, onSelect, center }: { items: BusinessX[]; selected?: string; onSelect?: (id: string) => void; center?: [number, number] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(center ?? [-23.55, -46.63], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© colaboradores do OpenStreetMap' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const b of items) {
      if (b.lat == null || b.lon == null) continue;
      pts.push([b.lat, b.lon]);
      const m = L.circleMarker([b.lat, b.lon], {
        radius: b.id === selected ? 9 : 6,
        color: '#fff',
        weight: 2,
        fillColor: COLORS[b.websiteStatus] ?? '#666',
        fillOpacity: 0.95,
      }).bindTooltip(b.name);
      m.on('click', () => onSelect?.(b.id));
      m.addTo(layer.current);
    }
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 16 });
    else if (center) map.current.setView(center, 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selected]);

  return <div ref={el} className="map" />;
}
