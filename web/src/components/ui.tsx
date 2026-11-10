import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FactStatus, WebsiteStatus } from '../../../shared/types.ts';
import { Icon } from './Icon.tsx';

/* ---------- situação do site (3 categorias + subtipos) ---------- */

export const SITE_GROUP: Record<WebsiteStatus, { group: 'none' | 'has' | 'unknown'; label: string; cls: string; title: string }> = {
  none_found: { group: 'none', label: 'Sem site', cls: 'ok', title: 'Nenhuma fonte consultada indicou site próprio (ou você confirmou manualmente).' },
  social_only: { group: 'none', label: 'Só redes sociais', cls: 'ok', title: 'Sem site próprio: apenas redes sociais ou plataformas de terceiros (delivery, cardápio digital).' },
  has_site: { group: 'has', label: 'Possui site', cls: 'bad', title: 'Um site próprio foi identificado em alguma fonte.' },
  unverified: { group: 'unknown', label: 'Não confirmado', cls: 'warn', title: 'O OpenStreetMap não registra site, mas isso não prova que não exista. Investigue ou confirme manualmente.' },
};

export function WebsiteBadge({ status, quality }: { status: WebsiteStatus; quality?: string | null }) {
  if (status === 'has_site' && (quality === 'weak' || quality === 'unreachable')) {
    return (
      <span className="tag warn" title={quality === 'unreachable' ? 'O endereço do site não respondeu — pode estar fora do ar.' : 'Site existente com sinais de desatualização ou baixa qualidade (veja os motivos na investigação).'}>
        <Icon name="alert" size={12} />
        {quality === 'unreachable' ? 'Site fora do ar' : 'Site fraco'}
      </span>
    );
  }
  const g = SITE_GROUP[status];
  return (
    <span className={`tag ${g.cls}`} title={g.title}>
      <Icon name={g.group === 'none' ? 'check' : g.group === 'has' ? 'globe' : 'info'} size={12} />
      {g.label}
    </span>
  );
}

const FACT_LABEL: Record<FactStatus, [string, string]> = {
  verified: ['Verificado', 'ok'],
  user_provided: ['Informado por você', 'info'],
  unconfirmed: ['Não confirmado', 'warn'],
  ai_suggested: ['Sugestão da IA', 'brand'],
};
export function FactBadge({ status }: { status: FactStatus }) {
  const [l, c] = FACT_LABEL[status];
  return <span className={`tag ${c}`}>{l}</span>;
}

/** Origem de um dado: encontrado automaticamente ou informado manualmente. */
const SHORT: Record<string, string> = { OpenStreetMap: 'OSM', 'Google Places': 'Google', 'Site oficial': 'site', Inferência: 'indício' };
export function SourceBadge({ auto, source }: { auto: boolean; source?: string }) {
  return auto ? (
    <span className="src-auto" title={source ? `Encontrado automaticamente — fonte: ${source}` : 'Encontrado automaticamente'}><Icon name="sparkle" size={10} />Auto{source ? ` · ${SHORT[source] ?? source}` : ''}</span>
  ) : (
    <span className="src-manual" title="Informado por você"><Icon name="edit" size={10} />Você</span>
  );
}

export function Score({ value }: { value: number }) {
  const bg = value >= 60 ? 'var(--ok-soft)' : value >= 35 ? 'var(--warn-soft)' : '#eef1f7';
  const fg = value >= 60 ? 'var(--ok)' : value >= 35 ? 'var(--warn)' : 'var(--muted)';
  return <span className="score" style={{ background: bg, color: fg }} title="Prioridade (0–100): critérios em “Como calculamos”">{value}</span>;
}

export function Spinner() {
  return <span className="spinner" />;
}

export function Empty({ title, icon = 'search', children }: { title: string; icon?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ill"><Icon name={icon} size={28} /></div>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={wide ? { width: 'min(980px,100%)' } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="card-pad">{children}</div>
      </div>
    </div>
  );
}

export function PageHead({ title, subtitle, crumb, actions }: { title: ReactNode; subtitle?: ReactNode; crumb?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

/** Campo de formulário com rótulo, obrigatoriedade, explicação, exemplo, origem e erro. */
export function Field({
  label,
  required,
  hint,
  example,
  error,
  source,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  example?: string;
  error?: string | null;
  source?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? <span className="req" title="Obrigatório">*</span> : <span className="opt">opcional</span>}
        {source && <span style={{ marginLeft: 'auto' }}>{source}</span>}
      </span>
      {children}
      {error ? (
        <span className="ferr"><Icon name="alert" size={13} />{error}</span>
      ) : hint || example ? (
        <span className="help">{hint}{hint && example ? ' ' : ''}{example && <span className="faint">Ex.: {example}</span>}</span>
      ) : null}
    </label>
  );
}

/* ---------- jornada principal ---------- */

export const JOURNEY = [
  { id: 'find', label: 'Encontrar' },
  { id: 'investigate', label: 'Investigar' },
  { id: 'complete', label: 'Complementar' },
  { id: 'generate', label: 'Gerar site' },
  { id: 'review', label: 'Revisar' },
  { id: 'save', label: 'Salvar e enviar' },
] as const;

export function JourneyBar({ current, links = {} }: { current: number; links?: Partial<Record<number, string>> }) {
  return (
    <div className="journey" aria-label="Etapas do processo">
      {JOURNEY.map((s, i) => {
        const cls = i < current ? 'done' : i === current ? 'now' : '';
        const inner = (
          <>
            <span className="n">{i < current ? <Icon name="check" size={13} /> : i + 1}</span>
            {s.label}
          </>
        );
        return (
          <span key={s.id} style={{ display: 'contents' }}>
            {links[i] ? <Link className={`jstep ${cls}`} to={links[i]!}>{inner}</Link> : <span className={`jstep ${cls}`}>{inner}</span>}
            {i < JOURNEY.length - 1 && <span className="jsep" />}
          </span>
        );
      })}
    </div>
  );
}

/** Indicador de progresso em etapas para operações longas (as etapas avançam enquanto a operação roda). */
export function Progress({ steps, running }: { steps: string[]; running: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!running) return setI(0);
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 2600);
    return () => clearInterval(t);
  }, [running, steps.length]);
  if (!running) return null;
  return (
    <div className="progress">
      {steps.map((s, n) => (
        <div key={s} className={`pstep ${n < i ? 'done' : n === i ? 'now' : ''}`}>
          <span className="b">{n < i ? <Icon name="check" size={12} /> : null}</span>
          {s}
        </div>
      ))}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;
}
