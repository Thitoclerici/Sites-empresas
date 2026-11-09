// Direção de arte: conceitos visuais, paletas por segmento, pares tipográficos,
// planos de página e briefing criativo. É aqui que o gerador "pensa" antes de montar o site.
//
// Três conceitos com diferenças reais de composição (não só de cor):
//  - refined   (Moderno e sofisticado): editorial, serifas elegantes, muito respiro, linhas finas
//  - bold      (Criativo e impactante): tipografia gigante condensada, blocos de cor, letreiro, selo
//  - inviting  (Comercial e convidativo): produtos em primeiro plano, cartões, foco em conversão

import type { Theme } from './site.ts';

export type Concept = 'refined' | 'bold' | 'inviting';

export const CONCEPTS: { id: Concept; label: string; description: string }[] = [
  { id: 'refined', label: 'Moderno e sofisticado', description: 'Editorial e elegante: serifas refinadas, muito respiro, linhas finas e composição assimétrica.' },
  { id: 'bold', label: 'Criativo e impactante', description: 'Identidade marcante: tipografia gigante, blocos de cor, letreiro animado e selo giratório.' },
  { id: 'inviting', label: 'Comercial e convidativo', description: 'Produtos em primeiro plano, cartões calorosos, chamadas claras e foco em pedido ou reserva.' },
];

export type Family = 'food' | 'service' | 'retail';

export function familyOf(segment: string): Family {
  if (['barbershop', 'beauty_salon', 'pet_shop'].includes(segment)) return 'service';
  if (['clothing', 'retail'].includes(segment)) return 'retail';
  return 'food';
}

/** Paleta base do segmento: marca, destaque, tinta (texto/escuro) e papel (fundo claro). */
interface SegPalette {
  brand: string;
  pop: string;
  ink: string;
  paper: string;
  darkFirst?: boolean; // segmentos que pedem fundo escuro (bar, barbearia)
}

export const SEGMENT_PALETTES: Record<string, SegPalette> = {
  cafe: { brand: '#6B3E26', pop: '#D99A4E', ink: '#1E1410', paper: '#F5EEE4' },
  restaurant: { brand: '#8C2F1B', pop: '#D6A13F', ink: '#1A1512', paper: '#F6F1E9' },
  pizzeria: { brand: '#C8102E', pop: '#F2B134', ink: '#1B1210', paper: '#FFF5EA' },
  bakery: { brand: '#A8571B', pop: '#EFC27E', ink: '#2A1A0E', paper: '#FBF4EA' },
  bar: { brand: '#E2A72E', pop: '#C2410C', ink: '#0F0D0B', paper: '#F3ECE0', darkFirst: true },
  ice_cream: { brand: '#E0507F', pop: '#6CCFB9', ink: '#3A1027', paper: '#FFF4F8' },
  barbershop: { brand: '#C9A24B', pop: '#9E2A2B', ink: '#0E0E0E', paper: '#ECE6DA', darkFirst: true },
  beauty_salon: { brand: '#9F4A5A', pop: '#D6B088', ink: '#2B1A1F', paper: '#FAF4F1' },
  clothing: { brand: '#1C1C1C', pop: '#B08D57', ink: '#111111', paper: '#F2EFE9' },
  pet_shop: { brand: '#1F7A6B', pop: '#F29E4C', ink: '#13302B', paper: '#F3F9F6' },
  retail: { brand: '#2649A8', pop: '#F2B33D', ink: '#12182B', paper: '#F5F6FA' },
};

/** Pares tipográficos por conceito e família (todos disponíveis no Bunny Fonts). */
const FONTS: Record<Concept, Record<Family, [string, string]>> = {
  refined: { food: ['Cormorant Garamond', 'Manrope'], service: ['Playfair Display', 'Manrope'], retail: ['Cormorant Garamond', 'Inter'] },
  bold: { food: ['Anton', 'Archivo'], service: ['Anton', 'Archivo'], retail: ['Syne', 'Archivo'] },
  inviting: { food: ['Fraunces', 'DM Sans'], service: ['Bricolage Grotesque', 'DM Sans'], retail: ['Bricolage Grotesque', 'DM Sans'] },
};

export const ALL_FONTS = Array.from(new Set(Object.values(FONTS).flatMap((f) => Object.values(f).flat())));

