import { checkLimit, FEATURES } from '@agenda/core';
import { countByBusiness, getEntitlements, getSubscription } from '@agenda/db';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from '@agenda/ui';
import { requirePermission } from '@/lib/session';
import { t } from '@/lib/texts';

export const metadata = { title: 'Plan' };

export default async function PlanPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business } = await requirePermission(businessId, 'plan.view');
  const [subscription, entitlements, branches, resources] = await Promise.all([
    getSubscription(db, business.id),
    getEntitlements(db, business.id),
    countByBusiness(db, 'branches', business.id),
    countByBusiness(db, 'resources', business.id),
  ]);
  const usage: Record<string, number> = { branches, resources };

  return (
    <>
      <PageHeader title="Plan" description="Funciones habilitadas y límites de tu suscripción." />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{subscription.plan?.name ?? subscription.plan_code}</CardTitle>
          <CardDescription>{subscription.plan?.description}</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <ul className="divide-y">
          {FEATURES.map((feature) => {
            const e = entitlements.find((x) => x.feature === feature);
            const used = usage[feature];
            const check = used !== undefined ? checkLimit(entitlements, feature, used) : null;
            return (
              <li key={feature} className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex-1 text-sm font-medium">{t.features[feature] ?? feature}</span>
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
      <CardContent className="px-0 pt-4 text-sm text-muted-foreground">
        Los precios de planes y add-ons están por definir. Para ampliar tu plan, contáctanos.
      </CardContent>
    </>
  );
}
