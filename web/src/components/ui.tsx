import type { ReactNode } from 'react';
import { WEBSITE_STATUS_LABEL, type FactStatus, type WebsiteStatus } from '../../../shared/types.ts';

export function WebsiteBadge({ status }: { status: WebsiteStatus }) {
  const cls = { has_site: 'bad', social_only: 'ok', none_found: 'ok', unverified: 'warn' }[status];
  const title = {
    has_site: 'Um site próprio foi identificado em alguma fonte.',
    social_only: 'Só redes sociais ou plataformas de terceiros (delivery, cardápio digital) foram identificadas.',
    none_found: 'Nenhuma das fontes consultadas indicou site (ou o operador confirmou).',
    unverified: 'O OpenStreetMap não registra site, mas isso não confirma a ausência. Configure o Google Places ou confirme manualmente.',
  }[status];
  return <span className={`tag ${cls}`} title={title}>{WEBSITE_STATUS_LABEL[status]}</span>;
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

export function Score({ value }: { value: number }) {
  const bg = value >= 60 ? 'var(--ok-soft)' : value >= 35 ? 'var(--warn-soft)' : '#f0f1f4';
  const fg = value >= 60 ? 'var(--ok)' : value >= 35 ? 'var(--warn)' : 'var(--muted)';
  return <span className="score" style={{ background: bg, color: fg }}>{value}</span>;
}

export function Spinner() {
  return <span className="spinner" />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="card-pad">{children}</div>
      </div>
    </div>
  );
}
