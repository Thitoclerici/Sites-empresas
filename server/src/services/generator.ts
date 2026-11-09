// Módulo de geração: transforma fatos + materiais autorizados em um SiteSpec
// personalizado para o segmento. A IA (quando configurada) só escreve textos e
// escolhe a direção visual; dados factuais vêm sempre dos fatos registrados.

import { getSegment } from '../../../shared/segments.ts';
import { buildDirection, CONCEPTS, COPY, familyOf, pickTagline, RECOMMENDED, themeFor, type Concept } from '../../../shared/design.ts';
import type { Fact } from '../../../shared/types.ts';
import { USABLE_RIGHTS } from '../../../shared/types.ts';
import type { Item, ItemGroup, Origin, Section, SiteSpec } from '../../../shared/site.ts';
import { telLink, waLink } from '../../../shared/site.ts';
import { parseOpeningHours, rowsFromGoogle } from '../../../shared/hours.ts';
import { OSM_HIGHLIGHTS } from '../../../shared/segments.ts';
import { bestFacts, getBusiness, listAssets } from '../repo.ts';
import { aiEnabled, aiModel, generateCopy, type GeneratedCopy } from './ai.ts';

const CONFIRMED = (f?: Fact) => !!f && (f.status === 'verified' || f.status === 'user_provided');

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

const sec = (type: string, props: Record<string, any>, origins: Record<string, Origin> = {}, pending: string[] = [], visible = true): Section => ({
  id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  visible,
  props,
  origins,
  pending,
});

function shortHoursLabel(rows: { days: string; hours: string }[]) {
  const r = rows.find((x) => !/fechado/i.test(x.hours));
  if (!r) return undefined;
  const d = r.days.replace('Segunda', 'Seg').replace('Terça', 'Ter').replace('Quarta', 'Qua').replace('Quinta', 'Qui').replace('Sexta', 'Sex').replace('Sábado', 'Sáb').replace('Domingo', 'Dom');
  return `${d} · ${r.hours.replace(/:00/g, 'h').replace(/(\d{2}):(\d{2})/g, '$1h$2')}`;
}

