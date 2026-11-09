// Módulo de geração: transforma fatos + materiais autorizados em um SiteSpec
// personalizado para o segmento. A IA (quando configurada) só escreve textos e
// escolhe a direção visual; dados factuais vêm sempre dos fatos registrados.

import { getSegment, type SegmentProfile, type ThemePreset } from '../../../shared/segments.ts';
import type { Fact } from '../../../shared/types.ts';
import { USABLE_RIGHTS } from '../../../shared/types.ts';
import type { Item, ItemGroup, Origin, Section, SiteSpec, Theme } from '../../../shared/site.ts';
import { telLink, waLink } from '../../../shared/site.ts';
import { parseOpeningHours, rowsFromGoogle } from '../../../shared/hours.ts';
import { OSM_HIGHLIGHTS } from '../../../shared/segments.ts';
import { bestFacts, getBusiness, listAssets } from '../repo.ts';
import { aiEnabled, aiModel, generateCopy, type GeneratedCopy } from './ai.ts';
import { computeMissing } from './investigation.ts';

const CONFIRMED = (f?: Fact) => !!f && (f.status === 'verified' || f.status === 'user_provided');

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Monta o briefing factual usado pela IA e pelo gerador. */
export function buildBrief(businessId: string) {
  const b = getBusiness(businessId)!;
  const seg = getSegment(b.segment);
  const facts = bestFacts(businessId);
  const val = <T>(k: string) => (CONFIRMED(facts[k]) ? (facts[k]!.value as T) : undefined);
  const assets = listAssets(businessId).filter((a) => USABLE_RIGHTS.includes(a.rights));
  return {
    business: b,
    segment: seg,
    facts,
    assets,
    data: {
      nome: b.name,
      segmento: seg.label,
      categoria: b.category,
      bairro: b.address.suburb,
      cidade: b.address.city,
      endereco: b.address.formatted,
      telefone: val<string>('phone'),
      whatsapp: val<string>('whatsapp'),
      horarios: val<string>('opening_hours') ?? (val<string[]>('opening_hours_text') ?? []).join('; '),
      culinaria: val<string[]>('cuisine'),
      comodidades: val<string[]>('amenities'),
      descricao: val<string>('description'),
      diferenciais: val<string[]>('differentials'),
      cardapio: val<ItemGroup[]>('menu'),
      servicos: val<Item[]>('services'),
      produtos: val<Item[]>('products'),
      redes_sociais: val<Record<string, string>>('socials'),
    },
  };
}

function pickTheme(seg: SegmentProfile, name: string, presetIndex: number | undefined, brandColor?: string, logoPalette?: string[]): Theme {
  const idx = presetIndex != null && presetIndex >= 0 && presetIndex < seg.presets.length ? presetIndex : hash(name) % seg.presets.length;
  const p: ThemePreset = seg.presets[idx]!;
  const theme: Theme = { ...p, presetName: p.name };
  const brand = brandColor ?? logoPalette?.[0];
  if (brand && /^#[0-9a-f]{6}$/i.test(brand)) {
    theme.primary = brand.toUpperCase();
    if (logoPalette?.[1]) theme.accent = logoPalette[1].toUpperCase();
    theme.presetName = `${p.name} + cores da marca`;
  }
  return theme;
}

const sec = (type: string, props: Record<string, any>, origins: Record<string, Origin> = {}, pending: string[] = [], visible = true): Section => ({
  id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  visible,
  props,
  origins,
  pending,
});

