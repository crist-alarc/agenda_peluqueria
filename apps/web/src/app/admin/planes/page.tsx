import { BILLING_CURRENCY_CODES, FEATURE_LABELS, FEATURES, formatMoney } from '@agenda/core';
import { listAdminPlans, type AdminPlan } from '@agenda/db';
import { Badge, Button, EmptyState, PageHeader } from '@agenda/ui';
import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/session';

export const metadata = { title: 'Planes' };

const current = (p: AdminPlan) => p.versions.find((v) => v.id === p.currentVersionId) ?? p.versions[0];

/** Catálogo de planes: una columna por plan y una fila por función, para comparar y decidir (ADR 0009). */
export default async function PlansPage() {
  const { db } = await requirePlatformAdmin();
  const plans = await listAdminPlans(db);
  const active = plans.filter((p) => p.active);
  const archived = plans.filter((p) => !p.active);

  return (
    <>
      <PageHeader
        title="Planes"
        description="Precios netos mensuales. El IVA o impuesto depende del país del cliente (ver Facturación)."
        actions={
          <Button asChild>
            <Link href="/admin/planes/nuevo">Nuevo plan</Link>
          </Button>
        }
      />
      {active.length === 0 ? (
        <EmptyState>No hay planes activos.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="[&_th]:border-b [&_th]:px-3 [&_th]:pb-3 [&_th]:text-left [&_th]:align-bottom">
                <th className="w-48 font-medium text-muted-foreground">Función</th>
                {active.map((p) => {
                  const v = current(p);
                  const clients = p.versions.reduce((n, x) => n + x.businesses, 0);
                  return (
                    <th key={p.code} scope="col">
                      <Link href={`/admin/planes/${p.code}`} className="block font-semibold hover:underline">
                        {p.name}
                      </Link>
                      <span className="block text-xs font-normal text-muted-foreground">
                        Versión {v?.version ?? 1}, {clients} {clients === 1 ? 'negocio' : 'negocios'}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {p.isFree && <Badge variant="outline">Free, con autorización</Badge>}
                        {!p.isPublic && !p.isFree && <Badge variant="muted">No se ofrece</Badge>}
                        {p.versions.some((x) => x.status === 'pending') && (
                          <Badge variant="outline" className="border-access-pending/60 text-access-pending">
                            {p.currentVersionId ? 'Cambio por aprobar' : 'Por aprobar'}
                          </Badge>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-normal">
              {BILLING_CURRENCY_CODES.map((c) => (
                <tr key={c}>
                  <th scope="row" className="text-muted-foreground">
                    Precio neto en {c}
                  </th>
                  {active.map((p) => {
                    const price = current(p)?.prices[c];
                    return (
                      <td key={p.code} className="tabular-nums">
                        {p.isFree ? <span className="text-muted-foreground">Sin cobro</span> : price === undefined ? <span className="text-muted-foreground">Sin precio</span> : formatMoney(price, c)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {FEATURES.map((f) => (
                <tr key={f}>
                  <th scope="row">{FEATURE_LABELS[f]}</th>
                  {active.map((p) => {
                    const spec = current(p)?.features.find((x) => x.feature === f);
                    return (
                      <td key={p.code} className={spec?.enabled ? '' : 'text-muted-foreground'}>
                        {!spec?.enabled ? 'No' : spec.limit === null ? 'Sí, sin límite' : `Hasta ${spec.limit}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" className="text-muted-foreground">
                  Se ofrece en
                </th>
                {active.map((p) => (
                  <td key={p.code}>{p.offeredCountries.length === 0 ? 'Todos los países' : p.offeredCountries.join(', ')}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {archived.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold">Archivados</h2>
          <ul className="text-sm">
            {archived.map((p) => (
              <li key={p.code} className="border-b py-1.5">
                <Link href={`/admin/planes/${p.code}`} className="hover:underline">
                  {p.name}
                </Link>{' '}
                <span className="text-muted-foreground">
                  ({p.versions.reduce((n, x) => n + x.businesses, 0)} negocios aún lo tienen)
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
