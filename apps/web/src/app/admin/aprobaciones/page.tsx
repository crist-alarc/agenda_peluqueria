import { BILLING_CURRENCY_CODES, comparePlanVersions, FEATURE_LABELS, formatMoney, type Feature } from '@agenda/core';
import { listApprovals, type PendingFreePlan, type PendingPlanVersion } from '@agenda/db';
import { EmptyState, Input, PageHeader } from '@agenda/ui';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePlatformAdmin } from '@/lib/session';
import { decideFreePlanAction, decidePlanVersionAction } from '../approval-actions';

export const metadata = { title: 'Aprobaciones' };

const date = (iso: string) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(iso));
const day = (d: string) => new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

/**
 * Lo que espera una decisión (ADR 0010): planes nuevos y cambios de planes (los aprueba el dueño de
 * la plataforma) y planes free (los autoriza un administrador que no los haya pedido).
 */
export default async function ApprovalsPage() {
  const { db, role } = await requirePlatformAdmin();
  const { planVersions, freePlans } = await listApprovals(db);

  return (
    <>
      <PageHeader title="Aprobaciones" description="Nada de esto aplica hasta que alguien con permiso lo decida." />

      <section aria-labelledby="planes" className="mb-12 max-w-4xl">
        <h2 id="planes" className="mb-1 text-lg font-semibold">
          Planes y cambios de precio
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {role === 'owner' ? 'Los apruebas tú.' : 'Los aprueba el dueño de la plataforma.'} Al aprobar, aplica a quienes contraten desde ese
          momento; quienes ya tienen el plan conservan su versión.
        </p>
        {planVersions.length === 0 ? (
          <EmptyState>No hay planes por aprobar.</EmptyState>
        ) : (
          <ul className="divide-y border-y">
            {planVersions.map((v) => (
              <PlanVersionItem key={v.id} v={v} canDecide={role === 'owner'} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="free" className="max-w-4xl">
        <h2 id="free" className="mb-1 text-lg font-semibold">
          Planes free
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">Los autoriza un administrador distinto de quien los pidió.</p>
        {freePlans.length === 0 ? (
          <EmptyState>No hay planes free por autorizar.</EmptyState>
        ) : (
          <ul className="divide-y border-y">
            {freePlans.map((f) => (
              <FreePlanItem key={f.id} f={f} canDecide={role !== 'agent' && !f.isMine} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function PlanVersionItem({ v, canDecide }: { v: PendingPlanVersion; canDecide: boolean }) {
  const changes =
    v.currentFeatures && v.currentPrices
      ? comparePlanVersions(
          {
            features: v.currentFeatures,
            prices: v.currentPrices,
            includedBranches: v.currentIncludedBranches ?? 1,
            extraBranchPrices: v.currentExtraBranchPrices ?? {},
          },
          { features: v.features, prices: v.prices, includedBranches: v.includedBranches, extraBranchPrices: v.extraBranchPrices },
        )
      : null;
  const prices = BILLING_CURRENCY_CODES.filter((c) => v.prices[c] !== undefined || v.currentPrices?.[c] !== undefined);
  return (
    <li className="grid gap-4 py-5 md:grid-cols-[1fr_16rem]">
      <div className="text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/admin/planes/${v.planCode}`} className="text-base font-semibold hover:underline">
            {v.planName}
          </Link>
          <span className="text-muted-foreground">{v.isNewPlan ? 'Plan nuevo' : `Versión ${v.version}`}</span>
        </p>
        <p className="text-muted-foreground">
          Propuesto por {v.createdBy ?? 'alguien del equipo'} el {date(v.createdAt)}
          {v.note ? `: ${v.note}` : ''}
        </p>

        <table className="mt-3 text-sm">
          <tbody className="[&_td]:py-0.5 [&_td]:pr-6 [&_th]:py-0.5 [&_th]:pr-6 [&_th]:text-left [&_th]:font-normal [&_th]:text-muted-foreground">
            {prices.map((c) => {
              const before = v.currentPrices?.[c];
              const after = v.prices[c];
              return (
                <tr key={c}>
                  <th scope="row">Precio neto {c}</th>
                  {!v.isNewPlan && <td className="tabular-nums text-muted-foreground line-through decoration-1">{before === undefined ? 'Sin precio' : formatMoney(before, c)}</td>}
                  <td className="tabular-nums font-medium">{after === undefined ? 'Sin precio' : formatMoney(after, c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {(v.trialDays > 0 || (v.currentTrialDays ?? 0) > 0) && v.trialDays !== v.currentTrialDays && (
          <p className="mt-2">
            Prueba para negocios nuevos: {v.trialDays > 0 ? `${v.trialDays} días` : 'sin prueba'}
            {v.currentTrialDays != null && ` (antes ${v.currentTrialDays > 0 ? `${v.currentTrialDays} días` : 'sin prueba'})`}
          </p>
        )}
        {changes ? (
          (changes.better.length > 0 || changes.worse.length > 0) && (
            <ul className="mt-2 space-y-0.5">
              {changes.better.map((x) => (
                <li key={x} className="text-access-active">
                  Mejora: {x}
                </li>
              ))}
              {changes.worse.map((x) => (
                <li key={x} className="text-access-pending">
                  Empeora: {x}
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="mt-2 text-muted-foreground">
            Incluye:{' '}
            {v.features
              .filter((f) => f.enabled)
              .map((f) => `${FEATURE_LABELS[f.feature as Feature] ?? f.feature}${f.limit === null ? '' : ` (hasta ${f.limit})`}`)
              .join(', ') || 'ninguna función'}
          </p>
        )}
      </div>
      {canDecide ? <Decision action={decidePlanVersionAction} idName="versionId" id={v.id} withNote /> : <Waiting />}
    </li>
  );
}

function FreePlanItem({ f, canDecide }: { f: PendingFreePlan; canDecide: boolean }) {
  return (
    <li className="grid gap-4 py-5 md:grid-cols-[1fr_16rem]">
      <div className="text-sm">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/admin/negocios/${f.businessId}/plan`} className="text-base font-semibold hover:underline">
            {f.businessName}
          </Link>
          <span className="text-muted-foreground">al plan {f.planName}</span>
        </p>
        <p className="mt-1">{f.endsOn ? `Hasta el ${day(f.endsOn)}; después pasa a ${f.nextPlanName}.` : 'Sin fecha de término.'}</p>
        <p className="text-muted-foreground">
          Motivo: {f.reason}. Lo pidió {f.isMine ? 'tú' : (f.requestedBy ?? 'alguien del equipo')} el {date(f.createdAt)}.
        </p>
      </div>
      {canDecide ? (
        <Decision action={decideFreePlanAction} idName="grantId" id={f.id} />
      ) : (
        <Waiting text={f.isMine ? 'Otra persona del equipo debe autorizarlo.' : undefined} />
      )}
    </li>
  );
}

function Decision({
  action,
  idName,
  id,
  withNote = false,
}: {
  action: Parameters<typeof ActionForm>[0]['action'];
  idName: string;
  id: string;
  withNote?: boolean;
}) {
  return (
    <ActionForm action={action} className="flex flex-col gap-2 md:items-stretch">
      <input type="hidden" name={idName} value={id} />
      {withNote && <Input name="note" placeholder="Nota (opcional)" aria-label="Nota de la decisión" />}
      <div className="flex gap-2">
        <SubmitButton name="decision" value="approve" size="sm" className="flex-1">
          Aprobar
        </SubmitButton>
        <SubmitButton name="decision" value="reject" size="sm" variant="outline" className="flex-1">
          Rechazar
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function Waiting({ text = 'Esperando a quien puede decidirlo.' }: { text?: string }) {
  return <p className="text-sm text-muted-foreground md:text-right">{text}</p>;
}
