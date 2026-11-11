import { can, formatMoney, moneyInputHint, moneyInputValue } from '@agenda/core';
import { listServices, type Service } from '@agenda/db';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, EmptyState, Field, Input, PageHeader, Textarea } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { RequirementsEditor } from '@/components/requirements-editor';
import { requireBusiness } from '@/lib/session';
import { t } from '@/lib/texts';
import { deleteServiceAction, saveServiceAction } from '../actions';

export const metadata = { title: 'Servicios' };

export default async function ServicesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business, membership } = await requireBusiness(businessId);
  const services = await listServices(db, business.id);
  const editable = can(membership, 'catalog.manage');

  return (
    <>
      <PageHeader
        title="Servicios"
        description={`Lo que vendes: duración, precio y recursos que requiere. Modo de reserva: ${t.bookingModes[business.booking_mode]}.`}
      />

      {editable && (
        <Card className="mb-6">
          <details>
            <summary className="cursor-pointer list-none p-5">
              <CardTitle>Nuevo servicio</CardTitle>
            </summary>
            <CardContent>
              <ServiceForm businessId={business.id} currency={business.currency} />
            </CardContent>
          </details>
        </Card>
      )}

      {services.length === 0 ? (
        <EmptyState>Aún no hay servicios.</EmptyState>
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <Card key={s.id}>
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-4">
                  <span className="font-medium">{s.name}</span>
                  {!s.active && <Badge variant="muted">Inactivo</Badge>}
                  <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                    {s.duration_minutes} min · {formatMoney(s.price, business.currency)}
                  </span>
                </summary>
                <div className="border-t p-4">
                  {editable ? (
                    <>
                      <ServiceForm businessId={business.id} currency={business.currency} service={s} />
                      <ActionForm action={deleteServiceAction} confirm={`¿Eliminar ${s.name}?`} className="mt-4 border-t pt-4">
                        <input type="hidden" name="businessId" value={business.id} />
                        <input type="hidden" name="serviceId" value={s.id} />
                        <Button variant="ghost" size="sm" className="text-destructive">
                          Eliminar servicio
                        </Button>
                      </ActionForm>
                    </>
                  ) : (
                    <ServiceSummary service={s} />
                  )}
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function ServiceSummary({ service: s }: { service: Service }) {
  return (
    <div className="space-y-1 text-sm">
      {s.description && <p>{s.description}</p>}
      <p className="text-muted-foreground">
        Holgura: {s.buffer_before_minutes} min antes · {s.buffer_after_minutes} min después
      </p>
      <ul>
        {s.service_resource_requirements.map((r) => (
          <li key={r.id}>
            {r.quantity} × {t.resourceTypes[r.resource_type]}
            {r.required_skill && ` (${r.required_skill})`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceForm({ businessId, currency, service }: { businessId: string; currency: string; service?: Service }) {
  return (
    <ActionForm action={saveServiceAction} className="grid gap-4 sm:grid-cols-2" resetOnSuccess={!service}>
      <input type="hidden" name="businessId" value={businessId} />
      {service && <input type="hidden" name="serviceId" value={service.id} />}
      <Field label="Nombre">
        <Input name="name" defaultValue={service?.name} required />
      </Field>
      <Field label={`Precio (${currency})`} hint={moneyInputHint(currency)}>
        <Input name="price" inputMode="numeric" defaultValue={service ? moneyInputValue(service.price, currency) : ''} required />
      </Field>
      <Field label="Duración (minutos)">
        <Input name="durationMinutes" type="number" min={5} step={5} defaultValue={service?.duration_minutes ?? 30} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Holgura antes (min)" hint="Preparación, traslado">
          <Input name="bufferBeforeMinutes" type="number" min={0} defaultValue={service?.buffer_before_minutes ?? 0} />
        </Field>
        <Field label="Holgura después (min)" hint="Limpieza, desmontaje">
          <Input name="bufferAfterMinutes" type="number" min={0} defaultValue={service?.buffer_after_minutes ?? 0} />
        </Field>
      </div>
      <Field label="Descripción" className="sm:col-span-2">
        <Textarea name="description" defaultValue={service?.description ?? ''} rows={2} />
      </Field>
      <div className="sm:col-span-2">
        <h3 className="mb-2 text-sm font-semibold">Recursos que requiere</h3>
        <RequirementsEditor
          name="requirements"
          initial={(service?.service_resource_requirements ?? [{ resource_type: 'person', quantity: 1, required_skill: null }]).map((r) => ({
            resourceType: r.resource_type,
            quantity: r.quantity,
            requiredSkill: r.required_skill ?? '',
          }))}
        />
      </div>
      <div className="sm:col-span-2">
        <Checkbox name="active" label="Activo (disponible para reservar)" defaultChecked={service?.active ?? true} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>{service ? 'Guardar servicio' : 'Crear servicio'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
