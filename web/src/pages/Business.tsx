import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, fmtDate, type BusinessX, type Detail } from '../lib/api.ts';
import { useApp, useLoad } from '../lib/context.tsx';
import { Empty, FactBadge, Score, Spinner, WebsiteBadge } from '../components/ui.tsx';
import { ASSET_RIGHTS_LABEL, USABLE_RIGHTS, type Asset, type Fact } from '../../../shared/types.ts';
import { groupsToText, itemsToText, parseGroups, parseItems } from '../lib/items.ts';
import { extractPalette } from '../lib/palette.ts';

const FIELD_LABEL: Record<string, string> = {
  name: 'Nome', address: 'Endereço', phone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', website: 'Site', socials: 'Redes sociais',
  platforms: 'Plataformas', opening_hours: 'Horário (OSM)', opening_hours_text: 'Horário (Google)', cuisine: 'Culinária', description: 'Descrição',
  menu_url: 'Link do cardápio', amenities: 'Comodidades', brand: 'Rede/marca', site_title: 'Título do site', brand_color: 'Cor da marca',
  business_status: 'Status (Google)', menu: 'Cardápio', services: 'Serviços', products: 'Produtos', differentials: 'Diferenciais', website_check: 'Verificação de site',
};

/* ---------- lista ---------- */

