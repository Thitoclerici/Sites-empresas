# Prospecta

Plataforma de prospecção comercial e geração de demonstrações de sites para pequenos negócios.

Fluxo central: **pesquisar negócios em uma região → identificar quem aparentemente não tem site → investigar informações públicas → complementar manualmente → gerar uma demonstração de site personalizada → editar → salvar e acompanhar no CRM**.

---

## 1. Análise de viabilidade

| Funcionalidade | Viável? | Como | Limitações |
|---|---|---|---|
| Buscar negócios por cidade, bairro, segmento, nome e raio | ✅ Sim, sem custo | OpenStreetMap: **Overpass** (completo) com **Nominatim** como reserva | A cobertura do OSM no Brasil é boa em capitais e irregular no interior. O Nominatim limita 1 req/s e cerca de 40 resultados por consulta (busca parcial). |
| Saber se o negócio **não tem site** | ⚠️ Parcial | Tags `website` e redes sociais no OSM e, se configurado, `websiteUri` do Google Places | **Ausência no OSM não prova ausência de site.** Por isso existem 4 estados: *possui site*, *só redes sociais*, *sem site encontrado* (OSM + Google ou confirmado por você) e *não confirmado*. |
| Telefone, endereço, horário e comodidades | ✅ | OSM e Google Places (opcional) | Dados do Google seguem os Termos do Google Maps Platform (atualizar em até 30 dias). |
| Cardápio, preços, fotos e logotipo | ❌ Não automaticamente | **Upload manual** com controle de direitos de uso, ou leitura do site oficial (metadados, respeitando robots.txt) | Instagram, Facebook, iFood etc. proíbem coleta automatizada nos termos de uso. A plataforma lista os links para você consultar e não faz raspagem nem contorna bloqueios. |
| Gerar site personalizado | ✅ | Perfis de segmento (estrutura, paletas, tipografia, CTA) + fatos verificados + IA opcional para textos | Sem fotos autorizadas, o visual usa monograma e padrões gráficos (nunca fotos genéricas apresentadas como do estabelecimento). |
| Editar sem código | ✅ | Editor visual com prévia ao vivo (desktop, tablet e celular), seções, textos, itens, cores, fontes, imagens, SEO e histórico de versões | — |
| CRM / pipeline | ✅ | 10 etapas, histórico, anotações, painel com métricas e prioridade explicável | — |
| Publicação, domínio e hospedagem | 🔜 Fase 2 | A arquitetura já tem status de aprovação, registro de aprovações e bloqueio de publicação | O endpoint de publicação exige aprovação registrada e hoje responde "não implementado". |

## 2. Arquitetura

```
web/ (React + Vite)          ← interface: Dashboard, Explorar, Investigação, Estúdio, Pipeline
 │   usa shared/render.ts para a prévia ao vivo
 ▼  /api
server/ (Fastify + node:sqlite)
 ├─ providers/   osm.ts (Overpass/Nominatim) · googlePlaces.ts · website.ts · links.ts · http.ts
 ├─ services/    prospecting.ts (busca + score) · investigation.ts (fatos + pendências)
 │               generator.ts (fatos → SiteSpec) · ai.ts (Claude) · suggestions.ts
 ├─ routes/api.ts
 └─ repo.ts · db.ts (migrações)
shared/
 ├─ types.ts     domínio: Business, Fact (com status/fonte), Asset (com direitos), estágios
 ├─ segments.ts  perfis de segmento (filtros OSM, seções, paletas, checklist, copy)
 ├─ site.ts      SiteSpec: documento JSON editável do site
 ├─ render.ts    SiteSpec → HTML estático (SEO, JSON-LD, responsivo)
 └─ hours.ts     opening_hours (OSM) → horários em português
```

Decisões principais:

- **Registro de fatos com proveniência.** Cada informação é um `Fact` com status (`verified`, `unconfirmed`, `user_provided`, `ai_suggested`), fonte, URL e data. O gerador só usa fatos verificados ou informados por você. Indícios (ex.: "celular pode ser WhatsApp") ficam como *não confirmado* até você confirmar.
- **O site é um documento (`SiteSpec`), não código.** O mesmo renderizador gera a prévia do editor, a prévia em nova aba e o HTML exportado, e vai gerar a publicação na Fase 2. Cada campo de texto guarda a origem (*verificado*, *editado*, *IA*, *modelo*), exibida no editor.
- **Sem dados fictícios.** Seções sem dados verificados aparecem como **pendência** no editor e ficam **ocultas** na versão para o cliente. Botões só apontam para contatos reais.
- **Direitos de uso.** Arquivos enviados têm um status de direitos. Só os de uso *autorizado* ou *produzido por mim* aparecem nos sites; isso é verificado no servidor e no renderizador.
- **Validação humana.** Revisão da demo, aprovação do cliente (com registro obrigatório de como foi obtida) e publicação são etapas explícitas e registradas na tabela `approvals`. Não existe contato comercial automático.
- **Prioridade explicável.** O score usa apenas critérios observáveis (situação do site, aderência do segmento, contato público, indícios de atividade, rede/franquia) e mostra os pontos de cada critério. Nunca estima faturamento.
- **Extensível.** Um novo segmento é só um novo perfil em `segments.ts`, e uma nova fonte é só um novo provider. O SQLite pode migrar para PostgreSQL sem mudar o domínio.

## 2.1 Motor de geração de sites (direção de arte)

O gerador não preenche um modelo único. Para cada estabelecimento ele:

1. **Analisa** o segmento e os dados verificados (`shared/design.ts → buildDirection`).
2. **Define o público provável**, separando *hipóteses* (pelo segmento) de *indícios* (apoiados em dados, ex.: Wi-Fi registrado).
3. **Escolhe uma direção visual** entre três conceitos com composição, tipografia e hierarquia próprias:
   - **Moderno e sofisticado** (`refined`): editorial, serifas elegantes, muito respiro, cardápio em lista com leaders.
   - **Criativo e impactante** (`bold`): nome em tipografia gigante condensada, blocos de cor, letreiro animado com dados reais, selo giratório, itens numerados.
   - **Comercial e convidativo** (`inviting`): frase convidativa como título, produtos reais na primeira tela, cartões e chamadas de conversão.
4. **Planeja a página** (ordem e tipo de seções variam por conceito e família: alimentação, serviços, varejo).
5. **Compõe** cada seção com a linguagem do conceito (`shared/render.ts`), com paleta derivada da marca/segmento e contraste verificado.
6. **Avalia a qualidade** (`shared/quality.ts`): primeira tela, imagem, conteúdo, conversão, contraste, excesso de texto, ritmo — nota de 0 a 100 com correções sugeridas (aba **Qualidade** do Estúdio).

No Estúdio, **Direção visual** mostra as três propostas lado a lado (desktop e celular) para escolher; as edições de texto são preservadas ao trocar.

**Imagens:** fotos só entram se tiverem uso autorizado. Sem elas, o site usa **arte gráfica generativa** única por negócio (formas nas cores da marca, ilustração do segmento, textura) — nunca fotos genéricas apresentadas como do local — e a direção criativa sinaliza essa limitação.

**Avaliação visual com capturas reais:** `npm run qa:visual -- pasta-de-saida` sobe o servidor com banco temporário, cria negócios de teste (dados fictícios marcados como "teste"), gera os sites (use `QA_CONCEPTS=refined,bold,inviting` e `QA_ONLY=cafe-full,barbearia`) e salva capturas de desktop e celular + `report.json` com as notas. Requer Playwright instalado na máquina.

## 3. Como rodar

Requisitos: Node.js ≥ 22.13.

```bash
npm install
cp .env.example .env   # opcional: chaves de IA e Google Places
npm run dev            # API em :3001 e interface em http://localhost:5173
```

Produção: `npm run build && npm start` (a API também serve a interface compilada em :3001).
Testes: `npm test`. Verificação de tipos: `npm run typecheck`.

Os dados ficam em `data/prospecta.db` e os uploads em `data/uploads/` (ambos fora do git).

> Se a máquina sai para a internet por um proxy HTTP, defina `NODE_USE_ENV_PROXY=1` para que o `fetch` do Node use `HTTPS_PROXY`.

## 3.1 Colocar o Hub online de graça (Render + Supabase)

O Render gratuito roda o Hub, mas apaga o disco a cada reinício. Por isso o banco e os arquivos são copiados automaticamente para o **Supabase Storage** (gratuito) e restaurados quando o Hub acorda.

**Supabase (onde os dados ficam guardados)**
1. Crie uma conta em https://supabase.com e um projeto novo (região São Paulo).
2. Em **Project Settings → API Keys**, copie a **Project URL** e a chave **secreta** (*secret* ou *service_role*).

