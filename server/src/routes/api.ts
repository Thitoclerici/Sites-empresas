// Rotas HTTP da API.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod/v4';
import { extname, join } from 'node:path';
import { db, json, now, uid } from '../db.ts';
import { deleteUpload, readUpload, saveUpload } from '../storage.ts';
import { SEGMENTS, getSegment } from '../../../shared/segments.ts';
import { STAGES, USABLE_RIGHTS, type StageId } from '../../../shared/types.ts';
import { SECTION_DEFS, type SiteSpec } from '../../../shared/site.ts';
import { renderSite } from '../../../shared/render.ts';
import * as repo from '../repo.ts';
import { getSearch, recentSearches, runSearch, scoreBusiness } from '../services/prospecting.ts';
import { computeMissing, investigate } from '../services/investigation.ts';
import { buildBrief, computeNav, generateSpec, switchConcept } from '../services/generator.ts';
import { CONCEPTS, type Concept } from '../../../shared/design.ts';
import { evaluateSite } from '../../../shared/quality.ts';
import { aiEnabled, aiModel, regenerateSectionText, suggestImprovements } from '../services/ai.ts';
import { ruleSuggestions } from '../services/suggestions.ts';
import { googleEnabled } from '../providers/googlePlaces.ts';
import { HttpError } from '../providers/http.ts';
import { randomBytes } from 'node:crypto';

const STAGE_IDS = STAGES.map((s) => s.id) as [StageId, ...StageId[]];
const MAX_UPLOAD = 15 * 1024 * 1024;
const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif|svg\+xml)|application\/pdf)$/;

function fail(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ error: message });
}

function demoNotice(site: repo.SiteRecord) {
  if (site.status === 'approved_by_client' || site.status === 'published') return null;
  return `Demonstração não oficial criada por ${process.env.AGENCY_NAME || 'Prospecta'} para apresentação a ${site.spec.businessName}. Não publicada.`;
}

/** Resolve assets apenas se o uso estiver autorizado. */
function assetResolver(businessId: string, mode: 'url' | 'inline') {
  const assets = new Map(repo.listAssets(businessId).map((a) => [a.id, a]));
  const cache = new Map<string, string>();
  return {
    assets,
    async preload() {
      if (mode !== 'inline') return;
      for (const a of assets.values()) {
        if (!USABLE_RIGHTS.includes(a.rights) || a.mime === 'application/pdf') continue;
        const buf = await readUpload(a.storedName).catch(() => null);
        if (!buf) continue;
        cache.set(a.id, `data:${a.mime};base64,${buf.toString('base64')}`);
      }
    },
    resolve(id: string): string | null {
      const a = assets.get(id);
      if (!a || !USABLE_RIGHTS.includes(a.rights)) return null;
      return mode === 'inline' ? cache.get(id) ?? null : `/api/assets/${a.id}/file`;
    },
  };
}

function businessDetail(id: string) {
  const b = repo.getBusiness(id);
  if (!b) return null;
  return {
    business: b,
    segment: getSegment(b.segment),
    facts: repo.listFacts(id),
    assets: repo.listAssets(id).map(({ storedName, ...a }) => a),
    sites: repo.listSites(id).map(({ spec, ...s }) => s),
    activities: repo.listActivities(id),
    missing: computeMissing(id),
  };
}

