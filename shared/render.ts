// Renderizador: SiteSpec -> HTML estático, responsivo e otimizado para SEO.
// Função pura, usada pelo servidor (exportação/link público) e pelo editor (prévia ao vivo).
//
// Três linguagens visuais completas (conceitos), cada uma com composição própria:
//   refined  — editorial e sofisticado      bold — tipografia gigante e blocos de cor
//   inviting — produtos à frente e conversão
// Sem fotos autorizadas, usa arte gráfica generativa (única por negócio) — nunca fotos
// genéricas apresentadas como do estabelecimento.

import type { Item, ItemGroup, Section, SiteSpec, Theme } from './site.ts';
import { telLink, waLink } from './site.ts';

export interface RenderOptions {
  mode: 'editor' | 'preview' | 'export';
  /** Resolve um asset id para URL. Retorna null se o uso não estiver autorizado. */
  resolveAsset: (id: string) => string | null;
  /** Aviso de demonstração (null quando o site foi aprovado pelo cliente). */
  demoNotice: string | null;
  selectedSectionId?: string;
}

type Concept = 'refined' | 'bold' | 'inviting';

/* ======================================================================= */
/* utilidades                                                               */
/* ======================================================================= */

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const nl2br = (s: unknown) => esc(s).replace(/\n/g, '<br>');

function safeHref(href: unknown): string {
  const h = String(href ?? '').trim();
  if (!h) return '#';
  if (/^(https?:|mailto:|tel:|#)/i.test(h)) return esc(h);
  return '#';
}
const isExternal = (href: unknown) => /^https?:/i.test(String(href ?? ''));
const target = (href: unknown) => (isExternal(href) ? ' target="_blank" rel="noopener"' : '');

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
/** Cor de texto (quase preto ou branco) com MAIOR contraste sobre o fundo. */
export function readableOn(bg: string): string {
  const L = luminance(bg);
  const withDark = (L + 0.05) / (luminance('#111111') + 0.05);
  const withLight = 1.05 / (L + 0.05);
  return withDark >= withLight ? '#111111' : '#FFFFFF';
}
function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function initials(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s&]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^\p{Lu}/u.test(w));
  return (words.length ? words : [name]).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

/** Nome para exibição grande: remove marcações entre parênteses como "(teste)". */
function displayName(name: string) {
  const clean = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return clean || name;
}

function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/* ======================================================================= */
/* ícones e ilustrações (SVG próprios)                                      */
/* ======================================================================= */

const ICON: Record<string, string> = {
  coffee: '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8.5 2.5c-.6.8.6 1.6 0 2.5M11.5 2.5c-.6.8.6 1.6 0 2.5"/><path d="M3 21h16"/>',
  utensils: '<path d="M6 3v6a2 2 0 0 0 4 0V3M8 3v18"/><path d="M17 21V3c-2.2 1.6-3 4.6-3 8h3"/>',
  pizza: '<path d="M12 21 3.6 6.8a15 15 0 0 1 16.8 0z"/><path d="M5 9.2a12.5 12.5 0 0 1 14 0"/><circle cx="12" cy="11.5" r="1.2"/><circle cx="9.6" cy="14.6" r="1"/><circle cx="14.2" cy="15.2" r="1"/>',
  bread: '<path d="M4 11.5A4 4 0 0 1 7 4.5h10a4 4 0 0 1 3 7V19H4z"/><path d="M9 8 7.6 11M13 8l-1.4 3M17 8l-1.4 3"/>',
  glass: '<path d="M5 4h14l-7 8z"/><path d="M12 12v7M8 20h8"/><path d="m15 2-2.5 4.5"/>',
  icecream: '<path d="m8 11 4 10 4-10"/><path d="M7 11a5 5 0 1 1 10 0z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.2 8.2 20 20M8.2 15.8 20 4"/>',
  pole: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="m8 7 8 4M8 12l8 4M8 17l4 2"/>',
  sparkle: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 2.5v4M17 4.5h4"/>',
  hanger: '<path d="M10 5a2 2 0 1 1 3 1.7c-.7.5-1 .9-1 1.8"/><path d="m12 8.5-8.4 5.6A1.4 1.4 0 0 0 4.4 17h15.2a1.4 1.4 0 0 0 .8-2.9z"/>',
  paw: '<circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14" cy="6" r="1.8"/><circle cx="17.5" cy="10" r="1.8"/><path d="M8.5 17c0-3 1.8-5 3.5-5s3.5 2 3.5 5c0 2-1.5 3-3.5 3s-3.5-1-3.5-3z"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone: '<path d="M5 3.5h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 13.5l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5.5a2 2 0 0 1 2-2z"/>',
  chat: '<path d="M4 20.5 5.4 16.4A8.5 8.5 0 1 1 8.6 19.4z"/><path d="M9 10.5c.5 2 2 3.6 4.4 4.4l1.1-1.2 1.8.8"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.8 12.6a9.5 9.5 0 0 1 12.4 0M9.2 16.1a4.6 4.6 0 0 1 5.6 0"/><circle cx="12" cy="19.4" r=".9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  access: '<circle cx="12" cy="4.5" r="1.7"/><path d="M6.5 8.5h11M12 8.5v5.5l4 6M12 14H8.5l-2 6"/>',
  truck: '<path d="M2.5 6h11v10h-11zM13.5 9.5h4l3 3V16h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  takeaway: '<path d="M6 8h12l-1.2 12H7.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="M9.5 13h5"/>',
  leaf: '<path d="M5 19C5 11 11 5 20 5c0 9-6 15-14 15"/><path d="m5 19 7-7"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  card: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>',
  snow: '<path d="M12 2.5v19M4 7l16 10M4 17 20 7"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUR: '<path d="M7 17 17 7M8 7h9v9"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  baby: '<circle cx="12" cy="9" r="5"/><path d="M10 9h.01M14 9h.01M10.5 11.5c.8.6 2.2.6 3 0"/><path d="M7 20c1.2-2.5 3-3.5 5-3.5s3.8 1 5 3.5"/>',
  insta: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".8"/>',
  fb: '<path d="M14 8.5h3V5h-3a4 4 0 0 0-4 4v2.5H7.5V15H10v6h3.5v-6H16l.5-3.5h-3V9.5a1 1 0 0 1 1-1z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
};

function icon(name: string, cls = 'i'): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] ?? ICON.check}</svg>`;
}

const SEGMENT_ICON: Record<string, string> = {
  cafe: 'coffee', restaurant: 'utensils', pizzeria: 'pizza', bakery: 'bread', bar: 'glass', ice_cream: 'icecream',
  barbershop: 'scissors', beauty_salon: 'sparkle', clothing: 'hanger', pet_shop: 'paw', retail: 'bag',
};
const SEGMENT_LABEL: Record<string, string> = {
  cafe: 'Cafeteria', restaurant: 'Restaurante', pizzeria: 'Pizzaria', bakery: 'Padaria', bar: 'Bar', ice_cream: 'Sorveteria',
  barbershop: 'Barbearia', beauty_salon: 'Salão de beleza', clothing: 'Loja de roupas', pet_shop: 'Pet shop', retail: 'Loja',
};

function highlightIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('wi-fi') || t.includes('wifi')) return 'wifi';
  if (t.includes('ar livre') || t.includes('externa')) return 'sun';
  if (t.includes('acess')) return 'access';
  if (t.includes('delivery') || t.includes('entrega')) return 'truck';
  if (t.includes('viagem')) return 'takeaway';
  if (t.includes('vegan') || t.includes('vegetar') || t.includes('glúten') || t.includes('gluten') || t.includes('natural')) return 'leaf';
  if (t.includes('reserva') || t.includes('agend') || t.includes('hora marcada')) return 'calendar';
  if (t.includes('pix') || t.includes('cart')) return 'card';
  if (t.includes('pet')) return 'paw';
  if (t.includes('climatiz')) return 'snow';
  if (t.includes('fraldário')) return 'baby';
  if (t.includes('café') || t.includes('cafe')) return 'coffee';
  if (t.includes('pão') || t.includes('pães')) return 'bread';
  if (t.includes('toalha') || t.includes('navalha')) return 'scissors';
  return 'star';
}

/**
 * Arte gráfica generativa: composição única por negócio (semente = nome), com formas nas
 * cores da marca, ilustração em traço do segmento, textura granulada e legenda com dados reais.
 */
function artwork(ctx: Ctx, shape: 'arch' | 'rect' | 'circle', caption: string, variant = ''): string {
  const t = ctx.theme;
  const rnd = seeded(ctx.spec.businessName + variant);
  const id = `g${Math.floor(rnd() * 1e6)}`;
  // Formato: vertical (painéis laterais) ou horizontal (capas e faixas largas) — a composição se adapta.
  const wide = variant === 'cover' || variant === 'center';
  const W = wide ? 1600 : 600;
  const H = wide ? 720 : 800;
  const base = t.dark ? mix(t.secondary, t.primary, 0.25) : t.primary;
  const onBase = readableOn(base);
  const c1 = t.accent;
  const c2 = t.dark ? t.primary : mix(t.primary, '#000000', 0.35);
  const c3 = mix(t.background, '#FFFFFF', 0.3);
  const cx = wide ? W * (0.52 + rnd() * 0.2) : 160 + rnd() * 280;
  const cy = wide ? H * (0.38 + rnd() * 0.1) : 180 + rnd() * 220;
  const r1 = wide ? 230 + rnd() * 60 : 150 + rnd() * 80;
  const ax = wide ? W * (0.6 + rnd() * 0.15) : 40 + rnd() * 120;
  const archW = wide ? 360 : 300;
  const rot = Math.floor(rnd() * 4) * 90;
  const hx = wide ? W * 0.86 : 480;
  const hy = wide ? H * 0.78 : 640;
  const shapes = [
    `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r1.toFixed(0)}" fill="${c1}" opacity=".92"/>`,
    `<path d="M${ax.toFixed(0)} ${H} V${(H - (wide ? 330 : 280) - rnd() * 90).toFixed(0)} a${archW / 2} ${archW / 2} 0 0 1 ${archW} 0 V${H}z" fill="${c2}" opacity=".95"/>`,
    `<g transform="rotate(${rot} ${hx} ${hy})"><path d="M${hx - 100} ${hy} a100 100 0 0 1 200 0z" fill="${c3}" opacity=".9"/></g>`,
    `<g fill="${onBase}" opacity=".5">${Array.from({ length: 24 }, (_, i) => `<circle cx="${(wide ? W * 0.08 : 430) + (i % 6) * 22}" cy="${(wide ? 90 : 70) + Math.floor(i / 6) * 22}" r="2.4"/>`).join('')}</g>`,
  ].join('');
  const sc = wide ? 15 : 13;
  const illo = `<g transform="translate(${(cx - 12 * sc).toFixed(0)} ${(cy - 12 * sc).toFixed(0)}) scale(${sc})" fill="none" stroke="${readableOn(c1)}" stroke-width=".11" stroke-linecap="round" stroke-linejoin="round">${ICON[ctx.segIcon] ?? ICON.star}</g>`;
  const clip = shape === 'arch' && !wide ? `<path d="M0 ${H}V300A300 300 0 0 1 600 300V${H}z"/>` : shape === 'circle' && !wide ? `<rect width="${W}" height="${H}" rx="300"/>` : `<rect width="${W}" height="${H}"/>`;
  return `<svg class="artsvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Arte gráfica de ${esc(displayName(ctx.spec.businessName))}">
<defs><clipPath id="${id}c">${clip}</clipPath>
<filter id="${id}n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0"/></filter></defs>
<g clip-path="url(#${id}c)"><rect width="${W}" height="${H}" fill="${base}"/>${shapes}${illo}<rect width="${W}" height="${H}" filter="url(#${id}n)" opacity=".35"/>
${wide ? '' : `<text x="32" y="${H - 30}" fill="${onBase}" font-size="15" letter-spacing="4" font-family="var(--bf)" font-weight="600" opacity=".85">${esc(caption.toUpperCase())}</text>`}</g></svg>`;
}

