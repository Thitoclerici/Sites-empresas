import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate, type Detail, type SiteRecord, type SiteStatus } from '../lib/api.ts';
import { useApp, useLoad } from '../lib/context.tsx';
import { Empty, Modal, Spinner } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
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
      <div className="page-head"><div><div className="crumb"><span className="tag info">Etapa 3</span> Fluxo de trabalho</div><h1>Sites criados</h1><p>Suas demonstrações. Abra uma para revisar, editar, enviar ao cliente ou publicar.</p></div><Link className="btn primary" to="/investigacao"><Icon name="plus" size={16} />Criar novo site</Link></div>
      <div className="card">
        {data?.length ? (
          <table className="table">
            <thead><tr><th>Demonstração</th><th>Estabelecimento</th><th>Status</th><th>Link</th><th>Atualizado</th><th></th></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/estudio/${s.id}`} style={{ fontWeight: 600 }}>{s.name}</Link></td>
                  <td><Link to={`/investigacao/${s.businessId}`} style={{ color: 'var(--text)' }}>{s.businessName}</Link><div className="small muted">{segmentLabel(s.segment)}</div></td>
                  <td><span className={`tag ${s.status === 'published' ? 'ok' : s.status === 'draft' ? '' : 'info'}`}>{STATUS_LABEL[s.status as SiteStatus]}</span></td>
                  <td className="small">{s.shareEnabled ? <span className="tag ok">ativo · {s.shareViews} visualiz.</span> : <span className="faint">—</span>}</td>
                  <td className="small muted">{fmtDate(s.updatedAt)}</td>
                  <td><Link className="btn sm" to={`/estudio/${s.id}`}>Abrir editor</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="Nenhum site criado ainda" icon="studio">Investigue um estabelecimento e clique em “Criar site”.</Empty>
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
  const [shareOpen, setShareOpen] = useState(false);
  const [conceptOpen, setConceptOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const autoConcept = useRef(false);

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
  useEffect(() => {
    if (site && spec && !autoConcept.current) {
      autoConcept.current = true;
      if (!spec.meta.conceptChosen && site.version === 1) setConceptOpen(true);
    }
  }, [site, spec]);

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

  const allowed = useMemo(() => (detail?.assets ?? []).filter((a) => USABLE_RIGHTS.includes(a.rights)), [detail]);
  const usable = useMemo(() => allowed.filter((a) => a.mime.startsWith('image/') && a.kind !== 'menu'), [allowed]);
  const menuDocs = useMemo(() => allowed.filter((a) => a.kind === 'menu'), [allowed]);
  const resolveAsset = useCallback((aid: string) => (allowed.some((a) => a.id === aid) ? `/api/assets/${aid}/file` : null), [allowed]);

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
            <Link to={`/investigacao/${site.businessId}`} className="small row" style={{ gap: 6, fontWeight: 650 }}><img src="/brand/logo-mark.png" alt="" style={{ height: 20 }} /><Icon name="back" size={14} />{detail.business.name}</Link>
            <span className="small faint">v{site.version}{dirty ? ' · não salvo' : ''}</span>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <select className="select" value={site.status} onChange={(e) => setStatusModal(e.target.value as SiteStatus)} style={{ height: 32 }}>
              {(['draft', 'reviewed', 'approved_by_client'] as SiteStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              {site.status === 'published' && <option value="published" disabled>Publicada (no ar)</option>}
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
          {([['sections', 'Seções'], ['content', 'Conteúdo'], ['theme', 'Visual'], ['tips', 'Qualidade'], ['seo', 'SEO']] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="studio-body">
          {tab === 'sections' && <SectionsTab spec={spec} update={update} selected={selected} onSelect={(sid) => { setSelected(sid); frame.current?.contentWindow?.postMessage({ type: 'scroll-to', id: sid }, '*'); }} onEdit={(sid) => (setSelected(sid), setTab('content'))} />}
          {tab === 'content' && (sel ? <ContentTab key={sel.id} section={sel} siteId={site.id} spec={spec} update={update} assets={usable} docs={menuDocs} aiEnabled={!!config?.integrations.ai} /> : <div className="muted small">Selecione uma seção na lista ou clique nela na prévia.</div>)}
          {tab === 'theme' && <ThemeTab spec={spec} update={update} detail={detail} assets={usable} />}
          {tab === 'seo' && <SeoTab spec={spec} update={update} />}
          {tab === 'tips' && (
            <>
              <DirectionCard spec={spec} onChange={() => setConceptOpen(true)} />
              <QualityCard siteId={site.id} version={site.version} dirty={dirty} spec={spec} onGo={(type) => { const sec = spec.sections.find((x) => x.type === type); if (sec) (setSelected(sec.id), setTab('content')); }} />
              <VisualCheck spec={spec} resolveAsset={resolveAsset} />
              <TipsTab siteId={site.id} dirty={dirty} onGo={(sid) => sid && (setSelected(sid), setTab('content'))} />
            </>
          )}
        </div>
      </div>

      <div className="preview-wrap">
        <div className="preview-bar">
          <div className="row" style={{ gap: 12 }}>
            <div className="seg">
              {(['desktop', 'tablet', 'mobile'] as const).map((d) => <button key={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>{{ desktop: 'Desktop', tablet: 'Tablet', mobile: 'Celular' }[d]}</button>)}
            </div>
            <label className="row small" title="Mostra as seções sem dados e as pendências (o cliente não vê)"><input type="checkbox" checked={showPending} onChange={(e) => setShowPending(e.target.checked)} />Mostrar pendências</label>
          </div>
          <div className="row">
            <button className="btn sm" onClick={() => (dirty ? save().then(() => setConceptOpen(true)) : setConceptOpen(true))}><Icon name="wand" size={15} />Direção visual</button>
            <details className="more" style={{ position: 'relative' }}>
              <summary className="btn sm" style={{ listStyle: 'none' }}><Icon name="menu" size={15} />Mais</summary>
              <div className="card" style={{ position: 'absolute', right: 0, top: 36, zIndex: 20, padding: 6, display: 'grid', gap: 2, minWidth: 220, boxShadow: 'var(--shadow-lg)' }}>
                <RegenerateButton siteId={site.id} dirty={dirty} onDone={load} aiEnabled={!!config?.integrations.ai} />
                <a className="btn sm ghost" style={{ justifyContent: 'flex-start' }} href={`/api/sites/${site.id}/preview`} target="_blank" rel="noreferrer" onClick={(e) => dirty && (e.preventDefault(), notify('Salve antes de abrir a prévia em nova aba.', true))}><Icon name="eye" size={15} />Abrir prévia em nova aba</a>
                <a className="btn sm ghost" style={{ justifyContent: 'flex-start' }} href={`/api/sites/${site.id}/export`} onClick={(e) => dirty && (e.preventDefault(), notify('Salve antes de exportar.', true))}><Icon name="file" size={15} />Exportar HTML</a>
              </div>
            </details>
            <button className="btn sm" onClick={() => (dirty ? save().then(() => setPublishOpen(true)) : setPublishOpen(true))}><Icon name="globe" size={15} />{site.status === 'published' ? 'No ar' : 'Publicar'}</button>
            <button className="btn primary sm" onClick={() => (dirty ? save().then(() => setShareOpen(true)) : setShareOpen(true))}><Icon name="send" size={15} />Enviar ao cliente</button>
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

      {conceptOpen && <ConceptPicker siteId={site.id} resolveAsset={resolveAsset} onClose={() => setConceptOpen(false)} onChosen={() => (setConceptOpen(false), load())} />}
      {publishOpen && <PublishModal siteId={site.id} businessName={detail.business.name} onClose={() => (setPublishOpen(false), load())} onApprove={() => (setPublishOpen(false), setStatusModal('approved_by_client'))} />}
      {shareOpen && <ShareModal siteId={site.id} businessName={detail.business.name} unverified={unverifiedCount} status={site.status} onClose={() => setShareOpen(false)} />}
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
      className="btn sm ghost"
      style={{ justifyContent: 'flex-start' }}
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
      {busy ? <Spinner /> : <Icon name="refresh" size={15} />} Regenerar com dados atuais
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

function ContentTab({ section, siteId, spec, update, assets, docs, aiEnabled }: { section: Section; siteId: string; spec: SiteSpec; update: (fn: (s: SiteSpec) => SiteSpec) => void; assets: Asset[]; docs: Asset[]; aiEnabled: boolean }) {
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
      {def?.fields.map((f) => <FieldEditor key={f.key} field={f} value={section.props[f.key]} origin={section.origins[f.key]} onChange={(v) => setProp(f.key, v)} assets={assets} docs={docs} />)}
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

function FieldEditor({ field, value, origin, onChange, assets, docs = [] }: { field: FieldDef; value: any; origin?: string; onChange: (v: any) => void; assets: Asset[]; docs?: Asset[] }) {
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
    case 'file':
      return (
        <label className="field">{label}
          <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">Nenhum</option>
            {docs.map((a) => <option key={a.id} value={a.id}>{a.mime === 'application/pdf' ? 'PDF' : 'Imagem'} — {a.filename}</option>)}
          </select>
          <span className="help">{docs.length ? field.help : 'Nenhum arquivo de cardápio autorizado. Anexe na página de Investigação.'}</span>
        </label>
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
    case 'lines':
      return <div className="field">{label}<TextBlock value={value} toText={(v) => (v ?? []).join('\n')} fromText={(t) => onChange(t.split('\n').map((x) => x.trim()).filter(Boolean))} rows={6} placeholder="Uma frase por linha" help="Use apenas informações reais (segmento, bairro, comodidades, horários)." /></div>;
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

/* ---------- envio ---------- */

interface ShareInfo { enabled: boolean; url: string | null; views: number; lastView: string | null }

function ShareModal({ siteId, businessName, unverified, status, onClose }: { siteId: string; businessName: string; unverified: number; status: SiteStatus; onClose: () => void }) {
  const { notify, config } = useApp();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const agency = config?.agencyName ?? 'Prospecta';
  const [message, setMessage] = useState('');
  useEffect(() => {
    api.get<ShareInfo>(`/api/sites/${siteId}/share`).then(setInfo);
  }, [siteId]);
  useEffect(() => {
    if (info?.url) setMessage(`Olá! Tudo bem? Sou da ${agency}. Preparei uma proposta de site para a ${businessName}, sem compromisso. Dá uma olhada: ${info.url}\n\nSe gostar, posso ajustar textos, fotos e cores e colocar no ar com o domínio de vocês.`);
  }, [info?.url, agency, businessName]);
  const toggle = async (enabled: boolean, regenerate = false) => {
    setBusy(true);
    try {
      setInfo(await api.post<ShareInfo>(`/api/sites/${siteId}/share`, { enabled, regenerate }));
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} copiado`);
    } catch {
      notify('Não foi possível copiar automaticamente. Selecione e copie manualmente.', true);
    }
  };
  return (
    <Modal title="Enviar demonstração" onClose={onClose}>
      <div className="stack" style={{ gap: 14 }}>
        {status === 'draft' && <div className="alert warn small">Esta demo ainda está como <b>rascunho</b>{unverified > 0 ? ` e tem ${unverified} textos de IA/modelo para revisar` : ''}. Revise antes de enviar ao proprietário.</div>}
        {!info ? <Spinner /> : !info.enabled ? (
          <>
            <p className="muted">Crie um link público para o dono do estabelecimento abrir a demonstração no celular ou computador. O link é secreto (não aparece em buscadores) e pode ser desativado a qualquer momento.</p>
            <button className="btn primary lg" disabled={busy} onClick={() => toggle(true)}>Criar link público</button>
          </>
        ) : (
          <>
            <label className="field"><span>Link da demonstração</span>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input mono" readOnly value={info.url ?? ''} onFocus={(e) => e.target.select()} />
                <button className="btn" onClick={() => copy(info.url!, 'Link')}>Copiar</button>
                <a className="btn" href={info.url!} target="_blank" rel="noreferrer">Abrir</a>
              </div>
              <span className="help">{info.views} visualizaç{info.views === 1 ? 'ão' : 'ões'} pelo link{info.lastView ? ` · última em ${fmtDate(info.lastView)}` : ''} (suas visitas logado no Hub não contam)</span>
            </label>
            <label className="field"><span>Mensagem sugerida (edite à vontade)</span><textarea className="textarea" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
            <div className="row">
              <button className="btn" onClick={() => copy(message, 'Mensagem')}>Copiar mensagem</button>
              <button className="btn" onClick={async () => { await api.post(`/api/sites/${siteId}/sent`, { channel: 'link' }); notify('Envio registrado no histórico e no pipeline'); }}>Registrar que enviei</button>
            </div>
            <div className="sep" />
            <div className="row between small">
              <button className="btn ghost sm" disabled={busy} onClick={() => toggle(true, true)}>Gerar novo link (invalida o atual)</button>
              <button className="btn ghost sm danger" disabled={busy} onClick={() => toggle(false)}>Desativar link</button>
            </div>
          </>
        )}
        <p className="small faint">O envio é sempre feito por você: a plataforma não manda mensagens automaticamente.</p>
      </div>
    </Modal>
  );
}

