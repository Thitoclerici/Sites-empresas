import { Link } from 'react-router-dom';
import { useApp, useLoad } from '../lib/context.tsx';
import { fmtDate, type BusinessX } from '../lib/api.ts';
import { Empty, Score, Skeleton, WebsiteBadge } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import type { WebsiteStatus } from '../../../shared/types.ts';

interface Dash {
  totals: Record<string, number>;
  byStage: { stage: string; c: number }[];
  bySegment: { segment: string; c: number }[];
  byWebsite: { status: WebsiteStatus; c: number }[];
  top: (BusinessX & { sites?: number })[];
  recent: { message: string; type: string; createdAt: string; businessName: string; businessId: string }[];
}

const FLOW = [
  { n: 1, t: 'Encontrar', d: 'Busque negócios por bairro e tipo', to: '/explorar' },
  { n: 2, t: 'Investigar', d: 'Veja contatos, site e redes', to: '/investigacao' },
  { n: 3, t: 'Complementar', d: 'Revise dados, fotos e cardápio', to: '/investigacao' },
  { n: 4, t: 'Gerar o site', d: '3 propostas visuais com IA', to: '/estudio' },
  { n: 5, t: 'Revisar e enviar', d: 'Ajuste, envie o link e acompanhe', to: '/pipeline' },
];

export function Dashboard() {
  const { data } = useLoad<Dash>('/api/dashboard');
  const { config, segmentLabel, stageLabel } = useApp();
  const t = data?.totals;
  const fresh = data && t!.found === 0;
  const kpis: [string, string, number | undefined, string][] = [
    ['search', 'Negócios encontrados', t?.found, `${t?.saved ?? 0} nas suas oportunidades`],
    ['star', 'Oportunidades', t?.opportunities, `${t?.confirmedNoSite ?? 0} com ausência de site confirmada`],
    ['studio', 'Demonstrações', t?.demos, `${t?.reviewed ?? 0} revisadas`],
    ['rocket', 'Clientes', t?.won, `${t?.proposals ?? 0} em proposta ou negociação`],
  ];
  const maxStage = Math.max(1, ...(data?.byStage.map((s) => s.c) ?? [1]));
  const missing = config && [!config.integrations.googlePlaces && 'Google Places', !config.integrations.ai && 'IA', !config.integrations.hosting && 'Hospedagem'].filter(Boolean);

  return (
    <div className="page">
      <section className="welcome">
        <img className="mark" src="/brand/logo-mark.png" alt="" />
        <h1>{fresh ? 'Bem-vindo à Prospecta' : 'Visão geral'}</h1>
        <p>Encontre negócios sem site na sua região, investigue as informações públicas e gere em minutos uma demonstração de site profissional para apresentar ao proprietário.</p>
        <div className="flow">
          {FLOW.map((f) => (
            <Link key={f.n} to={f.to} className="fs" style={{ color: '#fff' }}>
              <span className="n">{f.n}</span>
              <b>{f.t}</b>
              <small>{f.d}</small>
            </Link>
          ))}
        </div>
        <div className="row" style={{ marginTop: 20 }}>
          <Link className="btn lg" style={{ background: '#fff', color: 'var(--brand)', border: 0 }} to="/explorar"><Icon name="search" />{fresh ? 'Fazer minha primeira busca' : 'Nova busca'}</Link>
        </div>
      </section>

      {missing && missing.length > 0 && (
        <div className="alert info" style={{ margin: '16px 0 0' }}>
          <Icon name="info" />
          <div>
            Integrações opcionais desligadas: <b>{missing.join(', ')}</b>. A plataforma funciona sem elas, com estas diferenças:
            {!config!.integrations.googlePlaces && <> a ausência de site fica “não confirmada” até você verificar;</>}
            {!config!.integrations.ai && <> os textos dos sites usam modelos por segmento (marcados para revisão);</>}
            {!config!.integrations.hosting && <> o botão Publicar fica indisponível (use “Exportar HTML”).</>}
          </div>
        </div>
      )}

      <div className="grid g4" style={{ margin: '16px 0' }}>
        {kpis.map(([ic, l, v, s]) => (
          <div className="card kpi" key={l}>
            <div className="ic"><Icon name={ic} /></div>
            <div className="l">{l}</div>
            {v === undefined ? <Skeleton h={30} w={70} /> : <div className="v">{v}</div>}
            <div className="s">{s}</div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <div><h2>Próximas oportunidades</h2><p>Ordenadas pela prioridade — critérios verificáveis, sem estimativas financeiras.</p></div>
            <Link className="btn sm" to="/investigacao">Ver todas</Link>
          </div>
          {!data ? (
            <div className="card-pad stack">{[1, 2, 3].map((i) => <Skeleton key={i} h={44} />)}</div>
          ) : data.top.length ? (
            <table className="table">
              <tbody>
                {data.top.map((b) => (
                  <tr key={b.id}>
                    <td style={{ width: 56 }}><Score value={b.priorityScore} /></td>
                    <td>
                      <Link to={`/investigacao/${b.id}`} style={{ fontWeight: 700, color: 'var(--navy)' }}>{b.name}</Link>
                      <div className="small muted">{segmentLabel(b.segment)} · {b.address.suburb ?? b.address.city ?? '—'}</div>
                    </td>
                    <td><WebsiteBadge status={b.websiteStatus} quality={b.websiteQuality} /></td>
                    <td className="small muted">{b.saved ? stageLabel(b.stage) : 'Não salvo'}</td>
                    <td style={{ textAlign: 'right' }}><Link className="btn sm" to={`/investigacao/${b.id}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty title="Nenhuma oportunidade ainda" icon="search">Comece em <Link to="/explorar">Encontrar negócios</Link>.</Empty>
          )}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="card card-pad">
            <h2 style={{ marginBottom: 14 }}>Funil de vendas</h2>
            {config?.stages.map((s) => {
              const c = data?.byStage.find((x) => x.stage === s.id)?.c ?? 0;
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 26px', gap: 10, alignItems: 'center', marginBottom: 7 }}>
                  <span className="small muted">{s.label}</span>
                  <div className="bar"><div style={{ width: `${(c / maxStage) * 100}%` }} /></div>
                  <span className="small" style={{ textAlign: 'right', fontWeight: 700 }}>{c}</span>
                </div>
              );
            })}
          </div>
          <div className="card card-pad">
            <h2 style={{ marginBottom: 12 }}>Situação dos sites</h2>
            <div className="stack" style={{ gap: 8 }}>
              {data?.byWebsite.map((w) => (
                <div className="row between" key={w.status}><WebsiteBadge status={w.status} /><b>{w.c}</b></div>
              ))}
              {data && !data.byWebsite.length && <span className="muted small">Sem dados ainda.</span>}
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
                <Link to={`/investigacao/${r.businessId}`} style={{ fontWeight: 700 }}>{r.businessName}</Link> <span className="muted">— {r.message}</span>
                <div className="small faint">{fmtDate(r.createdAt)}</div>
              </div>
            </div>
          ))}
          {data && !data.recent.length && <span className="muted">Nenhuma atividade registrada.</span>}
        </div>
      </div>
    </div>
  );
}
