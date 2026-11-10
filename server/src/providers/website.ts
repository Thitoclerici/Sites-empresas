// Inspeção do site oficial (quando existe): respeita robots.txt, lê apenas a
// página inicial e extrai metadados públicos (título, descrição, cor do tema,
// dados estruturados schema.org, links de redes sociais). Não contorna bloqueios.

import { httpRequest, USER_AGENT } from './http.ts';

export interface WebsiteInfo {
  url: string;
  finalUrl: string;
  title?: string;
  description?: string;
  themeColor?: string;
  siteName?: string;
  ogImage?: string;
  socials: Record<string, string>;
  jsonLd: Record<string, unknown>[];
  phone?: string;
  quality: SiteQuality;
}

/** Avaliação objetiva de um site existente (oportunidade de reformulação). */
export interface SiteQuality {
  level: 'ok' | 'weak' | 'unreachable';
  issues: string[];
  positives: string[];
}

const BUILDERS: [RegExp, string][] = [
  [/wix\.com|wixstatic|_wixCss/i, 'Wix'],
  [/sites\.google\.com|googleusercontent\.com\/sites/i, 'Google Sites'],
  [/blogspot\.|blogger\.com/i, 'Blogger'],
  [/wordpress\.com\b/i, 'WordPress.com'],
  [/godaddysites|websitebuilder\.godaddy|img1\.wsimg\.com/i, 'GoDaddy Builder'],
  [/webnode\./i, 'Webnode'],
  [/weebly\.com|editmysite\.com/i, 'Weebly'],
  [/hostinger\.|zyrosite/i, 'Hostinger Builder'],
];

/** Sinais objetivos, sem notas arbitrárias: cada problema listado é verificável no HTML. */
export function evaluateHtml(html: string, finalUrl: string, now = new Date()): SiteQuality {
  const issues: string[] = [];
  const positives: string[] = [];
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/^https:/i.test(finalUrl)) issues.push('Sem HTTPS (navegadores mostram “não seguro”)');
  else positives.push('HTTPS ativo');
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) issues.push('Não é adaptado para celular (sem meta viewport)');
  else positives.push('Adaptado para celular');
  if (!/<title[^>]*>\s*\S/i.test(html)) issues.push('Sem título de página');
  if (!/<meta[^>]+name=["']description["']/i.test(html)) issues.push('Sem descrição para o Google (SEO)');
  const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1]));
  if (years.length) {
    const y = Math.max(...years);
    if (y <= now.getFullYear() - 2) issues.push(`Rodapé com ano ${y} (indício de site desatualizado)`);
  }
  const builder = BUILDERS.find(([re]) => re.test(html));
  if (builder) issues.push(`Feito em construtor genérico (${builder[1]})`);
  if (text.length < 400) issues.push('Pouco conteúdo na página inicial');
  if (/<(table)[^>]+(width|bgcolor)=/i.test(html) || /<font\b/i.test(html) || /<marquee\b/i.test(html)) issues.push('Código antigo (layout com tabelas/font)');
  if (/\.swf\b|<embed[^>]+flash/i.test(html)) issues.push('Usa Flash');
  const level = issues.length >= 2 ? 'weak' : 'ok';
  return { level, issues, positives };
}

async function robotsAllows(url: URL): Promise<boolean> {
  try {
    const res = await httpRequest(`${url.origin}/robots.txt`, { timeoutMs: 8000 });
    if (!res.ok) return true; // sem robots.txt = sem restrição declarada
    const txt = await res.text();
    let applies = false;
    let disallowRoot = false;
    for (const raw of txt.split('\n')) {
      const line = raw.split('#')[0]!.trim();
      const [k, ...rest] = line.split(':');
      const v = rest.join(':').trim();
      if (!k) continue;
      const key = k.toLowerCase();
      if (key === 'user-agent') applies = v === '*' || USER_AGENT.toLowerCase().includes(v.toLowerCase());
      else if (applies && key === 'disallow' && (v === '/' || (v && url.pathname.startsWith(v)))) disallowRoot = true;
    }
    return !disallowRoot;
  } catch {
    return true;
  }
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

function decode(s?: string) {
  return s
    ?.replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export async function inspectWebsite(rawUrl: string): Promise<WebsiteInfo> {
  const url = new URL(rawUrl);
  if (!(await robotsAllows(url))) throw new Error('O robots.txt do site não permite a leitura automatizada. Consulte o site manualmente.');
  const res = await httpRequest(url.toString(), { timeoutMs: 15000, headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`O site respondeu HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('html')) throw new Error('O endereço não retornou uma página HTML.');
  const html = (await res.text()).slice(0, 1_500_000);

  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (key: string) => {
    for (const m of metas) {
      const n = (attr(m, 'name') ?? attr(m, 'property') ?? '').toLowerCase();
      if (n === key) return decode(attr(m, 'content'));
    }
    return undefined;
  };
  const jsonLd: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1]!.trim());
      const list = Array.isArray(parsed) ? parsed : parsed['@graph'] ?? [parsed];
      for (const item of list) if (item && typeof item === 'object') jsonLd.push(item);
    } catch {
      /* JSON-LD inválido: ignorado */
    }
  }
  const socials: Record<string, string> = {};
  for (const m of html.matchAll(/href=["'](https?:\/\/(?:www\.)?(instagram\.com|facebook\.com|tiktok\.com|wa\.me|api\.whatsapp\.com)\/[^"'\s]+)["']/gi)) {
    const host = m[2]!.toLowerCase();
    const kind = host.startsWith('instagram') ? 'instagram' : host.startsWith('facebook') ? 'facebook' : host.startsWith('tiktok') ? 'tiktok' : 'whatsapp';
    socials[kind] ??= decode(m[1])!;
  }
  const business = jsonLd.find((j) => /Restaurant|Cafe|Store|Business|Salon|Bakery|BarOrPub|Shop/i.test(String(j['@type'] ?? '')));
  return {
    url: rawUrl,
    finalUrl: res.url || rawUrl,
    title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    description: meta('description') ?? meta('og:description'),
    themeColor: meta('theme-color'),
    siteName: meta('og:site_name'),
    ogImage: meta('og:image'),
    socials,
    jsonLd,
    phone: typeof business?.telephone === 'string' ? business.telephone : undefined,
    quality: evaluateHtml(html, res.url || rawUrl),
  };
}
