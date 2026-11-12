import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from '@agenda/ui';
import { listIndustryTemplates, listPublicPlans } from '@agenda/db';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { PlanPicker } from '@/components/plan-picker';
import { requireUser } from '@/lib/session';
import { t } from '@/lib/texts';
import { signOutAction } from '../../(auth)/actions';
import { createBusinessAction } from './actions';

export const metadata = { title: 'Nuevo negocio' };

export default async function NewBusinessPage() {
  const { db, user } = await requireUser();
  const [templates, offer] = await Promise.all([listIndustryTemplates(db), listPublicPlans(db, 'CL')]);

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Crea tu negocio</CardTitle>
          <CardDescription>
            Elige el rubro y precargaremos servicios, horarios y adicionales de ejemplo. Todo se puede editar después.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createBusinessAction} className="flex flex-col gap-4">
            <Field label="Nombre del negocio">
              <Input name="businessName" placeholder="Ej. Barbería El Filo" required />
            </Field>
            <Field label="Rubro">
              <Select name="industryCode" defaultValue={templates[0]?.code} required>
                {templates.map((tpl) => (
                  <option key={tpl.code} value={tpl.code}>
                    {tpl.name} — {t.bookingModes[tpl.booking_mode]}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="flex flex-col gap-4 rounded-md border p-4">
              <legend className="px-1 text-sm font-medium">Primera sucursal</legend>
              <Field label="Nombre">
                <Input name="branchName" defaultValue="Casa matriz" required />
              </Field>
              <Field label="Dirección">
                <Input name="branchAddress" placeholder="Av. Providencia 1234" />
              </Field>
              <Field label="Comuna">
                <Input name="branchCommune" placeholder="Providencia" />
              </Field>
            </fieldset>
            {offer && offer.plans.length > 0 && <PlanPicker offer={offer} />}
            <input type="hidden" name="timezone" value="America/Santiago" />
            <SubmitButton>Crear negocio</SubmitButton>
          </ActionForm>
          <Link href="/panel?todos=1" className="mt-4 block text-center text-sm text-muted-foreground hover:underline">
            Volver a mis negocios
          </Link>
          <Link href="/mis-reservas" className="mt-2 block text-center text-sm text-muted-foreground hover:underline">
            ¿Solo quieres ver tus reservas? Mis reservas
          </Link>
          <form action={signOutAction} className="mt-4 text-center text-xs text-muted-foreground">
            Sesión de {user.email} ·{' '}
            <Button variant="link" size="xs" className="h-auto p-0 text-xs">
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
