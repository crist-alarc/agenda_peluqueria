import { customerCanCancel, formatMoney } from '@agenda/core';
import { listMyBookings } from '@agenda/db';
import { Badge, Button, Card, CardContent, EmptyState, PageHeader } from '@agenda/ui';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { formatDateTime } from '@/lib/dates';
import { requireUser } from '@/lib/session';
import { t } from '@/lib/texts';
import { cancelMyBookingAction } from './actions';

export const metadata = { title: 'Mis reservas' };

/** Portal del cliente: sus reservas en todos los negocios (sección 12). */
export default async function MyBookingsPage() {
  const { db, user } = await requireUser();
  const bookings = await listMyBookings(db);
  const now = new Date().toISOString();
  const upcoming = bookings.filter((b) => b.endsAt >= now).reverse();
  const past = bookings.filter((b) => b.endsAt < now);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader
        title="Mis reservas"
        description={`Reservas hechas con ${user.email}, en todos los negocios.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/panel">Mi negocio</Link>
          </Button>
        }
      />
      {bookings.length === 0 ? (
        <EmptyState>Aún no tienes reservas con este email.</EmptyState>
      ) : (
        <div className="space-y-6">
          {[
            { label: 'Próximas', list: upcoming },
            { label: 'Anteriores', list: past },
          ].map(
            (group) =>
              group.list.length > 0 && (
                <section key={group.label} className="space-y-2">
                  <h2 className="text-sm font-semibold text-muted-foreground">{group.label}</h2>
                  {group.list.map((b) => {
                    const cancellable =
                      (b.status === 'confirmed' || b.status === 'pending') && b.startsAt > now;
                    return (
                      <Card key={b.id} role="article" aria-label={`Reserva en ${b.businessName}`}>
                        <CardContent className="space-y-1 p-4 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium">{b.businessName}</span>
                            <Badge variant={b.status === 'cancelled' ? 'muted' : 'secondary'}>{t.bookingStatuses[b.status]}</Badge>
                          </div>
                          <p>{b.services.join(' + ')}</p>
                          <p className="text-muted-foreground">
                            {formatDateTime(b.startsAt, b.timezone)} · {formatMoney(b.total, b.currency)}
                          </p>
                          {cancellable &&
                            (customerCanCancel(b.startsAt, now, b.cancellationHours) ? (
                              <ActionForm action={cancelMyBookingAction} confirm="¿Cancelar esta reserva?" className="pt-2">
                                <input type="hidden" name="bookingId" value={b.id} />
                                <SubmitButton size="sm" variant="outline">
                                  Cancelar reserva
                                </SubmitButton>
                              </ActionForm>
                            ) : (
                              <p className="pt-1 text-xs text-muted-foreground">
                                Para cancelar con menos de {b.cancellationHours} horas, contacta al negocio.
                              </p>
                            ))}
                        </CardContent>
                      </Card>
                    );
                  })}
                </section>
              ),
          )}
        </div>
      )}
    </main>
  );
}