export async function generateSpec(businessId: string, opts: { useAi?: boolean } = {}): Promise<{ spec: SiteSpec; aiError?: string; rationale?: string }> {
  const brief = buildBrief(businessId);
  const { business: b, segment: seg, facts, assets, data } = brief;
  const missing = computeMissing(businessId);

  let copy: GeneratedCopy | null = null;
  let aiError: string | undefined;
  if ((opts.useAi ?? true) && aiEnabled()) {
    try {
      copy = await generateCopy(data, seg.presets.map((p) => p.name));
    } catch (e: any) {
      aiError = `IA indisponível, textos modelo usados: ${e.message}`;
    }
  }
  const T = (aiText: string | undefined, fallback: string): [string, Origin] => (aiText && aiText.trim() ? [aiText.trim(), 'ai'] : [fallback, 'template']);

  const logo = assets.find((a) => a.kind === 'logo');
  // Cardápio anexado: link informado (ou encontrado) e/ou arquivo autorizado mais recente.
  const menuLink = CONFIRMED(facts.menu_url) ? String(facts.menu_url!.value) : undefined;
  const menuFile = assets.find((a) => a.kind === 'menu')?.id;
  const photos = assets.filter((a) => a.kind === 'photo');
  const theme = pickTheme(seg, b.name, copy?.presetIndex, CONFIRMED(facts.brand_color) ? (facts.brand_color!.value as string) : undefined, logo?.palette);

  const place = data.bairro ?? data.cidade;
  const whatsapp = data.whatsapp;
  const wa = waLink(whatsapp, `Olá! Vim pelo site da ${b.name}.`);
  const tel = telLink(data.telefone);
  const directions = b.lat != null && b.lon != null ? `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lon}` : undefined;

  const contentItems = {
    menu: (data.cardapio ?? []).filter((g) => g.items?.length),
    services: data.servicos ?? [],
    products: data.produtos ?? [],
  };
  const hasContent = { menu: contentItems.menu.length > 0, services: contentItems.services.length > 0, products: contentItems.products.length > 0 };
  const contentAnchor = { menu: 'cardapio', services: 'servicos', products: 'produtos' }[seg.contentKind];

  // CTA principal conforme o segmento e os dados disponíveis (nunca um link falso).
  let cta: { label: string; href: string } | null = null;
  if (seg.ctaPrimary === 'booking' && (wa || tel)) cta = { label: 'Agendar horário', href: wa ?? tel! };
  else if (seg.ctaPrimary === 'whatsapp' && wa) cta = { label: 'Pedir pelo WhatsApp', href: wa };
  else if (seg.ctaPrimary === 'phone' && tel) cta = { label: 'Ligar e reservar', href: tel };
  else if (seg.ctaPrimary === 'menu' && hasContent.menu) cta = { label: 'Ver cardápio', href: '#cardapio' };
  cta ??= wa ? { label: 'Fale conosco no WhatsApp', href: wa } : tel ? { label: 'Ligar agora', href: tel } : directions ? { label: 'Como chegar', href: directions } : null;
  const secondary = hasContent[seg.contentKind]
    ? { label: `Ver ${seg.copy.contentTitle.toLowerCase()}`, href: `#${contentAnchor}` }
    : directions && cta?.href !== directions
      ? { label: 'Como chegar', href: directions }
      : null;

  const sections: Section[] = [];
  for (const type of seg.sections) {
    switch (type) {
      case 'hero': {
        const [eyebrow, oe] = T(copy?.heroEyebrow, place ? `${seg.label} em ${place}` : seg.label);
        const [sub, os] = T(copy?.heroSubheadline, seg.copy.heroSub);
        sections.push(
          sec(
            'hero',
            { eyebrow, headline: b.name, subheadline: sub, ctaLabel: cta?.label ?? '', ctaHref: cta?.href ?? '', secondaryLabel: secondary?.label ?? '', secondaryHref: secondary?.href ?? '', image: photos[0]?.id ?? '' },
            { eyebrow: oe, headline: 'fact', subheadline: os },
            cta ? [] : ['Nenhum contato confirmado para o botão principal (telefone/WhatsApp).'],
          ),
        );
        break;
      }
      case 'highlights': {
        const items: { title: string; text?: string }[] = [];
        for (const d of data.diferenciais ?? []) items.push({ title: d });
        for (const label of data.comodidades ?? []) {
          const h = OSM_HIGHLIGHTS.find((x) => x.label === label);
          items.push({ title: label, text: h?.text });
        }
        if (data.culinaria?.length && seg.contentKind === 'menu') items.unshift({ title: `Culinária: ${data.culinaria.join(', ')}` });
        const [title, ot] = T(copy?.highlightsTitle, 'Por que nos visitar');
        sections.push(sec('highlights', { title, items: items.slice(0, 8) }, { title: ot, items: 'fact' }, items.length ? [] : ['Diferenciais e comodidades não encontrados — informe os diferenciais do negócio.']));
        break;
      }
      case 'about': {
        const verifiedDesc = data.descricao;
        const fallbackText = verifiedDesc ?? '';
        const [text, otext] = verifiedDesc ? [verifiedDesc, 'fact' as Origin] : T(copy?.aboutText, fallbackText);
        const [title, otitle] = T(copy?.aboutTitle, seg.copy.aboutTitle);
        sections.push(
          sec('about', { title, text, image: photos[1]?.id ?? '' }, { title: otitle, text: otext }, verifiedDesc ? [] : ['Descrição/história do negócio não encontrada — peça ao proprietário.']),
        );
        break;
      }
      case 'menu':
      case 'services':
      case 'products': {
        const kind = type as 'menu' | 'services' | 'products';
        const title = kind === seg.contentKind ? seg.copy.contentTitle : kind === 'products' ? 'Produtos' : kind === 'services' ? 'Serviços' : 'Cardápio';
        const [intro, oi] = hasContent[kind] ? T(copy?.contentIntro, '') : ['', 'template' as Origin];
        const pendingMsg =
          kind === 'menu'
            ? 'Cardápio não encontrado em fontes públicas autorizadas — envie o cardápio ou cadastre os itens.'
            : kind === 'services'
              ? 'Lista de serviços e preços não encontrada — cadastre os serviços oferecidos.'
              : 'Produtos não encontrados — cadastre os produtos em destaque.';
        // Cardápio/tabela anexado (link ou arquivo) vale para a seção principal de conteúdo.
        const doc = kind === seg.contentKind ? { menuLink: menuLink ?? '', menuFile: menuFile ?? '' } : { menuLink: '', menuFile: '' };
        const hasDoc = !!(doc.menuLink || doc.menuFile);
        const props =
          kind === 'menu'
            ? { title, intro, groups: contentItems.menu, note: hasContent.menu ? 'Preços e disponibilidade sujeitos a alteração.' : '', ...doc }
            : { title, intro, items: contentItems[kind], ...doc };
        sections.push(sec(kind, props, { title: 'template', intro: oi }, hasContent[kind] || hasDoc ? [] : [pendingMsg]));
        break;
      }
      case 'gallery':
        sections.push(sec('gallery', { title: 'Galeria', images: photos.slice(0, 9).map((p) => p.id) }, { title: 'template' }, photos.length ? [] : ['Nenhuma foto com uso autorizado — envie fotos autorizadas pelo estabelecimento.']));
        break;
      case 'booking': {
        const href = wa ?? tel ?? '';
        sections.push(
          sec(
            'booking',
            { title: seg.copy.ctaTitle, text: wa ? 'Escolha o melhor horário e fale com a gente pelo WhatsApp.' : 'Ligue e agende o seu horário.', buttonLabel: wa ? 'Agendar pelo WhatsApp' : 'Ligar para agendar', buttonHref: href },
            { title: 'template', text: 'template' },
            href ? [] : ['Sem WhatsApp/telefone confirmado para agendamentos. Integração com sistema de agenda: Fase 2.'],
          ),
        );
        break;
      }
      case 'hours': {
        const rows = parseOpeningHours(data.horarios && facts.opening_hours && CONFIRMED(facts.opening_hours) ? (facts.opening_hours.value as string) : undefined) ??
          rowsFromGoogle(CONFIRMED(facts.opening_hours_text) ? (facts.opening_hours_text!.value as string[]) : undefined) ??
          (CONFIRMED(facts.opening_hours) ? [{ days: 'Horários', hours: String(facts.opening_hours!.value) }] : []);
        sections.push(sec('hours', { title: 'Horário de funcionamento', rows, note: rows.length ? 'Confirme horários especiais em feriados.' : '' }, { title: 'template', rows: 'fact' }, rows.length ? [] : ['Horário de funcionamento não encontrado — confirme com o estabelecimento.']));
        break;
      }
      case 'contact': {
        const [text, ot] = T(copy?.contactText, '');
        const pend: string[] = [];
        if (!data.telefone) pend.push('Telefone não encontrado.');
        if (!b.address.street) pend.push('Endereço incompleto.');
        sections.push(sec('contact', { title: 'Contato e localização', text, showMap: true }, { title: 'template', text: ot }, pend));
        break;
      }
      case 'cta': {
        const [title, ot] = T(copy?.ctaTitle, seg.copy.ctaTitle);
        const [text, ox] = T(copy?.ctaText, '');
        sections.push(sec('cta', { title, text, buttonLabel: cta?.label ?? '', buttonHref: cta?.href ?? '' }, { title: ot, text: ox }, cta ? [] : ['Sem contato confirmado para o botão.']));
        break;
      }
    }
  }

  const navMap: Record<string, { label: string; target: string }> = {
    about: { label: 'Sobre', target: 'sobre' },
    menu: { label: seg.contentKind === 'menu' ? seg.copy.contentTitle : 'Cardápio', target: 'cardapio' },
    services: { label: 'Serviços', target: 'servicos' },
    products: { label: 'Produtos', target: 'produtos' },
    gallery: { label: 'Galeria', target: 'galeria' },
    hours: { label: 'Horários', target: 'horarios' },
    contact: { label: 'Contato', target: 'contato' },
  };

  const spec: SiteSpec = {
    version: 1,
    businessName: b.name,
    segment: seg.id,
    lang: 'pt-BR',
    theme,
    logo: logo?.id,
    seo: {
      title: copy?.seoTitle?.trim() || `${b.name} | ${seg.label}${place ? ` em ${place}` : ''}`,
      description: copy?.seoDescription?.trim() || `${b.name}: ${seg.copy.noun}${place ? ` em ${place}` : ''}. ${data.endereco ? `Endereço: ${data.endereco}.` : ''}`.trim(),
      keywords: [seg.copy.noun, place, b.address.city].filter(Boolean).join(', '),
    },
    nav: [],
    sections,
    business: {
      phone: data.telefone,
      whatsapp: whatsapp,
      email: CONFIRMED(facts.email) ? (facts.email!.value as string) : undefined,
      address: b.address.formatted,
      lat: b.lat,
      lon: b.lon,
      socials: data.redes_sociais ?? {},
      openingHoursRaw: CONFIRMED(facts.opening_hours) ? (facts.opening_hours!.value as string) : undefined,
    },
    meta: { generatedAt: new Date().toISOString(), generator: copy ? 'ai' : 'template', model: copy ? aiModel() : undefined },
  };
  spec.nav = computeNav(spec, navMap);
  void missing;
  return { spec, aiError, rationale: copy?.designRationale };
}