export async function apiRoutes(app: FastifyInstance) {
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof z.ZodError) return fail(reply, 400, `Dados inválidos: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    if (err instanceof HttpError) return fail(reply, err.status >= 400 && err.status < 500 ? err.status : 502, err.message);
    app.log.error(err);
    return fail(reply, err.statusCode ?? 500, err.message ?? 'Erro interno');
  });

  /* ---------- configuração ---------- */
  app.get('/api/config', async () => ({
    integrations: { osm: true, googlePlaces: googleEnabled(), ai: aiEnabled(), aiModel: aiEnabled() ? aiModel() : undefined },
    segments: SEGMENTS.map((s) => ({ id: s.id, label: s.label, plural: s.plural, contentKind: s.contentKind, presets: s.presets })),
    stages: STAGES,
    sectionDefs: SECTION_DEFS,
    agencyName: process.env.AGENCY_NAME || 'Prospecta',
  }));

  /* ---------- prospecção ---------- */
  const SearchBody = z.object({
    city: z.string().min(2),
    neighborhood: z.string().optional(),
    segments: z.array(z.string()).default([]),
    name: z.string().optional(),
    radius: z.number().min(100).max(10000).optional(),
  });
  app.post('/api/search', async (req) => {
    const body = SearchBody.parse(req.body);
    return runSearch({ ...body, name: body.name?.trim() || undefined, neighborhood: body.neighborhood?.trim() || undefined });
  });
  app.get('/api/searches', async () => recentSearches(15));
  app.get<{ Params: { id: string } }>('/api/searches/:id', async (req, reply) => getSearch(req.params.id) ?? fail(reply, 404, 'Busca não encontrada'));

  /* ---------- estabelecimentos ---------- */
  app.get<{ Querystring: Record<string, string> }>('/api/businesses', async (req) => {
    const q = req.query;
    const where: string[] = [];
    const args: any[] = [];
    if (q.saved === '1') where.push('saved = 1');
    if (q.stage) (where.push('stage = ?'), args.push(q.stage));
    if (q.segment) (where.push('segment = ?'), args.push(q.segment));
    if (q.websiteStatus) (where.push('website_status = ?'), args.push(q.websiteStatus));
    if (q.q) (where.push('name LIKE ?'), args.push(`%${q.q}%`));
    const order = q.sort === 'recent' ? 'updated_at DESC' : 'priority_score DESC, updated_at DESC';
    const rows = db.prepare(`SELECT * FROM businesses ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT 500`).all(...args) as any[];
    return rows.map(repo.rowToBusiness);
  });

  const ManualBusiness = z.object({
    name: z.string().min(2),
    segment: z.string(),
    street: z.string().optional(),
    number: z.string().optional(),
    suburb: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    phone: z.string().optional(),
  });
  app.post('/api/businesses', async (req) => {
    const b = ManualBusiness.parse(req.body);
    const address = { street: b.street, number: b.number, suburb: b.suburb, city: b.city, state: b.state };
    const formatted = [[b.street, b.number].filter(Boolean).join(', '), b.suburb, [b.city, b.state].filter(Boolean).join(' - ')].filter((x) => x).join(', ');
    const { score, reasons } = scoreBusiness({ websiteStatus: 'unverified', phone: b.phone, socials: {}, tags: {}, segment: b.segment, hasAddress: !!(b.street && b.number) });
    const created = repo.upsertBusiness({
      source: 'manual',
      sourceRef: `manual:${uid()}`,
      name: b.name,
      segment: b.segment,
      category: getSegment(b.segment).label,
      address: { ...address, formatted: formatted || undefined },
      phone: b.phone,
      websiteStatus: 'unverified',
      socials: {},
      priorityScore: score,
      priorityReasons: reasons,
      sourceAttribution: 'Cadastro manual do operador',
      fetchedAt: now(),
    });
    repo.updateBusinessFields(created.id, { saved: 1 });
    repo.addFact(created.id, { field: 'name', value: b.name, status: 'user_provided', source: 'Operador' });
    if (b.phone) repo.addFact(created.id, { field: 'phone', value: b.phone, status: 'user_provided', source: 'Operador' });
    repo.addActivity(created.id, 'created', 'Estabelecimento cadastrado manualmente');
    return repo.getBusiness(created.id);
  });

  app.get<{ Params: { id: string } }>('/api/businesses/:id', async (req, reply) => businessDetail(req.params.id) ?? fail(reply, 404, 'Estabelecimento não encontrado'));

  const PatchBusiness = z.object({
    stage: z.enum(STAGE_IDS).optional(),
    saved: z.boolean().optional(),
    segment: z.string().optional(),
    websiteStatus: z.enum(['has_site', 'none_found', 'social_only', 'unverified']).optional(),
    note: z.string().optional(),
  });
  app.patch<{ Params: { id: string } }>('/api/businesses/:id', async (req, reply) => {
    const id = req.params.id;
    const b = repo.getBusiness(id);
    if (!b) return fail(reply, 404, 'Estabelecimento não encontrado');
    const body = PatchBusiness.parse(req.body);
    if (body.stage) repo.setStage(id, body.stage, `Etapa alterada para "${STAGES.find((s) => s.id === body.stage)!.label}"${body.note ? ` — ${body.note}` : ''}`);
    if (body.saved !== undefined) repo.updateBusinessFields(id, { saved: body.saved ? 1 : 0 });
    if (body.segment && body.segment !== b.segment) {
      repo.updateBusinessFields(id, { segment: body.segment });
      repo.addActivity(id, 'segment', `Segmento alterado para ${getSegment(body.segment).label}`);
    }
    if (body.websiteStatus && body.websiteStatus !== b.websiteStatus) {
      repo.updateBusinessFields(id, { website_status: body.websiteStatus });
      repo.addFact(id, { field: 'website_check', value: body.websiteStatus, status: 'user_provided', source: 'Operador', note: 'Situação do site confirmada manualmente.' });
      repo.addActivity(id, 'website_check', `Situação do site confirmada pelo operador: ${body.websiteStatus}`);
      const cur = repo.getBusiness(id)!;
      const { score, reasons } = scoreBusiness({ websiteStatus: body.websiteStatus, phone: cur.phone, socials: cur.socials, tags: cur.tags ?? {}, segment: cur.segment, hasAddress: !!(cur.address.street && cur.address.number) });
      repo.updateBusinessFields(id, { priority_score: score, priority_reasons: reasons });
    }
    return businessDetail(id);
  });

  // LGPD: exclusão completa dos dados e arquivos do estabelecimento.
  app.delete<{ Params: { id: string } }>('/api/businesses/:id', async (req, reply) => {
    const assets = repo.listAssets(req.params.id);
    for (const a of assets) await deleteUpload(a.storedName);
    const r = db.prepare('DELETE FROM businesses WHERE id = ?').run(req.params.id);
    return r.changes ? { ok: true } : fail(reply, 404, 'Estabelecimento não encontrado');
  });

  app.post<{ Params: { id: string } }>('/api/businesses/:id/investigate', async (req, reply) => {
    if (!repo.getBusiness(req.params.id)) return fail(reply, 404, 'Estabelecimento não encontrado');
    const result = await investigate(req.params.id);
    return { ...result, detail: businessDetail(req.params.id) };
  });

  /* ---------- fatos ---------- */
  const FactBody = z
    .object({ field: z.string().min(1).max(60), value: z.unknown(), note: z.string().optional() })
    .refine((f) => f.field !== 'menu_url' || (typeof f.value === 'string' && /^https?:\/\/\S+$/i.test(f.value.trim())), { message: 'Informe um link começando com http:// ou https://', path: ['value'] });
  app.post<{ Params: { id: string } }>('/api/businesses/:id/facts', async (req, reply) => {
    if (!repo.getBusiness(req.params.id)) return fail(reply, 404, 'Estabelecimento não encontrado');
    const f = FactBody.parse(req.body);
    const fact = repo.addFact(req.params.id, { field: f.field, value: f.value, status: 'user_provided', source: 'Operador', note: f.note });
    repo.addActivity(req.params.id, 'fact', `Informação complementada: ${f.field}`);
    // Mantém campos principais do registro sincronizados.
    const b = repo.getBusiness(req.params.id)!;
    if (f.field === 'phone' && typeof f.value === 'string') repo.updateBusinessFields(b.id, { phone: f.value });
    if (f.field === 'socials' && typeof f.value === 'object') repo.updateBusinessFields(b.id, { socials: f.value });
    if (f.field === 'name' && typeof f.value === 'string' && f.value.trim()) repo.updateBusinessFields(b.id, { name: f.value.trim() });
    if (f.field === 'address') {
      const v = f.value as any;
      const formatted = typeof v === 'string' ? v.trim() : String(v?.formatted ?? '').trim();
      if (formatted) repo.updateBusinessFields(b.id, { address: { ...b.address, formatted } });
    }
    if (f.field === 'website' && typeof f.value === 'string') {
      repo.updateBusinessFields(b.id, f.value.trim() ? { website: f.value.trim(), website_status: 'has_site' } : { website: null });
    }
    return fact;
  });
  app.post<{ Params: { id: string } }>('/api/facts/:id/confirm', async (req, reply) => {
    const row = db.prepare('SELECT * FROM facts WHERE id = ?').get(req.params.id) as any;
    if (!row) return fail(reply, 404, 'Informação não encontrada');
    const f = repo.rowToFact(row);
    const fact = repo.addFact(f.businessId, { field: f.field, value: f.value, status: 'user_provided', source: 'Operador', note: `Confirmado pelo operador (origem: ${f.source})` });
    repo.addActivity(f.businessId, 'fact', `Informação confirmada: ${f.field}`);
    return fact;
  });
  app.delete<{ Params: { id: string } }>('/api/facts/:id', async (req) => {
    repo.deactivateFact(req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/businesses/:id/notes', async (req, reply) => {
    const { message } = z.object({ message: z.string().min(1).max(4000) }).parse(req.body);
    if (!repo.getBusiness(req.params.id)) return fail(reply, 404, 'Estabelecimento não encontrado');
    repo.addActivity(req.params.id, 'note', message);
    return { ok: true };
  });

  /* ---------- arquivos (uploads manuais) ---------- */
  app.post<{ Params: { id: string } }>('/api/businesses/:id/assets', async (req, reply) => {
    if (!repo.getBusiness(req.params.id)) return fail(reply, 404, 'Estabelecimento não encontrado');
    const file = await req.file({ limits: { fileSize: MAX_UPLOAD } });
    if (!file) return fail(reply, 400, 'Nenhum arquivo enviado');
    if (!ALLOWED_MIME.test(file.mimetype)) {
      file.file.resume();
      return fail(reply, 415, 'Formato não suportado. Envie PNG, JPG, WEBP, GIF, SVG ou PDF.');
    }
    const fields = Object.fromEntries(Object.entries(file.fields).map(([k, v]: [string, any]) => [k, v?.value]));
    const meta = z
      .object({
        kind: z.enum(['logo', 'photo', 'menu', 'document', 'other']).default('photo'),
        rights: z.enum(['authorized', 'owned', 'pending_authorization', 'reference_only']).default('pending_authorization'),
        source: z.string().default('Enviado pelo operador'),
        note: z.string().optional(),
      })
      .parse(fields);
    const id = uid();
    const ext = extname(file.filename).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6) || '.bin';
    const storedName = `${id}${ext}`;
    let data: Buffer;
    try {
      data = await file.toBuffer();
    } catch {
      return fail(reply, 413, 'Arquivo excede 15 MB.');
    }
    await saveUpload(storedName, data, file.mimetype);
    const size = data.length;
    db.prepare('INSERT INTO assets (id, business_id, kind, filename, stored_name, mime, size, rights, source, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      id, req.params.id, meta.kind, file.filename.slice(0, 200), storedName, file.mimetype, size, meta.rights, meta.source, meta.note ?? null, now(),
    );
    repo.addActivity(req.params.id, 'asset', `Arquivo enviado: ${file.filename} (${meta.kind}, ${meta.rights})`);
    const { storedName: _s, ...asset } = repo.getAsset(id)!;
    return asset;
  });

  app.patch<{ Params: { id: string } }>('/api/assets/:id', async (req, reply) => {
    const a = repo.getAsset(req.params.id);
    if (!a) return fail(reply, 404, 'Arquivo não encontrado');
    const body = z
      .object({
        rights: z.enum(['authorized', 'owned', 'pending_authorization', 'reference_only']).optional(),
        kind: z.enum(['logo', 'photo', 'menu', 'document', 'other']).optional(),
        palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8).optional(),
        note: z.string().optional(),
      })
      .parse(req.body);
    if (body.rights) {
      db.prepare('UPDATE assets SET rights = ? WHERE id = ?').run(body.rights, a.id);
      repo.addActivity(a.businessId, 'asset_rights', `Direitos de uso de "${a.filename}" alterados para ${body.rights}`);
      if (USABLE_RIGHTS.includes(body.rights)) {
        db.prepare('INSERT INTO approvals (id, business_id, kind, note, created_at) VALUES (?,?,?,?,?)').run(uid(), a.businessId, 'asset_usage', `Uso autorizado: ${a.filename}`, now());
      }
    }
    if (body.kind) db.prepare('UPDATE assets SET kind = ? WHERE id = ?').run(body.kind, a.id);
    if (body.palette) db.prepare('UPDATE assets SET palette = ? WHERE id = ?').run(JSON.stringify(body.palette), a.id);
    if (body.note !== undefined) db.prepare('UPDATE assets SET note = ? WHERE id = ?').run(body.note, a.id);
    const { storedName: _s, ...asset } = repo.getAsset(a.id)!;
    return asset;
  });

  app.delete<{ Params: { id: string } }>('/api/assets/:id', async (req, reply) => {
    const a = repo.getAsset(req.params.id);
    if (!a) return fail(reply, 404, 'Arquivo não encontrado');
    await deleteUpload(a.storedName);
    db.prepare('DELETE FROM assets WHERE id = ?').run(a.id);
    repo.addActivity(a.businessId, 'asset', `Arquivo removido: ${a.filename}`);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/api/assets/:id/file', async (req, reply) => {
    const a = repo.getAsset(req.params.id);
    if (!a) return fail(reply, 404, 'Arquivo não encontrado');
    const buf = await readUpload(a.storedName);
    reply.header('Content-Type', a.mime).header('Cache-Control', 'private, max-age=3600').header('X-Content-Type-Options', 'nosniff');
    if (a.mime === 'image/svg+xml') reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    return reply.send(buf);
  });

  /* ---------- sites ---------- */
  app.post<{ Params: { id: string } }>('/api/businesses/:id/sites', async (req, reply) => {
    const b = repo.getBusiness(req.params.id);
    if (!b) return fail(reply, 404, 'Estabelecimento não encontrado');
    const { useAi, concept } = z.object({ useAi: z.boolean().optional(), concept: z.enum(['refined', 'bold', 'inviting']).optional() }).parse(req.body ?? {});
    const { spec, aiError, rationale } = await generateSpec(b.id, { useAi, concept });
    const site = repo.createSite(b.id, `Demo — ${b.name}`, spec);
    repo.updateBusinessFields(b.id, { saved: 1 });
    repo.advanceStage(b.id, 'demo_created', STAGE_IDS, 'Demonstração de site criada');
    repo.addActivity(b.id, 'site_generated', `Demonstração gerada (${spec.meta.generator === 'ai' ? `IA: ${spec.meta.model}` : 'modelo determinístico'})${aiError ? ` — ${aiError}` : ''}`);
    return { site, aiError, rationale };
  });

  app.get('/api/sites', async () => {
    const rows = db
      .prepare('SELECT s.id, s.name, s.status, s.version, s.updated_at AS updatedAt, s.share_enabled AS shareEnabled, s.share_views AS shareViews, s.business_id AS businessId, b.name AS businessName, b.segment FROM sites s JOIN businesses b ON b.id = s.business_id ORDER BY s.updated_at DESC')
      .all();
    return rows;
  });

  app.get<{ Params: { id: string } }>('/api/sites/:id', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    return { site, detail: businessDetail(site.businessId), demoNotice: demoNotice(site) };
  });

  app.put<{ Params: { id: string } }>('/api/sites/:id', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const { spec, note } = z.object({ spec: z.any(), note: z.string().optional() }).parse(req.body);
    if (!spec || spec.version !== 1 || !Array.isArray(spec.sections)) return fail(reply, 400, 'Documento de site inválido');
    (spec as SiteSpec).nav = computeNav(spec as SiteSpec);
    const saved = repo.saveSite(site.id, spec as SiteSpec, note ?? 'Edição manual');
    return { site: saved };
  });

  app.patch<{ Params: { id: string } }>('/api/sites/:id', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const body = z.object({ name: z.string().min(1).optional(), status: z.enum(['draft', 'reviewed', 'approved_by_client']).optional(), note: z.string().optional() }).parse(req.body);
    if (body.name) db.prepare('UPDATE sites SET name = ?, updated_at = ? WHERE id = ?').run(body.name, now(), site.id);
    if (body.status === 'approved_by_client' && !body.note?.trim()) {
      return fail(reply, 400, 'Registre como a aprovação do cliente foi obtida (ex.: "aprovado por e-mail em 10/11").');
    }
    if (body.status && body.status !== site.status) {
      db.prepare('UPDATE sites SET status = ?, updated_at = ? WHERE id = ?').run(body.status, now(), site.id);
      if (body.status === 'reviewed') {
        db.prepare('INSERT INTO approvals (id, business_id, site_id, kind, note, created_at) VALUES (?,?,?,?,?,?)').run(uid(), site.businessId, site.id, 'demo_review', body.note ?? null, now());
        repo.advanceStage(site.businessId, 'demo_reviewed', STAGE_IDS, 'Demonstração revisada pelo operador');
      }
      if (body.status === 'approved_by_client') {
        db.prepare('INSERT INTO approvals (id, business_id, site_id, kind, note, created_at) VALUES (?,?,?,?,?,?)').run(uid(), site.businessId, site.id, 'client_approval', body.note ?? '', now());
      }
      repo.addActivity(site.businessId, 'site_status', `Status do site "${site.name}" alterado para ${body.status}${body.note ? ` — ${body.note}` : ''}`);
    }
    return { site: repo.getSite(site.id) };
  });

  app.delete<{ Params: { id: string } }>('/api/sites/:id', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    db.prepare('DELETE FROM sites WHERE id = ?').run(site.id);
    repo.addActivity(site.businessId, 'site_deleted', `Demonstração "${site.name}" excluída`);
    return { ok: true };
  });

  /* ---------- direção visual e qualidade ---------- */
  const usableImageIds = (businessId: string) => repo.listAssets(businessId).filter((a) => USABLE_RIGHTS.includes(a.rights) && a.mime.startsWith('image/')).map((a) => a.id);

  // Prévias dos três conceitos (não salva nada) para o operador comparar.
  app.get<{ Params: { id: string } }>('/api/sites/:id/concepts', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const out = [];
    for (const c of CONCEPTS) {
      const spec = c.id === site.spec.theme.concept ? site.spec : await switchConcept(site.businessId, site.spec, c.id);
      out.push({ ...c, spec, quality: evaluateSite(spec, { usableImageIds: usableImageIds(site.businessId) }).score });
    }
    return { current: site.spec.theme.concept ?? null, recommended: site.spec.meta.direction?.recommended ?? null, concepts: out };
  });

  app.post<{ Params: { id: string } }>('/api/sites/:id/concept', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const { concept } = z.object({ concept: z.enum(['refined', 'bold', 'inviting']) }).parse(req.body);
    const spec = await switchConcept(site.businessId, site.spec, concept as Concept);
    const label = CONCEPTS.find((c) => c.id === concept)!.label;
    repo.addActivity(site.businessId, 'site_concept', `Direção visual escolhida: ${label}`);
    return { site: repo.saveSite(site.id, spec, `Direção visual: ${label}`) };
  });

  app.get<{ Params: { id: string } }>('/api/sites/:id/quality', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    return evaluateSite(site.spec, { usableImageIds: usableImageIds(site.businessId) });
  });

  app.get<{ Params: { id: string } }>('/api/sites/:id/versions', async (req) => repo.listVersions(req.params.id));
  app.post<{ Params: { id: string; v: string } }>('/api/sites/:id/versions/:v/restore', async (req, reply) => {
    const spec = repo.getVersion(req.params.id, Number(req.params.v));
    if (!spec) return fail(reply, 404, 'Versão não encontrada');
    return { site: repo.saveSite(req.params.id, spec, `Restaurada a versão ${req.params.v}`) };
  });

  // Regenera o site inteiro com os dados atuais (cria nova versão, preserva histórico).
  app.post<{ Params: { id: string } }>('/api/sites/:id/regenerate', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const { useAi } = z.object({ useAi: z.boolean().optional() }).parse(req.body ?? {});
    const { spec, aiError, rationale } = await generateSpec(site.businessId, { useAi });
    return { site: repo.saveSite(site.id, spec, 'Regenerado com dados atualizados'), aiError, rationale };
  });

  // Regenera apenas os textos de uma seção com IA (não altera itens, preços ou contatos).
  app.post<{ Params: { id: string; sid: string } }>('/api/sites/:id/sections/:sid/regenerate', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    if (!aiEnabled()) return fail(reply, 409, 'IA não configurada. Defina ANTHROPIC_API_KEY para regenerar textos; sem IA, use "Alternar layout" ou edite manualmente.');
    const { instruction, spec } = z.object({ instruction: z.string().max(1000).optional(), spec: z.any().optional() }).parse(req.body ?? {});
    const doc: SiteSpec = spec ?? site.spec;
    const section = doc.sections.find((s) => s.id === req.params.sid);
    if (!section) return fail(reply, 404, 'Seção não encontrada');
    const def = SECTION_DEFS.find((d) => d.type === section.type);
    const textKeys = (def?.fields ?? []).filter((f) => f.type === 'text' || f.type === 'textarea').map((f) => f.key).filter((k) => k !== 'headline' || section.type !== 'hero');
    const currentText = Object.fromEntries(textKeys.map((k) => [k, String(section.props[k] ?? '')]));
    const out = await regenerateSectionText({ brief: buildBrief(site.businessId).data, sectionType: section.type, currentText, instruction });
    const props = { ...section.props };
    const origins = { ...section.origins };
    for (const f of out.fields) if (textKeys.includes(f.key)) ((props[f.key] = f.value), (origins[f.key] = 'ai'));
    return { section: { ...section, props, origins }, explanation: out.explanation };
  });

  app.post<{ Params: { id: string } }>('/api/sites/:id/suggestions', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const missing = computeMissing(site.businessId);
    const rules = ruleSuggestions(site.spec, missing);
    let ai: any[] = [];
    let aiError: string | undefined;
    if (aiEnabled()) {
      try {
        ai = (await suggestImprovements(site.spec, missing)).suggestions.map((s) => ({ ...s, source: 'ai' }));
      } catch (e: any) {
        aiError = e.message;
      }
    }
    return { suggestions: [...rules, ...ai], aiError };
  });

  app.get<{ Params: { id: string } }>('/api/sites/:id/preview', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const r = assetResolver(site.businessId, 'url');
    const html = renderSite(site.spec, { mode: 'preview', resolveAsset: (id) => r.resolve(id), demoNotice: demoNotice(site) });
    return reply.header('Content-Type', 'text/html; charset=utf-8').header('X-Robots-Tag', 'noindex').send(html);
  });

  // Exporta HTML único (imagens autorizadas embutidas) para apresentação offline.
  app.get<{ Params: { id: string } }>('/api/sites/:id/export', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const r = assetResolver(site.businessId, 'inline');
    await r.preload();
    const html = renderSite(site.spec, { mode: 'export', resolveAsset: (id) => r.resolve(id), demoNotice: demoNotice(site) });
    const slug = site.spec.businessName.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'site';
    repo.addActivity(site.businessId, 'export', `Demonstração exportada (versão ${site.version})`);
    return reply.header('Content-Type', 'text/html; charset=utf-8').header('Content-Disposition', `attachment; filename="demo-${slug}.html"`).send(html);
  });

  /* ---------- link público da demonstração ---------- */
  const publicUrl = (req: any, token: string) => {
    const base = (process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] ?? req.protocol}://${req.headers['x-forwarded-host'] ?? req.headers.host}`).replace(/\/$/, '');
    return `${base}/d/${token}`;
  };
  const shareInfo = (req: any, site: repo.SiteRecord) => ({
    enabled: site.share.enabled,
    url: site.share.token ? publicUrl(req, site.share.token) : null,
    views: site.share.views,
    lastView: site.share.lastView ?? null,
  });

  app.get<{ Params: { id: string } }>('/api/sites/:id/share', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    return shareInfo(req, site);
  });

  app.post<{ Params: { id: string } }>('/api/sites/:id/share', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const { enabled, regenerate } = z.object({ enabled: z.boolean(), regenerate: z.boolean().optional() }).parse(req.body);
    let token = site.share.token;
    if (!token || regenerate) token = randomBytes(12).toString('base64url');
    db.prepare('UPDATE sites SET share_token = ?, share_enabled = ? WHERE id = ?').run(token, enabled ? 1 : 0, site.id);
    repo.addActivity(site.businessId, 'share', enabled ? `Link público da demonstração ${regenerate ? 'recriado' : 'ativado'}` : 'Link público da demonstração desativado');
    return shareInfo(req, repo.getSite(site.id)!);
  });

  // Registro manual de envio (o envio em si é feito por você, fora da plataforma).
  app.post<{ Params: { id: string } }>('/api/sites/:id/sent', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const { channel, note } = z.object({ channel: z.string().max(40), note: z.string().max(1000).optional() }).parse(req.body);
    repo.addActivity(site.businessId, 'demo_sent', `Demonstração enviada ao estabelecimento via ${channel}${note ? ` — ${note}` : ''}`);
    repo.advanceStage(site.businessId, 'contacted', STAGE_IDS, 'Contato comercial realizado (envio da demonstração)');
    return { ok: true };
  });

  // Publicação: ponto de validação humana obrigatório. Infraestrutura de hospedagem é Fase 2.
  app.post<{ Params: { id: string } }>('/api/sites/:id/publish', async (req, reply) => {
    const site = repo.getSite(req.params.id);
    if (!site) return fail(reply, 404, 'Site não encontrado');
    const approval = db.prepare("SELECT 1 FROM approvals WHERE site_id = ? AND kind = 'client_approval'").get(site.id);
    if (!approval || site.status !== 'approved_by_client') return fail(reply, 403, 'Publicação bloqueada: registre a aprovação do responsável pelo estabelecimento antes de publicar.');
    return fail(reply, 501, 'Publicação com domínio próprio ainda não implementada (Fase 2). Use "Exportar HTML" para entregar os arquivos.');
  });

  /* ---------- CRM / painel ---------- */
  app.get('/api/dashboard', async () => {
    const count = (sql: string, ...a: any[]) => (db.prepare(sql).get(...a) as { c: number }).c;
    const byStage = db.prepare('SELECT stage, COUNT(*) AS c FROM businesses WHERE saved = 1 GROUP BY stage').all() as { stage: string; c: number }[];
    const bySegment = db.prepare('SELECT segment, COUNT(*) AS c FROM businesses GROUP BY segment ORDER BY c DESC').all();
    const byWebsite = db.prepare('SELECT website_status AS status, COUNT(*) AS c FROM businesses GROUP BY website_status').all();
    const top = (db.prepare("SELECT * FROM businesses WHERE website_status != 'has_site' AND stage NOT IN ('won','lost') ORDER BY saved DESC, priority_score DESC LIMIT 8").all() as any[]).map(repo.rowToBusiness);
    const recent = db
      .prepare('SELECT a.message, a.type, a.created_at AS createdAt, b.name AS businessName, b.id AS businessId FROM activities a JOIN businesses b ON b.id = a.business_id ORDER BY a.created_at DESC LIMIT 12')
      .all();
    return {
      totals: {
        found: count('SELECT COUNT(*) AS c FROM businesses'),
        opportunities: count("SELECT COUNT(*) AS c FROM businesses WHERE website_status != 'has_site'"),
        confirmedNoSite: count("SELECT COUNT(*) AS c FROM businesses WHERE website_status IN ('none_found','social_only')"),
        saved: count('SELECT COUNT(*) AS c FROM businesses WHERE saved = 1'),
        investigated: count('SELECT COUNT(*) AS c FROM businesses WHERE investigated_at IS NOT NULL'),
        demos: count('SELECT COUNT(*) AS c FROM sites'),
        reviewed: count("SELECT COUNT(*) AS c FROM sites WHERE status != 'draft'"),
        proposals: count("SELECT COUNT(*) AS c FROM businesses WHERE stage IN ('proposal_sent','negotiation','won')"),
        won: count("SELECT COUNT(*) AS c FROM businesses WHERE stage = 'won'"),
      },
      byStage,
      bySegment,
      byWebsite,
      top,
      recent,
    };
  });

  app.get('/api/pipeline', async () => {
    const rows = (db.prepare('SELECT * FROM businesses WHERE saved = 1 ORDER BY priority_score DESC').all() as any[]).map(repo.rowToBusiness);
    const siteCounts = new Map((db.prepare('SELECT business_id, COUNT(*) AS c FROM sites GROUP BY business_id').all() as any[]).map((r) => [r.business_id, r.c]));
    return STAGES.map((s) => ({ ...s, items: rows.filter((r) => r.stage === s.id).map((r) => ({ ...r, sites: siteCounts.get(r.id) ?? 0 })) }));
  });

  void json;
}
