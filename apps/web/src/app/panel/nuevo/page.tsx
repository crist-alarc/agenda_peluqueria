import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select } from '@agenda/ui';
import { listIndustryTemplates } from '@agenda/db';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requireUser } from '@/lib/session';
import { t } from '@/lib/texts';
import { createBusinessAction } from './actions';

export const metadata = { title: 'Nuevo negocio' };

export default async function NewBusinessPage() {
  const { db } = await requireUser();
  const templates = await listIndustryTemplates(db);

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
            <input type="hidden" name="timezone" value="America/Santiago" />
            <SubmitButton>Crear negocio</SubmitButton>
          </ActionForm>
          <Link href="/panel" className="mt-4 block text-center text-sm text-muted-foreground hover:underline">
            Volver
          </Link>
          <Link href="/mis-reservas" className="mt-2 block text-center text-sm text-muted-foreground hover:underline">
            ¿Solo quieres ver tus reservas? Mis reservas
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
