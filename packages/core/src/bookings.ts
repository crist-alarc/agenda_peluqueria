/**
 * Reglas de reservas (directrices, sección 9): estados, transiciones,
 * política de cancelación y totales en CLP enteros.
 */
import type { Role } from './roles';

export const BOOKING_STATUSES = ['pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_CHANNELS = ['public_link', 'reception', 'seller', 'partner', 'reseller'] as const;
export type BookingChannel = (typeof BOOKING_CHANNELS)[number];

/** pending → confirmed → checked_in → in_progress → completed; además cancelled y no_show. */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'completed', 'cancelled', 'no_show'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: BookingStatus): readonly BookingStatus[] {
  return TRANSITIONS[from];
}

/** Estados en que la reserva ocupa recursos. */
export function isActiveStatus(status: BookingStatus): boolean {
  return status !== 'cancelled' && status !== 'no_show';
}

/** Roles que pueden crear y gestionar reservas desde el panel (recepción). */
export const RECEPTION_ROLES: readonly Role[] = ['owner', 'admin', 'branch_admin', 'receptionist'];

/**
 * ¿El cliente todavía puede cancelar? (política configurable por negocio,
 * ej. hasta 4 h antes). El negocio siempre puede cancelar desde el panel.
 */
export function customerCanCancel(startsAt: string, now: string, cancellationHours: number): boolean {
  return Date.parse(startsAt) - Date.parse(now) >= cancellationHours * 3_600_000;
}

export type PricedLine = { priceClp: number; quantity?: number };

/** Total en CLP enteros. */
export function bookingTotal(lines: readonly PricedLine[]): number {
  return lines.reduce((sum, l) => {
    const qty = l.quantity ?? 1;
    if (!Number.isSafeInteger(l.priceClp) || !Number.isSafeInteger(qty)) {
      throw new Error('Los montos y cantidades deben ser enteros');
    }
    return sum + l.priceClp * qty;
  }, 0);
}

/** Normaliza un teléfono chileno para buscar clientes ("+56 9 1234 5678" → "+56912345678"). */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (/^9\d{8}$/.test(digits)) return `+56${digits}`;
  if (/^569\d{8}$/.test(digits)) return `+${digits}`;
  return digits;
}