export function Investigations() {
  const { segmentLabel, stageLabel } = useApp();
  const [q, setQ] = useState('');
  const { data, loading } = useLoad<BusinessX[]>(`/api/businesses?saved=1&sort=recent${q ? `&q=${encodeURIComponent(q)}` : ''}`, [q]);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Investigação</h1><p>Estabelecimentos salvos, com as informações coletadas e suas fontes.</p></div>
        <input className="input" style={{ width: 260 }} placeholder="Filtrar por nome…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card">
        {data?.length ? (
          <table className="table">
            <thead><tr><th>Prior.</th><th>Estabelecimento</th><th>Site</th><th>Etapa</th><th>Investigado em</th></tr></thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id}>
                  <td><Score value={b.priorityScore} /></td>
                  <td><Link to={`/investigacao/${b.id}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{b.name}</Link><div className="small muted">{segmentLabel(b.segment)} · {b.address.suburb ?? b.address.city ?? ''}</div></td>
                  <td><WebsiteBadge status={b.websiteStatus} /></td>
                  <td><span className="tag">{stageLabel(b.stage)}</span></td>
                  <td className="small muted">{b.investigatedAt ? fmtDate(b.investigatedAt) : 'ainda não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title={loading ? 'Carregando…' : 'Nenhum estabelecimento salvo'}>Pesquise em <Link to="/explorar">Explorar negócios</Link> e clique em “Investigar”.</Empty>
        )}
      </div>
    </div>
  );
}

/* ---------- detalhe ---------- */

function renderValue(f: Fact) {
  const v = f.value as any;
  if (f.field === 'address') return v?.formatted ?? '—';
  if (f.field === 'website' || f.field === 'menu_url') return <a href={v} target="_blank" rel="noreferrer">{v}</a>;
  if (f.field === 'socials') return <div className="stack" style={{ gap: 2 }}>{Object.entries(v ?? {}).map(([k, u]) => <span key={k}>{k}: {String(u).startsWith('http') ? <a href={String(u)} target="_blank" rel="noreferrer">{String(u)}</a> : String(u)}</span>)}</div>;
  if (f.field === 'brand_color') return <span className="row"><span className="swatch" style={{ background: v, width: 18, height: 18 }} />{v}</span>;
  if (f.field === 'menu') return `${(v as any[]).reduce((n, g) => n + g.items.length, 0)} itens em ${(v as any[]).length} categoria(s)`;
  if (f.field === 'services' || f.field === 'products') return `${(v as any[]).length} itens`;
  if (Array.isArray(v)) return v.join(f.field === 'opening_hours_text' ? ' · ' : ', ');
  if (typeof v === 'object' && v) return JSON.stringify(v);
  return String(v);
}

export function BusinessPage() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const { config, notify, segmentLabel } = useApp();
  const { data: d, setData, reload, error } = useLoad<Detail>(`/api/businesses/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ source: string; status: string; message: string; facts: number }[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const autoRan = useRef(false);

  async function runInvestigation() {
    setBusy('investigate');
    try {
      const r = await api.post<{ steps: any[]; detail: Detail }>(`/api/businesses/${id}/investigate`);
      setSteps(r.steps);
      setData(r.detail);
      notify('Investigação concluída');
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (sp.get('investigar') === '1' && d && !autoRan.current) {
      autoRan.current = true;
      setSp({}, { replace: true });
      if (!d.business.investigatedAt) runInvestigation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  async function generate() {
    setBusy('generate');
    try {
      const r = await api.post<{ site: { id: string }; aiError?: string }>(`/api/businesses/${id}/sites`, {});
      if (r.aiError) notify(r.aiError, true);
      nav(`/estudio/${r.site.id}`);
    } catch (e: any) {
      notify(e.message, true);
      setBusy(null);
    }
  }

  async function patch(body: object) {
    try {
      setData(await api.patch<Detail>(`/api/businesses/${id}`, body));
    } catch (e: any) {
      notify(e.message, true);
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<string, Fact[]>();
    for (const f of d?.facts ?? []) m.set(f.field, [...(m.get(f.field) ?? []), f]);
    return [...m.entries()];
  }, [d]);

  if (error) return <div className="page"><div className="alert bad">{error}</div></div>;
  if (!d) return <div className="page"><Spinner /></div>;
  const b = d.business;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="small muted"><Link to="/investigacao">Investigação</Link> / {segmentLabel(b.segment)}</div>
          <div className="row" style={{ marginTop: 4 }}><h1>{b.name}</h1><Score value={b.priorityScore} /><WebsiteBadge status={b.websiteStatus} /></div>
          <p>{b.address.formatted ?? 'Endereço não informado'} · <span className="faint">{b.sourceAttribution}</span></p>
        </div>
        <div className="row">
          <select className="select" style={{ width: 190 }} value={b.stage} onChange={(e) => patch({ stage: e.target.value })}>
            {config?.stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="btn" onClick={runInvestigation} disabled={!!busy}>{busy === 'investigate' ? <><Spinner /> Investigando…</> : b.investigatedAt ? 'Investigar novamente' : 'Investigar'}</button>
          <button className="btn primary" onClick={generate} disabled={!!busy}>{busy === 'generate' ? <><Spinner /> Gerando site…</> : '✦ Gerar demonstração de site'}</button>
        </div>
      </div>

      {busy === 'investigate' && <div className="alert info" style={{ marginBottom: 14 }}>Consultando fontes autorizadas: OpenStreetMap{config?.integrations.googlePlaces ? ', Google Places' : ''} e o site oficial, quando houver…</div>}
      {steps && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Resultado da investigação</h3>
          {steps.map((s) => (
            <div key={s.source} className="row small" style={{ padding: '3px 0' }}>
              <span className={`tag ${s.status === 'ok' ? 'ok' : s.status === 'skipped' ? '' : 'bad'}`}>{s.status === 'ok' ? 'ok' : s.status === 'skipped' ? 'ignorado' : 'erro'}</span>
              <b>{s.source}</b><span className="muted">{s.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', alignItems: 'start' }}>
        <div className="stack" style={{ gap: 16 }}>
          <MenuPanel detail={d} onChange={reload} />
          <div className="card">
            <div className="card-head"><h2>Informações coletadas</h2><span className="small muted">Clique em “Editar” para corrigir qualquer dado — sua versão passa a valer</span></div>
            <div className="card-pad">
              {grouped.length === 0 && <Empty title="Nada coletado ainda">Clique em “Investigar” para consultar as fontes públicas.</Empty>}
              {grouped.map(([field, facts]) => (
                <div className="fact" key={field}>
                  <div className="k">{FIELD_LABEL[field] ?? field}</div>
                  <div className="stack" style={{ gap: 8 }}>
                    {facts.map((f) => (
                      <div key={f.id}>
                        {editing === f.id ? (
                          <FactEditor fact={f} onCancel={() => setEditing(null)} onSaved={() => (setEditing(null), reload())} />
                        ) : (
                        <div className="row" style={{ alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{renderValue(f)}</div>
                          <FactBadge status={f.status} />
                          {EDITABLE(f.field) && <button className="btn sm" onClick={() => setEditing(f.id)}>Editar</button>}
                          {f.status === 'unconfirmed' && <button className="btn sm" onClick={async () => (await api.post(`/api/facts/${f.id}/confirm`), reload())}>Confirmar</button>}
                          <button className="icon-btn" title="Descartar" onClick={async () => (await api.del(`/api/facts/${f.id}`), reload())}>✕</button>
                        </div>
                        )}
                        <div className="src">
                          {f.source}{f.sourceUrl && <> · <a href={f.sourceUrl} target="_blank" rel="noreferrer">ver fonte</a></>} · {fmtDate(f.retrievedAt)}
                          {f.note && <div style={{ color: 'var(--warn)' }}>{f.note}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SupplementForm detail={d} onSaved={reload} />
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head"><h2>Pendências</h2><span className="tag warn">{d.missing.length}</span></div>
            <div className="card-pad">
              {d.missing.length === 0 && <span className="muted">Tudo o que o segmento precisa foi informado.</span>}
              {d.missing.map((m) => (
                <div className="miss" key={m.field}>
                  <span className={`tag ${m.importance === 'essential' ? 'bad' : ''}`}>{m.importance === 'essential' ? 'essencial' : 'recomendado'}</span>
                  <div><b>{m.label}</b><div className="small muted">{m.hint}</div></div>
                </div>
              ))}
              <div className="sep" />
              <div className="small muted" style={{ marginBottom: 6 }}>Situação do site — confirme após verificar manualmente:</div>
              <div className="row">
                <button className="btn sm" onClick={() => patch({ websiteStatus: 'none_found' })}>Confirmei: não tem site</button>
                <button className="btn sm" onClick={() => patch({ websiteStatus: 'has_site' })}>Tem site</button>
              </div>
            </div>
          </div>

          <AssetsPanel detail={d} onChange={reload} />

          <div className="card">
            <div className="card-head"><h2>Demonstrações</h2></div>
            <div className="card-pad stack">
              {d.sites.map((s) => (
                <div className="row between" key={s.id}>
                  <div><Link to={`/estudio/${s.id}`} style={{ fontWeight: 600 }}>{s.name}</Link><div className="small faint">v{s.version} · {fmtDate(s.updatedAt)}</div></div>
                  <span className="tag">{s.status === 'draft' ? 'rascunho' : s.status === 'reviewed' ? 'revisada' : 'aprovada'}</span>
                </div>
              ))}
              {!d.sites.length && <span className="muted small">Nenhuma demonstração criada.</span>}
            </div>
          </div>

          <ActivityPanel detail={d} onChange={reload} />
          <button className="btn danger" onClick={async () => {
            if (!confirm('Excluir este estabelecimento e todos os dados, arquivos e demonstrações? (LGPD: exclusão definitiva)')) return;
            await api.del(`/api/businesses/${b.id}`);
            nav('/investigacao');
          }}>Excluir dados do estabelecimento</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- complementação manual ---------- */

function SupplementForm({ detail, onSaved }: { detail: Detail; onSaved: () => void }) {
  const { notify } = useApp();
  const best = (field: string) => detail.facts.find((f) => f.field === field && f.status === 'user_provided')?.value ?? detail.facts.find((f) => f.field === field)?.value;
  const kind = detail.segment.contentKind;
  const [tab, setTab] = useState<string>('contato');
  const [v, setV] = useState(() => ({
    phone: (best('phone') as string) ?? '',
    whatsapp: (best('whatsapp') as string) ?? '',
    email: (best('email') as string) ?? '',
    instagram: ((best('socials') as any)?.instagram as string) ?? '',
    facebook: ((best('socials') as any)?.facebook as string) ?? '',
    opening_hours: (best('opening_hours') as string) ?? '',
    description: detail.facts.find((f) => f.field === 'description' && f.status === 'user_provided')?.value as string ?? '',
    differentials: ((best('differentials') as string[]) ?? []).join('\n'),
    menu: groupsToText(best('menu') as any),
    services: itemsToText(best('services') as any),
    products: itemsToText(best('products') as any),
  }));
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function save(field: string, value: unknown) {
    try {
      await api.post(`/api/businesses/${detail.business.id}/facts`, { field, value });
      notify('Informação salva');
      onSaved();
    } catch (e: any) {
      notify(e.message, true);
    }
  }

  const tabs: [string, string][] = [['contato', 'Contato'], ['sobre', 'Sobre e horários'], ['conteudo', kind === 'menu' ? 'Cardápio' : kind === 'services' ? 'Serviços' : 'Produtos']];
  if (detail.business.segment === 'pet_shop') tabs.push(['produtos', 'Produtos']);

  return (
    <div className="card">
      <div className="card-head"><h2>Complementar informações</h2><span className="small muted">Dados marcados como “informado por você”</span></div>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="card-pad stack">
        {tab === 'contato' && (
          <>
            <div className="grid g2">
              <label className="field"><span>Telefone comercial</span><input className="input" value={v.phone} onChange={set('phone')} /></label>
              <label className="field"><span>WhatsApp comercial (confirmado)</span><input className="input" value={v.whatsapp} onChange={set('whatsapp')} placeholder="(11) 9xxxx-xxxx" /></label>
              <label className="field"><span>E-mail comercial</span><input className="input" value={v.email} onChange={set('email')} /></label>
              <span />
              <label className="field"><span>Instagram</span><input className="input" value={v.instagram} onChange={set('instagram')} placeholder="https://instagram.com/…" /></label>
              <label className="field"><span>Facebook</span><input className="input" value={v.facebook} onChange={set('facebook')} /></label>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary" onClick={async () => {
                if (v.phone) await save('phone', v.phone);
                if (v.whatsapp) await save('whatsapp', v.whatsapp);
                if (v.email) await save('email', v.email);
                const socials = Object.fromEntries(Object.entries({ instagram: v.instagram, facebook: v.facebook }).filter(([, x]) => x));
                if (Object.keys(socials).length) await save('socials', { ...((best('socials') as object) ?? {}), ...socials });
              }}>Salvar contato</button>
            </div>
          </>
        )}
        {tab === 'sobre' && (
          <>
            <label className="field"><span>Descrição do negócio (informada pelo proprietário)</span><textarea className="textarea" rows={4} value={v.description} onChange={set('description')} placeholder="História, proposta e o que o dono destaca." /></label>
            <label className="field"><span>Diferenciais (um por linha)</span><textarea className="textarea" rows={3} value={v.differentials} onChange={set('differentials')} placeholder={'Grãos torrados na casa\nAmbiente pet friendly'} /></label>
            <label className="field"><span>Horário de funcionamento</span><input className="input" value={v.opening_hours} onChange={set('opening_hours')} placeholder="Mo-Fr 08:00-18:00; Sa 09:00-14:00" /><span className="help">Formato OSM (Mo, Tu, We, Th, Fr, Sa, Su) é convertido automaticamente; texto livre também é aceito.</span></label>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary" onClick={async () => {
                if (v.description.trim()) await save('description', v.description.trim());
                const diffs = v.differentials.split('\n').map((x) => x.trim()).filter(Boolean);
                if (diffs.length) await save('differentials', diffs);
                if (v.opening_hours.trim()) await save('opening_hours', v.opening_hours.trim());
              }}>Salvar</button>
            </div>
          </>
        )}
        {tab === 'conteudo' && kind === 'menu' && (
          <>
            <label className="field">
              <span>Cardápio</span>
              <textarea className="textarea mono" rows={10} value={v.menu} onChange={set('menu')} placeholder={'# Cafés\nEspresso | Café curto e encorpado | 7,00\nCappuccino | | 12,00\n\n# Doces\nPão de queijo | | 6,50'} />
              <span className="help">Uma linha por item: <b>Nome | descrição | preço</b>. Use <b># Categoria</b> para agrupar. Cadastre apenas itens e preços divulgados pelo estabelecimento.</span>
            </label>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={() => save('menu', parseGroups(v.menu))}>Salvar cardápio</button></div>
          </>
        )}
        {((tab === 'conteudo' && kind !== 'menu') || tab === 'produtos') && (() => {
          const key = tab === 'produtos' || kind === 'products' ? 'products' : 'services';
          return (
            <>
              <label className="field">
                <span>{key === 'services' ? 'Serviços' : 'Produtos'}</span>
                <textarea className="textarea mono" rows={8} value={v[key]} onChange={set(key)} placeholder={key === 'services' ? 'Corte masculino | Tesoura e máquina | 50,00 | 40 min\nBarba | Toalha quente | 35,00 | 30 min' : 'Camiseta básica | Algodão | 79,90'} />
                <span className="help">Uma linha por item: <b>Nome | descrição | preço | extra</b> (duração, tamanho…).</span>
              </label>
              <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" onClick={() => save(key, parseItems(v[key]))}>Salvar</button></div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

/* ---------- arquivos ---------- */

function AssetsPanel({ detail, onChange }: { detail: Detail; onChange: () => void }) {
  const { notify } = useApp();
  const [kind, setKind] = useState('photo');
  const [rights, setRights] = useState('authorized');
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('kind', kind);
        fd.append('rights', rights);
        fd.append('source', 'Enviado pelo operador');
        fd.append('file', file);
        const a = await api.upload<Asset>(`/api/businesses/${detail.business.id}/assets`, fd);
        if (a.kind === 'logo' && a.mime.startsWith('image/') && a.mime !== 'image/svg+xml') {
          const palette = await extractPalette(`/api/assets/${a.id}/file`).catch(() => []);
          if (palette.length) await api.patch(`/api/assets/${a.id}`, { palette });
        }
      }
      notify('Arquivo(s) enviado(s)');
      onChange();
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="card">
      <div className="card-head"><h2>Arquivos e imagens</h2><span className="small muted">{detail.assets.length}</span></div>
      <div className="card-pad stack">
        <div className="grid g2">
          <label className="field"><span>Tipo</span><select className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="photo">Foto</option><option value="logo">Logotipo</option><option value="menu">Cardápio (arquivo)</option><option value="document">Documento</option></select></label>
          <label className="field"><span>Direitos de uso</span><select className="select" value={rights} onChange={(e) => setRights(e.target.value)}>{Object.entries(ASSET_RIGHTS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        <input ref={input} type="file" multiple accept="image/*,application/pdf" onChange={(e) => upload(e.target.files)} hidden />
        <button className="btn" onClick={() => input.current?.click()} disabled={uploading}>{uploading ? <><Spinner /> Enviando…</> : 'Enviar arquivos'}</button>
        <div className="small faint">Só arquivos com uso autorizado (ou produzidos por você) aparecem nos sites. Os demais ficam como referência.</div>
        <div className="assets">
          {detail.assets.map((a) => (
            <div className="asset" key={a.id}>
              <div className="thumb" style={a.mime.startsWith('image/') ? { backgroundImage: `url(/api/assets/${a.id}/file)` } : undefined}>{!a.mime.startsWith('image/') && 'PDF'}</div>
              <div className="meta">
                <div className="row between"><span className="tag">{a.kind}</span><button className="icon-btn" onClick={async () => (await api.del(`/api/assets/${a.id}`), onChange())}>✕</button></div>
                <select className="select" style={{ height: 28, fontSize: 12 }} value={a.rights} onChange={async (e) => (await api.patch(`/api/assets/${a.id}`, { rights: e.target.value }), onChange())}>
                  {Object.entries(ASSET_RIGHTS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {!USABLE_RIGHTS.includes(a.rights) && <span className="small" style={{ color: 'var(--warn)' }}>Não será usado no site</span>}
                {a.palette && <div className="row" style={{ gap: 3 }}>{a.palette.map((c) => <span key={c} title={c} style={{ width: 14, height: 14, borderRadius: 3, background: c }} />)}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityPanel({ detail, onChange }: { detail: Detail; onChange: () => void }) {
  const [note, setNote] = useState('');
  return (
    <div className="card">
      <div className="card-head"><h2>Histórico</h2></div>
      <div className="card-pad stack">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input" placeholder="Registrar anotação (ex.: liguei, pediu proposta)…" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn" disabled={!note.trim()} onClick={async () => (await api.post(`/api/businesses/${detail.business.id}/notes`, { message: note }), setNote(''), onChange())}>Adicionar</button>
        </div>
        <div className="timeline">
          {detail.activities.map((a) => (
            <div className="it" key={a.id}><div><div className="small">{a.message}</div><div className="small faint">{fmtDate(a.createdAt)}</div></div></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- edição de qualquer informação ---------- */

const EDITABLE = (field: string) => !['website_check', 'business_status', 'brand'].includes(field);
const LIST_FIELDS = new Set(['cuisine', 'amenities', 'differentials', 'opening_hours_text', 'platforms']);

function toText(f: Fact): string {
  const v = f.value as any;
  if (f.field === 'address') return v?.formatted ?? (typeof v === 'string' ? v : '');
  if (f.field === 'socials') return Object.entries(v ?? {}).map(([k, u]) => `${k}: ${u}`).join('\n');
  if (f.field === 'menu') return groupsToText(v);
  if (f.field === 'services' || f.field === 'products') return itemsToText(v);
  if (Array.isArray(v)) return v.join('\n');
  return v == null ? '' : String(v);
}

function fromText(field: string, text: string): unknown {
  const t = text.trim();
  if (field === 'address') return { formatted: t };
  if (field === 'socials') {
    return Object.fromEntries(
      t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const i = l.indexOf(':');
        const k = i > 0 && !l.slice(0, i).includes('/') ? l.slice(0, i).trim().toLowerCase() : 'link';
        return [k, (i > 0 && k !== 'link' ? l.slice(i + 1) : l).trim()];
      }),
    );
  }
  if (field === 'menu') return parseGroups(text);
  if (field === 'services' || field === 'products') return parseItems(text);
  if (LIST_FIELDS.has(field)) return t.split('\n').map((x) => x.trim()).filter(Boolean);
  return t;
}

const EDIT_HELP: Record<string, string> = {
  socials: 'Uma rede por linha, ex.: instagram: https://instagram.com/perfil',
  menu: 'Uma linha por item: Nome | descrição | preço. Use “# Categoria” para agrupar.',
  services: 'Uma linha por item: Nome | descrição | preço | duração.',
  products: 'Uma linha por item: Nome | descrição | preço.',
  opening_hours: 'Ex.: Mo-Fr 08:00-18:00; Sa 09:00-14:00 — ou texto livre.',
  menu_url: 'Link começando com https://',
};

function FactEditor({ fact, onCancel, onSaved }: { fact: Fact; onCancel: () => void; onSaved: () => void }) {
  const { notify } = useApp();
  const [text, setText] = useState(() => toText(fact));
  const [busy, setBusy] = useState(false);
  const multiline = LIST_FIELDS.has(fact.field) || ['socials', 'menu', 'services', 'products', 'description', 'address'].includes(fact.field) || text.length > 60;
  async function save() {
    setBusy(true);
    try {
      await api.post(`/api/businesses/${fact.businessId}/facts`, { field: fact.field, value: fromText(fact.field, text), note: fact.status === 'user_provided' ? undefined : `Corrigido pelo operador (antes: ${fact.source})` });
      notify('Informação atualizada');
      onSaved();
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      {multiline ? (
        <textarea className={`textarea ${['menu', 'services', 'products'].includes(fact.field) ? 'mono' : ''}`} rows={['menu', 'services', 'products'].includes(fact.field) ? 8 : 3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      ) : (
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
      )}
      {EDIT_HELP[fact.field] && <span className="small faint">{EDIT_HELP[fact.field]}</span>}
      <div className="row">
        <button className="btn primary sm" disabled={busy} onClick={save}>Salvar</button>
        <button className="btn sm" onClick={onCancel}>Cancelar</button>
        <span className="small faint">O dado original continua registrado com a fonte.</span>
      </div>
    </div>
  );
}

/* ---------- cardápio: link ou arquivo (sempre disponível) ---------- */

const DOC_TITLE: Record<string, [string, string]> = {
  menu: ['Cardápio', 'cardápio'],
  services: ['Tabela de serviços e preços', 'tabela de preços'],
  products: ['Catálogo de produtos', 'catálogo'],
};

function MenuPanel({ detail, onChange }: { detail: Detail; onChange: () => void }) {
  const { notify } = useApp();
  const [title, noun] = DOC_TITLE[detail.segment.contentKind] ?? DOC_TITLE.menu!;
  const [link, setLink] = useState('');
  const [rights, setRights] = useState('authorized');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const links = detail.facts.filter((f) => f.field === 'menu_url');
  const files = detail.assets.filter((a) => a.kind === 'menu');

  async function addLink() {
    const url = link.trim();
    if (!url) return;
    setBusy(true);
    try {
      await api.post(`/api/businesses/${detail.business.id}/facts`, { field: 'menu_url', value: /^https?:\/\//i.test(url) ? url : `https://${url}` });
      setLink('');
      notify('Link do cardápio salvo');
      onChange();
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function upload(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!/^(application\/pdf|image\/)/.test(file.type)) return notify('Envie um PDF ou uma imagem (JPG, PNG, WEBP).', true);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('kind', 'menu');
      fd.append('rights', rights);
      fd.append('source', 'Enviado pelo operador');
      fd.append('file', file);
      await api.upload(`/api/businesses/${detail.business.id}/assets`, fd);
      notify('Arquivo do cardápio enviado');
      onChange();
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="card">
      <div className="card-head"><h2>{title}</h2><span className="small muted">Link ou PDF — aparece no site como “Ver {noun}”</span></div>
      <div className="card-pad stack" style={{ gap: 12 }}>
        <div
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => (e.preventDefault(), setOver(false), upload(e.dataTransfer.files))}
          style={{ border: `2px dashed ${over ? 'var(--brand)' : 'var(--line2)'}`, background: over ? 'var(--brand-soft)' : '#fafbfc', borderRadius: 10, padding: '22px 16px', textAlign: 'center', cursor: 'pointer' }}
        >
          {busy ? <Spinner /> : <><b>Arraste o PDF do {noun} aqui</b><div className="small muted">ou clique para escolher (PDF, JPG, PNG — até 15 MB)</div></>}
        </div>
        <input ref={input} type="file" accept="application/pdf,image/*" hidden onChange={(e) => upload(e.target.files)} />
        <label className="row small" style={{ gap: 8 }}>
          Direitos de uso:
          <select className="select" style={{ width: 'auto', height: 30 }} value={rights} onChange={(e) => setRights(e.target.value)}>
            {Object.entries(ASSET_RIGHTS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input" placeholder={`Ou cole o link do ${noun} (ex.: https://…)`} value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
          <button className="btn" disabled={busy || !link.trim()} onClick={addLink}>Salvar link</button>
        </div>

        {(links.length > 0 || files.length > 0) && <div className="sep" style={{ margin: '4px 0' }} />}
        {links.map((f) => (
          <div key={f.id} className="row" style={{ flexWrap: 'nowrap' }}>
            <span className="tag info">link</span>
            <a href={String(f.value)} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(f.value)}</a>
            <span className="small faint">{f.source}</span>
            <button className="icon-btn" title="Remover" onClick={async () => (await api.del(`/api/facts/${f.id}`), onChange())}>✕</button>
          </div>
        ))}
        {files.map((a) => (
          <div key={a.id} className="row" style={{ flexWrap: 'nowrap' }}>
            <span className="tag brand">{a.mime === 'application/pdf' ? 'PDF' : 'imagem'}</span>
            <a href={`/api/assets/${a.id}/file`} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</a>
            <select className="select" style={{ width: 'auto', height: 28, fontSize: 12 }} value={a.rights} onChange={async (e) => (await api.patch(`/api/assets/${a.id}`, { rights: e.target.value }), onChange())}>
              {Object.entries(ASSET_RIGHTS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button className="icon-btn" title="Remover" onClick={async () => (await api.del(`/api/assets/${a.id}`), onChange())}>✕</button>
          </div>
        ))}
        {files.some((a) => !USABLE_RIGHTS.includes(a.rights)) && <div className="small" style={{ color: 'var(--warn)' }}>Arquivos sem uso autorizado não aparecem no site.</div>}
        <p className="small faint">Depois de anexar, gere a demonstração (ou use “Regenerar” no Estúdio) para o botão aparecer no site. Para mostrar os itens um a um no site, cadastre-os em “Complementar informações”.</p>
      </div>
    </div>
  );
}
