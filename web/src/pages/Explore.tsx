import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate, type BusinessX } from '../lib/api.ts';
import { useApp } from '../lib/context.tsx';
import { Empty, Field, Modal, PageHead, Progress, Score, Spinner, WebsiteBadge } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { MapView } from '../components/MapView.tsx';

type Biz = BusinessX & { sites?: number; published?: boolean };
interface SearchResult {
  searchId: string;
  area: { label: string; lat: number; lon: number; radius?: number };
  provider: 'overpass' | 'nominatim';
  partial: boolean;
  warnings: string[];
  fetchedAt: string;
  attribution: string;
  duplicatesMerged?: number;
  businesses: Biz[];
}

const KEY = 'prospecta:lastSearch:v2';
const AREAS = [
  { v: '', label: 'Bairro inteiro', hint: 'Usa os limites oficiais do bairro (ou da cidade, se o bairro ficar vazio).' },
  { v: '500', label: 'Até 500 m', hint: 'Só o entorno imediato do centro do bairro.' },
  { v: '1000', label: 'Até 1 km', hint: 'Cerca de 12 minutos a pé a partir do centro.' },
  { v: '2000', label: 'Até 2 km', hint: 'Região ampliada ao redor do bairro.' },
  { v: '5000', label: 'Até 5 km', hint: 'Área grande — a busca pode demorar mais e trazer resultados parciais.' },
];

type Group = 'opps' | 'none' | 'unknown' | 'weak' | 'has' | 'all';
const groupOf = (b: Biz): Exclude<Group, 'opps' | 'all'> =>
  b.websiteStatus === 'has_site' ? (b.websiteQuality === 'weak' || b.websiteQuality === 'unreachable' ? 'weak' : 'has') : b.websiteStatus === 'unverified' ? 'unknown' : 'none';

function availability(b: Biz) {
  return [
    { k: 'Endereço', on: !!(b.address.street || b.address.formatted), icon: 'pin' },
    { k: 'Telefone', on: !!b.phone, icon: 'phone' },
    { k: 'WhatsApp', on: !!b.socials?.whatsapp, icon: 'chat' },
    { k: 'Redes', on: !!(b.socials?.instagram || b.socials?.facebook || b.socials?.tiktok), icon: 'social' },
    { k: 'Horário', on: !!b.tags?.opening_hours, icon: 'clock' },
    { k: 'Site', on: !!b.website, icon: 'globe' },
  ];
}

