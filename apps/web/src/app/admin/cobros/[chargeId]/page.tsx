import { BILLING_DOCUMENTS, formatMoney, formatRate, formatRut, isPlatformManager, moneyInputHint, type BillingDocument } from '@agenda/core';
import { getBillingAlerts, getCharge, getPaymentOptions, type ChargeDetail } from '@agenda/db';
import { Button, Field, Input, PageHeader, Select } from '@agenda/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { ChargeStatusBadge } from '@/components/charge-status';
import { requirePlatformAdmin } from '@/lib/session';
import { addAdjustmentAction, invoiceChargeAction, payChargeAction, removeAdjustmentAction, voidChargeAction } from '../../charge-actions';

export const metadata = { title: 'Cobro' };

const monthName = (m: string) => new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
const day = (d: string) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const longDay = (d: string) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

/** Un cobro: detalle por días y lo que se puede hacer según su estado (ADR 0011). */
export default async function ChargePage({ params }: { params: Promise<{ chargeId: string }> }) {
  const { chargeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(chargeId)) notFound();
  const { db, role } = await requirePlatformAdmin();
  const [c, alerts, options] = await Promise.all([getCharge(db, chargeId), getBillingAlerts(db), getPaymentOptions(db)]);
  if (!c) notFound();
  const manager = isPlatformManager(role);

  return (
    <>
      <Link href={`/admin/cobros?mes=${c.month}`} className="text-sm text-muted-foreground hover:underline">
        Cobros de {monthName(c.month)}
      </Link>
      <PageHeader title={c.businessName} description={`Cobro de ${monthName(c.month)}`} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <ChargeStatusBadge status={c.status} dueOn={c.dueOn} today={alerts.today} />
        <Link href={`/admin/negocios/${c.businessId}/plan`} className="text-sm hover:underline">
          Ver la ficha del negocio
        </Link>
      </div>

      <div className="grid max-w-5xl gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          <Lines c={c} manager={manager} />
          <Document c={c} />
        </div>
        {manager && (
          <aside className="space-y-8">
            {c.status === 'pending' && <Adjust c={c} />}
            {c.status === 'pending' && <Invoice c={c} today={alerts.today} />}
            {c.status === 'invoiced' && <Pay c={c} today={alerts.today} methods={options.methods.filter((m) => m.active).map((m) => m.name)} />}
            {c.status !== 'void' && <Void c={c} />}
          </aside>
        )}
      </div>
    </>
  );
}

