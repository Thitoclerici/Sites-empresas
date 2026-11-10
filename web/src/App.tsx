import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './lib/api.ts';
import { Icon } from './components/Icon.tsx';
import { CreateSite } from './pages/CreateSite.tsx';
import { AppProvider, useApp } from './lib/context.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Explore } from './pages/Explore.tsx';
import { Investigations, BusinessPage } from './pages/Business.tsx';
import { StudioList, StudioEditor } from './pages/Studio.tsx';
import { Pipeline } from './pages/Pipeline.tsx';

function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { config } = useApp();
  const i = config?.integrations;
  const item = (to: string, icon: string, label: string, step?: number, end?: boolean) => (
    <NavLink to={to} end={end} onClick={onNavigate}><Icon name={icon} />{label}{step ? <span className="step">{step}</span> : null}</NavLink>
  );
  return (
    <aside className={`side ${open ? 'open' : ''}`}>
      <a className="logo" href="/" aria-label="Prospecta — início"><img className="mark" src="/brand/logo-mark.png" alt="" /><img className="word" src="/brand/logo-word.png" alt="Prospecta" /></a>
      <nav className="nav stack" style={{ gap: 2 }}>
        {item('/', 'dashboard', 'Visão geral', undefined, true)}
        <div className="nav-label">Fluxo de trabalho</div>
        {item('/explorar', 'search', 'Encontrar negócios', 1)}
        {item('/investigacao', 'investigate', 'Investigar', 2)}
        {item('/estudio', 'studio', 'Sites criados', 3)}
        {item('/pipeline', 'pipeline', 'Vendas', 4)}
      </nav>
      <div className="side-foot">
        <b>Integrações</b>
        <div title="Fonte dos estabelecimentos (sempre ativa)"><span className={`dot ${i?.osm ? 'on' : ''}`} />OpenStreetMap</div>
        <div title="Confirma se o negócio tem site, telefone e horários"><span className={`dot ${i?.googlePlaces ? 'on' : ''}`} />Google Places {i && !i.googlePlaces && <span className="faint">· opcional</span>}</div>
        <div title="Escreve textos personalizados para os sites"><span className={`dot ${i?.ai ? 'on' : ''}`} />IA (Claude) {i && !i.ai && <span className="faint">· opcional</span>}</div>
        <div title="Publica os sites aprovados"><span className={`dot ${i?.hosting ? 'on' : ''}`} />Hospedagem {i && !i.hosting && <span className="faint">· opcional</span>}</div>
        <button className="btn ghost sm" style={{ justifyContent: 'flex-start', padding: 0, marginTop: 4, color: 'var(--muted)' }} onClick={async () => { await api.post('/api/logout'); location.reload(); }}><Icon name="logout" size={15} />Sair</button>
      </div>
    </aside>
  );
}

function Shell() {
  const loc = useLocation();
  const fullscreen = /^\/estudio\/[^/]+/.test(loc.pathname);
  const { toast } = useApp();
  const [menu, setMenu] = useState(false);
  return (
    <div className={fullscreen ? '' : 'app'}>
      {!fullscreen && (
        <>
          <div className="mtop"><img src="/brand/logo-word.png" alt="Prospecta" /><button className="btn sm" onClick={() => setMenu(!menu)} aria-label="Menu"><Icon name="menu" /></button></div>
          <Sidebar open={menu} onNavigate={() => setMenu(false)} />
        </>
      )}
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/explorar" element={<Explore />} />
          <Route path="/investigacao" element={<Investigations />} />
          <Route path="/investigacao/:id" element={<BusinessPage />} />
          <Route path="/criar/:id" element={<CreateSite />} />
          <Route path="/estudio" element={<StudioList />} />
          <Route path="/estudio/:id" element={<StudioEditor />} />
          <Route path="/pipeline" element={<Pipeline />} />
        </Routes>
      </main>
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}><Icon name={toast.err ? 'alert' : 'check'} size={16} />{toast.msg}</div>}
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'radial-gradient(120% 120% at 100% 0%, #2e9bff 0%, #1a56db 35%, #0a1f52 100%)', padding: 20 }}>
      <form
        className="card card-pad stack"
        style={{ width: 'min(400px,100%)', gap: 14, padding: 30, borderRadius: 20, boxShadow: 'var(--shadow-lg)' }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.post('/api/login', { password });
            onDone();
          } catch (err: any) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <img src="/brand/logo-full.png" alt="Prospecta" style={{ width: 170, margin: '6px auto 4px' }} />
        <p className="muted" style={{ textAlign: 'center' }}>Encontre clientes e crie sites profissionais com IA.</p>
        <label className="field"><span>Senha</span><input className="input" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="alert bad">{error}</div>}
        <button className="btn primary lg" disabled={busy || !password}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading');
  const check = () =>
    api
      .get<{ required: boolean; authenticated: boolean }>('/api/auth/status')
      .then((s) => setAuth(s.authenticated ? 'in' : 'out'))
      .catch(() => setAuth('in'));
  useEffect(() => {
    check();
  }, []);
  if (auth === 'loading') return null;
  if (auth === 'out') return <Login onDone={check} />;
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
