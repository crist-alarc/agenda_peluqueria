import { SUPPORT_DURATIONS, supportAccessState } from '@agenda/core';
import { listSupportRequests, listSupportViews } from '@agenda/db';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, PageHeader, Select } from '@agenda/ui';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { SupportAccess } from '@/components/support-access';
import { requireBusiness } from '@/lib/session';
import { decideSupportAction, revokeSupportAction } from '../support-actions';

export const metadata = { title: 'Soporte' };

const time = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso));

/**
 * Acceso de soporte de la plataforma (ADR 0008). Soporte solo ve la configuración
 * del negocio (nunca reservas ni datos de clientes) y solo con esta aprobación.
 */
export default async function SupportPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business, canApproveSupport } = await requireBusiness(businessId);
  if (!canApproveSupport) notFound();
  const [requests, views] = await Promise.all([listSupportRequests(db, business.id), listSupportViews(db, business.id)]);
  const now = new Date().toISOString();
  const tz = business.timezone;
  const pending = requests.find((r) => r.status === 'pending');
  const active = requests.filter((r) => supportAccessState({ status: r.status, expiresAt: r.expires_at }, now) === 'active');
  const history = requests.filter((r) => r !== pending && !active.includes(r));

  return (
    <>
      <PageHeader
        title="Soporte"
        description="Cuando necesites ayuda, el equipo de soporte de la plataforma te pedirá acceso para revisar tu configuración. Solo verá ajustes, sucursales, recursos, servicios y equipo: nunca tus reservas ni los datos de tus clientes."
      />

      <div className="max-w-3xl space-y-6">
        {pending && (
          <Card className="border-access-pending">
            <CardHeader>
              <CardTitle>{pending.requester_name} pide acceso a tu configuración</CardTitle>
              <CardDescription>
                {pending.requester_email}, {time(pending.created_at, tz)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <blockquote className="border-l-2 pl-3 text-sm">{pending.reason}</blockquote>
              <ActionForm action={decideSupportAction} className="flex flex-wrap items-end gap-2" aria-label="Responder solicitud de soporte">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="requestId" value={pending.id} />
                <Field label="Dar acceso por">
                  <Select name="hours" defaultValue={String(pending.requested_hours)} className="w-36">
                    {[...new Set([pending.requested_hours, ...SUPPORT_DURATIONS.map((d) => d.hours)])]
                      .sort((a, b) => a - b)
                      .map((h) => (
                        <option key={h} value={h}>
                          {SUPPORT_DURATIONS.find((d) => d.hours === h)?.label ?? `${h} horas`}
                        </option>
                      ))}
                  </Select>
                </Field>
                <SubmitButton name="decision" value="approve">
                  Aprobar acceso
                </SubmitButton>
                <SubmitButton name="decision" value="reject" variant="outline">
                  Rechazar
                </SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        )}

        {active.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-wrap items-center gap-3 p-5">
              <div className="flex-1">
                <SupportAccess request={{ status: r.status, expiresAt: r.expires_at }} now={now} />
                <p className="mt-1 text-sm text-muted-foreground">
                  {r.requester_name} puede ver tu configuración hasta {time(r.expires_at!, tz)}. Motivo: {r.reason}
                </p>
              </div>
              <ActionForm action={revokeSupportAction} confirm="¿Quitar el acceso de soporte ahora?">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="requestId" value={r.id} />
                <Button variant="outline" size="sm">
                  Revocar acceso
                </Button>
              </ActionForm>
            </CardContent>
          </Card>
        ))}

        {!pending && active.length === 0 && (
          <EmptyState>No hay solicitudes de soporte. Si pediste ayuda, la solicitud aparecerá aquí para que la apruebes.</EmptyState>
        )}

        {views.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">Cuándo revisó soporte tu configuración</h2>
            <ul className="text-sm">
              {views.map((v) => (
                <li key={v.id} className="border-b py-1.5 tabular-nums">
                  {time(v.viewed_at, tz)}, {requests.find((r) => r.id === v.request_id)?.requester_name ?? 'Soporte'}
                </li>
              ))}
            </ul>
          </section>
        )}

        {history.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">Solicitudes anteriores</h2>
            <ul className="text-sm">
              {history.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 border-b py-1.5">
                  <span className="tabular-nums text-muted-foreground">{time(r.created_at, tz)}</span>
                  <SupportAccess request={{ status: r.status, expiresAt: r.expires_at }} now={now} />
                  <span>{r.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
