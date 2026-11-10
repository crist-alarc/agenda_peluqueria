import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import { dateRange, formatDayLong, formatDayShort, formatTime, todayInTimeZone } from '../lib/dates';
import { formatDuration, formatPrice } from '../lib/format';
import { errorMessage, supabase } from '../lib/supabase';
import type { Service, Slot, Staff } from '../types/database';

const ANY_STAFF = 'any';
const DAYS_SHOWN = 14;

type Confirmation = { service: Service; staff: Staff; startsAt: string; name: string };

export default function BookingPage() {
  const { settings } = useApp();
  const tz = settings.timezone;

  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffServices, setStaffServices] = useState<{ staff_id: string; service_id: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffChoice, setStaffChoice] = useState<string>(ANY_STAFF);
  const [date, setDate] = useState<string>(() => todayInTimeZone(tz));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // Catálogo
  useEffect(() => {
    void (async () => {
      const [sv, st, ss] = await Promise.all([
        supabase.from('services').select('*').eq('active', true).order('name'),
        supabase.from('staff').select('*').eq('active', true).order('name'),
        supabase.from('staff_services').select('staff_id, service_id'),
      ]);
      const err = sv.error ?? st.error ?? ss.error;
      if (err) return setLoadError(errorMessage(err));
      setServices(sv.data ?? []);
      setStaff(st.data ?? []);
      setStaffServices(ss.data ?? []);
    })();
  }, []);

  // Si cambia la zona horaria (al cargar ajustes) reiniciamos la fecha
  useEffect(() => setDate(todayInTimeZone(tz)), [tz]);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const staffForService = useMemo(
    () => staff.filter((p) => staffServices.some((x) => x.staff_id === p.id && x.service_id === serviceId)),
    [staff, staffServices, serviceId],
  );
  const days = useMemo(
    () => dateRange(todayInTimeZone(tz), Math.min(DAYS_SHOWN, settings.booking_window_days)),
    [tz, settings.booking_window_days],
  );

  // Huecos disponibles
  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedSlot(null);
    void supabase
      .rpc('get_available_slots', {
        p_service_id: serviceId,
        p_date: date,
        p_staff_id: staffChoice === ANY_STAFF ? null : staffChoice,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setSlotsLoading(false);
        if (error) {
          setSlots([]);
          setSubmitError(errorMessage(error));
          return;
        }
        setSlots(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, staffChoice, date, refreshKey]);

  // Con "cualquier profesional" mostramos cada hora una sola vez
  const visibleSlots = useMemo(() => {
    const seen = new Set<string>();
    return slots.filter((s) => (seen.has(s.slot_start) ? false : (seen.add(s.slot_start), true)));
  }, [slots]);

  function chooseService(id: string) {
    setServiceId(id);
    setStaffChoice(ANY_STAFF);
    setSubmitError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!service || !selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase.rpc('book_appointment', {
      p_service_id: service.id,
      p_staff_id: selectedSlot.staff_id,
      p_starts_at: selectedSlot.slot_start,
      p_customer_name: form.name,
      p_customer_phone: form.phone,
      p_customer_email: form.email || null,
      p_notes: form.notes || null,
    });
    setSubmitting(false);
    if (error) {
      setSubmitError(errorMessage(error));
      // Refrescamos la disponibilidad por si alguien tomó el horario
      setRefreshKey((k) => k + 1);
      return;
    }
    const chosenStaff = staff.find((p) => p.id === selectedSlot.staff_id)!;
    setConfirmation({ service, staff: chosenStaff, startsAt: selectedSlot.slot_start, name: form.name });
  }

  function reset() {
    setConfirmation(null);
    setServiceId(null);
    setSelectedSlot(null);
    setForm({ name: '', phone: '', email: '', notes: '' });
  }

  if (confirmation) {
    const localDate = todayInTimeZone(tz, new Date(confirmation.startsAt));
    return (
      <PublicShell>
        <div className="card success">
          <div className="big-icon">✅</div>
          <h2>¡Reserva confirmada, {confirmation.name.split(' ')[0]}!</h2>
          <p>
            <strong>{confirmation.service.name}</strong> con <strong>{confirmation.staff.name}</strong>
          </p>
          <p className="capitalize">
            {formatDayLong(localDate)} a las {formatTime(confirmation.startsAt, tz)}
          </p>
          {settings.address && <p className="muted">📍 {settings.address}</p>}
          {settings.phone && <p className="muted">Si necesitas cambiar tu cita, llámanos al {settings.phone}.</p>}
          <button className="btn" onClick={reset}>
            Hacer otra reserva
          </button>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      {loadError && <div className="alert error">{loadError}</div>}

      <section className="card">
        <h2>
          <span className="step">1</span> Elige un servicio
        </h2>
        {services.length === 0 && !loadError && <p className="muted">No hay servicios disponibles.</p>}
        <div className="grid services">
          {services.map((s) => (
            <button
              key={s.id}
              className={`option ${s.id === serviceId ? 'selected' : ''}`}
              onClick={() => chooseService(s.id)}
            >
              <span className="option-title">{s.name}</span>
              {s.description && <span className="muted small">{s.description}</span>}
              <span className="option-meta">
                {formatDuration(s.duration_minutes)} · {formatPrice(s.price, settings.currency)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {service && (
        <section className="card">
          <h2>
            <span className="step">2</span> Elige profesional
          </h2>
          <div className="chips">
            <button
              className={`chip ${staffChoice === ANY_STAFF ? 'selected' : ''}`}
              onClick={() => setStaffChoice(ANY_STAFF)}
            >
              Cualquiera
            </button>
            {staffForService.map((p) => (
              <button
                key={p.id}
                className={`chip ${staffChoice === p.id ? 'selected' : ''}`}
                onClick={() => setStaffChoice(p.id)}
              >
                {p.name}
                {p.role && <span className="muted small"> · {p.role}</span>}
              </button>
            ))}
          </div>
          {staffForService.length === 0 && <p className="muted">Nadie realiza este servicio por ahora.</p>}
        </section>
      )}

      {service && staffForService.length > 0 && (
        <section className="card">
          <h2>
            <span className="step">3</span> Elige día y hora
          </h2>
          <div className="days">
            {days.map((d) => {
              const f = formatDayShort(d);
              return (
                <button key={d} className={`day ${d === date ? 'selected' : ''}`} onClick={() => setDate(d)}>
                  <span className="small">{f.weekday}</span>
                  <strong>{f.day}</strong>
                  <span className="small">{f.month}</span>
                </button>
              );
            })}
          </div>
          <p className="muted capitalize">{formatDayLong(date)}</p>
          {slotsLoading ? (
            <p className="muted">Buscando horarios…</p>
          ) : visibleSlots.length === 0 ? (
            <p className="muted">No hay horarios disponibles este día. Prueba con otra fecha.</p>
          ) : (
            <div className="slots">
              {visibleSlots.map((s) => (
                <button
                  key={s.slot_start}
                  className={`slot ${selectedSlot?.slot_start === s.slot_start ? 'selected' : ''}`}
                  onClick={() => setSelectedSlot(s)}
                >
                  {formatTime(s.slot_start, tz)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {service && selectedSlot && (
        <section className="card">
          <h2>
            <span className="step">4</span> Tus datos
          </h2>
          <p className="summary">
            {service.name} · {staff.find((p) => p.id === selectedSlot.staff_id)?.name} ·{' '}
            <span className="capitalize">{formatDayLong(date)}</span> · {formatTime(selectedSlot.slot_start, tz)}
          </p>
          <form className="form" onSubmit={(e) => void submit(e)}>
            <label>
              Nombre*
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoComplete="name"
              />
            </label>
            <label>
              Teléfono*
              <input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                autoComplete="tel"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="email"
              />
            </label>
            <label className="full">
              Comentarios
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <div className="full">
              <button className="btn primary" disabled={submitting}>
                {submitting ? 'Reservando…' : 'Confirmar reserva'}
              </button>
            </div>
          </form>
        </section>
      )}

      {submitError && <div className="alert error">{submitError}</div>}
    </PublicShell>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  const { settings } = useApp();
  return (
    <div className="public">
      <header className="hero">
        <h1>✂️ {settings.name}</h1>
        <p>Reserva tu hora en menos de un minuto</p>
      </header>
      <main className="container narrow">{children}</main>
      <footer className="footer">
        <Link to="/login">Acceso del personal</Link>
      </footer>
    </div>
  );
}
