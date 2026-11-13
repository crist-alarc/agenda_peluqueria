import { CHARGE_STATUSES, formatMoney, isPlatformManager, previousMonth, type ChargeStatus } from '@agenda/core';
import { getBillingAlerts, getChargeInputs, listCharges } from '@agenda/db';
import { buttonVariants, EmptyState, PageHeader } from '@agenda/ui';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { ChargeStatusBadge } from '@/components/charge-status';
import { requirePlatformAdmin } from '@/lib/session';
import { generateChargesAction } from '../charge-actions';

export const metadata = { title: 'Cobros' };

const monthName = (m: string) => new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
const nextMonth = (m: string) => {
  const [y, mm] = m.split('-').map(Number) as [number, number];
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
};
const day = (d: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const ORDER: ChargeStatus[] = ['pending', 'invoiced', 'paid', 'void'];

/**
 * Cobros de un mes vencido (ADR 0011): se generan desde los tramos de cada negocio, se facturan
 * en el SII (folio), se marcan pagados o se anulan. Por defecto, el mes anterior.
 */
export default async function ChargesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { db, role } = await requirePlatformAdmin();
  const alerts = await getBillingAlerts(db);
  const lastClosed = previousMonth(alerts.today);
  const { mes } = await searchParams;
  const month = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes <= lastClosed ? mes : lastClosed;
  const [charges, inputs] = await Promise.all([listCharges(db, month), getChargeInputs(db, month)]);
  const withCharge = new Set(charges.filter((c) => c.status !== 'void').map((c) => c.businessId));
  const withoutCharge = inputs.filter((b) => !withCharge.has(b.businessId));
  const missingProfile = charges.filter((c) => c.status === 'pending' && !c.profile).length;
  const currencies = [...new Set(charges.map((c) => c.currency))];

  return (
    <>
      <PageHeader
        title="Cobros"
        description="A mes vencido: se cobra lo usado en el mes, por días. Lo emites en el SII y aquí anotas el folio y el pago."
      />

      <nav aria-label="Mes" className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`/admin/cobros?mes=${previousMonth(`${month}-01`)}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Mes anterior
        </Link>
        <h2 className="min-w-48 text-center text-xl font-semibold capitalize">{monthName(month)}</h2>
        {month < lastClosed ? (
          <Link href={`/admin/cobros?mes=${nextMonth(month)}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Mes siguiente
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">Último mes cerrado</span>
        )}
        <a href={`/admin/cobros/exportar?mes=${month}`} className={`${buttonVariants({ variant: 'outline', size: 'sm' })} ml-auto`}>
          Descargar Excel
        </a>
      </nav>

      {charges.length > 0 && (
        <table className="mb-8 text-sm">
          <caption className="sr-only">Totales del mes por estado</caption>
          <tbody className="[&_td]:py-1 [&_td]:pr-8 [&_th]:py-1 [&_th]:pr-8 [&_th]:text-left [&_th]:font-normal">
            {ORDER.map((status) => {
              const group = charges.filter((c) => c.status === status);
              if (group.length === 0) return null;
              return (
                <tr key={status}>
                  <th scope="row" className={status === 'void' ? 'text-muted-foreground' : ''}>
                    {CHARGE_STATUSES[status]}
                  </th>
                  <td className="tabular-nums text-muted-foreground">{group.length}</td>
                  {currencies.map((cur) => (
                    <td key={cur} className={`text-right tabular-nums ${status === 'void' ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                      {formatMoney(group.filter((c) => c.currency === cur).reduce((s, c) => s + c.gross, 0), cur)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {isPlatformManager(role) && (
        <section aria-labelledby="generar" className="mb-8 max-w-3xl rounded-lg border px-4 py-4">
          <h2 id="generar" className="font-semibold">
            {charges.length ? 'Volver a generar' : 'Generar los cobros'} de {monthName(month)}
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Calcula cada negocio con su plan por días, la prueba, los días suspendidos y las sucursales adicionales. Rehace los que están por
            facturar (conserva sus ajustes) y no toca los ya facturados.
          </p>
          <ActionForm action={generateChargesAction} aria-label="Generar cobros">
            <input type="hidden" name="month" value={month} />
            <SubmitButton size="sm">{charges.length ? 'Volver a generar' : 'Generar cobros'}</SubmitButton>
          </ActionForm>
        </section>
      )}

      {missingProfile > 0 && (
        <p className="mb-4 max-w-3xl text-sm text-access-pending">
          {missingProfile} {missingProfile === 1 ? 'cobro no se puede' : 'cobros no se pueden'} facturar todavía: falta que el negocio complete sus
          datos de facturación.
        </p>
      )}

      {charges.length === 0 ? (
        <EmptyState>Aún no hay cobros de {monthName(month)}.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="[&_th]:border-b [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
                <th>Negocio</th>
                <th>Estado</th>
                <th>Folio</th>
                <th>Vence</th>
                <th className="text-right">Neto</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:py-2.5 [&_td]:pr-4">
              {charges.map((c) => (
                <tr key={c.id} className={c.status === 'void' ? 'text-muted-foreground' : ''}>
                  <td>
                    <Link href={`/admin/cobros/${c.id}`} className="font-medium hover:underline">
                      {c.businessName}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{c.billTo?.legalName ?? c.profile?.legalName ?? 'Sin datos de facturación'}</span>
                  </td>
                  <td>
                    <ChargeStatusBadge status={c.status} dueOn={c.dueOn} today={alerts.today} />
                  </td>
                  <td className="tabular-nums">{c.folio ?? ''}</td>
                  <td className="tabular-nums">{c.status === 'paid' && c.paidOn ? `Pagado ${day(c.paidOn)}` : c.dueOn ? day(c.dueOn) : ''}</td>
                  <td className="text-right tabular-nums">{formatMoney(c.net, c.currency)}</td>
                  <td className="text-right font-medium tabular-nums">{formatMoney(c.gross, c.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {charges.length > 0 && withoutCharge.length > 0 && (
        <section aria-labelledby="sin-cobro" className="mt-10 max-w-3xl">
          <h2 id="sin-cobro" className="mb-1 font-semibold">
            Sin cobro este mes
          </h2>
          <p className="mb-2 text-sm text-muted-foreground">Plan free, todo el mes en prueba o suspendido, o un plan sin precio.</p>
          <ul className="text-sm">
            {withoutCharge.map((b) => (
              <li key={b.businessId} className="border-b py-1.5">
                <Link href={`/admin/negocios/${b.businessId}/plan`} className="hover:underline">
                  {b.businessName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
