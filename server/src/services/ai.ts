// Integração com a API da Anthropic (Claude). Opcional: sem ANTHROPIC_API_KEY,
// a plataforma funciona com geradores determinísticos.
//
// Regra para a IA: escrever textos comerciais usando SOMENTE os fatos fornecidos.
// Nada de anos de fundação, prêmios, avaliações, ingredientes ou números inventados.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export const aiModel = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

let client: Anthropic | null = null;
function getClient() {
  if (!aiEnabled()) throw new Error('IA não configurada: defina ANTHROPIC_API_KEY no arquivo .env.');
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM = `Você é redator e diretor de arte de uma agência que cria sites para pequenos negócios brasileiros.
Escreve em português do Brasil, com tom acolhedor, claro e comercial, adequado ao segmento.

Regras inegociáveis:
- Use apenas os fatos fornecidos no briefing. Não invente história, ano de fundação, prêmios, avaliações, número de clientes,
  ingredientes, produtos, preços, formação de profissionais, diferenciais ou qualquer afirmação verificável que não esteja nos fatos.
- Frases de apresentação genéricas e convidativas são permitidas (ex.: "Venha nos visitar"), desde que não afirmem fatos novos.
- Se um campo não puder ser escrito sem inventar, devolva string vazia.
- Textos curtos e escaneáveis: títulos com até 60 caracteres, subtítulos com até 160.`;

async function parse<T extends z.ZodType>(schema: T, prompt: string, maxTokens = 4000): Promise<z.infer<T>> {
  const res = await getClient().messages.parse({
    model: aiModel(),
    max_tokens: maxTokens,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(schema), effort: 'medium' },
    messages: [{ role: 'user', content: prompt }],
  });
  if (res.stop_reason === 'refusal') throw new Error('A IA recusou a solicitação.');
  if (!res.parsed_output) throw new Error('A IA não retornou uma resposta válida.');
  return res.parsed_output as z.infer<T>;
}

export const CopySchema = z.object({
  concept: z.enum(['refined', 'bold', 'inviting']).describe('Direção visual mais adequada ao negócio (respeite conceito_solicitado se vier preenchido).'),
  tagline: z.string().describe('Frase principal da primeira tela: curta (até 55 caracteres), comercial, sem afirmar fatos não fornecidos.'),
  statement: z.string().describe('Frase-manifesto de 1 a 2 linhas. Se houver descrição verificada, pode resumi-la; caso contrário, frase aspiracional sem fatos novos.'),
  audience: z.array(z.object({ text: z.string(), basis: z.enum(['hipótese', 'indício']) })).describe('Público provável. "indício" só quando apoiado em um fato do briefing; senão "hipótese".'),
  heroEyebrow: z.string().describe('Texto curto acima do título (ex.: segmento + bairro).'),
  heroSubheadline: z.string(),
  aboutTitle: z.string(),
  aboutText: z.string().describe('2 a 4 frases, somente com base nos fatos. Vazio se não houver fatos suficientes.'),
  contentIntro: z.string().describe('Introdução curta para cardápio/serviços/produtos. Vazio se não houver itens.'),
  highlightsTitle: z.string(),
  ctaTitle: z.string(),
  ctaText: z.string(),
  contactText: z.string(),
  seoTitle: z.string().describe('Até 60 caracteres, com nome, segmento e bairro/cidade.'),
  seoDescription: z.string().describe('Até 155 caracteres.'),
  designRationale: z.string().describe('Uma frase explicando a direção visual escolhida.'),

});
export type GeneratedCopy = z.infer<typeof CopySchema>;

export async function generateCopy(brief: object, concepts: string[]): Promise<GeneratedCopy> {
  return parse(
    CopySchema,
    `Atue como diretor de arte e redator. Antes de escrever, analise o tipo de negócio, o público provável (separando hipóteses de indícios
apoiados nos fatos), a identidade e os diferenciais. Escolha a direção visual e escreva textos que despertem desejo no consumidor final.
Direções disponíveis: ${concepts.join('; ')}.

Briefing (fatos verificados ou informados pelo operador, em JSON):
${JSON.stringify(brief, null, 2)}`,
  );
}

const SectionTextSchema = z.object({
  fields: z.array(z.object({ key: z.string(), value: z.string() })).describe('Somente os campos de texto alterados.'),
  explanation: z.string(),
});

export async function regenerateSectionText(input: {
  brief: object;
  sectionType: string;
  currentText: Record<string, string>;
  instruction?: string;
}) {
  return parse(
    SectionTextSchema,
    `Reescreva os textos da seção "${input.sectionType}" do site.
Instrução do operador: ${input.instruction?.trim() || 'Proponha uma alternativa melhor, mais clara e persuasiva.'}
Campos de texto atuais (chave: valor): ${JSON.stringify(input.currentText, null, 2)}
Use apenas as mesmas chaves. Fatos disponíveis: ${JSON.stringify(input.brief, null, 2)}`,
    2000,
  );
}

const SuggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      sectionId: z.string().describe('id da seção relacionada, ou vazio'),
      kind: z.enum(['content', 'design', 'conversion', 'seo', 'missing_info']),
    }),
  ),
});

export async function suggestImprovements(spec: object, missing: object) {
  return parse(
    SuggestionsSchema,
    `Analise o documento do site abaixo e sugira até 6 melhorias práticas para torná-lo uma apresentação comercial melhor.
Não sugira inventar dados; quando faltar informação, sugira pedir ao proprietário.
Informações faltantes conhecidas: ${JSON.stringify(missing)}
Documento do site: ${JSON.stringify(spec)}`,
    3000,
  );
}
