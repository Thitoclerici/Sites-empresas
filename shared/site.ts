// Documento do site: estrutura JSON editável que é renderizada para HTML.
// O editor manipula esse documento; o renderizador (render.ts) o transforma
// em HTML estático, usado na prévia, na exportação e (Fase 2) na publicação.

export type Origin = 'fact' | 'user' | 'ai' | 'template';

export const ORIGIN_LABEL: Record<Origin, string> = {
  fact: 'Dado verificado',
  user: 'Editado por você',
  ai: 'Texto gerado por IA — revisar',
  template: 'Texto modelo — revisar',
};

export interface Theme {
  presetName?: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
  radius: number;
  heroStyle: 'split' | 'centered' | 'banner' | 'editorial';
  /** Conceito visual (direção de arte). Ausente em sites antigos. */
  concept?: 'refined' | 'bold' | 'inviting';
  /** Fundo escuro (bar, barbearia nos conceitos refinado/impactante). */
  dark?: boolean;
}

export interface Item {
  name: string;
  description?: string;
  price?: string;
  extra?: string; // duração, tamanho etc.
  image?: string; // asset id
}

export interface ItemGroup {
  name: string;
  items: Item[];
}

export interface Section {
  id: string;
  type: string;
  visible: boolean;
  variant?: number;
  props: Record<string, any>;
  /** Origem de cada campo de texto (props key -> origin). */
  origins: Record<string, Origin>;
  /** Informações que faltam para esta seção (exibidas como pendências). */
  pending: string[];
}

export interface SiteSpec {
  version: 1;
  businessName: string;
  segment: string;
  lang: 'pt-BR';
  theme: Theme;
  logo?: string; // asset id
  seo: { title: string; description: string; keywords?: string };
  nav: { label: string; target: string }[];
  sections: Section[];
  business: {
    phone?: string;
    whatsapp?: string;
    email?: string;
    address?: string;
    /** Bairro (ou cidade) do endereço real, usado em legendas e selos. */
    area?: string;
    lat?: number;
    lon?: number;
    socials: Record<string, string>;
    openingHoursRaw?: string;
  };
  meta: {
    generatedAt: string;
    generator: 'ai' | 'template';
    model?: string;
    /** Briefing criativo usado na geração (hipóteses de público marcadas como tal). */
    direction?: import('./design.ts').Direction;
    /** O operador já escolheu a direção visual no Estúdio. */
    conceptChosen?: boolean;
  };
}

export type FieldType = 'text' | 'textarea' | 'url' | 'image' | 'images' | 'file' | 'groups' | 'items' | 'rows' | 'highlights' | 'toggle' | 'lines';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
}

export interface SectionDef {
  type: string;
  label: string;
  description: string;
  fields: FieldDef[];
  variants: number;
}

