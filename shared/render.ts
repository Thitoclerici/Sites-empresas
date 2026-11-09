// Renderizador: SiteSpec -> HTML estático, responsivo e otimizado para SEO.
// Função pura, usada pelo servidor (exportação/link público) e pelo editor (prévia ao vivo).
//
// Princípio de design: mesmo com poucos dados, o site deve parecer profissional —
// usando ilustrações por segmento, tipografia forte e as informações REAIS disponíveis
// (endereço, horário, contato), nunca conteúdo inventado.

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
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function readableOn(bg: string): string {
  return luminance(bg) > 0.45 ? '#111111' : '#FFFFFF';
}

function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function initials(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s&]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^\p{Lu}/u.test(w));
  const pick = (words.length ? words : [name]).slice(0, 2).map((w) => w[0]!.toUpperCase());
  return pick.join('');
}

/* ---------- ícones (SVG próprios, traço 1.6) ---------- */

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
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  baby: '<circle cx="12" cy="9" r="5"/><path d="M10 9h.01M14 9h.01M10.5 11.5c.8.6 2.2.6 3 0"/><path d="M7 20c1.2-2.5 3-3.5 5-3.5s3.8 1 5 3.5"/>',
  insta: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r=".8"/>',
  fb: '<path d="M14 8.5h3V5h-3a4 4 0 0 0-4 4v2.5H7.5V15H10v6h3.5v-6H16l.5-3.5h-3V9.5a1 1 0 0 1 1-1z"/>',
};

function icon(name: string, cls = 'i'): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] ?? ICON.check}</svg>`;
}

const SEGMENT_ICON: Record<string, string> = {
  cafe: 'coffee', restaurant: 'utensils', pizzeria: 'pizza', bakery: 'bread', bar: 'glass', ice_cream: 'icecream',
  barbershop: 'pole', beauty_salon: 'sparkle', clothing: 'hanger', pet_shop: 'paw', retail: 'bag',
};
const SECONDARY_ICONS: Record<string, string[]> = {
  cafe: ['coffee', 'bread', 'leaf'], restaurant: ['utensils', 'glass', 'leaf'], pizzeria: ['pizza', 'utensils', 'glass'], bakery: ['bread', 'coffee', 'star'],
  bar: ['glass', 'star', 'utensils'], ice_cream: ['icecream', 'sun', 'star'], barbershop: ['scissors', 'pole', 'star'], beauty_salon: ['sparkle', 'scissors', 'star'],
  clothing: ['hanger', 'bag', 'star'], pet_shop: ['paw', 'leaf', 'star'], retail: ['bag', 'star', 'check'],
};

/** Ícone para destaques reais (comodidades do OSM ou diferenciais informados). */
function highlightIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('wi-fi') || t.includes('wifi')) return 'wifi';
  if (t.includes('ar livre') || t.includes('externa')) return 'sun';
  if (t.includes('acess')) return 'access';
  if (t.includes('delivery') || t.includes('entrega')) return 'truck';
  if (t.includes('viagem')) return 'takeaway';
  if (t.includes('vegan') || t.includes('vegetar') || t.includes('glúten') || t.includes('gluten')) return 'leaf';
  if (t.includes('reserva') || t.includes('agend')) return 'calendar';
  if (t.includes('pix') || t.includes('cart')) return 'card';
  if (t.includes('pet')) return 'paw';
  if (t.includes('climatiz')) return 'snow';
  if (t.includes('fraldário')) return 'baby';
  if (t.includes('culinária')) return 'utensils';
  return 'star';
}

/* ---------- tipografia ---------- */

const SERIF = new Set(['Fraunces', 'Playfair Display', 'DM Serif Display', 'Cormorant Garamond', 'Lora']);
const DISPLAY = new Set(['Oswald', 'Bebas Neue']);

function fontStack(f: string, heading: boolean) {
  if (SERIF.has(f)) return `'${f}','Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif`;
  if (DISPLAY.has(f)) return `'${f}','Arial Narrow','Helvetica Neue',Arial,sans-serif`;
  return `'${f}',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,${heading ? "'Helvetica Neue'," : ''}sans-serif`;
}

function fontsHref(t: Theme): string {
  const fams = Array.from(new Set([t.headingFont, t.bodyFont]))
    .map((f) => `${f.toLowerCase().replace(/\s+/g, '-')}:400,500,600,700`)
    .join('|');
  // Bunny Fonts: API compatível com Google Fonts, sem rastreamento (adequado à LGPD).
  return `https://fonts.bunny.net/css?family=${fams}&display=swap`;
}

/* ---------- CSS ---------- */

