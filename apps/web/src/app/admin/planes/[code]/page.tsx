import {
  BILLING_CURRENCY_CODES,
  comparePlanVersions,
  FEATURE_LABELS,
  FEATURES,
  moneyInputHint,
  moneyInputValue,
  type PlanVersionSpec,
} from '@agenda/core';
import { isPlatformManager, type PlatformRole } from '@agenda/core';
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
  const { db, role } = await requirePlatformAdmin();
  const isNew = code === 'nuevo';
  const plan = isNew ? null : (await listAdminPlans(db)).find((p) => p.code === code);
  if (!isNew && !plan) notFound();
  const current = plan?.versions.find((v) => v.id === plan.currentVersionId) ?? null;
  const pending = plan?.versions.find((v) => v.status === 'pending') ?? null;

  return (
    <>
      <Link href="/admin/planes" className="text-sm text-muted-foreground hover:underline">
        Todos los planes
      </Link>
      <PageHeader title={plan?.name ?? 'Nuevo plan'} description={plan ? `Código ${plan.code}, versión vigente ${current?.version ?? 1}` : undefined} />

      {pending && (
        <div role="status" className="mb-6 max-w-3xl rounded-lg border-l-4 border-access-pending bg-access-pending/8 px-4 py-3 text-sm">
          <p className="font-medium">
            {current ? `Hay un cambio por aprobar (versión ${pending.version})` : 'Este plan espera la aprobación del dueño de la plataforma'}
            {pending.createdBy ? `, propuesto por ${pending.createdBy}` : ''}.
          </p>
          <p className="text-muted-foreground">
            Mientras tanto, nadie lo ve ni cambia nada.{' '}
            <Link href="/admin/aprobaciones" className="underline underline-offset-2">
              Ver en Aprobaciones
            </Link>
          </p>
        </div>
      )}

      {isPlatformManager(role) ? (
        <PlanForm plan={plan ?? null} current={role === 'owner' ? current : (pending ?? current)} role={role} />
      ) : (
        <p className="max-w-3xl text-sm text-muted-foreground">Solo un administrador puede crear planes o proponer cambios.</p>
      )}

      {plan && <Versions plan={plan} current={current} />}
    </>
  );
}

function PlanForm({ plan, current, role }: { plan: AdminPlan | null; current: PlanVersion | null; role: PlatformRole }) {
  // El nombre, la visibilidad, el archivo y el tipo free de un plan existente solo los cambia el dueño (ADR 0010)
  const lockedMeta = plan !== null && role !== 'owner';
  return (
    <ActionForm action={savePlanAction} className="max-w-3xl space-y-8" aria-label="Plan">
      {role !== 'owner' && (
        <p className="text-sm text-muted-foreground">
          {plan
            ? 'Puedes proponer cambios de precio y funciones. El dueño de la plataforma los aprueba antes de que apliquen.'
            : 'El plan quedará pendiente hasta que el dueño de la plataforma lo apruebe.'}
        </p>
      )}
      {lockedMeta ? (
        <section>
          <input type="hidden" name="code" value={plan.code} />
          <input type="hidden" name="name" value={plan.name} />
          <input type="hidden" name="description" value={plan.description ?? ''} />
          <input type="hidden" name="offeredCountries" value={plan.offeredCountries.join(', ')} />
          {plan.isPublic && <input type="hidden" name="isPublic" value="on" />}
          {plan.active && <input type="hidden" name="active" value="on" />}
          {plan.isFree && <input type="hidden" name="isFree" value="on" />}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Se ofrece en</dt>
            <dd>{plan.offeredCountries.length ? plan.offeredCountries.join(', ') : 'Todos los países'}</dd>
            <dt className="text-muted-foreground">Estado</dt>
            <dd>
              {plan.isFree ? 'Free, con autorización' : plan.isPublic ? 'Se ofrece a negocios nuevos' : 'No se ofrece'}
              {plan.active ? '' : ', archivado'}
            </dd>
          </dl>
        </section>
      ) : (
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
          <Checkbox name="isFree" label="Plan free (sin cobro, solo con autorización)" defaultChecked={plan?.isFree ?? false} />
        </div>
      </section>
      )}

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
      <SubmitButton>{role === 'owner' ? (plan ? 'Guardar plan' : 'Crear plan') : plan ? 'Proponer cambio' : 'Proponer plan'}</SubmitButton>
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
          const cmp = current && !isCurrent && v.status === 'approved' ? comparePlanVersions(spec(v), spec(current)) : null;
          return (
            <li key={v.id} className="py-4 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-medium">Versión {v.version}</span>
                {isCurrent && <Badge variant="success">Vigente</Badge>}
                {v.status === 'pending' && (
                  <Badge variant="outline" className="border-access-pending/60 text-access-pending">
                    Por aprobar
                  </Badge>
                )}
                {v.status === 'rejected' && <Badge variant="muted">Rechazada{v.decisionNote ? `: ${v.decisionNote}` : ''}</Badge>}
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
