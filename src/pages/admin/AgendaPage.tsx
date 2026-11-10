import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../lib/AppContext';
import { addDays, formatDayLong, formatTime, todayInTimeZone } from '../../lib/dates';
import { formatPrice, STATUS_LABELS } from '../../lib/format';
import { errorMessage, supabase } from '../../lib/supabase';
import type { AgendaItem, AppointmentStatus } from '../../types/database';

export default function AgendaPage() {
  const { settings } = useApp();
  const tz = settings.timezone;
  const [date, setDate] = useState(() => todayInTimeZone(tz));
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState('all');
  const [showCancelled, setShowCancelled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_agenda', { p_date: date });
    setLoading(false);
    if (error) return setError(errorMessage(error));
    setError(null);
    setItems(data ?? []);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  // Actualización en vivo cuando entra una nueva reserva
  useEffect(() => {
    const channel = supabase
      .channel('appointments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  async function setStatus(id: string, status: AppointmentStatus) {
    if (status === 'cancelled' && !confirm('¿Cancelar esta cita? El horario quedará libre.')) return;
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
    if (error) return setError(errorMessage(error));
    void load();
  }

  const staffNames = useMemo(
    () => [...new Map(items.map((i) => [i.staff_id, i.staff_name])).entries()],
    [items],
  );
  const visible = items.filter(
    (i) => (staffFilter === 'all' || i.staff_id === staffFilter) && (showCancelled || i.status !== 'cancelled'),
  );
  const active = items.filter((i) => i.status !== 'cancelled');
  const revenue = items.filter((i) => i.status === 'completed').reduce((sum, i) => sum + Number(i.price), 0);

  return (
    <>
      <div className="page-header">
        <h1>Agenda</h1>
        <Link className="btn primary" to="/" target="_blank">
          + Nueva cita
        </Link>
      </div>

      <div className="toolbar">
        <button className="btn ghost" onClick={() => setDate(addDays(date, -1))}>
          ←
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn ghost" onClick={() => setDate(addDays(date, 1))}>
          →
        </button>
        <button className="btn ghost" onClick={() => setDate(todayInTimeZone(tz))}>
          Hoy
        </button>
        <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
          <option value="all">Todos los profesionales</option>
          {staffNames.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <label className="inline">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          Mostrar canceladas
        </label>
      </div>

      <p className="capitalize muted">{formatDayLong(date)}</p>

      <div className="stats">
        <div className="stat">
          <strong>{active.length}</strong>
          <span>citas</span>
        </div>
        <div className="stat">
          <strong>{items.filter((i) => i.status === 'completed').length}</strong>
          <span>completadas</span>
        </div>
        <div className="stat">
          <strong>{formatPrice(revenue, settings.currency)}</strong>
          <span>facturado</span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : visible.length === 0 ? (
        <div className="card muted">No hay citas para este día.</div>
      ) : (
        <div className="appointments">
          {visible.map((a) => (
            <article key={a.id} className={`appointment status-${a.status}`}>
              <div className="time">
                <strong>{formatTime(a.starts_at, tz)}</strong>
                <span className="muted small">{formatTime(a.ends_at, tz)}</span>
              </div>
              <div className="details">
                <div>
                  <strong>{a.customer_name}</strong> · {a.service_name}
                </div>
                <div className="muted small">
                  {a.staff_name} · <a href={`tel:${a.customer_phone}`}>{a.customer_phone}</a>
                  {a.customer_email && (
                    <>
                      {' · '}
                      <a href={`mailto:${a.customer_email}`}>{a.customer_email}</a>
                    </>
                  )}
                </div>
                {a.notes && <div className="small notes">“{a.notes}”</div>}
              </div>
              <div className="actions">
                <span className={`badge ${a.status}`}>{STATUS_LABELS[a.status]}</span>
                {a.status === 'confirmed' && (
                  <>
                    <button className="btn small" onClick={() => void setStatus(a.id, 'completed')}>
                      Completar
                    </button>
                    <button className="btn small ghost" onClick={() => void setStatus(a.id, 'no_show')}>
                      No asistió
                    </button>
                    <button className="btn small danger" onClick={() => void setStatus(a.id, 'cancelled')}>
                      Cancelar
                    </button>
                  </>
                )}
                {a.status !== 'confirmed' && a.status !== 'cancelled' && (
                  <button className="btn small ghost" onClick={() => void setStatus(a.id, 'confirmed')}>
                    Deshacer
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