function patternSvg(seg: string, color: string): string {
  const icons = SECONDARY_ICONS[seg] ?? ['star'];
  const g = (name: string, x: number, y: number, r: number) =>
    `<g transform="translate(${x} ${y}) rotate(${r} 12 12)" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">${g(icons[0]!, 8, 10, -12)}${g(icons[1]!, 70, 30, 14)}${g(icons[2]!, 30, 76, 6)}${g(icons[0]!, 86, 86, -20)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function css(t: Theme, seg: string): string {
  const onP = readableOn(t.primary);
  const dark = luminance(t.background) < 0.2;
  const deep = mix(t.primary, '#000000', 0.35);
  const heroGrad = `linear-gradient(140deg,${t.primary} 0%,${mix(t.primary, t.accent, 0.55)} 100%)`;
  const lineCol = rgba(t.text, dark ? 0.16 : 0.1);
  const pill = t.radius >= 14 ? '999px' : `${Math.max(4, t.radius)}px`;
  const display = DISPLAY.has(t.headingFont);
  return `
:root{--p:${t.primary};--s:${t.secondary};--a:${t.accent};--bg:${t.background};--sf:${t.surface};--tx:${t.text};--mu:${t.muted};
--onp:${onP};--deep:${deep};--r:${t.radius}px;--pill:${pill};--hf:${fontStack(t.headingFont, true)};--bf:${fontStack(t.bodyFont, false)};
--line:${lineCol};--soft:${rgba(t.primary, dark ? 0.18 : 0.08)};--soft2:${rgba(t.accent, 0.14)};--shadow:0 1px 2px ${rgba(t.text, 0.06)},0 12px 32px -12px ${rgba(t.text, 0.18)}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--tx);font-family:var(--bf);font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%;display:block}a{color:inherit}
h1,h2,h3{font-family:var(--hf);line-height:1.08;margin:0 0 .45em;font-weight:${display ? 500 : 650};letter-spacing:${display ? '.01em' : '-.02em'}${display ? ';text-transform:uppercase' : ''}}
h1{font-size:clamp(2.6rem,6.4vw,5rem)}h2{font-size:clamp(1.9rem,3.8vw,2.9rem)}h3{font-size:1.18rem;letter-spacing:${display ? '.02em' : '-.01em'}}
p{margin:0 0 1em}.wrap{width:min(1160px,100% - 40px);margin:0 auto}
section{padding:clamp(64px,9vw,112px) 0;position:relative}
.i{width:22px;height:22px;flex:none}
.eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:var(--p);margin-bottom:16px}
.eyebrow::before{content:'';width:28px;height:2px;background:currentColor;border-radius:2px}
.lead{font-size:1.16rem;color:var(--mu);max-width:620px}
.btn{display:inline-flex;align-items:center;gap:10px;padding:15px 26px;border-radius:var(--pill);font-weight:650;text-decoration:none;border:2px solid var(--p);background:var(--p);color:var(--onp);transition:transform .18s,box-shadow .18s,background .18s;font-size:1rem;line-height:1}
.btn .i{width:18px;height:18px}
.btn:hover{transform:translateY(-2px);box-shadow:0 14px 28px -10px ${rgba(t.primary, 0.55)}}
.btn.ghost{background:transparent;color:var(--tx);border-color:var(--line)}.btn.ghost:hover{border-color:var(--p);box-shadow:none}
.btns{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.sec-head{max-width:720px;margin-bottom:48px}.sec-head.center{margin-left:auto;margin-right:auto;text-align:center}.sec-head.center .eyebrow::before{display:none}
.sec-icon{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--soft);color:var(--p);margin-bottom:18px}.sec-head.center .sec-icon{margin-left:auto;margin-right:auto}
@media (prefers-reduced-motion:no-preference){.rise{animation:rise .8s cubic-bezier(.2,.7,.2,1) both}.d1{animation-delay:.08s}.d2{animation-delay:.16s}.d3{animation-delay:.24s}.d4{animation-delay:.32s}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}}

/* topo */
.topbar{position:sticky;top:0;z-index:20;background:${rgba(t.background, 0.82)};backdrop-filter:saturate(1.6) blur(14px);-webkit-backdrop-filter:saturate(1.6) blur(14px);border-bottom:1px solid var(--line)}
.topbar .wrap{display:flex;align-items:center;justify-content:space-between;height:72px;gap:20px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;font-family:var(--hf);font-weight:700;font-size:1.22rem;letter-spacing:-.01em;min-width:0}
.brand span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brand img{height:44px;width:auto}.brand .mono{width:42px;height:42px;border-radius:12px;background:${heroGrad};color:var(--onp);display:grid;place-items:center;font-size:.95rem;flex:none}
.menu{display:flex;gap:28px;font-size:.95rem;font-weight:500}.menu a{text-decoration:none;color:var(--mu);transition:color .15s}.menu a:hover{color:var(--p)}
.topbar .btn{padding:11px 18px;font-size:.92rem}
@media(max-width:900px){.menu{display:none}.topbar .btn span{display:none}.topbar .btn{padding:11px}}

