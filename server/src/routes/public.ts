// Rotas públicas (sem login): demonstrações compartilhadas por link.

import type { FastifyInstance } from 'fastify';
import { db, now } from '../db.ts';
import { readUpload } from '../storage.ts';
import * as repo from '../repo.ts';
import { renderSite } from '../../../shared/render.ts';
import { USABLE_RIGHTS } from '../../../shared/types.ts';

const NOT_FOUND = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link indisponível</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f7f9;color:#333"><div style="text-align:center;padding:24px"><h1 style="font-size:22px">Este link não está disponível</h1><p>A demonstração pode ter sido desativada.</p></div></body></html>`;

export async function publicRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>('/d/:token', async (req, reply) => {
    const site = repo.getSiteByShareToken(req.params.token);
    reply.header('X-Robots-Tag', 'noindex, nofollow').header('Referrer-Policy', 'no-referrer');
    if (!site) return reply.code(404).type('text/html; charset=utf-8').send(NOT_FOUND);
    // Não conta visualizações do próprio operador (requisições do Hub levam o cookie de sessão).
    if (!(req.headers.cookie ?? '').includes('prospecta_session=')) {
      db.prepare('UPDATE sites SET share_views = share_views + 1, share_last_view = ? WHERE id = ?').run(now(), site.id);
    }
    const usable = new Set(repo.listAssets(site.businessId).filter((a) => USABLE_RIGHTS.includes(a.rights)).map((a) => a.id));
    const approved = site.status === 'approved_by_client' || site.status === 'published';
    const html = renderSite(site.spec, {
      mode: 'preview',
      resolveAsset: (id) => (usable.has(id) ? `/d/${req.params.token}/a/${id}` : null),
      demoNotice: approved ? null : `Proposta de site criada por ${process.env.AGENCY_NAME || 'Prospecta'} para ${site.spec.businessName}. Demonstração não oficial.`,
    });
    return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-store').send(html);
  });

  app.get<{ Params: { token: string; asset: string } }>('/d/:token/a/:asset', async (req, reply) => {
    const site = repo.getSiteByShareToken(req.params.token);
    const a = site ? repo.getAsset(req.params.asset) : null;
    if (!site || !a || a.businessId !== site.businessId || !USABLE_RIGHTS.includes(a.rights)) return reply.code(404).send();
    const buf = await readUpload(a.storedName);
    reply.header('Content-Type', a.mime).header('Cache-Control', 'public, max-age=86400').header('X-Content-Type-Options', 'nosniff');
    if (a.mime === 'image/svg+xml') reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    return reply.send(buf);
  });
}