/** Selo circular com texto girando (dados reais: segmento e local). */
function badge(ctx: Ctx, text: string): string {
  const id = `b${Math.floor(seeded(ctx.spec.businessName + 'b')() * 1e6)}`;
  const unit = `${text} • `.toUpperCase();
  const label = unit.repeat(Math.max(1, Math.round(44 / unit.length)));
  return `<div class="badge" aria-hidden="true"><svg viewBox="0 0 200 200"><defs><path id="${id}" d="M100 100 m-74 0 a74 74 0 1 1 148 0 a74 74 0 1 1 -148 0"/></defs><text font-size="14" font-weight="700"><textPath href="#${id}" textLength="462" lengthAdjust="spacing">${esc(label)}</textPath></text></svg><span>${icon(ctx.segIcon)}</span></div>`;
}

/* ======================================================================= */
/* contexto e dados derivados                                               */
/* ======================================================================= */

interface Ctx {
  spec: SiteSpec;
  theme: Theme;
  concept: Concept;
  opts: RenderOptions;
  img: (id?: string) => string | null;
  editor: boolean;
  segIcon: string;
  segLabel: string;
  place?: string;
  photos: string[];
}

function conceptOf(t: Theme): Concept {
  if (t.concept) return t.concept;
  return t.heroStyle === 'editorial' ? 'refined' : t.heroStyle === 'banner' ? 'bold' : 'inviting';
}

function hoursRows(spec: SiteSpec): { days: string; hours: string }[] {
  const s = spec.sections.find((x) => (x.type === 'visit' || x.type === 'hours') && x.visible && (x.props.rows ?? []).length);
  return ((s?.props.rows ?? []) as { days: string; hours: string }[]).filter((r) => r?.days);
}

function directionsUrl(spec: SiteSpec) {
  const b = spec.business;
  if (b.lat != null && b.lon != null) return `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lon}`;
  if (b.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spec.businessName}, ${b.address}`)}`;
  return undefined;
}

function primaryContact(spec: SiteSpec): { label: string; short: string; href: string; icon: string } | null {
  const b = spec.business;
  const wa = waLink(b.whatsapp, `Olá! Vim pelo site da ${displayName(spec.businessName)}.`);
  if (wa) return { label: 'Chamar no WhatsApp', short: 'WhatsApp', href: wa, icon: 'chat' };
  const tel = telLink(b.phone);
  if (tel) return { label: 'Ligar agora', short: 'Ligar', href: tel, icon: 'phone' };
  return null;
}

function shortHours(spec: SiteSpec) {
  const r = hoursRows(spec)[0];
  if (!r) return null;
  const d = r.days.replace('Segunda', 'Seg').replace('Terça', 'Ter').replace('Quarta', 'Qua').replace('Quinta', 'Qui').replace('Sexta', 'Sex').replace('Sábado', 'Sáb').replace('Domingo', 'Dom').replace(' a ', '–');
  return `${d} · ${r.hours.replace(/:00/g, 'h').replace(' às ', '–').replace(/(\d{2}):(\d{2})/g, '$1h$2')}`;
}

function shortAddress(spec: SiteSpec) {
  return spec.business.address?.split(',').slice(0, 2).join(',').trim();
}

function contentAnchor(spec: SiteSpec) {
  const s = spec.sections.find((x) => ['menu', 'services', 'products'].includes(x.type) && x.visible);
  if (!s) return null;
  const has = s.type === 'menu' ? (s.props.groups ?? []).some((g: ItemGroup) => g.items?.some((i) => i.name)) : (s.props.items ?? []).some((i: Item) => i.name);
  if (!has && !s.props.menuLink && !s.props.menuFile) return null;
  return { id: s.type === 'menu' ? 'cardapio' : s.type === 'services' ? 'servicos' : 'produtos', label: s.type === 'menu' ? 'Ver cardápio' : s.type === 'services' ? 'Ver serviços' : 'Ver produtos' };
}

function allItems(spec: SiteSpec): Item[] {
  const s = spec.sections.find((x) => ['menu', 'services', 'products'].includes(x.type) && x.visible);
  if (!s) return [];
  if (s.type === 'menu') return ((s.props.groups ?? []) as ItemGroup[]).flatMap((g) => g.items ?? []).filter((i) => i?.name);
  return ((s.props.items ?? []) as Item[]).filter((i) => i?.name);
}

/* ======================================================================= */
/* CSS                                                                      */
/* ======================================================================= */

const SERIF = new Set(['Fraunces', 'Playfair Display', 'DM Serif Display', 'Cormorant Garamond', 'Lora', 'Instrument Serif']);
const CONDENSED = new Set(['Anton', 'Oswald', 'Bebas Neue']);

function fontStack(f: string) {
  if (SERIF.has(f)) return `'${f}','Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif`;
  if (CONDENSED.has(f)) return `'${f}','Impact','Arial Narrow Bold','Helvetica Neue',sans-serif`;
  return `'${f}',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`;
}

function fontsHref(t: Theme): string {
  const weights: Record<string, string> = { 'Cormorant Garamond': '400,500,600,700,400i,500i', Fraunces: '400,500,600,700,400i', 'Playfair Display': '400,600,700,400i', Anton: '400' };
  const fams = Array.from(new Set([t.headingFont, t.bodyFont]))
    .map((f) => `${f.toLowerCase().replace(/\s+/g, '-')}:${weights[f] ?? '400,500,600,700'}`)
    .join('|');
  // Bunny Fonts: API compatível com Google Fonts, sem rastreamento (adequado à LGPD).
  return `https://fonts.bunny.net/css?family=${fams}&display=swap`;
}

function baseCss(t: Theme): string {
  const onP = readableOn(t.primary);
  const onA = readableOn(t.accent);
  const line = rgba(t.text, t.dark ? 0.16 : 0.12);
  return `
:root{--p:${t.primary};--a:${t.accent};--ink:${t.secondary};--bg:${t.background};--sf:${t.surface};--tx:${t.text};--mu:${t.muted};
--onp:${onP};--ona:${onA};--line:${line};--soft:${rgba(t.primary, t.dark ? 0.2 : 0.08)};--hf:${fontStack(t.headingFont)};--bf:${fontStack(t.bodyFont)};--r:${t.radius}px;
--pad:clamp(72px,10vw,140px);--ease:cubic-bezier(.2,.7,.2,1)}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--tx);font-family:var(--bf);font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
img{max-width:100%;display:block}a{color:inherit}p{margin:0 0 1em}
h1,h2,h3,h4{margin:0;font-family:var(--hf);font-weight:600;line-height:1.02}
.wrap{width:min(1240px,100% - 48px);margin:0 auto}
section{position:relative}
.i{width:20px;height:20px;flex:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 26px;font:600 1rem/1 var(--bf);text-decoration:none;border:1.5px solid var(--p);background:var(--p);color:var(--onp);transition:transform .25s var(--ease),box-shadow .25s,background .25s,color .25s;cursor:pointer;white-space:nowrap}
.btn .i{width:18px;height:18px;transition:transform .25s var(--ease)}.btn:hover .i{transform:translateX(3px)}
.btn:hover{transform:translateY(-2px);box-shadow:0 16px 30px -14px ${rgba(t.primary, 0.7)}}
.btn.ghost{background:transparent;color:inherit;border-color:currentColor}
.btn.ghost:hover{box-shadow:none;background:${rgba(t.text, 0.06)}}
.btns{display:flex;flex-wrap:wrap;gap:12px}
.link{display:inline-flex;align-items:center;gap:8px;font-weight:600;text-decoration:none;border-bottom:1.5px solid currentColor;padding-bottom:3px}
.link .i{width:16px;height:16px}
.kicker{font:600 .78rem/1.3 var(--bf);letter-spacing:.2em;text-transform:uppercase;color:var(--mu)}
/* revelação ao rolar */
.js .rv{opacity:0;transform:translateY(28px);transition:opacity 1s var(--ease),transform 1s var(--ease)}
.js .rv.in{opacity:1;transform:none}.js .rv.d1{transition-delay:.08s}.js .rv.d2{transition-delay:.16s}.js .rv.d3{transition-delay:.24s}.js .rv.d4{transition-delay:.32s}
@media (prefers-reduced-motion:reduce){.js .rv{opacity:1;transform:none;transition:none}.marq-track,.badge svg{animation:none!important}}
/* topo */
.top{position:sticky;top:0;z-index:30;transition:background .3s,box-shadow .3s}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:20px;height:76px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;min-width:0}
.brand img{height:44px;width:auto}
.brand b{font-family:var(--hf);font-size:1.35rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em}
.nav{display:flex;align-items:center;gap:30px}.nav a{text-decoration:none;font-size:.95rem;font-weight:500;opacity:.8;transition:opacity .2s}.nav a:hover{opacity:1}
.top .btn{min-height:44px;padding:0 18px;font-size:.92rem}
.mnav{display:none}
@media(max-width:900px){.nav,.top .btn.desk{display:none}.mnav{display:block;position:relative}
.mnav summary{list-style:none;cursor:pointer;width:44px;height:44px;display:grid;place-items:center;border-radius:12px;border:1px solid var(--line)}
.mnav summary::-webkit-details-marker{display:none}.mnav[open] summary{background:var(--soft)}
.mnav .sheet{position:absolute;right:0;top:54px;min-width:220px;background:var(--sf);color:var(--tx);border:1px solid var(--line);border-radius:16px;padding:10px;box-shadow:0 24px 60px -20px rgba(0,0,0,.35);display:grid}
.mnav .sheet a{padding:12px 14px;border-radius:10px;text-decoration:none;font-weight:600}.mnav .sheet a:hover{background:var(--soft)}}
/* letreiro */
.marq{overflow:hidden;white-space:nowrap;padding:22px 0;border-block:1px solid var(--line)}
.marq-track{display:inline-flex;gap:48px;animation:marq 38s linear infinite;padding-left:48px}
.marq span{display:inline-flex;align-items:center;gap:48px;font-family:var(--hf);font-size:clamp(1.4rem,3vw,2.4rem);text-transform:uppercase;letter-spacing:.02em}
.marq span::after{content:'✦';font-size:.6em;opacity:.7}
@keyframes marq{to{transform:translateX(-50%)}}
/* selo */
.badge{position:absolute;width:150px;height:150px;display:grid;place-items:center;z-index:3}
.badge svg{position:absolute;inset:0;width:100%;height:100%;animation:spin 22s linear infinite;fill:currentColor}
.badge span .i{width:34px;height:34px}
@keyframes spin{to{transform:rotate(360deg)}}
/* arte */
.artsvg{width:100%;height:100%;display:block}
.frame{position:relative;overflow:hidden;background:var(--soft)}
.frame img{width:100%;height:100%;object-fit:cover;transition:transform 1.2s var(--ease)}
.frame:hover img{transform:scale(1.03)}
/* itens */
.price{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.note{font-size:.88rem;color:var(--mu);margin-top:28px}
/* visite */
.visit-grid{display:grid;grid-template-columns:1.1fr 1fr 1.3fr;gap:clamp(24px,4vw,48px);align-items:start}
.vblock h3{font:600 .78rem/1 var(--bf);letter-spacing:.2em;text-transform:uppercase;color:var(--mu);margin-bottom:16px}
.vaddr{font-family:var(--hf);font-size:clamp(1.5rem,2.6vw,2.1rem);line-height:1.15;margin-bottom:18px}
.vcontacts{display:grid;gap:10px;margin-top:18px}.vcontacts a{display:inline-flex;align-items:center;gap:10px;text-decoration:none;font-weight:600}
.vcontacts .i{color:var(--p)}
.hrow{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid var(--line)}
.hrow:last-child{border:0}.hrow span:last-child{color:var(--mu);text-align:right}
.hrow.today span{font-weight:700;color:var(--tx)}.hrow.today span:first-child::after{content:'Hoje';margin-left:10px;font:700 .68rem/1 var(--bf);letter-spacing:.12em;text-transform:uppercase;padding:4px 8px;border-radius:999px;background:var(--p);color:var(--onp);vertical-align:2px}
.hrow.closed span:last-child{color:var(--a)}
.map{min-height:360px;height:100%;overflow:hidden;border:1px solid var(--line);background:var(--soft)}
.map iframe{width:100%;height:100%;min-height:360px;border:0;display:block;filter:saturate(.35) contrast(1.05)}
.socials{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.socials a{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid var(--line);text-decoration:none;font-weight:600;font-size:.9rem;border-radius:999px}
.socials .i{width:16px;height:16px}
@media(max-width:980px){.visit-grid{grid-template-columns:1fr!important}.map{min-height:300px}}
@media(max-width:600px){.vaddr{font-size:1.45rem}}
/* rodapé */
footer{padding:80px 0 40px;overflow:hidden}
.foot-word{font-family:var(--hf);line-height:.85;letter-spacing:-.03em;margin:0 0 56px;white-space:nowrap}
.foot-cols{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:32px;font-size:.95rem}
.foot-cols h4{font:600 .74rem/1 var(--bf);letter-spacing:.2em;text-transform:uppercase;margin-bottom:16px;opacity:.7}
.foot-cols ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}.foot-cols a{text-decoration:none;opacity:.85}.foot-cols a:hover{opacity:1}
.foot-bot{margin-top:56px;padding-top:24px;border-top:1px solid ${rgba(t.text, 0.15)};font-size:.82rem;opacity:.65;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media(max-width:800px){.foot-cols{grid-template-columns:1fr}}
/* barra fixa no celular */
.mbar{display:none}
@media(max-width:760px){
.mbar{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:8px;position:fixed;left:10px;right:10px;bottom:10px;z-index:40;padding:8px;border-radius:18px;background:${rgba(t.dark ? t.surface : '#FFFFFF', 0.92)};backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 18px 40px -12px rgba(0,0,0,.35);border:1px solid var(--line)}
.mbar a{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:12px;text-decoration:none;font:600 .74rem/1 var(--bf);color:var(--tx)}
.mbar a.main{background:var(--p);color:var(--onp)}.mbar .i{width:20px;height:20px}
body{padding-bottom:92px}body{font-size:16px}}
.demo-note{background:#111;color:#fff;font:500 12.5px/1.4 system-ui,sans-serif;text-align:center;padding:8px 16px}
`;
}

