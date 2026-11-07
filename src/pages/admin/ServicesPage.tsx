import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../../lib/AppContext';
import { formatDuration, formatPrice } from '../../lib/format';
import { errorMessage, supabase } from '../../lib/supabase';
import type { Service } from '../../types/database';

type Draft = { id?: string; name: string; description: string; duration_minutes: number; price: number; active: boolean };
const EMPTY: Draft = { name: '', description: '', duration_minutes: 30, price: 0, active: true };

export default function ServicesPage() {
  const { settings } = useApp();
  const [services, setServices] = useState<Service[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from('services').select('*').order('name');
    if (error) return setError(errorMessage(error));
    setServices(data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      duration_minutes: draft.duration_minutes,
      price: draft.price,
      active: draft.active,
    };
    const { error } = draft.id
      ? await supabase.from('services').update(payload).eq('id', draft.id)
      : await supabase.from('services').insert(payload);
    if (error) return setError(errorMessage(error));
    setDraft(null);
    setError(null);
    void load();
  }

  async function remove(s: Service) {
    if (!confirm(`¿Eliminar "${s.name}"? Si tiene citas asociadas, mejor desactívalo.`)) return;
    const { error } = await supabase.from('services').delete().eq('id', s.id);
    if (error) {
      return setError(
        error.code === '23503' ? 'Este servicio tiene citas registradas; desactívalo en lugar de eliminarlo.' : errorMessage(error),
      );
    }
    void load();
  }

  return (
    <>
      <div className="page-header">
        <h1>Servicios</h1>
        <button className="btn primary" onClick={() => setDraft({ ...EMPTY })}>
          + Nuevo servicio
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}

      {draft && (
        <form className="card form" onSubmit={(e) => void save(e)}>
          <h2 className="full">{draft.id ? 'Editar servicio' : 'Nuevo servicio'}</h2>
          <label>
            Nombre*
            <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label>
            Duración (minutos)*
            <input
              type="number"
              required
              min={5}
              max={480}
              step={5}
              value={draft.duration_minutes}
              onChange={(e) => setDraft({ ...draft, duration_minutes: Number(e.target.value) })}
            />
          </label>
          <label>
            Precio ({settings.currency})*
            <input
              type="number"
              required
              min={0}
              step="any"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
            />
          </label>
          <label className="inline">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Activo (visible para reservar)
          </label>
          <label className="full">
            Descripción
            <textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <div className="full row">
            <button className="btn primary">Guardar</button>
            <button type="button" className="btn ghost" onClick={() => setDraft(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Servicio</th>
            <th>Duración</th>
            <th>Precio</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className={s.active ? '' : 'inactive'}>
              <td>
                <strong>{s.name}</strong>
                {s.description && <div className="muted small">{s.description}</div>}
              </td>
              <td>{formatDuration(s.duration_minutes)}</td>
              <td>{formatPrice(Number(s.price), settings.currency)}</td>
              <td>{s.active ? 'Activo' : 'Inactivo'}</td>
              <td className="right">
                <button
                  className="btn small ghost"
                  onClick={() =>
                    setDraft({
                      id: s.id,
                      name: s.name,
                      description: s.description ?? '',
                      duration_minutes: s.duration_minutes,
                      price: Number(s.price),
                      active: s.active,
                    })
                  }
                >
                  Editar
                </button>
                <button className="btn small danger" onClick={() => void remove(s)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
          {services.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Aún no hay servicios.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