/* hero */
.hero{padding:clamp(48px,8vw,96px) 0 clamp(56px,8vw,96px);overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(60% 70% at 85% 10%,var(--soft2),transparent 70%);pointer-events:none}
.hero .wrap{position:relative}
.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(32px,6vw,72px);align-items:center}
.chip{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:var(--sf);border:1px solid var(--line);font-size:.85rem;font-weight:600;color:var(--tx);box-shadow:var(--shadow)}
.chip .i{width:16px;height:16px;color:var(--p)}
.hero .chip{margin-bottom:22px}
.art{position:relative;aspect-ratio:4/4.4;border-radius:calc(var(--r) * 1.8 + 8px);overflow:hidden;background:${heroGrad};box-shadow:0 40px 80px -30px ${rgba(t.text, 0.45)}}
.art img{width:100%;height:100%;object-fit:cover}
.art .pat{position:absolute;inset:0;background-image:${patternSvg(seg, onP === '#FFFFFF' ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.12)')};background-size:120px}
.art .glow{position:absolute;width:70%;aspect-ratio:1;border-radius:50%;left:15%;top:12%;background:radial-gradient(circle,${rgba(onP, 0.22)},transparent 65%)}
.art .big{position:absolute;inset:0;display:grid;place-items:center;color:var(--onp)}
.art .big .ring{width:46%;aspect-ratio:1;border-radius:50%;border:1.5px solid ${rgba(onP, 0.45)};display:grid;place-items:center;background:${rgba(onP, 0.08)};backdrop-filter:blur(2px)}
.art .big svg{width:52%;height:52%;stroke-width:1.1}
.art .big img.logo{width:62%;height:auto;object-fit:contain}
.art .tag{position:absolute;left:22px;right:22px;bottom:22px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;color:var(--onp)}
.art .tag b{font-family:var(--hf);font-size:clamp(1.3rem,2.6vw,1.9rem);line-height:1.05;max-width:70%}
.art .tag small{font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;opacity:.85;text-align:right}
.float{position:absolute;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:16px;background:var(--sf);color:var(--tx);box-shadow:var(--shadow);font-weight:600;font-size:.9rem}
.float .i{color:var(--p)}.float.f1{top:22px;right:22px}.float.f2{top:84px;right:40px}
.hero.centered{text-align:center}.hero.centered .lead{margin-left:auto;margin-right:auto}.hero.centered .btns{justify-content:center}
.hero.centered .emblem{width:132px;height:132px;margin:0 auto 26px;border-radius:50%;background:${heroGrad};color:var(--onp);display:grid;place-items:center;box-shadow:0 24px 50px -18px ${rgba(t.primary, 0.7)};overflow:hidden;position:relative}
.hero.centered .emblem svg{width:56px;height:56px;stroke-width:1.3}.hero.centered .emblem img{width:100%;height:100%;object-fit:cover}
.hero.centered .stripe{margin-top:56px;height:220px;border-radius:calc(var(--r) * 1.5 + 6px);background:${heroGrad};position:relative;overflow:hidden}
.hero.centered .stripe img{width:100%;height:100%;object-fit:cover}
.hero.banner{background:${heroGrad};color:var(--onp);padding:clamp(88px,13vw,170px) 0}
.hero.banner::before{background-image:${patternSvg(seg, onP === '#FFFFFF' ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.1)')};background-size:140px;opacity:1}
.hero.banner.has-img::before{display:none}
.hero.banner .lead,.hero.banner .eyebrow{color:var(--onp);opacity:.92}.hero.banner .btn{background:var(--onp);color:var(--p);border-color:var(--onp)}
.hero.banner .btn.ghost{background:transparent;color:var(--onp);border-color:${rgba(onP, 0.5)}}
.hero.banner .chip{background:${rgba(onP, 0.12)};color:var(--onp);border-color:${rgba(onP, 0.25)};box-shadow:none}.hero.banner .chip .i{color:var(--onp)}
.hero.banner.has-img{background-size:cover;background-position:center}
.hero.banner .bg-icon{position:absolute;right:-4%;top:50%;transform:translateY(-50%);width:min(46vw,560px);height:auto;opacity:.16;stroke-width:.8;color:var(--onp)}
.hero.editorial h1{font-size:clamp(3rem,8.5vw,6.6rem);padding-bottom:.25em;margin-bottom:.45em;border-bottom:1px solid var(--line)}
.hero.editorial .ed-grid{display:grid;grid-template-columns:1fr 1.1fr;gap:56px;align-items:center}
.hero.editorial .art{aspect-ratio:16/11}
@media(max-width:900px){.hero-grid,.hero.editorial .ed-grid{grid-template-columns:1fr}.art{aspect-ratio:16/12}.float{display:none}}

/* faixa de informações */
.info{margin-top:clamp(40px,6vw,64px);display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.info .it{display:flex;gap:14px;align-items:flex-start;background:var(--sf);border:1px solid var(--line);border-radius:calc(var(--r) + 4px);padding:18px 20px;box-shadow:var(--shadow);text-align:left;color:var(--tx)}
.info .ic{width:42px;height:42px;border-radius:12px;background:var(--soft);color:var(--p);display:grid;place-items:center;flex:none}
.info small{display:block;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--mu);font-weight:700;margin-bottom:2px}
.info b{font-weight:600;font-size:.98rem;line-height:1.4;display:block}.info a{color:var(--p);font-weight:600;font-size:.88rem;text-decoration:none}
.hero.banner .info .it{color:var(--tx)}

/* destaques */
.hl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.hl{background:var(--sf);border:1px solid var(--line);border-radius:calc(var(--r) + 4px);padding:26px;transition:transform .2s,box-shadow .2s}
.hl:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.hl .ic{width:48px;height:48px;border-radius:14px;background:var(--soft);display:grid;place-items:center;color:var(--p);margin-bottom:16px}
.hl p{color:var(--mu);margin:0;font-size:.95rem}
.hl-row{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}.hl-row span{display:inline-flex;gap:10px;align-items:center;padding:12px 20px;border:1px solid var(--line);border-radius:999px;background:var(--sf);font-weight:600}
.hl-row .i{color:var(--p);width:18px;height:18px}

/* sobre */
.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,6vw,72px);align-items:center}
.about-img{border-radius:calc(var(--r) * 1.5 + 6px);overflow:hidden;aspect-ratio:5/4;box-shadow:var(--shadow)}.about-img img{width:100%;height:100%;object-fit:cover}
.about-card{border-radius:calc(var(--r) * 1.5 + 6px);aspect-ratio:5/4;background:${heroGrad};position:relative;overflow:hidden;display:grid;place-items:center;color:var(--onp)}
.about-card .pat{position:absolute;inset:0;background-image:${patternSvg(seg, onP === '#FFFFFF' ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.1)')};background-size:120px}
.about-card .mono{position:relative;font-family:var(--hf);font-size:clamp(4rem,10vw,7rem);font-weight:700;letter-spacing:-.03em}
.about-text{font-size:1.1rem;color:var(--mu)}
@media(max-width:900px){.about-grid{grid-template-columns:1fr}}

/* cardápio / itens */
.alt{background:var(--sf)}
.alt::before{content:'';position:absolute;inset:0;background-image:${patternSvg(seg, rgba(t.primary, 0.05))};background-size:160px;pointer-events:none}
.alt .wrap{position:relative}
.menu-groups{display:grid;gap:28px}
.menu-group{background:var(--bg);border:1px solid var(--line);border-radius:calc(var(--r) + 6px);padding:clamp(22px,3vw,36px)}
.menu-group h3{display:flex;align-items:center;gap:10px;font-size:1.45rem;margin-bottom:8px}
.menu-group h3::after{content:'';flex:1;height:1px;background:var(--line);margin-left:8px}
.menu-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0 48px}
.mi{padding:16px 0;border-bottom:1px dashed var(--line)}
.mi-top{display:flex;align-items:baseline;gap:12px}.mi-name{font-weight:650}.mi-fill{flex:1;border-bottom:2px dotted var(--line);transform:translateY(-5px)}
.mi-price{font-weight:750;color:var(--p);white-space:nowrap}.mi-desc{color:var(--mu);font-size:.93rem;margin-top:4px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}
.card{background:var(--bg);border:1px solid var(--line);border-radius:calc(var(--r) + 4px);overflow:hidden;display:flex;flex-direction:column;transition:transform .2s,box-shadow .2s}
.card:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.card-img{aspect-ratio:4/3;background:var(--soft)}.card-img img{width:100%;height:100%;object-fit:cover}
.card-body{padding:22px;display:flex;flex-direction:column;gap:6px;flex:1}.card-body p{color:var(--mu);margin:0;font-size:.94rem}
.card-meta{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:14px}.card-meta .price{font-weight:750;color:var(--p);font-size:1.12rem}.card-meta .extra{color:var(--mu);font-size:.85rem}
.svc-list{display:grid;gap:12px;max-width:900px}
.svc{display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:calc(var(--r) + 4px);padding:20px 24px;transition:border-color .2s}
.svc:hover{border-color:var(--p)}
.svc .ic{width:44px;height:44px;border-radius:12px;background:var(--soft);display:grid;place-items:center;color:var(--p)}
.svc h3{margin:0}.svc p{margin:4px 0 0;color:var(--mu);font-size:.93rem}.svc .price{font-weight:750;color:var(--p);font-size:1.15rem;text-align:right}.svc .extra{display:block;color:var(--mu);font-size:.82rem;font-weight:500}
.note{color:var(--mu);font-size:.88rem;margin-top:26px}

/* galeria */
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.gal figure{margin:0;border-radius:calc(var(--r) + 4px);overflow:hidden;aspect-ratio:1}.gal img{width:100%;height:100%;object-fit:cover;transition:transform .5s}.gal figure:hover img{transform:scale(1.05)}
.gal.masonry{grid-template-columns:repeat(3,1fr)}.gal.masonry figure:nth-child(3n+1){grid-row:span 2;aspect-ratio:auto}
@media(max-width:700px){.gal.masonry{grid-template-columns:1fr 1fr}}

/* horários e contato */
.hours{max-width:620px;margin:0 auto;background:var(--sf);border:1px solid var(--line);border-radius:calc(var(--r) + 6px);padding:10px 30px;box-shadow:var(--shadow)}
.hours-row{display:flex;justify-content:space-between;gap:20px;padding:16px 0;border-bottom:1px solid var(--line)}.hours-row:last-child{border:0}
.hours-row span:first-child{font-weight:650}.hours-row span:last-child{color:var(--mu);text-align:right}
.hours-row.closed span:last-child{color:var(--a);font-weight:600}
.contact-grid{display:grid;grid-template-columns:1fr 1.25fr;gap:28px;align-items:stretch}
.c-list{display:grid;gap:14px;align-content:start}
.c-item{display:flex;gap:14px;align-items:flex-start;background:var(--sf);border:1px solid var(--line);border-radius:calc(var(--r) + 4px);padding:18px 20px}
.c-item .ic{width:42px;height:42px;border-radius:12px;background:var(--soft);display:grid;place-items:center;color:var(--p);flex:none}
.c-item small{display:block;text-transform:uppercase;letter-spacing:.14em;font-size:.72rem;color:var(--mu);font-weight:700}
.c-item a,.c-item div.v{font-size:1.04rem;text-decoration:none;font-weight:600}
.socials{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}.socials a{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid var(--line);border-radius:999px;font-size:.9rem;text-decoration:none;font-weight:600}
.socials .i{width:16px;height:16px}
.map{border-radius:calc(var(--r) + 6px);overflow:hidden;border:1px solid var(--line);min-height:360px;background:var(--soft);box-shadow:var(--shadow)}.map iframe{width:100%;height:100%;min-height:360px;border:0;display:block}
@media(max-width:900px){.contact-grid{grid-template-columns:1fr}}

/* cta */
.cta-band{padding:clamp(40px,6vw,72px) 0}
.cta-box{background:${heroGrad};color:var(--onp);border-radius:calc(var(--r) * 2 + 8px);padding:clamp(44px,7vw,84px) clamp(24px,5vw,64px);text-align:center;position:relative;overflow:hidden}
.cta-box::before{content:'';position:absolute;inset:0;background-image:${patternSvg(seg, onP === '#FFFFFF' ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.08)')};background-size:130px}
.cta-box>*{position:relative}.cta-box p{opacity:.92;max-width:620px;margin:0 auto}
.cta-box .btn{background:var(--onp);color:var(--p);border-color:var(--onp)}
.booking .box{max-width:780px;margin:0 auto;text-align:center;background:var(--sf);border:1px solid var(--line);border-radius:calc(var(--r) * 1.5 + 8px);padding:clamp(36px,6vw,64px);box-shadow:var(--shadow)}

/* rodapé */
footer{background:var(--deep);color:${rgba('#FFFFFF', 0.78)};padding:64px 0 36px;font-size:.94rem}
footer .cols{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:36px}
footer h4{color:#fff;font-family:var(--hf);font-size:1.25rem;margin:0 0 12px}
footer h5{color:#fff;font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;margin:0 0 14px}
footer a{color:${rgba('#FFFFFF', 0.78)};text-decoration:none}footer a:hover{color:#fff}
footer ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}
footer .bottom{margin-top:44px;padding-top:22px;border-top:1px solid ${rgba('#FFFFFF', 0.14)};display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:.84rem;color:${rgba('#FFFFFF', 0.55)}}
@media(max-width:800px){footer .cols{grid-template-columns:1fr}}
.fab{position:fixed;right:20px;bottom:20px;z-index:30;display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;border-radius:999px;padding:14px 20px;font-weight:700;text-decoration:none;box-shadow:0 12px 30px rgba(0,0,0,.25)}
.fab .i{width:20px;height:20px}
.demo-bar{position:fixed;left:0;right:0;bottom:0;z-index:40;background:#111;color:#fff;font:500 13px/1.4 system-ui,sans-serif;padding:9px 16px;text-align:center}
.has-demo .fab{bottom:58px}.has-demo footer{padding-bottom:70px}
`;
}

const EDITOR_CSS = `
[data-sid]{outline:2px solid transparent;outline-offset:-2px;transition:outline-color .15s;cursor:pointer}
[data-sid]:hover{outline-color:rgba(79,70,229,.45)}
[data-sid][data-selected]{outline:3px solid #4F46E5}
.pending{margin:20px auto 0;max-width:720px;border:2px dashed #F59E0B;background:rgba(245,158,11,.08);color:#92400E;border-radius:12px;padding:16px 20px;font:500 14px/1.5 system-ui,sans-serif;text-align:left}
.pending b{display:block;margin-bottom:4px}
.empty-sec{opacity:.75}
.rise{animation:none!important}
`;

const EDITOR_JS = `
document.addEventListener('click',function(e){var el=e.target.closest('[data-sid]');if(!el)return;e.preventDefault();parent.postMessage({type:'select-section',id:el.getAttribute('data-sid')},'*');});
window.addEventListener('message',function(e){if(e.data&&e.data.type==='scroll-to'){var el=document.querySelector('[data-sid="'+e.data.id+'"]');if(el){el.scrollIntoView({behavior:'smooth',block:'start'});}}});
`;

interface Ctx {
  spec: SiteSpec;
  opts: RenderOptions;
  img: (id?: string) => string | null;
  editor: boolean;
  segIcon: string;
}

function pendingBox(ctx: Ctx, s: Section): string {
  if (!ctx.editor || !s.pending?.length) return '';
  return `<div class="wrap"><div class="pending"><b>Informação pendente — não será exibida ao cliente até ser preenchida</b>${s.pending.map(esc).join(' · ')}</div></div>`;
}

function itemsEmpty(items?: Item[]) {
  return !items || items.filter((i) => i && i.name).length === 0;
}

function primaryCta(spec: SiteSpec): { label: string; href: string; icon: string } | null {
  const b = spec.business;
  const wa = waLink(b.whatsapp, `Olá! Vim pelo site da ${spec.businessName}.`);
  if (wa) return { label: 'Chamar no WhatsApp', href: wa, icon: 'chat' };
  const tel = telLink(b.phone);
  if (tel) return { label: 'Ligar agora', href: tel, icon: 'phone' };
  return null;
}

function hoursRows(spec: SiteSpec): { days: string; hours: string }[] {
  const h = spec.sections.find((s) => s.type === 'hours' && s.visible);
  return ((h?.props.rows ?? []) as { days: string; hours: string }[]).filter((r) => r?.days);
}

function directionsUrl(spec: SiteSpec) {
  const b = spec.business;
  if (b.lat != null && b.lon != null) return `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lon}`;
  if (b.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spec.businessName}, ${b.address}`)}`;
  return undefined;
}

/** Faixa com dados reais: endereço, horário e contato (cada item só aparece se existir). */
function infoStrip(ctx: Ctx): string {
  const b = ctx.spec.business;
  const items: string[] = [];
  if (b.address) {
    const dir = directionsUrl(ctx.spec);
    items.push(`<div class="it rise d2"><span class="ic">${icon('pin')}</span><div><small>Endereço</small><b>${esc(b.address)}</b>${dir ? `<a href="${esc(dir)}" target="_blank" rel="noopener">Como chegar →</a>` : ''}</div></div>`);
  }
  const rows = hoursRows(ctx.spec);
  if (rows.length) {
    const first = rows[0]!;
    items.push(`<div class="it rise d3"><span class="ic">${icon('clock')}</span><div><small>Horário</small><b>${esc(first.days)}: ${esc(first.hours)}</b>${rows.length > 1 ? '<a href="#horarios">Ver todos os horários →</a>' : ''}</div></div>`);
  }
  const wa = waLink(b.whatsapp);
  if (wa) items.push(`<div class="it rise d4"><span class="ic">${icon('chat')}</span><div><small>WhatsApp</small><b>${esc(b.whatsapp)}</b><a href="${esc(wa)}" target="_blank" rel="noopener">Enviar mensagem →</a></div></div>`);
  else if (b.phone) items.push(`<div class="it rise d4"><span class="ic">${icon('phone')}</span><div><small>Telefone</small><b>${esc(b.phone)}</b><a href="${esc(telLink(b.phone) ?? '#')}">Ligar →</a></div></div>`);
  return items.length ? `<div class="info">${items.join('')}</div>` : '';
}

/* ---------- seções ---------- */

function heroButtons(p: Record<string, any>) {
  return `<div class="btns rise d3">${p.ctaLabel ? `<a class="btn" href="${safeHref(p.ctaHref)}"${target(p.ctaHref)}>${esc(p.ctaLabel)} ${icon('arrow')}</a>` : ''}${
    p.secondaryLabel ? `<a class="btn ghost" href="${safeHref(p.secondaryHref)}"${target(p.secondaryHref)}>${esc(p.secondaryLabel)}</a>` : ''
  }</div>`;
}

function realHighlights(spec: SiteSpec): string[] {
  const h = spec.sections.find((s) => s.type === 'highlights' && s.visible);
  return ((h?.props.items ?? []) as { title: string }[]).map((i) => i?.title).filter((t) => t && !t.startsWith('Culinária')).slice(0, 2);
}

function artPanel(ctx: Ctx, img: string | null, logo: string | null, withFloats: boolean): string {
  if (img) return `<div class="art rise d2"><img src="${esc(img)}" alt="${esc(ctx.spec.businessName)}"></div>`;
  const floats = withFloats
    ? realHighlights(ctx.spec)
        .map((h, i) => `<div class="float f${i + 1}">${icon(highlightIcon(h))}${esc(h)}</div>`)
        .join('')
    : '';
  const place = ctx.spec.business.address?.split(',').slice(-3, -2)[0]?.trim();
  return `<div class="art rise d2"><div class="pat"></div><div class="glow"></div><div class="big"><div class="ring">${
    logo ? `<img class="logo" src="${esc(logo)}" alt="">` : icon(ctx.segIcon)
  }</div></div>${floats}<div class="tag"><b>${esc(ctx.spec.businessName)}</b>${place ? `<small>${esc(place)}</small>` : ''}</div></div>`;
}

function hero(ctx: Ctx, s: Section): string {
  const p = s.props;
  const t = ctx.spec.theme;
  const styles: Theme['heroStyle'][] = ['split', 'centered', 'banner', 'editorial'];
  const style = s.variant != null ? styles[s.variant % styles.length]! : t.heroStyle;
  const img = ctx.img(p.image);
  const logo = ctx.img(ctx.spec.logo);
  const chip = p.eyebrow ? `<span class="chip rise">${icon(ctx.segIcon)}${esc(p.eyebrow)}</span>` : '';
  const head = `${chip}<h1 class="rise d1">${esc(p.headline)}</h1>${p.subheadline ? `<p class="lead rise d2">${nl2br(p.subheadline)}</p>` : ''}${heroButtons(p)}`;
  const info = infoStrip(ctx);

  if (style === 'centered') {
    const em = logo || img;
    return `<section class="hero centered"><div class="wrap">${
      chip ? '' : ''
    }<div class="emblem rise">${em ? `<img src="${esc(em)}" alt="${esc(ctx.spec.businessName)}">` : icon(ctx.segIcon)}</div>${head}${info}</div></section>`;
  }
  if (style === 'banner') {
    const bg = img ? ` has-img" style="background-image:linear-gradient(110deg,${rgba(t.primary, 0.92)} 20%,${rgba(t.text, 0.45)}),url('${esc(img)}')` : '';
    return `<section class="hero banner${bg}">${img ? '' : icon(ctx.segIcon, 'bg-icon')}<div class="wrap"><div style="max-width:720px">${head}</div>${info}</div></section>`;
  }
  if (style === 'editorial') {
    return `<section class="hero editorial"><div class="wrap">${chip}<h1 class="rise d1">${esc(p.headline)}</h1><div class="ed-grid"><div>${
      p.subheadline ? `<p class="lead rise d2">${nl2br(p.subheadline)}</p>` : ''
    }${heroButtons(p)}</div>${artPanel(ctx, img, logo, false)}</div>${info}</div></section>`;
  }
  return `<section class="hero"><div class="wrap"><div class="hero-grid"><div>${head}</div>${artPanel(ctx, img, logo, true)}</div>${info}</div></section>`;
}

function secHead(ctx: Ctx, title: string, intro?: string, opts: { center?: boolean; iconName?: string; eyebrow?: string } = {}) {
  return `<div class="sec-head${opts.center ? ' center' : ''}">${opts.iconName ? `<div class="sec-icon">${icon(opts.iconName)}</div>` : `<span class="eyebrow">${esc(opts.eyebrow ?? ctx.spec.businessName)}</span>`}<h2>${esc(title)}</h2>${
    intro ? `<p class="lead">${nl2br(intro)}</p>` : ''
  }</div>`;
}

function highlights(ctx: Ctx, s: Section): string | null {
  const items: { title: string; text?: string }[] = (s.props.items ?? []).filter((i: any) => i?.title);
  if (!items.length) return ctx.editor ? emptySection(ctx, s, s.props.title || 'Destaques') : null;
  if (s.variant === 1) {
    return `<section><div class="wrap">${s.props.title ? secHead(ctx, s.props.title, undefined, { center: true }) : ''}<div class="hl-row">${items
      .map((i) => `<span>${icon(highlightIcon(i.title))}${esc(i.title)}</span>`)
      .join('')}</div></div></section>`;
  }
  return `<section><div class="wrap">${s.props.title ? secHead(ctx, s.props.title) : ''}<div class="hl-grid">${items
    .map((i) => `<div class="hl"><div class="ic">${icon(highlightIcon(i.title))}</div><h3>${esc(i.title)}</h3>${i.text ? `<p>${esc(i.text)}</p>` : ''}</div>`)
    .join('')}</div></div></section>`;
}

function about(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  if (!p.text) return ctx.editor ? emptySection(ctx, s, p.title || 'Sobre') : null;
  const img = ctx.img(p.image);
  const visual = img
    ? `<div class="about-img"><img src="${esc(img)}" alt="${esc(p.title || ctx.spec.businessName)}" loading="lazy"></div>`
    : `<div class="about-card"><div class="pat"></div><span class="mono">${esc(initials(ctx.spec.businessName))}</span></div>`;
  const textHtml = `<div><span class="eyebrow">${esc(ctx.spec.businessName)}</span><h2>${esc(p.title)}</h2><div class="about-text">${nl2br(p.text)}</div></div>`;
  return `<section id="sobre"><div class="wrap about-grid">${s.variant === 1 ? textHtml + visual : visual + textHtml}</div>${pendingBox(ctx, s)}</section>`;
}

function itemRow(i: Item) {
  return `<div class="mi"><div class="mi-top"><span class="mi-name">${esc(i.name)}</span><span class="mi-fill"></span>${
    i.price ? `<span class="mi-price">${esc(i.price)}</span>` : ''
  }</div>${i.description || i.extra ? `<div class="mi-desc">${esc(i.description ?? '')}${i.description && i.extra ? ' · ' : ''}${esc(i.extra ?? '')}</div>` : ''}</div>`;
}

function card(ctx: Ctx, i: Item) {
  const img = ctx.img(i.image);
  return `<article class="card">${img ? `<div class="card-img"><img src="${esc(img)}" alt="${esc(i.name)}" loading="lazy"></div>` : ''}<div class="card-body"><h3>${esc(i.name)}</h3>${
    i.description ? `<p>${esc(i.description)}</p>` : ''
  }${i.price || i.extra ? `<div class="card-meta"><span class="price">${esc(i.price ?? '')}</span><span class="extra">${esc(i.extra ?? '')}</span></div>` : ''}</div></article>`;
}

function menu(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  const groups: ItemGroup[] = (p.groups ?? []).filter((g: ItemGroup) => g && !itemsEmpty(g.items));
  if (!groups.length) return ctx.editor ? emptySection(ctx, s, p.title || 'Cardápio', 'cardapio') : null;
  const body =
    s.variant === 1
      ? `<div class="cards">${groups
          .flatMap((g) => g.items.filter((i) => i.name))
          .map((i) => card(ctx, i))
          .join('')}</div>`
      : `<div class="menu-groups">${groups
          .map((g) => `<div class="menu-group">${g.name ? `<h3>${esc(g.name)}</h3>` : ''}<div class="menu-items">${g.items.filter((i) => i.name).map(itemRow).join('')}</div></div>`)
          .join('')}</div>`;
  return `<section id="cardapio" class="alt"><div class="wrap">${secHead(ctx, p.title, p.intro, { center: true, iconName: ctx.segIcon })}${body}${
    p.note ? `<p class="note" style="text-align:center">${esc(p.note)}</p>` : ''
  }</div>${pendingBox(ctx, s)}</section>`;
}

function itemsSection(ctx: Ctx, s: Section, anchor: string): string | null {
  const p = s.props;
  const items: Item[] = (p.items ?? []).filter((i: Item) => i?.name);
  if (!items.length) return ctx.editor ? emptySection(ctx, s, p.title || 'Itens', anchor) : null;
  const svcIcon = ctx.segIcon === 'pole' ? 'scissors' : ctx.segIcon;
  const body =
    s.type === 'services' && s.variant !== 1
      ? `<div class="svc-list" style="margin:0 auto">${items
          .map(
            (i) =>
              `<div class="svc"><span class="ic">${icon(svcIcon)}</span><div><h3>${esc(i.name)}</h3>${i.description ? `<p>${esc(i.description)}</p>` : ''}</div><div class="price">${esc(i.price ?? '')}${
                i.extra ? `<span class="extra">${esc(i.extra)}</span>` : ''
              }</div></div>`,
          )
          .join('')}</div>`
      : `<div class="cards">${items.map((i) => card(ctx, i)).join('')}</div>`;
  return `<section id="${anchor}" class="alt"><div class="wrap">${secHead(ctx, p.title, p.intro, { center: true, iconName: s.type === 'services' ? svcIcon : 'bag' })}${body}</div>${pendingBox(ctx, s)}</section>`;
}

function gallery(ctx: Ctx, s: Section): string | null {
  const imgs = ((s.props.images ?? []) as string[]).map((id) => ctx.img(id)).filter(Boolean) as string[];
  if (!imgs.length) return ctx.editor ? emptySection(ctx, s, s.props.title || 'Galeria') : null;
  return `<section id="galeria"><div class="wrap">${s.props.title ? secHead(ctx, s.props.title) : ''}<div class="gal${s.variant === 1 ? ' masonry' : ''}">${imgs
    .map((u) => `<figure><img src="${esc(u)}" alt="Foto de ${esc(ctx.spec.businessName)}" loading="lazy"></figure>`)
    .join('')}</div></div></section>`;
}

function booking(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  if (!p.buttonHref || p.buttonHref === '#') return ctx.editor ? emptySection(ctx, s, p.title || 'Agendamento') : null;
  return `<section class="booking" id="agendar"><div class="wrap"><div class="box"><div class="sec-icon" style="margin:0 auto 18px">${icon('calendar')}</div><h2>${esc(p.title)}</h2>${
    p.text ? `<p class="lead" style="margin:0 auto">${nl2br(p.text)}</p>` : ''
  }<div class="btns" style="justify-content:center"><a class="btn" href="${safeHref(p.buttonHref)}"${target(p.buttonHref)}>${esc(p.buttonLabel || 'Agendar')} ${icon('arrow')}</a></div></div></div>${pendingBox(ctx, s)}</section>`;
}

function hours(ctx: Ctx, s: Section): string | null {
  const rows: { days: string; hours: string }[] = (s.props.rows ?? []).filter((r: any) => r?.days);
  if (!rows.length) return ctx.editor ? emptySection(ctx, s, s.props.title || 'Horários') : null;
  return `<section id="horarios"><div class="wrap">${secHead(ctx, s.props.title, undefined, { center: true, iconName: 'clock' })}<div class="hours">${rows
    .map((r) => `<div class="hours-row${/fechado/i.test(r.hours) ? ' closed' : ''}"><span>${esc(r.days)}</span><span>${esc(r.hours)}</span></div>`)
    .join('')}</div>${s.props.note ? `<p class="note" style="text-align:center">${esc(s.props.note)}</p>` : ''}</div></section>`;
}

const SOCIAL: Record<string, [string, string]> = { instagram: ['Instagram', 'insta'], facebook: ['Facebook', 'fb'], tiktok: ['TikTok', 'star'], youtube: ['YouTube', 'star'], twitter: ['X', 'star'] };

function socialLinks(spec: SiteSpec) {
  return Object.entries(spec.business.socials ?? {}).filter(([k, v]) => v && k !== 'whatsapp');
}

function contact(ctx: Ctx, s: Section): string {
  const b = ctx.spec.business;
  const p = s.props;
  const items: string[] = [];
  const item = (ic: string, label: string, value: string) => `<div class="c-item"><span class="ic">${icon(ic)}</span><div><small>${label}</small>${value}</div></div>`;
  if (b.address) {
    const dir = directionsUrl(ctx.spec);
    items.push(item('pin', 'Endereço', `<div class="v">${esc(b.address)}</div>${dir ? `<a href="${esc(dir)}" target="_blank" rel="noopener" style="font-size:.9rem;color:var(--p)">Como chegar →</a>` : ''}`));
  }
  if (b.phone) items.push(item('phone', 'Telefone', `<a href="${esc(telLink(b.phone) ?? '#')}">${esc(b.phone)}</a>`));
  const wa = waLink(b.whatsapp);
  if (wa) items.push(item('chat', 'WhatsApp', `<a href="${esc(wa)}" target="_blank" rel="noopener">${esc(b.whatsapp)}</a>`));
  if (b.email) items.push(item('chat', 'E-mail', `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>`));
  const socials = socialLinks(ctx.spec);
  if (socials.length)
    items.push(
      item(
        'star',
        'Redes sociais',
        `<div class="socials">${socials.map(([k, v]) => `<a href="${safeHref(v)}" target="_blank" rel="noopener">${icon(SOCIAL[k]?.[1] ?? 'star')}${esc(SOCIAL[k]?.[0] ?? k)}</a>`).join('')}</div>`,
      ),
    );
  const d = 0.004;
  const map =
    p.showMap !== false && b.lat != null && b.lon != null
      ? `<div class="map"><iframe title="Mapa" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${b.lon - d}%2C${b.lat - d}%2C${b.lon + d}%2C${b.lat + d}&layer=mapnik&marker=${b.lat}%2C${b.lon}"></iframe></div>`
      : '';
  return `<section id="contato"><div class="wrap">${secHead(ctx, p.title, p.text, { eyebrow: 'Visite-nos' })}<div class="contact-grid"${map ? '' : ' style="grid-template-columns:1fr;max-width:640px"'}><div class="c-list">${items.join(
    '',
  )}</div>${map}</div></div>${pendingBox(ctx, s)}</section>`;
}

function cta(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  if (!p.buttonHref || p.buttonHref === '#') return ctx.editor ? emptySection(ctx, s, p.title || 'Chamada final') : null;
  return `<section class="cta-band"><div class="wrap"><div class="cta-box"><h2>${esc(p.title)}</h2>${p.text ? `<p>${nl2br(p.text)}</p>` : ''}<div class="btns" style="justify-content:center"><a class="btn" href="${safeHref(
    p.buttonHref,
  )}"${target(p.buttonHref)}>${esc(p.buttonLabel)} ${icon('arrow')}</a></div></div></div></section>`;
}

function emptySection(ctx: Ctx, s: Section, title: string, anchor?: string): string {
  const msg = s.pending?.length ? s.pending : ['Sem conteúdo — preencha no painel ou oculte a seção.'];
  return `<section${anchor ? ` id="${anchor}"` : ''} class="empty-sec"><div class="wrap"><div class="sec-head center"><h2>${esc(title)}</h2></div><div class="pending"><b>Seção sem conteúdo verificado — oculta na versão para o cliente</b>${msg
    .map(esc)
    .join(' · ')}</div></div></section>`;
}

function renderSection(ctx: Ctx, s: Section): string | null {
  switch (s.type) {
    case 'hero': return hero(ctx, s);
    case 'highlights': return highlights(ctx, s);
    case 'about': return about(ctx, s);
    case 'menu': return menu(ctx, s);
    case 'services': return itemsSection(ctx, s, 'servicos');
    case 'products': return itemsSection(ctx, s, 'produtos');
    case 'gallery': return gallery(ctx, s);
    case 'booking': return booking(ctx, s);
    case 'hours': return hours(ctx, s);
    case 'contact': return contact(ctx, s);
    case 'cta': return cta(ctx, s);
    default: return null;
  }
}

/** JSON-LD LocalBusiness somente com dados presentes no documento. */
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
  const year = new Date(spec.meta.generatedAt || Date.now()).getFullYear();
  const rows = hoursRows(spec);
  const socials = socialLinks(spec);
  const contactLines = [
    b.address ? `<li>${esc(b.address)}</li>` : '',
    b.phone ? `<li><a href="${esc(telLink(b.phone) ?? '#')}">${esc(b.phone)}</a></li>` : '',
    waLink(b.whatsapp) ? `<li><a href="${esc(waLink(b.whatsapp)!)}" target="_blank" rel="noopener">WhatsApp: ${esc(b.whatsapp)}</a></li>` : '',
    ...socials.map(([k, v]) => `<li><a href="${safeHref(v)}" target="_blank" rel="noopener">${esc(SOCIAL[k]?.[0] ?? k)}</a></li>`),
  ].join('');
  const navLinks = spec.nav.map((n) => `<li><a href="#${esc(n.target)}">${esc(n.label)}</a></li>`).join('');
  return `<footer><div class="wrap"><div class="cols"><div><h4>${esc(spec.businessName)}</h4>${contactLines ? `<ul>${contactLines}</ul>` : ''}</div>${
    rows.length ? `<div><h5>Horários</h5><ul>${rows.map((r) => `<li>${esc(r.days)}: ${esc(r.hours)}</li>`).join('')}</ul></div>` : '<div></div>'
  }${navLinks ? `<div><h5>Navegação</h5><ul>${navLinks}</ul></div>` : '<div></div>'}</div><div class="bottom"><span>© ${year} ${esc(spec.businessName)}. Todos os direitos reservados.</span></div></div></footer>`;
}

export function renderSite(spec: SiteSpec, opts: RenderOptions): string {
  const editor = opts.mode === 'editor';
  const ctx: Ctx = { spec, opts, editor, img: (id) => (id ? opts.resolveAsset(id) : null), segIcon: SEGMENT_ICON[spec.segment] ?? 'star' };
  const t = spec.theme;
  const logo = ctx.img(spec.logo);
  const sections = spec.sections
    .filter((s) => s.visible)
    .map((s) => {
      const html = renderSection(ctx, s);
      if (!html) return null;
      return editor ? html.replace(/^<section/, `<section data-sid="${esc(s.id)}"${s.id === opts.selectedSectionId ? ' data-selected' : ''}`) : html;
    })
    .filter(Boolean)
    .join('\n');

  const cta = primaryCta(spec);
  const nav = spec.nav.length
    ? `<nav class="menu" aria-label="Navegação principal">${spec.nav.map((n) => `<a href="#${esc(n.target)}">${esc(n.label)}</a>`).join('')}</nav>`
    : '';
  const wa = waLink(spec.business.whatsapp, `Olá! Vim pelo site da ${spec.businessName}.`);
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
<meta name="theme-color" content="${esc(t.primary)}">
<link rel="preconnect" href="https://fonts.bunny.net">
<link rel="stylesheet" href="${fontsHref(t)}">
<style>${css(t, spec.segment)}${editor ? EDITOR_CSS : ''}</style>
<script type="application/ld+json">${jsonLd(spec)}</script>
</head>
<body${opts.demoNotice ? ' class="has-demo"' : ''}>
<header class="topbar"><div class="wrap"><a class="brand" href="#">${logo ? `<img src="${esc(logo)}" alt="${esc(spec.businessName)}">` : `<span class="mono">${esc(initials(spec.businessName))}</span>`}<span>${esc(
    spec.businessName,
  )}</span></a>${nav}${cta ? `<a class="btn" href="${esc(cta.href)}"${target(cta.href)}>${icon(cta.icon)}<span>${esc(cta.label)}</span></a>` : ''}</div></header>
<main>
${sections}
</main>
${footer(ctx)}
${opts.demoNotice ? `<div class="demo-bar">${esc(opts.demoNotice)}</div>` : ''}
${wa ? `<a class="fab" href="${esc(wa)}" target="_blank" rel="noopener">${icon('chat')}WhatsApp</a>` : ''}
${editor ? `<script>${EDITOR_JS}</script>` : ''}
</body>
</html>`;
}