function refinedCss(t: Theme): string {
  return `
.c-refined .top{background:${rgba(t.background, 0.86)};backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.c-refined .brand b{font-size:1.5rem;font-weight:500}
.c-refined .nav a{font-size:.8rem;letter-spacing:.16em;text-transform:uppercase;font-weight:600}
.c-refined .btn{border-radius:0}
.c-refined h2{font-size:clamp(2.2rem,4.6vw,3.8rem);font-weight:500;letter-spacing:-.02em}
.c-refined .sec{padding:var(--pad) 0}
.c-refined .shead{display:grid;grid-template-columns:220px 1fr;gap:32px;margin-bottom:clamp(40px,6vw,72px);align-items:end}
.c-refined .shead .num{font:500 .8rem/1 var(--bf);letter-spacing:.2em;text-transform:uppercase;color:var(--mu);border-top:1px solid var(--tx);padding-top:14px}
.c-refined .shead p{color:var(--mu);max-width:560px;margin:14px 0 0}
@media(max-width:800px){.c-refined .shead{grid-template-columns:1fr;gap:16px}}
/* hero */
.hr{min-height:min(92vh,920px);display:grid}
.hr-grid{display:grid;grid-template-columns:1.05fr .95fr;min-height:inherit}
.hr-text{display:flex;flex-direction:column;justify-content:center;padding:clamp(48px,7vw,96px) clamp(24px,5vw,80px) clamp(48px,7vw,96px) max(24px,calc((100vw - 1240px)/2))}
.hr-name{font-weight:500;letter-spacing:-.035em;line-height:.92;margin:22px 0 26px}
.hr-tag{font-family:var(--hf);font-style:italic;font-size:clamp(1.35rem,2.3vw,1.9rem);line-height:1.25;max-width:520px;margin:0 0 18px}
.hr-sub{color:var(--mu);max-width:470px;margin-bottom:34px}
.hr-facts{display:flex;flex-wrap:wrap;gap:28px 48px;margin:48px 0 0;padding-top:24px;border-top:1px solid var(--line)}
.hr-facts dt{font:600 .7rem/1 var(--bf);letter-spacing:.2em;text-transform:uppercase;color:var(--mu);margin-bottom:8px}
.hr-facts dd{margin:0;font-weight:600}
.hr-art{position:relative;margin:0;min-height:520px}
.hr-art .frame,.hr-art .artwrap{position:absolute;inset:24px 24px 24px 0}
.hr-art .frame.arch{border-radius:999px 999px 0 0}
.hr-art .badge{left:-60px;bottom:64px;color:var(--tx);background:var(--bg);border-radius:50%}
@media(max-width:900px){.hr-grid{grid-template-columns:1fr}.hr-text{padding:48px 24px 32px}.hr-art{min-height:auto;aspect-ratio:4/4.6;margin:0 24px 24px}.hr-art .frame,.hr-art .artwrap{inset:0}.hr-art .badge{left:auto;right:-8px;bottom:-30px;width:120px;height:120px}}
/* capa (variação) */
.hrc{position:relative;padding-bottom:clamp(40px,6vw,80px)}
.hrc-media{height:min(68vh,640px);position:relative;overflow:hidden}
.hrc-media .frame,.hrc-media .artwrap{position:absolute;inset:0}
.hrc-card{position:relative;margin-top:calc(-1 * clamp(120px,16vw,200px));background:var(--bg);max-width:760px;padding:clamp(28px,4vw,52px);box-shadow:0 30px 70px -40px rgba(0,0,0,.45)}
.hrc-card .hr-name{font-size:clamp(3rem,7.5vw,6.4rem);margin:14px 0 18px}
.hrc-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px;margin-top:26px;padding-top:22px;border-top:1px solid var(--line)}
.hrc-facts{display:flex;flex-wrap:wrap;gap:10px;font-weight:600;font-size:.95rem}.hrc-facts i{color:var(--mu);font-style:normal}
/* manifesto */
.stm{padding:var(--pad) 0;border-top:1px solid var(--line)}
.stm-grid{display:grid;grid-template-columns:220px 1fr;gap:32px}
.stm blockquote{margin:0;font-family:var(--hf);font-size:clamp(1.9rem,4.2vw,3.5rem);line-height:1.12;font-weight:400;letter-spacing:-.02em}
.stm blockquote::first-letter{color:var(--p)}
.stm figure{margin:48px 0 0;max-width:520px;aspect-ratio:4/3}
@media(max-width:800px){.stm-grid{grid-template-columns:1fr}}
/* cardápio editorial */
.rmenu{display:grid;grid-template-columns:repeat(2,1fr);gap:56px 88px}
.rmenu h3{font-size:1.9rem;font-weight:500;font-style:italic;margin-bottom:18px;display:flex;align-items:baseline;gap:14px}
.rmenu h3 small{font:600 .72rem/1 var(--bf);letter-spacing:.2em;font-style:normal;color:var(--mu)}
.ritem{padding:16px 0;border-bottom:1px solid var(--line)}
.ritem-top{display:flex;align-items:baseline;gap:12px}.ritem-top b{font-weight:600;font-size:1.06rem}
.ritem-top i{flex:1;border-bottom:1px dotted ${rgba(t.text, 0.35)};transform:translateY(-4px)}
.ritem p{margin:4px 0 0;color:var(--mu);font-size:.94rem;font-style:italic}
@media(max-width:800px){.rmenu{grid-template-columns:1fr;gap:40px}}
/* destaques */
.rhl{display:grid;grid-template-columns:repeat(var(--cols,3),1fr);border-top:1px solid var(--line);clip-path:inset(0 1px 0 0)}
.rhl div{padding:28px 24px;display:flex;gap:14px;align-items:flex-start;border-bottom:1px solid var(--line);border-right:1px solid var(--line)}
@media(max-width:900px){.rhl{grid-template-columns:1fr 1fr}}@media(max-width:560px){.rhl{grid-template-columns:1fr}.rhl div{border-right:0}}.rhl .i{color:var(--p);width:24px;height:24px;margin-top:2px}
.rhl b{display:block;font-family:var(--hf);font-size:1.35rem;font-weight:500;line-height:1.2}.rhl p{margin:6px 0 0;color:var(--mu);font-size:.92rem}
/* galeria */
.rgal{display:grid;grid-template-columns:repeat(12,1fr);gap:16px}
.rgal .frame:nth-child(4n+1){grid-column:span 7;aspect-ratio:4/3}.rgal .frame:nth-child(4n+2){grid-column:span 5;aspect-ratio:4/5}
.rgal .frame:nth-child(4n+3){grid-column:span 5;aspect-ratio:4/5}.rgal .frame:nth-child(4n){grid-column:span 7;aspect-ratio:4/3}
@media(max-width:700px){.rgal .frame{grid-column:span 12!important;aspect-ratio:4/3!important}}
/* cta */
.rcta{padding:var(--pad) 0;text-align:center;border-top:1px solid var(--line)}
.rcta h2{max-width:900px;margin:0 auto 34px;font-style:italic}
/* sobre */
.rabout{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,6vw,96px);align-items:center}
@media(max-width:800px){.rabout{grid-template-columns:1fr}}
/* rodapé */
.c-refined footer{background:var(--ink);color:${mix(t.background, '#FFFFFF', 0.3)}}
.c-refined .foot-word{font-size:clamp(3rem,11vw,10rem);font-weight:500;font-style:italic}
`;
}

