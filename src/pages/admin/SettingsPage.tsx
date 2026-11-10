import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useApp } from '../../lib/AppContext';
import { errorMessage, supabase } from '../../lib/supabase';

const CURRENCIES = ['CLP', 'ARS', 'MXN', 'COP', 'PEN', 'UYU', 'USD', 'EUR'];

export default function SettingsPage() {
  const { settings, reloadSettings } = useApp();
  const [form, setForm] = useState(settings);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const timezones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);

  useEffect(() => setForm(settings), [settings]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from('business_settings')
      .update({
        name: form.name.trim(),
        timezone: form.timezone,
        currency: form.currency,
        slot_interval_minutes: form.slot_interval_minutes,
        booking_window_days: form.booking_window_days,
        phone: form.phone?.trim() || null,
        address: form.address?.trim() || null,
      })
      .eq('id', 1);
    if (error) return setStatus({ ok: false, msg: errorMessage(error) });
    await reloadSettings();
    setStatus({ ok: true, msg: 'Ajustes guardados' });
  }

  return (
    <>
      <div className="page-header">
        <h1>Ajustes del negocio</h1>
      </div>
      <form className="card form" onSubmit={(e) => void save(e)}>
        <label>
          Nombre del negocio
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Teléfono
          <input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label className="full">
          Dirección
          <input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </label>
        <label>
          Zona horaria
          <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {timezones.map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </select>
        </label>
        <label>
          Moneda
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {[...new Set([form.currency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Intervalo entre horas ofrecidas (min)
          <select
            value={form.slot_interval_minutes}
            onChange={(e) => setForm({ ...form, slot_interval_minutes: Number(e.target.value) })}
          >
            {[5, 10, 15, 20, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reservas con hasta (días de anticipación)
          <input
            type="number"
            min={1}
            max={365}
            value={form.booking_window_days}
            onChange={(e) => setForm({ ...form, booking_window_days: Number(e.target.value) })}
          />
        </label>
        <div className="full row">
          <button className="btn primary">Guardar</button>
          {status && <span className={status.ok ? 'ok' : 'error-text'}>{status.msg}</span>}
        </div>
      </form>
    </>
  );
}
