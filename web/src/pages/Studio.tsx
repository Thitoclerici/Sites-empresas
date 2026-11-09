import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate, type Detail, type SiteRecord, type SiteStatus } from '../lib/api.ts';
import { useApp, useLoad } from '../lib/context.tsx';
import { Empty, Modal, Spinner } from '../components/ui.tsx';
import { renderSite } from '../../../shared/render.ts';
import { FONT_CHOICES, ORIGIN_LABEL, SECTION_DEFS, getSectionDef, type FieldDef, type Section, type SiteSpec, type Theme } from '../../../shared/site.ts';
import { USABLE_RIGHTS, type Asset } from '../../../shared/types.ts';
import { groupsToText, itemsToText, parseGroups, parseItems } from '../lib/items.ts';

const STATUS_LABEL: Record<SiteStatus, string> = { draft: 'Rascunho', reviewed: 'Revisada', approved_by_client: 'Aprovada pelo cliente', published: 'Publicada' };

/* ---------- lista ---------- */

export function StudioList() {
  const { data } = useLoad<any[]>('/api/sites');
  const { segmentLabel } = useApp();
  return (
    <div className="page">
      <div className="page-head"><div><h1>Estúdio de criação</h1><p>Demonstrações de site geradas. Abra uma para visualizar e editar.</p></div></div>
      <div className="card">
        {data?.length ? (
          <table className="table">
            <thead><tr><th>Demonstração</th><th>Estabelecimento</th><th>Status</th><th>Versão</th><th>Atualizado</th><th></th></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/estudio/${s.id}`} style={{ fontWeight: 600 }}>{s.name}</Link></td>
                  <td><Link to={`/investigacao/${s.businessId}`} style={{ color: 'var(--text)' }}>{s.businessName}</Link><div className="small muted">{segmentLabel(s.segment)}</div></td>
                  <td><span className="tag">{STATUS_LABEL[s.status as SiteStatus]}</span></td>
                  <td>v{s.version}</td>
                  <td className="small muted">{fmtDate(s.updatedAt)}</td>
                  <td><Link className="btn sm" to={`/estudio/${s.id}`}>Abrir editor</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="Nenhuma demonstração ainda">Investigue um estabelecimento e clique em “Gerar demonstração de site”.</Empty>
        )}
      </div>
    </div>
  );
}

/* ---------- editor ---------- */

const uidSec = (t: string) => `${t}-${Math.random().toString(36).slice(2, 8)}`;

export function StudioEditor() {
  const { id } = useParams();
  const { config, notify } = useApp();
  const [site, setSite] = useState<SiteRecord | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  const [spec, setSpec] = useState<SiteSpec | null>(null);
  const [history, setHistory] = useState<SiteSpec[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'sections' | 'content' | 'theme' | 'seo' | 'tips'>('sections');
  const [selected, setSelected] = useState<string | undefined>();
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [showPending, setShowPending] = useState(true);
  const [statusModal, setStatusModal] = useState<SiteStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ site: SiteRecord; detail: Detail; demoNotice: string | null }>(`/api/sites/${id}`);
      setSite(r.site);
      setSpec(r.site.spec);
      setDetail(r.detail);
      setDemoNotice(r.demoNotice);
      setDirty(false);
      setHistory([]);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback((fn: (s: SiteSpec) => SiteSpec) => {
    setSpec((cur) => {
      if (!cur) return cur;
      setHistory((h) => [...h.slice(-49), cur]);
      return fn(structuredClone(cur));
    });
    setDirty(true);
  }, []);
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setSpec(h[h.length - 1]!);
      setDirty(true);
      return h.slice(0, -1);
    });
  };

  async function save(note?: string) {
    if (!spec || !site) return;
    setSaving(true);
    try {
      const r = await api.put<{ site: SiteRecord }>(`/api/sites/${site.id}`, { spec, note });
      setSite(r.site);
      setSpec(r.site.spec);
      setDirty(false);
      notify(`Salvo (versão ${r.site.version})`);
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'select-section') {
        setSelected(e.data.id);
        setTab('content');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const usable = useMemo(() => (detail?.assets ?? []).filter((a) => USABLE_RIGHTS.includes(a.rights) && a.mime.startsWith('image/')), [detail]);
  const resolveAsset = useCallback((aid: string) => (usable.some((a) => a.id === aid) ? `/api/assets/${aid}/file` : null), [usable]);

  // Prévia ao vivo (renderizador compartilhado), com debounce e preservação da rolagem.
  const frame = useRef<HTMLIFrameElement>(null);
  const scrollY = useRef(0);
  const [html, setHtml] = useState('');
  useEffect(() => {
    if (!spec) return;
    const t = setTimeout(() => {
      scrollY.current = frame.current?.contentWindow?.scrollY ?? 0;
      const doc = { ...spec, sections: showPending ? spec.sections : spec.sections };
      setHtml(renderSite(doc, { mode: showPending ? 'editor' : 'preview', resolveAsset, demoNotice, selectedSectionId: selected }));
    }, 180);
    return () => clearTimeout(t);
  }, [spec, selected, resolveAsset, demoNotice, showPending]);

  if (error) return <div className="page"><div className="alert bad">{error}</div></div>;
  if (!spec || !site || !detail) return <div className="page"><Spinner /></div>;
  const sel = spec.sections.find((s) => s.id === selected);
  const width = { desktop: '100%', tablet: '820px', mobile: '390px' }[device];
  const unverifiedCount = spec.sections.reduce((n, s) => n + Object.values(s.origins).filter((o) => o === 'ai' || o === 'template').length, 0);
  const pendingCount = spec.sections.filter((s) => s.visible).reduce((n, s) => n + s.pending.length, 0);

  return (
    <div className="studio">
      <div className="studio-panel">
        <div className="studio-top">
          <div className="row between">
            <Link to={`/investigacao/${site.businessId}`} className="small">← {detail.business.name}</Link>
            <span className="small faint">v{site.version}{dirty ? ' · não salvo' : ''}</span>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <select className="select" value={site.status} onChange={(e) => setStatusModal(e.target.value as SiteStatus)} style={{ height: 32 }}>
              {(['draft', 'reviewed', 'approved_by_client'] as SiteStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button className="btn sm" onClick={undo} disabled={!history.length} title="Desfazer">↶</button>
            <button className="btn primary sm" onClick={() => save()} disabled={!dirty || saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
          {(unverifiedCount > 0 || pendingCount > 0) && (
            <div className="small" style={{ color: 'var(--warn)' }}>
              {unverifiedCount > 0 && <>{unverifiedCount} textos de IA/modelo para revisar. </>}
              {pendingCount > 0 && <>{pendingCount} pendências de informação.</>}
            </div>
          )}
        </div>
        <div className="tabs">
          {([['sections', 'Seções'], ['content', 'Conteúdo'], ['theme', 'Visual'], ['seo', 'SEO'], ['tips', 'Sugestões']] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="studio-body">
          {tab === 'sections' && <SectionsTab spec={spec} update={update} selected={selected} onSelect={(sid) => { setSelected(sid); frame.current?.contentWindow?.postMessage({ type: 'scroll-to', id: sid }, '*'); }} onEdit={(sid) => (setSelected(sid), setTab('content'))} />}
          {tab === 'content' && (sel ? <ContentTab key={sel.id} section={sel} siteId={site.id} spec={spec} update={update} assets={usable} aiEnabled={!!config?.integrations.ai} /> : <div className="muted small">Selecione uma seção na lista ou clique nela na prévia.</div>)}
          {tab === 'theme' && <ThemeTab spec={spec} update={update} detail={detail} assets={usable} />}
          {tab === 'seo' && <SeoTab spec={spec} update={update} />}
          {tab === 'tips' && <TipsTab siteId={site.id} dirty={dirty} onGo={(sid) => sid && (setSelected(sid), setTab('content'))} />}
        </div>
      </div>

      <div className="preview-wrap">
        <div className="preview-bar">
          <div className="seg">
            {(['desktop', 'tablet', 'mobile'] as const).map((d) => <button key={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>{{ desktop: 'Desktop', tablet: 'Tablet', mobile: 'Celular' }[d]}</button>)}
          </div>
          <label className="row small"><input type="checkbox" checked={showPending} onChange={(e) => setShowPending(e.target.checked)} /> Modo edição (mostrar pendências)</label>
          <div className="row">
            <RegenerateButton siteId={site.id} dirty={dirty} onDone={load} aiEnabled={!!config?.integrations.ai} />
            <a className="btn sm" href={`/api/sites/${site.id}/preview`} target="_blank" rel="noreferrer" onClick={(e) => dirty && (e.preventDefault(), notify('Salve antes de abrir a prévia em nova aba.', true))}>Abrir prévia</a>
            <a className="btn sm" href={`/api/sites/${site.id}/export`} onClick={(e) => dirty && (e.preventDefault(), notify('Salve antes de exportar.', true))}>Exportar HTML</a>
          </div>
        </div>
        <div className="preview-stage">
          <iframe
            ref={frame}
            title="Prévia do site"
            className="preview-frame"
            style={{ width }}
            srcDoc={html}
            onLoad={() => frame.current?.contentWindow?.scrollTo(0, scrollY.current)}
          />
        </div>
      </div>

      {statusModal && (
        <StatusModal
          status={statusModal}
          onClose={() => setStatusModal(null)}
          onConfirm={async (note) => {
            try {
              if (dirty) await save();
              const r = await api.patch<{ site: SiteRecord }>(`/api/sites/${site.id}`, { status: statusModal, note });
              setSite(r.site);
              setStatusModal(null);
              load();
              notify('Status atualizado');
            } catch (e: any) {
              notify(e.message, true);
            }
          }}
        />
      )}
    </div>
  );
}

function StatusModal({ status, onClose, onConfirm }: { status: SiteStatus; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState('');
  const client = status === 'approved_by_client';
  return (
    <Modal title={`Alterar status para “${STATUS_LABEL[status]}”`} onClose={onClose}>
      <div className="stack">
        {status === 'reviewed' && <p className="small muted">Confirma que você revisou os textos marcados como IA/modelo, as informações e os direitos de uso das imagens?</p>}
        {client && <div className="alert warn">Ponto de validação humana: só marque como aprovado depois que o responsável pelo estabelecimento autorizar explicitamente. Isso remove o aviso de demonstração e libera a preparação para publicação.</div>}
        <label className="field"><span>{client ? 'Como a aprovação foi obtida (obrigatório)' : 'Observação (opcional)'}</span><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={client ? 'ex.: aprovado por e-mail pelo proprietário em 12/11' : ''} /></label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={client && !note.trim()} onClick={() => onConfirm(note)}>Confirmar</button>
        </div>
      </div>
    </Modal>
  );
}

function RegenerateButton({ siteId, dirty, onDone, aiEnabled }: { siteId: string; dirty: boolean; onDone: () => void; aiEnabled: boolean }) {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn sm"
      disabled={busy}
      title="Gera novamente o site inteiro com os dados atuais (a versão anterior fica no histórico)"
      onClick={async () => {
        if (!confirm(`Regenerar o site inteiro com os dados atuais${aiEnabled ? ' e IA' : ''}? ${dirty ? 'Alterações não salvas serão perdidas. ' : ''}A versão atual fica no histórico.`)) return;
        setBusy(true);
        try {
          const r = await api.post<{ aiError?: string }>(`/api/sites/${siteId}/regenerate`, {});
          if (r.aiError) notify(r.aiError, true);
          onDone();
        } catch (e: any) {
          notify(e.message, true);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner /> : '↻'} Regenerar
    </button>
  );
}

/* ---------- abas ---------- */

function SectionsTab({ spec, update, selected, onSelect, onEdit }: { spec: SiteSpec; update: (fn: (s: SiteSpec) => SiteSpec) => void; selected?: string; onSelect: (id: string) => void; onEdit: (id: string) => void }) {
  const [add, setAdd] = useState('');
  const move = (i: number, d: number) =>
    update((s) => {
      const j = i + d;
      if (j < 0 || j >= s.sections.length) return s;
      [s.sections[i], s.sections[j]] = [s.sections[j]!, s.sections[i]!];
      return s;
    });
  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        {spec.sections.map((s, i) => {
          const def = getSectionDef(s.type);
          return (
            <div key={s.id} className={`sec-item ${s.id === selected ? 'on' : ''} ${s.visible ? '' : 'off'}`} onClick={() => onSelect(s.id)} onDoubleClick={() => onEdit(s.id)}>
              <span className="name">{def?.label ?? s.type}{s.pending.length > 0 && <span className="tag warn" style={{ marginLeft: 6 }}>{s.pending.length}</span>}</span>
              <button className="icon-btn" title="Subir" onClick={(e) => (e.stopPropagation(), move(i, -1))}>↑</button>
              <button className="icon-btn" title="Descer" onClick={(e) => (e.stopPropagation(), move(i, 1))}>↓</button>
              <button className="icon-btn" title={s.visible ? 'Ocultar' : 'Exibir'} onClick={(e) => (e.stopPropagation(), update((x) => ((x.sections[i]!.visible = !x.sections[i]!.visible), x)))}>{s.visible ? '◉' : '○'}</button>
              <button className="icon-btn" title="Editar" onClick={(e) => (e.stopPropagation(), onEdit(s.id))}>✎</button>
              <button className="icon-btn" title="Remover" onClick={(e) => (e.stopPropagation(), confirm('Remover esta seção?') && update((x) => ((x.sections = x.sections.filter((y) => y.id !== s.id)), x)))}>✕</button>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <select className="select" value={add} onChange={(e) => setAdd(e.target.value)}>
          <option value="">Adicionar seção…</option>
          {SECTION_DEFS.filter((d) => d.type !== 'hero').map((d) => <option key={d.type} value={d.type}>{d.label}</option>)}
        </select>
        <button
          className="btn"
          disabled={!add}
          onClick={() => {
            const sid = uidSec(add);
            update((s) => {
              const props: Record<string, any> = { title: getSectionDef(add)?.label ?? '' };
              if (add === 'menu') props.groups = [];
              if (['services', 'products'].includes(add)) props.items = [];
              if (add === 'gallery') props.images = [];
              if (add === 'hours') props.rows = [];
              if (add === 'highlights') props.items = [];
              const idx = s.sections.findIndex((x) => x.type === 'contact');
              const sec: Section = { id: sid, type: add, visible: true, props, origins: { title: 'user' }, pending: [] };
              s.sections.splice(idx >= 0 ? idx : s.sections.length, 0, sec);
              return s;
            });
            setAdd('');
            onEdit(sid);
          }}
        >
          Adicionar
        </button>
      </div>
      <p className="small faint">Clique numa seção da prévia para editá-la. Seções sem conteúdo verificado ficam ocultas na versão do cliente.</p>
    </>
  );
}

function OriginTag({ o }: { o?: string }) {
  if (!o) return null;
  return <span className={`origin ${o}`} title={ORIGIN_LABEL[o as keyof typeof ORIGIN_LABEL]}>{{ fact: 'verificado', user: 'editado', ai: 'IA', template: 'modelo' }[o] ?? o}</span>;
}

function ContentTab({ section, siteId, spec, update, assets, aiEnabled }: { section: Section; siteId: string; spec: SiteSpec; update: (fn: (s: SiteSpec) => SiteSpec) => void; assets: Asset[]; aiEnabled: boolean }) {
  const { notify } = useApp();
  const def = getSectionDef(section.type);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const setProp = (key: string, value: unknown) =>
    update((s) => {
      const sec = s.sections.find((x) => x.id === section.id)!;
      sec.props[key] = value;
      sec.origins[key] = 'user';
      return s;
    });

  async function regen() {
    setBusy(true);
    try {
      const r = await api.post<{ section: Section; explanation: string }>(`/api/sites/${siteId}/sections/${section.id}/regenerate`, { instruction, spec });
      update((s) => {
        const i = s.sections.findIndex((x) => x.id === section.id);
        s.sections[i] = r.section;
        return s;
      });
      notify(r.explanation || 'Textos regenerados');
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row between">
        <h3>{def?.label ?? section.type}</h3>
        {def && def.variants > 1 && <button className="btn sm" onClick={() => update((s) => { const sec = s.sections.find((x) => x.id === section.id)!; sec.variant = ((sec.variant ?? -1) + 1) % def.variants; return s; })}>Alternar layout</button>}
      </div>
      <p className="small muted">{def?.description}</p>
      {section.pending.length > 0 && (
        <div className="alert warn small">
          {section.pending.map((p) => <div key={p}>• {p}</div>)}
          <label className="row" style={{ marginTop: 6 }}><input type="checkbox" onChange={(e) => e.target.checked && update((s) => ((s.sections.find((x) => x.id === section.id)!.pending = []), s))} /> Marcar pendências como resolvidas</label>
        </div>
      )}
      {def?.fields.map((f) => <FieldEditor key={f.key} field={f} value={section.props[f.key]} origin={section.origins[f.key]} onChange={(v) => setProp(f.key, v)} assets={assets} />)}
      <div className="sep" />
      <div className="stack">
        <h3>Regenerar textos com IA</h3>
        <textarea className="textarea" rows={2} placeholder="Instrução opcional (ex.: tom mais descontraído, mais curto)" value={instruction} onChange={(e) => setInstruction(e.target.value)} disabled={!aiEnabled} />
        <button className="btn" onClick={regen} disabled={busy || !aiEnabled}>{busy ? <><Spinner /> Gerando…</> : '✦ Regenerar textos da seção'}</button>
        <span className="small faint">{aiEnabled ? 'A IA reescreve só os textos, usando os fatos verificados. Itens, preços e contatos não são alterados.' : 'IA não configurada (ANTHROPIC_API_KEY). Use “Alternar layout” ou edite manualmente.'}</span>
      </div>
    </>
  );
}

function TextBlock({ value, toText, fromText, rows, placeholder, help }: { value: any; toText: (v: any) => string; fromText: (t: string) => any; rows: number; placeholder: string; help: string }) {
  const [text, setText] = useState(() => toText(value));
  return (
    <>
      <textarea className="textarea mono" rows={rows} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => fromText(text)} />
      <span className="help">{help} As alterações são aplicadas ao sair do campo.</span>
    </>
  );
}

function FieldEditor({ field, value, origin, onChange, assets }: { field: FieldDef; value: any; origin?: string; onChange: (v: any) => void; assets: Asset[] }) {
  const label = (
    <span className="row between" style={{ gap: 6 }}>
      {field.label} <OriginTag o={origin} />
    </span>
  );
  switch (field.type) {
    case 'text':
    case 'url':
      return <label className="field">{label}<input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.type === 'url' ? 'https://, tel:, #secao' : ''} />{field.help && <span className="help">{field.help}</span>}</label>;
    case 'textarea':
      return <label className="field">{label}<textarea className="textarea" rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>;
    case 'toggle':
      return <label className="row small"><input type="checkbox" checked={value !== false} onChange={(e) => onChange(e.target.checked)} /> {field.label}</label>;
    case 'image':
      return (
        <div className="field">{label}
          <div className="pick-grid">
            <button className={!value ? 'on' : ''} onClick={() => onChange('')} style={{ display: 'grid', placeItems: 'center', fontSize: 11 }}>nenhuma</button>
            {assets.map((a) => <button key={a.id} className={value === a.id ? 'on' : ''} style={{ backgroundImage: `url(/api/assets/${a.id}/file)` }} onClick={() => onChange(a.id)} title={a.filename} />)}
          </div>
          <span className="help">{assets.length ? 'Apenas imagens com uso autorizado.' : 'Nenhuma imagem autorizada. Envie na página de Investigação.'}</span>
        </div>
      );
    case 'images': {
      const list: string[] = value ?? [];
      return (
        <div className="field">{label}
          <div className="pick-grid">
            {assets.map((a) => <button key={a.id} className={list.includes(a.id) ? 'on' : ''} style={{ backgroundImage: `url(/api/assets/${a.id}/file)` }} onClick={() => onChange(list.includes(a.id) ? list.filter((x) => x !== a.id) : [...list, a.id])} title={a.filename} />)}
          </div>
          <span className="help">{assets.length ? 'Clique para incluir/remover.' : 'Nenhuma imagem autorizada disponível.'}</span>
        </div>
      );
    }
    case 'groups':
      return <div className="field">{label}<TextBlock value={value} toText={groupsToText} fromText={(t) => onChange(parseGroups(t))} rows={10} placeholder={'# Categoria\nItem | descrição | preço'} help="Uma linha por item: Nome | descrição | preço. “# Categoria” agrupa." /></div>;
    case 'items':
      return <div className="field">{label}<TextBlock value={value} toText={itemsToText} fromText={(t) => onChange(parseItems(t))} rows={8} placeholder="Nome | descrição | preço | extra" help="Uma linha por item: Nome | descrição | preço | extra." /></div>;
    case 'rows':
      return (
        <div className="field">{label}
          <TextBlock value={value} toText={(v) => (v ?? []).map((r: any) => `${r.days} | ${r.hours}`).join('\n')} fromText={(t) => onChange(t.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]).map(([days, hours]) => ({ days, hours: hours ?? '' })))} rows={6} placeholder="Segunda a Sexta | 08:00 às 18:00" help="Uma linha por regra: Dias | Horário." />
        </div>
      );
    case 'highlights':
      return (
        <div className="field">{label}
          <TextBlock value={value} toText={(v) => (v ?? []).map((r: any) => [r.title, r.text].filter(Boolean).join(' | ')).join('\n')} fromText={(t) => onChange(t.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]).map(([title, text]) => ({ title, text })))} rows={6} placeholder="Wi-Fi | Acesso à internet no local" help="Uma linha por destaque: Título | texto." />
        </div>
      );
    default:
      return null;
  }
}

function ThemeTab({ spec, update, detail, assets }: { spec: SiteSpec; update: (fn: (s: SiteSpec) => SiteSpec) => void; detail: Detail; assets: Asset[] }) {
  const t = spec.theme;
  const setT = (patch: Partial<Theme>) => update((s) => ((s.theme = { ...s.theme, ...patch }), s));
  const logos = assets.filter((a) => a.kind === 'logo');
  const logo = logos.find((a) => a.id === spec.logo);
  const colors: [keyof Theme, string][] = [['primary', 'Cor principal'], ['accent', 'Destaque'], ['secondary', 'Secundária'], ['background', 'Fundo'], ['surface', 'Superfícies'], ['text', 'Texto'], ['muted', 'Texto secundário']];
  return (
    <>
      <div className="field"><span>Paletas do segmento ({detail.segment.label})</span>
        <div className="stack" style={{ gap: 6 }}>
          {detail.segment.presets.map((p) => (
            <button key={p.name} className="sec-item" onClick={() => setT({ ...p, presetName: p.name })} style={{ textAlign: 'left' }}>
              <span className="row" style={{ gap: 3 }}>{[p.primary, p.accent, p.secondary, p.background].map((c) => <span key={c} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: '1px solid #0001' }} />)}</span>
              <span className="name">{p.name}</span><span className="small faint">{p.headingFont}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field"><span>Logotipo</span>
        <div className="pick-grid">
          <button className={!spec.logo ? 'on' : ''} onClick={() => update((s) => ((s.logo = undefined), s))} style={{ display: 'grid', placeItems: 'center', fontSize: 11 }}>monograma</button>
          {logos.map((a) => <button key={a.id} className={spec.logo === a.id ? 'on' : ''} style={{ backgroundImage: `url(/api/assets/${a.id}/file)`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} onClick={() => update((s) => ((s.logo = a.id), s))} />)}
        </div>
        {!logos.length && <span className="help">Envie um logotipo autorizado na página de Investigação.</span>}
        {logo?.palette?.length ? <button className="btn sm" onClick={() => setT({ primary: logo.palette![0]!, accent: logo.palette![1] ?? t.accent, presetName: `${t.presetName ?? ''} + cores da marca` })}>Usar cores do logotipo</button> : null}
      </div>
      {colors.map(([k, l]) => (
        <div className="color-row" key={k}>
          <span className="small" style={{ fontWeight: 600 }}>{l}</span>
          <input type="color" className="swatch" value={String(t[k])} onChange={(e) => setT({ [k]: e.target.value.toUpperCase() } as any)} />
          <input className="input mono" style={{ height: 30 }} value={String(t[k])} onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && setT({ [k]: e.target.value } as any)} />
        </div>
      ))}
      <div className="grid g2">
        <label className="field"><span>Fonte dos títulos</span><select className="select" value={t.headingFont} onChange={(e) => setT({ headingFont: e.target.value })}>{FONT_CHOICES.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label className="field"><span>Fonte do texto</span><select className="select" value={t.bodyFont} onChange={(e) => setT({ bodyFont: e.target.value })}>{FONT_CHOICES.map((f) => <option key={f}>{f}</option>)}</select></label>
      </div>
      <label className="field"><span>Estilo da abertura</span>
        <select className="select" value={t.heroStyle} onChange={(e) => { setT({ heroStyle: e.target.value as Theme['heroStyle'] }); update((s) => { const h = s.sections.find((x) => x.type === 'hero'); if (h) delete h.variant; return s; }); }}>
          <option value="split">Dividida (texto + imagem)</option><option value="centered">Centralizada</option><option value="banner">Faixa colorida</option><option value="editorial">Editorial</option>
        </select>
      </label>
      <label className="field"><span>Arredondamento: {t.radius}px</span><input type="range" min={0} max={28} value={t.radius} onChange={(e) => setT({ radius: Number(e.target.value) })} /></label>
    </>
  );
}

function SeoTab({ spec, update }: { spec: SiteSpec; update: (fn: (s: SiteSpec) => SiteSpec) => void }) {
  const set = (k: 'title' | 'description' | 'keywords') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update((s) => ((s.seo[k] = e.target.value), s));
  return (
    <>
      <label className="field"><span>Título da página ({spec.seo.title.length}/60)</span><input className="input" value={spec.seo.title} onChange={set('title')} /></label>
      <label className="field"><span>Descrição ({spec.seo.description.length}/155)</span><textarea className="textarea" value={spec.seo.description} onChange={set('description')} /></label>
      <label className="field"><span>Palavras-chave</span><input className="input" value={spec.seo.keywords ?? ''} onChange={set('keywords')} /></label>
      <div className="card card-pad small" style={{ background: '#fafbfc' }}>
        <div style={{ color: '#1a0dab', fontSize: 16 }}>{spec.seo.title}</div>
        <div style={{ color: '#4d5156' }}>{spec.seo.description}</div>
      </div>
      <p className="small faint">O site inclui dados estruturados schema.org (LocalBusiness) gerados apenas com informações confirmadas, HTML semântico e metatags Open Graph. Demonstrações levam “noindex” até a aprovação do cliente.</p>
    </>
  );
}

function TipsTab({ siteId, dirty, onGo }: { siteId: string; dirty: boolean; onGo: (sid: string) => void }) {
  const [data, setData] = useState<{ suggestions: any[]; aiError?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      setData(await api.post(`/api/sites/${siteId}/suggestions`));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div className="row between"><h3>Sugestões de melhoria</h3><button className="btn sm" onClick={run} disabled={busy}>{busy ? <Spinner /> : 'Atualizar'}</button></div>
      {dirty && <div className="small" style={{ color: 'var(--warn)' }}>As sugestões consideram a última versão salva.</div>}
      {data?.aiError && <div className="alert warn small">IA: {data.aiError}</div>}
      {data?.suggestions.map((s, i) => (
        <div key={i} className="card card-pad stack" style={{ gap: 4, cursor: s.sectionId ? 'pointer' : 'default' }} onClick={() => onGo(s.sectionId)}>
          <div className="row between"><b>{s.title}</b><span className={`tag ${s.source === 'ai' ? 'brand' : ''}`}>{s.source === 'ai' ? 'IA' : 'regra'}</span></div>
          <div className="small muted">{s.detail}</div>
        </div>
      ))}
    </>
  );
}
