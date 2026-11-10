// Módulo de prospecção: busca, normalização, classificação e priorização.

import { db, now, uid } from '../db.ts';
import { classifyOsm, getSegment, OSM_HIGHLIGHTS } from '../../../shared/segments.ts';
import type { Business, PriorityReason, WebsiteStatus } from '../../../shared/types.ts';
import { areaWithRadius, geocodeArea, OSM_ATTRIBUTION, searchPlaces, type RawPlace } from '../providers/osm.ts';
import { analyzeLinks } from '../providers/links.ts';
import { dedupeKey, distanceM, rowToBusiness, upsertBusiness } from '../repo.ts';

/** Padroniza telefones brasileiros: (11) 3000-0000 / (11) 90000-0000. Mantém o original se não reconhecer. */
export function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const first = raw.split(/[;,/]| ou /)[0]!.trim();
  let d = first.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (/^0?800\d{7}$/.test(d)) return d.replace(/^0?800(\d{3})(\d{4})$/, '0800 $1 $2');
  return first;
}

/** Une resultados duplicados da mesma busca (ex.: ponto e prédio do mesmo negócio no OSM). */
export function dedupePlaces(places: RawPlace[]): { places: RawPlace[]; merged: number } {
  const out: RawPlace[] = [];
  let merged = 0;
  for (const p of places) {
    const k = dedupeKey(p.name);
    const dup = out.find((o) => dedupeKey(o.name) === k && o.lat != null && p.lat != null && distanceM(o.lat, o.lon!, p.lat, p.lon!) < 120);
    if (!dup) {
      out.push(p);
      continue;
    }
    merged++;
    // fica com o registro mais completo e soma as informações do outro
    const richer = Object.keys(p.tags).length > Object.keys(dup.tags).length ? p : dup;
    const other = richer === p ? dup : p;
    const idx = out.indexOf(dup);
    out[idx] = { ...richer, tags: { ...other.tags, ...richer.tags }, address: richer.address.formatted ? richer.address : other.address };
  }
  return { places: out, merged };
}

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
  websiteQuality?: string | null;
  phone?: string;
  socials: Record<string, unknown>;
  tags: Record<string, string>;
  segment: string;
  hasAddress: boolean;
}): { score: number; reasons: PriorityReason[] } {
  const reasons: PriorityReason[] = [];
  const add = (label: string, points: number) => reasons.push({ label, points });
  switch (input.websiteStatus) {
    case 'has_site':
      if (input.websiteQuality === 'weak') add('Possui site, mas fraco/desatualizado (oportunidade de reformulação)', 18);
      else if (input.websiteQuality === 'unreachable') add('Site informado não está respondendo (pode estar fora do ar)', 22);
      else add('Já possui site próprio identificado', -40);
      break;
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
  const phone = normalizePhone(p.tags.phone ?? p.tags['contact:phone'] ?? p.tags['contact:mobile']);
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
  const { places, merged } = dedupePlaces(result.places);
  const seen = new Set<string>();
  let businesses = places
    .map((p) => upsertBusiness(placeToBusiness(p, fetchedAt)))
    .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true))); // duplicatas já salvas viram um só
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
    duplicatesMerged: merged,
    businesses: enrich(businesses),
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
  return { id: row.id, params: JSON.parse(row.params), areaLabel: row.area_label, createdAt: row.created_at, businesses: enrich(ids.map((i) => map.get(i)).filter(Boolean)) };
}

/** Acrescenta aos resultados: demos existentes e status da oportunidade. */
export function enrich<T extends { id: string }>(list: T[]) {
  if (!list.length) return list.map((b) => ({ ...b, sites: 0 }));
  const ids = list.map((b) => b.id);
  const rows = db.prepare(`SELECT business_id, COUNT(*) AS c, MAX(CASE WHEN status='published' THEN 1 ELSE 0 END) AS pub FROM sites WHERE business_id IN (${ids.map(() => '?').join(',')}) GROUP BY business_id`).all(...ids) as any[];
  const m = new Map(rows.map((r) => [r.business_id, r]));
  return list.map((b) => ({ ...b, sites: m.get(b.id)?.c ?? 0, published: !!m.get(b.id)?.pub }));
}