function hex(h: string) {
  const v = h.replace('#', '');
  const f = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as [number, number, number];
}
function toHex(c: number[]) {
  return `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
export function mixHex(a: string, b: string, t: number) {
  const A = hex(a);
  const B = hex(b);
  return toHex(A.map((v, i) => v + (B[i]! - v) * t));
}
export function lum(h: string) {
  const [r, g, b] = hex(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

/** Monta o tema para um conceito, usando as cores da marca quando existirem. */
export function themeFor(segment: string, concept: Concept, brandOverride?: string[]): Theme {
  const base = SEGMENT_PALETTES[segment] ?? SEGMENT_PALETTES.retail!;
  const fam = familyOf(segment);
  const [headingFont, bodyFont] = FONTS[concept][fam];
  let brand = base.brand;
  let pop = base.pop;
  if (brandOverride?.[0] && /^#[0-9a-f]{6}$/i.test(brandOverride[0])) {
    brand = brandOverride[0].toUpperCase();
    if (brandOverride[1] && /^#[0-9a-f]{6}$/i.test(brandOverride[1])) pop = brandOverride[1].toUpperCase();
  }
  const dark = !!base.darkFirst && concept !== 'inviting';
  const background = dark ? mixHex(base.ink, brand, 0.04) : concept === 'inviting' ? mixHex('#FFFFFF', base.paper, 0.75) : base.paper;
  const text = dark ? mixHex(base.paper, '#FFFFFF', 0.4) : base.ink;
  const surface = dark ? mixHex(base.ink, '#FFFFFF', 0.06) : concept === 'refined' ? mixHex(base.paper, '#FFFFFF', 0.55) : '#FFFFFF';
  const muted = mixHex(text, background, 0.42);
  // Garante contraste legível para o texto secundário.
  const mutedOk = contrast(muted, background) >= 4.5 ? muted : mixHex(text, background, 0.25);
  return {
    presetName: `${CONCEPTS.find((c) => c.id === concept)!.label}`,
    concept,
    primary: brand,
    secondary: base.ink,
    accent: pop,
    background,
    surface,
    text,
    muted: mutedOk,
    headingFont,
    bodyFont,
    radius: concept === 'refined' ? 2 : concept === 'bold' ? 0 : 18,
    heroStyle: concept === 'refined' ? 'editorial' : concept === 'bold' ? 'banner' : 'split',
    dark,
  } as Theme;
}

/** Plano de página: quais seções e em que ordem, conforme conceito e família. */
export function sectionPlan(concept: Concept, fam: Family): string[] {
  const content = fam === 'food' ? 'menu' : fam === 'service' ? 'services' : 'products';
  const book = fam === 'service' ? 'booking' : 'cta';
  if (concept === 'refined') return ['hero', 'statement', content, 'highlights', 'gallery', fam === 'service' ? 'booking' : 'visit', fam === 'service' ? 'visit' : 'cta'];
  if (concept === 'bold') return ['hero', 'marquee', content, 'highlights', 'gallery', book, 'visit'];
  return ['hero', content, 'highlights', 'about', 'gallery', book, 'visit'];
}

/** Conceito recomendado por segmento (pode ser sobrescrito pela IA). */
export const RECOMMENDED: Record<string, Concept> = {
  cafe: 'refined', restaurant: 'refined', pizzeria: 'bold', bakery: 'inviting', bar: 'bold', ice_cream: 'inviting',
  barbershop: 'bold', beauty_salon: 'refined', clothing: 'refined', pet_shop: 'inviting', retail: 'inviting',
};

/* ---------- textos de direção (modelos, sem afirmações factuais) ---------- */

interface CopyBank {
  taglines: Record<Concept, string[]>; // {place} = bairro/cidade (fato)
  statement: string[];
  personality: string[];
  audience: string[]; // hipóteses
  ctaTitle: Record<Concept, string>;
}

export const COPY: Record<string, CopyBank> = {
  cafe: {
    taglines: { refined: ['Café, pausa e boa conversa{inPlace}.', 'O seu café de todo dia{inPlace}.'], bold: ['Café de verdade{inPlace}.', 'Mais café, menos pressa.'], inviting: ['Passe para um café{inPlace}.', 'Seu próximo café está aqui.'] },
    statement: ['Um lugar para desacelerar, encontrar pessoas e começar bem o dia.'],
    personality: ['acolhedor', 'artesanal', 'urbano'],
    audience: ['Moradores e quem trabalha na região (hipótese)', 'Pessoas buscando um lugar para pausa ou encontro (hipótese)'],
    ctaTitle: { refined: 'Esperamos você para um café.', bold: 'Bora tomar um café?', inviting: 'Venha tomar um café com a gente' },
  },
  restaurant: {
    taglines: { refined: ['À mesa{inPlace}.', 'Boa comida, sem pressa{inPlace}.'], bold: ['Fome de quê?', 'Comida boa{inPlace}.'], inviting: ['Sua mesa está esperando{inPlace}.', 'Almoço e jantar{inPlace}.'] },
    statement: ['Uma cozinha para reunir pessoas em volta da mesa.'],
    personality: ['caloroso', 'gastronômico', 'convidativo'],
    audience: ['Famílias e grupos de amigos (hipótese)', 'Quem trabalha na região, no almoço (hipótese)'],
    ctaTitle: { refined: 'Reserve sua mesa.', bold: 'Bateu a fome?', inviting: 'Venha nos visitar' },
  },
  pizzeria: {
    taglines: { refined: ['Pizza, do forno para a mesa{inPlace}.'], bold: ['Pizza quente{inPlace}.', 'Fatia, borda e queijo.'], inviting: ['A pizza da sua noite{inPlace}.', 'Escolha o sabor. A gente cuida do resto.'] },
    statement: ['Noite de pizza é sempre uma boa ideia.'],
    personality: ['divertido', 'quente', 'generoso'],
    audience: ['Famílias e amigos à noite (hipótese)', 'Quem pede em casa (hipótese)'],
    ctaTitle: { refined: 'Faça seu pedido.', bold: 'Bateu a fome? Peça agora.', inviting: 'Peça a sua pizza' },
  },
  bakery: {
    taglines: { refined: ['A padaria do bairro{inPlace}.'], bold: ['Saiu do forno.', 'Pão quentinho{inPlace}.'], inviting: ['Da manhã ao fim da tarde{inPlace}.', 'O cheirinho de pão do seu bairro.'] },
    statement: ['O ponto de encontro do bairro, do café da manhã ao lanche da tarde.'],
    personality: ['acolhedor', 'tradicional', 'familiar'],
    audience: ['Moradores do bairro (hipótese)', 'Quem passa a caminho do trabalho (hipótese)'],
    ctaTitle: { refined: 'Passe para nos visitar.', bold: 'Corre que acabou de sair.', inviting: 'Venha nos visitar' },
  },
  bar: {
    taglines: { refined: ['Fim de tarde{inPlace}.', 'Um brinde{inPlace}.'], bold: ['Saideira garantida.', 'Encontro marcado{inPlace}.'], inviting: ['Chama os amigos{inPlace}.'] },
    statement: ['O lugar certo para encontrar os amigos e ficar mais um pouco.'],
    personality: ['noturno', 'descontraído', 'social'],
    audience: ['Grupos de amigos após o trabalho (hipótese)'],
    ctaTitle: { refined: 'Reserve sua mesa.', bold: 'Hoje tem?', inviting: 'Chame a turma' },
  },
  ice_cream: {
    taglines: { refined: ['Sabores para o seu dia{inPlace}.'], bold: ['Tá calor?', 'Uma bola ou duas?'], inviting: ['Escolha o seu sabor{inPlace}.'] },
    statement: ['Um doce intervalo no meio do dia.'],
    personality: ['alegre', 'colorido', 'leve'],
    audience: ['Famílias e crianças (hipótese)', 'Passeio de fim de semana (hipótese)'],
    ctaTitle: { refined: 'Venha experimentar.', bold: 'Bora de sorvete?', inviting: 'Venha experimentar' },
  },
  barbershop: {
    taglines: { refined: ['Corte, barba e tempo para você{inPlace}.'], bold: ['Corte em dia.', 'Navalha, tesoura e respeito.'], inviting: ['Seu horário, do seu jeito{inPlace}.'] },
    statement: ['Hora marcada, atenção ao detalhe e um ambiente para ficar à vontade.'],
    personality: ['masculino', 'clássico', 'preciso'],
    audience: ['Homens que cuidam do visual com frequência (hipótese)'],
    ctaTitle: { refined: 'Agende seu horário.', bold: 'Marque seu horário.', inviting: 'Agende agora' },
  },
  beauty_salon: {
    taglines: { refined: ['Beleza com cuidado{inPlace}.', 'Seu momento{inPlace}.'], bold: ['Seu momento. Sua cara.'], inviting: ['Agende o seu momento{inPlace}.'] },
    statement: ['Um espaço pensado para você se sentir bem e sair renovada.'],
    personality: ['elegante', 'acolhedor', 'cuidadoso'],
    audience: ['Clientes que buscam cuidado regular (hipótese)'],
    ctaTitle: { refined: 'Agende seu horário.', bold: 'Seu momento começa aqui.', inviting: 'Agende seu atendimento' },
  },
  clothing: {
    taglines: { refined: ['Peças para o seu estilo{inPlace}.'], bold: ['Vista o que é seu.'], inviting: ['Novidades para o seu estilo{inPlace}.'] },
    statement: ['Roupas escolhidas para acompanhar o seu dia a dia com estilo.'],
    personality: ['curado', 'contemporâneo', 'elegante'],
    audience: ['Pessoas que valorizam lojas independentes (hipótese)'],
    ctaTitle: { refined: 'Visite a loja.', bold: 'Passa na loja.', inviting: 'Fale com a gente' },
  },
  pet_shop: {
    taglines: { refined: ['Cuidado para quem você ama{inPlace}.'], bold: ['Seu pet merece.'], inviting: ['Carinho e cuidado para o seu pet{inPlace}.'] },
    statement: ['Cuidado de perto para o seu melhor amigo.'],
    personality: ['carinhoso', 'alegre', 'confiável'],
    audience: ['Tutores de cães e gatos da região (hipótese)'],
    ctaTitle: { refined: 'Fale com a gente.', bold: 'Traga seu pet.', inviting: 'Agende pelo WhatsApp' },
  },
  retail: {
    taglines: { refined: ['No seu bairro{inPlace}.'], bold: ['Tem aqui.'], inviting: ['Atendimento de perto{inPlace}.'] },
    statement: ['Atendimento próximo, do jeito que só o comércio do bairro oferece.'],
    personality: ['próximo', 'prático', 'confiável'],
    audience: ['Moradores da região (hipótese)'],
    ctaTitle: { refined: 'Venha nos visitar.', bold: 'Passa aqui.', inviting: 'Fale com a gente' },
  },
};

export function fill(t: string, place?: string) {
  return t.replace('{inPlace}', place ? ` em ${place}` : '').replace('{place}', place ?? '');
}

function hashStr(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export interface Direction {
  concept: Concept;
  recommended: Concept;
  rationale: string;
  personality: string[];
  audience: { text: string; basis: 'hipótese' | 'indício' }[];
  visualNotes: string[];
  photoNote?: string;
  plan: string[];
}

/** Briefing criativo determinístico (a IA, se configurada, pode refinar). */
export function buildDirection(input: {
  segment: string;
  segmentLabel: string;
  name: string;
  concept?: Concept;
  amenities?: string[];
  hasPhotos: boolean;
  hasLogo: boolean;
  hasMenu: boolean;
}): Direction {
  const bank = COPY[input.segment] ?? COPY.retail!;
  const recommended = RECOMMENDED[input.segment] ?? 'inviting';
  const concept = input.concept ?? recommended;
  const audience: Direction['audience'] = bank.audience.map((t) => ({ text: t.replace(' (hipótese)', ''), basis: 'hipótese' as const }));
  const a = (input.amenities ?? []).map((x) => x.toLowerCase());
  if (a.some((x) => x.includes('wi-fi'))) audience.push({ text: 'Pessoas que trabalham remotamente', basis: 'indício' });
  if (a.some((x) => x.includes('delivery'))) audience.push({ text: 'Clientes que pedem em casa', basis: 'indício' });
  if (a.some((x) => x.includes('pet'))) audience.push({ text: 'Tutores que saem com seus pets', basis: 'indício' });
  if (a.some((x) => x.includes('vegan') || x.includes('vegetar'))) audience.push({ text: 'Público vegano/vegetariano', basis: 'indício' });
  const label = CONCEPTS.find((c) => c.id === concept)!.label;
  const notes: Record<Concept, string[]> = {
    refined: ['Serifa elegante em tamanho grande, texto curto e muito respiro.', 'Arte gráfica em painel lateral, linhas finas e legendas em caixa-alta.', 'Cardápio/serviços apresentados como lista editorial.'],
    bold: ['Nome em tipografia gigante condensada ocupando a largura da tela.', 'Blocos de cor da marca, letreiro animado com dados reais e selo giratório.', 'Itens em linhas grandes e numeradas, preços em destaque.'],
    inviting: ['Frase convidativa como título e o nome como marca.', 'Produtos/serviços reais já na primeira tela, em cartões.', 'Botões de ação grandes e barra fixa de contato no celular.'],
  };
  return {
    concept,
    recommended,
    rationale: `${label} combina com ${input.segmentLabel.toLowerCase()}: transmite ${bank.personality.join(', ')}. ${
      concept !== recommended ? `(Conceito recomendado para o segmento: ${CONCEPTS.find((c) => c.id === recommended)!.label}.)` : ''
    }`.trim(),
    personality: bank.personality,
    audience,
    visualNotes: notes[concept],
    photoNote: input.hasPhotos
      ? undefined
      : 'Sem fotos autorizadas: a composição usa arte gráfica gerada a partir das cores e do segmento — nunca fotos genéricas apresentadas como do local. Para elevar o impacto, envie de 3 a 6 fotos autorizadas (fachada, ambiente e produtos).',
    plan: sectionPlan(concept, familyOf(input.segment)),
  };
}

export function pickTagline(segment: string, concept: Concept, name: string, place?: string) {
  const bank = COPY[segment] ?? COPY.retail!;
  const list = bank.taglines[concept];
  return fill(list[hashStr(name) % list.length]!, place);
}
