import React, { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, canWrite, isAdmin } from './auth.jsx';
import { ToastProvider, Icon, Loading, useApi, BusyBar } from './components/ui.jsx';
import { ROLE } from './format.js';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Organigramma from './pages/Organigramma.jsx';
import NewResource from './pages/NewResource.jsx';
import Resources from './pages/Resources.jsx';
import ResourceDetail from './pages/ResourceDetail.jsx';
import CvBox from './pages/CvBox.jsx';
import Letters from './pages/Letters.jsx';
import LetterDetail from './pages/LetterDetail.jsx';
import Ccnl from './pages/Ccnl.jsx';
import Payroll from './pages/Payroll.jsx';
import Deadlines from './pages/Deadlines.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import Audit from './pages/Audit.jsx';
import Profile from './pages/Profile.jsx';

function Shell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  React.useEffect(() => setOpen(false), [loc.pathname]);
  const writer = canWrite(user);
  const admin = isAdmin(user);
  const dl = useApi('/stats/deadlines?days=30', [loc.pathname]);
  const soon = (dl.data || []).length;
  const L = ({ to, icon, children, count, end }) => (
    <NavLink to={to} end={end}><Icon name={icon} />{children}{count ? <span className="count">{count}</span> : null}</NavLink>
  );
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><img src="/logo-light.svg" alt="Toscana Diagnostica" /><div className="app">Contracts · People</div></div>
        <nav>
          <L to="/" icon="home" end>Dashboard</L>
          <L to="/organigramma" icon="building">Organigramma</L>
          {writer && <L to="/risorse/nuova" icon="plus">Inserimento nuova risorsa</L>}
          <L to="/risorse" icon="users" end>Elenco delle risorse</L>
          <L to="/scadenze" icon="calendar" count={soon}>Calendario delle scadenze</L>
          <div className="group">Scouting</div>
          <L to="/scouting/cv" icon="inbox">CV Box</L>
          {writer && <L to="/scouting/lettere/nuova" icon="mail">Lettere di impegno</L>}
          <L to="/scouting/lettere" icon="list" end>Elenco lettere di impegno</L>
          <div className="group">Dipendenti</div>
          {writer && <L to="/risorse/nuova?kind=DIPENDENTE" icon="plus">Nuovo dipendente</L>}
          <L to="/dipendenti" icon="briefcase">Elenco dipendenti</L>
          <L to="/ccnl" icon="book">CCNL di riferimento</L>
          <L to="/busta-paga" icon="calc">Simulatore busta paga</L>
          <div className="group">Liberi professionisti</div>
          {writer && <L to="/risorse/nuova?kind=LP" icon="plus">Nuovo professionista</L>}
          <L to="/lp" icon="stetho">Elenco LP</L>
          {admin && <>
            <div className="group">Amministrazione</div>
            <L to="/utenti" icon="user">Utenti</L>
            <L to="/impostazioni" icon="gear">Impostazioni e import</L>
            <L to="/audit" icon="shield">Registro attività</L>
          </>}
        </nav>
        <div className="me">
          <div className="name">{user.full_name}</div>
          <div>{ROLE[user.role]}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <NavLink to="/profilo" className="btn sm ghost" style={{ color: 'var(--teal)' }}>Profilo</NavLink>
            <button className="btn sm dark" onClick={logout}>Esci</button>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar"><button onClick={() => setOpen(!open)} aria-label="Menu">☰</button><img src="/logo-light.svg" alt="" /></div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/organigramma" element={<Organigramma />} />
          {writer && <Route path="/risorse/nuova" element={<NewResource />} />}
          <Route path="/risorse" element={<Resources />} />
          <Route path="/risorse/:id" element={<ResourceDetail />} />
          <Route path="/dipendenti" element={<Resources kind="DIPENDENTE" />} />
          <Route path="/lp" element={<Resources kind="LP" />} />
          <Route path="/scadenze" element={<Deadlines />} />
          <Route path="/scouting/cv" element={<CvBox />} />
          {writer && <Route path="/scouting/lettere/nuova" element={<NewResource letterMode />} />}
          <Route path="/scouting/lettere" element={<Letters />} />
          <Route path="/scouting/lettere/:id" element={<LetterDetail />} />
          <Route path="/ccnl" element={<Ccnl />} />
          <Route path="/busta-paga" element={<Payroll />} />
          {admin && <Route path="/utenti" element={<Users />} />}
          {admin && <Route path="/impostazioni" element={<Settings />} />}
          {admin && <Route path="/audit" element={<Audit />} />}
          <Route path="/profilo" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Gate() {
  const { loading, user, onboarding } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  if (onboarding) return <Onboarding />;
  return <Shell />;
}

export default function App() {
  return (
    <ToastProvider>
      <BusyBar />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}
