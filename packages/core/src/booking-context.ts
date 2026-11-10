/**
 * Convierte los datos del negocio (tal como los entrega la base con
 * app_booking_context) en la entrada del motor de disponibilidad, y ofrece
 * utilidades de fechas locales para elegir días.
 */
import type { AvailabilityInput, Requirement, ResourceType, Slot } from './availability';
import { findSlots } from './availability';
import { utcToZonedLocal, zonedLocalToUtc } from './time';

export type ContextService = {
  id: string;
  name: string;
  description: string | null;
  priceClp: number;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  requirements: Requirement[];
};

export type ContextResource = {
  id: string;
  type: ResourceType;
  name: string;
  skills: string[];
  professionalId: string | null;
  hours: Array<{ weekday: number; start: string; end: string }>;
};

export type ContextAddon = {
  id: string;
  name: string;
  priceClp: number;
  stock: number;
  usage: Array<{ startsAt: string; endsAt: string; quantity: number }>;
};

/** Forma del JSON que devuelve app_booking_context. */
export type BookingContext = {
  business: {
    id: string;
    name: string;
    timezone: string;
    slot_interval_minutes: number;
    min_advance_minutes: number;
    max_advance_days: number;
    cancellation_hours: number;
  };
  branch_hours: Array<{ weekday: number; start: string; end: string }>;
  branch_blocks: Array<{ startsAt: string; endsAt: string }>;
  holidays: string[];
  resources: ContextResource[];
  resource_blocks: Array<{ resourceId: string; startsAt: string; endsAt: string }>;
  busy: Array<{ resourceId: string | null; professionalId: string | null; startsAt: string; endsAt: string }>;
  services: ContextService[];
  addons: ContextAddon[];
};

export type SlotRequest = {
  date: string;
  serviceIds: readonly string[];
  preferredPersonId?: string | null;
  addons?: ReadonlyArray<{ addonId: string; quantity: number }>;
  now: string;
  /** Recepción puede saltarse la anticipación mínima del link público. */
  ignoreMinAdvance?: boolean;
};

export class BookingRequestError extends Error {}

export function buildAvailabilityInput(ctx: BookingContext, req: SlotRequest): AvailabilityInput {
  const services = req.serviceIds.map((id) => {
    const s = ctx.services.find((x) => x.id === id);
    if (!s) throw new BookingRequestError('Uno de los servicios ya no está disponible');
    return s;
  });
  if (services.length === 0) throw new BookingRequestError('Elige al menos un servicio');

  const addons = (req.addons ?? []).map((a) => {
    const found = ctx.addons.find((x) => x.id === a.addonId);
    if (!found) throw new BookingRequestError('Uno de los adicionales ya no está disponible');
    return { addonId: found.id, quantity: a.quantity, stock: found.stock, usage: found.usage };
  });

  return {
    timeZone: ctx.business.timezone,
    date: req.date,
    now: req.now,
    slotIntervalMinutes: ctx.business.slot_interval_minutes,
    minAdvanceMinutes: req.ignoreMinAdvance ? 0 : ctx.business.min_advance_minutes,
    maxAdvanceDays: ctx.business.max_advance_days,
    branchHours: ctx.branch_hours,
    holidays: ctx.holidays,
    branchBlocks: ctx.branch_blocks,
    resources: ctx.resources,
    resourceBlocks: ctx.resource_blocks,
    busy: ctx.busy,
    services,
    preferredPersonId: req.preferredPersonId ?? null,
    addons,
  };
}

export function slotsForRequest(ctx: BookingContext, req: SlotRequest): Slot[] {
  return findSlots(buildAvailabilityInput(ctx, req));
}

/** Rango UTC que cubre el día local completo (con margen para holguras). */
export function dayRange(date: string, timeZone: string): { from: string; to: string } {
  const start = Date.parse(zonedLocalToUtc(`${date}T00:00`, timeZone));
  return { from: new Date(start - 12 * 3_600_000).toISOString(), to: new Date(start + 36 * 3_600_000).toISOString() };
}

/** Fecha local (YYYY-MM-DD) de un instante en la zona del negocio. */
export function localDate(iso: string, timeZone: string): string {
  return utcToZonedLocal(iso, timeZone).slice(0, 10);
}

/** Hora local (HH:MM) de un instante en la zona del negocio. */
export function localTime(iso: string, timeZone: string): string {
  return utcToZonedLocal(iso, timeZone).slice(11, 16);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Próximos `count` días locales empezando hoy. */
export function upcomingDates(now: string, timeZone: string, count: number): string[] {
  const today = localDate(now, timeZone);
  return Array.from({ length: count }, (_, i) => addDays(today, i));
}

export const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
