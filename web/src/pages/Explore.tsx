import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate, type BusinessX } from '../lib/api.ts';
import { useApp } from '../lib/context.tsx';
import { Empty, Modal, Score, Spinner, WebsiteBadge } from '../components/ui.tsx';
import { MapView } from '../components/MapView.tsx';
import type { WebsiteStatus } from '../../../shared/types.ts';

interface SearchResult {
  searchId: string;
  area: { label: string; lat: number; lon: number; radius?: number };
  provider: 'overpass' | 'nominatim';
  partial: boolean;
  warnings: string[];
  fetchedAt: string;
  attribution: string;
  businesses: BusinessX[];
}

const KEY = 'prospecta:lastSearch';

export function Explore() {
  const { config, notify, segmentLabel } = useApp();
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
  const [result, setResult] = useState<SearchResult | null>(saved?.result ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | undefined>();
  const [filter, setFilter] = useState<{ status: 'opps' | 'all' | WebsiteStatus; phone: boolean; minScore: number }>({ status: 'opps', phone: false, minScore: 0 });
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (result) sessionStorage.setItem(KEY, JSON.stringify({ form, result }));
  }, [result, form]);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<SearchResult>('/api/search', {
        city: form.city,
        neighborhood: form.neighborhood,
        segments: form.segments,
        name: form.name,
        radius: form.radius ? Number(form.radius) : undefined,
      });
      setResult(r);
      setSelected(undefined);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const list = useMemo(() => {
    let l = result?.businesses ?? [];
    if (filter.status === 'opps') l = l.filter((b) => b.websiteStatus !== 'has_site');
    else if (filter.status !== 'all') l = l.filter((b) => b.websiteStatus === filter.status);
    if (filter.phone) l = l.filter((b) => b.phone);
    if (filter.minScore) l = l.filter((b) => b.priorityScore >= filter.minScore);
    return l;
  }, [result, filter]);

  const sel = result?.businesses.find((b) => b.id === selected);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of result?.businesses ?? []) c[b.websiteStatus] = (c[b.websiteStatus] ?? 0) + 1;
    return c;
  }, [result]);

  async function save(b: BusinessX) {
    await api.patch(`/api/businesses/${b.id}`, { saved: true });
    setResult((r) => r && { ...r, businesses: r.businesses.map((x) => (x.id === b.id ? { ...x, saved: true } : x)) });
    notify('Salvo no CRM');
  }

  const toggleSeg = (id: string) => setForm((f) => ({ ...f, segments: f.segments.includes(id) ? f.segments.filter((s) => s !== id) : [...f.segments, id] }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Explorar negócios</h1>
          <p>Pesquise estabelecimentos por região e segmento e identifique quem aparentemente não tem site.</p>
        </div>
        <button className="btn" onClick={() => setManual(true)}>+ Cadastrar manualmente</button>
      </div>

      <form className="card card-pad stack" onSubmit={search} style={{ marginBottom: 16, gap: 14 }}>
        <div className="grid" style={{ gridTemplateColumns: '1.2fr 1.2fr 1.2fr 120px auto', alignItems: 'end' }}>
          <label className="field"><span>Cidade</span><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></label>
          <label className="field"><span>Bairro / região</span><input className="input" value={form.neighborhood} placeholder="ex.: Pinheiros" onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></label>
          <label className="field"><span>Nome do estabelecimento</span><input className="input" value={form.name} placeholder="opcional" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>Raio (m)</span><input className="input" type="number" min={100} max={10000} step={100} value={form.radius} placeholder="auto" onChange={(e) => setForm({ ...form, radius: e.target.value })} /></label>
          <button className="btn primary lg" disabled={loading}>{loading ? <><Spinner /> Buscando…</> : 'Buscar'}</button>
        </div>
        <div className="field">
          <span>Segmentos {form.segments.length === 0 && <span className="faint">(nenhum = todos)</span>}</span>
          <div className="chips">
            {config?.segments.map((s) => (
              <button type="button" key={s.id} className={`chip ${form.segments.includes(s.id) ? 'on' : ''}`} onClick={() => toggleSeg(s.id)}>{s.plural}</button>
            ))}
          </div>
        </div>
        {loading && <div className="small muted">Consultando o OpenStreetMap. O Nominatim limita a 1 requisição por segundo, então buscas com vários segmentos podem levar alguns segundos.</div>}
      </form>

      {error && <div className="alert bad" style={{ marginBottom: 16 }}>{error}</div>}

      {result && (
        <>
          {result.warnings.map((w) => <div key={w} className="alert warn" style={{ marginBottom: 10 }}>{w}</div>)}
          <div className="row between" style={{ marginBottom: 10 }}>
            <div className="row">
              <b>{result.businesses.length} estabelecimentos</b>
              <span className="muted">em {result.area.label}{result.area.radius ? ` (raio ${result.area.radius} m)` : ''}</span>
              {result.partial && <span className="tag warn" title="A fonte limita o número de resultados por consulta. Refine por bairro, raio ou segmento.">resultados parciais</span>}
            </div>
            <div className="small faint">Consulta: {fmtDate(result.fetchedAt)} · Fonte: {result.attribution} via {result.provider === 'overpass' ? 'Overpass' : 'Nominatim'}</div>
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="seg">
              {([['opps', `Oportunidades (${result.businesses.length - (counts.has_site ?? 0)})`], ['unverified', `Não confirmado (${counts.unverified ?? 0})`], ['social_only', `Só redes (${counts.social_only ?? 0})`], ['none_found', `Sem site (${counts.none_found ?? 0})`], ['has_site', `Com site (${counts.has_site ?? 0})`], ['all', 'Todos']] as const).map(([k, l]) => (
                <button key={k} className={filter.status === k ? 'on' : ''} onClick={() => setFilter({ ...filter, status: k })}>{l}</button>
              ))}
            </div>
            <label className="row small"><input type="checkbox" checked={filter.phone} onChange={(e) => setFilter({ ...filter, phone: e.target.checked })} /> com telefone</label>
            <label className="row small">pontuação mínima
              <select className="select" style={{ width: 80, height: 30 }} value={filter.minScore} onChange={(e) => setFilter({ ...filter, minScore: Number(e.target.value) })}>
                {[0, 30, 40, 50, 60].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          <div className="explore">
            <div className="card" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
              {list.length ? (
                <table className="table">
                  <thead><tr><th>Prior.</th><th>Estabelecimento</th><th>Site</th><th>Contato</th><th></th></tr></thead>
                  <tbody>
                    {list.map((b) => (
                      <tr key={b.id} className={b.id === selected ? 'sel' : ''} onClick={() => setSelected(b.id)} style={{ cursor: 'pointer' }}>
                        <td><Score value={b.priorityScore} /></td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{b.name}</div>
                          <div className="small muted">{segmentLabel(b.segment)} · {b.address.formatted ?? 'endereço não informado'}</div>
                        </td>
                        <td><WebsiteBadge status={b.websiteStatus} /></td>
                        <td className="small">
                          {b.phone ?? <span className="faint">—</span>}
                          {Object.keys(b.socials).length > 0 && <div className="faint">{Object.keys(b.socials).join(', ')}</div>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn sm primary" onClick={(e) => (e.stopPropagation(), nav(`/investigacao/${b.id}?investigar=1`))}>Investigar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty title="Nenhum resultado com esses filtros">Ajuste os filtros ou amplie a busca.</Empty>
              )}
            </div>

            <div className="stack" style={{ gap: 12, position: 'sticky', top: 16 }}>
              <MapView items={list} selected={selected} onSelect={setSelected} center={[result.area.lat, result.area.lon]} />
              {sel ? (
                <div className="card card-pad stack">
                  <div className="row between"><h2>{sel.name}</h2><Score value={sel.priorityScore} /></div>
                  <div className="row"><WebsiteBadge status={sel.websiteStatus} /><span className="tag">{segmentLabel(sel.segment)}</span>{sel.saved && <span className="tag info">no CRM</span>}</div>
                  <div className="small">{sel.address.formatted ?? <span className="faint">Endereço não informado na fonte</span>}</div>
                  {sel.website && <div className="small">Site: <a href={sel.website} target="_blank" rel="noreferrer">{sel.website}</a></div>}
                  {Object.entries(sel.socials).map(([k, v]) => <div className="small" key={k}>{k}: <a href={v?.startsWith('http') ? v : undefined} target="_blank" rel="noreferrer">{v}</a></div>)}
                  <div>
                    <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Critérios da prioridade</div>
                    {sel.priorityReasons.map((r) => (
                      <div key={r.label} className="row between small"><span className="muted">{r.label}</span><b style={{ color: r.points < 0 ? 'var(--bad)' : 'var(--ok)' }}>{r.points > 0 ? '+' : ''}{r.points}</b></div>
                    ))}
                  </div>
                  <div className="src">Fonte: {sel.sourceAttribution} · consultado em {fmtDate(sel.fetchedAt)}</div>
                  <div className="row">
                    <Link className="btn primary" to={`/investigacao/${sel.id}?investigar=1`}>Investigar</Link>
                    {!sel.saved && <button className="btn" onClick={() => save(sel)}>Salvar no CRM</button>}
                  </div>
                </div>
              ) : (
                <div className="card card-pad small muted">Selecione um estabelecimento para ver os detalhes e os critérios de prioridade.</div>
              )}
            </div>
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="card"><Empty title="Comece uma busca">Exemplo: cafeterias em Pinheiros, São Paulo. Os dados vêm do OpenStreetMap (licença ODbL).</Empty></div>
      )}
      {manual && <ManualModal onClose={() => setManual(false)} onCreated={(id) => nav(`/investigacao/${id}`)} />}
    </div>
  );
}

function ManualModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { config, notify } = useApp();
  const [f, setF] = useState({ name: '', segment: 'cafe', street: '', number: '', suburb: '', city: '', state: '', phone: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const b = await api.post<BusinessX>('/api/businesses', Object.fromEntries(Object.entries(f).filter(([, v]) => v)));
      onCreated(b.id);
    } catch (err: any) {
      notify(err.message, true);
    }
  }
  return (
    <Modal title="Cadastrar estabelecimento" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="small muted">Use para negócios que você conhece e que não aparecem nas fontes públicas. Os dados ficam marcados como “informado por você”.</p>
        <label className="field"><span>Nome</span><input className="input" required value={f.name} onChange={set('name')} /></label>
        <label className="field"><span>Segmento</span><select className="select" value={f.segment} onChange={set('segment')}>{config?.segments.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <div className="grid" style={{ gridTemplateColumns: '1fr 90px' }}>
          <label className="field"><span>Rua</span><input className="input" value={f.street} onChange={set('street')} /></label>
          <label className="field"><span>Número</span><input className="input" value={f.number} onChange={set('number')} /></label>
        </div>
        <div className="grid g3">
          <label className="field"><span>Bairro</span><input className="input" value={f.suburb} onChange={set('suburb')} /></label>
          <label className="field"><span>Cidade</span><input className="input" value={f.city} onChange={set('city')} /></label>
          <label className="field"><span>UF</span><input className="input" value={f.state} onChange={set('state')} /></label>
        </div>
        <label className="field"><span>Telefone comercial</span><input className="input" value={f.phone} onChange={set('phone')} /></label>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" type="button" onClick={onClose}>Cancelar</button><button className="btn primary">Cadastrar</button></div>
      </form>
    </Modal>
  );
}
