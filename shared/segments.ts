// Perfis de segmento: definem como buscar, o que investigar e como desenhar
// o site para cada tipo de negócio. Adicionar um segmento = adicionar um perfil.

import type { MissingItem } from './types.ts';

export type ContentKind = 'menu' | 'services' | 'products';

export interface ThemePreset {
  name: string;
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
}

export interface SegmentProfile {
  id: string;
  label: string;
  plural: string;
  /** Filtros Overpass QL (cada um vira uma consulta nwr unida). */
  osmFilters: string[];
  contentKind: ContentKind;
  /** Ordem padrão das seções do site. */
  sections: string[];
  presets: ThemePreset[];
  /** Fatos que a investigação deve buscar; os faltantes viram pendências. */
  checklist: MissingItem[];
  ctaPrimary: 'whatsapp' | 'phone' | 'booking' | 'directions' | 'menu';
  /** Peso de aderência comercial (0-10) usado no score, critério explicado na UI. */
  fitWeight: number;
  /** Vocabulário para textos de modelo (sem afirmações factuais). */
  copy: {
    noun: string; // "cafeteria"
    contentTitle: string; // "Cardápio"
    heroSub: string; // frase genérica sem fatos
    aboutTitle: string;
    ctaTitle: string;
  };
}

const commonFood: MissingItem[] = [
  { field: 'phone', label: 'Telefone', importance: 'essential', hint: 'Telefone comercial para contato e botão de ligar.' },
  { field: 'opening_hours', label: 'Horário de funcionamento', importance: 'essential', hint: 'Dias e horários de atendimento.' },
  { field: 'menu', label: 'Cardápio', importance: 'essential', hint: 'Itens, descrições e preços divulgados pelo estabelecimento.' },
  { field: 'photos', label: 'Fotos autorizadas', importance: 'recommended', hint: 'Fotos do ambiente e dos produtos com autorização de uso.' },
  { field: 'logo', label: 'Logotipo', importance: 'recommended', hint: 'Logotipo em boa resolução, com autorização de uso.' },
  { field: 'description', label: 'Descrição do negócio', importance: 'recommended', hint: 'História, proposta e diferenciais informados pelo dono.' },
  { field: 'whatsapp', label: 'WhatsApp comercial', importance: 'recommended', hint: 'Número de WhatsApp confirmado para pedidos/reservas.' },
];

const commonServices: MissingItem[] = [
  { field: 'phone', label: 'Telefone', importance: 'essential', hint: 'Telefone comercial para contato.' },
  { field: 'opening_hours', label: 'Horário de funcionamento', importance: 'essential', hint: 'Dias e horários de atendimento.' },
  { field: 'services', label: 'Serviços e preços', importance: 'essential', hint: 'Lista de serviços oferecidos, com duração e preço se divulgados.' },
  { field: 'photos', label: 'Fotos autorizadas', importance: 'recommended', hint: 'Fotos do espaço e de trabalhos com autorização de uso.' },
  { field: 'logo', label: 'Logotipo', importance: 'recommended', hint: 'Logotipo com autorização de uso.' },
  { field: 'description', label: 'Descrição e diferenciais', importance: 'recommended', hint: 'Diferenciais informados pelo estabelecimento.' },
  { field: 'whatsapp', label: 'WhatsApp comercial', importance: 'recommended', hint: 'Número confirmado para agendamentos.' },
];

const commonRetail: MissingItem[] = [
  { field: 'phone', label: 'Telefone', importance: 'essential', hint: 'Telefone comercial.' },
  { field: 'opening_hours', label: 'Horário de funcionamento', importance: 'essential', hint: 'Dias e horários de atendimento.' },
  { field: 'products', label: 'Produtos em destaque', importance: 'essential', hint: 'Produtos/categorias vendidos, com preços se divulgados.' },
  { field: 'photos', label: 'Fotos autorizadas', importance: 'recommended', hint: 'Fotos da loja e produtos com autorização de uso.' },
  { field: 'logo', label: 'Logotipo', importance: 'recommended', hint: 'Logotipo com autorização de uso.' },
  { field: 'description', label: 'Descrição do negócio', importance: 'recommended', hint: 'Proposta e diferenciais informados pelo dono.' },
  { field: 'whatsapp', label: 'WhatsApp comercial', importance: 'recommended', hint: 'Número confirmado para vendas.' },
];

