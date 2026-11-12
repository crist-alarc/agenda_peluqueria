import { SUPPORT_DURATIONS, supportAccessState } from '@agenda/core';
import { listAdminClients, type AdminBusiness } from '@agenda/db';
import { Button, Field, PageHeader, Select, Textarea } from '@agenda/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { SupportAccess } from '@/components/support-access';
import { requirePlatformAdmin } from '@/lib/session';
import { cancelSupportAction, requestSupportAction } from '../../actions';

const date = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(iso));

/** Ficha de un cliente: el dueño, sus negocios y el acceso de soporte a cada uno. */
export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) notFound();
  const { db } = await requirePlatformAdmin();
  const [client] = await listAdminClients(db, clientId);
  if (!client) notFound();
  const now = new Date().toISOString();

  return (
    <>
      <Link href="/admin/clientes" className="text-sm text-muted-foreground hover:underline">
        Todos los clientes
      </Link>
      <PageHeader title={client.owner.name || client.owner.email || client.name} description={`Cliente desde ${date(client.createdAt)}`} />

      <dl className="mb-8 grid max-w-2xl grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{client.owner.email ?? 'Sin email'}</dd>
        <dt className="text-muted-foreground">Teléfono</dt>
        <dd>{client.owner.phone ?? 'Sin teléfono'}</dd>
        <dt className="text-muted-foreground">Organización</dt>
        <dd>{client.name}</dd>
      </dl>

      <h2 className="mb-1 text-lg font-semibold">Negocios</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Para ver la configuración de un negocio necesitas que el dueño, o alguien que él designe, apruebe tu acceso desde su panel.
        Cada vez que la abres queda registrado y el negocio lo puede ver.
      </p>

      <ul className="divide-y border-y">
        {client.businesses.length === 0 && <li className="py-4 text-sm text-muted-foreground">Este cliente aún no crea negocios.</li>}
        {client.businesses.map((b) => (
          <BusinessRow key={b.id} business={b} now={now} />
        ))}
      </ul>
    </>
  );
}

function BusinessRow({ business: b, now }: { business: AdminBusiness; now: string }) {
  const state = supportAccessState(b.support, now);
  return (
    <li className="grid gap-4 py-5 md:grid-cols-[1fr_22rem]">
      <div>
        <h3 className="font-semibold">{b.name}</h3>
        <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Rubro</dt>
          <dd>{b.industry}</dd>
          <dt className="text-muted-foreground">Plan</dt>
          <dd>
            {b.planName ?? 'Sin plan'}
            {b.subscriptionStatus && b.subscriptionStatus !== 'active' && ` (${b.subscriptionStatus})`}
          </dd>
          <dt className="text-muted-foreground">Alta</dt>
          <dd>{date(b.createdAt)}</dd>
          <dt className="text-muted-foreground">Reservas 30 días</dt>
          <dd className="tabular-nums">{b.bookings30d}</dd>
          <dt className="text-muted-foreground">Equipo</dt>
          <dd className="tabular-nums">{b.members} {b.members === 1 ? 'persona' : 'personas'}</dd>
          <dt className="text-muted-foreground">Link público</dt>
          <dd>{b.publicBookingEnabled ? `/r/${b.slug}` : 'Desactivado'}</dd>
        </dl>
      </div>

      <div className="rounded-lg bg-muted/60 p-4" aria-label={`Soporte de ${b.name}`}>
        <SupportAccess request={b.support} now={now} />
        {state === 'active' && b.support && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link href={`/admin/negocios/${b.id}`}>Ver configuración</Link>
            </Button>
            <ActionForm action={cancelSupportAction} confirm="¿Terminar tu acceso a este negocio?">
              <input type="hidden" name="requestId" value={b.support.id} />
              <Button variant="ghost" size="sm">
                Terminar acceso
              </Button>
            </ActionForm>
          </div>
        )}
        {state === 'pending' && b.support && (
          <ActionForm action={cancelSupportAction} className="mt-3">
            <input type="hidden" name="requestId" value={b.support.id} />
            <Button variant="ghost" size="sm">
              Cancelar solicitud
            </Button>
          </ActionForm>
        )}
        {state !== 'active' && state !== 'pending' && (
          <ActionForm action={requestSupportAction} className="mt-3 space-y-3" aria-label={`Pedir acceso a ${b.name}`}>
            <input type="hidden" name="businessId" value={b.id} />
            <Field label="Para qué necesitas el acceso">
              <Textarea name="reason" rows={2} required minLength={5} placeholder="Ej. Revisar por qué no aparecen horarios el sábado" />
            </Field>
            <Field label="Por cuánto tiempo">
              <Select name="hours" defaultValue="24">
                {SUPPORT_DURATIONS.map((d) => (
                  <option key={d.hours} value={d.hours}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton size="sm">Pedir acceso</SubmitButton>
          </ActionForm>
        )}
      </div>
    </li>
  );
}
