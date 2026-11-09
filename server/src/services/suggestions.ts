// Sugestões de melhoria baseadas em regras (sempre disponíveis, sem IA).

import type { SiteSpec } from '../../../shared/site.ts';
import type { MissingItem } from '../../../shared/types.ts';

export interface Suggestion {
  title: string;
  detail: string;
  sectionId: string;
  kind: 'content' | 'design' | 'conversion' | 'seo' | 'missing_info';
  source: 'rules' | 'ai';
}

export function ruleSuggestions(spec: SiteSpec, missing: MissingItem[]): Suggestion[] {
  const out: Suggestion[] = [];
  const find = (type: string) => spec.sections.find((s) => s.type === type);
  for (const m of missing.filter((x) => x.importance === 'essential')) {
    out.push({ title: `Solicitar: ${m.label}`, detail: m.hint, sectionId: '', kind: 'missing_info', source: 'rules' });
  }
  if (!spec.business.whatsapp) {
    out.push({ title: 'Confirmar WhatsApp comercial', detail: 'Um botão de WhatsApp costuma ser o principal canal de conversão de pequenos negócios. Confirme o número com o proprietário.', sectionId: find('hero')?.id ?? '', kind: 'conversion', source: 'rules' });
  }
  const hero = find('hero');
  if (hero && !hero.props.image) {
    out.push({ title: 'Adicionar foto de destaque autorizada', detail: 'A abertura usa um monograma. Uma foto real e autorizada do ambiente ou dos produtos aumenta muito o impacto da apresentação.', sectionId: hero.id, kind: 'design', source: 'rules' });
  }
  if (!spec.logo) {
    out.push({ title: 'Inserir o logotipo', detail: 'Envie o logotipo (com autorização) e use "Extrair cores do logotipo" para alinhar a paleta à marca.', sectionId: '', kind: 'design', source: 'rules' });
  }
  const aiOrTemplate = spec.sections.flatMap((s) => Object.entries(s.origins).filter(([, o]) => o === 'ai' || o === 'template').map(([k]) => `${s.type}.${k}`));
  if (aiOrTemplate.length) {
    out.push({ title: 'Revisar textos não verificados', detail: `${aiOrTemplate.length} campos foram escritos por IA ou modelo. Revise antes de apresentar ao proprietário.`, sectionId: '', kind: 'content', source: 'rules' });
  }
  if (spec.seo.title.length > 65) out.push({ title: 'Encurtar o título SEO', detail: 'Títulos acima de ~60 caracteres costumam ser cortados nos resultados de busca.', sectionId: '', kind: 'seo', source: 'rules' });
  if (spec.seo.description.length < 70) out.push({ title: 'Melhorar a descrição SEO', detail: 'Escreva uma descrição de 120–155 caracteres com segmento, bairro e principal diferencial.', sectionId: '', kind: 'seo', source: 'rules' });
  return out;
}
