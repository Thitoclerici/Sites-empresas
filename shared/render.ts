// Renderizador: SiteSpec -> HTML estático, responsivo e otimizado para SEO.
// Função pura, usada pelo servidor (exportação) e pelo editor (prévia ao vivo).

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

export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s&]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^\p{Lu}/u.test(w));
  const pick = (words.length ? words : [name]).slice(0, 2).map((w) => w[0]!.toUpperCase());
  return pick.join('');
}

function fontsHref(t: Theme): string {
  const fams = Array.from(new Set([t.headingFont, t.bodyFont]))
    .map((f) => `${f.toLowerCase().replace(/\s+/g, '-')}:400,500,600,700`)
    .join('|');
  // Bunny Fonts: API compatível com Google Fonts, sem rastreamento (adequado à LGPD).
  return `https://fonts.bunny.net/css?family=${fams}&display=swap`;
}

function css(t: Theme): string {
  const onPrimary = readableOn(t.primary);
  const dark = luminance(t.background) < 0.2;
  return `
:root{--p:${t.primary};--s:${t.secondary};--a:${t.accent};--bg:${t.background};--sf:${t.surface};--tx:${t.text};--mu:${t.muted};
--onp:${onPrimary};--r:${t.radius}px;--hf:'${t.headingFont}',Georgia,serif;--bf:'${t.bodyFont}',system-ui,-apple-system,'Segoe UI',sans-serif;
--line:${rgba(t.text, dark ? 0.16 : 0.1)};--soft:${rgba(t.primary, 0.08)}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--tx);font-family:var(--bf);font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}a{color:inherit}
h1,h2,h3{font-family:var(--hf);line-height:1.12;margin:0 0 .5em;font-weight:600;letter-spacing:-.01em}
h1{font-size:clamp(2.3rem,6vw,4.4rem)}h2{font-size:clamp(1.8rem,3.6vw,2.6rem)}h3{font-size:1.2rem}
p{margin:0 0 1em}.wrap{width:min(1120px,100% - 40px);margin:0 auto}
section{padding:clamp(56px,9vw,104px) 0;position:relative}
.eyebrow{display:inline-block;font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--p);margin-bottom:14px}
.lead{font-size:1.15rem;color:var(--mu);max-width:640px}
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 26px;border-radius:calc(var(--r) + 999px * ${t.radius >= 16 ? 1 : 0});font-weight:600;text-decoration:none;border:2px solid var(--p);background:var(--p);color:var(--onp);transition:transform .15s,box-shadow .15s;font-size:1rem}
.btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px ${rgba(t.primary, 0.28)}}
.btn.ghost{background:transparent;color:var(--tx);border-color:var(--line)}
.btns{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.sec-head{max-width:720px;margin-bottom:44px}.center .sec-head,.sec-head.center{margin-left:auto;margin-right:auto;text-align:center}
/* topo */
.topbar{position:sticky;top:0;z-index:20;background:${rgba(t.background, 0.88)};backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line)}
.topbar .wrap{display:flex;align-items:center;justify-content:space-between;height:68px;gap:20px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;font-family:var(--hf);font-weight:700;font-size:1.2rem}
.brand img{height:42px;width:auto}.brand .mono{width:40px;height:40px;border-radius:calc(var(--r) / 2 + 6px);background:var(--p);color:var(--onp);display:grid;place-items:center;font-size:.95rem;letter-spacing:.04em}
.menu{display:flex;gap:26px;font-size:.95rem}.menu a{text-decoration:none;color:var(--mu)}.menu a:hover{color:var(--tx)}
.topbar .btn{padding:10px 18px;font-size:.92rem}
@media(max-width:860px){.menu{display:none}}
/* hero */
.hero{padding:clamp(56px,10vw,120px) 0}
.hero-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center}
.hero-art{aspect-ratio:4/5;border-radius:calc(var(--r) * 1.6);overflow:hidden;position:relative;background:linear-gradient(145deg,var(--p),${rgba(t.accent, 0.85)});box-shadow:0 30px 60px ${rgba(t.text, 0.18)}}
.hero-art img{width:100%;height:100%;object-fit:cover}
.hero-art .mono-art{position:absolute;inset:0;display:grid;place-items:center;color:${readableOn(t.primary)};font-family:var(--hf);font-size:clamp(4rem,12vw,9rem);font-weight:700;opacity:.92}
.hero-art .pattern{position:absolute;inset:0;background-image:radial-gradient(${rgba(onPrimary === '#FFFFFF' ? '#FFFFFF' : '#000000', 0.12)} 1.5px,transparent 1.6px);background-size:22px 22px}
.hero.centered{text-align:center}.hero.centered .lead{margin-left:auto;margin-right:auto}.hero.centered .btns{justify-content:center}
.hero.centered .hero-badge{margin:40px auto 0;width:110px;height:110px;border-radius:50%;background:var(--p);color:var(--onp);display:grid;place-items:center;font-family:var(--hf);font-size:2.2rem;font-weight:700;overflow:hidden}
.hero.centered .hero-badge img{width:100%;height:100%;object-fit:cover}
.hero.banner{background:linear-gradient(120deg,var(--p),${rgba(t.accent, 0.9)});color:var(--onp);padding:clamp(80px,14vw,170px) 0;overflow:hidden}
.hero.banner .lead,.hero.banner .eyebrow{color:var(--onp);opacity:.9}.hero.banner .btn{background:var(--onp);color:var(--p);border-color:var(--onp)}.hero.banner .btn.ghost{background:transparent;color:var(--onp);border-color:${rgba(onPrimary, 0.5)}}
.hero.banner.has-img{background-size:cover;background-position:center}
.hero.banner .bg-mono{position:absolute;right:-2%;bottom:-18%;font-family:var(--hf);font-size:clamp(10rem,30vw,26rem);font-weight:700;opacity:.12;line-height:1}
.hero.editorial h1{font-size:clamp(2.8rem,8vw,6rem);border-bottom:1px solid var(--line);padding-bottom:.3em;margin-bottom:.4em}
.hero.editorial .ed-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:end}
.hero.editorial .ed-img{border-radius:var(--r);overflow:hidden;aspect-ratio:16/10;background:var(--soft)}
.hero.editorial .ed-img img{width:100%;height:100%;object-fit:cover}
.ed-art{position:relative;width:100%;height:100%;background:linear-gradient(135deg,var(--p),${rgba(t.accent, 0.8)});display:grid;place-items:center}
.ed-art span{position:relative;font-family:var(--hf);font-size:clamp(3rem,9vw,6.5rem);font-weight:700;color:var(--onp);display:flex;width:100%;justify-content:center}
.ed-art .pattern,.hero-art .pattern{position:absolute;inset:0;background-image:radial-gradient(${rgba(onPrimary === '#FFFFFF' ? '#FFFFFF' : '#000000', 0.12)} 1.5px,transparent 1.6px);background-size:22px 22px}
@media(max-width:860px){.hero-grid,.hero.editorial .ed-grid{grid-template-columns:1fr}.hero-art{aspect-ratio:16/11}}
/* destaques */
.hl-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px}
.hl{background:var(--sf);border:1px solid var(--line);border-radius:var(--r);padding:22px}
.hl .dot{width:34px;height:34px;border-radius:50%;background:var(--soft);display:grid;place-items:center;color:var(--p);font-weight:700;margin-bottom:12px}
.hl p{color:var(--mu);margin:0;font-size:.95rem}
.hl-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}.hl-row span{padding:10px 18px;border:1px solid var(--line);border-radius:999px;background:var(--sf);font-weight:500}
/* sobre */
.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
.about-grid.no-img{grid-template-columns:1fr;max-width:780px}
.about-img{border-radius:var(--r);overflow:hidden;aspect-ratio:5/4}.about-img img{width:100%;height:100%;object-fit:cover}
.about-text{font-size:1.08rem;color:var(--mu)}
@media(max-width:860px){.about-grid{grid-template-columns:1fr}}
/* cardápio / itens */
.alt{background:var(--sf)}
.menu-tabs{display:grid;gap:40px}
.menu-group h3{font-size:1.35rem;padding-bottom:10px;border-bottom:2px solid var(--p);display:inline-block}
.menu-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:6px 44px;margin-top:10px}
.mi{padding:14px 0;border-bottom:1px dashed var(--line)}
.mi-top{display:flex;align-items:baseline;gap:12px}.mi-name{font-weight:600}.mi-fill{flex:1;border-bottom:1px dotted var(--line);transform:translateY(-4px)}
.mi-price{font-weight:700;color:var(--p);white-space:nowrap}.mi-desc{color:var(--mu);font-size:.93rem;margin-top:4px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
.card{background:var(--bg);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column}
.alt .card{background:var(--bg)}.card-img{aspect-ratio:4/3;background:var(--soft)}.card-img img{width:100%;height:100%;object-fit:cover}
.card-body{padding:20px;display:flex;flex-direction:column;gap:6px;flex:1}.card-body p{color:var(--mu);margin:0;font-size:.94rem}
.card-meta{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:12px}.card-meta .price{font-weight:700;color:var(--p);font-size:1.1rem}.card-meta .extra{color:var(--mu);font-size:.85rem}
.svc-list{display:grid;gap:12px;max-width:860px}
.svc{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;background:var(--bg);border:1px solid var(--line);border-radius:var(--r);padding:20px 24px}
.svc p{margin:4px 0 0;color:var(--mu);font-size:.93rem}.svc .price{font-weight:700;color:var(--p);font-size:1.15rem;text-align:right}.svc .extra{display:block;color:var(--mu);font-size:.82rem;font-weight:500}
.note{color:var(--mu);font-size:.88rem;margin-top:26px}
/* galeria */
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.gal figure{margin:0;border-radius:var(--r);overflow:hidden;aspect-ratio:1}.gal img{width:100%;height:100%;object-fit:cover;transition:transform .4s}.gal figure:hover img{transform:scale(1.04)}
.gal.masonry{grid-template-columns:repeat(3,1fr)}.gal.masonry figure:nth-child(3n+1){grid-row:span 2;aspect-ratio:auto}
@media(max-width:700px){.gal.masonry{grid-template-columns:1fr 1fr}}
/* horários e contato */
.hours{max-width:560px;margin:0 auto;background:var(--sf);border:1px solid var(--line);border-radius:var(--r);padding:12px 28px}
.hours-row{display:flex;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:1px solid var(--line)}.hours-row:last-child{border:0}
.hours-row span:first-child{font-weight:600}.hours-row span:last-child{color:var(--mu);text-align:right}
.contact-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:40px;align-items:stretch}
.c-list{display:grid;gap:18px;align-content:start}.c-item small{display:block;text-transform:uppercase;letter-spacing:.12em;font-size:.72rem;color:var(--mu);font-weight:600}
.c-item a,.c-item div{font-size:1.08rem;text-decoration:none;font-weight:500}
.socials{display:flex;gap:10px;flex-wrap:wrap}.socials a{padding:8px 14px;border:1px solid var(--line);border-radius:999px;font-size:.9rem;text-decoration:none}
.map{border-radius:var(--r);overflow:hidden;border:1px solid var(--line);min-height:320px;background:var(--soft)}.map iframe{width:100%;height:100%;min-height:320px;border:0}
@media(max-width:860px){.contact-grid{grid-template-columns:1fr}}
/* cta */
.cta-band{background:var(--p);color:var(--onp);text-align:center}.cta-band p{opacity:.9;max-width:620px;margin:0 auto}
.cta-band .btn{background:var(--onp);color:var(--p);border-color:var(--onp)}
.booking{background:linear-gradient(135deg,${rgba(t.primary, 0.12)},${rgba(t.accent, 0.12)})}
.booking .box{max-width:760px;margin:0 auto;text-align:center}
/* rodapé */
footer{padding:44px 0;border-top:1px solid var(--line);color:var(--mu);font-size:.9rem}
footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px}
.fab{position:fixed;right:20px;bottom:20px;z-index:30;background:#25D366;color:#fff;border-radius:999px;padding:14px 20px;font-weight:700;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.demo-bar{position:fixed;left:0;right:0;bottom:0;z-index:40;background:#111;color:#fff;font:500 13px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center}
.demo-bar + .fab{bottom:56px}
`;
}

