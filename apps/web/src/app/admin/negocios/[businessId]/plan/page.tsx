import {
  FEATURE_LABELS,
  FEATURES,
  formatMoney,
  formatRate,
  prorateMonth,
  taxBreakdown,
  type Feature,
  type SubscriptionPeriod,
} from '@agenda/core';
import { getAdminBusinessPlan, listAdminClients, listAdminPlans, type AdminBusinessPlan } from '@agenda/db';
import { Alert, Badge, Button, Checkbox, Field, Input, PageHeader, Select } from '@agenda/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePlatformAdmin } from '@/lib/session';
import { addOverrideAction, changePlanAction, endOverrideAction, reactivateAction, suspendAction } from '../../../plan-actions';

export const metadata = { title: 'Plan y cobro' };

const TZ = 'America/Santiago';
const day = (d: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const dateTime = (iso: string) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: TZ }).format(new Date(iso));
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(new Date());
const monthName = (m: string) =>
  new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));

/** Plan, cobro del mes, funciones puntuales y suspensión de un negocio (ADR 0009). */
export default async function BusinessPlanPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) notFound();
  const { db } = await requirePlatformAdmin();
  const [p, plans, clients] = await Promise.all([getAdminBusinessPlan(db, businessId), listAdminPlans(db), listAdminClients(db)]);
  if (!p) notFound();
  const client = clients.find((c) => c.businesses.some((b) => b.id === businessId));
  const name = client?.businesses.find((b) => b.id === businessId)?.name ?? 'Negocio';
  const sub = p.subscription;
  const hasNewerVersion = sub.versionId !== sub.currentVersionId;

  return (
    <>
      {client && (
        <Link href={`/admin/clientes/${client.id}`} className="text-sm text-muted-foreground hover:underline">
          {client.owner.name || client.owner.email}
        </Link>
      )}
      <PageHeader title={name} description={`Plan ${sub.planName}, versión ${sub.version}. Cobro en ${sub.currency}.`} />

      {p.suspendedAt && (
        <Alert variant="destructive" className="mb-6 max-w-3xl">
          Suspendido desde el {dateTime(p.suspendedAt)}: {p.suspensionReason}. No recibe reservas nuevas y esos días no se cobran.
        </Alert>
      )}

      <div className="grid max-w-5xl gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-10">
          <MonthPreview p={p} />
          <Periods p={p} />
          <Features p={p} />
        </div>
        <aside className="space-y-8">
          <section aria-labelledby="cambio">
            <h2 id="cambio" className="mb-2 font-semibold">
              Cambiar plan
            </h2>
            {hasNewerVersion && (
              <p className="mb-2 text-sm text-access-pending">Tiene una versión anterior del plan. Decide en la ficha del plan si pasa a la vigente.</p>
            )}
            <ActionForm action={changePlanAction} className="space-y-3" aria-label="Cambiar plan">
              <input type="hidden" name="businessId" value={businessId} />
              <Field label="Plan nuevo">
                <Select name="planCode" defaultValue={sub.planCode}>
                  {plans
                    .filter((x) => x.active)
                    .map((x) => (
                      <option key={x.code} value={x.code}>
                        {x.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Nota">
                <Input name="note" placeholder="Ej. Pidió comisiones" />
              </Field>
              <p className="text-xs text-muted-foreground">Las funciones cambian ya; el plan nuevo se cobra desde mañana.</p>
              <SubmitButton size="sm">Cambiar plan</SubmitButton>
            </ActionForm>
          </section>

          <section aria-labelledby="suspension">
            <h2 id="suspension" className="mb-2 font-semibold">
              Suspensión
            </h2>
            {p.suspendedAt ? (
              <ActionForm action={reactivateAction} className="space-y-3" aria-label="Reactivar">
                <input type="hidden" name="businessId" value={businessId} />
                <Field label="Nota">
                  <Input name="note" placeholder="Ej. Pagó lo pendiente" />
                </Field>
                <SubmitButton size="sm">Reactivar negocio</SubmitButton>
              </ActionForm>
            ) : (
              <ActionForm action={suspendAction} className="space-y-3" aria-label="Suspender" confirm="¿Suspender este negocio? Su link público deja de recibir reservas.">
                <input type="hidden" name="businessId" value={businessId} />
                <Field label="Motivo">
                  <Input name="reason" required minLength={3} placeholder="Ej. Pago pendiente de octubre" />
                </Field>
                <SubmitButton size="sm" variant="outline">
                  Suspender negocio
                </SubmitButton>
              </ActionForm>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function MonthPreview({ p }: { p: AdminBusinessPlan }) {
  const month = thisMonth();
  const periods: SubscriptionPeriod[] = p.periods.map((x) => ({
    startsOn: x.startsOn,
    endsOn: x.endsOn,
    kind: x.kind,
    label: x.kind === 'suspended' ? 'Suspendido' : `${x.planName} v${x.version}`,
    monthlyNet: x.monthlyNet ?? 0,
  }));
  const charge = prorateMonth(periods, month);
  const rate = p.billing?.taxRateBp ?? 0;
  const total = taxBreakdown(charge.net, rate);
  const missingPrice = p.periods.some((x) => x.kind === 'plan' && x.monthlyNet === null);
  const c = p.subscription.currency;
  return (
    <section aria-labelledby="mes">
      <h2 id="mes" className="mb-1 text-lg font-semibold">
        Cobro de {monthName(month)} (vista previa)
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Por días calendario: cada cambio se cobra desde el día siguiente. {p.billing?.entityName ? `Factura ${p.billing.entityName}.` : ''}
      </p>
      <table className="w-full text-sm">
        <tbody className="[&_td]:border-b [&_td]:py-2 [&_td]:pr-4">
          {charge.lines.map((l) => (
            <tr key={`${l.from}-${l.label}`} className={l.kind === 'suspended' ? 'text-muted-foreground' : ''}>
              <td>{l.label}</td>
              <td className="tabular-nums">
                {day(l.from)} al {day(l.to)}
              </td>
              <td className="tabular-nums">
                {l.days} de {charge.daysInMonth} días
              </td>
              <td className="text-right tabular-nums">{formatMoney(l.net, c)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="[&_td]:py-1.5 [&_td]:pr-4">
          <tr>
            <td colSpan={3}>Neto</td>
            <td className="text-right tabular-nums">{formatMoney(total.net, c)}</td>
          </tr>
          <tr>
            <td colSpan={3}>{rate > 0 ? `IVA ${formatRate(rate)}` : 'Impuesto (exento)'}</td>
            <td className="text-right tabular-nums">{formatMoney(total.tax, c)}</td>
          </tr>
          <tr className="font-semibold">
            <td colSpan={3}>Total</td>
            <td className="text-right tabular-nums">{formatMoney(total.gross, c)}</td>
          </tr>
        </tfoot>
      </table>
      {missingPrice && <p className="mt-2 text-sm text-access-pending">El plan no tiene precio en {c}: esos días suman $0 hasta que lo cargues.</p>}
    </section>
  );
}

function Periods({ p }: { p: AdminBusinessPlan }) {
  return (
    <section aria-labelledby="tramos">
      <h2 id="tramos" className="mb-3 text-lg font-semibold">
        Historial de tramos
      </h2>
      <ol className="text-sm">
        {[...p.periods].reverse().map((x) => (
          <li key={x.id} className="flex flex-wrap gap-x-3 border-b py-1.5">
            <span className="tabular-nums text-muted-foreground">
              {day(x.startsOn)} – {x.endsOn ? day(x.endsOn) : 'hoy'}
            </span>
            <span className="font-medium">{x.kind === 'suspended' ? 'Suspendido (sin cobro)' : `${x.planName} v${x.version}`}</span>
            {x.kind === 'plan' && (
              <span className="tabular-nums">{x.monthlyNet === null ? 'sin precio' : `${formatMoney(x.monthlyNet, x.currency)} neto al mes`}</span>
            )}
            {x.note && <span className="text-muted-foreground">{x.note}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Features({ p }: { p: AdminBusinessPlan }) {
  const usage: Partial<Record<Feature, number>> = { branches: p.usage.branches, resources: p.usage.resources };
  const active = p.overrides.filter((o) => !o.endedAt && (!o.expiresAt || Date.parse(o.expiresAt) > Date.now()));
  return (
    <section aria-labelledby="funciones">
      <h2 id="funciones" className="mb-3 text-lg font-semibold">
        Funciones
      </h2>
      <ul className="mb-6 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {FEATURES.map((f) => {
          const e = p.entitlements.find((x) => x.feature === f);
          const used = usage[f];
          const over = e?.limit != null && used !== undefined && used > e.limit;
          return (
            <li key={f} className={e?.enabled ? '' : 'text-muted-foreground'}>
              {FEATURE_LABELS[f]}: {!e?.enabled ? 'no' : e.limit === null ? 'sin límite' : `hasta ${e.limit}`}
              {used !== undefined && e?.enabled && `, usa ${used}`}
              {e?.source === 'manual' && (
                <Badge variant="outline" className="ml-2">
                  Puntual
                </Badge>
              )}
              {over && <span className="ml-2 text-access-pending">sobre el límite (no puede crear más)</span>}
            </li>
          );
        })}
      </ul>

      {active.length > 0 && (
        <ul className="mb-6 space-y-2 text-sm">
          {active.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-3 rounded-md bg-muted/60 px-3 py-2">
              <span className="font-medium">
                {FEATURE_LABELS[o.feature as Feature] ?? o.feature}: {o.enabled ? (o.limit === null ? 'incluida' : `hasta ${o.limit}`) : 'quitada'}
              </span>
              <span className="text-muted-foreground">
                {o.expiresAt ? `hasta el ${dateTime(new Date(Date.parse(o.expiresAt) - 1).toISOString())}` : 'sin término'}, {o.note}
              </span>
              <ActionForm action={endOverrideAction} className="ml-auto">
                <input type="hidden" name="overrideId" value={o.id} />
                <Button variant="ghost" size="xs">
                  Terminar
                </Button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}

      <ActionForm action={addOverrideAction} className="grid gap-3 sm:grid-cols-2" resetOnSuccess aria-label="Función puntual">
        <input type="hidden" name="businessId" value={p.businessId} />
        <Field label="Función puntual">
          <Select name="feature" defaultValue="commissions">
            {FEATURES.map((f) => (
              <option key={f} value={f}>
                {FEATURE_LABELS[f]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Límite" hint="Vacío = sin límite">
          <Input name="limit" inputMode="numeric" />
        </Field>
        <Field label="Hasta el día" hint="Vacío = sin término">
          <Input name="until" type="date" />
        </Field>
        <Field label="Motivo">
          <Input name="note" required minLength={3} placeholder="Ej. Regalo por 3 meses" />
        </Field>
        <div className="flex items-center gap-4 sm:col-span-2">
          <Checkbox name="enabled" label="Incluida" defaultChecked />
          <SubmitButton size="sm" variant="outline">
            Aplicar función puntual
          </SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}
