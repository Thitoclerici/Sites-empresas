// Avaliação de qualidade do site gerado (heurísticas objetivas, sem IA).
// Responde perguntas como: a primeira tela desperta interesse? há imagens reais?
// os botões levam a contatos reais? o contraste é legível? há excesso de texto?
// A bancada `npm run qa:visual` complementa com capturas reais de desktop e celular.

import type { Item, ItemGroup, SiteSpec } from './site.ts';
import { contrast } from './design.ts';

export interface QualityCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  fix?: string;
  sectionType?: string;
  weight: number;
}

export interface QualityReport {
  score: number;
  grade: 'excelente' | 'bom' | 'regular' | 'fraco';
  checks: QualityCheck[];
}

function readable(bg: string) {
  return contrast('#111111', bg) >= contrast('#FFFFFF', bg) ? '#111111' : '#FFFFFF';
}

export function evaluateSite(spec: SiteSpec, ctx: { usableImageIds: string[] }): QualityReport {
  const checks: QualityCheck[] = [];
  const add = (c: QualityCheck) => checks.push(c);
  const visible = spec.sections.filter((s) => s.visible);
  const hero = visible.find((s) => s.type === 'hero');
  const imgs = new Set(ctx.usableImageIds);
  const t = spec.theme;

  // 1) Primeira tela
  const headline = String(hero?.props.headline ?? '');
  const heroCta = String(hero?.props.ctaHref ?? '');
  add({
    id: 'hero-message', label: 'Mensagem da primeira tela', weight: 12, sectionType: 'hero',
    status: headline && headline.length <= 70 ? 'ok' : headline ? 'warn' : 'fail',
    detail: headline ? (headline.length <= 70 ? `Frase principal curta e direta (${headline.length} caracteres).` : `Frase principal longa (${headline.length} caracteres) — perde força.`) : 'Sem frase principal.',
    fix: 'Edite o título da Abertura para uma frase curta (até ~60 caracteres) que desperte vontade.',
  });
  add({
    id: 'hero-cta', label: 'Botão de ação na primeira tela', weight: 12, sectionType: 'hero',
    status: /^(https?:|tel:|#)/.test(heroCta) && heroCta !== '#' ? 'ok' : 'fail',
    detail: heroCta && heroCta !== '#' ? 'A primeira tela tem uma ação clara.' : 'Sem botão de ação válido — o visitante não sabe o que fazer.',
    fix: 'Confirme WhatsApp ou telefone na Investigação, ou aponte o botão para o cardápio.',
  });

  // 2) Imagens
  const heroImg = hero?.props.image && imgs.has(hero.props.image);
  const gallery = visible.find((s) => s.type === 'gallery');
  const galleryCount = ((gallery?.props.images ?? []) as string[]).filter((id) => imgs.has(id)).length;
  add({
    id: 'hero-image', label: 'Imagem principal', weight: 12, sectionType: 'hero',
    status: heroImg || galleryCount ? 'ok' : 'warn',
    detail: heroImg || galleryCount ? 'Foto real e autorizada valoriza a primeira impressão.' : 'Sem foto autorizada: a abertura usa arte gráfica gerada (sem fingir ser do local).',
    fix: 'Envie fotos autorizadas (fachada, ambiente, produtos) na Investigação e escolha uma para a Abertura.',
  });
  add({
    id: 'gallery', label: 'Fotos dos produtos/ambiente', weight: 6, sectionType: 'gallery',
    status: galleryCount >= 3 ? 'ok' : galleryCount ? 'warn' : 'warn',
    detail: galleryCount >= 3 ? `${galleryCount} fotos autorizadas na galeria.` : galleryCount ? `Só ${galleryCount} foto(s) — 3 a 6 funcionam melhor.` : 'Galeria oculta por falta de fotos autorizadas.',
    fix: 'Peça ao proprietário de 3 a 6 fotos com autorização de uso.',
  });

  // 3) Conteúdo principal
  const content = visible.find((s) => ['menu', 'services', 'products'].includes(s.type));
  const items = content
    ? content.type === 'menu'
      ? ((content.props.groups ?? []) as ItemGroup[]).flatMap((g) => g.items ?? []).filter((i) => i?.name).length
      : ((content.props.items ?? []) as Item[]).filter((i) => i?.name).length
    : 0;
  const hasDoc = !!(content?.props.menuLink || content?.props.menuFile);
  add({
    id: 'content', label: 'Produtos/serviços apresentados', weight: 14, sectionType: content?.type,
    status: items >= 3 ? 'ok' : items || hasDoc ? 'warn' : 'fail',
    detail: items >= 3 ? `${items} itens reais apresentados.` : items ? `Apenas ${items} item(ns).` : hasDoc ? 'Só o arquivo/link do cardápio — itens no site vendem mais.' : 'Nenhum produto ou serviço — o site não mostra o que o negócio oferece.',
    fix: 'Cadastre os itens (com preços divulgados) ou anexe o cardápio na Investigação.',
  });

  // 4) Conversão e contato
  const b = spec.business;
  const actions = [b.whatsapp || b.phone, b.lat != null || b.address, items || hasDoc].filter(Boolean).length;
  add({
    id: 'contact', label: 'Contato direto (WhatsApp/telefone)', weight: 10,
    status: b.whatsapp ? 'ok' : b.phone ? 'warn' : 'fail',
    detail: b.whatsapp ? 'WhatsApp confirmado: botão fixo no celular e no topo.' : b.phone ? 'Só telefone — WhatsApp converte melhor.' : 'Sem contato direto confirmado.',
    fix: 'Confirme o WhatsApp comercial com o proprietário.',
  });
  add({
    id: 'mobile-bar', label: 'Ações rápidas no celular', weight: 6,
    status: actions >= 2 ? 'ok' : 'warn',
    detail: actions >= 2 ? 'Barra fixa com atalhos (contato, cardápio, rota) no celular.' : 'Poucos dados para a barra fixa de ações no celular.',
  });
  const visit = visible.find((s) => s.type === 'visit' || s.type === 'contact' || s.type === 'hours');
  const rows = (visit?.props.rows ?? []).length;
  add({
    id: 'visit', label: 'Endereço e horários', weight: 8, sectionType: 'visit',
    status: b.address && rows ? 'ok' : b.address || rows ? 'warn' : 'fail',
    detail: b.address && rows ? 'Endereço, horários e mapa no mesmo bloco.' : !rows ? 'Horário de funcionamento ausente.' : 'Endereço ausente.',
    fix: 'Complete endereço e horários na Investigação.',
  });

  // 5) Composição: variedade, repetição, excesso de texto
  const withContent = visible.length;
  let repeats = 0;
  for (let i = 1; i < visible.length; i++) if (visible[i]!.type === visible[i - 1]!.type) repeats++;
  add({
    id: 'rhythm', label: 'Ritmo e variedade das seções', weight: 6,
    status: withContent >= 5 && !repeats ? 'ok' : 'warn',
    detail: repeats ? 'Há seções repetidas em sequência.' : withContent >= 5 ? `${withContent} seções com composições diferentes.` : 'Poucas seções — a página fica curta.',
  });
  const longText = visible.flatMap((s) => Object.entries(s.props).filter(([, v]) => typeof v === 'string' && v.length > 480).map(([k]) => `${s.type}.${k}`));
  add({
    id: 'text', label: 'Quantidade de texto', weight: 4,
    status: longText.length ? 'warn' : 'ok',
    detail: longText.length ? `Textos longos em: ${longText.join(', ')}.` : 'Textos curtos e escaneáveis.',
    fix: 'Reduza parágrafos para 2–3 frases.',
  });

  // 6) Legibilidade (contraste WCAG)
  const cText = contrast(t.text, t.background);
  const cMuted = contrast(t.muted, t.background);
  const cBtn = contrast(readable(t.primary), t.primary);
  const worst = Math.min(cText, cMuted, cBtn);
  add({
    id: 'contrast', label: 'Contraste e legibilidade', weight: 6,
    status: worst >= 4.5 ? 'ok' : worst >= 3 ? 'warn' : 'fail',
    detail: `Texto ${cText.toFixed(1)}:1 · secundário ${cMuted.toFixed(1)}:1 · botões ${cBtn.toFixed(1)}:1 (mínimo recomendado 4,5:1).`,
    fix: 'Ajuste as cores na aba Visual.',
  });

  // 7) Revisão humana
  const unverified = visible.reduce((n, s) => n + Object.values(s.origins).filter((o) => o === 'ai' || o === 'template').length, 0);
  const pending = visible.reduce((n, s) => n + s.pending.length, 0);
  add({
    id: 'review', label: 'Textos revisados', weight: 4,
    status: unverified === 0 ? 'ok' : 'warn',
    detail: unverified ? `${unverified} texto(s) de IA/modelo aguardando sua revisão.` : 'Todos os textos foram revisados ou vêm de dados verificados.',
  });
  add({
    id: 'seo', label: 'SEO (título e descrição)', weight: 0,
    status: spec.seo.title.length <= 65 && spec.seo.description.length >= 70 ? 'ok' : 'warn',
    detail: `Título com ${spec.seo.title.length} caracteres; descrição com ${spec.seo.description.length}.`,
  });
  if (pending) add({ id: 'pending', label: 'Pendências de informação', weight: 0, status: 'warn', detail: `${pending} pendência(s) — seções sem dados ficam ocultas para o cliente.` });

  const total = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const got = checks.reduce((s, c) => s + (c.status === 'ok' ? c.weight : c.status === 'warn' ? c.weight * 0.5 : 0), 0);
  const score = Math.round((got / total) * 100);
  return { score, grade: score >= 85 ? 'excelente' : score >= 70 ? 'bom' : score >= 50 ? 'regular' : 'fraco', checks };
}