export const SECTION_DEFS: SectionDef[] = [
  {
    type: 'marquee',
    label: 'Letreiro',
    description: 'Faixa animada com informações reais do negócio (segmento, bairro, comodidades).',
    variants: 1,
    fields: [{ key: 'items', label: 'Frases (uma por linha)', type: 'lines' }],
  },
  {
    type: 'statement',
    label: 'Manifesto',
    description: 'Frase de apresentação em destaque, com tipografia grande.',
    variants: 1,
    fields: [
      { key: 'label', label: 'Rótulo', type: 'text' },
      { key: 'text', label: 'Texto em destaque', type: 'textarea' },
      { key: 'image', label: 'Imagem (opcional)', type: 'image' },
    ],
  },
  {
    type: 'visit',
    label: 'Visite-nos (endereço, horário e mapa)',
    description: 'Endereço, horários, contatos e mapa num só bloco.',
    variants: 1,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'text', label: 'Texto', type: 'textarea' },
      { key: 'rows', label: 'Horários', type: 'rows' },
      { key: 'showMap', label: 'Exibir mapa (OpenStreetMap)', type: 'toggle' },
    ],
  },
  {
    type: 'hero',
    label: 'Abertura (Hero)',
    description: 'Primeira dobra: marca, chamada principal e botão de ação.',
    variants: 4,
    fields: [
      { key: 'eyebrow', label: 'Texto acima do título', type: 'text' },
      { key: 'headline', label: 'Título principal', type: 'text' },
      { key: 'subheadline', label: 'Subtítulo', type: 'textarea' },
      { key: 'ctaLabel', label: 'Botão principal — texto', type: 'text' },
      { key: 'ctaHref', label: 'Botão principal — link', type: 'url' },
      { key: 'secondaryLabel', label: 'Botão secundário — texto', type: 'text' },
      { key: 'secondaryHref', label: 'Botão secundário — link', type: 'url' },
      { key: 'image', label: 'Imagem de destaque', type: 'image', help: 'Apenas imagens com uso autorizado.' },
    ],
  },
  {
    type: 'highlights',
    label: 'Destaques',
    description: 'Comodidades e diferenciais (vindos de dados verificados ou informados por você).',
    variants: 2,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'items', label: 'Destaques', type: 'highlights' },
    ],
  },
  {
    type: 'about',
    label: 'Sobre',
    description: 'Apresentação do negócio.',
    variants: 2,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'text', label: 'Texto', type: 'textarea' },
      { key: 'image', label: 'Imagem', type: 'image' },
    ],
  },
  {
    type: 'menu',
    label: 'Cardápio',
    description: 'Categorias, itens, descrições e preços.',
    variants: 2,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'intro', label: 'Introdução', type: 'textarea' },
      { key: 'groups', label: 'Categorias e itens', type: 'groups' },
      { key: 'note', label: 'Observação (ex.: preços sujeitos a alteração)', type: 'text' },
      { key: 'menuLink', label: 'Link do cardápio completo (opcional)', type: 'url', help: 'Ex.: cardápio digital, PDF on-line.' },
      { key: 'menuFile', label: 'Arquivo do cardápio (PDF ou imagem)', type: 'file', help: 'Envie na página de Investigação. Só arquivos com uso autorizado.' },
    ],
  },
  {
    type: 'services',
    label: 'Serviços',
    description: 'Serviços oferecidos, duração e preços.',
    variants: 2,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'intro', label: 'Introdução', type: 'textarea' },
      { key: 'items', label: 'Serviços', type: 'items' },
      { key: 'menuLink', label: 'Link do tabela de preços (opcional)', type: 'url', help: 'Ex.: cardápio digital, PDF on-line.' },
      { key: 'menuFile', label: 'Arquivo da tabela de preços (PDF ou imagem)', type: 'file', help: 'Envie na página de Investigação. Só arquivos com uso autorizado.' },
    ],
  },
  {
    type: 'products',
    label: 'Produtos',
    description: 'Produtos ou categorias em destaque.',
    variants: 2,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'intro', label: 'Introdução', type: 'textarea' },
      { key: 'items', label: 'Produtos', type: 'items' },
      { key: 'menuLink', label: 'Link do catálogo (opcional)', type: 'url', help: 'Ex.: cardápio digital, PDF on-line.' },
      { key: 'menuFile', label: 'Arquivo do catálogo (PDF ou imagem)', type: 'file', help: 'Envie na página de Investigação. Só arquivos com uso autorizado.' },
    ],
  },
  {
    type: 'gallery',
    label: 'Galeria',
    description: 'Fotos autorizadas do estabelecimento.',
    variants: 2,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'images', label: 'Fotos', type: 'images', help: 'Apenas fotos com uso autorizado.' },
    ],
  },
  {
    type: 'booking',
    label: 'Agendamento',
    description: 'Chamada para agendar (preparado para integração futura com agenda).',
    variants: 1,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'text', label: 'Texto', type: 'textarea' },
      { key: 'buttonLabel', label: 'Botão — texto', type: 'text' },
      { key: 'buttonHref', label: 'Botão — link', type: 'url', help: 'Link do WhatsApp ou do sistema de agendamento.' },
    ],
  },
  {
    type: 'hours',
    label: 'Horários',
    description: 'Horário de funcionamento.',
    variants: 1,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'rows', label: 'Horários', type: 'rows' },
      { key: 'note', label: 'Observação', type: 'text' },
    ],
  },
  {
    type: 'contact',
    label: 'Contato e localização',
    description: 'Endereço, mapa, telefone e redes sociais.',
    variants: 1,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'text', label: 'Texto', type: 'textarea' },
      { key: 'showMap', label: 'Exibir mapa (OpenStreetMap)', type: 'toggle' },
    ],
  },
  {
    type: 'cta',
    label: 'Chamada final',
    description: 'Faixa de conversão antes do rodapé.',
    variants: 1,
    fields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'text', label: 'Texto', type: 'textarea' },
      { key: 'buttonLabel', label: 'Botão — texto', type: 'text' },
      { key: 'buttonHref', label: 'Botão — link', type: 'url' },
    ],
  },
];

export function getSectionDef(type: string): SectionDef | undefined {
  return SECTION_DEFS.find((d) => d.type === type);
}

export const FONT_CHOICES = [
  'Anton', 'Syne', 'Bricolage Grotesque', 'Manrope', 'Archivo',
  'Inter', 'DM Sans', 'Nunito', 'Nunito Sans', 'Montserrat', 'Poppins', 'Source Sans 3', 'Space Grotesk', 'Archivo',
  'Fraunces', 'Playfair Display', 'DM Serif Display', 'Cormorant Garamond', 'Lora', 'Oswald', 'Bebas Neue', 'Fredoka',
];

export function waLink(num?: string, text?: string): string | undefined {
  if (!num) return undefined;
  const digits = num.replace(/\D/g, '');
  if (digits.length < 10) return undefined;
  const full = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function telLink(num?: string): string | undefined {
  if (!num) return undefined;
  const digits = num.replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : undefined;
}