const EDITOR_CSS = `
[data-sid]{outline:2px solid transparent;outline-offset:-2px;transition:outline-color .15s;cursor:pointer}
[data-sid]:hover{outline-color:rgba(79,70,229,.45)}
[data-sid][data-selected]{outline:3px solid #4F46E5}
.pending{margin:20px auto 0;max-width:720px;border:2px dashed #F59E0B;background:rgba(245,158,11,.08);color:#92400E;border-radius:12px;padding:16px 20px;font:500 14px/1.5 system-ui,sans-serif;text-align:left}
.pending b{display:block;margin-bottom:4px}
.empty-sec{opacity:.75}
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
}

function pendingBox(ctx: Ctx, s: Section): string {
  if (!ctx.editor || !s.pending?.length) return '';
  return `<div class="pending"><b>Informação pendente — não será exibida ao cliente até ser preenchida</b>${s.pending.map(esc).join(' · ')}</div>`;
}

function itemsEmpty(items?: Item[]) {
  return !items || items.filter((i) => i && i.name).length === 0;
}

function primaryCta(spec: SiteSpec): { label: string; href: string } | null {
  const b = spec.business;
  const wa = waLink(b.whatsapp, `Olá! Vim pelo site da ${spec.businessName}.`);
  if (wa) return { label: 'Chamar no WhatsApp', href: wa };
  const tel = telLink(b.phone);
  if (tel) return { label: 'Ligar agora', href: tel };
  return null;
}

/* ---------- seções ---------- */

function hero(ctx: Ctx, s: Section): string {
  const p = s.props;
  const t = ctx.spec.theme;
  const styles: Theme['heroStyle'][] = ['split', 'centered', 'banner', 'editorial'];
  const style = s.variant != null ? styles[s.variant % styles.length]! : t.heroStyle;
  const img = ctx.img(p.image);
  const logo = ctx.img(ctx.spec.logo);
  const mono = esc(initials(ctx.spec.businessName));
  const buttons = `<div class="btns">${p.ctaLabel ? `<a class="btn" href="${safeHref(p.ctaHref)}">${esc(p.ctaLabel)}</a>` : ''}${
    p.secondaryLabel ? `<a class="btn ghost" href="${safeHref(p.secondaryHref)}">${esc(p.secondaryLabel)}</a>` : ''
  }</div>`;
  const text = `${p.eyebrow ? `<span class="eyebrow">${esc(p.eyebrow)}</span>` : ''}<h1>${esc(p.headline)}</h1>${
    p.subheadline ? `<p class="lead">${nl2br(p.subheadline)}</p>` : ''
  }${buttons}`;
  if (style === 'centered') {
    const badge = logo || img;
    return `<section class="hero centered"><div class="wrap">${text}<div class="hero-badge">${badge ? `<img src="${esc(badge)}" alt="${esc(ctx.spec.businessName)}">` : mono}</div></div></section>`;
  }
  if (style === 'banner') {
    const bg = img ? ` has-img" style="background-image:linear-gradient(120deg,${rgba(t.primary, 0.88)},${rgba(t.text, 0.55)}),url('${esc(img)}')` : '';
    return `<section class="hero banner${bg}"><div class="bg-mono" aria-hidden="true">${mono}</div><div class="wrap">${text}</div></section>`;
  }
  if (style === 'editorial') {
    return `<section class="hero editorial"><div class="wrap">${p.eyebrow ? `<span class="eyebrow">${esc(p.eyebrow)}</span>` : ''}<h1>${esc(p.headline)}</h1><div class="ed-grid"><div>${
      p.subheadline ? `<p class="lead">${nl2br(p.subheadline)}</p>` : ''
    }${buttons}</div><div class="ed-img">${img ? `<img src="${esc(img)}" alt="${esc(ctx.spec.businessName)}">` : `<div class="ed-art"><div class="pattern"></div><span>${logo ? `<img src="${esc(logo)}" alt="" style="width:50%;height:auto;object-fit:contain;margin:auto">` : mono}</span></div>`}</div></div></div></section>`;
  }
  return `<section class="hero"><div class="wrap hero-grid"><div>${text}</div><div class="hero-art">${
    img ? `<img src="${esc(img)}" alt="${esc(ctx.spec.businessName)}">` : `<div class="pattern"></div><div class="mono-art" aria-hidden="true">${logo ? `<img src="${esc(logo)}" alt="" style="width:55%;height:auto;object-fit:contain">` : mono}</div>`
  }</div></div></section>`;
}

function highlights(ctx: Ctx, s: Section): string | null {
  const items: { title: string; text?: string }[] = (s.props.items ?? []).filter((i: any) => i?.title);
  if (!items.length) return ctx.editor ? emptySection(ctx, s, s.props.title || 'Destaques') : null;
  if (s.variant === 1) {
    return `<section><div class="wrap">${s.props.title ? `<div class="sec-head center"><h2>${esc(s.props.title)}</h2></div>` : ''}<div class="hl-row">${items.map((i) => `<span>${esc(i.title)}</span>`).join('')}</div></div></section>`;
  }
  return `<section><div class="wrap">${s.props.title ? `<div class="sec-head"><h2>${esc(s.props.title)}</h2></div>` : ''}<div class="hl-grid">${items
    .map((i) => `<div class="hl"><div class="dot">✓</div><h3>${esc(i.title)}</h3>${i.text ? `<p>${esc(i.text)}</p>` : ''}</div>`)
    .join('')}</div></div></section>`;
}

function about(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  if (!p.text) return ctx.editor ? emptySection(ctx, s, p.title || 'Sobre') : null;
  const img = ctx.img(p.image);
  const imgHtml = img ? `<div class="about-img"><img src="${esc(img)}" alt="${esc(p.title || ctx.spec.businessName)}" loading="lazy"></div>` : '';
  const textHtml = `<div><span class="eyebrow">${esc(ctx.spec.businessName)}</span><h2>${esc(p.title)}</h2><div class="about-text">${nl2br(p.text)}</div></div>`;
  return `<section id="sobre"><div class="wrap about-grid${img ? '' : ' no-img'}">${s.variant === 1 ? imgHtml + textHtml : textHtml + imgHtml}</div>${pendingBox(ctx, s)}</section>`;
}

function itemRow(i: Item) {
  return `<div class="mi"><div class="mi-top"><span class="mi-name">${esc(i.name)}</span><span class="mi-fill"></span>${
    i.price ? `<span class="mi-price">${esc(i.price)}</span>` : ''
  }</div>${i.description ? `<div class="mi-desc">${esc(i.description)}${i.extra ? ` · ${esc(i.extra)}` : ''}</div>` : ''}</div>`;
}

function menu(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  const groups: ItemGroup[] = (p.groups ?? []).filter((g: ItemGroup) => g && !itemsEmpty(g.items));
  if (!groups.length) return ctx.editor ? emptySection(ctx, s, p.title || 'Cardápio', 'menu') : null;
  const body =
    s.variant === 1
      ? `<div class="cards">${groups
          .flatMap((g) => g.items.filter((i) => i.name))
          .map((i) => card(ctx, i))
          .join('')}</div>`
      : `<div class="menu-tabs">${groups
          .map((g) => `<div class="menu-group">${g.name ? `<h3>${esc(g.name)}</h3>` : ''}<div class="menu-items">${g.items.filter((i) => i.name).map(itemRow).join('')}</div></div>`)
          .join('')}</div>`;
  return `<section id="cardapio" class="alt"><div class="wrap"><div class="sec-head"><span class="eyebrow">${esc(ctx.spec.businessName)}</span><h2>${esc(p.title)}</h2>${
    p.intro ? `<p class="lead">${nl2br(p.intro)}</p>` : ''
  }</div>${body}${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}</div>${pendingBox(ctx, s)}</section>`;
}

function card(ctx: Ctx, i: Item) {
  const img = ctx.img(i.image);
  return `<article class="card">${img ? `<div class="card-img"><img src="${esc(img)}" alt="${esc(i.name)}" loading="lazy"></div>` : ''}<div class="card-body"><h3>${esc(i.name)}</h3>${
    i.description ? `<p>${esc(i.description)}</p>` : ''
  }${i.price || i.extra ? `<div class="card-meta"><span class="price">${esc(i.price ?? '')}</span><span class="extra">${esc(i.extra ?? '')}</span></div>` : ''}</div></article>`;
}

function itemsSection(ctx: Ctx, s: Section, anchor: string): string | null {
  const p = s.props;
  const items: Item[] = (p.items ?? []).filter((i: Item) => i?.name);
  if (!items.length) return ctx.editor ? emptySection(ctx, s, p.title || 'Itens', anchor) : null;
  const body =
    s.type === 'services' && s.variant !== 1
      ? `<div class="svc-list">${items
          .map(
            (i) =>
              `<div class="svc"><div><h3>${esc(i.name)}</h3>${i.description ? `<p>${esc(i.description)}</p>` : ''}</div><div class="price">${esc(i.price ?? '')}${
                i.extra ? `<span class="extra">${esc(i.extra)}</span>` : ''
              }</div></div>`,
          )
          .join('')}</div>`
      : `<div class="cards">${items.map((i) => card(ctx, i)).join('')}</div>`;
  return `<section id="${anchor}" class="alt"><div class="wrap"><div class="sec-head"><span class="eyebrow">${esc(ctx.spec.businessName)}</span><h2>${esc(p.title)}</h2>${
    p.intro ? `<p class="lead">${nl2br(p.intro)}</p>` : ''
  }</div>${body}</div>${pendingBox(ctx, s)}</section>`;
}

function gallery(ctx: Ctx, s: Section): string | null {
  const imgs = ((s.props.images ?? []) as string[]).map((id) => ctx.img(id)).filter(Boolean) as string[];
  if (!imgs.length) return ctx.editor ? emptySection(ctx, s, s.props.title || 'Galeria') : null;
  return `<section id="galeria"><div class="wrap">${s.props.title ? `<div class="sec-head"><h2>${esc(s.props.title)}</h2></div>` : ''}<div class="gal${
    s.variant === 1 ? ' masonry' : ''
  }">${imgs.map((u) => `<figure><img src="${esc(u)}" alt="Foto de ${esc(ctx.spec.businessName)}" loading="lazy"></figure>`).join('')}</div></div></section>`;
}