/** Navegação somente para seções visíveis e com conteúdo. */
export function computeNav(spec: SiteSpec, navMap?: Record<string, { label: string; target: string }>) {
  const seg = getSegment(spec.segment);
  const map = navMap ?? {
    about: { label: 'Sobre', target: 'sobre' },
    menu: { label: seg.contentKind === 'menu' ? seg.copy.contentTitle : 'Cardápio', target: 'cardapio' },
    services: { label: 'Serviços', target: 'servicos' },
    products: { label: 'Produtos', target: 'produtos' },
    gallery: { label: 'Galeria', target: 'galeria' },
    hours: { label: 'Horários', target: 'horarios' },
    contact: { label: 'Contato', target: 'contato' },
  };
  const hasContent = (s: Section) => {
    const p = s.props;
    switch (s.type) {
      case 'about': return !!p.text;
      case 'menu': return !!(p.menuLink || p.menuFile) || (p.groups ?? []).some((g: ItemGroup) => g.items?.some((i) => i.name));
      case 'services':
      case 'products': return !!(p.menuLink || p.menuFile) || (p.items ?? []).some((i: Item) => i.name);
      case 'gallery': return (p.images ?? []).length > 0;
      case 'hours': return (p.rows ?? []).length > 0;
      case 'contact': return true;
      default: return false;
    }
  };
  return spec.sections.filter((s) => s.visible && map[s.type] && hasContent(s)).map((s) => map[s.type]!);
}
