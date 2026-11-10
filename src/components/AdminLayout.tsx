import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';

const LINKS = [
  { to: '/admin', label: 'Agenda', end: true },
  { to: '/admin/servicios', label: 'Servicios' },
  { to: '/admin/profesionales', label: 'Profesionales' },
  { to: '/admin/ajustes', label: 'Ajustes' },
];

export default function AdminLayout() {
  const { settings, session } = useApp();
  const navigate = useNavigate();

  async function logout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="admin">
      <header className="topbar">
        <div className="brand">✂️ {settings.name}</div>
        <nav>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          <Link to="/" target="_blank" rel="noreferrer">
            Ver página de reservas
          </Link>
          <span className="muted small">{session?.user.email}</span>
          <button className="btn ghost small" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
