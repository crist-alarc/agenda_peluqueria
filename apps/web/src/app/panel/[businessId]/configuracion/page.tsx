import { Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Select } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePermission } from '@/lib/session';
import { t } from '@/lib/texts';
import { updateBusinessAction } from '../actions';

export const metadata = { title: 'Configuración' };

const TIMEZONES = ['America/Santiago', 'America/Punta_Arenas', 'Pacific/Easter'];

export default async function SettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requirePermission(businessId, 'business.update');

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
    </>
  );
}