function booking(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  if (!p.buttonHref || p.buttonHref === '#') return ctx.editor ? emptySection(ctx, s, p.title || 'Agendamento') : null;
  return `<section class="booking" id="agendar"><div class="wrap box"><h2>${esc(p.title)}</h2>${p.text ? `<p class="lead" style="margin:0 auto">${nl2br(p.text)}</p>` : ''}<div class="btns" style="justify-content:center"><a class="btn" href="${safeHref(
    p.buttonHref,
  )}">${esc(p.buttonLabel || 'Agendar')}</a></div></div>${pendingBox(ctx, s)}</section>`;
}

function hours(ctx: Ctx, s: Section): string | null {
  const rows: { days: string; hours: string }[] = (s.props.rows ?? []).filter((r: any) => r?.days);
  if (!rows.length) return ctx.editor ? emptySection(ctx, s, s.props.title || 'Horários') : null;
  return `<section id="horarios"><div class="wrap"><div class="sec-head center"><h2>${esc(s.props.title)}</h2></div><div class="hours">${rows
    .map((r) => `<div class="hours-row"><span>${esc(r.days)}</span><span>${esc(r.hours)}</span></div>`)
    .join('')}</div>${s.props.note ? `<p class="note" style="text-align:center">${esc(s.props.note)}</p>` : ''}</div></section>`;
}

