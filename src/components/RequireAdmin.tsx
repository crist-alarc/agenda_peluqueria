import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, isAdmin, authLoading } = useApp();
  const location = useLocation();

  if (authLoading) return <div className="container muted">Cargando…</div>;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isAdmin) {
    return (
      <main className="container narrow">
        <div className="card">
          <h1>Sin acceso</h1>
          <p>
            Tu usuario (<strong>{session.user.email}</strong>) no es administrador. Pide a un administrador que agregue
            tu ID a la tabla <code>admins</code>:
          </p>
          <pre>insert into public.admins (user_id) values ('{session.user.id}');</pre>
          <div className="row">
            <button className="btn" onClick={() => void supabase.auth.signOut()}>
              Cerrar sesión
            </button>
            <Link className="btn ghost" to="/">
              Ir a reservas
            </Link>
          </div>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
