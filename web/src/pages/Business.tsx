import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, fmtDate, type BusinessX, type Detail } from '../lib/api.ts';
import { useApp, useLoad } from '../lib/context.tsx';
import { Empty, FactBadge, JourneyBar, PageHead, Progress, Score, Skeleton, SourceBadge, Spinner, WebsiteBadge } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { ASSET_RIGHTS_LABEL, USABLE_RIGHTS, type Asset, type Fact } from '../../../shared/types.ts';
import { groupsToText, itemsToText, parseGroups, parseItems } from '../lib/items.ts';
import { extractPalette } from '../lib/palette.ts';
import { parseOpeningHours } from '../../../shared/hours.ts';

const FIELD_LABEL: Record<string, string> = {
  name: 'Nome', address: 'Endereço', phone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', website: 'Site', socials: 'Redes sociais',
  platforms: 'Plataformas', opening_hours: 'Horário', opening_hours_text: 'Horário (Google)', cuisine: 'Culinária', description: 'Descrição',
  menu_url: 'Link do cardápio', amenities: 'Comodidades', brand: 'Rede/marca', site_title: 'Título do site', brand_color: 'Cor da marca',
  business_status: 'Status (Google)', menu: 'Cardápio', services: 'Serviços', products: 'Produtos', differentials: 'Diferenciais', website_check: 'Verificação de site',
};

/* ---------- lista ---------- */

