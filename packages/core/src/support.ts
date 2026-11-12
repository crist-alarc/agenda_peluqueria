/**
 * Acceso de soporte de la plataforma (ADR 0008). El negocio aprueba por cuánto
 * tiempo; aquí solo se interpreta el estado para mostrarlo.
 */
import { z } from 'zod';

/** Opciones de duración que se ofrecen al pedir y al aprobar (horas). La base acepta de 1 a 168. */
export const SUPPORT_DURATIONS = [
  { hours: 1, label: '1 hora' },
  { hours: 4, label: '4 horas' },
  { hours: 24, label: '1 día' },
  { hours: 72, label: '3 días' },
  { hours: 168, label: '7 días' },
] as const;

export type SupportRequestStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'cancelled';

/** Estado visible de una solicitud: una aprobada puede estar vigente o vencida. */
export type SupportAccessState = 'pending' | 'active' | 'expired' | 'rejected' | 'revoked' | 'cancelled' | 'none';

export function supportAccessState(
  request: { status: SupportRequestStatus | string; expiresAt: string | null } | null | undefined,
  now: string,
): SupportAccessState {
  if (!request) return 'none';
  if (request.status === 'approved') {
    return request.expiresAt && Date.parse(request.expiresAt) > Date.parse(now) ? 'active' : 'expired';
  }
  return request.status as SupportAccessState;
}

/** Tiempo que le queda a un acceso, en palabras simples ("3 h 20 min", "menos de 1 min"). */
export function remainingLabel(expiresAt: string, now: string): string {
  const minutes = Math.floor((Date.parse(expiresAt) - Date.parse(now)) / 60_000);
  if (minutes < 1) return 'menos de 1 min';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
  return `${mins} min`;
}

const hours = z.coerce
  .number({ message: 'Elige la duración' })
  .int()
  .min(1, 'El acceso dura al menos 1 hora')
  .max(168, 'El acceso dura como máximo 7 días');

export const supportRequestSchema = z.object({
  businessId: z.uuid(),
  reason: z.string({ message: 'Explica para qué necesitas el acceso' }).trim().min(5, 'Explica para qué necesitas el acceso').max(500),
  hours,
});

export const supportDecisionSchema = z.object({
  businessId: z.uuid(),
  requestId: z.uuid(),
  decision: z.enum(['approve', 'reject']),
  hours: hours.optional(),
});