export async function generateSpec(
  businessId: string,
  opts: { useAi?: boolean; concept?: Concept } = {},
): Promise<{ spec: SiteSpec; aiError?: string; rationale?: string }> {
  const brief = buildBrief(businessId);
  const { business: b, segment: seg, facts, assets, data } = brief;
  const fam = familyOf(seg.id);
  const bank = COPY[seg.id] ?? COPY.retail!;

  // 1) Briefing criativo e textos (IA opcional; sem IA, modelos por segmento e conceito).
  let copy: GeneratedCopy | null = null;
  let aiError: string | undefined;
  if ((opts.useAi ?? true) && aiEnabled()) {
    try {
      copy = await generateCopy({ ...data, conceito_solicitado: opts.concept ?? null }, CONCEPTS.map((c) => `${c.id}: ${c.label}`));
    } catch (e: any) {
      aiError = `IA indisponível, textos modelo usados: ${e.message}`;
    }
  }
  const T = (aiText: string | undefined, fallback: string): [string, Origin] => (aiText && aiText.trim() ? [aiText.trim(), 'ai'] : [fallback, 'template']);

  const logo = assets.find((a) => a.kind === 'logo');
  const photos = assets.filter((a) => a.kind === 'photo' && a.mime.startsWith('image/'));
  const menuLink = CONFIRMED(facts.menu_url) ? String(facts.menu_url!.value) : undefined;
  const menuFile = assets.find((a) => a.kind === 'menu')?.id;

  const aiConcept = copy?.concept && CONCEPTS.some((c) => c.id === copy!.concept) ? (copy.concept as Concept) : undefined;
  const concept: Concept = opts.concept ?? aiConcept ?? RECOMMENDED[seg.id] ?? 'inviting';
  const direction = buildDirection({
    segment: seg.id,
    segmentLabel: seg.label,
    name: b.name,
    concept,
    amenities: data.comodidades,
    hasPhotos: photos.length > 0,
    hasLogo: !!logo,
    hasMenu: !!(data.cardapio?.length || data.servicos?.length || data.produtos?.length || menuLink || menuFile),
  });
  if (copy?.audience?.length) direction.audience = copy.audience.map((a) => ({ text: a.text, basis: a.basis === 'indício' ? 'indício' : 'hipótese' }));
  if (copy?.designRationale) direction.rationale = copy.designRationale;
  const brandColors = CONFIRMED(facts.brand_color) ? [String(facts.brand_color!.value)] : logo?.palette;
  const theme = themeFor(seg.id, concept, brandColors);

  const place = data.bairro ?? data.cidade;
  const whatsapp = data.whatsapp;
  const wa = waLink(whatsapp, `Olá! Vim pelo site da ${b.name.replace(/\s*\([^)]*\)/g, '')}.`);
  const tel = telLink(data.telefone);
  const directions = b.lat != null && b.lon != null ? `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lon}` : undefined;

  const contentItems = {
    menu: (data.cardapio ?? []).filter((g) => g.items?.length),
    services: data.servicos ?? [],
    products: data.produtos ?? [],
  };
  const hasContent = { menu: contentItems.menu.length > 0, services: contentItems.services.length > 0, products: contentItems.products.length > 0 };
  const contentAnchor = { menu: 'cardapio', services: 'servicos', products: 'produtos' }[seg.contentKind];
  const hasDocMain = !!(menuLink || menuFile);

  // 2) Chamada principal conforme o segmento e os dados reais (nunca um link falso).
  let cta: { label: string; href: string } | null = null;
  if (seg.ctaPrimary === 'booking' && (wa || tel)) cta = { label: 'Agendar horário', href: wa ?? tel! };
  else if (seg.ctaPrimary === 'whatsapp' && wa) cta = { label: fam === 'food' ? 'Pedir pelo WhatsApp' : 'Chamar no WhatsApp', href: wa };
  else if (seg.ctaPrimary === 'phone' && tel) cta = { label: 'Ligar e reservar', href: tel };
  if (!cta && (hasContent[seg.contentKind] || hasDocMain) && fam === 'food') cta = { label: seg.contentKind === 'menu' ? `Ver ${seg.copy.contentTitle.toLowerCase()}` : 'Ver mais', href: `#${contentAnchor}` };
  cta ??= wa ? { label: 'Fale com a gente', href: wa } : tel ? { label: 'Ligar agora', href: tel } : directions ? { label: 'Como chegar', href: directions } : null;
  const secondary =
    (hasContent[seg.contentKind] || hasDocMain) && cta?.href !== `#${contentAnchor}`
      ? { label: `Ver ${seg.copy.contentTitle.toLowerCase()}`, href: `#${contentAnchor}` }
      : directions && cta?.href !== directions
        ? { label: 'Como chegar', href: directions }
        : null;

  // 3) Horários (fatos), usados em várias composições.
  const rows =
    parseOpeningHours(CONFIRMED(facts.opening_hours) ? (facts.opening_hours!.value as string) : undefined) ??
    rowsFromGoogle(CONFIRMED(facts.opening_hours_text) ? (facts.opening_hours_text!.value as string[]) : undefined) ??
    (CONFIRMED(facts.opening_hours) ? [{ days: 'Horários', hours: String(facts.opening_hours!.value) }] : []);

  const description = data.descricao;
  const [tagline, oTag] = T(copy?.tagline, pickTagline(seg.id, concept, b.name, place));
  const [statementText, oStm] = description ? [description, 'fact' as Origin] : T(copy?.statement, bank.statement[0]!);

  // 4) Monta as seções seguindo o plano de página do conceito.
  const sections: Section[] = [];
  for (const type of direction.plan) {
    switch (type) {
      case 'hero': {
        const [sub, os] = T(copy?.heroSubheadline, concept === 'bold' ? '' : seg.copy.heroSub);
        sections.push(
          sec(
            'hero',
            { eyebrow: '', headline: tagline, subheadline: sub, ctaLabel: cta?.label ?? '', ctaHref: cta?.href ?? '', secondaryLabel: secondary?.label ?? '', secondaryHref: secondary?.href ?? '', image: photos[0]?.id ?? '' },
            { headline: oTag, subheadline: os },
            cta ? [] : ['Nenhum contato confirmado para o botão principal (telefone/WhatsApp).'],
          ),
        );
        break;
      }
      case 'marquee': {
        const items = [
          [seg.label, place].filter(Boolean).join(' em '),
          ...(data.culinaria ?? []).slice(0, 2),
          ...(data.diferenciais ?? []).filter((d) => d.length <= 38).slice(0, 2),
          ...(data.comodidades ?? []).slice(0, 3),
          shortHoursLabel(rows),
          data.cidade && data.cidade !== place ? data.cidade : undefined,
        ].filter((x): x is string => !!x);
        const uniq = Array.from(new Set(items));
        sections.push(sec('marquee', { items: uniq }, { items: 'fact' }, uniq.length >= 2 ? [] : ['Poucas informações reais para o letreiro.'], uniq.length >= 2));
        break;
      }
      case 'statement':
        sections.push(sec('statement', { label: 'Sobre', text: statementText, image: photos[1]?.id ?? '' }, { text: oStm }, description ? [] : ['Descrição/história do negócio não informada — o texto é um modelo. Peça ao proprietário.']));
        break;
      case 'highlights': {
        const items: { title: string; text?: string }[] = [];
        for (const d of data.diferenciais ?? []) items.push({ title: d });
        for (const label of data.comodidades ?? []) items.push({ title: label, text: OSM_HIGHLIGHTS.find((x) => x.label === label)?.text });
        if (data.culinaria?.length && seg.contentKind === 'menu') items.push({ title: `Culinária: ${data.culinaria.join(', ')}` });
        const [title, ot] = T(copy?.highlightsTitle, concept === 'bold' ? 'Por que aqui' : 'Por que nos visitar');
        sections.push(sec('highlights', { title, items: items.slice(0, 6) }, { title: ot, items: 'fact' }, items.length ? [] : ['Diferenciais e comodidades não encontrados — informe os diferenciais do negócio.']));
        break;
      }
      case 'about': {
        const [title, ot] = T(copy?.aboutTitle, seg.copy.aboutTitle);
        sections.push(sec('about', { title, text: statementText, image: photos[1]?.id ?? '' }, { title: ot, text: oStm }, description ? [] : ['Descrição do negócio não informada — o texto é um modelo. Peça ao proprietário.']));
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
            ? 'Cardápio não encontrado em fontes públicas autorizadas — envie o cardápio (PDF/link) ou cadastre os itens.'
            : kind === 'services'
              ? 'Lista de serviços e preços não encontrada — cadastre os serviços ou anexe a tabela.'
              : 'Produtos não encontrados — cadastre os produtos em destaque ou anexe o catálogo.';
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
        sections.push(sec('gallery', { title: 'Galeria', images: photos.slice(0, 9).map((p) => p.id) }, { title: 'template' }, photos.length ? [] : ['Nenhuma foto com uso autorizado — envie fotos autorizadas (fachada, ambiente, produtos).']));
        break;
      case 'booking':
      case 'cta': {
        const href = type === 'booking' ? wa ?? tel ?? '' : cta?.href ?? '';
        const label = type === 'booking' ? (wa ? 'Agendar pelo WhatsApp' : 'Ligar para agendar') : cta?.label ?? '';
        const [title, ot] = T(copy?.ctaTitle, bank.ctaTitle[concept]);
        const [text, ox] = T(copy?.ctaText, type === 'booking' ? (wa ? 'Escolha o melhor horário e fale com a gente pelo WhatsApp.' : 'Ligue e agende o seu horário.') : '');
        sections.push(sec(type, { title, text, buttonLabel: label, buttonHref: href }, { title: ot, text: ox }, href ? [] : ['Sem WhatsApp/telefone confirmado para o botão.']));
        break;
      }
      case 'visit': {
        const [text, ot] = T(copy?.contactText, '');
        const pend: string[] = [];
        if (!data.telefone && !whatsapp) pend.push('Telefone/WhatsApp não encontrado.');
        if (!b.address.street && !b.address.formatted) pend.push('Endereço incompleto.');
        if (!rows.length) pend.push('Horário de funcionamento não encontrado.');
        sections.push(sec('visit', { title: concept === 'bold' ? 'Onde estamos' : 'Visite-nos', text, rows, showMap: true }, { title: 'template', text: ot, rows: 'fact' }, pend));
        break;
      }
    }
  }

  const spec: SiteSpec = {
    version: 1,
    businessName: b.name,
    segment: seg.id,
    lang: 'pt-BR',
    theme,
    logo: logo?.id,
    seo: {
      title: copy?.seoTitle?.trim() || `${b.name} | ${seg.label}${place ? ` em ${place}` : ''}`,
      description: copy?.seoDescription?.trim() || `${b.name}: ${seg.copy.noun}${place ? ` em ${place}` : ''}. ${tagline} ${data.endereco ? `Endereço: ${data.endereco}.` : ''}`.trim(),
      keywords: [seg.copy.noun, place, b.address.city].filter(Boolean).join(', '),
    },
    nav: [],
    sections,
    business: {
      phone: data.telefone,
      whatsapp,
      email: CONFIRMED(facts.email) ? (facts.email!.value as string) : undefined,
      address: b.address.formatted,
      area: place,
      lat: b.lat,
      lon: b.lon,
      socials: data.redes_sociais ?? {},
      openingHoursRaw: CONFIRMED(facts.opening_hours) ? (facts.opening_hours!.value as string) : undefined,
    },
    meta: { generatedAt: new Date().toISOString(), generator: copy ? 'ai' : 'template', model: copy ? aiModel() : undefined, direction },
  };
  spec.nav = computeNav(spec);
  return { spec, aiError, rationale: direction.rationale };
}

/**
 * Troca o conceito visual de um site, preservando o que o operador editou
 * (campos com origem "user"), o logotipo e as imagens escolhidas.
 */
export async function switchConcept(businessId: string, current: SiteSpec, concept: Concept): Promise<SiteSpec> {
  const { spec } = await generateSpec(businessId, { concept, useAi: false });
  for (const s of spec.sections) {
    const old = current.sections.find((o) => o.type === s.type);
    if (!old) continue;
    for (const [k, origin] of Object.entries(old.origins)) {
      if (origin === 'user') {
        s.props[k] = old.props[k];
        s.origins[k] = 'user';
      }
    }
    for (const k of ['image', 'images', 'menuFile', 'menuLink', 'groups', 'items']) if (old.props[k] && (old.origins[k] === 'user' || k === 'image' || k === 'images')) s.props[k] = old.props[k];
    if (old.type === s.type && !old.visible) s.visible = false;
  }
  spec.logo = current.logo;
  spec.seo = current.seo;
  spec.meta.conceptChosen = true;
  spec.nav = computeNav(spec);
  return spec;
}

/** Navegação somente para seções visíveis e com conteúdo. */
export function computeNav(spec: SiteSpec, navMap?: Record<string, { label: string; target: string }>) {
  const seg = getSegment(spec.segment);
  const map = navMap ?? {
    statement: { label: 'Sobre', target: 'sobre' },
    visit: { label: 'Contato', target: 'contato' },
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
      case 'about':
      case 'statement': return !!p.text;
      case 'visit': return true;
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
