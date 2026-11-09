// Módulo de prospecção: busca, normalização, classificação e priorização.

import { db, now, uid } from '../db.ts';
import { classifyOsm, getSegment, OSM_HIGHLIGHTS } from '../../../shared/segments.ts';
import type { Business, PriorityReason, WebsiteStatus } from '../../../shared/types.ts';
import { areaWithRadius, geocodeArea, OSM_ATTRIBUTION, searchPlaces, type RawPlace } from '../providers/osm.ts';
import { analyzeLinks } from '../providers/links.ts';
import { rowToBusiness, upsertBusiness } from '../repo.ts';

export interface SearchParams {
  city: string;
  neighborhood?: string;
  segments: string[];
  name?: string;
  radius?: number; // metros, a partir do centro do bairro/cidade
  lat?: number;
  lon?: number;
}

/**
 * Pontuação explicável de prioridade. Usa apenas dados observáveis — nunca
 * estimativas de faturamento ou potencial financeiro.
 */
export function scoreBusiness(input: {
  websiteStatus: WebsiteStatus;
  phone?: string;
  socials: Record<string, unknown>;
  tags: Record<string, string>;
  segment: string;
  hasAddress: boolean;
}): { score: number; reasons: PriorityReason[] } {
  const reasons: PriorityReason[] = [];
  const add = (label: string, points: number) => reasons.push({ label, points });
  switch (input.websiteStatus) {
    case 'has_site': add('Já possui site próprio identificado', -40); break;
    case 'none_found': add('Nenhum site encontrado nas fontes consultadas', 35); break;
    case 'social_only': add('Presença online apenas em redes sociais/plataformas', 30); break;
    case 'unverified': add('Nenhum site registrado no OpenStreetMap (não confirmado)', 20); break;
  }
  const seg = getSegment(input.segment);
  add(`Segmento com boa aderência a sites (${seg.label})`, seg.fitWeight * 2);
  if (input.phone) add('Telefone público disponível para contato', 10);
  if (Object.keys(input.socials).length) add('Negócio ativo em redes sociais', 8);
  if (input.tags.opening_hours) add('Horário de funcionamento publicado (indício de atividade)', 6);
  if (input.hasAddress) add('Endereço completo', 4);
  const amenities = OSM_HIGHLIGHTS.filter((h) => input.tags[h.tag] && h.values.includes(input.tags[h.tag]!)).length;
  if (amenities >= 2) add('Diferenciais registrados (bom material para o site)', 4);
  if (input.tags.brand || input.tags['brand:wikidata']) add('Parte de rede/franquia (site costuma ser centralizado)', -35);
  if (input.tags.disused || input.tags['disused:amenity'] || input.tags['disused:shop']) add('Marcado como desativado', -60);
  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  return { score, reasons };
}

function categoryLabel(tags: Record<string, string>): string {
  const base = tags.amenity ?? tags.shop ?? tags.craft ?? 'estabelecimento';
  const cuisine = tags.cuisine ? ` (${tags.cuisine.replace(/;/g, ', ')})` : '';
  return `${base}${cuisine}`;
}

export function placeToBusiness(p: RawPlace, fetchedAt: string): Omit<Business, 'id' | 'createdAt' | 'updatedAt' | 'stage'> {
  const segment = classifyOsm(p.tags);
  const links = analyzeLinks(p.tags);
  const phone = p.tags.phone ?? p.tags['contact:phone'] ?? p.tags['contact:mobile'];
  const { score, reasons } = scoreBusiness({
    websiteStatus: links.status,
    phone,
    socials: links.socials,
    tags: p.tags,
    segment,
    hasAddress: !!(p.address.street && p.address.number),
  });
  return {
    source: 'osm',
    sourceRef: p.ref,
    name: p.name,
    segment,
    category: categoryLabel(p.tags),
    lat: p.lat,
    lon: p.lon,
    address: p.address,
    phone,
    website: links.website,
    websiteStatus: links.status,
    socials: links.socials,
    priorityScore: score,
    priorityReasons: reasons,
    sourceAttribution: `${OSM_ATTRIBUTION} — via ${p.provider === 'overpass' ? 'Overpass API' : 'Nominatim'}`,
    tags: p.tags,
    fetchedAt,
  };
}

export async function runSearch(params: SearchParams) {
  const areaQuery = [params.neighborhood, params.city].filter((s) => s && s.trim()).join(', ');
  if (!areaQuery) throw new Error('Informe ao menos a cidade.');
  let area = await geocodeArea(areaQuery);
  if (params.lat != null && params.lon != null) area = { ...area, lat: params.lat, lon: params.lon };
  // Bairros muito pequenos (ou pontos) recebem um raio padrão.
  const [s, n] = area.bbox;
  const tiny = Math.abs(n - s) < 0.003;
  area = areaWithRadius(area, params.radius ?? (tiny ? 1200 : undefined));

  const result = await searchPlaces({ area, segments: params.segments, name: params.name });
  const fetchedAt = now();
  let businesses = result.places.map((p) => upsertBusiness(placeToBusiness(p, fetchedAt)));
  if (params.segments.length) {
    // Busca de "salão" também retorna barbearias (mesma tag OSM); mantém só o pedido.
    const wanted = new Set(params.segments);
    const related: Record<string, string[]> = { beauty_salon: ['barbershop'], restaurant: ['pizzeria'] };
    for (const sId of params.segments) for (const r of related[sId] ?? []) wanted.add(r);
    businesses = businesses.filter((b) => wanted.has(b.segment));
  }
  businesses.sort((a, b) => b.priorityScore - a.priorityScore);

  const searchId = uid();
  db.prepare('INSERT INTO searches (id, params, area_label, result_ids, created_at) VALUES (?,?,?,?,?)').run(
    searchId,
    JSON.stringify(params),
    area.label,
    JSON.stringify(businesses.map((b) => b.id)),
    fetchedAt,
  );

  return {
    searchId,
    area,
    provider: result.provider,
    partial: result.partial,
    warnings: result.warnings,
    fetchedAt,
    attribution: OSM_ATTRIBUTION,
    businesses,
  };
}

export function recentSearches(limit = 10) {
  return db.prepare('SELECT id, params, area_label AS areaLabel, created_at AS createdAt, json_array_length(result_ids) AS count FROM searches ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function getSearch(id: string) {
  const row = db.prepare('SELECT * FROM searches WHERE id = ?').get(id) as any;
  if (!row) return null;
  const ids: string[] = JSON.parse(row.result_ids);
  const map = new Map<string, any>();
  if (ids.length) {
    const rows = db.prepare(`SELECT * FROM businesses WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
    for (const r of rows) map.set(r.id, rowToBusiness(r));
  }
  return { id: row.id, params: JSON.parse(row.params), areaLabel: row.area_label, createdAt: row.created_at, businesses: ids.map((i) => map.get(i)).filter(Boolean) };
}
