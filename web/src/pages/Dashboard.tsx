import { Link } from 'react-router-dom';
import { useApp, useLoad } from '../lib/context.tsx';
import { fmtDate, type BusinessX } from '../lib/api.ts';
import { Empty, Score, WebsiteBadge } from '../components/ui.tsx';
import { WEBSITE_STATUS_LABEL, type WebsiteStatus } from '../../../shared/types.ts';

interface Dash {
  totals: Record<string, number>;
  byStage: { stage: string; c: number }[];
  bySegment: { segment: string; c: number }[];
  byWebsite: { status: WebsiteStatus; c: number }[];
  top: BusinessX[];
  recent: { message: string; type: string; createdAt: string; businessName: string; businessId: string }[];
}

export function Dashboard() {
  const { data } = useLoad<Dash>('/api/dashboard');
  const { config, segmentLabel, stageLabel } = useApp();
  const t = data?.totals;
  const kpis: [string, number | undefined, string][] = [
    ['Estabelecimentos encontrados', t?.found, `${t?.saved ?? 0} salvos no CRM`],
    ['Oportunidades (sem site identificado)', t?.opportunities, `${t?.confirmedNoSite ?? 0} com ausência confirmada ou só redes`],
    ['Demonstrações criadas', t?.demos, `${t?.reviewed ?? 0} revisadas`],
    ['Clientes convertidos', t?.won, `${t?.proposals ?? 0} em proposta/negociação`],
  ];
  const maxStage = Math.max(1, ...(data?.byStage.map((s) => s.c) ?? [1]));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral das oportunidades e dos sites desenvolvidos.</p>
        </div>
        <Link className="btn primary" to="/explorar">Pesquisar negócios</Link>
      </div>

      {config && (!config.integrations.ai || !config.integrations.googlePlaces) && (
        <div className="alert info" style={{ marginBottom: 16 }}>
          {!config.integrations.googlePlaces && <div>• <b>Google Places</b> não configurado: a ausência de site será marcada como “não confirmada” até você verificar manualmente.</div>}
          {!config.integrations.ai && <div>• <b>IA</b> não configurada: os sites são gerados com textos modelo por segmento (marcados para revisão). Configure <span className="mono">ANTHROPIC_API_KEY</span> para textos personalizados.</div>}
        </div>
      )}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        {kpis.map(([l, v, s]) => (
          <div className="card kpi" key={l}>
            <div className="l">{l}</div>
            <div className="v">{v ?? '—'}</div>
            <div className="s">{s}</div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <h2>Oportunidades prioritárias</h2>
            <span className="small muted" title="Pontuação baseada só em dados observáveis: situação do site, aderência do segmento, contato público, atividade. Nunca em faturamento estimado.">Como a prioridade é calculada?</span>
          </div>
          {data?.top.length ? (
            <table className="table">
              <tbody>
                {data.top.map((b) => (
                  <tr key={b.id}>
                    <td style={{ width: 50 }}><Score value={b.priorityScore} /></td>
                    <td>
                      <Link to={`/investigacao/${b.id}`} style={{ fontWeight: 600, color: 'var(--text)' }}>{b.name}</Link>
                      <div className="small muted">{segmentLabel(b.segment)} · {b.address.suburb ?? b.address.city ?? '—'}</div>
                      <div className="small faint" style={{ marginTop: 2 }}>{b.priorityReasons.filter((r) => r.points > 0).slice(0, 2).map((r) => r.label).join(' · ')}</div>
                    </td>
                    <td><WebsiteBadge status={b.websiteStatus} /></td>
                    <td className="small muted">{stageLabel(b.stage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty title="Nenhuma oportunidade ainda">Comece pesquisando estabelecimentos em <Link to="/explorar">Explorar negócios</Link>.</Empty>
          )}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card card-pad">
            <h2 style={{ marginBottom: 12 }}>Funil comercial</h2>
            {config?.stages.map((s) => {
              const c = data?.byStage.find((x) => x.stage === s.id)?.c ?? 0;
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 28px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span className="small muted">{s.label}</span>
                  <div className="bar"><div style={{ width: `${(c / maxStage) * 100}%` }} /></div>
                  <span className="small" style={{ textAlign: 'right', fontWeight: 600 }}>{c}</span>
                </div>
              );
            })}
          </div>
          <div className="card card-pad">
            <h2 style={{ marginBottom: 10 }}>Situação dos sites</h2>
            <div className="stack" style={{ gap: 6 }}>
              {data?.byWebsite.map((w) => (
                <div className="row between" key={w.status}>
                  <WebsiteBadge status={w.status} />
                  <b>{w.c}</b>
                </div>
              ))}
              {!data?.byWebsite.length && <span className="muted small">Sem dados.</span>}
            </div>
            {data?.bySegment.length ? <div className="sep" /> : null}
            <div className="chips">
              {data?.bySegment.map((s) => <span className="tag" key={s.segment}>{segmentLabel(s.segment)}: {s.c}</span>)}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Atividade recente</h2></div>
        <div className="card-pad timeline">
          {data?.recent.map((r, i) => (
            <div className="it" key={i}>
              <div>
                <Link to={`/investigacao/${r.businessId}`} style={{ fontWeight: 600 }}>{r.businessName}</Link> <span className="muted">— {r.message}</span>
                <div className="small faint">{fmtDate(r.createdAt)}</div>
              </div>
            </div>
          ))}
          {!data?.recent.length && <span className="muted">Nenhuma atividade registrada.</span>}
        </div>
      </div>
      <p className="small faint" style={{ marginTop: 14 }}>Legenda: {Object.values(WEBSITE_STATUS_LABEL).join(' · ')}. Dados de estabelecimentos © colaboradores do OpenStreetMap (ODbL).</p>
    </div>
  );
}
