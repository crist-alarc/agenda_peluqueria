import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import { errorMessage, supabase } from '../lib/supabase';

export default function LoginPage() {
  const { session, settings } = useApp();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const { data, error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setError(errorMessage(error));
    if (mode === 'signup' && !data.session) {
      setInfo('Cuenta creada. Revisa tu email para confirmarla y luego inicia sesión.');
      setMode('login');
    }
  }

  return (
    <main className="container narrow">
      <div className="card login">
        <h1>✂️ {settings.name}</h1>
        <p className="muted">{mode === 'login' ? 'Acceso del personal' : 'Crear cuenta de personal'}</p>
        <form className="form single" onSubmit={(e) => void submit(e)}>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          {error && <div className="alert error">{error}</div>}
          {info && <div className="alert info">{info}</div>}
          <button className="btn primary" disabled={loading}>
            {loading ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
        <p className="small">
          {mode === 'login' ? (
            <button className="link" onClick={() => setMode('signup')}>
              ¿No tienes cuenta? Regístrate
            </button>
          ) : (
            <button className="link" onClick={() => setMode('login')}>
              Ya tengo cuenta
            </button>
          )}
          {' · '}
          <Link to="/">Volver a reservas</Link>
        </p>
      </div>
    </main>
  );
}