const foodSections = ['hero', 'highlights', 'about', 'menu', 'gallery', 'hours', 'contact', 'cta'];
const serviceSections = ['hero', 'services', 'highlights', 'about', 'gallery', 'booking', 'hours', 'contact'];
const retailSections = ['hero', 'products', 'about', 'highlights', 'gallery', 'hours', 'contact', 'cta'];

export const SEGMENTS: SegmentProfile[] = [
  {
    id: 'cafe',
    label: 'Cafeteria',
    plural: 'Cafeterias',
    osmFilters: ['["amenity"="cafe"]'],
    contentKind: 'menu',
    sections: foodSections,
    fitWeight: 9,
    ctaPrimary: 'directions',
    checklist: commonFood,
    copy: {
      noun: 'cafeteria',
      contentTitle: 'Cardápio',
      heroSub: 'Uma pausa para o café no seu dia.',
      aboutTitle: 'Sobre a casa',
      ctaTitle: 'Venha tomar um café',
    },
    presets: [
      { name: 'Torra média', primary: '#6F4E37', secondary: '#C8A27C', accent: '#D9822B', background: '#FBF7F2', surface: '#FFFFFF', text: '#2B1E16', muted: '#7A6A5E', headingFont: 'Fraunces', bodyFont: 'Inter', radius: 14, heroStyle: 'split' },
      { name: 'Espresso', primary: '#1F1A17', secondary: '#B08968', accent: '#E6B17E', background: '#F4EFEA', surface: '#FFFFFF', text: '#1F1A17', muted: '#6E625A', headingFont: 'DM Serif Display', bodyFont: 'DM Sans', radius: 6, heroStyle: 'editorial' },
      { name: 'Matcha', primary: '#3E5641', secondary: '#A9B388', accent: '#D4A373', background: '#F7F5EF', surface: '#FFFFFF', text: '#20291F', muted: '#66705F', headingFont: 'Lora', bodyFont: 'Nunito Sans', radius: 20, heroStyle: 'centered' },
    ],
  },
  {
    id: 'restaurant',
    label: 'Restaurante',
    plural: 'Restaurantes',
    osmFilters: ['["amenity"="restaurant"]'],
    contentKind: 'menu',
    sections: foodSections,
    fitWeight: 9,
    ctaPrimary: 'phone',
    checklist: commonFood,
    copy: {
      noun: 'restaurante',
      contentTitle: 'Cardápio',
      heroSub: 'Uma mesa esperando por você.',
      aboutTitle: 'Nossa cozinha',
      ctaTitle: 'Reserve sua mesa',
    },
    presets: [
      { name: 'Bistrô', primary: '#2F4B3A', secondary: '#C9A227', accent: '#B5543C', background: '#FAF8F3', surface: '#FFFFFF', text: '#1D2A22', muted: '#66705F', headingFont: 'Cormorant Garamond', bodyFont: 'Inter', radius: 4, heroStyle: 'editorial' },
      { name: 'Terracota', primary: '#A0452E', secondary: '#E9C46A', accent: '#264653', background: '#FCF6EF', surface: '#FFFFFF', text: '#2A1A14', muted: '#7D675C', headingFont: 'Playfair Display', bodyFont: 'Source Sans 3', radius: 12, heroStyle: 'split' },
      { name: 'Contemporâneo', primary: '#111827', secondary: '#D1B48C', accent: '#C2410C', background: '#F9FAFB', surface: '#FFFFFF', text: '#111827', muted: '#6B7280', headingFont: 'Archivo', bodyFont: 'Inter', radius: 8, heroStyle: 'banner' },
    ],
  },
  {
    id: 'pizzeria',
    label: 'Pizzaria',
    plural: 'Pizzarias',
    osmFilters: ['["amenity"~"^(restaurant|fast_food)$"]["cuisine"~"pizza"]', '["amenity"~"^(restaurant|fast_food)$"]["name"~"pizz",i]'],
    contentKind: 'menu',
    sections: ['hero', 'menu', 'highlights', 'about', 'gallery', 'hours', 'contact', 'cta'],
    fitWeight: 10,
    ctaPrimary: 'whatsapp',
    checklist: commonFood,
    copy: {
      noun: 'pizzaria',
      contentTitle: 'Nossas pizzas',
      heroSub: 'Escolha seu sabor favorito e peça a sua.',
      aboutTitle: 'Sobre a pizzaria',
      ctaTitle: 'Bateu a fome?',
    },
    presets: [
      { name: 'Forno a lenha', primary: '#B91C1C', secondary: '#F59E0B', accent: '#15803D', background: '#FFF8F0', surface: '#FFFFFF', text: '#1F1300', muted: '#7C6A55', headingFont: 'Oswald', bodyFont: 'Inter', radius: 12, heroStyle: 'banner' },
      { name: 'Napoletana', primary: '#1F2937', secondary: '#DC2626', accent: '#16A34A', background: '#FAF7F2', surface: '#FFFFFF', text: '#111827', muted: '#6B7280', headingFont: 'Bebas Neue', bodyFont: 'DM Sans', radius: 6, heroStyle: 'split' },
    ],
  },
  {
    id: 'bakery',
    label: 'Padaria',
    plural: 'Padarias',
    osmFilters: ['["shop"="bakery"]', '["shop"="pastry"]'],
    contentKind: 'menu',
    sections: foodSections,
    fitWeight: 8,
    ctaPrimary: 'directions',
    checklist: commonFood,
    copy: {
      noun: 'padaria',
      contentTitle: 'Produtos',
      heroSub: 'A padaria do seu bairro.',
      aboutTitle: 'Sobre a padaria',
      ctaTitle: 'Passe para nos visitar',
    },
    presets: [
      { name: 'Trigo', primary: '#9C6644', secondary: '#E6CCB2', accent: '#7F5539', background: '#FDF8F1', surface: '#FFFFFF', text: '#3A2618', muted: '#80695A', headingFont: 'Fraunces', bodyFont: 'Nunito Sans', radius: 18, heroStyle: 'centered' },
      { name: 'Confeitaria', primary: '#8E3B46', secondary: '#F4C7C3', accent: '#E0A458', background: '#FFF9F7', surface: '#FFFFFF', text: '#3B1F24', muted: '#85676C', headingFont: 'Playfair Display', bodyFont: 'Nunito Sans', radius: 16, heroStyle: 'split' },
    ],
  },
  {
    id: 'bar',
    label: 'Bar',
    plural: 'Bares',
    osmFilters: ['["amenity"~"^(bar|pub|biergarten)$"]'],
    contentKind: 'menu',
    sections: foodSections,
    fitWeight: 7,
    ctaPrimary: 'directions',
    checklist: commonFood,
    copy: {
      noun: 'bar',
      contentTitle: 'Cardápio',
      heroSub: 'Um bom lugar para encontrar os amigos.',
      aboutTitle: 'Sobre o bar',
      ctaTitle: 'Te esperamos por aqui',
    },
    presets: [
      { name: 'Âmbar', primary: '#F59E0B', secondary: '#78350F', accent: '#FCD34D', background: '#14110F', surface: '#1F1A17', text: '#F5EFE6', muted: '#BBAA96', headingFont: 'Bebas Neue', bodyFont: 'Inter', radius: 8, heroStyle: 'banner' },
      { name: 'Boteco', primary: '#065F46', secondary: '#FBBF24', accent: '#DC2626', background: '#FFFBEB', surface: '#FFFFFF', text: '#1C1917', muted: '#78716C', headingFont: 'Oswald', bodyFont: 'DM Sans', radius: 10, heroStyle: 'split' },
    ],
  },
  {
    id: 'ice_cream',
    label: 'Sorveteria',
    plural: 'Sorveterias',
    osmFilters: ['["amenity"="ice_cream"]', '["shop"="ice_cream"]'],
    contentKind: 'menu',
    sections: foodSections,
    fitWeight: 7,
    ctaPrimary: 'directions',
    checklist: commonFood,
    copy: {
      noun: 'sorveteria',
      contentTitle: 'Sabores',
      heroSub: 'Sabores para refrescar o seu dia.',
      aboutTitle: 'Sobre a sorveteria',
      ctaTitle: 'Venha experimentar',
    },
    presets: [
      { name: 'Pastel', primary: '#DB2777', secondary: '#99F6E4', accent: '#FDE68A', background: '#FFF7FB', surface: '#FFFFFF', text: '#3B0A24', muted: '#8C6077', headingFont: 'Fredoka', bodyFont: 'Nunito', radius: 24, heroStyle: 'centered' },
    ],
  },
  {
    id: 'barbershop',
    label: 'Barbearia',
    plural: 'Barbearias',
    osmFilters: ['["shop"="hairdresser"]["hairdresser"~"barber"]', '["shop"="hairdresser"]["male"="yes"]', '["shop"="hairdresser"]["name"~"barb",i]'],
    contentKind: 'services',
    sections: serviceSections,
    fitWeight: 10,
    ctaPrimary: 'booking',
    checklist: commonServices,
    copy: {
      noun: 'barbearia',
      contentTitle: 'Serviços',
      heroSub: 'Corte, barba e cuidado com hora marcada.',
      aboutTitle: 'Sobre a barbearia',
      ctaTitle: 'Agende seu horário',
    },
    presets: [
      { name: 'Clássica', primary: '#C9A227', secondary: '#1C1C1C', accent: '#B91C1C', background: '#111111', surface: '#1A1A1A', text: '#F2EEE6', muted: '#A39E93', headingFont: 'Oswald', bodyFont: 'Inter', radius: 2, heroStyle: 'banner' },
      { name: 'Navy', primary: '#1E3A5F', secondary: '#D4A373', accent: '#E76F51', background: '#F5F3EF', surface: '#FFFFFF', text: '#14213D', muted: '#5C677D', headingFont: 'Bebas Neue', bodyFont: 'DM Sans', radius: 4, heroStyle: 'split' },
    ],
  },
  {
    id: 'beauty_salon',
    label: 'Salão de beleza',
    plural: 'Salões de beleza',
    osmFilters: ['["shop"="hairdresser"]', '["shop"="beauty"]'],
    contentKind: 'services',
    sections: serviceSections,
    fitWeight: 9,
    ctaPrimary: 'booking',
    checklist: commonServices,
    copy: {
      noun: 'salão de beleza',
      contentTitle: 'Serviços',
      heroSub: 'Cuidado, beleza e atendimento personalizado.',
      aboutTitle: 'Sobre o salão',
      ctaTitle: 'Agende seu atendimento',
    },
    presets: [
      { name: 'Blush', primary: '#9D4E68', secondary: '#F2D7D9', accent: '#C9A86A', background: '#FFFAF9', surface: '#FFFFFF', text: '#3A2028', muted: '#8B6B74', headingFont: 'Cormorant Garamond', bodyFont: 'Montserrat', radius: 18, heroStyle: 'editorial' },
      { name: 'Sálvia', primary: '#4A5D4F', secondary: '#E3D5CA', accent: '#B07D62', background: '#FAF8F5', surface: '#FFFFFF', text: '#232B25', muted: '#6E776F', headingFont: 'Playfair Display', bodyFont: 'Montserrat', radius: 24, heroStyle: 'centered' },
    ],
  },
  {
    id: 'clothing',
    label: 'Loja de roupas',
    plural: 'Lojas de roupas',
    osmFilters: ['["shop"="clothes"]', '["shop"="boutique"]'],
    contentKind: 'products',
    sections: retailSections,
    fitWeight: 7,
    ctaPrimary: 'whatsapp',
    checklist: commonRetail,
    copy: {
      noun: 'loja',
      contentTitle: 'Destaques',
      heroSub: 'Peças selecionadas para o seu estilo.',
      aboutTitle: 'Sobre a loja',
      ctaTitle: 'Visite a loja',
    },
    presets: [
      { name: 'Minimal', primary: '#111111', secondary: '#E5E5E5', accent: '#A16207', background: '#FFFFFF', surface: '#F7F7F7', text: '#111111', muted: '#737373', headingFont: 'Space Grotesk', bodyFont: 'Inter', radius: 0, heroStyle: 'editorial' },
      { name: 'Atelier', primary: '#5B3A29', secondary: '#E8DCCB', accent: '#2F4858', background: '#FBF8F3', surface: '#FFFFFF', text: '#2A1F18', muted: '#7B6D62', headingFont: 'Cormorant Garamond', bodyFont: 'Inter', radius: 2, heroStyle: 'split' },
    ],
  },
  {
    id: 'pet_shop',
    label: 'Pet shop',
    plural: 'Pet shops',
    osmFilters: ['["shop"="pet"]', '["shop"="pet_grooming"]'],
    contentKind: 'services',
    sections: ['hero', 'services', 'products', 'highlights', 'about', 'gallery', 'hours', 'contact'],
    fitWeight: 8,
    ctaPrimary: 'whatsapp',
    checklist: [
      ...commonServices.filter((c) => c.field !== 'services'),
      { field: 'services', label: 'Serviços (banho, tosa...)', importance: 'essential', hint: 'Serviços oferecidos e preços se divulgados.' },
      { field: 'products', label: 'Produtos', importance: 'recommended', hint: 'Categorias de produtos vendidos.' },
    ],
    copy: {
      noun: 'pet shop',
      contentTitle: 'Serviços',
      heroSub: 'Cuidado e carinho para o seu melhor amigo.',
      aboutTitle: 'Sobre nós',
      ctaTitle: 'Fale com a gente',
    },
    presets: [
      { name: 'Playful', primary: '#0F766E', secondary: '#FDE68A', accent: '#F97316', background: '#F7FBFA', surface: '#FFFFFF', text: '#0B2B28', muted: '#5E7773', headingFont: 'Fredoka', bodyFont: 'Nunito', radius: 22, heroStyle: 'split' },
      { name: 'Lavanda', primary: '#5B4B8A', secondary: '#C7F9CC', accent: '#FF8C61', background: '#FAF9FF', surface: '#FFFFFF', text: '#1F1A33', muted: '#6E6887', headingFont: 'Poppins', bodyFont: 'Nunito', radius: 18, heroStyle: 'centered' },
    ],
  },
  {
    id: 'retail',
    label: 'Comércio local',
    plural: 'Comércios locais',
    osmFilters: ['["shop"~"^(florist|gift|optician|stationery|shoes|jewelry|cosmetics|books|toys|sports|furniture|hardware|deli|greengrocer|butcher|convenience)$"]'],
    contentKind: 'products',
    sections: retailSections,
    fitWeight: 6,
    ctaPrimary: 'whatsapp',
    checklist: commonRetail,
    copy: {
      noun: 'loja',
      contentTitle: 'Produtos',
      heroSub: 'Atendimento de perto, no seu bairro.',
      aboutTitle: 'Sobre a loja',
      ctaTitle: 'Venha nos visitar',
    },
    presets: [
      { name: 'Oceano', primary: '#1D4ED8', secondary: '#DBEAFE', accent: '#F59E0B', background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A', muted: '#64748B', headingFont: 'Poppins', bodyFont: 'Inter', radius: 12, heroStyle: 'split' },
      { name: 'Floresta', primary: '#166534', secondary: '#DCFCE7', accent: '#CA8A04', background: '#F9FBF7', surface: '#FFFFFF', text: '#14251A', muted: '#617166', headingFont: 'DM Serif Display', bodyFont: 'DM Sans', radius: 10, heroStyle: 'centered' },
    ],
  },
];

export const GENERIC_SEGMENT = SEGMENTS.find((s) => s.id === 'retail')!;

export function getSegment(id: string | undefined): SegmentProfile {
  return SEGMENTS.find((s) => s.id === id) ?? GENERIC_SEGMENT;
}

/** Classifica um elemento OSM no segmento mais específico. */
export function classifyOsm(tags: Record<string, string>): string {
  const name = (tags.name ?? '').toLowerCase();
  const amenity = tags.amenity;
  const shop = tags.shop;
  const cuisine = (tags.cuisine ?? '').toLowerCase();
  if ((amenity === 'restaurant' || amenity === 'fast_food') && (cuisine.includes('pizza') || name.includes('pizz'))) return 'pizzeria';
  if (amenity === 'cafe') return 'cafe';
  if (amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'food_court') return 'restaurant';
  if (amenity === 'bar' || amenity === 'pub' || amenity === 'biergarten') return 'bar';
  if (amenity === 'ice_cream' || shop === 'ice_cream') return 'ice_cream';
  if (shop === 'bakery' || shop === 'pastry') return 'bakery';
  if (shop === 'hairdresser') {
    if ((tags.hairdresser ?? '').includes('barber') || tags.male === 'yes' || name.includes('barb')) return 'barbershop';
    return 'beauty_salon';
  }
  if (shop === 'beauty') return 'beauty_salon';
  if (shop === 'clothes' || shop === 'boutique') return 'clothing';
  if (shop === 'pet' || shop === 'pet_grooming') return 'pet_shop';
  return 'retail';
}

/** Tags OSM que viram "destaques" verificáveis no site (nunca inventados). */
export const OSM_HIGHLIGHTS: { tag: string; values: string[]; label: string; text: string }[] = [
  { tag: 'internet_access', values: ['wlan', 'yes', 'wifi'], label: 'Wi-Fi', text: 'Acesso à internet sem fio no local.' },
  { tag: 'outdoor_seating', values: ['yes'], label: 'Mesas ao ar livre', text: 'Espaço com mesas na área externa.' },
  { tag: 'wheelchair', values: ['yes'], label: 'Acessível', text: 'Acesso para cadeira de rodas.' },
  { tag: 'delivery', values: ['yes'], label: 'Delivery', text: 'Entrega disponível.' },
  { tag: 'takeaway', values: ['yes', 'only'], label: 'Para viagem', text: 'Pedidos para levar.' },
  { tag: 'diet:vegan', values: ['yes', 'only'], label: 'Opções veganas', text: 'Opções veganas no cardápio.' },
  { tag: 'diet:vegetarian', values: ['yes', 'only'], label: 'Opções vegetarianas', text: 'Opções vegetarianas no cardápio.' },
  { tag: 'diet:gluten_free', values: ['yes', 'only'], label: 'Sem glúten', text: 'Opções sem glúten.' },
  { tag: 'reservation', values: ['yes', 'recommended', 'required'], label: 'Reservas', text: 'Aceita reservas.' },
  { tag: 'air_conditioning', values: ['yes'], label: 'Ambiente climatizado', text: 'Ar-condicionado no local.' },
  { tag: 'payment:pix', values: ['yes'], label: 'Aceita Pix', text: 'Pagamento via Pix.' },
  { tag: 'payment:credit_cards', values: ['yes'], label: 'Cartões de crédito', text: 'Aceita cartões de crédito.' },
  { tag: 'dog', values: ['yes', 'leashed'], label: 'Pet friendly', text: 'Animais de estimação são bem-vindos.' },
  { tag: 'changing_table', values: ['yes'], label: 'Fraldário', text: 'Trocador disponível.' },
];

/** Tradução dos valores de culinária mais comuns do OSM. */
export const CUISINE_PT: Record<string, string> = {
  coffee_shop: 'Cafés', cafe: 'Cafés', pizza: 'Pizza', italian: 'Italiana', japanese: 'Japonesa', sushi: 'Sushi', brazilian: 'Brasileira',
  regional: 'Regional', burger: 'Hambúrguer', bakery: 'Padaria', arab: 'Árabe', lebanese: 'Libanesa', chinese: 'Chinesa', mexican: 'Mexicana',
  vegetarian: 'Vegetariana', vegan: 'Vegana', french: 'Francesa', portuguese: 'Portuguesa', steak_house: 'Churrascaria', barbecue: 'Churrasco',
  seafood: 'Frutos do mar', korean: 'Coreana', thai: 'Tailandesa', indian: 'Indiana', peruvian: 'Peruana', ice_cream: 'Sorvetes',
  sandwich: 'Sanduíches', juice: 'Sucos', cake: 'Bolos', dessert: 'Sobremesas', crepe: 'Crepes', pastel: 'Pastel', breakfast: 'Café da manhã',
  tea: 'Chás', bubble_tea: 'Bubble tea', chicken: 'Frango', international: 'Internacional', mediterranean: 'Mediterrânea', greek: 'Grega',
  spanish: 'Espanhola', german: 'Alemã', healthy: 'Saudável', bagel: 'Bagels', donut: 'Donuts', acai: 'Açaí', pub: 'Petiscos',
};
export const cuisineLabel = (v: string) => CUISINE_PT[v.trim().toLowerCase()] ?? v.trim().replace(/_/g, ' ');