function boldCss(t: Theme): string {
  const onP = readableOn(t.primary);
  const ink = t.dark ? t.background : t.secondary;
  const onInk = readableOn(ink);
  return `
.c-bold{--ink2:${ink};--onink:${onInk}}
.c-bold .top{background:var(--p);color:var(--onp)}
.c-bold .brand b{font-size:1.25rem;text-transform:uppercase;letter-spacing:.02em}
.c-bold .nav a{text-transform:uppercase;font-weight:700;font-size:.85rem;letter-spacing:.08em}
.c-bold .top .btn{background:var(--ink2);color:var(--onink);border-color:var(--ink2)}
.c-bold .btn{border-radius:0;text-transform:uppercase;letter-spacing:.06em;font-weight:700}
.c-bold h2{font-size:clamp(3rem,8vw,7rem);text-transform:uppercase;letter-spacing:-.01em;line-height:.9;font-weight:400}
.c-bold .sec{padding:var(--pad) 0}
.c-bold .shead{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:clamp(40px,6vw,72px);flex-wrap:wrap}
.c-bold .shead p{max-width:420px;margin:0;opacity:.8}
.c-bold .outline{color:transparent;-webkit-text-stroke:2px var(--onp)}
/* hero */
.hb{background:var(--p);color:var(--onp);padding:clamp(32px,5vw,64px) 0 0;position:relative;z-index:2}
.hb-meta{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font:700 .8rem/1.3 var(--bf);letter-spacing:.16em;text-transform:uppercase;padding-bottom:22px;border-bottom:1.5px solid ${rgba(onP, 0.35)}}
.hb-name{text-transform:uppercase;line-height:.93;letter-spacing:-.01em;font-weight:400;margin:clamp(24px,4vw,44px) 0 clamp(24px,4vw,40px)}
.hb-name span{display:block;white-space:nowrap}
.hb-row{display:grid;grid-template-columns:1fr auto;gap:32px;align-items:end;padding-bottom:clamp(40px,6vw,72px)}
.hb-tag{font-size:clamp(1.25rem,2.2vw,1.8rem);line-height:1.25;max-width:620px;margin:0;font-weight:500}
.hb .btn{background:var(--ink2);color:var(--onink);border-color:var(--ink2)}.hb .btn.ghost{background:transparent;color:var(--onp);border-color:var(--onp)}
.hb .badge{left:50%;margin-left:-75px;bottom:-72px;color:var(--onink);background:var(--ink2);border-radius:50%;box-shadow:0 18px 40px -16px rgba(0,0,0,.5)}
.hb .hb-row{padding-right:0}
.hb-visual{position:relative;height:clamp(260px,38vw,520px);margin-top:-10px}
.hb-visual .frame,.hb-visual .artwrap{position:absolute;inset:0}
@media(max-width:900px){.hb-row{grid-template-columns:1fr}.hb .badge{width:110px;height:110px;bottom:-55px;left:auto;right:16px;margin-left:0}}
/* bloco dividido (variação) */
.hbs{background:var(--p);color:var(--onp);padding:clamp(36px,5vw,64px) 0;position:relative;z-index:2}
.hbs-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:clamp(28px,4vw,56px);align-items:stretch}
.hbs .hb-name span{display:block;white-space:nowrap}
.hbs .btn{background:var(--ink2);color:var(--onink);border-color:var(--ink2)}.hbs .btn.ghost{background:transparent;color:var(--onp);border-color:var(--onp)}
.hbs-visual{position:relative;min-height:420px;border:2px solid ${rgba(readableOn(t.primary), 0.9)}}
.hbs-visual .frame,.hbs-visual .artwrap{position:absolute;inset:14px}
.hbs-visual .badge{left:-48px;bottom:36px;color:var(--onink);background:var(--ink2);border-radius:50%}
@media(max-width:900px){.hbs-grid{grid-template-columns:1fr}.hbs-visual{min-height:300px}.hbs-visual .badge{left:auto;right:12px;bottom:-40px;width:110px;height:110px}}
/* letreiro */
.c-bold .marq{background:var(--a);color:var(--ona);border:0;padding:26px 0}
.c-bold .marq span{font-size:clamp(1.8rem,4vw,3.4rem)}
/* itens grandes numerados */
.c-bold .content{background:var(--ink2);color:var(--onink)}
.c-bold .content .shead p{color:${rgba(onInk, 0.75)}}
.bcat{margin-bottom:64px}.bcat:last-child{margin-bottom:0}
.bcat h3{font-size:clamp(2rem,5vw,4rem);text-transform:uppercase;font-weight:400;margin-bottom:12px;color:transparent;-webkit-text-stroke:1.2px ${onInk}}
.bitem{display:grid;grid-template-columns:80px 1fr auto;gap:24px;align-items:baseline;padding:26px 0;border-top:1.5px solid ${rgba(onInk, 0.2)};transition:background .3s,padding .3s}
.bitem:hover{background:${rgba(t.primary, 0.12)};padding-left:14px;padding-right:14px}
.bitem .n{font-family:var(--hf);font-size:1.4rem;color:var(--p)}
.bitem b{font-family:var(--hf);font-size:clamp(1.6rem,3vw,2.6rem);text-transform:uppercase;font-weight:400;line-height:1}
.bitem p{margin:8px 0 0;opacity:.72;font-size:.95rem}
.bitem .price{font-family:var(--hf);font-size:clamp(1.5rem,2.6vw,2.2rem);font-weight:400;color:var(--p)}
.bitem .price small{display:block;font:600 .8rem/1.4 var(--bf);color:${rgba(onInk, 0.6)};text-align:right}
@media(max-width:700px){.bitem{grid-template-columns:1fr auto}.bitem .n{display:none}}
/* destaques */
.bhl{display:flex;flex-wrap:wrap;gap:14px}
.bhl span{display:inline-flex;align-items:center;gap:12px;padding:18px 26px;background:var(--p);color:var(--onp);font:700 1rem/1 var(--bf);text-transform:uppercase;letter-spacing:.06em}
.bhl span:nth-child(3n+2){background:var(--a);color:var(--ona);transform:rotate(-1.5deg)}.bhl span:nth-child(3n){background:var(--ink2);color:var(--onink);transform:rotate(1deg)}
/* galeria em faixa */
.bgal{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
.bgal .frame{flex:0 0 min(78vw,520px);aspect-ratio:4/5;scroll-snap-align:start}
/* cta */
.bcta{background:var(--a);color:var(--ona);padding:var(--pad) 0;overflow:hidden}
.bcta h2{font-size:clamp(3.2rem,10vw,9rem);margin-bottom:36px}
.bcta .btn{background:var(--ink2);color:var(--onink);border-color:var(--ink2)}
.c-bold .visit .vaddr{text-transform:uppercase}
.c-bold footer{background:var(--p);color:var(--onp)}
.c-bold .foot-word{font-size:clamp(4rem,15vw,14rem);text-transform:uppercase;font-weight:400}
.c-bold .bstm{padding:var(--pad) 0}.c-bold .bstm p{font-family:var(--hf);text-transform:uppercase;font-size:clamp(2rem,5.5vw,4.6rem);line-height:.98;margin:0}
.c-bold .bstm p em{font-style:normal;color:var(--p)}
`;
}

function invitingCss(t: Theme): string {
  return `
.c-inviting .top{padding-top:14px;background:transparent}
.c-inviting .top .wrap{background:${rgba(t.surface, 0.9)};backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid var(--line);border-radius:999px;padding:0 10px 0 22px;height:66px;box-shadow:0 10px 30px -18px rgba(0,0,0,.25)}
.c-inviting .btn{border-radius:999px}
.c-inviting .brand b{font-size:1.25rem}
.c-inviting h2{font-size:clamp(2.1rem,4.4vw,3.4rem);letter-spacing:-.025em}
.c-inviting .sec{padding:clamp(64px,8vw,112px) 0}
.c-inviting .shead{text-align:center;max-width:720px;margin:0 auto clamp(36px,5vw,56px)}
.c-inviting .shead .pill{margin-bottom:16px}
.c-inviting .shead p{color:var(--mu);margin:14px auto 0;max-width:560px}
.pill{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:999px;background:var(--soft);color:var(--p);font-weight:700;font-size:.85rem}
.pill .i{width:16px;height:16px}
.tint{background:${mix(t.background, t.primary, 0.05)}}
/* hero */
.hi{padding:clamp(40px,6vw,72px) 0 clamp(56px,7vw,96px);overflow:hidden}
.hi-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(32px,5vw,72px);align-items:center}
.hi h1{font-size:clamp(2.7rem,6vw,5.2rem);letter-spacing:-.035em;line-height:.98;margin:20px 0 22px}
.hi h1 em{font-style:italic;color:var(--p)}
.hi .lead{font-size:1.15rem;color:var(--mu);max-width:520px;margin-bottom:30px}
.hi .btn{min-height:58px;padding:0 30px;font-size:1.05rem}
.hi-meta{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:30px;color:var(--mu);font-size:.95rem}
.hi-meta span{display:inline-flex;align-items:center;gap:8px}.hi-meta .i{color:var(--p);width:18px;height:18px}
.hi-visual{position:relative;min-height:520px}
.hi-blob{position:absolute;inset:6% 0 0 8%;border-radius:42% 58% 55% 45%/50% 42% 58% 50%;overflow:hidden;box-shadow:0 40px 80px -40px ${rgba(t.primary, 0.6)}}
.hi-blob .frame,.hi-blob .artwrap{position:absolute;inset:0}
.hi-cards{position:absolute;left:0;bottom:4%;display:grid;gap:12px;width:min(380px,88%)}
.hi-card{display:flex;align-items:center;gap:14px;background:var(--sf);border-radius:18px;padding:14px 18px;box-shadow:0 20px 40px -20px rgba(0,0,0,.35);border:1px solid var(--line)}
.hi-card .ic{width:44px;height:44px;border-radius:14px;background:var(--soft);color:var(--p);display:grid;place-items:center;flex:none}
.hi-card>div{min-width:0}.hi-card b{display:block;font-size:.98rem;line-height:1.25}.hi-card small{color:var(--mu);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hi-card .price{margin-left:auto;color:var(--p)}
.hi-card:nth-child(2){margin-left:36px}.hi-card:nth-child(3){margin-left:72px}
@media(max-width:900px){.hi-grid{grid-template-columns:1fr}.hi-visual{min-height:440px}}
@media(max-width:600px){.hi-visual{min-height:400px}.hi-blob{inset:0 0 30% 6%}.hi-cards{left:0;right:0;width:auto;bottom:0}.hi-card:nth-child(2),.hi-card:nth-child(3){margin-left:0}.hi-card{padding:12px 14px}}
/* centralizado (variação) */
.hic{position:relative;overflow:hidden;padding:clamp(56px,8vw,110px) 0 clamp(48px,6vw,80px);text-align:center}
.hic-bg{position:absolute;inset:0;opacity:.14;pointer-events:none}.hic-bg .frame,.hic-bg .artwrap{position:absolute;inset:0}
.hic-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 0%,var(--bg) 92%)}
.hic-in{position:relative}
.hic h1{font-size:clamp(2.8rem,6.6vw,5.6rem);letter-spacing:-.035em;line-height:.98;margin:22px auto 20px;max-width:960px}
.hic .lead{font-size:1.15rem;color:var(--mu);max-width:620px;margin:0 auto 30px}
.hic .btn{min-height:58px;padding:0 30px}
.hic-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:44px auto 0;max-width:1000px;text-align:left}
.hic-cards .hi-card{margin:0!important}
@media(max-width:800px){.hic-cards{grid-template-columns:1fr}}
/* itens em cartões */
.cats{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:32px}
.cats a{padding:10px 18px;border-radius:999px;border:1px solid var(--line);background:var(--sf);text-decoration:none;font-weight:600;font-size:.92rem}
.cats a:hover{border-color:var(--p);color:var(--p)}
.icat{margin-bottom:48px}.icat:last-child{margin-bottom:0}.icat h3{font-size:1.6rem;margin-bottom:18px}
.icards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.icard{background:var(--sf);border:1px solid var(--line);border-radius:22px;padding:22px;display:flex;flex-direction:column;gap:8px;transition:transform .3s var(--ease),box-shadow .3s}
.icard:hover{transform:translateY(-4px);box-shadow:0 24px 40px -24px rgba(0,0,0,.3)}
.icard .img{aspect-ratio:4/3;border-radius:14px;overflow:hidden;margin:-8px -8px 8px}.icard .img img{width:100%;height:100%;object-fit:cover}
.icard b{font-size:1.1rem}.icard p{margin:0;color:var(--mu);font-size:.93rem}
.icard .foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:12px}
.icard .price{background:var(--soft);color:var(--p);padding:7px 12px;border-radius:999px;font-size:.95rem}
.icard .chip{font-size:.82rem;color:var(--mu);display:inline-flex;gap:6px;align-items:center}.icard .chip .i{width:15px;height:15px}
.icard .ask{font-weight:700;color:var(--p);text-decoration:none;font-size:.9rem;display:inline-flex;gap:6px;align-items:center}.icard .ask .i{width:16px;height:16px}
/* destaques */
.ihl{display:grid;grid-template-columns:repeat(var(--cols,3),1fr);gap:16px}@media(max-width:900px){.ihl{grid-template-columns:1fr 1fr}}@media(max-width:560px){.ihl{grid-template-columns:1fr}}
.ihl div{background:var(--sf);border:1px solid var(--line);border-radius:22px;padding:26px}
.ihl .ic{width:52px;height:52px;border-radius:16px;background:var(--soft);color:var(--p);display:grid;place-items:center;margin-bottom:16px}
.ihl b{font-size:1.12rem;display:block}.ihl p{margin:6px 0 0;color:var(--mu);font-size:.93rem}
/* sobre */
.iabout{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,6vw,80px);align-items:center}
.iabout .frame,.iabout .artwrap{border-radius:28px;overflow:hidden;aspect-ratio:5/4;position:relative}
.iabout .txt{font-size:1.1rem;color:var(--mu)}
@media(max-width:800px){.iabout{grid-template-columns:1fr}}
/* galeria */
.igal{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}.igal .frame{border-radius:22px;aspect-ratio:1}
/* cta */
.icta{padding:clamp(48px,7vw,96px) 0}
.icta-box{border-radius:36px;padding:clamp(40px,6vw,80px);background:linear-gradient(135deg,var(--p),${mix(t.primary, t.accent, 0.6)});color:var(--onp);display:grid;grid-template-columns:1fr auto;gap:32px;align-items:center;position:relative;overflow:hidden}
.icta-box::after{content:'';position:absolute;width:420px;height:420px;border-radius:50%;right:-120px;top:-160px;background:${rgba('#FFFFFF', 0.12)}}
.icta-box h2{color:inherit;max-width:640px}.icta-box p{margin:12px 0 0;opacity:.9}
.icta-box .btn{background:var(--sf);color:var(--tx);border-color:var(--sf)}
@media(max-width:800px){.icta-box{grid-template-columns:1fr}}
.c-inviting .visit .map{border-radius:24px}
.c-inviting footer{background:${mix(t.secondary, t.primary, 0.12)};color:${mix(t.background, '#FFFFFF', 0.4)}}
.c-inviting .foot-word{font-size:clamp(2.6rem,7vw,5.5rem)}
`;
}

