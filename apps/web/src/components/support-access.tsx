import { remainingLabel, supportAccessState, type SupportAccessState } from '@agenda/core';
import { cn } from '@agenda/ui';

const TEXT: Record<SupportAccessState, string> = {
  none: 'Sin acceso',
  pending: 'Esperando aprobación',
  active: 'Acceso vigente',
  expired: 'Acceso vencido',
  rejected: 'Solicitud rechazada',
  revoked: 'Acceso revocado',
  cancelled: 'Solicitud cancelada',
};

const TONE: Record<SupportAccessState, string> = {
  none: 'text-access-none',
  pending: 'text-access-pending',
  active: 'text-access-active',
  expired: 'text-access-none',
  rejected: 'text-access-none',
  revoked: 'text-access-none',
  cancelled: 'text-access-none',
};

/**
 * Indicador del acceso de soporte (ADR 0008): dice siempre si se puede mirar la
 * configuración del negocio y por cuánto tiempo más.
 */
export function SupportAccess({
  request,
  now,
  className,
}: {
  request: { status: string; expiresAt: string | null } | null;
  now: string;
  className?: string;
}) {
  const state = supportAccessState(request, now);
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm font-medium', TONE[state], className)}>
      <span
        aria-hidden
        className={cn('size-2 rounded-full bg-current', state === 'pending' && 'ring-4 ring-current/20')}
      />
      {TEXT[state]}
      {state === 'active' && request?.expiresAt && (
        <span className="font-normal text-muted-foreground">, quedan {remainingLabel(request.expiresAt, now)}</span>
      )}
    </span>
  );
}

export { supportAccessState };