const SOCIAL_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', twitter: 'X / Twitter' };

function contact(ctx: Ctx, s: Section): string {
  const b = ctx.spec.business;
  const p = s.props;
  const items: string[] = [];
  if (b.address) items.push(`<div class="c-item"><small>Endereço</small><div>${esc(b.address)}</div></div>`);
  if (b.phone) items.push(`<div class="c-item"><small>Telefone</small><a href="${esc(telLink(b.phone) ?? '#')}">${esc(b.phone)}</a></div>`);
  const wa = waLink(b.whatsapp);
  if (wa) items.push(`<div class="c-item"><small>WhatsApp</small><a href="${esc(wa)}" target="_blank" rel="noopener">${esc(b.whatsapp)}</a></div>`);
  if (b.email) items.push(`<div class="c-item"><small>E-mail</small><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></div>`);
  const socials = Object.entries(b.socials ?? {}).filter(([, v]) => v);
  if (socials.length)
    items.push(
      `<div class="c-item"><small>Redes sociais</small><div class="socials">${socials
        .map(([k, v]) => `<a href="${safeHref(v)}" target="_blank" rel="noopener">${esc(SOCIAL_LABEL[k] ?? k)}</a>`)
        .join('')}</div></div>`,
    );
  if (b.lat != null && b.lon != null) {
    items.push(
      `<div class="c-item"><a class="btn ghost" style="margin-top:6px" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lon}">Como chegar</a></div>`,
    );
  }
  const d = 0.004;
  const map =
    p.showMap !== false && b.lat != null && b.lon != null
      ? `<div class="map"><iframe title="Mapa" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${b.lon - d}%2C${b.lat - d}%2C${b.lon + d}%2C${b.lat + d}&layer=mapnik&marker=${b.lat}%2C${b.lon}"></iframe></div>`
      : '';
  return `<section id="contato"><div class="wrap"><div class="sec-head"><h2>${esc(p.title)}</h2>${p.text ? `<p class="lead">${nl2br(p.text)}</p>` : ''}</div><div class="contact-grid"${
    map ? '' : ' style="grid-template-columns:1fr"'
  }><div class="c-list">${items.join('')}</div>${map}</div></div>${pendingBox(ctx, s)}</section>`;
}