export function Explore() {
  const { config, notify, segmentLabel, stageLabel } = useApp();
  const nav = useNavigate();
  const saved = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    } catch {
      return null;
    }
  }, []);
  const [form, setForm] = useState<{ city: string; neighborhood: string; segments: string[]; name: string; radius: string }>(
    saved?.form ?? { city: 'São Paulo', neighborhood: '', segments: ['cafe'], name: '', radius: '' },
  );
  const [showName, setShowName] = useState(!!saved?.form?.name);
  const [result, setResult] = useState<SearchResult | null>(saved?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityErr, setCityErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | undefined>();
  const [group, setGroup] = useState<Group>('opps');
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [sort, setSort] = useState<'priority' | 'data' | 'name' | 'demo'>('priority');
  const [manual, setManual] = useState(false);
  const [method, setMethod] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (result) sessionStorage.setItem(KEY, JSON.stringify({ form, result }));
  }, [result, form]);

  const segs = config?.segments ?? [];
  const segText = form.segments.length === 0 ? 'todos os tipos de negócio' : form.segments.map((id) => segs.find((s) => s.id === id)?.plural.toLowerCase() ?? id).join(', ');
  const placeText = [form.neighborhood.trim(), form.city.trim()].filter(Boolean).join(', ') || '…';
  const areaText = AREAS.find((a) => a.v === form.radius)?.label.toLowerCase() ?? 'bairro inteiro';

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (form.city.trim().length < 2) {
      setCityErr('Informe a cidade — é o ponto de partida da busca.');
      return;
    }
    setCityErr(null);
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<SearchResult>('/api/search', {
        city: form.city,
        neighborhood: form.neighborhood,
        segments: form.segments,
        name: showName ? form.name : '',
        radius: form.radius ? Number(form.radius) : undefined,
      });
      setResult(r);
      setSelected(undefined);
      setGroup('opps');
    } catch (err: any) {
      setError(/não encontrado/i.test(err.message) ? `${err.message} Confira a grafia do bairro e da cidade.` : err.message);
    } finally {
      setLoading(false);
    }
  }

  const all = result?.businesses ?? [];
  const counts = useMemo(() => {
    const c: Record<Group, number> = { none: 0, unknown: 0, weak: 0, has: 0, opps: 0, all: all.length };
    for (const b of all) c[groupOf(b)]++;
    c.opps = c.none + c.unknown + c.weak;
    return c;
  }, [all]);

  const list = useMemo(() => {
    let l = all.filter((b) => (group === 'all' ? true : group === 'opps' ? groupOf(b) !== 'has' : groupOf(b) === group));
    if (onlyPhone) l = l.filter((b) => b.phone || b.socials?.whatsapp);
    if (onlyNew) l = l.filter((b) => !b.saved);
    const dataCount = (b: Biz) => availability(b).filter((a) => a.on).length;
    l = [...l].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'data' ? dataCount(b) - dataCount(a) || b.priorityScore - a.priorityScore : sort === 'demo' ? (b.sites ?? 0) - (a.sites ?? 0) || b.priorityScore - a.priorityScore : b.priorityScore - a.priorityScore,
    );
    return l;
  }, [all, group, onlyPhone, onlyNew, sort]);

  const sel = all.find((b) => b.id === selected);
  const uncheckedSites = all.filter((b) => b.websiteStatus === 'has_site' && !b.websiteQuality);

  async function save(b: Biz) {
    await api.patch(`/api/businesses/${b.id}`, { saved: true });
    setResult((r) => r && { ...r, businesses: r.businesses.map((x) => (x.id === b.id ? { ...x, saved: true } : x)) });
    notify('Salvo nas suas oportunidades');
  }

  async function checkSites() {
    setChecking(true);
    try {
      const r = await api.post<{ businesses: Biz[]; results: { quality: string | null }[] }>('/api/businesses/check-sites', { ids: uncheckedSites.slice(0, 30).map((b) => b.id) });
      const upd = new Map(r.businesses.map((b) => [b.id, b]));
      setResult((cur) => cur && { ...cur, businesses: cur.businesses.map((b) => upd.get(b.id) ?? b) });
      const weak = r.results.filter((x) => x.quality && x.quality !== 'ok').length;
      notify(`${r.results.length} site(s) verificado(s): ${weak} fraco(s) ou fora do ar`);
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setChecking(false);
    }
  }

  const toggleSeg = (id: string) => setForm((f) => ({ ...f, segments: f.segments.includes(id) ? f.segments.filter((s) => s !== id) : [...f.segments, id] }));

  return (
    <div className="page">
      <PageHead
        crumb={<><span className="tag info">Etapa 1</span> Fluxo de trabalho</>}
        title="Encontrar negócios"
        subtitle="Descubra estabelecimentos da região que não têm site — ou têm um site fraco — e escolha quem investigar."
        actions={<button className="btn" onClick={() => setManual(true)}><Icon name="plus" size={16} />Cadastrar manualmente</button>}
      />

      <form className="card searchbox" onSubmit={search} noValidate>
        <div className="sb-grid">
          <div className="stack" style={{ gap: 12 }}>
            <div className="flabel"><Icon name="pin" size={15} />Onde procurar?</div>
            <Field label="Cidade" required error={cityErr} example="São Paulo">
              <input className={`input ${cityErr ? 'err' : ''}`} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Cidade" />
            </Field>
            <Field label="Bairro ou região" hint="Deixe vazio para procurar na cidade toda." example="Pinheiros">
              <input className="input" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} placeholder="Bairro" />
            </Field>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <div className="flabel"><Icon name="store" size={15} />O que procurar?</div>
            <div className="chips">
              <button type="button" className={`chip ${form.segments.length === 0 ? 'on' : ''}`} onClick={() => setForm({ ...form, segments: [] })}>Todos</button>
              {segs.map((s) => (
                <button type="button" key={s.id} className={`chip ${form.segments.includes(s.id) ? 'on' : ''}`} onClick={() => toggleSeg(s.id)}>{s.plural}</button>
              ))}
            </div>
            <span className="help">Escolha um ou mais tipos. Menos tipos = busca mais rápida e precisa.</span>
            {showName ? (
              <Field label="Nome do estabelecimento" hint="Encontra um negócio específico." example="Padaria Bella">
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
            ) : (
              <button type="button" className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setShowName(true)}><Icon name="search" size={14} />Procurar um nome específico</button>
            )}
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <div className="flabel"><Icon name="map" size={15} />Tamanho da área</div>
            <div className="stack" style={{ gap: 6 }}>
              {AREAS.map((a) => (
                <label key={a.v} className={`chip ${form.radius === a.v ? 'on' : ''}`} style={{ justifyContent: 'flex-start', borderRadius: 10 }}>
                  <input type="radio" name="area" checked={form.radius === a.v} onChange={() => setForm({ ...form, radius: a.v })} style={{ display: 'none' }} />
                  {a.label}
                </label>
              ))}
            </div>
            <span className="help">{AREAS.find((a) => a.v === form.radius)?.hint}</span>
          </div>
        </div>
        <div className="sb-q">
          <Icon name="info" size={16} />
          <span>Vamos procurar <b>{segText}</b> em <b>{placeText}</b> — <b>{areaText}</b>{showName && form.name.trim() ? <> com o nome <b>“{form.name.trim()}”</b></> : null}.</span>
          <button className="btn grad lg" style={{ marginLeft: 'auto' }} disabled={loading}>{loading ? <><Spinner /> Buscando…</> : <><Icon name="search" />Buscar negócios</>}</button>
        </div>
        {loading && (
          <Progress running={loading} steps={['Localizando a área no mapa', 'Consultando estabelecimentos no OpenStreetMap', 'Removendo duplicados e verificando sites registrados', 'Calculando prioridades']} />
        )}
      </form>

      {error && <div className="alert bad" style={{ margin: '16px 0' }}><Icon name="alert" />{error}</div>}

      {result && !loading && (
        <div style={{ marginTop: 20 }}>
          {result.warnings.map((w) => <div key={w} className="alert warn" style={{ marginBottom: 10 }}><Icon name="alert" />{w}</div>)}
          <div className="row between" style={{ marginBottom: 12 }}>
            <div>
              <h2>{result.businesses.length} estabelecimentos em {result.area.label}{result.area.radius ? ` (até ${result.area.radius >= 1000 ? `${result.area.radius / 1000} km` : `${result.area.radius} m`})` : ''}</h2>
              <div className="small faint" style={{ marginTop: 3 }}>
                Consulta em {fmtDate(result.fetchedAt)} · {result.attribution}{result.duplicatesMerged ? ` · ${result.duplicatesMerged} duplicado(s) unificado(s)` : ''}
                {result.partial && <span className="tag warn" style={{ marginLeft: 8 }} title="A fonte limita o número de resultados por consulta. Use uma área menor ou menos tipos.">resultados parciais</span>}
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => setMethod(true)}><Icon name="info" size={14} />Como calculamos a prioridade</button>
          </div>

          <div className="toolbar">
            <div className="seg">
              {([
                ['opps', 'Oportunidades'],
                ['none', 'Sem site'],
                ['unknown', 'Não confirmado'],
                ['weak', 'Site fraco'],
                ['has', 'Com site'],
                ['all', 'Todos'],
              ] as [Group, string][]).map(([k, l]) => (
                <button key={k} className={group === k ? 'on' : ''} onClick={() => setGroup(k)}>{l} ({counts[k]})</button>
              ))}
            </div>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} />Com telefone/WhatsApp</label>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />Ainda não salvos</label>
            <label className="row small" style={{ gap: 6, marginLeft: 'auto' }}><Icon name="sort" size={14} />
              <select className="select" style={{ width: 180, height: 32 }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="priority">Maior prioridade</option>
                <option value="data">Mais informações</option>
                <option value="demo">Com demonstração</option>
                <option value="name">Nome (A–Z)</option>
              </select>
            </label>
          </div>
          {uncheckedSites.length > 0 && (group === 'has' || group === 'all') && (
            <div className="alert info" style={{ marginBottom: 12 }}>
              <Icon name="globe" />
              <div style={{ flex: 1 }}>{uncheckedSites.length} negócio(s) têm site registrado. Verifique se esses sites estão fracos, desatualizados ou fora do ar — também são oportunidades.</div>
              <button className="btn sm primary" onClick={checkSites} disabled={checking}>{checking ? <><Spinner /> Verificando…</> : `Verificar ${Math.min(30, uncheckedSites.length)} site(s)`}</button>
            </div>
          )}

          <div className="explore">
            <div className="rlist">
              {list.length === 0 && <div className="card"><Empty title="Nenhum resultado com esses filtros" icon="filter">Ajuste os filtros acima ou amplie a área da busca.</Empty></div>}
              {list.map((b) => (
                <div key={b.id} className={`rcard ${b.id === selected ? 'sel' : ''}`} onClick={() => setSelected(b.id)}>
                  <div className="av"><Icon name="store" size={22} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">
                      {b.name}
                      <WebsiteBadge status={b.websiteStatus} quality={b.websiteQuality} />
                      {(b.sites ?? 0) > 0 && <span className="tag brand"><Icon name="studio" size={11} />{b.published ? 'Site no ar' : 'Demo criada'}</span>}
                      {b.saved && <span className="tag info">{stageLabel(b.stage)}</span>}
                    </div>
                    <div className="meta">{segmentLabel(b.segment)} · {b.address.formatted ?? 'endereço não informado na fonte'}</div>
                    <div className="avail">
                      {availability(b).map((a) => <span key={a.k} className={a.on ? 'on' : ''} title={a.on ? `${a.k} disponível` : `${a.k} não encontrado`}><Icon name={a.icon} size={11} />{a.k}</span>)}
                    </div>
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <Score value={b.priorityScore} />
                    <button className="btn sm primary" onClick={(e) => (e.stopPropagation(), nav(`/investigacao/${b.id}?investigar=1`))}>Investigar <Icon name="arrow" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>

            <div className="stack" style={{ gap: 12, position: 'sticky', top: 16 }}>
              <MapView items={list} selected={selected} onSelect={setSelected} center={[result.area.lat, result.area.lon]} />
              {sel ? (
                <div className="card card-pad stack">
                  <div className="row between" style={{ flexWrap: 'nowrap' }}><h2>{sel.name}</h2><Score value={sel.priorityScore} /></div>
                  <div className="row" style={{ gap: 6 }}><WebsiteBadge status={sel.websiteStatus} quality={sel.websiteQuality} /><span className="tag">{segmentLabel(sel.segment)}</span></div>
                  <div className="small">{sel.address.formatted ?? <span className="faint">Endereço não informado na fonte</span>}</div>
                  {sel.phone && <div className="small row" style={{ gap: 6 }}><Icon name="phone" size={14} />{sel.phone}</div>}
                  {sel.website && <div className="small row" style={{ gap: 6 }}><Icon name="globe" size={14} /><a href={sel.website} target="_blank" rel="noreferrer">{sel.website.replace(/^https?:\/\//, '')}</a></div>}
                  {Object.entries(sel.socials).filter(([, v]) => v).map(([k, v]) => <div className="small row" style={{ gap: 6 }} key={k}><Icon name={k === 'whatsapp' ? 'chat' : 'social'} size={14} />{String(v).startsWith('http') ? <a href={String(v)} target="_blank" rel="noreferrer">{k}</a> : `${k}: ${v}`}</div>)}
                  {sel.websiteNotes?.issues?.length ? <div className="alert warn small"><Icon name="alert" size={14} /><div><b>Problemas do site atual:</b> {sel.websiteNotes.issues.join('; ')}.</div></div> : null}
                  <div>
                    <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>Por que essa prioridade</div>
                    {sel.priorityReasons.map((r) => (
                      <div key={r.label} className="row between small" style={{ flexWrap: 'nowrap', padding: '2px 0' }}><span className="muted">{r.label}</span><b style={{ color: r.points < 0 ? 'var(--bad)' : 'var(--ok)' }}>{r.points > 0 ? '+' : ''}{r.points}</b></div>
                    ))}
                  </div>
                  <div className="src">Fonte: {sel.sourceAttribution} · {fmtDate(sel.fetchedAt)}</div>
                  <div className="row">
                    <Link className="btn primary" to={`/investigacao/${sel.id}?investigar=1`}>Investigar <Icon name="arrow" size={14} /></Link>
                    {!sel.saved && <button className="btn" onClick={() => save(sel)}>Salvar</button>}
                  </div>
                </div>
              ) : (
                <div className="card card-pad small muted row" style={{ flexWrap: 'nowrap' }}><Icon name="info" />Clique em um estabelecimento para ver contatos, fonte dos dados e os critérios da prioridade.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="card" style={{ marginTop: 20 }}>
          <Empty title="Comece pela região que você atende" icon="map">Exemplo: <b>cafeterias</b> em <b>Pinheiros, São Paulo</b>. Os dados vêm do OpenStreetMap (dados abertos, licença ODbL).</Empty>
        </div>
      )}
      {manual && <ManualModal onClose={() => setManual(false)} onCreated={(id) => nav(`/investigacao/${id}`)} />}
      {method && <MethodModal onClose={() => setMethod(false)} />}
    </div>
  );
}

function MethodModal({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Sem site encontrado (OSM + Google, ou confirmado por você)', '+35'],
    ['Só redes sociais ou plataformas (iFood, Linktree…)', '+30'],
    ['Site existente fora do ar', '+22'],
    ['Não confirmado (o OpenStreetMap não registra site)', '+20'],
    ['Site existente fraco/desatualizado (2+ problemas verificáveis)', '+18'],
    ['Aderência do segmento a sites (alimentação e beleza pontuam mais)', '+12 a +20'],
    ['Telefone público disponível', '+10'],
    ['Ativo em redes sociais', '+8'],
    ['Horário de funcionamento publicado', '+6'],
    ['Endereço completo', '+4'],
    ['Diferenciais registrados (Wi-Fi, delivery…)', '+4'],
    ['Já possui site próprio em bom estado', '−40'],
    ['Rede ou franquia (site costuma ser centralizado)', '−35'],
  ];
  return (
    <Modal title="Como calculamos a prioridade" onClose={onClose}>
      <div className="stack">
        <p className="small muted">A prioridade (0 a 100) soma pontos de critérios <b>observáveis e verificáveis</b> nos dados coletados. Não estimamos faturamento nem potencial financeiro. Clique em um estabelecimento para ver os pontos de cada critério.</p>
        <table className="table">
          <tbody>{rows.map(([k, v]) => <tr key={k}><td className="small">{k}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{v}</td></tr>)}</tbody>
        </table>
        <p className="small faint">“Site fraco” considera: sem HTTPS, sem versão para celular, sem título/descrição, ano de copyright antigo, construtor genérico, pouco conteúdo ou código antigo.</p>
      </div>
    </Modal>
  );
}

function ManualModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { config, notify } = useApp();
  const [f, setF] = useState({ name: '', segment: 'cafe', street: '', number: '', suburb: '', city: '', state: '', phone: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.name.trim().length < 2) er.name = 'Informe o nome do estabelecimento.';
    if (!f.city.trim()) er.city = 'Informe a cidade.';
    if (f.phone && f.phone.replace(/\D/g, '').length < 10) er.phone = 'Telefone com DDD, ex.: (11) 3000-0000.';
    setErrs(er);
    if (Object.keys(er).length) return;
    try {
      const b = await api.post<BusinessX>('/api/businesses', Object.fromEntries(Object.entries(f).filter(([, v]) => v)));
      onCreated(b.id);
    } catch (err: any) {
      notify(err.message, true);
    }
  }
  return (
    <Modal title="Cadastrar estabelecimento" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
        <p className="small muted">Para negócios que você conhece e não aparecem nas fontes públicas. Tudo fica marcado como “informado por você”.</p>
        <Field label="Nome" required error={errs.name} example="Café Aroma"><input className={`input ${errs.name ? 'err' : ''}`} value={f.name} onChange={set('name')} /></Field>
        <Field label="Tipo de negócio" required><select className="select" value={f.segment} onChange={set('segment')}>{config?.segments.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
        <div className="grid" style={{ gridTemplateColumns: '1fr 110px' }}>
          <Field label="Rua" example="Rua Augusta"><input className="input" value={f.street} onChange={set('street')} /></Field>
          <Field label="Número"><input className="input" value={f.number} onChange={set('number')} /></Field>
        </div>
        <div className="grid g3">
          <Field label="Bairro"><input className="input" value={f.suburb} onChange={set('suburb')} /></Field>
          <Field label="Cidade" required error={errs.city}><input className={`input ${errs.city ? 'err' : ''}`} value={f.city} onChange={set('city')} /></Field>
          <Field label="UF"><input className="input" maxLength={2} value={f.state} onChange={set('state')} /></Field>
        </div>
        <Field label="Telefone comercial" error={errs.phone} example="(11) 3000-0000"><input className={`input ${errs.phone ? 'err' : ''}`} value={f.phone} onChange={set('phone')} /></Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" type="button" onClick={onClose}>Cancelar</button><button className="btn primary">Cadastrar e investigar</button></div>
      </form>
    </Modal>
  );
}
