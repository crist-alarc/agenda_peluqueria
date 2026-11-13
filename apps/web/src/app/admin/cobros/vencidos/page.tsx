import { formatMoney } from '@agenda/core';
import { getBillingAlerts } from '@agenda/db';
import { EmptyState, PageHeader } from '@agenda/ui';
import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/session';

export const metadata = { title: 'Cobros vencidos' };

const longDay = (d: string) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const monthName = (m: string) => new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));

/** Alertas de no pago (ADR 0011): la consola avisa; suspender lo decide un administrador. */
export default async function OverduePage() {
  const { db } = await requirePlatformAdmin();
  const { overdue } = await getBillingAlerts(db);
  return (
    <>
      <PageHeader
        title="Cobros vencidos"
        description="Facturados y sin pagar después de su vencimiento, del más atrasado al más reciente. La suspensión la decides tú en la ficha de cada negocio."
      />
      {overdue.length === 0 ? (
        <EmptyState>No hay cobros vencidos.</EmptyState>
      ) : (
        <div className="max-w-4xl overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="[&_th]:border-b [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
                <th>Negocio</th>
                <th>Mes</th>
                <th>Venció</th>
                <th className="text-right">Atraso</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:py-2.5 [&_td]:pr-4">
              {overdue.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/cobros/${o.id}`} className="font-medium hover:underline">
                      {o.businessName}
                    </Link>
                  </td>
                  <td className="capitalize">{monthName(o.month)}</td>
                  <td className="tabular-nums">{longDay(o.dueOn)}</td>
                  <td className="text-right font-medium tabular-nums text-destructive">
                    {o.days} {o.days === 1 ? 'día' : 'días'}
                  </td>
                  <td className="text-right tabular-nums">{formatMoney(o.gross, o.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