function cta(ctx: Ctx, s: Section): string | null {
  const p = s.props;
  if (!p.buttonHref || p.buttonHref === '#') return ctx.editor ? emptySection(ctx, s, p.title || 'Chamada final') : null;
  return `<section class="cta-band"><div class="wrap"><h2>${esc(p.title)}</h2>${p.text ? `<p>${nl2br(p.text)}</p>` : ''}<div class="btns" style="justify-content:center"><a class="btn" href="${safeHref(
    p.buttonHref,
  )}">${esc(p.buttonLabel)}</a></div></div></section>`;
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
  const same = Object.values(b.socials ?? {}).filter(Boolean);
  if (same.length) data.sameAs = same;
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function renderSite(spec: SiteSpec, opts: RenderOptions): string {
  const editor = opts.mode === 'editor';
  const ctx: Ctx = { spec, opts, editor, img: (id) => (id ? opts.resolveAsset(id) : null) };
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
  const year = new Date(spec.meta.generatedAt || Date.now()).getFullYear();

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
<style>${css(t)}${editor ? EDITOR_CSS : ''}</style>
<script type="application/ld+json">${jsonLd(spec)}</script>
</head>
<body>
<header class="topbar"><div class="wrap"><a class="brand" href="#">${logo ? `<img src="${esc(logo)}" alt="${esc(spec.businessName)}">` : `<span class="mono">${esc(initials(spec.businessName))}</span>`}<span>${esc(
    spec.businessName,
  )}</span></a>${nav}${cta ? `<a class="btn" href="${esc(cta.href)}">${esc(cta.label)}</a>` : ''}</div></header>
<main>
${sections}
</main>
<footer><div class="wrap"><span>© ${year} ${esc(spec.businessName)}</span><span>${esc(spec.business.address ?? '')}</span></div></footer>
${opts.demoNotice ? `<div class="demo-bar">${esc(opts.demoNotice)}</div>` : ''}
${wa ? `<a class="fab" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
${editor ? `<script>${EDITOR_JS}</script>` : ''}
</body>
</html>`;
}
