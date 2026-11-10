// Assistente de criação do site: aproveita o que a investigação encontrou e pede só
// o que falta, em 5 etapas claras. Cada campo mostra se o dado foi encontrado
// automaticamente ou informado por você.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type Detail } from '../lib/api.ts';
import { useApp, useLoad } from '../lib/context.tsx';
import { Field, JourneyBar, Progress, Skeleton, SourceBadge, Spinner } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { AssetsPanel, MenuPanel } from './Business.tsx';
import { MiniPreview } from './Studio.tsx';
import { groupsToText, itemsToText, parseGroups, parseItems } from '../lib/items.ts';
import type { Fact } from '../../../shared/types.ts';
import type { SiteSpec } from '../../../shared/site.ts';
import { USABLE_RIGHTS } from '../../../shared/types.ts';

const STEPS = [
  { t: 'Informações do negócio', d: 'Nome, endereço e contatos', icon: 'store' },
  { t: 'Identidade visual', d: 'Logotipo, cores e fotos', icon: 'palette' },
  { t: 'Conteúdo', d: 'Cardápio, serviços e descrição', icon: 'layers' },
  { t: 'Estilo do site', d: 'Escolha entre 3 propostas', icon: 'wand' },
  { t: 'Gerar e revisar', d: 'Criar a demonstração', icon: 'rocket' },
];

type Form = Record<string, string>;
interface ConceptPreviews { recommended: string | null; concepts: { id: string; label: string; description: string; spec: SiteSpec; quality: number }[] }

function best(facts: Fact[], field: string): Fact | undefined {
  const rank: Record<string, number> = { user_provided: 3, verified: 2, unconfirmed: 1, ai_suggested: 0 };
  return facts.filter((f) => f.field === field).sort((a, b) => rank[b.status]! - rank[a.status]!)[0];
}

const phoneOk = (v: string) => !v.trim() || v.replace(/\D/g, '').length >= 10;
const emailOk = (v: string) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const socialOk = (v: string) => !v.trim() || /^@?[\w.]{2,}$/.test(v.trim()) || /^https?:\/\/\S+\.\S+/.test(v.trim());