const EDITOR_CSS = `
[data-sid]{outline:2px solid transparent;outline-offset:-2px;transition:outline-color .15s;cursor:pointer}
[data-sid]:hover{outline-color:rgba(79,70,229,.45)}
[data-sid][data-selected]{outline:3px solid #4F46E5}
.pending{margin:24px auto 0;max-width:760px;border:2px dashed #F59E0B;background:rgba(245,158,11,.1);color:#92400E;border-radius:12px;padding:16px 20px;font:500 14px/1.5 system-ui,sans-serif;text-align:left}
.pending b{display:block;margin-bottom:4px}
.empty-sec{opacity:.8;padding:64px 0}
.js .rv{opacity:1!important;transform:none!important;transition:none!important}
`;

const RUNTIME_JS = `
(function(){var d=document.documentElement;d.classList.add('js');
var els=[].slice.call(document.querySelectorAll('.rv'));var vh=window.innerHeight||800;els=els.filter(function(el){if(el.getBoundingClientRect().top<vh){el.classList.add('in');return false}return true});
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}})},{rootMargin:'0px 0px -8% 0px'});els.forEach(function(el){io.observe(el)});}else{els.forEach(function(el){el.classList.add('in')})}
var map=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];var today=new Date().getDay();
[].slice.call(document.querySelectorAll('.hrow')).forEach(function(r){var t=(r.getAttribute('data-days')||'').toLowerCase();var ok=false;
if(t.indexOf('todos')>=0)ok=true;else{t.split(',').forEach(function(p){var m=p.trim().split(' a ');var a=map.findIndex(function(x){return m[0].indexOf(x)===0});
if(m.length>1){var b=map.findIndex(function(x){return m[1].indexOf(x)===0});if(a>=0&&b>=0){var i=a;while(true){if(i===today)ok=true;if(i===b)break;i=(i+1)%7;}}}else if(a===today)ok=true;});}
if(ok)r.classList.add('today');});
document.querySelectorAll('.mnav .sheet a').forEach(function(a){a.addEventListener('click',function(){a.closest('details').removeAttribute('open')})});
})();`;

const EDITOR_JS = `
document.addEventListener('click',function(e){var el=e.target.closest('[data-sid]');if(!el)return;e.preventDefault();parent.postMessage({type:'select-section',id:el.getAttribute('data-sid')},'*');});
window.addEventListener('message',function(e){if(e.data&&e.data.type==='scroll-to'){var el=document.querySelector('[data-sid="'+e.data.id+'"]');if(el){el.scrollIntoView({behavior:'smooth',block:'start'});}}});
`;

/* ======================================================================= */
/* blocos comuns                                                            */
/* ======================================================================= */

function pendingBox(ctx: Ctx, s: Section): string {
  if (!ctx.editor || !s.pending?.length) return '';
  return `<div class="wrap"><div class="pending"><b>Informação pendente — não será exibida ao cliente até ser preenchida</b>${s.pending.map(esc).join(' · ')}</div></div>`;
}

function emptySection(ctx: Ctx, s: Section, title: string, anchor?: string): string {
  const msg = s.pending?.length ? s.pending : ['Sem conteúdo — preencha no painel ou oculte a seção.'];
  return `<section${anchor ? ` id="${anchor}"` : ''} class="empty-sec"><div class="wrap" style="text-align:center"><h2 style="font-size:2rem">${esc(title)}</h2><div class="pending"><b>Seção sem conteúdo verificado — oculta na versão para o cliente</b>${msg
    .map(esc)
    .join(' · ')}</div></div></section>`;
}

function shead(ctx: Ctx, title: string, intro: string | undefined, n: number, iconName?: string) {
  if (ctx.concept === 'refined') {
    return `<div class="shead rv"><div class="num">${String(n).padStart(2, '0')} — ${esc(ctx.segLabel)}</div><div><h2>${esc(title)}</h2>${intro ? `<p>${nl2br(intro)}</p>` : ''}</div></div>`;
  }
  if (ctx.concept === 'bold') {
    return `<div class="shead rv"><h2>${esc(title)}</h2>${intro ? `<p>${nl2br(intro)}</p>` : ''}</div>`;
  }
  return `<div class="shead rv"><span class="pill">${icon(iconName ?? ctx.segIcon)}${esc(ctx.segLabel)}</span><h2>${esc(title)}</h2>${intro ? `<p>${nl2br(intro)}</p>` : ''}</div>`;
}

/** Imagem (autorizada) ou arte generativa. */
function visual(ctx: Ctx, imgUrl: string | null, shape: 'arch' | 'rect' | 'circle', cls = '', variant = ''): string {
  if (imgUrl) return `<div class="frame ${shape === 'arch' ? 'arch' : ''} ${cls}"><img src="${esc(imgUrl)}" alt="${esc(displayName(ctx.spec.businessName))}" loading="lazy"></div>`;
  const cap = [ctx.segLabel, ctx.place].filter(Boolean).join(' · ');
  return `<div class="artwrap ${cls}">${artwork(ctx, shape, cap, variant)}</div>`;
}

function heroButtons(p: Record<string, any>, ghostStyle = true) {
  return `<div class="btns">${p.ctaLabel ? `<a class="btn" href="${safeHref(p.ctaHref)}"${target(p.ctaHref)}>${esc(p.ctaLabel)} ${icon('arrow')}</a>` : ''}${
    p.secondaryLabel ? `<a class="btn ghost" href="${safeHref(p.secondaryHref)}"${target(p.secondaryHref)}>${esc(p.secondaryLabel)}</a>` : ''
  }</div>`.replace('class="btn ghost"', ghostStyle ? 'class="btn ghost"' : 'class="link"');
}

/** Tamanho do nome gigante (conceito impactante) para caber na largura. */
function fitName(name: string, font: string): { lines: string[]; size: string } {
  const words = name.toUpperCase().split(/\s+/);
  let lines = [words.join(' ')];
  if (name.length > 13 && words.length > 1) {
    let best = 1;
    let diff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ').length;
      const b = words.slice(i).join(' ').length;
      if (Math.abs(a - b) < diff) ((diff = Math.abs(a - b)), (best = i));
    }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  const longest = Math.max(...lines.map((l) => l.length));
  const k = (CONDENSED.has(font) ? 0.47 : font === 'Syne' ? 0.74 : 0.62) * longest;
  return { lines, size: `min(${(1240 / k).toFixed(1)}px, calc((100vw - 48px) / ${k.toFixed(2)}), 15rem)` };
}

/* ======================================================================= */
/* seções                                                                   */
/* ======================================================================= */

