// Módulo de investigação: reúne informações públicas de fontes autorizadas,
// registra cada fato com fonte e data e lista o que falta complementar.

import { cuisineLabel, getSegment, OSM_HIGHLIGHTS } from '../../../shared/segments.ts';
import type { MissingItem, StageId } from '../../../shared/types.ts';
import { STAGES } from '../../../shared/types.ts';
import { lookupOsm } from '../providers/osm.ts';
import { analyzeLinks } from '../providers/links.ts';
import { findGooglePlace, googleEnabled } from '../providers/googlePlaces.ts';
import { inspectWebsite } from '../providers/website.ts';
import { addActivity, addFact, advanceStage, bestFacts, getBusiness, listAssets, updateBusinessFields } from '../repo.ts';
import { now } from '../db.ts';
import { scoreBusiness } from './prospecting.ts';
import { USABLE_RIGHTS } from '../../../shared/types.ts';

export interface InvestigationStep {
  source: string;
  status: 'ok' | 'skipped' | 'error';
  message: string;
  facts: number;
}

const STAGE_ORDER = STAGES.map((s) => s.id) as StageId[];

function osmUrl(ref: string) {
  const m = ref.match(/^osm:(node|way|relation)\/(\d+)$/);
  return m ? `https://www.openstreetmap.org/${m[1]}/${m[2]}` : undefined;
}

/** Número móvel brasileiro (9 dígitos após DDD) — pode ser WhatsApp, mas não é confirmado. */
export function looksLikeBrMobile(phone?: string) {
  if (!phone) return false;
  const d = phone.replace(/\D/g, '').replace(/^55/, '');
  return d.length === 11 && d[2] === '9';
}

