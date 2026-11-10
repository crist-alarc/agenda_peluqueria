import { Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, PageHeader, Select } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePermission } from '@/lib/session';
import { t } from '@/lib/texts';
import { siteUrl } from '@/lib/url';
import { updateBookingSettingsAction, updateBusinessAction } from '../actions';

export const metadata = { title: 'Configuración' };

const TIMEZONES = ['America/Santiago', 'America/Punta_Arenas', 'Pacific/Easter'];

export default async function SettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requirePermission(businessId, 'business.update');
  const publicUrl = `${await siteUrl()}/r/${business.slug}`;

  return (
    <>
      <PageHeader title="Configuración" description="Datos generales del negocio." />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Datos del negocio</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateBusinessAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="businessId" value={business.id} />
            <Field label="Nombre" className="sm:col-span-2">
              <Input name="name" defaultValue={business.name} required />
            </Field>
            <Field label="Teléfono">
              <Input name="phone" type="tel" defaultValue={business.phone ?? ''} />
            </Field>
            <Field label="Email de contacto">
              <Input name="email" type="email" defaultValue={business.email ?? ''} />
            </Field>
            <Field label="Zona horaria" hint="Las horas se guardan en UTC y se muestran en esta zona">
              <Select name="timezone" defaultValue={business.timezone}>
                {[...new Set([business.timezone, ...TIMEZONES])].map((tz) => (
                  <option key={tz}>{tz}</option>
                ))}
              </Select>
            </Field>
            <Field label="Modo de reserva" hint="Viene del rubro elegido">
              <Input value={t.bookingModes[business.booking_mode]} disabled readOnly />
            </Field>
            <Field label="Dirección web (slug)" hint="Se usará para el link público de reservas">
              <Input value={business.slug} disabled readOnly />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton>Guardar</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-2xl">
        <CardHeader>
          <CardTitle>Reservas</CardTitle>
          <CardDescription>
            Link público para tus clientes:{' '}
            <a href={publicUrl} className="font-medium text-foreground underline" target="_blank" rel="noreferrer">
              {publicUrl}
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateBookingSettingsAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="businessId" value={business.id} />
            <Field label="Intervalo entre horarios (min)" hint="Cada cuánto se ofrecen horas: 10:00, 10:15…">
              <Select name="slotIntervalMinutes" defaultValue={String(business.slot_interval_minutes)}>
                {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Anticipación mínima (min)" hint="El link público no ofrece horas más cercanas">
              <Input name="minAdvanceMinutes" type="number" min={0} defaultValue={business.min_advance_minutes} />
            </Field>
            <Field label="Reservar hasta (días)" hint="Cuántos días hacia adelante">
              <Input name="maxAdvanceDays" type="number" min={1} max={365} defaultValue={business.max_advance_days} />
            </Field>
            <Field label="Cancelación con aviso (horas)" hint="Política que se informa al cliente">
              <Input name="cancellationHours" type="number" min={0} max={168} defaultValue={business.cancellation_hours} />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox name="publicBookingEnabled" label="Link público activo" defaultChecked={business.public_booking_enabled} />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton>Guardar</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