/* ---------- direção visual: comparar e escolher conceitos ---------- */

interface ConceptOption { id: string; label: string; description: string; spec: SiteSpec; quality: number }

export function MiniPreview({ spec, resolveAsset, width, height, scale }: { spec: SiteSpec; resolveAsset: (id: string) => string | null; width: number; height: number; scale: number }) {
  const html = useMemo(() => renderSite(spec, { mode: 'preview', resolveAsset, demoNotice: null }), [spec, resolveAsset]);
  return (
    <div style={{ width: width * scale, height: height * scale, overflow: 'hidden', borderRadius: 10, border: '1px solid var(--line)', background: '#fff', position: 'relative', flex: 'none' }}>
      <iframe title="Prévia" srcDoc={html} style={{ width, height, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none' }} />
    </div>
  );
}

function ConceptPicker({ siteId, resolveAsset, onClose, onChosen }: { siteId: string; resolveAsset: (id: string) => string | null; onClose: () => void; onChosen: () => void }) {
  const { notify } = useApp();
  const [data, setData] = useState<{ current: string | null; recommended: string | null; concepts: ConceptOption[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    api.get<typeof data>(`/api/sites/${siteId}/concepts`).then(setData).catch((e) => notify(e.message, true));
  }, [siteId]);
  async function choose(id: string) {
    setBusy(id);
    try {
      await api.post(`/api/sites/${siteId}/concept`, { concept: id });
      notify('Direção visual aplicada');
      onChosen();
    } catch (e: any) {
      notify(e.message, true);
      setBusy(null);
    }
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 'min(1320px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <div><h2>Escolha a direção visual</h2><div className="small muted">Três propostas com composição, tipografia e hierarquia diferentes — não só cores. Você pode trocar depois; suas edições de texto são mantidas.</div></div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="card-pad">
          {!data ? <div className="row"><Spinner /> Gerando as três propostas…</div> : (
            <div className="grid g3" style={{ alignItems: 'start' }}>
              {data.concepts.map((c) => (
                <div key={c.id} className="card" style={{ padding: 14, borderColor: data.current === c.id ? 'var(--brand)' : undefined, boxShadow: data.current === c.id ? '0 0 0 2px var(--brand-soft)' : undefined }}>
                  <div className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <MiniPreview spec={c.spec} resolveAsset={resolveAsset} width={1280} height={900} scale={0.235} />
                    <MiniPreview spec={c.spec} resolveAsset={resolveAsset} width={390} height={844} scale={0.25} />
                  </div>
                  <div className="row between" style={{ marginTop: 12 }}>
                    <b>{c.label}</b>
                    <div className="row" style={{ gap: 6 }}>
                      {data.recommended === c.id && <span className="tag brand">recomendado</span>}
                      {data.current === c.id && <span className="tag info">atual</span>}
                    </div>
                  </div>
                  <p className="small muted" style={{ margin: '6px 0 10px' }}>{c.description}</p>
                  <div className="row between">
                    <span className="small faint">Nota de qualidade: {c.quality}/100</span>
                    <button className="btn primary sm" disabled={!!busy} onClick={() => (data.current === c.id ? onClose() : choose(c.id))}>{busy === c.id ? <Spinner /> : data.current === c.id ? 'Manter' : 'Usar esta'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DirectionCard({ spec, onChange }: { spec: SiteSpec; onChange: () => void }) {
  const d = spec.meta.direction;
  if (!d) return <div className="card card-pad small muted">Site gerado antes da direção de arte. Use “Direção visual” para gerar as novas propostas. <button className="btn sm" onClick={onChange}>Ver propostas</button></div>;
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row between"><h3>Direção criativa</h3><button className="btn sm" onClick={onChange}>Trocar</button></div>
      <div className="small">{d.rationale}</div>
      <div className="chips">{d.personality.map((p) => <span key={p} className="tag">{p}</span>)}</div>
      <div className="small" style={{ fontWeight: 600, marginTop: 4 }}>Público provável</div>
      {d.audience.map((a) => (
        <div key={a.text} className="row small" style={{ gap: 6 }}><span className={`tag ${a.basis === 'indício' ? 'ok' : 'warn'}`}>{a.basis}</span>{a.text}</div>
      ))}
      <div className="small faint">“Hipótese” = suposição pelo segmento; “indício” = apoiado em um dado coletado.</div>
      <div className="small" style={{ fontWeight: 600, marginTop: 4 }}>Decisões de design</div>
      <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{d.visualNotes.map((n) => <li key={n}>{n}</li>)}</ul>
      {d.photoNote && <div className="alert warn small">{d.photoNote}</div>}
    </div>
  );
}

interface QualityReportUI { score: number; grade: string; checks: { id: string; label: string; status: 'ok' | 'warn' | 'fail'; detail: string; fix?: string; sectionType?: string }[] }

function QualityCard({ siteId, version, dirty, onGo }: { siteId: string; version: number; dirty: boolean; spec: SiteSpec; onGo: (type: string) => void }) {
  const [q, setQ] = useState<QualityReportUI | null>(null);
  useEffect(() => {
    api.get<QualityReportUI>(`/api/sites/${siteId}/quality`).then(setQ).catch(() => undefined);
  }, [siteId, version]);
  if (!q) return <Spinner />;
  const color = q.score >= 85 ? 'var(--ok)' : q.score >= 70 ? 'var(--info)' : q.score >= 50 ? 'var(--warn)' : 'var(--bad)';
  const order = { fail: 0, warn: 1, ok: 2 };
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div className="row between"><h3>Avaliação de qualidade</h3><span style={{ fontWeight: 800, fontSize: 22, color }}>{q.score}<span className="small faint">/100</span></span></div>
      <div className="bar"><div style={{ width: `${q.score}%`, background: color }} /></div>
      {dirty && <div className="small" style={{ color: 'var(--warn)' }}>Considera a última versão salva.</div>}
      {[...q.checks].sort((a, b) => order[a.status] - order[b.status]).map((c) => (
        <div key={c.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8, cursor: c.sectionType ? 'pointer' : 'default' }} onClick={() => c.sectionType && onGo(c.sectionType)}>
          <div className="row" style={{ gap: 8 }}><span className={`tag ${c.status === 'ok' ? 'ok' : c.status === 'warn' ? 'warn' : 'bad'}`}>{c.status === 'ok' ? 'ok' : c.status === 'warn' ? 'atenção' : 'falha'}</span><b className="small">{c.label}</b></div>
          <div className="small muted" style={{ marginTop: 3 }}>{c.detail}</div>
          {c.status !== 'ok' && c.fix && <div className="small" style={{ marginTop: 3 }}>→ {c.fix}</div>}
        </div>
      ))}
    </div>
  );
}

/* ---------- publicação: hospedagem e domínio ---------- */

interface PublishView {
  configured: boolean;
  status: SiteStatus;
  approved: boolean;
  version: number;
  outdated: boolean;
  publish: null | { siteName: string; url: string; adminUrl?: string; domain?: string; domainKind?: string; publishedAt?: string; publishedVersion?: number };
  records: { type: string; name: string; host: string; value: string }[];
}
interface DomainCheckUI { domain: string; dnsOk: boolean; httpsOk: boolean; message: string; records: { type: string; host: string; value: string; ok: boolean; found: string[] }[] }

function PublishModal({ siteId, businessName, onClose, onApprove }: { siteId: string; businessName: string; onClose: () => void; onApprove: () => void }) {
  const { notify } = useApp();
  const [v, setV] = useState<PublishView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [domain, setDomain] = useState('');
  const [check, setCheck] = useState<DomainCheckUI | null>(null);
  const load = () => api.get<PublishView>(`/api/sites/${siteId}/publish`).then(setV).catch((e) => notify(e.message, true));
  useEffect(() => {
    load();
  }, [siteId]);
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) notify(ok);
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy(null);
    }
  };
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      notify('Copiado');
    } catch {
      notify('Copie manualmente', true);
    }
  };
  const live = v?.publish && v.status === 'published';
  const liveUrl = v?.publish?.url;

  return (
    <Modal title={`Publicar o site — ${businessName}`} onClose={onClose}>
      {!v ? <Spinner /> : (
        <div className="stack" style={{ gap: 14 }}>
          {/* Passo 1: aprovação */}
          <div className="row" style={{ gap: 8 }}><span className={`tag ${v.approved ? 'ok' : 'warn'}`}>1</span><b>Aprovação do cliente</b></div>
          {v.approved ? (
            <div className="small muted">Aprovação registrada. A faixa de “demonstração” não aparece no site publicado.</div>
          ) : (
            <div className="alert warn small">
              O site só pode ir ao ar depois que o responsável pelo estabelecimento aprovar. <button className="btn sm" style={{ marginLeft: 6 }} onClick={onApprove}>Registrar aprovação</button>
            </div>
          )}

          {/* Passo 2: hospedagem */}
          <div className="row" style={{ gap: 8 }}><span className={`tag ${live ? 'ok' : v.approved ? 'info' : ''}`}>2</span><b>Colocar no ar (hospedagem Netlify)</b></div>
          {!v.configured ? (
            <div className="alert info small">
              <b>Hospedagem ainda não configurada.</b> Uma vez só:
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Crie uma conta gratuita em <a href="https://app.netlify.com/signup" target="_blank" rel="noreferrer">netlify.com</a>.</li>
                <li>Em <b>User settings → Applications → Personal access tokens</b>, clique em <b>New access token</b> e copie o token.</li>
                <li>No Render, abra o serviço do Hub → <b>Environment</b> → adicione <span className="mono">NETLIFY_AUTH_TOKEN</span> com o token → <b>Save Changes</b>.</li>
              </ol>
            </div>
          ) : live ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input mono" readOnly value={liveUrl ?? ''} />
                <button className="btn" onClick={() => copy(liveUrl!)}>Copiar</button>
                <a className="btn" href={liveUrl} target="_blank" rel="noreferrer">Abrir</a>
              </div>
              <div className="small faint">Publicado em {fmtDate(v.publish!.publishedAt)} (versão {v.publish!.publishedVersion}). Este endereço gratuito já funciona{v.publish!.domain ? `; https://${v.publish!.domain} passa a funcionar quando o DNS estiver configurado (passo 3)` : ''}.</div>
              {v.outdated && <div className="alert warn small">Há alterações salvas que ainda não estão no ar (versão {v.version}).</div>}
              <div className="row">
                <button className="btn primary" disabled={!!busy} onClick={() => run('pub', async () => setV(await api.post<PublishView>(`/api/sites/${siteId}/publish`)), 'Site atualizado no ar')}>
                  {busy === 'pub' ? <><Spinner /> Publicando…</> : 'Publicar alterações'}
                </button>
              </div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <div className="small muted">Publica o site (com as imagens e o cardápio autorizados) num endereço gratuito com HTTPS, que nunca “dorme”. Depois você conecta o domínio do cliente.</div>
              <div><button className="btn primary" disabled={!v.approved || !!busy} onClick={() => run('pub', async () => setV(await api.post<PublishView>(`/api/sites/${siteId}/publish`)), 'Site publicado!')}>
                {busy === 'pub' ? <><Spinner /> Publicando… (até 1 minuto)</> : 'Publicar agora'}
              </button></div>
            </div>
          )}

          {/* Passo 3: domínio */}
          <div className="row" style={{ gap: 8 }}><span className={`tag ${check?.httpsOk ? 'ok' : v.publish?.domain ? 'info' : ''}`}>3</span><b>Domínio do cliente</b></div>
          {!live ? (
            <div className="small faint">Disponível depois de publicar.</div>
          ) : !v.publish!.domain ? (
            <div className="stack" style={{ gap: 6 }}>
              <div className="small muted">O ideal é o próprio cliente registrar o domínio no nome dele (CPF/CNPJ) em <a href="https://registro.br" target="_blank" rel="noreferrer">registro.br</a>. Depois, informe aqui:</div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" placeholder="ex.: cafearoma.com.br" value={domain} onChange={(e) => setDomain(e.target.value)} />
                <button className="btn" disabled={!domain.trim() || !!busy} onClick={() => run('dom', async () => setV(await api.post<PublishView>(`/api/sites/${siteId}/domain`, { domain })), 'Domínio vinculado')}>{busy === 'dom' ? <Spinner /> : 'Conectar'}</button>
              </div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <div className="small">No <b>Registro.br</b>: entre em <b>Meus domínios</b> → clique em <b>{v.publish!.domain}</b> → <b>DNS</b> → <b>Editar zona</b> (se pedir, ative o “Modo avançado”) e crie estes registros:</div>
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th>Tipo</th><th>Nome</th><th>Valor</th><th></th></tr></thead>
                <tbody>
                  {v.records.map((r) => {
                    const c = check?.records.find((x) => x.host === r.host && x.type === r.type);
                    return (
                      <tr key={r.host + r.type}>
                        <td><b>{r.type}</b></td>
                        <td className="mono">{r.name || '(deixe em branco)'}</td>
                        <td className="mono">{r.value} <button className="icon-btn" onClick={() => copy(r.value)}>⧉</button></td>
                        <td>{c ? <span className={`tag ${c.ok ? 'ok' : 'warn'}`}>{c.ok ? 'ok' : 'pendente'}</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="small faint">Se já existir um registro A ou CNAME com o mesmo nome, edite-o em vez de criar outro. A propagação leva de minutos a algumas horas.</div>
              <div className="row">
                <button className="btn" disabled={!!busy} onClick={() => run('chk', async () => setCheck(await api.get<DomainCheckUI>(`/api/sites/${siteId}/domain/check`)))}>{busy === 'chk' ? <Spinner /> : 'Verificar domínio'}</button>
                <button className="btn ghost sm" disabled={!!busy} onClick={() => run('rmd', async () => (setV(await api.del<PublishView>(`/api/sites/${siteId}/domain`)), setCheck(null)))}>Trocar domínio</button>
              </div>
              {check && <div className={`alert small ${check.httpsOk ? 'ok' : check.dnsOk ? 'info' : 'warn'}`}>{check.message}</div>}
            </div>
          )}

          {live && (
            <>
              <div className="sep" />
              <div className="row between small">
                {v.publish!.adminUrl ? <a href={v.publish!.adminUrl} target="_blank" rel="noreferrer">Abrir no painel da Netlify</a> : <span />}
                <button className="btn ghost sm danger" disabled={!!busy} onClick={() => confirm('Retirar o site do ar? O endereço deixará de funcionar.') && run('unp', async () => setV(await api.del<PublishView>(`/api/sites/${siteId}/publish`)), 'Site retirado do ar')}>Retirar do ar</button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ---------- verificação visual renderizada (no navegador, desktop e celular) ---------- */

interface VCheck { label: string; ok: boolean; detail: string }

function measure(doc: Document, win: Window, mobile: boolean): VCheck[] {
  const vw = win.innerWidth;
  const vh = win.innerHeight;
  const out: VCheck[] = [];
  const sw = doc.documentElement.scrollWidth;
  out.push({ label: 'Sem rolagem lateral', ok: sw <= vw + 2, detail: sw <= vw + 2 ? 'Nada ultrapassa a largura da tela.' : `O conteúdo tem ${sw}px numa tela de ${vw}px.` });
  const hero = doc.querySelector('main section');
  const cta = hero?.querySelector('.btn, .link') as HTMLElement | null;
  const ctaTop = cta ? cta.getBoundingClientRect().top + win.scrollY : Infinity;
  out.push({ label: 'Botão de ação na primeira tela', ok: ctaTop < vh, detail: !cta ? 'Nenhum botão na abertura.' : ctaTop < vh ? 'Visível sem rolar.' : `Aparece só após rolar ${Math.round(ctaTop - vh)}px.` });
  const h1 = doc.querySelector('h1') as HTMLElement | null;
  const h1w = h1 ? Math.max(...Array.from(h1.querySelectorAll('span')).map((x) => (x as HTMLElement).scrollWidth), h1.scrollWidth) : 0;
  out.push({ label: 'Título cabe na tela', ok: !h1 || h1w <= vw, detail: h1 ? (h1w <= vw ? 'Sem cortes.' : 'O título está cortado ou ultrapassa a tela.') : 'Sem título.' });
  let small = 0;
  doc.querySelectorAll('main p, main span, main a, main b, main li').forEach((el) => {
    const e = el as HTMLElement;
    if (!e.textContent?.trim() || e.children.length) return;
    const fs = parseFloat(win.getComputedStyle(e).fontSize);
    if (fs < (mobile ? 12 : 11.5)) small++;
  });
  out.push({ label: 'Textos legíveis', ok: small === 0, detail: small ? `${small} texto(s) com letra muito pequena.` : 'Tamanhos de letra adequados.' });
  if (mobile) {
    let tiny = 0;
    doc.querySelectorAll('.btn, .mbar a, .mnav summary').forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width && r.height < 40) tiny++;
    });
    out.push({ label: 'Botões fáceis de tocar', ok: tiny === 0, detail: tiny ? `${tiny} botão(ões) com menos de 40px de altura.` : 'Todos com área de toque confortável.' });
    out.push({ label: 'Barra de ações fixa', ok: !!doc.querySelector('.mbar'), detail: doc.querySelector('.mbar') ? 'Contato, cardápio e rota sempre à mão.' : 'Sem dados suficientes para a barra (contato/rota).' });
  }
  const broken = Array.from(doc.images).filter((i) => i.complete && i.naturalWidth === 0).length;
  out.push({ label: 'Imagens carregadas', ok: broken === 0, detail: broken ? `${broken} imagem(ns) com erro.` : 'Sem imagens quebradas.' });
  return out;
}

function VisualCheck({ spec, resolveAsset }: { spec: SiteSpec; resolveAsset: (id: string) => string | null }) {
  const [res, setRes] = useState<{ desktop: VCheck[]; mobile: VCheck[] } | null>(null);
  const [running, setRunning] = useState(false);
  const html = useMemo(() => renderSite(spec, { mode: 'preview', resolveAsset, demoNotice: null }), [spec, resolveAsset]);
  const host = useRef<HTMLDivElement>(null);

  async function run() {
    if (!host.current) return;
    setRunning(true);
    const one = (w: number, h: number, mobile: boolean) =>
      new Promise<VCheck[]>((resolve) => {
        const f = document.createElement('iframe');
        f.style.cssText = `position:absolute;left:-10000px;top:0;width:${w}px;height:${h}px;border:0;visibility:hidden`;
        f.onload = () => {
          const doc = f.contentDocument!;
          if (!doc?.querySelector('main')) return; // ignora o carregamento inicial vazio (about:blank)
          const done = () => setTimeout(() => {
            try {
              resolve(measure(doc, f.contentWindow!, mobile));
            } catch {
              resolve([]);
            }
            f.remove();
          }, 600);
          (doc as any).fonts?.ready ? (doc as any).fonts.ready.then(done) : done();
        };
        f.srcdoc = html;
        host.current!.appendChild(f);
      });
    const [desktop, mobile] = await Promise.all([one(1280, 800, false), one(390, 844, true)]);
    setRes({ desktop, mobile });
    setRunning(false);
  }

  useEffect(() => {
    const t = setTimeout(run, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  const all = res ? [...res.desktop, ...res.mobile] : [];
  const fails = all.filter((c) => !c.ok).length;
  return (
    <div className="card card-pad stack" style={{ gap: 8 }}>
      <div ref={host} style={{ position: 'relative', height: 0, overflow: 'hidden' }} />
      <div className="row between"><h3>Verificação visual</h3>{running ? <Spinner /> : res && <span className={`tag ${fails ? 'warn' : 'ok'}`}>{fails ? `${fails} ajuste(s)` : 'tudo certo'}</span>}</div>
      <p className="small muted">O site é renderizado de verdade em 1280px (desktop) e 390px (celular) e medido: rolagem lateral, botão na primeira tela, título, legibilidade e toque.</p>
      {res && (['desktop', 'mobile'] as const).map((k) => (
        <div key={k}>
          <div className="small" style={{ fontWeight: 700, margin: '6px 0 4px' }}>{k === 'desktop' ? 'Desktop' : 'Celular'}</div>
          {res[k].map((c) => (
            <div key={c.label} className="row small" style={{ gap: 8, padding: '3px 0', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <span className={`tag ${c.ok ? 'ok' : 'warn'}`} style={{ minWidth: 26, justifyContent: 'center' }}><Icon name={c.ok ? 'check' : 'alert'} size={11} /></span>
              <span><b>{c.label}</b> <span className="muted">— {c.detail}</span></span>
            </div>
          ))}
        </div>
      ))}
      <button className="btn sm" style={{ justifySelf: 'start' }} disabled={running} onClick={run}><Icon name="refresh" size={14} />Verificar de novo</button>
    </div>
  );
}