function hero(ctx: Ctx, s: Section): string {
  const p = s.props;
  const name = displayName(ctx.spec.businessName);
  const img = ctx.img(p.image) ?? ctx.photos[0] ?? null;
  const hours = shortHours(ctx.spec);
  const addr = shortAddress(ctx.spec);
  const kicker = p.eyebrow || [ctx.segLabel, ctx.place].filter(Boolean).join(' · ');
  const alt = (s.variant ?? 0) % 2 === 1;

  if (alt) {
    if (ctx.concept === 'refined') {
      // Capa: arte/foto em largura total com o nome num cartão sobreposto
      const facts = [hours ? `<span>${esc(hours)}</span>` : '', addr ? `<span>${esc(addr)}</span>` : ''].filter(Boolean).join('<i>·</i>');
      return `<section class="hrc"><div class="hrc-media rv">${visual(ctx, img, 'rect', '', 'cover')}</div><div class="wrap"><div class="hrc-card rv d1">
<p class="kicker">${esc(kicker)}</p><h1 class="hr-name">${esc(name)}</h1>${p.headline ? `<p class="hr-tag">${esc(p.headline)}</p>` : ''}
<div class="hrc-row">${heroButtons(p, false)}${facts ? `<div class="hrc-facts">${facts}</div>` : ''}</div></div></div></section>`;
    }
    if (ctx.concept === 'bold') {
      // Bloco dividido: nome empilhado palavra a palavra + bloco visual
      const words = name.toUpperCase().split(/\s+/);
      const longest = Math.max(...words.map((w) => w.length));
      const k = (CONDENSED.has(ctx.theme.headingFont) ? 0.47 : ctx.theme.headingFont === 'Syne' ? 0.74 : 0.62) * longest;
      const size = `min(${(700 / k).toFixed(1)}px, calc((100vw - 48px) / ${k.toFixed(2)}), 12rem)`;
      return `<section class="hbs"><div class="wrap hbs-grid"><div><div class="hb-meta rv">${[kicker, hours].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('')}</div>
<h1 class="hb-name rv d1" style="font-size:${size}">${words.map((w, i) => `<span class="${i % 2 ? 'outline' : ''}">${esc(w)}</span>`).join('')}</h1>
${p.headline ? `<p class="hb-tag rv d2">${esc(p.headline)}</p>` : ''}<div class="rv d3" style="margin-top:28px">${heroButtons(p)}</div></div>
<div class="hbs-visual rv d2">${visual(ctx, img, 'rect', '', 'split')}${badge(ctx, [ctx.segLabel, ctx.place].filter(Boolean).join(' · '))}</div></div></section>`;
    }
    // convidativo centralizado com produtos reais em linha
    const items = allItems(ctx.spec).slice(0, 3);
    const row = items.length
      ? `<div class="hic-cards">${items.map((i, n) => `<div class="hi-card rv d${n + 2}"><span class="ic">${icon(ctx.segIcon)}</span><div><b>${esc(i.name)}</b>${i.description ? `<small>${esc(i.description)}</small>` : i.extra ? `<small>${esc(i.extra)}</small>` : ''}</div>${i.price ? `<span class="price">${esc(i.price)}</span>` : ''}</div>`).join('')}</div>`
      : '';
    const meta = [hours ? `<span>${icon('clock')}${esc(hours)}</span>` : '', addr ? `<span>${icon('pin')}${esc(addr)}</span>` : ''].join('');
    return `<section class="hic"><div class="hic-bg">${visual(ctx, img, 'rect', '', 'center')}</div><div class="wrap hic-in">
<span class="pill rv">${icon(ctx.segIcon)}${esc(kicker)}</span><h1 class="rv d1">${esc(p.headline || name)}</h1>${p.subheadline ? `<p class="lead rv d2">${nl2br(p.subheadline)}</p>` : ''}
<div class="rv d3" style="display:flex;justify-content:center">${heroButtons(p)}</div>${meta ? `<div class="hi-meta rv d4" style="justify-content:center">${meta}</div>` : ''}${row}</div></section>`;
  }

  if (ctx.concept === 'refined') {
    const len = name.length;
    const size = len <= 10 ? 'clamp(4rem,10vw,8.6rem)' : len <= 18 ? 'clamp(3.4rem,8vw,7rem)' : 'clamp(2.8rem,6vw,5.4rem)';
    const facts = [hours ? `<div><dt>Horário</dt><dd>${esc(hours)}</dd></div>` : '', addr ? `<div><dt>Endereço</dt><dd>${esc(addr)}</dd></div>` : ''].join('');
    const shape = ['cafe', 'bakery', 'restaurant', 'beauty_salon'].includes(ctx.spec.segment) ? 'arch' : 'rect';
    return `<section class="hr"><div class="hr-grid"><div class="hr-text">
<p class="kicker rv">${esc(kicker)}</p>
<h1 class="hr-name rv d1" style="font-size:${size}">${esc(name)}</h1>
${p.headline ? `<p class="hr-tag rv d2">${esc(p.headline)}</p>` : ''}
${p.subheadline ? `<p class="hr-sub rv d2">${nl2br(p.subheadline)}</p>` : ''}
<div class="rv d3">${heroButtons(p, false)}</div>
${facts ? `<dl class="hr-facts rv d4">${facts}</dl>` : ''}
</div><figure class="hr-art rv d2">${visual(ctx, img, shape, shape === 'arch' ? 'arch' : '')}${badge(ctx, [ctx.segLabel, ctx.place].filter(Boolean).join(' · '))}</figure></div></section>`;
  }

  if (ctx.concept === 'bold') {
    const fit = fitName(name, ctx.theme.headingFont);
    const meta = [kicker, hours].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('');
    return `<section class="hb"><div class="wrap">
<div class="hb-meta rv">${meta}</div>
<h1 class="hb-name rv d1" style="font-size:${fit.size}">${fit.lines.map((l, i) => `<span class="${i ? 'l2 outline' : ''}">${esc(l)}</span>`).join(i0())}</h1>
<div class="hb-row rv d2">${p.headline ? `<p class="hb-tag">${esc(p.headline)}${p.subheadline ? `<br><span style="opacity:.8;font-size:.75em">${esc(p.subheadline)}</span>` : ''}</p>` : '<span></span>'}${heroButtons(p)}</div>
</div>${badge(ctx, [ctx.segLabel, ctx.place].filter(Boolean).join(' · '))}${img ? `<div class="hb-visual rv d3">${visual(ctx, img, 'rect')}</div>` : ''}</section>`;
  }

  // inviting
  const items = allItems(ctx.spec).slice(0, 3);
  const cards = items.length
    ? items
        .map(
          (i) =>
            `<div class="hi-card"><span class="ic">${icon(ctx.segIcon)}</span><div><b>${esc(i.name)}</b>${i.extra ? `<small>${esc(i.extra)}</small>` : i.description ? `<small>${esc(i.description.slice(0, 40))}</small>` : ''}</div>${i.price ? `<span class="price">${esc(i.price)}</span>` : ''}</div>`,
        )
        .join('')
    : [hours ? `<div class="hi-card"><span class="ic">${icon('clock')}</span><div><small>Horário</small><b>${esc(hours)}</b></div></div>` : '', addr ? `<div class="hi-card"><span class="ic">${icon('pin')}</span><div><small>Endereço</small><b>${esc(addr)}</b></div></div>` : ''].join('');
  const meta = [hours ? `<span>${icon('clock')}${esc(hours)}</span>` : '', addr ? `<span>${icon('pin')}${esc(addr)}</span>` : ''].join('');
  return `<section class="hi"><div class="wrap hi-grid"><div>
<span class="pill rv">${icon(ctx.segIcon)}${esc(kicker)}</span>
<h1 class="rv d1">${esc(p.headline || name)}</h1>
${p.subheadline ? `<p class="lead rv d2">${nl2br(p.subheadline)}</p>` : ''}
<div class="rv d3">${heroButtons(p)}</div>
${items.length && meta ? `<div class="hi-meta rv d4">${meta}</div>` : ''}
</div><div class="hi-visual rv d2"><div class="hi-blob">${visual(ctx, img, 'rect')}</div>${cards ? `<div class="hi-cards">${cards}</div>` : ''}</div></div></section>`;
}
const i0 = () => '';

function marquee(ctx: Ctx, s: Section): string | null {
  const items: string[] = ((s.props.items ?? []) as string[]).map((x) => String(x).trim()).filter(Boolean);
  if (!items.length) return ctx.editor ? emptySection(ctx, s, 'Letreiro') : null;
  const run = items.map((t) => `<span>${esc(t)}</span>`).join('');
  return `<section class="marq" aria-label="Destaques"><div class="marq-track">${run}${run}${run}${run}</div></section>`;
}

function statement(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  if (!p.text) return ctx.editor ? emptySection(ctx, s, 'Manifesto') : null;
  const img = ctx.img(p.image);
  if (ctx.concept === 'bold') {
    const words = String(p.text).split(' ');
    const k = Math.max(1, Math.floor(words.length / 3));
    const txt = `${esc(words.slice(0, k).join(' '))} <em>${esc(words.slice(k, k * 2).join(' '))}</em> ${esc(words.slice(k * 2).join(' '))}`;
    return `<section class="bstm" id="sobre"><div class="wrap"><p class="rv">${txt}</p></div>${pendingBox(ctx, s)}</section>`;
  }
  return `<section class="stm" id="sobre"><div class="wrap stm-grid"><div class="kicker rv">${esc(p.label || 'Sobre')}</div><div><blockquote class="rv d1">${nl2br(p.text)}</blockquote>${
    img ? `<figure class="frame rv d2"><img src="${esc(img)}" alt="" loading="lazy"></figure>` : ''
  }</div></div>${pendingBox(ctx, s)}</section>`;
}

function highlights(ctx: Ctx, s: Section): string | null {
  const items: { title: string; text?: string }[] = (s.props.items ?? []).filter((i: any) => i?.title);
  if (!items.length) return ctx.editor ? emptySection(ctx, s, s.props.title || 'Destaques') : null;
  if (ctx.concept === 'refined') {
    const cols = items.length <= 4 ? items.length : items.length % 3 === 0 || items.length === 5 ? 3 : 4;
    return `<section class="sec" style="padding-top:0"><div class="wrap"><div class="rhl rv" style="--cols:${cols}">${items
      .map((i) => `<div>${icon(highlightIcon(i.title))}<span><b>${esc(i.title)}</b>${i.text ? `<p>${esc(i.text)}</p>` : ''}</span></div>`)
      .join('')}</div></div></section>`;
  }
  if (ctx.concept === 'bold') {
    return `<section class="sec"><div class="wrap">${s.props.title ? `<div class="shead rv"><h2>${esc(s.props.title)}</h2></div>` : ''}<div class="bhl rv d1">${items
      .map((i) => `<span>${icon(highlightIcon(i.title))}${esc(i.title)}</span>`)
      .join('')}</div></div></section>`;
  }
  const cols = items.length <= 4 ? items.length : items.length % 3 === 0 || items.length === 5 ? 3 : 4;
  return `<section class="sec tint"><div class="wrap">${shead(ctx, s.props.title || 'Por que nos visitar', undefined, 0, 'star')}<div class="ihl" style="--cols:${cols}">${items
    .map((i, n) => `<div class="rv d${(n % 4) + 1}"><span class="ic">${icon(highlightIcon(i.title))}</span><b>${esc(i.title)}</b>${i.text ? `<p>${esc(i.text)}</p>` : ''}</div>`)
    .join('')}</div></div></section>`;
}