**Render (onde o Hub roda)**
1. Crie uma conta em https://render.com (entre com o GitHub).
2. **New → Blueprint** e escolha o repositório `Sites-empresas`.
3. Preencha: `HUB_PASSWORD` (sua senha), `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` e `OSM_CONTACT_EMAIL`. As chaves de IA e Google podem ficar em branco.
4. **Apply**. Em 5 a 10 minutos o Hub fica disponível em `https://prospecta-XXXX.onrender.com`.

Limitações do plano gratuito:
- Após ~15 minutos sem uso o Hub "dorme"; o primeiro acesso seguinte (inclusive pelo link de uma demo) leva cerca de 1 minuto.
- O Supabase gratuito pausa projetos sem atividade por cerca de uma semana; se acontecer, reative no painel do Supabase.
- Alterações feitas nos últimos segundos antes de um desligamento inesperado podem se perder (no desligamento normal, os dados são salvos).

Para não ter essas limitações: plano *Starter* do Render com disco (veja o comentário em `render.yaml`) ou qualquer serviço Docker com volume em `/var/data`.

## 3.2 Publicar o site do cliente (domínio próprio)

Depois que o cliente aprova a demonstração:

1. No Estúdio, marque **"Aprovada pelo cliente"** registrando como a aprovação foi obtida (sem isso, a publicação fica bloqueada).
2. Clique em **🌐 Publicar** → **Publicar agora**. O site (HTML + imagens e cardápio autorizados) vai para a **Netlify**, com HTTPS, num endereço gratuito `https://nome.netlify.app` que nunca "dorme".
3. Informe o domínio do cliente (registrado por ele em registro.br). A tela mostra os registros DNS para criar no Registro.br (`A` → IP da Netlify e `CNAME www` → endereço da Netlify) e o botão **Verificar domínio** confirma DNS e HTTPS.
4. Editou o site? **Publicar alterações** atualiza o que está no ar. **Retirar do ar** remove a hospedagem.

Configuração (uma vez): crie uma conta gratuita na Netlify, gere um *Personal access token* e defina `NETLIFY_AUTH_TOKEN` nas variáveis do Render.

## 4. Integrações

| Integração | Obrigatória? | Variável | O que habilita |
|---|---|---|---|
| OpenStreetMap (Overpass + Nominatim) | Já funciona, sem chave | `OSM_CONTACT_EMAIL` (recomendado pela política do Nominatim), `OVERPASS_URL` (lista separada por vírgula) | Busca, geocodificação, dados básicos |
| Anthropic Claude | Opcional (recomendada) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (padrão `claude-opus-5-5`) | Textos comerciais personalizados, escolha da paleta, regeneração de seções e sugestões de melhoria. Sem a chave, o gerador usa textos modelo por segmento, marcados para revisão. |
| Netlify | Para publicar sites aprovados | `NETLIFY_AUTH_TOKEN` | Botão Publicar: hospedagem com HTTPS e domínio próprio do cliente |
| Google Places API (New) | Opcional (recomendada) | `GOOGLE_PLACES_API_KEY` | Confirmar ausência de site ("sem site encontrado"), telefone, horários e status de funcionamento |

As chaves ficam só no servidor (`.env`) e nunca são enviadas à interface.

## 5. LGPD e uso responsável

- O Hub exige senha (`HUB_PASSWORD`) em produção; as demos são compartilhadas por **links secretos** que você ativa, desativa ou recria a qualquer momento, com contador de visualizações.
- Coleta apenas dados **comerciais** de estabelecimentos, com fonte e data registradas.
- **Exclusão completa** de um estabelecimento (dados, arquivos e demos) na página de Investigação.
- Respeito a `robots.txt`, limites de taxa e termos das fontes. Nada de raspagem de redes sociais nem de contornar captchas.
- As demonstrações levam um aviso visível de "demonstração não oficial" e `noindex` até a aprovação do cliente.
- As fontes dos sites gerados vêm do Bunny Fonts, sem rastreamento.

## 6. Roteiro

**Fase 2 — evolução comercial:** autenticação e múltiplos usuários; PostgreSQL e armazenamento de objetos (S3); publicação com domínio próprio (ex.: Cloudflare Pages ou Vercel via API) protegida pela aprovação já registrada; páginas adicionais; integração de WhatsApp Business, agendamento e pedidos (a seção *Agendamento* já está preparada); propostas comerciais em PDF; comparação de oportunidades.

**Fase 3 — automação e escala:** fila de jobs para buscas periódicas por região e segmento; agente que investiga novas oportunidades e prepara demos para revisão (sempre parando nos pontos de validação humana); deduplicação entre fontes; métricas de conversão por segmento.
