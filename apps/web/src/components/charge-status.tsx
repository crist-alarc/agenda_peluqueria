import { CHARGE_STATUSES, overdueDays, type ChargeStatus } from '@agenda/core';
import { Badge } from '@agenda/ui';

/** Estado de un cobro; si está facturado y vencido, muestra los días de atraso (ADR 0011). */
export function ChargeStatusBadge({ status, dueOn, today }: { status: ChargeStatus; dueOn?: string | null; today: string }) {
  const late = status === 'invoiced' && dueOn ? overdueDays(dueOn, today) : 0;
  if (late > 0) return <Badge variant="warning">Vencido hace {late} {late === 1 ? 'día' : 'días'}</Badge>;
  const variant = status === 'paid' ? 'success' : status === 'void' ? 'muted' : status === 'invoiced' ? 'secondary' : 'outline';
  return (
    <Badge variant={variant} className={status === 'pending' ? 'border-access-pending/60 text-access-pending' : undefined}>
      {CHARGE_STATUSES[status]}
    </Badge>
  );
}