export function Investigations() {
  const { segmentLabel, stageLabel } = useApp();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'todo' | 'ready' | 'demo'>('all');
  const { data, loading } = useLoad<(BusinessX & { sites?: number })[]>(`/api/businesses?saved=1&sort=recent${q ? `&q=${encodeURIComponent(q)}` : ''}`, [q]);
  const list = (data ?? []).filter((b) => (filter === 'todo' ? !b.investigatedAt : filter === 'ready' ? b.investigatedAt && !b.sites : filter === 'demo' ? (b.sites ?? 0) > 0 : true));
  return (
    <div className="page">
      <PageHead
        crumb={<><span className="tag info">Etapa 2</span> Fluxo de trabalho</>}
        title="Investigar"
        subtitle="Suas oportunidades salvas: veja o que foi encontrado sobre cada negócio e crie o site quando estiver pronto."
        actions={<div className="row" style={{ flexWrap: 'nowrap' }}><Icon name="search" className="faint" /><input className="input" style={{ width: 240 }} placeholder="Filtrar por nome…" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      />
      <div className="toolbar">
        <div className="seg">
          {([['all', 'Todas'], ['todo', 'A investigar'], ['ready', 'Prontas para criar site'], ['demo', 'Com demonstração']] as const).map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="card">
        {list.length ? (
          <table className="table">
            <thead><tr><th>Prioridade</th><th>Estabelecimento</th><th>Site</th><th>Etapa</th><th>Próximo passo</th></tr></thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id}>
                  <td><Score value={b.priorityScore} /></td>
                  <td><Link to={`/investigacao/${b.id}`} style={{ fontWeight: 700, color: 'var(--navy)' }}>{b.name}</Link><div className="small muted">{segmentLabel(b.segment)} · {b.address.suburb ?? b.address.city ?? ''}</div></td>
                  <td><WebsiteBadge status={b.websiteStatus} quality={b.websiteQuality} /></td>
                  <td><span className="tag">{stageLabel(b.stage)}</span></td>
                  <td>
                    {!b.investigatedAt ? <Link className="btn sm" to={`/investigacao/${b.id}?investigar=1`}>Investigar</Link> : (b.sites ?? 0) > 0 ? <Link className="btn sm" to={`/investigacao/${b.id}`}>Ver demonstração</Link> : <Link className="btn sm primary" to={`/criar/${b.id}`}>Criar site</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title={loading ? 'Carregando…' : 'Nenhuma oportunidade aqui'} icon="investigate">Encontre negócios em <Link to="/explorar">Encontrar negócios</Link> e clique em “Investigar”.</Empty>
        )}
      </div>
    </div>
  );
}

/* ---------- detalhe ---------- */

function renderValue(f: Fact) {
  const v = f.value as any;
  if (f.field === 'address') return v?.formatted ?? (typeof v === 'string' ? v : '—');
  if (f.field === 'website' || f.field === 'menu_url') return <a href={v} target="_blank" rel="noreferrer">{v}</a>;
  if (f.field === 'socials') return <div className="stack" style={{ gap: 2 }}>{Object.entries(v ?? {}).map(([k, u]) => <span key={k}>{k}: {String(u).startsWith('http') ? <a href={String(u)} target="_blank" rel="noreferrer">{String(u)}</a> : String(u)}</span>)}</div>;
  if (f.field === 'opening_hours' && typeof v === 'string') {
    const rows = parseOpeningHours(v);
    return rows ? rows.map((r) => `${r.days}: ${r.hours}`).join(' · ') : v;
  }
  if (f.field === 'brand_color') return <span className="row"><span className="swatch" style={{ background: v, width: 18, height: 18 }} />{v}</span>;
  if (f.field === 'menu') return `${(v as any[]).reduce((n, g) => n + g.items.length, 0)} itens em ${(v as any[]).length} categoria(s)`;
  if (f.field === 'services' || f.field === 'products') return `${(v as any[]).length} itens`;
  if (Array.isArray(v)) return v.join(f.field === 'opening_hours_text' ? ' · ' : ', ');
  if (typeof v === 'object' && v) return JSON.stringify(v);
  return String(v);
}

/** Em que ponto da jornada o negócio está. */
export function journeyStep(d: Detail) {
  if (!d.business.investigatedAt) return 1;
  if (!d.sites.length) return d.missing.some((m) => m.importance === 'essential') ? 2 : 3;
  if (d.sites.some((s) => s.status !== 'draft')) return 5;
  return 4;
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
  const [tab, setTab] = useState<'info' | 'materials' | 'history'>('info');
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

  if (error) return <div className="page"><div className="alert bad"><Icon name="alert" />{error}</div></div>;
  if (!d) return <div className="page stack"><Skeleton h={60} /><Skeleton h={140} /><Skeleton h={300} /></div>;
  const b = d.business;
  const step = journeyStep(d);
  const essentials = d.segment.checklist.filter((c) => c.importance === 'essential');
  const recommended = d.segment.checklist.filter((c) => c.importance === 'recommended');
  const missingSet = new Set(d.missing.map((m) => m.field));
  const hasBasics = !!(b.name && (b.address.formatted || b.address.street));
  const readyPct = Math.round(((d.segment.checklist.length - d.missing.length + (hasBasics ? 1 : 0)) / (d.segment.checklist.length + 1)) * 100);
  const lastSite = d.sites[0];

  return (
    <div className="page stack" style={{ gap: 16 }}>
      <div className="crumb"><Link to="/investigacao">Investigar</Link> / {segmentLabel(b.segment)}</div>
      <JourneyBar current={step} links={{ 0: '/explorar', 2: `/criar/${b.id}`, 3: `/criar/${b.id}?etapa=5`, ...(lastSite ? { 4: `/estudio/${lastSite.id}` } : {}) }} />

      <div className="card hero-biz">
        <div className="av">{b.name.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}><h1 style={{ fontSize: 22 }}>{b.name}</h1><Score value={b.priorityScore} /><WebsiteBadge status={b.websiteStatus} quality={b.websiteQuality} /></div>
          <div className="muted" style={{ marginTop: 4 }}>{segmentLabel(b.segment)} · {b.address.formatted ?? 'Endereço não informado'}</div>
          <div className="small faint" style={{ marginTop: 2 }}>{b.sourceAttribution}{b.investigatedAt ? ` · investigado em ${fmtDate(b.investigatedAt)}` : ' · ainda não investigado'}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={runInvestigation} disabled={!!busy}>{busy === 'investigate' ? <><Spinner /> Investigando…</> : <><Icon name="refresh" size={16} />{b.investigatedAt ? 'Investigar de novo' : 'Investigar agora'}</>}</button>
          {lastSite ? (
            <>
              <Link className="btn" to={`/criar/${b.id}`}><Icon name="edit" size={16} />Revisar dados</Link>
              <Link className="btn primary" to={`/estudio/${lastSite.id}`}><Icon name="studio" size={16} />Abrir demonstração</Link>
            </>
          ) : (
            <button className="btn grad" disabled={!!busy || !b.investigatedAt} title={!b.investigatedAt ? 'Investigue primeiro' : ''} onClick={() => nav(`/criar/${b.id}`)}><Icon name="studio" size={16} />Criar site</button>
          )}
        </div>
      </div>

      {busy === 'investigate' && (
        <div className="card card-pad">
          <Progress running steps={['Consultando o OpenStreetMap', config?.integrations.googlePlaces ? 'Confirmando no Google Places' : 'Verificando outras fontes configuradas', 'Lendo o site oficial, se existir', 'Organizando as informações e pendências']} />
        </div>
      )}
      {steps && !busy && (
        <div className="card card-pad">
          <h3 style={{ marginBottom: 8 }}>Resultado da investigação</h3>
          {steps.map((s) => (
            <div key={s.source} className="row small" style={{ padding: '4px 0', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <span className={`tag ${s.status === 'ok' ? 'ok' : s.status === 'skipped' ? '' : 'bad'}`}>{s.status === 'ok' ? 'ok' : s.status === 'skipped' ? 'não usado' : 'erro'}</span>
              <b style={{ whiteSpace: 'nowrap' }}>{s.source}</b><span className="muted">{s.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', alignItems: 'start' }}>
        <div className="card">
          <div className="tabs">
            <button className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}><Icon name="investigate" size={15} />Informações encontradas <span className="cnt">{d.facts.length}</span></button>
            <button className={tab === 'materials' ? 'on' : ''} onClick={() => setTab('materials')}><Icon name="image" size={15} />Fotos, logo e cardápio <span className="cnt">{d.assets.length}</span></button>
            <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}><Icon name="clock" size={15} />Histórico</button>
          </div>
          {tab === 'info' && (
            <div className="card-pad">
              <div className="row small muted" style={{ marginBottom: 6 }}><SourceBadge auto /> encontrado em fonte pública · <SourceBadge auto={false} /> informado por você · clique em “Editar” para corrigir</div>
              {grouped.length === 0 && <Empty title="Nada coletado ainda" icon="investigate">Clique em “Investigar agora” para consultar as fontes públicas.</Empty>}
              {grouped.map(([field, facts]) => (
                <div className="fact" key={field}>
                  <div className="k">{FIELD_LABEL[field] ?? field}</div>
                  <div className="stack" style={{ gap: 8 }}>
                    {facts.map((f) => (
                      <div key={f.id}>
                        {editing === f.id ? (
                          <FactEditor fact={f} onCancel={() => setEditing(null)} onSaved={() => (setEditing(null), reload())} />
                        ) : (
                          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                            <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{renderValue(f)}</div>
                            {f.status === 'unconfirmed' && <FactBadge status={f.status} />}
                            {f.status === 'unconfirmed' && <button className="btn sm" onClick={async () => (await api.post(`/api/facts/${f.id}/confirm`), reload())}>Confirmar</button>}
                            {EDITABLE(f.field) && <button className="btn sm" onClick={() => setEditing(f.id)}>Editar</button>}
                            <button className="icon-btn" title="Descartar" onClick={async () => (await api.del(`/api/facts/${f.id}`), reload())}><Icon name="x" size={15} /></button>
                          </div>
                        )}
                        <div className="src row" style={{ gap: 6 }}>
                          <SourceBadge auto={f.source !== 'Operador'} source={f.source !== 'Operador' ? f.source : undefined} />
                          {f.sourceUrl && <a href={f.sourceUrl} target="_blank" rel="noreferrer">ver na fonte</a>}<span>{fmtDate(f.retrievedAt)}</span>
                          {f.note && <div style={{ color: 'var(--warn)' }}>{f.note}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === 'materials' && (
            <div className="card-pad stack" style={{ gap: 16 }}>
              <MenuPanel detail={d} onChange={reload} />
              <AssetsPanel detail={d} onChange={reload} />
            </div>
          )}
          {tab === 'history' && <div className="card-pad"><ActivityPanel detail={d} onChange={reload} /></div>}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <div className="row between"><h2>Pronto para criar o site?</h2><span className="tag info">{readyPct}%</span></div>
            <div className="bar"><div style={{ width: `${readyPct}%` }} /></div>
            <div className="ready">
              <div className={`ri ${hasBasics ? 'ok' : 'no ess'}`}><span className="b"><Icon name={hasBasics ? 'check' : 'alert'} size={12} /></span><span style={{ flex: 1 }}>Nome e endereço</span><span className="small faint">básico</span></div>
              {[...essentials, ...recommended].map((c) => {
                const ok = !missingSet.has(c.field);
                return (
                  <div key={c.field} className={`ri ${ok ? 'ok' : 'no'} ${c.importance === 'essential' ? 'ess' : ''}`} title={c.hint}>
                    <span className="b"><Icon name={ok ? 'check' : c.importance === 'essential' ? 'alert' : 'plus'} size={12} /></span>
                    <span style={{ flex: 1 }}>{c.label}</span>
                    <span className="small faint">{c.importance === 'essential' ? 'essencial' : 'recomendado'}</span>
                  </div>
                );
              })}
            </div>
            <p className="small muted">Nada aqui é obrigatório para gerar a primeira versão: o que faltar fica como pendência no editor e não aparece para o cliente.</p>
            <Link className="btn primary" to={`/criar/${b.id}`}><Icon name="edit" size={16} />{d.missing.length ? 'Completar e criar o site' : 'Revisar e criar o site'}</Link>
          </div>

          <div className="card card-pad stack" style={{ gap: 10 }}>
            <h2>Situação do site atual</h2>
            <div className="row"><WebsiteBadge status={b.websiteStatus} quality={b.websiteQuality} />{b.website && <a className="small" href={b.website} target="_blank" rel="noreferrer">{b.website.replace(/^https?:\/\//, '')}</a>}</div>
            {b.websiteNotes?.issues?.length ? (
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{b.websiteNotes.issues.map((i) => <li key={i}>{i}</li>)}</ul>
            ) : null}
            {b.websiteStatus === 'unverified' && <p className="small muted">Nenhuma fonte registrou site, mas isso não prova que não exista. Faça uma busca rápida no Google pelo nome e confirme:</p>}
            <div className="row">
              <button className="btn sm" onClick={() => patch({ websiteStatus: 'none_found' })}><Icon name="check" size={14} />Confirmei: não tem site</button>
              <button className="btn sm" onClick={() => patch({ websiteStatus: 'has_site' })}><Icon name="globe" size={14} />Tem site</button>
            </div>
          </div>

          <div className="card card-pad stack" style={{ gap: 10 }}>
            <h2>Demonstrações</h2>
            {d.sites.map((s) => (
              <div className="row between" key={s.id}>
                <div><Link to={`/estudio/${s.id}`} style={{ fontWeight: 700 }}>{s.name}</Link><div className="small faint">versão {s.version} · {fmtDate(s.updatedAt)}</div></div>
                <span className="tag">{({ draft: 'rascunho', reviewed: 'revisada', approved_by_client: 'aprovada', published: 'no ar' } as Record<string, string>)[s.status]}</span>
              </div>
            ))}
            {!d.sites.length && <span className="muted small">Nenhuma demonstração ainda.</span>}
          </div>

          <div className="card card-pad stack" style={{ gap: 10 }}>
            <h2>Etapa de venda</h2>
            <select className="select" value={b.stage} onChange={(e) => patch({ stage: e.target.value })}>
              {config?.stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button className="btn ghost sm danger" style={{ justifySelf: 'start' }} onClick={async () => {
              if (!confirm('Excluir este estabelecimento e todos os dados, arquivos e demonstrações? (LGPD: exclusão definitiva)')) return;
              await api.del(`/api/businesses/${b.id}`);
              nav('/investigacao');
            }}><Icon name="trash" size={14} />Excluir dados do estabelecimento</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- arquivos ---------- */

export function AssetsPanel({ detail, onChange }: { detail: Detail; onChange: () => void }) {
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

export function ActivityPanel({ detail, onChange }: { detail: Detail; onChange: () => void }) {
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

export function MenuPanel({ detail, onChange }: { detail: Detail; onChange: () => void }) {
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
