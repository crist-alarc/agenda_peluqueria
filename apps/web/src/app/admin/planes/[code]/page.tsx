import {
  BILLING_CURRENCY_CODES,
  comparePlanVersions,
  FEATURE_LABELS,
  FEATURES,
  moneyInputHint,
  moneyInputValue,
  type PlanVersionSpec,
} from '@agenda/core';
import { listAdminPlans, type AdminPlan, type PlanVersion } from '@agenda/db';
import { Badge, Button, Checkbox, Field, Input, PageHeader, Textarea } from '@agenda/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePlatformAdmin } from '@/lib/session';
import { migrateVersionAction, savePlanAction } from '../../plan-actions';

const date = (iso: string) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(iso));
const spec = (v: PlanVersion): PlanVersionSpec => ({ features: v.features, prices: v.prices });

/** Crear o editar un plan; debajo, sus versiones y la decisión sobre quienes tienen una anterior. */
export default async function PlanPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { db } = await requirePlatformAdmin();
  const isNew = code === 'nuevo';
  const plan = isNew ? null : (await listAdminPlans(db)).find((p) => p.code === code);
  if (!isNew && !plan) notFound();
  const current = plan?.versions.find((v) => v.id === plan.currentVersionId) ?? null;

  return (
    <>
      <Link href="/admin/planes" className="text-sm text-muted-foreground hover:underline">
        Todos los planes
      </Link>
      <PageHeader title={plan?.name ?? 'Nuevo plan'} description={plan ? `Código ${plan.code}, versión vigente ${current?.version ?? 1}` : undefined} />

      <PlanForm plan={plan ?? null} current={current} />

      {plan && <Versions plan={plan} current={current} />}
    </>
  );
}

function PlanForm({ plan, current }: { plan: AdminPlan | null; current: PlanVersion | null }) {
  return (
    <ActionForm action={savePlanAction} className="max-w-3xl space-y-8" aria-label="Plan">
      <section className="grid gap-4 sm:grid-cols-2">
        {plan ? (
          <input type="hidden" name="code" value={plan.code} />
        ) : (
          <Field label="Código" hint="Letras minúsculas, números o guion bajo. No se puede cambiar después.">
            <Input name="code" required pattern="[a-z][a-z0-9_]{1,30}" placeholder="plan_pro" />
          </Field>
        )}
        <Field label="Nombre">
          <Input name="name" defaultValue={plan?.name} required />
        </Field>
        <Field label="Descripción" className="sm:col-span-2">
          <Textarea name="description" rows={2} defaultValue={plan?.description ?? ''} />
        </Field>
        <Field label="Se ofrece en" hint="Códigos de país separados por coma (CL, PE). Vacío = todos los países.">
          <Input name="offeredCountries" defaultValue={plan?.offeredCountries.join(', ') ?? 'CL'} />
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <Checkbox name="isPublic" label="Ofrecerlo a los negocios nuevos" defaultChecked={plan?.isPublic ?? true} />
          <Checkbox name="active" label="Activo (desmarca para archivarlo)" defaultChecked={plan?.active ?? true} />
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-semibold">Precio mensual neto</h2>
        <p className="mb-3 text-sm text-muted-foreground">El impuesto se suma al facturar según el país del cliente. Deja vacío si no se cobra en esa moneda.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {BILLING_CURRENCY_CODES.map((c) => (
            <Field key={c} label={c} hint={moneyInputHint(c)}>
              <Input
                name={`price_${c}`}
                inputMode="decimal"
                defaultValue={current?.prices[c] === undefined ? '' : moneyInputValue(current.prices[c]!, c)}
              />
            </Field>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Funciones incluidas</h2>
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th>Función</th>
              <th>Incluida</th>
              <th>Límite</th>
            </tr>
          </thead>
          <tbody className="[&_td]:border-b [&_td]:py-2 [&_td]:pr-4">
            {FEATURES.map((f) => {
              const s = current?.features.find((x) => x.feature === f);
              return (
                <tr key={f}>
                  <td className="font-medium">{FEATURE_LABELS[f]}</td>
                  <td>
                    <Checkbox name={`feature_${f}`} label="Incluida" defaultChecked={s?.enabled ?? false} />
                  </td>
                  <td>
                    <Input
                      name={`limit_${f}`}
                      aria-label={`Límite de ${FEATURE_LABELS[f]}`}
                      inputMode="numeric"
                      placeholder="Sin límite"
                      className="w-32"
                      defaultValue={s?.limit ?? ''}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <Field label="Nota de este cambio" hint="Queda en el historial de versiones.">
        <Input name="note" placeholder="Ej. Sube el límite de recursos" />
      </Field>
      <SubmitButton>{plan ? 'Guardar plan' : 'Crear plan'}</SubmitButton>
    </ActionForm>
  );
}

function Versions({ plan, current }: { plan: AdminPlan; current: PlanVersion | null }) {
  return (
    <section className="mt-12 max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold">Versiones</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Cada negocio conserva la versión que contrató. Si una versión nueva es una mejora, conviene pasar a quienes tienen la anterior; si no
        lo es, se respeta lo contratado. Tú decides.
      </p>
      <ol className="divide-y border-y">
        {plan.versions.map((v) => {
          const isCurrent = v.id === current?.id;
          const cmp = current && !isCurrent ? comparePlanVersions(spec(v), spec(current)) : null;
          return (
            <li key={v.id} className="py-4 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-medium">Versión {v.version}</span>
                {isCurrent && <Badge variant="success">Vigente</Badge>}
                <span className="text-muted-foreground">
                  {date(v.createdAt)}
                  {v.note ? `, ${v.note}` : ''}
                </span>
                <span className="ml-auto tabular-nums">
                  {v.businesses} {v.businesses === 1 ? 'negocio' : 'negocios'}
                </span>
              </div>
              {cmp && v.businesses > 0 && (
                <div className="mt-3 rounded-md bg-muted/60 p-3">
                  <p className={cmp.kind === 'worse' ? 'font-medium text-access-pending' : 'font-medium text-access-active'}>
                    {cmp.kind === 'worse'
                      ? `La versión ${current!.version} no es una mejora para ellos: se sugiere mantenerlos.`
                      : `La versión ${current!.version} es ${cmp.kind === 'same' ? 'igual' : 'una mejora'} para ellos: se sugiere pasarlos.`}
                  </p>
                  {(cmp.better.length > 0 || cmp.worse.length > 0) && (
                    <ul className="mt-1 list-inside list-disc text-muted-foreground">
                      {cmp.better.map((x) => (
                        <li key={x}>Mejora: {x}</li>
                      ))}
                      {cmp.worse.map((x) => (
                        <li key={x}>Empeora: {x}</li>
                      ))}
                    </ul>
                  )}
                  <ActionForm
                    action={migrateVersionAction}
                    className="mt-3"
                    confirm={`¿Pasar ${v.businesses} ${v.businesses === 1 ? 'negocio' : 'negocios'} a la versión ${current!.version}?`}
                  >
                    <input type="hidden" name="versionId" value={v.id} />
                    <Button variant={cmp.kind === 'worse' ? 'outline' : 'default'} size="sm">
                      Pasarlos a la versión {current!.version}
                    </Button>
                  </ActionForm>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
