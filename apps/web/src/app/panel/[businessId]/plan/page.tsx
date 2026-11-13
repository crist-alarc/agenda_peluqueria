import {
  BILLING_DOCUMENTS,
  checkLimit,
  FEATURE_LABELS,
  FEATURES,
  formatMoney,
  formatRate,
  taxBreakdown,
  type BillingDocument,
  type Feature,
} from '@agenda/core';
import { countByBusiness, getEntitlements, getMyCharges, getMyPlan, type MyCharges } from '@agenda/db';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from '@agenda/ui';
import { ChargeStatusBadge } from '@/components/charge-status';
import { requirePermission } from '@/lib/session';

export const metadata = { title: 'Plan' };

const date = (iso: string, tz: string) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: tz }).format(new Date(iso));

/** Plan del negocio: precio con impuesto, funciones y extras puntuales vigentes (ADR 0009). */
export default async function PlanPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business, membership } = await requirePermission(businessId, 'plan.view');
  const [plan, entitlements, branches, resources, charges] = await Promise.all([
    getMyPlan(db, business.id),
    getEntitlements(db, business.id),
    countByBusiness(db, 'branches', business.id),
    countByBusiness(db, 'resources', business.id),
    // Los cobros y las condiciones de pago son del dueño (ADR 0011)
    membership.role === 'owner' ? getMyCharges(db, business.id) : Promise.resolve(null),
  ]);
  const usage: Partial<Record<Feature, number>> = { branches, resources };
  const price = plan?.monthlyNet != null ? taxBreakdown(plan.monthlyNet, plan.taxRateBp ?? 0) : null;
  const extras = new Map((plan?.overrides ?? []).map((o) => [o.feature, o]));

  return (
    <>
      <PageHeader title="Plan" description="Tu suscripción, lo que incluye y sus límites." />
      {plan?.suspendedAt && (
        <Alert variant="destructive" className="mb-6">
          Tu negocio está suspendido desde el {date(plan.suspendedAt, business.timezone)}
          {plan.suspensionReason ? `: ${plan.suspensionReason}` : ''}. No recibe reservas nuevas. Escríbenos para reactivarlo.
        </Alert>
      )}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{plan?.planName ?? 'Plan'}</CardTitle>
          <CardDescription>{plan?.description}</CardDescription>
        </CardHeader>
        {plan && (
          <CardContent className="text-sm">
            {price ? (
              <p>
                <span className="text-lg font-semibold tabular-nums">{formatMoney(price.gross, plan.currency)}</span> al mes
                <span className="block text-muted-foreground">
                  {formatMoney(price.net, plan.currency)} neto
                  {price.rateBp > 0 ? ` + IVA ${formatRate(price.rateBp)} (${formatMoney(price.tax, plan.currency)})` : ', sin impuesto'}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">Precio por confirmar.</p>
            )}
            <p className="mt-2 text-muted-foreground">Cliente desde el {date(plan.startedAt, business.timezone)}.</p>
          </CardContent>
        )}
      </Card>
      <Card>
        <ul className="divide-y">
          {FEATURES.map((feature) => {
            const e = entitlements.find((x) => x.feature === feature);
            const used = usage[feature];
            const check = used !== undefined ? checkLimit(entitlements, feature, used) : null;
            const extra = extras.get(feature);
            return (
              <li key={feature} className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex-1 text-sm font-medium">
                  {FEATURE_LABELS[feature]}
                  {extra && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      Extra de la plataforma{extra.expiresAt ? ` hasta el ${date(new Date(Date.parse(extra.expiresAt) - 1).toISOString(), business.timezone)}` : ''}
                    </span>
                  )}
                </span>
                {used !== undefined && e?.limit_value != null && (
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {used} de {e.limit_value}
                  </span>
                )}
                {e?.enabled ? (
                  <Badge variant={check && !check.allowed ? 'outline' : 'success'}>
                    {check && !check.allowed ? 'Límite alcanzado' : 'Incluido'}
                  </Badge>
                ) : (
                  <Badge variant="muted">No incluido</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      {charges && <MyChargesSection charges={charges} />}
      <p className="pt-4 text-sm text-muted-foreground">
        Si cambias de plan, las funciones nuevas se activan de inmediato y el cobro del plan nuevo corre desde el día siguiente. Para cambiarlo,
        escríbenos.
      </p>
    </>
  );
}

const monthName = (m: string) => new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
const shortDay = (d: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

function MyChargesSection({ charges }: { charges: MyCharges }) {
  return (
    <section aria-labelledby="cobros" className="mt-8">
      <h2 id="cobros" className="mb-1 text-lg font-semibold">
        Tus cobros
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Se cobra a mes vencido.
        {charges.payment && ` Condiciones acordadas: ${charges.payment.termName}, ${charges.payment.methodName}.`}
      </p>
      {charges.charges.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay documentos emitidos.</p>
      ) : (
        <Card>
          <ul className="divide-y">
            {charges.charges.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm">
                <span className="flex-1 font-medium capitalize">
                  {monthName(c.month)}
                  <span className="block text-xs font-normal normal-case text-muted-foreground">
                    {c.documentType ? BILLING_DOCUMENTS[c.documentType as BillingDocument] : 'Documento'} folio {c.folio}
                    {c.status === 'paid' && c.paidOn ? `, pagado el ${shortDay(c.paidOn)}` : c.dueOn ? `, vence el ${shortDay(c.dueOn)}` : ''}
                  </span>
                </span>
                <ChargeStatusBadge status={c.status} dueOn={c.dueOn} today={charges.today} />
                <span className={`tabular-nums ${c.status === 'void' ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                  {formatMoney(c.gross, c.currency)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