function about(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  if (!p.text) return ctx.editor ? emptySection(ctx, s, p.title || 'Sobre') : null;
  const img = ctx.img(p.image) ?? ctx.photos[1] ?? null;
  if (ctx.concept === 'inviting') {
    return `<section class="sec" id="sobre"><div class="wrap iabout"><div class="rv">${visual(ctx, img, 'rect', '', 'about')}</div><div class="rv d1"><span class="pill">${icon(ctx.segIcon)}${esc(ctx.segLabel)}</span><h2 style="margin:16px 0 18px">${esc(
      p.title,
    )}</h2><div class="txt">${nl2br(p.text)}</div></div></div>${pendingBox(ctx, s)}</section>`;
  }
  return `<section class="sec" id="sobre"><div class="wrap rabout"><div class="rv"><p class="kicker">${esc(ctx.segLabel)}</p><h2 style="margin:12px 0 22px">${esc(p.title)}</h2><div style="color:var(--mu);font-size:1.08rem">${nl2br(
    p.text,
  )}</div></div>${img ? `<div class="frame rv d1" style="aspect-ratio:4/5">${`<img src="${esc(img)}" alt="" loading="lazy">`}</div>` : ''}</div>${pendingBox(ctx, s)}</section>`;
}

const DOC_LABEL: Record<string, string> = { menu: 'Ver cardápio completo', services: 'Ver tabela de preços', products: 'Ver catálogo completo' };

function docButtons(ctx: Ctx, p: Record<string, any>, label: string): string {
  const file = p.menuFile ? ctx.img(p.menuFile) : null;
  const link = p.menuLink && /^https?:/i.test(p.menuLink) ? p.menuLink : null;
  if (!file && !link) return '';
  const btns = [
    file ? `<a class="btn" href="${esc(file)}" target="_blank" rel="noopener">${esc(label)}${link ? ' (arquivo)' : ''} ${icon('arrowUR')}</a>` : '',
    link ? `<a class="btn${file ? ' ghost' : ''}" href="${safeHref(link)}" target="_blank" rel="noopener">${esc(file ? `${label} (on-line)` : label)} ${icon('arrowUR')}</a>` : '',
  ].join('');
  return `<div class="btns rv" style="justify-content:center;margin-top:44px">${btns}</div>`;
}

function contentSection(ctx: Ctx, s: Section, n: number): string | null {
  const p = s.props;
  const anchor = s.type === 'menu' ? 'cardapio' : s.type === 'services' ? 'servicos' : 'produtos';
  const groups: ItemGroup[] =
    s.type === 'menu' ? ((p.groups ?? []) as ItemGroup[]).filter((g) => g && (g.items ?? []).some((i) => i?.name)) : [{ name: '', items: ((p.items ?? []) as Item[]).filter((i) => i?.name) }].filter((g) => g.items.length);
  const docs = docButtons(ctx, p, DOC_LABEL[s.type] ?? 'Ver mais');
  if (!groups.length && !docs) return ctx.editor ? emptySection(ctx, s, p.title || 'Itens', anchor) : null;
  const wa = waLink(ctx.spec.business.whatsapp);
  let body = '';
  if (ctx.concept === 'refined') {
    body = groups.length
      ? `<div class="rmenu">${groups
          .map(
            (g, gi) =>
              `<div class="rv d${(gi % 2) + 1}">${g.name ? `<h3>${esc(g.name)}<small>${String(gi + 1).padStart(2, '0')}</small></h3>` : ''}${g.items
                .filter((i) => i.name)
                .map((i) => `<div class="ritem"><div class="ritem-top"><b>${esc(i.name)}</b><i></i>${i.price ? `<span class="price">${esc(i.price)}</span>` : ''}</div>${i.description || i.extra ? `<p>${esc([i.description, i.extra].filter(Boolean).join(' · '))}</p>` : ''}</div>`)
                .join('')}</div>`,
          )
          .join('')}</div>`
      : '';
    return `<section class="sec" id="${anchor}"><div class="wrap">${shead(ctx, p.title, p.intro, n)}${body}${p.note && groups.length ? `<p class="note">${esc(p.note)}</p>` : ''}${docs}</div>${pendingBox(ctx, s)}</section>`;
  }
  if (ctx.concept === 'bold') {
    let k = 0;
    body = groups
      .map(
        (g) =>
          `<div class="bcat">${g.name ? `<h3 class="rv">${esc(g.name)}</h3>` : ''}${g.items
            .filter((i) => i.name)
            .map((i) => `<div class="bitem rv"><span class="n">${String(++k).padStart(2, '0')}</span><div><b>${esc(i.name)}</b>${i.description ? `<p>${esc(i.description)}</p>` : ''}</div><span class="price">${esc(i.price ?? '')}${i.extra ? `<small>${esc(i.extra)}</small>` : ''}</span></div>`)
            .join('')}</div>`,
      )
      .join('');
    return `<section class="sec content" id="${anchor}"><div class="wrap">${shead(ctx, p.title, p.intro, n)}${body}${p.note && groups.length ? `<p class="note" style="color:inherit;opacity:.6">${esc(p.note)}</p>` : ''}${docs}</div>${pendingBox(ctx, s)}</section>`;
  }
  const cats = groups.length > 1 ? `<nav class="cats rv">${groups.map((g, i) => `<a href="#cat-${i}">${esc(g.name || `Grupo ${i + 1}`)}</a>`).join('')}</nav>` : '';
  body = groups
    .map(
      (g, gi) =>
        `<div class="icat" id="cat-${gi}">${g.name ? `<h3 class="rv">${esc(g.name)}</h3>` : ''}<div class="icards">${g.items
          .filter((i) => i.name)
          .map((i, ii) => {
            const img = ctx.img(i.image);
            const ask = s.type !== 'menu' && wa ? `<a class="ask" href="${esc(waLink(ctx.spec.business.whatsapp, `Olá! Tenho interesse em: ${i.name}`)!)}" target="_blank" rel="noopener">${s.type === 'services' ? 'Agendar' : 'Consultar'} ${icon('arrow')}</a>` : '';
            return `<article class="icard rv d${(ii % 4) + 1}">${img ? `<div class="img"><img src="${esc(img)}" alt="${esc(i.name)}" loading="lazy"></div>` : ''}<b>${esc(i.name)}</b>${i.description ? `<p>${esc(i.description)}</p>` : ''}<div class="foot">${
              i.price ? `<span class="price">${esc(i.price)}</span>` : '<span></span>'
            }${i.extra ? `<span class="chip">${icon('clock')}${esc(i.extra)}</span>` : ask}</div></article>`;
          })
          .join('')}</div></div>`,
    )
    .join('');
  return `<section class="sec tint" id="${anchor}"><div class="wrap">${shead(ctx, p.title, p.intro, n)}${cats}${body}${p.note && groups.length ? `<p class="note" style="text-align:center">${esc(p.note)}</p>` : ''}${docs}</div>${pendingBox(ctx, s)}</section>`;
}

function gallery(ctx: Ctx, s: Section): string | null {
  const imgs = ((s.props.images ?? []) as string[]).map((id) => ctx.img(id)).filter(Boolean) as string[];
  if (!imgs.length) return ctx.editor ? emptySection(ctx, s, s.props.title || 'Galeria') : null;
  const frames = imgs.map((u, i) => `<figure class="frame rv d${(i % 3) + 1}" style="margin:0"><img src="${esc(u)}" alt="Foto de ${esc(displayName(ctx.spec.businessName))}" loading="lazy"></figure>`).join('');
  const cls = ctx.concept === 'refined' ? 'rgal' : ctx.concept === 'bold' ? 'bgal' : 'igal';
  const head = ctx.concept === 'bold' ? `<div class="shead rv"><h2>${esc(s.props.title || 'Galeria')}</h2></div>` : shead(ctx, s.props.title || 'Galeria', undefined, 0);
  return `<section class="sec" id="galeria"><div class="wrap">${head}<div class="${cls}">${frames}</div></div></section>`;
}

function ctaLike(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  if (!p.buttonHref || p.buttonHref === '#') return ctx.editor ? emptySection(ctx, s, p.title || 'Chamada') : null;
  const id = s.type === 'booking' ? ' id="agendar"' : '';
  const btn = `<a class="btn" href="${safeHref(p.buttonHref)}"${target(p.buttonHref)}>${esc(p.buttonLabel || 'Fale conosco')} ${icon('arrow')}</a>`;
  if (ctx.concept === 'refined') {
    return `<section class="rcta"${id}><div class="wrap"><p class="kicker rv">${esc(displayName(ctx.spec.businessName))}</p><h2 class="rv d1" style="margin-top:18px">${esc(p.title)}</h2>${
      p.text ? `<p class="rv d2" style="color:var(--mu);max-width:560px;margin:-14px auto 30px">${nl2br(p.text)}</p>` : ''
    }<div class="btns rv d2" style="justify-content:center">${btn}</div></div>${pendingBox(ctx, s)}</section>`;
  }
  if (ctx.concept === 'bold') {
    return `<section class="bcta"${id}><div class="wrap"><h2 class="rv">${esc(p.title)}</h2>${p.text ? `<p class="rv d1" style="max-width:560px;font-size:1.15rem">${nl2br(p.text)}</p>` : ''}<div class="btns rv d2">${btn}</div></div>${pendingBox(ctx, s)}</section>`;
  }
  return `<section class="icta"${id}><div class="wrap"><div class="icta-box rv"><div><h2>${esc(p.title)}</h2>${p.text ? `<p>${nl2br(p.text)}</p>` : ''}</div><div class="btns">${btn}</div></div></div>${pendingBox(ctx, s)}</section>`;
}

const SOCIAL: Record<string, [string, string]> = { instagram: ['Instagram', 'insta'], facebook: ['Facebook', 'fb'], tiktok: ['TikTok', 'star'], youtube: ['YouTube', 'star'], twitter: ['X', 'star'] };
function socialLinks(spec: SiteSpec) {
  return Object.entries(spec.business.socials ?? {}).filter(([k, v]) => v && k !== 'whatsapp' && /^https?:/.test(v));
}

function visit(ctx: Ctx, s: Section, n: number): string {
  const b = ctx.spec.business;
  const p = s.props;
  const rows: { days: string; hours: string }[] = ((p.rows ?? []) as any[]).filter((r) => r?.days);
  const dir = directionsUrl(ctx.spec);
  const wa = waLink(b.whatsapp);
  const contacts = [
    b.phone ? `<a href="${esc(telLink(b.phone) ?? '#')}">${icon('phone')}${esc(b.phone)}</a>` : '',
    wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat')}WhatsApp ${esc(b.whatsapp)}</a>` : '',
    b.email ? `<a href="mailto:${esc(b.email)}">${icon('chat')}${esc(b.email)}</a>` : '',
  ].join('');
  const socials = socialLinks(ctx.spec);
  const d = 0.004;
  const map =
    p.showMap !== false && b.lat != null && b.lon != null
      ? `<div class="map rv d2"><iframe title="Mapa" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${b.lon - d}%2C${b.lat - d}%2C${b.lon + d}%2C${b.lat + d}&layer=mapnik&marker=${b.lat}%2C${b.lon}"></iframe></div>`
      : '';
  const addrBlock = `<div class="vblock rv"><h3>Endereço</h3><div class="vaddr">${esc(b.address ?? 'Endereço a confirmar')}</div>${dir ? `<a class="link" href="${esc(dir)}" target="_blank" rel="noopener">Como chegar ${icon('arrowUR')}</a>` : ''}${
    contacts ? `<div class="vcontacts">${contacts}</div>` : ''
  }${socials.length ? `<div class="socials">${socials.map(([k, v]) => `<a href="${safeHref(v)}" target="_blank" rel="noopener">${icon(SOCIAL[k]?.[1] ?? 'star')}${esc(SOCIAL[k]?.[0] ?? k)}</a>`).join('')}</div>` : ''}</div>`;
  const hoursBlock = rows.length
    ? `<div class="vblock rv d1"><h3>Horários</h3>${rows.map((r) => `<div class="hrow${/fechado/i.test(r.hours) ? ' closed' : ''}" data-days="${esc(r.days)}"><span>${esc(r.days)}</span><span>${esc(r.hours)}</span></div>`).join('')}</div>`
    : '';
  const grid = [addrBlock, hoursBlock, map].filter(Boolean);
  const cols = grid.length === 3 ? '' : grid.length === 2 ? ' style="grid-template-columns:1fr 1.2fr"' : ' style="grid-template-columns:1fr"';
  const title = p.title || 'Visite-nos';
  const head = ctx.concept === 'bold' ? `<div class="shead rv"><h2>${esc(title)}</h2>${p.text ? `<p>${nl2br(p.text)}</p>` : ''}</div>` : shead(ctx, title, p.text, n, 'pin');
  return `<section class="sec visit" id="contato"><div class="wrap">${head}<div class="visit-grid"${cols}>${grid.join('')}</div></div>${pendingBox(ctx, s)}</section>`;
}

