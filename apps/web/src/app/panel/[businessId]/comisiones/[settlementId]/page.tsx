import { can, formatClp } from '@agenda/core';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@agenda/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePermission } from '@/lib/session';
import { loadSettlementReport } from '@/lib/settlement-report';
import { settlementStatusAction } from '../actions';

export const metadata = { title: 'Liquidación' };

const STATUS_VARIANT = { draft: 'outline', closed: 'secondary', paid: 'success' } as const;

export default async function SettlementPage({ params }: { params: Promise<{ businessId: string; settlementId: string }> }) {
  const { businessId, settlementId } = await params;
  const { db, business, membership } = await requirePermission(businessId, 'commissions.view');
  if (!/^[0-9a-f-]{36}$/i.test(settlementId)) notFound();
  const report = await loadSettlementReport(db, business, settlementId);
  if (!report) notFound();
  const manage = can(membership, 'commissions.manage');
  const s = report.settlement;
  const base = `/panel/${business.id}/comisiones/${s.id}`;

  const statusButton = (status: 'closed' | 'paid' | 'deleted', label: string, confirm: string, variant: 'default' | 'ghost' = 'default') => (
    <ActionForm action={settlementStatusAction} confirm={confirm}>
      <input type="hidden" name="businessId" value={business.id} />
      <input type="hidden" name="settlementId" value={s.id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </ActionForm>
  );

  return (
    <>
      <PageHeader
        title={`Liquidación ${report.periodLabel}`}
        description={`Total: ${formatClp(report.summary.totalClp)}`}
        actions={<Badge variant={STATUS_VARIANT[s.status as keyof typeof STATUS_VARIANT]}>{report.statusLabel}</Badge>}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href={`${base}/pdf`}>Descargar PDF</a>
        </Button>
        <Button asChild variant="outline">
          <a href={`${base}/excel`}>Descargar Excel</a>
        </Button>
        {manage && s.status === 'draft' &&
          statusButton('closed', 'Cerrar liquidación', 'Al cerrarla ya no se podrá modificar; las correcciones serán ajustes. ¿Cerrar?')}
        {manage && s.status === 'closed' && statusButton('paid', 'Marcar como pagada', '¿Confirmas que ya se pagó?')}
        {manage && s.status === 'draft' &&
          statusButton('deleted', 'Borrar borrador', 'Los movimientos vuelven a quedar pendientes. ¿Borrar?', 'ghost')}
      </div>

      <div className="space-y-4">
        {report.summary.people.map((p) => (
          <Card key={p.professionalId} role="region" aria-label={`Comisiones de ${p.name}`}>
            <CardHeader className="flex flex-row items-baseline justify-between gap-2">
              <CardTitle>{p.name}</CardTitle>
              <span className="text-lg font-semibold tabular-nums">{formatClp(p.totalClp)}</span>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-sm text-muted-foreground">
                {p.count} {p.count === 1 ? 'servicio' : 'servicios'}: {formatClp(p.servicesClp)}
                {p.adjustmentsClp !== 0 && ` · ajustes: ${formatClp(p.adjustmentsClp)}`}
              </p>
              <ul className="divide-y text-sm">
                {report.lines
                  .filter((l) => l.professionalId === p.professionalId)
                  .map((l, i) => (
                    <li key={i} className="flex justify-between gap-2 py-1.5">
                      <span className="min-w-0">
                        {l.kind === 'adjustment' ? `Ajuste · ${l.note}` : `${l.date} ${l.time} · ${l.service}`}
                        {l.kind === 'service' && (
                          <span className="block text-xs text-muted-foreground">
                            {[l.customer, `base ${formatClp(l.baseClp)}`, l.share !== '100%' ? `parte ${l.share}` : '', l.rule].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums">{formatClp(l.amountClp)}</span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        ))}
        {report.summary.people.length === 0 && <p className="text-sm text-muted-foreground">Sin movimientos en este período.</p>}
      </div>
      <p className="mt-6 text-sm">
        <Link href={`/panel/${business.id}/comisiones`} className="underline">
          Volver a comisiones
        </Link>
      </p>
    </>
  );
}
