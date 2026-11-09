// OpenStreetMap: geocodificação (Nominatim) e busca de estabelecimentos
// (Overpass, com Nominatim como reserva). Dados © colaboradores do OpenStreetMap, ODbL.
// Respeita as políticas de uso: identificação no User-Agent, 1 req/s no Nominatim,
// cache de geocodificação e consultas limitadas.

import { db, json, now } from '../db.ts';
import type { Address } from '../../../shared/types.ts';
import { getSegment, SEGMENTS } from '../../../shared/segments.ts';
import { fetchJson, HttpError, rateLimiter } from './http.ts';

const NOMINATIM = (process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const OVERPASS_URLS = (process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass.kumi.systems/api/interpreter')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const OSM_ATTRIBUTION = 'Dados © colaboradores do OpenStreetMap (ODbL)';

const nominatimQueue = rateLimiter(1100);

// Disjuntor: se todos os servidores Overpass falharem, evita novas tentativas por alguns minutos.
let overpassDownUntil = 0;
const OVERPASS_COOLDOWN_MS = 10 * 60 * 1000;
export const overpassStatus = () => ({ available: Date.now() >= overpassDownUntil, retryAt: overpassDownUntil ? new Date(overpassDownUntil).toISOString() : undefined });

export interface Area {
  label: string;
  lat: number;
  lon: number;
  bbox: [number, number, number, number]; // sul, norte, oeste, leste
  radius?: number;
}

export interface RawPlace {
  ref: string;
  name: string;
  lat?: number;
  lon?: number;
  tags: Record<string, string>;
  address: Address;
  provider: 'overpass' | 'nominatim';
}

interface NominatimResult {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  addresstype?: string;
  name?: string;
  display_name: string;
  boundingbox: [string, string, string, string];
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
}

const AREA_TYPES = new Set(['suburb', 'neighbourhood', 'quarter', 'city_district', 'borough', 'city', 'town', 'village', 'municipality', 'county', 'state_district', 'hamlet']);

function nominatimUrl(path: string, params: Record<string, string | number | undefined>) {
  const u = new URL(`${NOMINATIM}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, String(v));
  if (process.env.OSM_CONTACT_EMAIL) u.searchParams.set('email', process.env.OSM_CONTACT_EMAIL);
  return u.toString();
}

/** Resolve cidade/bairro em uma área geográfica (com cache local). */
export async function geocodeArea(query: string): Promise<Area> {
  const key = query.trim().toLowerCase();
  const cached = db.prepare('SELECT result FROM geocache WHERE query = ?').get(key) as { result: string } | undefined;
  if (cached) return json<Area>(cached.result, null as any);

  const results = await nominatimQueue(() =>
    fetchJson<NominatimResult[]>(nominatimUrl('search', { q: query, format: 'jsonv2', limit: 6, layer: 'address', countrycodes: 'br' })),
  );
  if (!results.length) throw new HttpError(404, `Local "${query}" não encontrado no OpenStreetMap.`);
  const best = results.find((r) => AREA_TYPES.has(r.addresstype ?? r.type)) ?? results[0]!;
  const [s, n, w, e] = best.boundingbox.map(Number) as [number, number, number, number];
  const area: Area = {
    label: best.display_name.split(',').slice(0, 3).join(',').trim(),
    lat: Number(best.lat),
    lon: Number(best.lon),
    bbox: [s, n, w, e],
  };
  db.prepare('INSERT OR REPLACE INTO geocache (query, result, created_at) VALUES (?,?,?)').run(key, JSON.stringify(area), now());
  return area;
}

function bboxFromRadius(lat: number, lon: number, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lat + dLat, lon - dLon, lon + dLon];
}

export function areaWithRadius(area: Area, radius?: number): Area {
  if (!radius) return area;
  return { ...area, radius, bbox: bboxFromRadius(area.lat, area.lon, radius) };
}

function addressFromTags(t: Record<string, string>): Address {
  const a: Address = {
    street: t['addr:street'],
    number: t['addr:housenumber'],
    suburb: t['addr:suburb'] ?? t['addr:neighbourhood'],
    city: t['addr:city'],
    state: t['addr:state'],
    postcode: t['addr:postcode'],
  };
  a.formatted = formatAddress(a);
  return a;
}

export function formatAddress(a: Address): string | undefined {
  const line1 = [a.street, a.number].filter(Boolean).join(', ');
  const parts = [line1, a.suburb, [a.city, a.state].filter(Boolean).join(' - '), a.postcode].filter((p) => p && p.trim());
  return parts.length ? parts.join(', ') : undefined;
}

function escapeOverpassRegex(s: string) {
  return s.replace(/[\\".*+?^${}()|[\]]/g, '\\$&');
}

export interface PlaceSearch {
  area: Area;
  segments: string[]; // ids de segmento; vazio = todos
  name?: string;
  limit?: number;
}

export interface PlaceSearchResult {
  places: RawPlace[];
  provider: 'overpass' | 'nominatim';
  partial: boolean;
  warnings: string[];
}

/** Busca estabelecimentos. Tenta Overpass (completo); se indisponível, usa Nominatim (parcial). */
export async function searchPlaces(q: PlaceSearch): Promise<PlaceSearchResult> {
  const warnings: string[] = [];
  if (Date.now() < overpassDownUntil) {
    warnings.push('Overpass temporariamente indisponível. Usando a busca de reserva do Nominatim, que retorna menos resultados por área.');
  } else {
    try {
      const places = await searchOverpass(q);
      return { places, provider: 'overpass', partial: places.length >= (q.limit ?? 300), warnings };
    } catch (e: any) {
      overpassDownUntil = Date.now() + OVERPASS_COOLDOWN_MS;
      warnings.push(`Overpass indisponível (${e.message}). Usando a busca de reserva do Nominatim, que retorna menos resultados por área.`);
    }
  }
  const { places, partial } = await searchNominatim(q);
  return { places, provider: 'nominatim', partial, warnings };
}

async function searchOverpass(q: PlaceSearch): Promise<RawPlace[]> {
  const segs = q.segments.length ? q.segments.map(getSegment) : SEGMENTS;
  const filters = Array.from(new Set(segs.flatMap((s) => s.osmFilters)));
  const [s, n, w, e] = q.area.bbox;
  const areaClause = q.area.radius ? `(around:${Math.round(q.area.radius)},${q.area.lat},${q.area.lon})` : `(${s},${w},${n},${e})`;
  const nameClause = q.name ? `["name"~"${escapeOverpassRegex(q.name)}",i]` : '["name"]';
  const body = filters.map((f) => `  nwr${f}${nameClause}${areaClause};`).join('\n');
  const query = `[out:json][timeout:45];\n(\n${body}\n);\nout center tags ${q.limit ?? 300};`;

  let lastErr: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      const data = await fetchJson<{ elements: any[] }>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
        timeoutMs: 25000,
      });
      return data.elements
        .filter((el) => el.tags?.name)
        .map((el) => {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          return { ref: `osm:${el.type}/${el.id}`, name: el.tags.name, lat, lon, tags: el.tags, address: addressFromTags(el.tags), provider: 'overpass' as const };
        });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass indisponível');
}

/** Consultas Nominatim equivalentes a cada segmento. */
const NOMINATIM_QUERIES: Record<string, Record<string, string>[]> = {
  cafe: [{ amenity: 'cafe' }],
  restaurant: [{ amenity: 'restaurant' }],
  pizzeria: [{ q: 'pizzaria' }, { q: 'pizza' }],
  bakery: [{ amenity: 'bakery' }, { q: 'padaria' }],
  bar: [{ amenity: 'bar' }, { amenity: 'pub' }],
  ice_cream: [{ amenity: 'ice_cream' }, { q: 'sorveteria' }],
  barbershop: [{ q: 'barbearia' }, { q: 'barber' }],
  beauty_salon: [{ amenity: 'hairdresser' }, { amenity: 'beauty' }],
  clothing: [{ amenity: 'clothes' }],
  pet_shop: [{ amenity: 'pet' }, { q: 'pet shop' }],
  retail: [{ amenity: 'florist' }, { amenity: 'gift' }, { amenity: 'optician' }, { amenity: 'shoes' }],
};

async function searchNominatim(q: PlaceSearch): Promise<{ places: RawPlace[]; partial: boolean }> {
  const [s, n, w, e] = q.area.bbox;
  const viewbox = `${w},${n},${e},${s}`;
  const segs = q.segments.length ? q.segments : Object.keys(NOMINATIM_QUERIES);
  const queries = q.name ? [{ q: q.name }] : segs.flatMap((id) => NOMINATIM_QUERIES[id] ?? []);
  const byRef = new Map<string, RawPlace>();
  let partial = false;
  for (const params of queries) {
    const exclude: number[] = [];
    for (let page = 0; page < 2; page++) {
      const res = await nominatimQueue(() =>
        fetchJson<NominatimResult[]>(
          nominatimUrl('search', {
            ...params,
            format: 'jsonv2',
            limit: 40,
            extratags: 1,
            addressdetails: 1,
            bounded: 1,
            viewbox,
            exclude_place_ids: exclude.length ? exclude.join(',') : undefined,
          }),
        ),
      );
      for (const r of res) {
        exclude.push(r.place_id);
        if (!r.name || !['amenity', 'shop', 'craft', 'leisure', 'tourism'].includes(r.category)) continue;
        const tags: Record<string, string> = { name: r.name, [r.category]: r.type, ...(r.extratags ?? {}) };
        const ad = r.address ?? {};
        const address: Address = {
          street: ad.road,
          number: ad.house_number,
          suburb: ad.suburb ?? ad.neighbourhood ?? ad.quarter,
          city: ad.city ?? ad.town ?? ad.village ?? ad.municipality,
          state: ad.state,
          postcode: ad.postcode,
        };
        address.formatted = formatAddress(address);
        const ref = `osm:${r.osm_type}/${r.osm_id}`;
        byRef.set(ref, { ref, name: r.name, lat: Number(r.lat), lon: Number(r.lon), tags, address, provider: 'nominatim' });
      }
      if (res.length < 40) break;
      if (page === 1) partial = true;
    }
  }
  // A busca do Nominatim é sempre parcial: ele limita resultados por consulta.
  void partial;
  return { places: Array.from(byRef.values()), partial: true };
}

/** Detalhes atualizados de um elemento OSM (usado na investigação). */
export async function lookupOsm(ref: string): Promise<RawPlace | null> {
  const m = ref.match(/^osm:(node|way|relation)\/(\d+)$/);
  if (!m) return null;
  const code = { node: 'N', way: 'W', relation: 'R' }[m[1] as 'node' | 'way' | 'relation'];
  const res = await nominatimQueue(() =>
    fetchJson<NominatimResult[]>(nominatimUrl('lookup', { osm_ids: `${code}${m[2]}`, format: 'jsonv2', extratags: 1, addressdetails: 1 })),
  );
  const r = res[0];
  if (!r) return null;
  const tags: Record<string, string> = { name: r.name ?? '', [r.category]: r.type, ...(r.extratags ?? {}) };
  const ad = r.address ?? {};
  const address: Address = {
    street: ad.road,
    number: ad.house_number,
    suburb: ad.suburb ?? ad.neighbourhood ?? ad.quarter,
    city: ad.city ?? ad.town ?? ad.village ?? ad.municipality,
    state: ad.state,
    postcode: ad.postcode,
  };
  address.formatted = formatAddress(address);
  return { ref, name: r.name ?? '', lat: Number(r.lat), lon: Number(r.lon), tags, address, provider: 'nominatim' };
}
