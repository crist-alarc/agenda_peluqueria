import { can, formatClp, formatPercent, hasFeature, localDate, proposePeriod, type SettlementPeriod } from '@agenda/core';
import {
  getEntitlements,
  listBusinessProfessionals,
  listCommissionEntries,
  listCommissionRules,
  listServiceRecipes,
  listServices,
  listSettlements,
} from '@agenda/db';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, EmptyState, Field, Input, PageHeader, Select } from '@agenda/ui';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePermission } from '@/lib/session';
import { periodLabel, SETTLEMENT_STATUS } from '@/lib/settlement-report';
import {
  adjustmentAction,
  createRuleAction,
  createSettlementAction,
  deactivateRuleAction,
  settlementPeriodAction,
} from './actions';

export const metadata = { title: 'Comisiones' };

const STATUS_VARIANT = { draft: 'outline', closed: 'secondary', paid: 'success' } as const;
const PERIODS: Record<SettlementPeriod, string> = { weekly: 'Semanal (lunes a domingo)', biweekly: 'Quincenal (1–15 y 16–fin)', monthly: 'Mensual' };

export default async function CommissionsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business, membership } = await requirePermission(businessId, 'commissions.view');
  if (!hasFeature(await getEntitlements(db, business.id), 'commissions')) {
    return (
      <>
        <PageHeader title="Comisiones" />
        <EmptyState>Tu plan no incluye comisiones. Revisa la sección Plan.</EmptyState>
      </>
    );
  }
  const manage = can(membership, 'commissions.manage');
  const base = `/panel/${business.id}/comisiones`;
  const [pending, settlements] = await Promise.all([
    listCommissionEntries(db, { businessId: business.id, settlementId: null, limit: 200 }),
    listSettlements(db, business.id),
  ]);
  const pendingTotal = pending.reduce((sum, e) => sum + e.amount_clp, 0);

  const pendingCard = (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Pendientes de liquidar</CardTitle>
        <CardDescription>
          {pending.length === 0 ? 'No hay movimientos pendientes.' : `${pending.length} movimientos · ${formatClp(pendingTotal)}`}
        </CardDescription>
      </CardHeader>
      {pending.length > 0 && (
        <CardContent>
          <ul className="divide-y text-sm" aria-label="Movimientos pendientes">
            {pending.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {e.professional?.display_name} · {e.kind === 'adjustment' ? 'Ajuste' : e.booking_item?.service_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {localDate(e.occurred_at, business.timezone)}
                    {e.kind === 'adjustment' ? ` · ${e.note}` : ` · ${e.booking?.customer?.full_name ?? ''}`}
                    {e.share_bp && e.share_bp < 10000 ? ` · parte ${formatPercent(e.share_bp)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatClp(e.amount_clp)}</span>
                  {manage && e.booking_item_id && (
                    <Link href={`${base}/reparto/${e.booking_item_id}`} className="text-xs underline">
                      Repartir
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );

  const settlementsCard = (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Liquidaciones</CardTitle>
      </CardHeader>
      <CardContent>
        {settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay liquidaciones.</p>
        ) : (
          <ul className="divide-y text-sm">
            {settlements.map((s) => (
              <li key={s.id}>
                <Link href={`${base}/${s.id}`} className="flex items-center justify-between gap-2 py-2 hover:underline">
                  <span>{periodLabel(s)}</span>
                  <span className="flex items-center gap-2">
                    {manage && <span className="tabular-nums">{formatClp(Number(s.total_clp))}</span>}
                    <Badge variant={STATUS_VARIANT[s.status as keyof typeof STATUS_VARIANT]}>{SETTLEMENT_STATUS[s.status]}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  if (!manage) {
    return (
      <>
        <PageHeader title="Mis comisiones" description="Tus comisiones por servicios completados y sus liquidaciones." />
        {pendingCard}
        {settlementsCard}
      </>
    );
  }

  const [rules, people, services, recipes] = await Promise.all([
    listCommissionRules(db, business.id),
    listBusinessProfessionals(db, business.id),
    listServices(db, business.id),
    listServiceRecipes(db, business.id),
  ]);
  const personName = new Map(people.map((p) => [p.id, p.name]));
  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  const proposal = proposePeriod(business.settlement_period as SettlementPeriod, localDate(new Date().toISOString(), business.timezone));

  return (
    <>
      <PageHeader title="Comisiones" description="Reglas del equipo, movimientos y liquidaciones." />

      <Card>
        <CardHeader>
          <CardTitle>Nueva liquidación</CardTitle>
          <CardDescription>Incluye todo lo pendiente hasta la fecha de término (también ajustes y pendientes anteriores).</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createSettlementAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="businessId" value={business.id} />
            <Field label="Desde">
              <Input type="date" name="start" defaultValue={proposal.start} required />
            </Field>
            <Field label="Hasta">
              <Input type="date" name="end" defaultValue={proposal.end} required />
            </Field>
            <SubmitButton>Crear liquidación</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      {settlementsCard}
      {pendingCard}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Reglas de comisión</CardTitle>
          <CardDescription>
            Gana la más específica: persona + servicio, luego servicio, luego persona y al final la regla general.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin reglas: los servicios no generan comisión.</p>
          ) : (
            <ul className="divide-y text-sm" aria-label="Reglas de comisión">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <strong>{r.professional_id ? personName.get(r.professional_id) : 'Todo el equipo'}</strong>
                    {' · '}
                    {r.service_id ? serviceName.get(r.service_id) : 'todos los servicios'}
                    {' · '}
                    {r.kind === 'percent' ? formatPercent(r.value) : `${formatClp(r.value)} fijo`}
                    {r.include_addons && ' (con adicionales)'}
                  </span>
                  <ActionForm action={deactivateRuleAction} confirm="¿Quitar esta regla?">
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="ruleId" value={r.id} />
                    <SubmitButton size="xs" variant="ghost">
                      Quitar
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={createRuleAction} className="grid gap-3 border-t pt-4 sm:grid-cols-2" aria-label="Nueva regla">
            <input type="hidden" name="businessId" value={business.id} />
            <Field label="Persona">
              <Select name="professionalId" defaultValue="">
                <option value="">Todo el equipo</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Servicio">
              <Select name="serviceId" defaultValue="">
                <option value="">Todos los servicios</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo">
              <Select name="kind" defaultValue="percent">
                <option value="percent">Porcentaje del precio (%)</option>
                <option value="fixed">Monto fijo por servicio ($)</option>
              </Select>
            </Field>
            <Field label="Valor" hint="Ej. 40 (para 40%) o 5000 (para $5.000)">
              <Input name="value" inputMode="decimal" required />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox name="includeAddons" label="Incluir adicionales en el cálculo (solo porcentaje)" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton>Guardar regla</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Reparto de servicios entre varias personas</CardTitle>
          <CardDescription>
            Si un servicio lo hacen dos o más personas, define la receta (ej. corte 70% / secado 30%). Sin receta se reparte en
            partes iguales. En cada reserva puedes cambiar el reparto con &quot;Repartir&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {services.map((s) => {
              const roles = recipes.filter((r) => r.service_id === s.id);
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {s.name}
                    <span className="text-muted-foreground">
                      {' · '}
                      {roles.length === 0 ? 'partes iguales' : roles.map((r) => `${r.label} ${formatPercent(r.share_bp)}`).join(' / ')}
                    </span>
                  </span>
                  <Link href={`${base}/receta/${s.id}`} className="text-xs underline">
                    Editar receta
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ajuste</CardTitle>
            <CardDescription>Para corregir algo ya liquidado o dar un bono. Entra en la próxima liquidación.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={adjustmentAction} className="grid gap-3">
              <input type="hidden" name="businessId" value={business.id} />
              <Field label="Persona">
                <Select name="professionalId" required>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <Field label="Tipo">
                  <Select name="sign" defaultValue="+">
                    <option value="+">Suma</option>
                    <option value="-">Resta</option>
                  </Select>
                </Field>
                <Field label="Monto ($)">
                  <Input name="amount" inputMode="numeric" required />
                </Field>
              </div>
              <Field label="Motivo">
                <Input name="note" required />
              </Field>
              <SubmitButton>Registrar ajuste</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Frecuencia de liquidación</CardTitle>
            <CardDescription>La app propone las fechas según esta frecuencia; siempre puedes elegir otras.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={settlementPeriodAction} className="grid gap-3">
              <input type="hidden" name="businessId" value={business.id} />
              <Field label="Frecuencia">
                <Select name="settlementPeriod" defaultValue={business.settlement_period}>
                  {Object.entries(PERIODS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton>Guardar</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
