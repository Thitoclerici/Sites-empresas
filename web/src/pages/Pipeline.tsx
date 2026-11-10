import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type BusinessX } from '../lib/api.ts';
import { useApp, useLoad } from '../lib/context.tsx';
import { Score, WebsiteBadge } from '../components/ui.tsx';

type Col = { id: string; label: string; items: (BusinessX & { sites: number })[] };

export function Pipeline() {
  const { data, setData, reload } = useLoad<Col[]>('/api/pipeline');
  const { notify, segmentLabel } = useApp();
  const [over, setOver] = useState<string | null>(null);
  const [seg, setSeg] = useState('');

  async function move(id: string, stage: string) {
    if (!data) return;
    const item = data.flatMap((c) => c.items).find((i) => i.id === id);
    if (!item || item.stage === stage) return;
    setData(data.map((c) => ({ ...c, items: c.id === stage ? [{ ...item, stage: stage as any }, ...c.items] : c.items.filter((i) => i.id !== id) })));
    try {
      await api.patch(`/api/businesses/${id}`, { stage });
    } catch (e: any) {
      notify(e.message, true);
      reload();
    }
  }

  const total = data?.reduce((n, c) => n + c.items.length, 0) ?? 0;
  const segments = Array.from(new Set(data?.flatMap((c) => c.items.map((i) => i.segment)) ?? []));
  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <div className="page-head">
        <div>
          <div className="crumb"><span className="tag info">Etapa 4</span> Fluxo de trabalho</div>
          <h1>Vendas</h1>
          <p>{total} oportunidades no CRM. Arraste os cartões entre as etapas. Contatos comerciais são feitos e registrados por você; nada é enviado automaticamente.</p>
        </div>
        <select className="select" style={{ width: 200 }} value={seg} onChange={(e) => setSeg(e.target.value)}>
          <option value="">Todos os segmentos</option>
          {segments.map((s) => <option key={s} value={s}>{segmentLabel(s)}</option>)}
        </select>
      </div>
      <div className="board">
        {data?.map((col) => {
          const items = seg ? col.items.filter((i) => i.segment === seg) : col.items;
          return (
            <div
              key={col.id}
              className={`col ${over === col.id ? 'drop' : ''}`}
              onDragOver={(e) => (e.preventDefault(), setOver(col.id))}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                setOver(null);
                move(e.dataTransfer.getData('text/plain'), col.id);
              }}
            >
              <div className="col-head"><span>{col.label}</span><span>{items.length}</span></div>
              {items.map((b) => (
                <div key={b.id} className="deal" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', b.id)}>
                  <div className="row between" style={{ flexWrap: 'nowrap' }}>
                    <Link to={`/investigacao/${b.id}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{b.name}</Link>
                    <Score value={b.priorityScore} />
                  </div>
                  <div className="small muted">{segmentLabel(b.segment)} · {b.address.suburb ?? b.address.city ?? ''}</div>
                  <div className="row" style={{ gap: 6 }}>
                    <WebsiteBadge status={b.websiteStatus} />
                    {b.sites > 0 && <span className="tag brand">{b.sites} demo</span>}
                    {b.phone && <span className="tag">tel.</span>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
