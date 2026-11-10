import { addDays, can, dayRange, formatClp, isIsoDate, localDate, localTime, nextStatuses } from '@agenda/core';
import { listAddons, listAgenda, listBranches, listResources, listServices, type AgendaBooking } from '@agenda/db';
import { Badge, Button, Card, CardContent, EmptyState, Input, PageHeader, Select } from '@agenda/ui';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { BookingWizard } from '@/components/booking-wizard';
import { formatLongDate, wizardDates } from '@/lib/dates';
import { requirePermission } from '@/lib/session';
import { t } from '@/lib/texts';
import { bookReception, getReceptionSlots, searchCustomersAction, setStatusAction } from './actions';

export const metadata = { title: 'Agenda' };

export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ fecha?: string; sucursal?: string; nueva?: string }>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const { db, business, membership } = await requirePermission(businessId, 'bookings.view');
  const tz = business.timezone;
  const today = localDate(new Date().toISOString(), tz);
  const date = sp.fecha && isIsoDate(sp.fecha) ? sp.fecha : today;

  const branches = await listBranches(db, business.id);
  const branch = branches.find((b) => b.id === sp.sucursal) ?? branches[0];
  if (!branch) return <EmptyState>Primero crea una sucursal.</EmptyState>;

  const range = dayRange(date, tz);
  const [bookings, resources] = await Promise.all([
    listAgenda(db, { branchId: branch.id, ...range }),
    listResources(db, business.id),
  ]);
  const dayBookings = bookings.filter((b) => localDate(b.starts_at, tz) === date);
  const branchResources = resources.filter((r) => r.branch_id === branch.id && r.active);
  const people = branchResources.filter((r) => r.type === 'person');
  const manage = can(membership, 'bookings.manage');
  const base = `/panel/${business.id}/agenda`;
  const qs = (d: string, extra = '') => `${base}?fecha=${d}&sucursal=${branch.id}${extra}`;

  // Columnas: cada persona (o recurso) con sus reservas del día
  const columns = (people.length > 0 ? people : branchResources).map((r) => ({
    resource: r,
    bookings: dayBookings.filter((b) => b.allocations.some((a) => a.resource_id === r.id)),
  }));
  const unassigned = dayBookings.filter((b) => !columns.some((c) => c.bookings.includes(b)));
  const active = dayBookings.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show');

  let wizard = null;
  if (manage && sp.nueva) {
    const [services, addons] = await Promise.all([listServices(db, business.id), listAddons(db, business.id)]);
    wizard = (
      <Card className="mb-6">
        <CardContent className="pt-5">
          <BookingWizard
            mode="reception"
            businessId={business.id}
            branches={[{ id: branch.id, name: branch.name }]}
            services={services
              .filter((s) => s.active)
              .map((s) => ({
                id: s.id,
                name: s.name,
                durationMinutes: s.duration_minutes,
                priceLabel: formatClp(s.price_clp),
                needsPerson: s.service_resource_requirements.some((q) => q.resource_type === 'person'),
              }))}
            people={people.map((p) => ({ id: p.id, name: p.name, branchId: p.branch_id }))}
            addons={addons.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name, priceLabel: formatClp(a.price_clp) }))}
            dates={wizardDates(tz, 30)}
            initialDate={date >= today ? date : today}
            getSlots={getReceptionSlots}
            book={bookReception}
            searchCustomers={searchCustomersAction.bind(null, business.id)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Agenda"
        description={`${formatLongDate(date)} · ${active.length} ${active.length === 1 ? 'reserva' : 'reservas'}`}
        actions={
          manage && (
            <Button asChild>
              <Link href={sp.nueva ? qs(date) : qs(date, '&nueva=1')}>{sp.nueva ? 'Cerrar' : 'Nueva reserva'}</Link>
            </Button>
          )
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2" action={base}>
        <Button asChild variant="outline" size="sm">
          <Link href={qs(addDays(date, -1))} aria-label="Día anterior">
            ←
          </Link>
        </Button>
        <Input type="date" name="fecha" defaultValue={date} className="h-9 w-40" aria-label="Fecha" />
        <Button asChild variant="outline" size="sm">
          <Link href={qs(addDays(date, 1))} aria-label="Día siguiente">
            →
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={qs(today)}>Hoy</Link>
        </Button>
        {branches.length > 1 ? (
          <Select name="sucursal" defaultValue={branch.id} className="h-9 w-48" aria-label="Sucursal">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        ) : (
          <input type="hidden" name="sucursal" value={branch.id} />
        )}
        <Button type="submit" variant="outline" size="sm">
          Ver
        </Button>
      </form>

      {wizard}

      {dayBookings.length === 0 ? (
        <EmptyState>No hay reservas para este día.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
          {columns.map(({ resource, bookings: list }) => (
            <section key={resource.id} aria-label={`Agenda de ${resource.name}`}>
              <h2 className="mb-2 text-sm font-semibold">{resource.name}</h2>
              <div className="space-y-2">
                {list.length === 0 && <p className="text-sm text-muted-foreground">Sin reservas</p>}
                {list.map((b) => (
                  <BookingCard key={b.id} booking={b} tz={tz} businessId={business.id} manage={manage} />
                ))}
              </div>
            </section>
          ))}
          {unassigned.length > 0 && (
            <section aria-label="Otras reservas">
              <h2 className="mb-2 text-sm font-semibold">Otros recursos</h2>
              <div className="space-y-2">
                {unassigned.map((b) => (
                  <BookingCard key={b.id} booking={b} tz={tz} businessId={business.id} manage={manage} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

const STATUS_VARIANT = {
  pending: 'outline',
  confirmed: 'secondary',
  checked_in: 'default',
  in_progress: 'default',
  completed: 'success',
  cancelled: 'muted',
  no_show: 'muted',
} as const;

function BookingCard({ booking: b, tz, businessId, manage }: { booking: AgendaBooking; tz: string; businessId: string; manage: boolean }) {
  const inactive = b.status === 'cancelled' || b.status === 'no_show';
  return (
    <Card
      role="article"
      aria-label={`Reserva de ${b.customer?.full_name ?? 'cliente'}, ${localTime(b.starts_at, tz)}`}
      className={inactive ? 'opacity-60' : undefined}
    >
      <CardContent className="space-y-2 p-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold tabular-nums">
            {localTime(b.starts_at, tz)}–{localTime(b.ends_at, tz)}
          </span>
          <Badge variant={STATUS_VARIANT[b.status]}>{t.bookingStatuses[b.status]}</Badge>
        </div>
        <div>
          <p className="font-medium">{b.customer?.full_name}</p>
          {b.customer?.phone && (
            <a href={`tel:${b.customer.phone}`} className="text-muted-foreground hover:underline">
              {b.customer.phone}
            </a>
          )}
        </div>
        <p className="text-muted-foreground">
          {b.booking_items.map((i) => i.service_name).join(' + ')}
          {b.booking_addons.length > 0 && ` · ${b.booking_addons.map((a) => `${a.quantity}× ${a.addon_name}`).join(', ')}`}
        </p>
        <p className="flex justify-between text-xs text-muted-foreground">
          <span>{t.bookingChannels[b.channel]}</span>
          <span className="tabular-nums">{formatClp(b.total_clp)}</span>
        </p>
        {b.notes && <p className="rounded bg-muted px-2 py-1 text-xs">{b.notes}</p>}
        {manage && nextStatuses(b.status).length > 0 && (
          <div className="flex flex-wrap gap-1 border-t pt-2">
            {nextStatuses(b.status).map((to) => (
              <ActionForm
                key={to}
                action={setStatusAction}
                confirm={to === 'cancelled' ? '¿Cancelar esta reserva? El horario quedará libre.' : undefined}
              >
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="bookingId" value={b.id} />
                <input type="hidden" name="from" value={b.status} />
                <input type="hidden" name="to" value={to} />
                <SubmitButton size="xs" variant={to === 'cancelled' || to === 'no_show' ? 'ghost' : 'outline'}>
                  {t.bookingStatusActions[to]}
                </SubmitButton>
              </ActionForm>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
