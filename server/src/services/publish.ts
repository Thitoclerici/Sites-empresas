// Publicação de sites aprovados: monta os arquivos (HTML + imagens e PDFs autorizados),
// envia para a hospedagem (Netlify), conecta o domínio do cliente e verifica DNS/HTTPS.
// Ponto de validação humana: só publica com a aprovação do cliente registrada.

import { promises as dns } from 'node:dns';
import { db, now } from '../db.ts';
import * as repo from '../repo.ts';
import { renderSite } from '../../../shared/render.ts';
import { USABLE_RIGHTS } from '../../../shared/types.ts';
import { readUpload } from '../storage.ts';
import { createZip, type ZipEntry } from '../lib/zip.ts';
import * as netlify from '../providers/netlify.ts';
import { httpRequest } from '../providers/http.ts';

export class PublishError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function assertApproved(site: repo.SiteRecord) {
  const approval = db.prepare("SELECT 1 FROM approvals WHERE site_id = ? AND kind = 'client_approval'").get(site.id);
  if (!approval || (site.status !== 'approved_by_client' && site.status !== 'published')) {
    throw new PublishError(403, 'Publicação bloqueada: marque o site como "Aprovada pelo cliente" (registrando como a aprovação foi obtida) antes de publicar.');
  }
}

/** Arquivos do site: index.html + assets autorizados usados no documento + robots/sitemap. */
export async function buildSiteFiles(site: repo.SiteRecord, domain?: string): Promise<ZipEntry[]> {
  const specJson = JSON.stringify(site.spec);
  const assets = repo.listAssets(site.businessId).filter((a) => USABLE_RIGHTS.includes(a.rights) && specJson.includes(a.id));
  const byId = new Map(assets.map((a) => [a.id, a]));
  const html = renderSite(site.spec, {
    mode: 'export',
    resolveAsset: (id) => {
      const a = byId.get(id);
      return a ? `assets/${a.storedName}` : null;
    },
    demoNotice: null,
  });
  const entries: ZipEntry[] = [{ name: 'index.html', data: Buffer.from(html, 'utf8') }];
  for (const a of assets) {
    const data = await readUpload(a.storedName).catch(() => null);
    if (data) entries.push({ name: `assets/${a.storedName}`, data });
  }
  const base = domain ? `https://${domain}` : undefined;
  entries.push({ name: 'robots.txt', data: Buffer.from(`User-agent: *\nAllow: /\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`) });
  if (base) {
    entries.push({
      name: 'sitemap.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc><lastmod>${now().slice(0, 10)}</lastmod></url></urlset>\n`),
    });
  }
  // Cabeçalhos de segurança e cache servidos pela Netlify.
  entries.push({
    name: '_headers',
    data: Buffer.from('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n'),
  });
  return entries;
}

function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'site';
}

async function ensureNetlifySite(site: repo.SiteRecord): Promise<repo.PublishInfo> {
  if (site.publish?.siteId) return site.publish;
  const base = slugify(site.spec.businessName);
  for (let i = 0; i < 4; i++) {
    const name = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      const s = await netlify.createSite(name);
      return { provider: 'netlify', siteId: s.id, siteName: s.name, url: s.ssl_url || s.url || `https://${s.name}.netlify.app`, adminUrl: s.admin_url };
    } catch (e: any) {
      if (e?.status !== 422) throw e; // 422 = nome já usado: tenta outro
    }
  }
  throw new PublishError(502, 'Não foi possível criar o site na Netlify (nomes indisponíveis). Tente novamente.');
}

export async function publish(siteId: string): Promise<repo.SiteRecord> {
  const site = repo.getSite(siteId);
  if (!site) throw new PublishError(404, 'Site não encontrado');
  assertApproved(site);
  if (!netlify.netlifyEnabled()) throw new PublishError(503, 'Hospedagem não configurada: defina NETLIFY_AUTH_TOKEN nas variáveis do servidor (veja o passo a passo na tela de publicação).');

  const info = await ensureNetlifySite(site);
  repo.setPublishInfo(site.id, info); // guarda o site criado mesmo que o envio falhe
  const files = await buildSiteFiles(site, info.domain);
  const deploy = await netlify.deployZip(info.siteId, createZip(files));
  let state = deploy;
  for (let i = 0; i < 30 && !['ready', 'error'].includes(state.state); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    state = await netlify.getDeploy(deploy.id);
  }
  if (state.state === 'error') throw new PublishError(502, `A Netlify recusou a publicação: ${state.error_message ?? 'erro desconhecido'}`);
  const updated: repo.PublishInfo = { ...info, publishedAt: now(), publishedVersion: site.version, deployId: deploy.id };
  repo.setPublishInfo(site.id, updated);
  repo.setSiteStatus(site.id, 'published');
  repo.addActivity(site.businessId, 'site_published', `Site publicado (versão ${site.version}) em ${updated.domain ? `https://${updated.domain}` : updated.url}${state.state !== 'ready' ? ' — processamento ainda em andamento na Netlify' : ''}`);
  return repo.getSite(site.id)!;
}

export async function unpublish(siteId: string): Promise<repo.SiteRecord> {
  const site = repo.getSite(siteId);
  if (!site) throw new PublishError(404, 'Site não encontrado');
  if (site.publish?.siteId) {
    await netlify.deleteSite(site.publish.siteId).catch((e: any) => {
      if (e?.status !== 404) throw e;
    });
  }
  repo.setPublishInfo(site.id, null);
  repo.setSiteStatus(site.id, 'approved_by_client');
  repo.addActivity(site.businessId, 'site_unpublished', 'Site retirado do ar (hospedagem removida)');
  return repo.getSite(site.id)!;
}

/* ---------- domínio próprio ---------- */

const TWO_LEVEL_SUFFIXES = ['com.br', 'net.br', 'org.br', 'art.br', 'adv.br', 'eng.br', 'ind.br', 'inf.br', 'med.br', 'arq.br', 'eco.br', 'emp.br', 'blog.br', 'co.uk', 'com.ar', 'com.pt'];

export function normalizeDomain(input: string): { domain: string; kind: 'apex' | 'subdomain'; apex: string } {
  const d = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d)) throw new PublishError(400, 'Domínio inválido. Exemplo: cafearoma.com.br');
  const labels = d.split('.');
  const suffix2 = labels.slice(-2).join('.');
  const apexLabels = TWO_LEVEL_SUFFIXES.includes(suffix2) ? 3 : 2;
  if (labels.length < apexLabels) throw new PublishError(400, 'Domínio incompleto. Exemplo: cafearoma.com.br');
  const apex = labels.slice(-apexLabels).join('.');
  return { domain: d, kind: labels.length === apexLabels ? 'apex' : 'subdomain', apex };
}

