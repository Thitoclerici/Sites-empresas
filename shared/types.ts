// Tipos de domínio compartilhados entre servidor e interface.

/**
 * Status de confiabilidade de uma informação. Regra central do produto:
 * nada é apresentado como verdadeiro sem fonte.
 *  - verified:      obtido de fonte pública identificada (OSM, Google, site oficial)
 *  - unconfirmed:   indício encontrado, mas precisa de confirmação humana
 *  - user_provided: informado/enviado manualmente pelo operador
 *  - ai_suggested:  texto criado por IA/modelo (conteúdo demonstrativo, revisar)
 */
export type FactStatus = 'verified' | 'unconfirmed' | 'user_provided' | 'ai_suggested';

/**
 * Situação do site próprio do estabelecimento.
 *  - has_site:     site próprio identificado em alguma fonte
 *  - social_only:  apenas redes sociais identificadas como presença online
 *  - none_found:   nenhuma fonte consultada indicou site (OSM + Google, ou confirmado pelo operador)
 *  - unverified:   não foi possível confirmar (ex.: só o OSM foi consultado e ele não tem o dado)
 */
export type WebsiteStatus = 'has_site' | 'social_only' | 'none_found' | 'unverified';

export const WEBSITE_STATUS_LABEL: Record<WebsiteStatus, string> = {
  has_site: 'Possui site',
  social_only: 'Só redes sociais',
  none_found: 'Sem site encontrado',
  unverified: 'Site não confirmado',
};

export const STAGES = [
  { id: 'identified', label: 'Identificado' },
  { id: 'investigating', label: 'Em investigação' },
  { id: 'qualified', label: 'Qualificado' },
  { id: 'demo_created', label: 'Demo criada' },
  { id: 'demo_reviewed', label: 'Demo revisada' },
  { id: 'contacted', label: 'Contato realizado' },
  { id: 'proposal_sent', label: 'Proposta enviada' },
  { id: 'negotiation', label: 'Negociação' },
  { id: 'won', label: 'Cliente convertido' },
  { id: 'lost', label: 'Encerrado' },
] as const;
export type StageId = (typeof STAGES)[number]['id'];

export interface Address {
  street?: string;
  number?: string;
  suburb?: string;
  city?: string;
  state?: string;
  postcode?: string;
  formatted?: string;
}

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  whatsapp?: string;
  [k: string]: string | undefined;
}

export interface PriorityReason {
  label: string;
  points: number;
}

export interface Business {
  id: string;
  source: string; // 'osm' | 'google' | 'manual'
  sourceRef: string; // ex.: 'osm:node/123'
  name: string;
  segment: string; // id de segmento (ver segments.ts)
  category: string; // categoria legível da fonte
  lat?: number;
  lon?: number;
  address: Address;
  phone?: string;
  website?: string;
  websiteStatus: WebsiteStatus;
  /** Qualidade do site existente (somente quando websiteStatus = has_site e o site foi verificado). */
  websiteQuality?: 'ok' | 'weak' | 'unreachable' | null;
  websiteNotes?: { issues: string[]; positives: string[]; checkedAt: string } | null;
  socials: SocialLinks;
  stage: StageId;
  priorityScore: number;
  priorityReasons: PriorityReason[];
  sourceAttribution: string;
  fetchedAt: string;
  investigatedAt?: string;
  createdAt: string;
  updatedAt: string;
  tags?: Record<string, string>;
  googlePlaceId?: string;
}

export interface Fact {
  id: string;
  businessId: string;
  field: string; // ex.: 'phone', 'opening_hours', 'menu', 'services'
  value: unknown;
  status: FactStatus;
  source: string; // ex.: 'OpenStreetMap', 'Google Places', 'Site oficial', 'Operador'
  sourceUrl?: string;
  retrievedAt: string;
  note?: string;
  active: boolean; // falso quando substituído por outro fato
}

/**
 * Direitos de uso de um arquivo. Só 'authorized' e 'owned' podem ser
 * usados em sites gerados.
 */
export type AssetRights = 'authorized' | 'owned' | 'pending_authorization' | 'reference_only';

export const ASSET_RIGHTS_LABEL: Record<AssetRights, string> = {
  authorized: 'Uso autorizado pelo estabelecimento',
  owned: 'Produzido por mim / licenciado',
  pending_authorization: 'Aguardando autorização',
  reference_only: 'Somente referência (não usar no site)',
};

export const USABLE_RIGHTS: AssetRights[] = ['authorized', 'owned'];

export type AssetKind = 'logo' | 'photo' | 'menu' | 'document' | 'other';

export interface Asset {
  id: string;
  businessId: string;
  kind: AssetKind;
  filename: string;
  mime: string;
  size: number;
  rights: AssetRights;
  source: string;
  note?: string;
  palette?: string[];
  createdAt: string;
}

export interface Activity {
  id: string;
  businessId: string;
  type: string; // 'stage_change' | 'note' | 'investigation' | 'site_generated' | ...
  message: string;
  createdAt: string;
}

export interface MissingItem {
  field: string;
  label: string;
  importance: 'essential' | 'recommended';
  hint: string;
}

export interface IntegrationStatus {
  osm: boolean;
  googlePlaces: boolean;
  ai: boolean;
  aiModel?: string;
  hosting?: boolean;
}
