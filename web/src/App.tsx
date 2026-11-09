import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
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

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
