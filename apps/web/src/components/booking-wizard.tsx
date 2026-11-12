'use client';

import { Alert, Button, Card, CardContent, CardHeader, CardTitle, cn, Field, Input, Select, Textarea } from '@agenda/ui';
import { Check, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';

/**
 * Asistente de reserva (link público y recepción). Solo presenta opciones y
 * envía las elecciones: los horarios y todas las validaciones se calculan en
 * el servidor (directrices, principio 3).
 */

export type WizardService = {
  id: string;
  name: string;
  durationMinutes: number;
  /** null cuando el negocio no muestra precios en el link público. */
  priceLabel: string | null;
  needsPerson: boolean;
  /** Ej. "Día completo" (arriendo). Por defecto: "30 min". */
  durationLabel?: string;
  /** Catálogo (fase 3A): foto principal, resumen de la ficha y enlace a la ficha completa. */
  photoUrl?: string | null;
  summary?: string;
  detailsHref?: string;
};
export type WizardPerson = { id: string; name: string; branchId: string };
export type WizardAddon = { id: string; name: string; priceLabel: string | null };
export type WizardDate = { value: string; weekday: string; day: string; month: string };
export type WizardCustomer = { id: string; full_name: string; phone: string | null; email: string | null };
export type SlotOption = { startsAt: string; label: string };

export type SlotQueryInput = {
  businessId: string;
  branchId: string;
  date: string;
  serviceIds: string[];
  preferredPersonId: string | null;
  addons: Array<{ addonId: string; quantity: number }>;
};

export type BookingInput = SlotQueryInput & {
  startsAt: string;
  customerId?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  notes?: string;
};

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export function BookingWizard({
  mode,
  businessId,
  branches,
  services,
  people,
  addons,
  dates,
  initialDate,
  getSlots,
  book,
  searchCustomers,
  emailRequired = false,
  rental = false,
}: {
  mode: 'public' | 'reception';
  businessId: string;
  branches: Array<{ id: string; name: string; address?: string | null }>;
  services: WizardService[];
  people: WizardPerson[];
  addons: WizardAddon[];
  dates: WizardDate[];
  initialDate?: string;
  getSlots: (q: SlotQueryInput) => Promise<Result<SlotOption[]>>;
  book: (b: BookingInput) => Promise<Result<{ summary: string; title?: string }>>;
  searchCustomers?: (query: string) => Promise<Result<WizardCustomer[]>>;
  /** El negocio confirma por email: el email es obligatorio. */
  emailRequired?: boolean;
  /** Modo arriendo: los servicios son parte del mismo evento y no se elige persona. */
  rental?: boolean;
}) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [personId, setPersonId] = useState('');
  const [date, setDate] = useState(initialDate ?? dates[0]?.value ?? '');
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ summary: string; title?: string } | null>(null);
  const [loadingSlots, startSlots] = useTransition();
  const [booking, startBooking] = useTransition();

  // Cliente
  const [customer, setCustomer] = useState<WizardCustomer | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<WizardCustomer[]>([]);
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', notes: '' });

  const branchPeople = people.filter((p) => p.branchId === branchId);
  const needsPerson = !rental && services.some((s) => serviceIds.includes(s.id) && s.needsPerson);
  const addonList = useMemo(
    () => Object.entries(addonQty).filter(([, q]) => q > 0).map(([addonId, quantity]) => ({ addonId, quantity })),
    [addonQty],
  );

  const queryInput: SlotQueryInput | null =
    serviceIds.length > 0 && branchId && date
      ? { businessId, branchId, date, serviceIds, preferredPersonId: personId || null, addons: addonList }
      : null;
  const queryKey = JSON.stringify(queryInput);

  // Pide horarios al servidor cada vez que cambia la selección
  useEffect(() => {
    setSlot(null);
    if (!queryInput) {
      setSlots(null);
      return;
    }
    startSlots(async () => {
      const res = await getSlots(queryInput);
      if (res.ok) {
        setSlots(res.data);
        setError(null);
      } else {
        setSlots([]);
        setError(res.message);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey resume queryInput
  }, [queryKey]);

  useEffect(() => {
    if (!searchCustomers || query.trim().length < 2) {
      setMatches([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await searchCustomers(query);
      setMatches(res.ok ? res.data : []);
    }, 250);
    return () => clearTimeout(t);
  }, [query, searchCustomers]);

  const toggleService = (id: string) =>
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = () => {
    if (!queryInput || !slot) return;
    setError(null);
    startBooking(async () => {
      const res = await book({
        ...queryInput,
        startsAt: slot.startsAt,
        ...(customer ? { customerId: customer.id } : { fullName: form.fullName, phone: form.phone, email: form.email }),
        notes: form.notes,
      });
      if (res.ok) {
        setDone(res.data);
      } else {
        setError(res.message);
        // El horario pudo ser tomado por otra persona: refrescar opciones
        const fresh = await getSlots(queryInput);
        if (fresh.ok) setSlots(fresh.data);
        setSlot(null);
      }
    });
  };

  const reset = () => {
    setDone(null);
    setServiceIds([]);
    setSlot(null);
    setCustomer(null);
    setQuery('');
    setAddonQty({});
    setForm({ fullName: '', phone: '', email: '', notes: '' });
  };

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="size-6" />
          </div>
          <h2 className="text-xl font-semibold">{done.title ?? (mode === 'public' ? '¡Reserva confirmada!' : 'Reserva creada')}</h2>
          <p className="text-sm text-muted-foreground">{done.summary}</p>
          <Button variant="outline" onClick={reset}>
            {mode === 'public' ? 'Hacer otra reserva' : 'Nueva reserva'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {branches.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sucursal</CardTitle>
          </CardHeader>
          <CardContent>
            <Select aria-label="Sucursal" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.address ? ` — ${b.address}` : ''}
                </option>
              ))}
            </Select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{rental ? '1. ¿Qué quieres arrendar?' : '1. Servicios'}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => {
            const selected = serviceIds.includes(s.id);
            return (
              <div key={s.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleService(s.id)}
                  className={cn(
                    'flex flex-1 items-start justify-between gap-2 rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent/50',
                    selected && 'border-ring bg-accent',
                  )}
                >
                  {s.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- foto pública del catálogo
                    <img src={s.photoUrl} alt="" className="size-16 shrink-0 rounded object-cover" />
                  )}
                  <span className="flex-1">
                    <span className="block font-medium">{s.name}</span>
                    <span className="text-muted-foreground">
                      {[s.durationLabel ?? `${s.durationMinutes} min`, s.priceLabel].filter(Boolean).join(' · ')}
                    </span>
                    {s.summary && <span className="block text-xs text-muted-foreground">{s.summary}</span>}
                  </span>
                  {selected && (
                    <span className="text-xs font-semibold text-accent-foreground">
                      {rental ? <Check className="size-4" /> : serviceIds.indexOf(s.id) + 1}
                    </span>
                  )}
                </button>
                {s.detailsHref && (
                  <a href={s.detailsHref} className="self-start text-xs underline underline-offset-2">
                    Ver ficha de {s.name}
                  </a>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {serviceIds.length > 0 && needsPerson && branchPeople.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. ¿Con quién?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[{ id: '', name: 'Cualquiera' }, ...branchPeople].map((p) => (
              <Button
                key={p.id || 'any'}
                type="button"
                size="sm"
                variant={personId === p.id ? 'default' : 'outline'}
                aria-pressed={personId === p.id}
                onClick={() => setPersonId(p.id)}
              >
                {p.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {serviceIds.length > 0 && addons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adicionales (opcional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {addons.map((a) => {
              const qty = addonQty[a.id] ?? 0;
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {a.name} {a.priceLabel && <span className="text-muted-foreground">· {a.priceLabel}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`Quitar ${a.name}`}
                      disabled={qty === 0}
                      onClick={() => setAddonQty((p) => ({ ...p, [a.id]: Math.max(0, qty - 1) }))}
                    >
                      <Minus />
                    </Button>
                    <span className="w-5 text-center tabular-nums" aria-label={`Cantidad de ${a.name}`}>
                      {qty}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`Agregar ${a.name}`}
                      onClick={() => setAddonQty((p) => ({ ...p, [a.id]: Math.min(20, qty + 1) }))}
                    >
                      <Plus />
                    </Button>
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {serviceIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{rental ? '3. Día y hora del evento' : '3. Día y hora'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Día">
              {dates.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={date === d.value}
                  aria-label={`${d.weekday} ${d.day} ${d.month}`}
                  onClick={() => setDate(d.value)}
                  className={cn(
                    'flex min-w-14 flex-col items-center rounded-md border px-2 py-1.5 text-xs capitalize hover:bg-accent/50',
                    date === d.value && 'border-ring bg-accent font-semibold',
                  )}
                >
                  <span>{d.weekday}</span>
                  <span className="text-lg font-semibold tabular-nums">{d.day}</span>
                  <span>{d.month}</span>
                </button>
              ))}
            </div>
            {loadingSlots ? (
              <p className="text-sm text-muted-foreground">Buscando horarios…</p>
            ) : slots && slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay horarios disponibles este día. Prueba otro.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="group" aria-label="Hora">
                {slots?.map((s) => (
                  <Button
                    key={s.startsAt}
                    type="button"
                    size="sm"
                    variant={slot?.startsAt === s.startsAt ? 'default' : 'outline'}
                    aria-pressed={slot?.startsAt === s.startsAt}
                    onClick={() => setSlot(s)}
                    className="tabular-nums"
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {slot && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. {mode === 'public' ? 'Tus datos' : 'Cliente'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === 'reception' && searchCustomers && (
              <div className="space-y-2">
                {customer ? (
                  <Alert className="flex items-center justify-between gap-2">
                    <span>
                      <strong>{customer.full_name}</strong> · {customer.phone}
                    </span>
                    <Button type="button" size="xs" variant="ghost" onClick={() => setCustomer(null)}>
                      Cambiar
                    </Button>
                  </Alert>
                ) : (
                  <>
                    <Field label="Buscar cliente por teléfono o nombre">
                      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej. 9 1234 5678" />
                    </Field>
                    {matches.length > 0 && (
                      <ul className="divide-y rounded-md border text-sm">
                        {matches.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-accent/50"
                              onClick={() => setCustomer(m)}
                            >
                              {m.full_name} <span className="text-muted-foreground">· {m.phone}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-muted-foreground">¿Cliente nuevo? Completa sus datos:</p>
                  </>
                )}
              </div>
            )}
            {!customer && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    autoComplete="name"
                    required
                  />
                </Field>
                <Field label="Teléfono">
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    autoComplete="tel"
                    placeholder="+56 9 1234 5678"
                    required
                  />
                </Field>
                <Field
                  label={emailRequired ? 'Email' : 'Email (opcional)'}
                  hint={emailRequired ? 'Te enviaremos un botón para confirmar la reserva' : undefined}
                  className="sm:col-span-2"
                >
                  <Input
                    type="email"
                    required={emailRequired}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    autoComplete="email"
                  />
                </Field>
              </div>
            )}
            <Field label="Comentarios (opcional)">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <Button type="button" className="w-full" disabled={booking} onClick={submit}>
              {booking ? 'Reservando…' : `Confirmar reserva · ${slot.label}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