export interface DnsRecord {
  type: 'A' | 'CNAME';
  name: string; // como digitar no painel (vazio = domínio raiz)
  host: string; // nome completo
  value: string;
}

export function dnsRecords(info: repo.PublishInfo): DnsRecord[] {
  if (!info.domain) return [];
  const target = `${info.siteName}.netlify.app`;
  if (info.domainKind === 'subdomain') {
    const { apex } = normalizeDomain(info.domain);
    return [{ type: 'CNAME', name: info.domain.slice(0, -(apex.length + 1)), host: info.domain, value: target }];
  }
  return [
    { type: 'A', name: '', host: info.domain, value: netlify.NETLIFY_APEX_IP },
    { type: 'CNAME', name: 'www', host: `www.${info.domain}`, value: target },
  ];
}

export async function connectDomain(siteId: string, input: string): Promise<repo.SiteRecord> {
  const site = repo.getSite(siteId);
  if (!site) throw new PublishError(404, 'Site não encontrado');
  assertApproved(site);
  if (!site.publish?.siteId) throw new PublishError(409, 'Publique o site antes de conectar o domínio.');
  const { domain, kind } = normalizeDomain(input);
  await netlify.setCustomDomain(site.publish.siteId, domain, kind === 'apex' ? [`www.${domain}`] : []);
  const info: repo.PublishInfo = { ...site.publish, domain, domainKind: kind };
  repo.setPublishInfo(site.id, info);
  repo.addActivity(site.businessId, 'site_domain', `Domínio ${domain} vinculado ao site publicado`);
  // Republica para atualizar sitemap/robots com o domínio definitivo.
  if (site.status === 'published') await publish(site.id).catch(() => undefined);
  return repo.getSite(site.id)!;
}

export async function removeDomain(siteId: string): Promise<repo.SiteRecord> {
  const site = repo.getSite(siteId);
  if (!site?.publish?.siteId) throw new PublishError(404, 'Site não publicado');
  await netlify.setCustomDomain(site.publish.siteId, null, []);
  repo.setPublishInfo(site.id, { ...site.publish, domain: undefined, domainKind: undefined });
  return repo.getSite(site.id)!;
}

export interface DomainCheck {
  domain: string;
  records: (DnsRecord & { ok: boolean; found: string[] })[];
  dnsOk: boolean;
  httpsOk: boolean;
  message: string;
}

async function lookup(host: string, type: 'A' | 'CNAME'): Promise<string[]> {
  try {
    if (type === 'A') return await dns.resolve4(host);
    return (await dns.resolveCname(host)).map((x) => x.replace(/\.$/, '').toLowerCase());
  } catch {
    return [];
  }
}

export async function checkDomain(siteId: string): Promise<DomainCheck> {
  const site = repo.getSite(siteId);
  if (!site?.publish?.domain) throw new PublishError(409, 'Nenhum domínio vinculado.');
  const info = site.publish;
  const records = [];
  for (const r of dnsRecords(info)) {
    const found = await lookup(r.host, r.type);
    // CNAME do www às vezes é resolvido como A (via proxy do DNS); aceita os IPs da Netlify também.
    let ok = found.includes(r.value.toLowerCase());
    if (!ok && r.type === 'CNAME') {
      const asA = await lookup(r.host, 'A');
      const targetA = await lookup(r.value, 'A');
      ok = asA.length > 0 && asA.some((ip) => targetA.includes(ip));
    }
    records.push({ ...r, ok, found });
  }
  const dnsOk = records.every((r) => r.ok);
  let httpsOk = false;
  if (dnsOk) {
    try {
      const res = await httpRequest(`https://${info.domain}/`, { method: 'GET', timeoutMs: 10000 });
      httpsOk = res.ok;
    } catch {
      httpsOk = false;
    }
    if (!httpsOk) await netlify.provisionSsl(info.siteId).catch(() => undefined);
  }
  const message = !dnsOk
    ? 'O DNS ainda não aponta para a hospedagem. Confira os registros no Registro.br. Alterações podem levar de alguns minutos até 24 horas para propagar.'
    : httpsOk
      ? `Tudo certo: https://${info.domain} está no ar com HTTPS.`
      : 'DNS correto. O certificado HTTPS está sendo emitido — costuma levar alguns minutos. Verifique novamente em seguida.';
  return { domain: info.domain!, records, dnsOk, httpsOk, message };
}
