import { can, describeServiceDetails, formatMoney, MAX_SERVICE_PHOTOS, moneyInputHint, moneyInputValue, type ServiceField } from '@agenda/core';
import { catalogPhotoUrl, getServiceFields, listServices, type Service } from '@agenda/db';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, EmptyState, Field, Input, PageHeader, Textarea } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { RequirementsEditor } from '@/components/requirements-editor';
import { requireBusiness } from '@/lib/session';
import { t } from '@/lib/texts';
import { deleteServiceAction, saveServiceAction } from '../actions';
import { deleteServicePhotoAction, uploadServicePhotoAction } from '../rental-actions';

export const metadata = { title: 'Servicios' };

export default async function ServicesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business, membership } = await requireBusiness(businessId);
  const [services, fields] = await Promise.all([listServices(db, business.id), getServiceFields(db, business.industry_code)]);
  const editable = can(membership, 'catalog.manage');
  const rental = business.booking_mode === 'rental';

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
              <ServiceForm businessId={business.id} currency={business.currency} rental={rental} fields={fields} />
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
                  {rental && s.service_photos.length > 0 && (
                    <Badge variant="outline">
                      {s.service_photos.length} {s.service_photos.length === 1 ? 'foto' : 'fotos'}
                    </Badge>
                  )}
                  <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                    {rental && s.full_day ? 'Día completo' : `${s.duration_minutes} min`} · {formatMoney(s.price, business.currency)}
                  </span>
                </summary>
                <div className="border-t p-4">
                  {editable ? (
                    <>
                      <ServiceForm businessId={business.id} currency={business.currency} rental={rental} fields={fields} service={s} />
                      {rental && <ServicePhotos businessId={business.id} service={s} />}
                      <ActionForm action={deleteServiceAction} confirm={`¿Eliminar ${s.name}?`} className="mt-4 border-t pt-4">
                        <input type="hidden" name="businessId" value={business.id} />
                        <input type="hidden" name="serviceId" value={s.id} />
                        <Button variant="ghost" size="sm" className="text-destructive">
                          Eliminar servicio
                        </Button>
                      </ActionForm>
                    </>
                  ) : (
                    <ServiceSummary service={s} fields={fields} />
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

function ServiceSummary({ service: s, fields }: { service: Service; fields: ServiceField[] }) {
  const details = describeServiceDetails(fields, s.details as Record<string, unknown>);
  return (
    <div className="space-y-1 text-sm">
      {s.description && <p>{s.description}</p>}
      {details.length > 0 && (
        <p className="text-muted-foreground">{details.map((d) => `${d.label}: ${d.value}`).join(' · ')}</p>
      )}
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

function ServiceForm({
  businessId,
  currency,
  rental,
  fields,
  service,
}: {
  businessId: string;
  currency: string;
  rental: boolean;
  fields: ServiceField[];
  service?: Service;
}) {
  const details = (service?.details ?? {}) as Record<string, unknown>;
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
      <Field label="Duración (minutos)" hint={rental ? 'Para arriendos por hora (ej. 180 = bloque de 3 horas)' : undefined}>
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
      {rental && (
        <div className="sm:col-span-2">
          <Checkbox name="fullDay" label="Se arrienda por día completo" defaultChecked={service?.full_day ?? false} />
          <p className="mt-1 text-xs text-muted-foreground">
            El juego queda ocupado todo el día del evento aunque se entregue en la tarde. La duración y las holguras no se usan.
          </p>
        </div>
      )}
      <Field label="Descripción" className="sm:col-span-2">
        <Textarea name="description" defaultValue={service?.description ?? ''} rows={2} />
      </Field>
      {fields.length > 0 && (
        <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold">Ficha</legend>
          {fields.map((f) =>
            f.type === 'boolean' ? (
              <div key={f.key} className="flex items-end">
                <Checkbox name={`detail_${f.key}`} label={f.label} defaultChecked={details[f.key] === true} />
                {/* Va después de la casilla: el servidor toma el primer valor, así "false" solo cuenta si no está marcada */}
                <input type="hidden" name={`detail_${f.key}`} value="false" />
              </div>
            ) : (
              <Field key={f.key} label={f.unit ? `${f.label} (${f.unit})` : f.label}>
                <Input
                  name={`detail_${f.key}`}
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  defaultValue={details[f.key] == null ? '' : String(details[f.key])}
                />
              </Field>
            ),
          )}
        </fieldset>
      )}
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

function ServicePhotos({ businessId, service }: { businessId: string; service: Service }) {
  const full = service.service_photos.length >= MAX_SERVICE_PHOTOS;
  return (
    <section className="mt-4 border-t pt-4" aria-label={`Fotos de ${service.name}`}>
      <h3 className="mb-2 text-sm font-semibold">Fotos del catálogo</h3>
      {service.service_photos.length === 0 && <p className="mb-2 text-sm text-muted-foreground">Sin fotos todavía.</p>}
      <ul className="mb-3 flex flex-wrap gap-3">
        {service.service_photos.map((p, i) => (
          <li key={p.id} className="w-28">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen pública de Storage, sin optimizador */}
            <img
              src={catalogPhotoUrl(p.path)}
              alt={`${service.name}, foto ${i + 1}`}
              className="aspect-square w-28 rounded-md border object-cover"
            />
            <ActionForm action={deleteServicePhotoAction} confirm="¿Eliminar esta foto?">
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="photoId" value={p.id} />
              <Button variant="ghost" size="xs" className="text-destructive">
                Eliminar
              </Button>
            </ActionForm>
          </li>
        ))}
      </ul>
      {!full && (
        <ActionForm action={uploadServicePhotoAction} className="flex flex-wrap items-end gap-2" resetOnSuccess>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="serviceId" value={service.id} />
          <Field label="Agregar foto" hint={`JPG, PNG o WebP de hasta 4 MB. Máximo ${MAX_SERVICE_PHOTOS} fotos.`}>
            <Input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
          </Field>
          <SubmitButton variant="outline">Subir foto</SubmitButton>
        </ActionForm>
      )}
    </section>
  );
}
