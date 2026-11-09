import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './lib/api.ts';
import { AppProvider, useApp } from './lib/context.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Explore } from './pages/Explore.tsx';
import { Investigations, BusinessPage } from './pages/Business.tsx';
import { StudioList, StudioEditor } from './pages/Studio.tsx';
import { Pipeline } from './pages/Pipeline.tsx';

function Sidebar() {
  const { config } = useApp();
  const i = config?.integrations;
  return (
    <aside className="side">
      <div className="logo">
        <span>P</span>Prospecta
      </div>
      <nav className="nav stack" style={{ gap: 2 }}>
        <NavLink to="/" end><span className="ico">◧</span>Dashboard</NavLink>
        <NavLink to="/explorar"><span className="ico">⌕</span>Explorar negócios</NavLink>
        <NavLink to="/investigacao"><span className="ico">◎</span>Investigação</NavLink>
        <NavLink to="/estudio"><span className="ico">✦</span>Estúdio de criação</NavLink>
        <NavLink to="/pipeline"><span className="ico">▤</span>Pipeline comercial</NavLink>
      </nav>
      <div className="side-foot">
        <div style={{ fontWeight: 600, color: '#fff', marginBottom: 2 }}>Integrações</div>
        <div><span className={`dot ${i?.osm ? 'on' : ''}`} />OpenStreetMap</div>
        <div><span className={`dot ${i?.googlePlaces ? 'on' : ''}`} />Google Places {i && !i.googlePlaces && <span className="faint">(opcional)</span>}</div>
        <div><span className={`dot ${i?.ai ? 'on' : ''}`} />IA (Claude) {i && !i.ai && <span className="faint">(opcional)</span>}</div>
        <button className="btn ghost sm" style={{ color: '#b4bac6', justifyContent: 'flex-start', padding: 0, marginTop: 6 }} onClick={async () => { await api.post('/api/logout'); location.reload(); }}>Sair</button>
      </div>
    </aside>
  );
}

function Shell() {
  const loc = useLocation();
  const fullscreen = /^\/estudio\/[^/]+/.test(loc.pathname);
  const { toast } = useApp();
  return (
    <div className={fullscreen ? '' : 'app'}>
      {!fullscreen && <Sidebar />}
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/explorar" element={<Explore />} />
          <Route path="/investigacao" element={<Investigations />} />
          <Route path="/investigacao/:id" element={<BusinessPage />} />
          <Route path="/estudio" element={<StudioList />} />
          <Route path="/estudio/:id" element={<StudioEditor />} />
          <Route path="/pipeline" element={<Pipeline />} />
        </Routes>
      </main>
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`}>{toast.msg}</div>}
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f1115', padding: 20 }}>
      <form
        className="card card-pad stack"
        style={{ width: 'min(380px,100%)', gap: 14 }}
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
        <div className="logo" style={{ color: 'var(--text)', padding: 0 }}><span style={{ color: '#fff' }}>P</span>Prospecta</div>
        <p className="muted">Entre com a senha do seu Hub.</p>
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
