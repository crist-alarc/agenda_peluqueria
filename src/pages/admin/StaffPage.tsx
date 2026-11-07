import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../../lib/AppContext';
import { formatDayLong, formatTime, todayInTimeZone, trimSeconds, WEEKDAYS, zonedLocalToUtcIso } from '../../lib/dates';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Service, Staff, TimeOff, WorkingHours } from '../../types/database';

// Lunes primero
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('staff').select('*').order('name');
    if (error) return setError(errorMessage(error));
    setStaff(data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { data, error } = await supabase.from('staff').insert({ name: newName.trim() }).select().single();
    if (error) return setError(errorMessage(error));
    setNewName('');
    await load();
    setSelectedId(data.id);
  }

  const selected = staff.find((s) => s.id === selectedId) ?? null;

  return (
    <>
      <div className="page-header">
        <h1>Profesionales</h1>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="split">
        <aside className="card list">
          <form className="row" onSubmit={(e) => void create(e)}>
            <input placeholder="Nombre del profesional" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn primary">Añadir</button>
          </form>
          <ul>
            {staff.map((s) => (
              <li key={s.id}>
                <button className={`list-item ${s.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(s.id)}>
                  <strong>{s.name}</strong>
                  <span className="muted small">
                    {s.role ?? 'Sin rol'}
                    {!s.active && ' · inactivo'}
                  </span>
                </button>
              </li>
            ))}
            {staff.length === 0 && <li className="muted small">Aún no hay profesionales.</li>}
          </ul>
        </aside>

        <section>
          {selected ? (
            <StaffEditor
              key={selected.id}
              member={selected}
              onChanged={() => void load()}
              onDeleted={() => {
                setSelectedId(null);
                void load();
              }}
              onError={setError}
            />
          ) : (
            <div className="card muted">Selecciona un profesional para editar sus datos, servicios y horario.</div>
          )}
        </section>
      </div>
    </>
  );
}

function StaffEditor({
  member,
  onChanged,
  onDeleted,
  onError,
}: {
  member: Staff;
  onChanged: () => void;
  onDeleted: () => void;
  onError: (msg: string | null) => void;
}) {
  const { settings } = useApp();
  const tz = settings.timezone;
  const [info, setInfo] = useState({ name: member.name, role: member.role ?? '', active: member.active });
  const [services, setServices] = useState<Service[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [hours, setHours] = useState<WorkingHours[]>([]);
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [newBlock, setNewBlock] = useState(() => {
    const today = todayInTimeZone(tz);
    return { from: `${today}T13:00`, to: `${today}T14:00`, reason: '' };
  });
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [sv, ss, wh, to] = await Promise.all([
      supabase.from('services').select('*').order('name'),
      supabase.from('staff_services').select('service_id').eq('staff_id', member.id),
      supabase.from('working_hours').select('*').eq('staff_id', member.id).order('start_time'),
      supabase
        .from('time_off')
        .select('*')
        .eq('staff_id', member.id)
        .gte('ends_at', new Date().toISOString())
        .order('starts_at'),
    ]);
    const err = sv.error ?? ss.error ?? wh.error ?? to.error;
    if (err) return onError(errorMessage(err));
    setServices(sv.data ?? []);
    setAssigned(new Set((ss.data ?? []).map((x) => x.service_id)));
    setHours(wh.data ?? []);
    setTimeOff(to.data ?? []);
  }, [member.id, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(op: PromiseLike<{ error: unknown }>) {
    const { error } = await op;
    if (error) {
      onError(errorMessage(error));
      return false;
    }
    onError(null);
    return true;
  }

  async function saveInfo(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      supabase
        .from('staff')
        .update({ name: info.name.trim(), role: info.role.trim() || null, active: info.active })
        .eq('id', member.id),
    );
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onChanged();
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar a ${member.name}? Si tiene citas, mejor márcalo como inactivo.`)) return;
    const { error } = await supabase.from('staff').delete().eq('id', member.id);
    if (error) {
      return onError(
        error.code === '23503' ? 'Este profesional tiene citas registradas; márcalo como inactivo.' : errorMessage(error),
      );
    }
    onDeleted();
  }

  async function toggleService(serviceId: string, on: boolean) {
    const ok = await run(
      on
        ? supabase.from('staff_services').insert({ staff_id: member.id, service_id: serviceId })
        : supabase.from('staff_services').delete().eq('staff_id', member.id).eq('service_id', serviceId),
    );
    if (ok) void load();
  }

  async function addHours(weekday: number) {
    const sameDay = hours.filter((h) => h.weekday === weekday);
    const last = sameDay[sameDay.length - 1];
    const start = last ? trimSeconds(last.end_time) : '10:00';
    const [h = 10] = start.split(':').map(Number);
    const end = `${String(Math.min(h + 4, 23)).padStart(2, '0')}:00`;
    if (end <= start) return onError('No queda espacio en el día para otro tramo.');
    if (await run(supabase.from('working_hours').insert({ staff_id: member.id, weekday, start_time: start, end_time: end })))
      void load();
  }

  async function updateHours(id: string, field: 'start_time' | 'end_time', value: string) {
    setHours((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
    const row = hours.find((h) => h.id === id);
    if (!row) return;
    const next = { ...row, [field]: value };
    if (trimSeconds(next.end_time) <= trimSeconds(next.start_time)) {
      return onError('La hora de término debe ser posterior a la de inicio.');
    }
    await run(
      supabase.from('working_hours').update({ start_time: next.start_time, end_time: next.end_time }).eq('id', id),
    );
  }

  async function removeHours(id: string) {
    if (await run(supabase.from('working_hours').delete().eq('id', id))) void load();
  }

  async function copyMondayToWeekdays() {
    const monday = hours.filter((h) => h.weekday === 1);
    if (monday.length === 0) return onError('Primero define el horario del lunes.');
    if (!confirm('¿Reemplazar el horario de martes a sábado por el del lunes?')) return;
    const ok =
      (await run(supabase.from('working_hours').delete().eq('staff_id', member.id).in('weekday', [2, 3, 4, 5, 6]))) &&
      (await run(
        supabase.from('working_hours').insert(
          [2, 3, 4, 5, 6].flatMap((weekday) =>
            monday.map((h) => ({ staff_id: member.id, weekday, start_time: h.start_time, end_time: h.end_time })),
          ),
        ),
      ));
    if (ok) void load();
  }

  async function addTimeOff(e: FormEvent) {
    e.preventDefault();
    const starts_at = zonedLocalToUtcIso(newBlock.from, tz);
    const ends_at = zonedLocalToUtcIso(newBlock.to, tz);
    if (ends_at <= starts_at) return onError('El bloqueo debe terminar después de empezar.');
    const ok = await run(
      supabase.from('time_off').insert({ staff_id: member.id, starts_at, ends_at, reason: newBlock.reason.trim() || null }),
    );
    if (ok) {
      setNewBlock({ ...newBlock, reason: '' });
      void load();
    }
  }

  async function removeTimeOff(id: string) {
    if (await run(supabase.from('time_off').delete().eq('id', id))) void load();
  }

  return (
    <div className="stack">
      <form className="card form" onSubmit={(e) => void saveInfo(e)}>
        <h2 className="full">Datos</h2>
        <label>
          Nombre
          <input required value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
        </label>
        <label>
          Rol
          <input placeholder="Barbero, Estilista…" value={info.role} onChange={(e) => setInfo({ ...info, role: e.target.value })} />
        </label>
        <label className="inline">
          <input type="checkbox" checked={info.active} onChange={(e) => setInfo({ ...info, active: e.target.checked })} />
          Activo (acepta reservas)
        </label>
        <div className="full row">
          <button className="btn primary">{saved ? 'Guardado ✓' : 'Guardar'}</button>
          <button type="button" className="btn danger" onClick={() => void remove()}>
            Eliminar
          </button>
        </div>
      </form>

      <div className="card">
        <h2>Servicios que realiza</h2>
        <div className="checks">
          {services.map((s) => (
            <label key={s.id} className="inline">
              <input type="checkbox" checked={assigned.has(s.id)} onChange={(e) => void toggleService(s.id, e.target.checked)} />
              {s.name}
              {!s.active && <span className="muted small"> (inactivo)</span>}
            </label>
          ))}
          {services.length === 0 && <p className="muted">Primero crea servicios.</p>}
        </div>
      </div>

      <div className="card">
        <div className="page-header">
          <h2>Horario semanal</h2>
          <button className="btn small ghost" onClick={() => void copyMondayToWeekdays()}>
            Copiar lunes a mar–sáb
          </button>
        </div>
        <div className="week">
          {WEEK_ORDER.map((weekday) => {
            const ranges = hours.filter((h) => h.weekday === weekday);
            return (
              <div key={weekday} className="weekday">
                <strong>{WEEKDAYS[weekday]}</strong>
                <div className="ranges">
                  {ranges.length === 0 && <span className="muted small">Cerrado</span>}
                  {ranges.map((h) => (
                    <div key={h.id} className="range">
                      <input
                        type="time"
                        value={trimSeconds(h.start_time)}
                        onChange={(e) => void updateHours(h.id, 'start_time', e.target.value)}
                      />
                      –
                      <input
                        type="time"
                        value={trimSeconds(h.end_time)}
                        onChange={(e) => void updateHours(h.id, 'end_time', e.target.value)}
                      />
                      <button className="btn small ghost" title="Quitar tramo" onClick={() => void removeHours(h.id)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button className="btn small ghost" onClick={() => void addHours(weekday)}>
                  + tramo
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>Bloqueos y ausencias</h2>
        <p className="muted small">Vacaciones, almuerzo, trámites… En esos rangos no se ofrecerán horas.</p>
        <form className="row wrap" onSubmit={(e) => void addTimeOff(e)}>
          <input
            type="datetime-local"
            required
            value={newBlock.from}
            onChange={(e) => setNewBlock({ ...newBlock, from: e.target.value })}
          />
          <input
            type="datetime-local"
            required
            value={newBlock.to}
            onChange={(e) => setNewBlock({ ...newBlock, to: e.target.value })}
          />
          <input placeholder="Motivo (opcional)" value={newBlock.reason} onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })} />
          <button className="btn primary">Añadir bloqueo</button>
        </form>
        <ul className="blocks">
          {timeOff.map((t) => (
            <li key={t.id}>
              <span className="capitalize">
                {formatDayLong(todayInTimeZone(tz, new Date(t.starts_at)))} {formatTime(t.starts_at, tz)}
              </span>{' '}
              → {formatDayLong(todayInTimeZone(tz, new Date(t.ends_at)))} {formatTime(t.ends_at, tz)}
              {t.reason && <span className="muted"> · {t.reason}</span>}
              <button className="btn small ghost" onClick={() => void removeTimeOff(t.id)}>
                Quitar
              </button>
            </li>
          ))}
          {timeOff.length === 0 && <li className="muted small">Sin bloqueos próximos.</li>}
        </ul>
      </div>
    </div>
  );
}