export function CreateSite() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { config, notify, segmentLabel } = useApp();
  const { data: d, reload } = useLoad<Detail>(`/api/businesses/${id}`);
  const [step, setStep] = useState(() => Math.max(0, Math.min(4, Number(sp.get('etapa') ?? 1) - 1)));
  const [form, setForm] = useState<Form | null>(null);
  const [initial, setInitial] = useState<Form>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [concepts, setConcepts] = useState<ConceptPreviews | null>(null);
  const [concept, setConcept] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Preenche o formulário com o melhor dado de cada campo (operador > verificado).
  useEffect(() => {
    if (!d || form) return;
    const f = (field: string) => best(d.facts, field);
    const socials = (f('socials')?.value ?? d.business.socials ?? {}) as Record<string, string>;
    const kind = d.segment.contentKind;
    const v: Form = {
      name: String(f('name')?.value ?? d.business.name),
      segment: d.business.segment,
      address: String((f('address')?.value as any)?.formatted ?? d.business.address.formatted ?? ''),
      phone: String(f('phone')?.value ?? d.business.phone ?? ''),
      whatsapp: f('whatsapp')?.status === 'unconfirmed' ? '' : String(f('whatsapp')?.value ?? ''),
      email: String(f('email')?.value ?? ''),
      instagram: socials.instagram ?? '',
      facebook: socials.facebook ?? '',
      opening_hours: String(f('opening_hours')?.value ?? (f('opening_hours_text')?.value as string[] | undefined)?.join('; ') ?? ''),
      brand_color: String(f('brand_color')?.value ?? ''),
      description: f('description')?.status === 'ai_suggested' ? '' : String(f('description')?.value ?? ''),
      differentials: ((f('differentials')?.value as string[]) ?? []).join('\n'),
      content: kind === 'menu' ? groupsToText(f('menu')?.value as any) : itemsToText(f(kind)?.value as any),
    };
    setForm(v);
    setInitial(v);
  }, [d, form]);

  useEffect(() => {
    if (step === 3 && !concepts && d) {
      api.post<ConceptPreviews>(`/api/businesses/${d.business.id}/preview-specs`).then((r) => {
        setConcepts(r);
        setConcept((c) => c ?? r.recommended ?? r.concepts[0]!.id);
      }).catch((e) => notify(e.message, true));
    }
  }, [step, concepts, d]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f!, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: '' }));
  };
  const src = (field: string) => {
    if (!d || !form) return null;
    if (form[field] !== initial[field]) return <SourceBadge auto={false} />;
    const f = field === 'instagram' || field === 'facebook' ? best(d.facts, 'socials') : field === 'content' ? best(d.facts, d.segment.contentKind) : best(d.facts, field);
    if (!f || !String(initial[field] ?? '').trim()) return null;
    return <SourceBadge auto={f.source !== 'Operador'} source={f.source !== 'Operador' ? f.source : undefined} />;
  };

  function validate(s: number): boolean {
    if (!form) return false;
    const e: Record<string, string> = {};
    if (s === 0) {
      if (form.name.trim().length < 2) e.name = 'Informe o nome do estabelecimento.';
      if (!phoneOk(form.phone)) e.phone = 'Use o telefone com DDD. Ex.: (11) 3000-0000.';
      if (!phoneOk(form.whatsapp)) e.whatsapp = 'Use o número com DDD. Ex.: (11) 90000-0000.';
      if (!emailOk(form.email)) e.email = 'E-mail inválido. Ex.: contato@cafearoma.com.br';
      if (!socialOk(form.instagram)) e.instagram = 'Use o @usuário ou o link do perfil.';
      if (!socialOk(form.facebook)) e.facebook = 'Use o nome da página ou o link.';
    }
    if (s === 1 && form.brand_color && !/^#[0-9a-f]{6}$/i.test(form.brand_color)) e.brand_color = 'Cor no formato #RRGGBB.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function saveStep(s: number) {
    if (!form || !d) return;
    const changed = (k: string) => form[k] !== initial[k];
    const fact = (field: string, value: unknown) => api.post(`/api/businesses/${d.business.id}/facts`, { field, value });
    if (s === 0) {
      if (changed('name')) await fact('name', form.name.trim());
      if (changed('segment')) await api.patch(`/api/businesses/${d.business.id}`, { segment: form.segment });
      if (changed('address') && form.address.trim()) await fact('address', { formatted: form.address.trim() });
      if (changed('phone') && form.phone.trim()) await fact('phone', form.phone.trim());
      if (changed('whatsapp') && form.whatsapp.trim()) await fact('whatsapp', form.whatsapp.trim());
      if (changed('email') && form.email.trim()) await fact('email', form.email.trim());
      if (changed('opening_hours') && form.opening_hours.trim()) await fact('opening_hours', form.opening_hours.trim());
      if (changed('instagram') || changed('facebook')) {
        const cur = (best(d.facts, 'socials')?.value ?? {}) as Record<string, string>;
        const toUrl = (k: string, v: string) => (!v.trim() ? undefined : /^https?:/.test(v) ? v.trim() : `https://www.${k}.com/${v.trim().replace(/^@/, '')}`);
        await fact('socials', Object.fromEntries(Object.entries({ ...cur, instagram: toUrl('instagram', form.instagram), facebook: toUrl('facebook', form.facebook) }).filter(([, v]) => v)));
      }
    }
    if (s === 1 && changed('brand_color') && form.brand_color) await fact('brand_color', form.brand_color.toUpperCase());
    if (s === 2) {
      if (changed('description') && form.description.trim()) await fact('description', form.description.trim());
      if (changed('differentials')) await fact('differentials', form.differentials.split('\n').map((x) => x.trim()).filter(Boolean));
      if (changed('content') && form.content.trim()) {
        const kind = d.segment.contentKind;
        await fact(kind, kind === 'menu' ? parseGroups(form.content) : parseItems(form.content));
      }
    }
    setInitial(form);
    setConcepts(null); // dados mudaram: prévias precisam ser refeitas
  }

  async function go(to: number) {
    if (to > step && !validate(step)) return;
    setSaving(true);
    try {
      await saveStep(step);
      await reload();
      setStep(to);
      setVisited((v) => new Set(v).add(to));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (!d) return;
    setGenerating(true);
    try {
      await saveStep(step);
      const r = await api.post<{ site: { id: string }; aiError?: string }>(`/api/businesses/${d.business.id}/sites`, { concept: concept ?? undefined });
      if (r.aiError) notify(r.aiError, true);
      nav(`/estudio/${r.site.id}`);
    } catch (e: any) {
      notify(e.message, true);
      setGenerating(false);
    }
  }

  const resolveAsset = useMemo(() => {
    const ok = new Set((d?.assets ?? []).filter((a) => USABLE_RIGHTS.includes(a.rights)).map((a) => a.id));
    return (aid: string) => (ok.has(aid) ? `/api/assets/${aid}/file` : null);
  }, [d]);

  if (!d || !form) return <div className="page stack"><Skeleton h={56} /><Skeleton h={420} /></div>;
  const kind = d.segment.contentKind;
  const contentLabel = kind === 'menu' ? 'Cardápio' : kind === 'services' ? 'Serviços e preços' : 'Produtos em destaque';
  const logo = d.assets.find((a) => a.kind === 'logo' && USABLE_RIGHTS.includes(a.rights));
  const photos = d.assets.filter((a) => a.kind === 'photo' && USABLE_RIGHTS.includes(a.rights));
  const essentialsMissing = d.missing.filter((m) => m.importance === 'essential');

  return (
    <div className="page stack" style={{ gap: 16 }}>
      <div className="crumb"><Link to="/investigacao">Investigar</Link> / <Link to={`/investigacao/${d.business.id}`}>{d.business.name}</Link> / Criar site</div>
      <JourneyBar current={step < 3 ? 2 : 3} links={{ 1: `/investigacao/${d.business.id}` }} />

      <div className="wizard">
        <div className="card wsteps">
          {STEPS.map((s, i) => (
            <button key={s.t} className={`wstep ${i === step ? 'on' : visited.has(i) && i < step ? 'done' : ''}`} onClick={() => (i < step || visited.has(i) ? go(i) : i === step + 1 ? go(i) : undefined)}>
              <span className="n">{visited.has(i) && i < step ? <Icon name="check" size={14} /> : i + 1}</span>
              <span><b>{s.t}</b><small>{s.d}</small></span>
            </button>
          ))}
          <div className="small faint" style={{ padding: '10px 12px 4px' }}>Os dados encontrados na investigação já vêm preenchidos — só revise e complete.</div>
        </div>

        <div className="card wpanel">
          {step === 0 && (
            <>
              <header><h1 style={{ fontSize: 20 }}>Informações do negócio</h1><p>Esses dados aparecem no site (topo, contato, rodapé e botões). Só o nome é obrigatório.</p></header>
              <div className="grid g2">
                <Field label="Nome do estabelecimento" required error={errors.name} source={src('name')} example="Café Aroma"><input className={`input ${errors.name ? 'err' : ''}`} value={form.name} onChange={set('name')} /></Field>
                <Field label="Tipo de negócio" required hint="Define a estrutura do site e as seções."><select className="select" value={form.segment} onChange={set('segment')}>{config?.segments.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <Field label="Endereço completo" source={src('address')} hint="Mostrado no site com mapa e botão “Como chegar”." example="Rua Harmonia, 271, Vila Madalena, São Paulo - SP"><input className="input" value={form.address} onChange={set('address')} /></Field>
              </div>
              <div className="sep" />
              <h3 style={{ marginBottom: 12 }}>Contatos</h3>
              <div className="grid g2">
                <Field label="WhatsApp comercial" error={errors.whatsapp} source={src('whatsapp')} hint="Vira o botão principal do site e a barra fixa no celular. Confirme com o proprietário." example="(11) 90000-0000"><input className={`input ${errors.whatsapp ? 'err' : ''}`} value={form.whatsapp} onChange={set('whatsapp')} inputMode="tel" /></Field>
                <Field label="Telefone" error={errors.phone} source={src('phone')} example="(11) 3000-0000"><input className={`input ${errors.phone ? 'err' : ''}`} value={form.phone} onChange={set('phone')} inputMode="tel" /></Field>
                <Field label="Instagram" error={errors.instagram} source={src('instagram')} example="@cafearoma"><input className={`input ${errors.instagram ? 'err' : ''}`} value={form.instagram} onChange={set('instagram')} /></Field>
                <Field label="Facebook" error={errors.facebook} source={src('facebook')} example="facebook.com/cafearoma"><input className={`input ${errors.facebook ? 'err' : ''}`} value={form.facebook} onChange={set('facebook')} /></Field>
                <Field label="E-mail" error={errors.email} source={src('email')} example="contato@cafearoma.com.br"><input className={`input ${errors.email ? 'err' : ''}`} value={form.email} onChange={set('email')} inputMode="email" /></Field>
                <Field label="Horário de funcionamento" source={src('opening_hours')} hint="Aceita texto livre ou o formato do OpenStreetMap." example="Seg a Sex 8h às 18h; Sáb 9h às 14h"><input className="input" value={form.opening_hours} onChange={set('opening_hours')} /></Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <header><h1 style={{ fontSize: 20 }}>Identidade visual</h1><p>Logotipo, cores e fotos deixam o site com a cara do negócio. Use apenas materiais com autorização de uso.</p></header>
              <div className="grid g2" style={{ alignItems: 'start' }}>
                <div className="stack">
                  <div className="flabel">Logotipo <span className="opt">opcional</span></div>
                  {logo ? (
                    <div className="row" style={{ gap: 14 }}>
                      <div style={{ width: 88, height: 88, borderRadius: 14, border: '1px solid var(--line)', background: `#fff url(/api/assets/${logo.id}/file) center/contain no-repeat` }} />
                      <div className="stack" style={{ gap: 6 }}>
                        <span className="small muted">Cores detectadas no logotipo:</span>
                        <div className="row" style={{ gap: 6 }}>{(logo.palette ?? []).map((c) => <button key={c} type="button" title={`Usar ${c}`} onClick={() => setForm({ ...form, brand_color: c })} style={{ width: 28, height: 28, borderRadius: 8, border: form.brand_color === c ? '3px solid var(--brand)' : '1px solid var(--line2)', background: c, cursor: 'pointer' }} />)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="alert info small"><Icon name="info" size={14} />Sem logotipo, o site usa o nome em tipografia elegante. Envie o logo pelo painel abaixo (tipo “Logotipo”).</div>
                  )}
                </div>
                <Field label="Cor principal da marca" error={errors.brand_color} source={src('brand_color')} hint="Usada em botões e destaques. Vazio = paleta sugerida para o segmento.">
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input type="color" className="swatch" value={/^#[0-9a-f]{6}$/i.test(form.brand_color) ? form.brand_color : '#1a56db'} onChange={set('brand_color')} />
                    <input className={`input mono ${errors.brand_color ? 'err' : ''}`} placeholder="#6B3E26" value={form.brand_color} onChange={set('brand_color')} />
                    {form.brand_color && <button type="button" className="btn sm ghost" onClick={() => setForm({ ...form, brand_color: '' })}>Limpar</button>}
                  </div>
                </Field>
              </div>
              <div className="sep" />
              <div className="row between" style={{ marginBottom: 10 }}>
                <h3>Fotos e logotipo</h3>
                <span className={`tag ${photos.length >= 3 ? 'ok' : 'warn'}`}>{photos.length} foto(s) autorizada(s)</span>
              </div>
              <p className="small muted" style={{ marginBottom: 12 }}>Fotos reais são o que mais impressiona o proprietário: fachada, ambiente e produtos (3 a 6 fotos). Sem fotos, o site usa arte gráfica gerada — nunca imagens genéricas fingindo ser do local.</p>
              <AssetsPanel detail={d} onChange={reload} />
            </>
          )}

          {step === 2 && (
            <>
              <header><h1 style={{ fontSize: 20 }}>Conteúdo</h1><p>O que o negócio oferece. Cadastre apenas itens e preços divulgados pelo estabelecimento.</p></header>
              <Field label={contentLabel} source={src('content')} hint={kind === 'menu' ? 'Uma linha por item: Nome | descrição | preço. Use “# Categoria” para agrupar.' : 'Uma linha por item: Nome | descrição | preço | duração ou detalhe.'}>
                <textarea
                  className="textarea mono"
                  rows={9}
                  value={form.content}
                  onChange={set('content')}
                  placeholder={kind === 'menu' ? '# Cafés\nEspresso | Curto e encorpado | 7,00\nCappuccino | Leite vaporizado | 13,00\n\n# Doces\nPão de queijo | | 6,50' : kind === 'services' ? 'Corte masculino | Tesoura e máquina | 60,00 | 45 min\nBarba | Navalha e toalha quente | 45,00 | 30 min' : 'Camisa de linho | Várias cores | a partir de R$ 189'}
                />
              </Field>
              <div style={{ marginTop: 14 }}>
                <MenuPanel detail={d} onChange={reload} />
              </div>
              <div className="sep" />
              <div className="grid g2" style={{ alignItems: 'start' }}>
                <Field label="Descrição do negócio" source={src('description')} hint="Informada pelo proprietário. Sem ela, o site usa um texto modelo marcado para revisão." example="Cafeteria de bairro com cafés especiais e pães de fermentação natural.">
                  <textarea className="textarea" rows={5} value={form.description} onChange={set('description')} />
                </Field>
                <Field label="Diferenciais" source={src('differentials')} hint="Um por linha. Aparecem como destaques no site." example={'Pet friendly\nGrãos torrados na casa'}>
                  <textarea className="textarea" rows={5} value={form.differentials} onChange={set('differentials')} />
                </Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <header><h1 style={{ fontSize: 20 }}>Estilo do site</h1><p>Três propostas com composição, tipografia e hierarquia diferentes, já com os dados deste negócio. Você poderá trocar depois no editor.</p></header>
              {!concepts ? (
                <div className="concepts">{[0, 1, 2].map((i) => <div key={i} className="concept"><Skeleton h={180} r={10} /><div style={{ height: 10 }} /><Skeleton h={14} w="60%" /></div>)}</div>
              ) : (
                <div className="concepts">
                  {concepts.concepts.map((c) => (
                    <button type="button" key={c.id} className={`concept ${concept === c.id ? 'on' : ''}`} onClick={() => setConcept(c.id)}>
                      <div className="thumb"><MiniPreview spec={c.spec} resolveAsset={resolveAsset} width={1280} height={960} scale={0.2} /></div>
                      <div className="row between" style={{ marginTop: 10 }}>
                        <b style={{ color: 'var(--navy)' }}>{c.label}</b>
                        {concepts.recommended === c.id && <span className="tag brand">recomendado</span>}
                      </div>
                      <p className="small muted" style={{ marginTop: 4 }}>{c.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <header><h1 style={{ fontSize: 20 }}>Gerar e revisar</h1><p>Tudo pronto. A demonstração é criada como rascunho privado — nada é publicado nem enviado sem você.</p></header>
              <div className="grid g2" style={{ alignItems: 'start' }}>
                <div className="card card-pad stack" style={{ gap: 8, boxShadow: 'none' }}>
                  <h3>Resumo</h3>
                  <div className="small"><b>{form.name}</b> · {segmentLabel(form.segment)}</div>
                  <div className="small muted">{form.address || 'Endereço não informado'}</div>
                  <div className="small">Estilo: <b>{concepts?.concepts.find((c) => c.id === concept)?.label ?? 'recomendado para o segmento'}</b></div>
                  <div className="small">Fotos autorizadas: <b>{photos.length}</b> · Logotipo: <b>{logo ? 'sim' : 'não'}</b></div>
                </div>
                <div className="card card-pad stack" style={{ gap: 8, boxShadow: 'none' }}>
                  <h3>Pendências</h3>
                  {essentialsMissing.length === 0 ? (
                    <div className="small" style={{ color: 'var(--ok)' }}><Icon name="check" size={14} /> Nenhuma pendência essencial.</div>
                  ) : (
                    essentialsMissing.map((m) => <div key={m.field} className="small row" style={{ gap: 6 }}><Icon name="alert" size={14} style={{ color: 'var(--warn)' }} />{m.label}</div>)
                  )}
                  <p className="small faint">Itens faltantes ficam ocultos no site do cliente e aparecem como pendência no editor.</p>
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                {generating ? (
                  <Progress running steps={['Analisando o negócio e o público provável', 'Aplicando a direção visual escolhida', 'Montando as seções com os dados verificados', 'Avaliando a qualidade do resultado']} />
                ) : (
                  <button className="btn grad lg" onClick={generate}><Icon name="sparkle" />Gerar demonstração do site</button>
                )}
              </div>
            </>
          )}

          <div className="wfoot">
            <button className="btn" disabled={step === 0 || saving} onClick={() => go(step - 1)}><Icon name="back" size={16} />Voltar</button>
            {step < 4 && (
              <div className="row">
                {step >= 1 && step < 3 && <button className="btn ghost" disabled={saving} onClick={() => go(step + 1)}>Pular</button>}
                <button className="btn primary" disabled={saving || (step === 3 && !concept)} onClick={() => go(step + 1)}>{saving ? <Spinner /> : null}Salvar e continuar <Icon name="arrow" size={16} /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
