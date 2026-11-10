import 'server-only';
import {
  BookingRequestError,
  checkSlot,
  buildAvailabilityInput,
  dayRange,
  findSlots,
  localTime,
  type BookingContext,
  type SlotQuery,
} from '@agenda/core';
import { createBooking, DbError, getBookingContext, type DbClient, type NewBooking } from '@agenda/db';

/**
 * Lógica de reservas en el servidor (principio 3): el navegador solo elige;
 * aquí se calculan los horarios con el motor de @agenda/core y se vuelve a
 * verificar el horario justo antes de guardar.
 */

export type SlotOption = { startsAt: string; label: string; endsAt: string };

type Options = { ignoreMinAdvance?: boolean; now?: string };

async function loadContext(db: DbClient, q: SlotQuery, timeZone: string): Promise<BookingContext> {
  const range = dayRange(q.date, timeZone);
  return getBookingContext(db, { businessId: q.businessId, branchId: q.branchId, ...range });
}

function toInput(ctx: BookingContext, q: SlotQuery, opts: Options) {
  try {
    return buildAvailabilityInput(ctx, {
      date: q.date,
      serviceIds: q.serviceIds,
      preferredPersonId: q.preferredPersonId ?? null,
      addons: q.addons,
      now: opts.now ?? new Date().toISOString(),
      ignoreMinAdvance: opts.ignoreMinAdvance,
    });
  } catch (error) {
    if (error instanceof BookingRequestError) throw new DbError(error.message);
    throw error;
  }
}

/** Horarios disponibles del día, listos para mostrar. */
export async function availableSlots(db: DbClient, q: SlotQuery, timeZone: string, opts: Options = {}): Promise<SlotOption[]> {
  const ctx = await loadContext(db, q, timeZone);
  return findSlots(toInput(ctx, q, opts)).map((s) => ({
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    label: localTime(s.startsAt, ctx.business.timezone),
  }));
}

/**
 * Recalcula el horario elegido y crea la reserva. `readDb` lee la
 * disponibilidad; `writeDb` guarda (sesión de recepción o cliente de servicio).
 */
export async function bookSlot(
  readDb: DbClient,
  writeDb: DbClient,
  q: SlotQuery & { startsAt: string },
  customer: NewBooking['customer'],
  notes: string | null,
  timeZone: string,
  opts: Options = {},
): Promise<{ bookingId: string; startsAt: string; endsAt: string }> {
  const ctx = await loadContext(readDb, q, timeZone);
  const slot = checkSlot(toInput(ctx, q, opts), q.startsAt);
  if (!slot) throw new DbError('Ese horario ya no está disponible. Elige otro.');

  const bookingId = await createBooking(writeDb, {
    businessId: q.businessId,
    branchId: q.branchId,
    customer,
    items: slot.items.map((i) => ({ service_id: i.serviceId, starts_at: i.startsAt, resource_ids: i.resourceIds })),
    addons: q.addons.map((a) => ({ addon_id: a.addonId, quantity: a.quantity })),
    notes,
  });
  return { bookingId, startsAt: slot.startsAt, endsAt: slot.endsAt };
}