/** Compatibilidade: seções antigas "hours" e "contact" viram blocos de visita. */
function legacyHours(ctx: Ctx, s: Section, n: number): string | null {
  const rows = ((s.props.rows ?? []) as any[]).filter((r) => r?.days);
  if (!rows.length) return ctx.editor ? emptySection(ctx, s, 'Horários') : null;
  return `<section class="sec" id="horarios"><div class="wrap">${shead(ctx, s.props.title || 'Horários', undefined, n, 'clock')}<div style="max-width:620px">${rows
    .map((r) => `<div class="hrow" data-days="${esc(r.days)}"><span>${esc(r.days)}</span><span>${esc(r.hours)}</span></div>`)
    .join('')}</div></div></section>`;
}

function renderSection(ctx: Ctx, s: Section, n: number): string | null {
  switch (s.type) {
    case 'hero': return hero(ctx, s);
    case 'marquee': return marquee(ctx, s);
    case 'statement': return statement(ctx, s);
    case 'highlights': return highlights(ctx, s);
    case 'about': return about(ctx, s);
    case 'menu':
    case 'services':
    case 'products': return contentSection(ctx, s, n);
    case 'gallery': return gallery(ctx, s);
    case 'booking':
    case 'cta': return ctaLike(ctx, s);
    case 'visit':
    case 'contact': return visit(ctx, { ...s, props: { ...s.props, rows: s.props.rows ?? hoursRows(ctx.spec) } }, n);
    case 'hours': return ctx.spec.sections.some((x) => x.type === 'contact' && x.visible) ? null : legacyHours(ctx, s, n);
    default: return null;
  }
}

/* ======================================================================= */
/* documento                                                                */
/* ======================================================================= */

function jsonLd(spec: SiteSpec): string {
  const b = spec.business;
  const typeMap: Record<string, string> = {
    cafe: 'CafeOrCoffeeShop', restaurant: 'Restaurant', pizzeria: 'Restaurant', bakery: 'Bakery', bar: 'BarOrPub',
    ice_cream: 'IceCreamShop', barbershop: 'HairSalon', beauty_salon: 'BeautySalon', clothing: 'ClothingStore', pet_shop: 'PetStore',
  };
  const data: Record<string, unknown> = { '@context': 'https://schema.org', '@type': typeMap[spec.segment] ?? 'LocalBusiness', name: spec.businessName };
  if (b.phone) data.telephone = b.phone;
  if (b.address) data.address = b.address;
  if (b.lat != null && b.lon != null) data.geo = { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lon };
  if (b.openingHoursRaw) data.openingHours = b.openingHoursRaw;
  const same = Object.values(b.socials ?? {}).filter((v) => v && /^https?:/.test(v));
  if (same.length) data.sameAs = same;
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function footer(ctx: Ctx): string {
  const spec = ctx.spec;
  const b = spec.business;
  const name = displayName(spec.businessName);
  const rows = hoursRows(spec);
  const wa = waLink(b.whatsapp);
  const contact = [
    b.address ? `<li>${esc(b.address)}</li>` : '',
    b.phone ? `<li><a href="${esc(telLink(b.phone) ?? '#')}">${esc(b.phone)}</a></li>` : '',
    wa ? `<li><a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp ${esc(b.whatsapp)}</a></li>` : '',
    ...socialLinks(spec).map(([k, v]) => `<li><a href="${safeHref(v)}" target="_blank" rel="noopener">${esc(SOCIAL[k]?.[0] ?? k)}</a></li>`),
  ].join('');
  const nav = spec.nav.map((n) => `<li><a href="#${esc(n.target)}">${esc(n.label)}</a></li>`).join('');
  const year = new Date(spec.meta.generatedAt || Date.now()).getFullYear();
  const k = (CONDENSED.has(ctx.theme.headingFont) ? 0.47 : ctx.theme.headingFont === 'Syne' ? 0.74 : SERIF.has(ctx.theme.headingFont) ? 0.5 : 0.6) * name.length;
  const fs = `min(${(1240 / k).toFixed(1)}px, calc((100vw - 48px) / ${k.toFixed(2)}), ${ctx.concept === 'inviting' ? '5.5rem' : '14rem'})`;
  return `<footer><div class="wrap"><p class="foot-word" aria-hidden="true" style="font-size:${fs}">${esc(name)}</p><div class="foot-cols"><div><h4>Contato</h4><ul>${contact || '<li>—</li>'}</ul></div>${
    rows.length ? `<div><h4>Horários</h4><ul>${rows.map((r) => `<li>${esc(r.days)}: ${esc(r.hours)}</li>`).join('')}</ul></div>` : '<div></div>'
  }${nav ? `<div><h4>Navegação</h4><ul>${nav}</ul></div>` : '<div></div>'}</div><div class="foot-bot"><span>© ${year} ${esc(name)}</span><span>${esc(ctx.segLabel)}${ctx.place ? ` · ${esc(ctx.place)}` : ''}</span></div></div></footer>`;
}

function mobileBar(ctx: Ctx): string {
  const c = primaryContact(ctx.spec);
  const dir = directionsUrl(ctx.spec);
  const content = contentAnchor(ctx.spec);
  const links = [
    c ? `<a class="main" href="${esc(c.href)}"${target(c.href)}>${icon(c.icon)}${esc(c.short)}</a>` : '',
    content ? `<a href="#${content.id}">${icon(ctx.segIcon)}${content.id === 'cardapio' ? 'Cardápio' : content.id === 'servicos' ? 'Serviços' : 'Produtos'}</a>` : '',
    dir ? `<a href="${esc(dir)}" target="_blank" rel="noopener">${icon('route')}Como chegar</a>` : '',
  ].filter(Boolean);
  return links.length >= 2 ? `<nav class="mbar" aria-label="Ações rápidas">${links.join('')}</nav>` : '';
}

export function renderSite(spec: SiteSpec, opts: RenderOptions): string {
  const editor = opts.mode === 'editor';
  const theme = spec.theme;
  const concept = conceptOf(theme);
  const addr = spec.business.address ?? '';
  const parts = addr.split(',').map((x) => x.trim()).filter((x) => x && !/^\d/.test(x) && !/^\d{5}-?\d{3}$/.test(x));
  // bairro: informado pelo gerador (dado do endereço) ou deduzido do endereço formatado
  const place = spec.business.area ?? (parts.length >= 3 ? parts[parts.length - 2]?.replace(/\s*-\s*[A-Z]{2}$/, '') : undefined);
  const ctx: Ctx = {
    spec,
    theme,
    concept,
    opts,
    editor,
    img: (id) => (id ? opts.resolveAsset(id) : null),
    segIcon: SEGMENT_ICON[spec.segment] ?? 'star',
    segLabel: SEGMENT_LABEL[spec.segment] ?? 'Negócio local',
    place: place && !/^\d/.test(place) ? place : undefined,
    photos: [],
  };
  // fotos autorizadas disponíveis na galeria (usadas como apoio quando a seção não define imagem)
  const gal = spec.sections.find((x) => x.type === 'gallery');
  ctx.photos = ((gal?.props.images ?? []) as string[]).map((id) => ctx.img(id)).filter(Boolean) as string[];
  let n = 0;
  const sections = spec.sections
    .filter((s) => s.visible)
    .map((s) => {
      if (!['hero', 'marquee'].includes(s.type)) n++;
      const html = renderSection(ctx, s, n);
      if (!html) return null;
      return editor ? html.replace(/^<section/, `<section data-sid="${esc(s.id)}"${s.id === opts.selectedSectionId ? ' data-selected' : ''}`) : html;
    })
    .filter(Boolean)
    .join('\n');

  const logo = ctx.img(spec.logo);
  const name = displayName(spec.businessName);
  const contact = primaryContact(spec);
  const navLinks = spec.nav.map((x) => `<a href="#${esc(x.target)}">${esc(x.label)}</a>`).join('');
  const noindex = opts.demoNotice ? '<meta name="robots" content="noindex,nofollow">' : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(spec.seo.title)}</title>
<meta name="description" content="${esc(spec.seo.description)}">
${spec.seo.keywords ? `<meta name="keywords" content="${esc(spec.seo.keywords)}">` : ''}
${noindex}
<meta property="og:title" content="${esc(spec.seo.title)}">
<meta property="og:description" content="${esc(spec.seo.description)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="${esc(concept === 'bold' ? theme.primary : theme.background)}">
<link rel="preconnect" href="https://fonts.bunny.net">
<link rel="stylesheet" href="${fontsHref(theme)}">
<style>${baseCss(theme)}${concept === 'refined' ? refinedCss(theme) : concept === 'bold' ? boldCss(theme) : invitingCss(theme)}${editor ? EDITOR_CSS : ''}</style>
<script type="application/ld+json">${jsonLd(spec)}</script>
</head>
<body class="c-${concept}">
${opts.demoNotice ? `<div class="demo-note">${esc(opts.demoNotice)}</div>` : ''}
<header class="top"><div class="wrap"><a class="brand" href="#">${logo ? `<img src="${esc(logo)}" alt="${esc(name)}">` : ''}<b>${esc(name)}</b></a>
<nav class="nav" aria-label="Navegação principal">${navLinks}</nav>
${contact ? `<a class="btn desk" href="${esc(contact.href)}"${target(contact.href)}>${icon(contact.icon)}${esc(contact.label)}</a>` : ''}
${navLinks ? `<details class="mnav"><summary aria-label="Abrir menu">${icon('menu')}</summary><div class="sheet">${navLinks}${contact ? `<a href="${esc(contact.href)}"${target(contact.href)}>${esc(contact.label)}</a>` : ''}</div></details>` : ''}
</div></header>
<main>
${sections}
</main>
${footer(ctx)}
${mobileBar(ctx)}
<script>${RUNTIME_JS}</script>
${editor ? `<script>${EDITOR_JS}</script>` : ''}
</body>
</html>`;
}