export async function investigate(businessId: string): Promise<{ steps: InvestigationStep[]; missing: MissingItem[] }> {
  const b = getBusiness(businessId);
  if (!b) throw new Error('Estabelecimento não encontrado');
  advanceStage(businessId, 'investigating', STAGE_ORDER, 'Investigação iniciada');
  const steps: InvestigationStep[] = [];

  // 1) OpenStreetMap — dados atualizados do elemento.
  let tags = b.tags ?? {};
  let osmCount = 0;
  const OSM = 'OpenStreetMap';
  const url = osmUrl(b.sourceRef);
  try {
    const fresh = b.source === 'osm' ? await lookupOsm(b.sourceRef) : null;
    if (fresh) {
      tags = { ...tags, ...fresh.tags };
      const address = fresh.address.formatted ? fresh.address : b.address;
      updateBusinessFields(businessId, { address, tags });
    }
    const f = (field: string, value: unknown, note?: string) => {
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return;
      addFact(businessId, { field, value, status: 'verified', source: OSM, sourceUrl: url, note });
      osmCount++;
    };
    const links = analyzeLinks(tags);
    f('name', tags.name ?? b.name);
    f('address', (getBusiness(businessId)!.address));
    f('phone', tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile']);
    f('email', tags.email ?? tags['contact:email']);
    f('website', links.website);
    f('socials', Object.keys(links.socials).length ? links.socials : undefined, 'Perfis públicos: revise manualmente; o conteúdo dessas redes não é coletado automaticamente.');
    f('platforms', links.platforms.length ? links.platforms : undefined, 'Plataformas de terceiros (delivery, cardápio digital, agendamento) — não são site próprio.');
    f('opening_hours', tags.opening_hours);
    f('cuisine', tags.cuisine?.split(';').map(cuisineLabel), tags.cuisine ? `Valor original no OSM: ${tags.cuisine}` : undefined);
    f('description', tags.description, 'Descrição registrada por colaboradores do OSM — confirme com o estabelecimento.');
    f('menu_url', tags['website:menu'] ?? tags.menu);
    const amenities = OSM_HIGHLIGHTS.filter((h) => tags[h.tag] && h.values.includes(tags[h.tag]!)).map((h) => h.label);
    f('amenities', amenities);
    if (tags.brand) f('brand', tags.brand, 'Indica rede/franquia.');
    if (links.socials.whatsapp) f('whatsapp', links.socials.whatsapp);
    steps.push({ source: OSM, status: 'ok', message: fresh ? 'Dados atualizados consultados.' : 'Dados da busca registrados.', facts: osmCount });
  } catch (e: any) {
    steps.push({ source: OSM, status: 'error', message: e.message, facts: osmCount });
  }

  // 2) Google Places — confirmação de site, telefone e horários.
  let googleChecked = false;
  let googleWebsite: string | undefined;
  if (!googleEnabled()) {
    steps.push({ source: 'Google Places', status: 'skipped', message: 'Integração não configurada (GOOGLE_PLACES_API_KEY). A ausência de site permanece "não confirmada".', facts: 0 });
  } else {
    try {
      const found = await findGooglePlace(b.name, b.lat, b.lon, b.address.formatted);
      const G = 'Google Places';
      const note = 'Conteúdo do Google Maps Platform: atualizar em até 30 dias, conforme os termos de uso.';
      if (found) {
        googleChecked = true;
        const p = found.place;
        let n = 0;
        const g = (field: string, value: unknown) => {
          if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return;
          addFact(businessId, { field, value, status: 'verified', source: G, sourceUrl: p.googleMapsUri, note });
          n++;
        };
        updateBusinessFields(businessId, { google_place_id: p.id });
        const links = p.websiteUri ? analyzeLinks({ website: p.websiteUri }) : null;
        googleWebsite = links?.website;
        g('website', links?.website);
        if (links && !links.website) g('socials', links.socials);
        if (links?.platforms.length) g('platforms', links.platforms);
        g('phone', p.nationalPhoneNumber ?? p.internationalPhoneNumber);
        g('opening_hours_text', p.regularOpeningHours?.weekdayDescriptions);
        g('business_status', p.businessStatus);
        steps.push({
          source: G,
          status: 'ok',
          message: `Correspondência encontrada (confiança ${(found.confidence * 100).toFixed(0)}%). ${p.websiteUri ? 'Site informado no Google.' : 'Sem site informado no Google.'}${
            p.businessStatus && p.businessStatus !== 'OPERATIONAL' ? ` Atenção: status ${p.businessStatus}.` : ''
          }`,
          facts: n,
        });
      } else {
        steps.push({ source: G, status: 'ok', message: 'Nenhuma correspondência confiável encontrada no Google.', facts: 0 });
      }
    } catch (e: any) {
      steps.push({ source: 'Google Places', status: 'error', message: e.message, facts: 0 });
    }
  }

  // 3) Site oficial (se houver): metadados públicos, respeitando robots.txt.
  const facts = bestFacts(businessId);
  const website = (facts.website?.value as string | undefined) ?? googleWebsite;
  if (website) {
    try {
      const info = await inspectWebsite(website);
      const S = 'Site oficial';
      let n = 0;
      const s = (field: string, value: unknown) => {
        if (!value) return;
        addFact(businessId, { field, value, status: 'verified', source: S, sourceUrl: info.finalUrl });
        n++;
      };
      s('site_title', info.title);
      s('description', info.description);
      s('brand_color', info.themeColor && /^#[0-9a-f]{3,8}$/i.test(info.themeColor) ? info.themeColor : undefined);
      s('socials', Object.keys(info.socials).length ? info.socials : undefined);
      s('phone', info.phone);
      steps.push({ source: S, status: 'ok', message: `Página inicial lida (${info.finalUrl}).`, facts: n });
    } catch (e: any) {
      steps.push({ source: 'Site oficial', status: 'error', message: e.message, facts: 0 });
    }
  } else {
    steps.push({ source: 'Site oficial', status: 'skipped', message: 'Nenhum site próprio identificado.', facts: 0 });
  }

  // 4) Indícios que exigem confirmação humana.
  const after = bestFacts(businessId);
  const phone = after.phone?.value as string | undefined;
  if (!after.whatsapp && looksLikeBrMobile(phone)) {
    addFact(businessId, {
      field: 'whatsapp',
      value: phone,
      status: 'unconfirmed',
      source: 'Inferência',
      note: 'Número de celular: pode ser WhatsApp, mas não foi confirmado. Confirme antes de usar no site.',
    });
  }

  // 5) Situação do site e prioridade.
  const fin = bestFacts(businessId);
  const hasSite = !!fin.website;
  const hasSocial = !!fin.socials || !!fin.platforms;
  let websiteStatus = b.websiteStatus;
  if (hasSite) websiteStatus = 'has_site';
  else if (googleChecked) websiteStatus = hasSocial ? 'social_only' : 'none_found';
  else if (websiteStatus !== 'none_found') websiteStatus = hasSocial ? 'social_only' : 'unverified';
  const updated = getBusiness(businessId)!;
  const { score, reasons } = scoreBusiness({
    websiteStatus,
    phone,
    socials: (fin.socials?.value as Record<string, string>) ?? {},
    tags: updated.tags ?? {},
    segment: updated.segment,
    hasAddress: !!(updated.address.street && updated.address.number),
  });
  updateBusinessFields(businessId, {
    website_status: websiteStatus,
    website: (fin.website?.value as string) ?? null,
    phone: phone ?? null,
    socials: (fin.socials?.value as object) ?? {},
    priority_score: score,
    priority_reasons: reasons,
    investigated_at: now(),
    saved: 1,
  });

  const missing = computeMissing(businessId);
  if (websiteStatus !== 'has_site') advanceStage(businessId, 'qualified', STAGE_ORDER, 'Qualificado: sem site próprio identificado');
  addActivity(
    businessId,
    'investigation',
    `Investigação concluída: ${steps.map((s) => `${s.source} (${s.status === 'ok' ? `${s.facts} dados` : s.status === 'skipped' ? 'ignorado' : 'erro'})`).join(', ')}. Pendências: ${missing.length}.`,
  );
  return { steps, missing };
}

/** Lista o que falta para um site completo, conforme o perfil do segmento. */
export function computeMissing(businessId: string): MissingItem[] {
  const b = getBusiness(businessId)!;
  const seg = getSegment(b.segment);
  const facts = bestFacts(businessId);
  const assets = listAssets(businessId).filter((a) => USABLE_RIGHTS.includes(a.rights));
  const has = (field: string): boolean => {
    if (field === 'photos') return assets.some((a) => a.kind === 'photo');
    if (field === 'logo') return assets.some((a) => a.kind === 'logo');
    if (field === 'opening_hours') return !!(facts.opening_hours || facts.opening_hours_text);
    if (field === 'whatsapp') return !!facts.whatsapp && facts.whatsapp.status !== 'unconfirmed';
    if (field === 'description') return !!facts.description && facts.description.status !== 'ai_suggested';
    // Cardápio/serviços/produtos: itens digitados OU cardápio anexado (link ou arquivo autorizado).
    if (field === seg.contentKind && (facts.menu_url || assets.some((a) => a.kind === 'menu'))) return true;
    const f = facts[field];
    if (!f) return false;
    return Array.isArray(f.value) ? f.value.length > 0 : !!f.value;
  };
  return seg.checklist.filter((c) => !has(c.field));
}
