// Acesso a dados: conversão entre linhas SQLite e objetos de domínio.

import { db, json, now, uid } from './db.ts';
import type { Activity, Asset, Business, Fact, FactStatus, StageId } from '../../shared/types.ts';
import type { SiteSpec } from '../../shared/site.ts';

type Row = Record<string, any>;

export function rowToBusiness(r: Row): Business & { saved: boolean } {
  return {
    id: r.id,
    source: r.source,
    sourceRef: r.source_ref,
    name: r.name,
    segment: r.segment,
    category: r.category,
    lat: r.lat ?? undefined,
    lon: r.lon ?? undefined,
    address: json(r.address, {}),
    phone: r.phone ?? undefined,
    website: r.website ?? undefined,
    websiteStatus: r.website_status,
    socials: json(r.socials, {}),
    stage: r.stage,
    saved: !!r.saved,
    priorityScore: r.priority_score,
    priorityReasons: json(r.priority_reasons, []),
    sourceAttribution: r.source_attribution,
    tags: json(r.tags, {}),
    googlePlaceId: r.google_place_id ?? undefined,
    fetchedAt: r.fetched_at,
    investigatedAt: r.investigated_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getBusiness(id: string) {
  const r = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToBusiness(r) : null;
}

export function getBusinessByRef(ref: string) {
  const r = db.prepare('SELECT * FROM businesses WHERE source_ref = ?').get(ref) as Row | undefined;
  return r ? rowToBusiness(r) : null;
}

/** Insere ou atualiza dados vindos da fonte, preservando estágio e decisões do operador. */
export function upsertBusiness(b: Omit<Business, 'id' | 'createdAt' | 'updatedAt' | 'stage'>): Business & { saved: boolean } {
  const existing = getBusinessByRef(b.sourceRef);
  const ts = now();
  if (existing) {
    // Não rebaixa um status confirmado manualmente pelo operador.
    const keepStatus = existing.websiteStatus === 'none_found' && b.websiteStatus === 'unverified';
    db.prepare(
      `UPDATE businesses SET name=?, segment=?, category=?, lat=?, lon=?, address=?, phone=?, website=?, website_status=?, socials=?,
       priority_score=?, priority_reasons=?, source_attribution=?, tags=?, fetched_at=?, updated_at=? WHERE id=?`,
    ).run(
      b.name, b.segment, b.category, b.lat ?? null, b.lon ?? null, JSON.stringify(b.address), b.phone ?? null, b.website ?? null,
      keepStatus ? existing.websiteStatus : b.websiteStatus, JSON.stringify(b.socials), b.priorityScore, JSON.stringify(b.priorityReasons),
      b.sourceAttribution, JSON.stringify(b.tags ?? {}), b.fetchedAt, ts, existing.id,
    );
    return getBusiness(existing.id)!;
  }
  const id = uid();
  db.prepare(
    `INSERT INTO businesses (id, source, source_ref, name, segment, category, lat, lon, address, phone, website, website_status, socials,
     priority_score, priority_reasons, source_attribution, tags, fetched_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id, b.source, b.sourceRef, b.name, b.segment, b.category, b.lat ?? null, b.lon ?? null, JSON.stringify(b.address), b.phone ?? null,
    b.website ?? null, b.websiteStatus, JSON.stringify(b.socials), b.priorityScore, JSON.stringify(b.priorityReasons), b.sourceAttribution,
    JSON.stringify(b.tags ?? {}), b.fetchedAt, ts, ts,
  );
  return getBusiness(id)!;
}

export function updateBusinessFields(id: string, fields: Record<string, unknown>) {
  const cols = Object.keys(fields);
  if (!cols.length) return;
  const sets = cols.map((c) => `${c} = ?`).join(', ');
  const vals = cols.map((c) => {
    const v = fields[c];
    return v === undefined ? null : typeof v === 'object' && v !== null ? JSON.stringify(v) : (v as any);
  });
  db.prepare(`UPDATE businesses SET ${sets}, updated_at = ? WHERE id = ?`).run(...vals, now(), id);
}

export function setStage(id: string, stage: StageId, message?: string) {
  const b = getBusiness(id);
  if (!b || b.stage === stage) return;
  updateBusinessFields(id, { stage, saved: 1 });
  addActivity(id, 'stage_change', message ?? `Etapa alterada para "${stage}"`);
}

/** Avança o estágio somente se o atual for anterior (não regride automaticamente). */
export function advanceStage(id: string, stage: StageId, order: readonly string[], message?: string) {
  const b = getBusiness(id);
  if (!b) return;
  if (order.indexOf(b.stage) < order.indexOf(stage)) setStage(id, stage, message);
}

/* ---------- fatos ---------- */

export function rowToFact(r: Row): Fact {
  return {
    id: r.id,
    businessId: r.business_id,
    field: r.field,
    value: json(r.value, null),
    status: r.status,
    source: r.source,
    sourceUrl: r.source_url ?? undefined,
    note: r.note ?? undefined,
    active: !!r.active,
    retrievedAt: r.retrieved_at,
  };
}

export function listFacts(businessId: string, activeOnly = true): Fact[] {
  const rows = db
    .prepare(`SELECT * FROM facts WHERE business_id = ? ${activeOnly ? 'AND active = 1' : ''} ORDER BY retrieved_at DESC`)
    .all(businessId) as Row[];
  return rows.map(rowToFact);
}

export interface NewFact {
  field: string;
  value: unknown;
  status: FactStatus;
  source: string;
  sourceUrl?: string;
  note?: string;
}

/**
 * Registra um fato. Fatos da mesma fonte e campo são substituídos (desativados).
 * Fatos do operador nunca são substituídos por fontes automáticas.
 */
export function addFact(businessId: string, f: NewFact): Fact {
  db.prepare('UPDATE facts SET active = 0 WHERE business_id = ? AND field = ? AND source = ? AND active = 1').run(businessId, f.field, f.source);
  const id = uid();
  db.prepare(
    'INSERT INTO facts (id, business_id, field, value, status, source, source_url, note, active, retrieved_at) VALUES (?,?,?,?,?,?,?,?,1,?)',
  ).run(id, businessId, f.field, JSON.stringify(f.value), f.status, f.source, f.sourceUrl ?? null, f.note ?? null, now());
  return rowToFact(db.prepare('SELECT * FROM facts WHERE id = ?').get(id) as Row);
}

export function deactivateFact(id: string) {
  db.prepare('UPDATE facts SET active = 0 WHERE id = ?').run(id);
}

/** Melhor valor por campo: operador > verificado > não confirmado. */
export function bestFacts(businessId: string): Record<string, Fact> {
  const rank: Record<FactStatus, number> = { user_provided: 3, verified: 2, unconfirmed: 1, ai_suggested: 0 };
  const out: Record<string, Fact> = {};
  for (const f of listFacts(businessId)) {
    const cur = out[f.field];
    if (!cur || rank[f.status] > rank[cur.status]) out[f.field] = f;
  }
  return out;
}

/* ---------- assets ---------- */

export function rowToAsset(r: Row): Asset & { storedName: string } {
  return {
    id: r.id,
    businessId: r.business_id,
    kind: r.kind,
    filename: r.filename,
    storedName: r.stored_name,
    mime: r.mime,
    size: r.size,
    rights: r.rights,
    source: r.source,
    note: r.note ?? undefined,
    palette: json(r.palette, undefined),
    createdAt: r.created_at,
  };
}

export function listAssets(businessId: string) {
  return (db.prepare('SELECT * FROM assets WHERE business_id = ? ORDER BY created_at DESC').all(businessId) as Row[]).map(rowToAsset);
}

export function getAsset(id: string) {
  const r = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToAsset(r) : null;
}

/* ---------- atividades ---------- */

export function addActivity(businessId: string, type: string, message: string) {
  db.prepare('INSERT INTO activities (id, business_id, type, message, created_at) VALUES (?,?,?,?,?)').run(uid(), businessId, type, message, now());
}

export function listActivities(businessId: string): Activity[] {
  return (db.prepare('SELECT * FROM activities WHERE business_id = ? ORDER BY created_at DESC LIMIT 200').all(businessId) as Row[]).map((r) => ({
    id: r.id,
    businessId: r.business_id,
    type: r.type,
    message: r.message,
    createdAt: r.created_at,
  }));
}

/* ---------- sites ---------- */

export interface SiteRecord {
  id: string;
  businessId: string;
  name: string;
  status: 'draft' | 'reviewed' | 'approved_by_client' | 'published';
  spec: SiteSpec;
  version: number;
  createdAt: string;
  updatedAt: string;
  share: { token?: string; enabled: boolean; views: number; lastView?: string };
  publish: PublishInfo | null;
}

export interface PublishInfo {
  provider: 'netlify';
  siteId: string;
  siteName: string;
  url: string; // endereço gratuito do provedor (ex.: https://nome.netlify.app)
  adminUrl?: string;
  domain?: string; // domínio próprio do cliente (ex.: cafearoma.com.br)
  domainKind?: 'apex' | 'subdomain';
  publishedAt?: string;
  publishedVersion?: number;
  deployId?: string;
}

export function rowToSite(r: Row): SiteRecord {
  return {
    id: r.id,
    businessId: r.business_id,
    name: r.name,
    status: r.status,
    spec: json(r.spec, null as any),
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    share: { token: r.share_token ?? undefined, enabled: !!r.share_enabled, views: r.share_views ?? 0, lastView: r.share_last_view ?? undefined },
    publish: json<PublishInfo | null>(r.publish_info, null),
  };
}

export function getSiteByShareToken(token: string) {
  const r = db.prepare('SELECT * FROM sites WHERE share_token = ? AND share_enabled = 1').get(token) as Row | undefined;
  return r ? rowToSite(r) : null;
}

export function getSite(id: string) {
  const r = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToSite(r) : null;
}

export function listSites(businessId?: string) {
  const rows = businessId
    ? db.prepare('SELECT * FROM sites WHERE business_id = ? ORDER BY updated_at DESC').all(businessId)
    : db.prepare('SELECT * FROM sites ORDER BY updated_at DESC').all();
  return (rows as Row[]).map(rowToSite);
}

export function createSite(businessId: string, name: string, spec: SiteSpec): SiteRecord {
  const id = uid();
  const ts = now();
  db.prepare('INSERT INTO sites (id, business_id, name, status, spec, version, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)').run(
    id, businessId, name, 'draft', JSON.stringify(spec), ts, ts,
  );
  db.prepare('INSERT INTO site_versions (id, site_id, version, spec, note, created_at) VALUES (?,?,?,?,?,?)').run(uid(), id, 1, JSON.stringify(spec), 'Versão gerada', ts);
  return getSite(id)!;
}

export function saveSite(id: string, spec: SiteSpec, note?: string): SiteRecord {
  const cur = getSite(id);
  if (!cur) throw new Error('Site não encontrado');
  const version = cur.version + 1;
  const ts = now();
  db.prepare('UPDATE sites SET spec = ?, version = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(spec), version, ts, id);
  db.prepare('INSERT INTO site_versions (id, site_id, version, spec, note, created_at) VALUES (?,?,?,?,?,?)').run(uid(), id, version, JSON.stringify(spec), note ?? null, ts);
  // Mantém as 50 versões mais recentes.
  db.prepare('DELETE FROM site_versions WHERE site_id = ? AND version <= ?').run(id, version - 50);
  return getSite(id)!;
}

export function listVersions(siteId: string) {
  return db.prepare('SELECT id, version, note, created_at AS createdAt FROM site_versions WHERE site_id = ? ORDER BY version DESC').all(siteId);
}

export function getVersion(siteId: string, version: number) {
  const r = db.prepare('SELECT spec FROM site_versions WHERE site_id = ? AND version = ?').get(siteId, version) as Row | undefined;
  return r ? (json(r.spec, null) as SiteSpec | null) : null;
}

export function setPublishInfo(siteId: string, info: PublishInfo | null) {
  db.prepare('UPDATE sites SET publish_info = ?, updated_at = ? WHERE id = ?').run(info ? JSON.stringify(info) : null, now(), siteId);
}

export function setSiteStatus(siteId: string, status: SiteRecord['status']) {
  db.prepare('UPDATE sites SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), siteId);
}