function Lines({ c, manager }: { c: ChargeDetail; manager: boolean }) {
  return (
    <section aria-labelledby="detalle">
      <h2 id="detalle" className="mb-3 text-lg font-semibold">
        Detalle
      </h2>
      <table className="w-full text-sm">
        <tbody className="[&_td]:border-b [&_td]:py-2 [&_td]:pr-4">
          {c.lines.map((l) => (
            <tr key={l.id} className={l.kind === 'trial' || l.kind === 'suspended' ? 'text-muted-foreground' : ''}>
              <td>
                {l.label}
                {l.kind === 'trial' && ' (sin cobro)'}
                {l.kind === 'suspended' && ' (sin cobro)'}
              </td>
              <td className="tabular-nums text-muted-foreground">
                {l.kind === 'extra_branches' && l.quantity !== null
                  ? `${l.quantity} ${l.quantity === 1 ? 'día' : 'días'}-sucursal, del ${day(l.from!)} al ${day(l.to!)}`
                  : l.from && l.to
                    ? `${day(l.from)} al ${day(l.to)}, ${l.days} ${l.days === 1 ? 'día' : 'días'}`
                    : 'Ajuste'}
              </td>
              <td className="text-right tabular-nums">{formatMoney(l.net, c.currency)}</td>
              <td className="w-16 text-right">
                {manager && l.kind === 'adjustment' && c.status === 'pending' && (
                  <ActionForm action={removeAdjustmentAction}>
                    <input type="hidden" name="lineId" value={l.id} />
                    <Button variant="ghost" size="xs">
                      Quitar
                    </Button>
                  </ActionForm>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="[&_td]:py-1.5 [&_td]:pr-4">
          <tr>
            <td colSpan={2}>Neto</td>
            <td className="text-right tabular-nums">{formatMoney(c.net, c.currency)}</td>
          </tr>
          <tr>
            <td colSpan={2}>{c.taxRateBp > 0 ? `IVA ${formatRate(c.taxRateBp)}` : 'Impuesto (exento)'}</td>
            <td className="text-right tabular-nums">{formatMoney(c.tax, c.currency)}</td>
          </tr>
          <tr className="text-base font-semibold">
            <td colSpan={2}>Total</td>
            <td className="text-right tabular-nums">{formatMoney(c.gross, c.currency)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function Document({ c }: { c: ChargeDetail }) {
  const who = c.billTo;
  return (
    <section aria-labelledby="documento">
      <h2 id="documento" className="mb-3 text-lg font-semibold">
        Documento
      </h2>
      {c.status === 'pending' ? (
        <p className="text-sm text-muted-foreground">
          {c.hasProfile
            ? `Al facturar se copian los datos de facturación del negocio y sus condiciones: ${c.payment.termName ?? 'plazo por defecto'}, ${c.payment.methodName ?? 'forma de pago por defecto'}.`
            : 'El negocio todavía no completa sus datos de facturación: no se puede facturar.'}
        </p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {c.documentType && (
            <>
              <dt className="text-muted-foreground">Documento</dt>
              <dd>
                {BILLING_DOCUMENTS[c.documentType as BillingDocument] ?? c.documentType}, folio {c.folio}
              </dd>
            </>
          )}
          {c.issuedOn && (
            <>
              <dt className="text-muted-foreground">Emitido</dt>
              <dd>{longDay(c.issuedOn)}</dd>
            </>
          )}
          {c.dueOn && (
            <>
              <dt className="text-muted-foreground">Vence</dt>
              <dd>
                {longDay(c.dueOn)} ({c.paymentTermName})
              </dd>
            </>
          )}
          {who && (
            <>
              <dt className="text-muted-foreground">A nombre de</dt>
              <dd>
                {who.legalName}
                {who.taxId && `, ${who.country === 'CL' ? formatRut(who.taxId) : who.taxId}`}
              </dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{who.email}</dd>
            </>
          )}
          {c.paidOn && (
            <>
              <dt className="text-muted-foreground">Pagado</dt>
              <dd>
                {longDay(c.paidOn)}, {c.paidMethod}
                {c.paymentNote ? `. ${c.paymentNote}` : ''}
              </dd>
            </>
          )}
          {c.status === 'void' && (
            <>
              <dt className="text-muted-foreground">Anulado</dt>
              <dd>
                {c.voidReason}
                {c.creditNoteFolio ? `. Nota de crédito ${c.creditNoteFolio}` : ''}
              </dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}

function Adjust({ c }: { c: ChargeDetail }) {
  return (
    <section aria-labelledby="ajuste">
      <h2 id="ajuste" className="mb-2 font-semibold">
        Ajuste
      </h2>
      <ActionForm action={addAdjustmentAction} className="space-y-3" resetOnSuccess aria-label="Ajuste">
        <input type="hidden" name="chargeId" value={c.id} />
        <input type="hidden" name="currency" value={c.currency} />
        <Field label="Tipo">
          <Select name="sign" defaultValue="discount">
            <option value="discount">Descuento</option>
            <option value="charge">Cargo</option>
          </Select>
        </Field>
        <Field label={`Monto neto en ${c.currency}`} hint={moneyInputHint(c.currency)}>
          <Input name="amount" inputMode="decimal" required />
        </Field>
        <Field label="Motivo">
          <Input name="label" required minLength={3} placeholder="Ej. Descuento de bienvenida" />
        </Field>
        <SubmitButton size="sm" variant="outline">
          Agregar ajuste
        </SubmitButton>
      </ActionForm>
    </section>
  );
}

function Invoice({ c, today }: { c: ChargeDetail; today: string }) {
  return (
    <section aria-labelledby="facturar">
      <h2 id="facturar" className="mb-1 font-semibold">
        Marcar como facturado
      </h2>
      <p className="mb-2 text-sm text-muted-foreground">Emite el documento en el portal del SII y anota aquí su folio. Después el monto no cambia.</p>
      <ActionForm action={invoiceChargeAction} className="space-y-3" aria-label="Facturar">
        <input type="hidden" name="chargeId" value={c.id} />
        <Field label="Folio del SII">
          <Input name="folio" required inputMode="numeric" disabled={!c.hasProfile} />
        </Field>
        <Field label="Fecha de emisión">
          <Input name="issuedOn" type="date" required max={today} defaultValue={today} disabled={!c.hasProfile} />
        </Field>
        <SubmitButton size="sm" disabled={!c.hasProfile}>
          Marcar como facturado
        </SubmitButton>
      </ActionForm>
    </section>
  );
}

function Pay({ c, today, methods }: { c: ChargeDetail; today: string; methods: string[] }) {
  return (
    <section aria-labelledby="pago">
      <h2 id="pago" className="mb-2 font-semibold">
        Registrar el pago
      </h2>
      <ActionForm action={payChargeAction} className="space-y-3" aria-label="Pago">
        <input type="hidden" name="chargeId" value={c.id} />
        <Field label="Fecha de pago">
          <Input name="paidOn" type="date" required max={today} defaultValue={today} />
        </Field>
        <Field label="Forma de pago">
          <Select name="method" defaultValue={c.paymentMethodName ?? methods[0]}>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nota" hint="Opcional. Ej. pagó en dos partes">
          <Input name="note" />
        </Field>
        <SubmitButton size="sm">Marcar como pagado</SubmitButton>
      </ActionForm>
    </section>
  );
}

function Void({ c }: { c: ChargeDetail }) {
  const issued = c.status !== 'pending';
  return (
    <section aria-labelledby="anular">
      <details>
        <summary id="anular" className="cursor-pointer font-semibold">
          Anular el cobro
        </summary>
        <ActionForm action={voidChargeAction} className="mt-3 space-y-3" confirm="¿Anular este cobro? No se puede deshacer." aria-label="Anular">
          <input type="hidden" name="chargeId" value={c.id} />
          <Field label="Motivo">
            <Input name="reason" required minLength={3} />
          </Field>
          {issued && (
            <Field label="Folio de la nota de crédito" hint="Emítela antes en el SII">
              <Input name="creditNoteFolio" required />
            </Field>
          )}
          <SubmitButton size="sm" variant="outline">
            Anular cobro
          </SubmitButton>
        </ActionForm>
      </details>
    </section>
  );
}
