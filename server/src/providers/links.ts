// Classificação de links: site próprio x redes sociais x plataformas de terceiros.

import type { SocialLinks, WebsiteStatus } from '../../../shared/types.ts';

const SOCIAL_HOSTS: Record<string, string> = {
  'instagram.com': 'instagram',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'm.facebook.com': 'facebook',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'wa.me': 'whatsapp',
  'api.whatsapp.com': 'whatsapp',
  'linktr.ee': 'linktree',
};

/** Plataformas que não são site próprio (cardápio digital, delivery, agendamento, marketplaces). */
const PLATFORM_HOSTS = [
  'ifood.com.br', 'rappi.com.br', 'goomer.app', 'anota.ai', 'menudino.com', 'cardapioweb.com', 'cardapio.menu', 'aiqfome.com',
  'booksy.com', 'trinks.com', 'avec.app', 'simplesagenda.com.br', 'linktr.ee', 'beacons.ai', 'bio.link', 'taplink.cc',
  'google.com', 'goo.gl', 'g.page', 'business.site', 'tripadvisor.com', 'tripadvisor.com.br', 'mercadolivre.com.br', 'shopee.com.br', 'wa.me',
];

export function normalizeUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim().split(/[;\s]+/)[0]!;
  if (!s) return undefined;
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  try {
    const u = new URL(s);
    return u.toString();
  } catch {
    return undefined;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function socialKind(url: string): string | undefined {
  const h = hostOf(url);
  for (const [host, kind] of Object.entries(SOCIAL_HOSTS)) if (h === host || h.endsWith(`.${host}`)) return kind;
  return undefined;
}

export function isPlatform(url: string): boolean {
  const h = hostOf(url);
  return PLATFORM_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

/** Converte um identificador de rede social (ex.: "@cafe") em URL. */
export function socialUrl(kind: string, value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v) || v.includes('.com')) return normalizeUrl(v);
  const handle = v.replace(/^@/, '');
  if (kind === 'instagram') return `https://www.instagram.com/${handle}`;
  if (kind === 'facebook') return `https://www.facebook.com/${handle}`;
  if (kind === 'tiktok') return `https://www.tiktok.com/@${handle}`;
  return undefined;
}

export interface LinkAnalysis {
  website?: string; // site próprio
  socials: SocialLinks;
  platforms: string[];
  status: WebsiteStatus;
}

/**
 * Analisa as tags de um estabelecimento e determina a situação do site.
 * Ausência de site no OSM NÃO significa ausência de site: o status fica 'unverified'.
 */
export function analyzeLinks(tags: Record<string, string>): LinkAnalysis {
  const socials: SocialLinks = {};
  const platforms: string[] = [];
  let website: string | undefined;

  for (const key of ['contact:instagram', 'instagram']) if (tags[key]) socials.instagram ??= socialUrl('instagram', tags[key]!);
  for (const key of ['contact:facebook', 'facebook']) if (tags[key]) socials.facebook ??= socialUrl('facebook', tags[key]!);
  for (const key of ['contact:tiktok', 'tiktok']) if (tags[key]) socials.tiktok ??= socialUrl('tiktok', tags[key]!);
  const wa = tags['contact:whatsapp'] ?? tags['whatsapp'];
  if (wa) socials.whatsapp = wa;

  for (const key of ['website', 'contact:website', 'url', 'website:menu', 'brand:website']) {
    const url = normalizeUrl(tags[key]);
    if (!url) continue;
    const kind = socialKind(url);
    if (kind && kind !== 'linktree') {
      if (kind === 'whatsapp') socials.whatsapp ??= url;
      else socials[kind] ??= url;
    } else if (isPlatform(url)) {
      platforms.push(url);
    } else if (!website && key !== 'website:menu' && key !== 'brand:website') {
      website = url;
    }
  }

  let status: WebsiteStatus;
  if (website) status = 'has_site';
  else if (Object.keys(socials).length || platforms.length) status = 'social_only';
  else status = 'unverified';
  return { website, socials, platforms, status };
}
