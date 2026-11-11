import { listServiceRecipes, listServices } from '@agenda/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, PageHeader } from '@agenda/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePermission } from '@/lib/session';
import { saveRecipeAction } from '../../actions';

export const metadata = { title: 'Receta de reparto' };

/** Receta de un servicio hecho por varias personas (ej. peluquería canina 70% / secado 30%). */
export default async function RecipePage({ params }: { params: Promise<{ businessId: string; serviceId: string }> }) {
  const { businessId, serviceId } = await params;
  const { db, business } = await requirePermission(businessId, 'commissions.manage');
  const [services, recipes] = await Promise.all([listServices(db, business.id), listServiceRecipes(db, business.id)]);
  const service = services.find((s) => s.id === serviceId);
  if (!service) notFound();
  const roles = recipes.filter((r) => r.service_id === service.id);

  return (
    <>
      <PageHeader title={`Receta: ${service.name}`} description="Cómo se reparte la comisión cuando varias personas hacen este servicio." />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Roles del servicio</CardTitle>
          <CardDescription>
            Los porcentajes deben sumar 100%. Si un rol exige una habilidad (ej. &quot;secado&quot;), se asigna a quien la tiene en
            Recursos. Deja todo en blanco para repartir en partes iguales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveRecipeAction} className="grid gap-3">
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="serviceId" value={service.id} />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_1fr] gap-2">
                <Field label={i === 0 ? 'Rol' : ''}>
                  <Input name={`label_${i}`} defaultValue={roles[i]?.label ?? ''} aria-label={`Rol ${i + 1}`} />
                </Field>
                <Field label={i === 0 ? '%' : ''}>
                  <Input
                    name={`percent_${i}`}
                    inputMode="decimal"
                    defaultValue={roles[i] ? String(roles[i].share_bp / 100).replace('.', ',') : ''}
                    aria-label={`Porcentaje ${i + 1}`}
                  />
                </Field>
                <Field label={i === 0 ? 'Habilidad (opcional)' : ''}>
                  <Input name={`skill_${i}`} defaultValue={roles[i]?.required_skill ?? ''} aria-label={`Habilidad ${i + 1}`} />
                </Field>
              </div>
            ))}
            <SubmitButton>Guardar receta</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <p className="mt-6 text-sm">
        <Link href={`/panel/${business.id}/comisiones`} className="underline">
          Volver a comisiones
        </Link>
      </p>
    </>
  );
}
