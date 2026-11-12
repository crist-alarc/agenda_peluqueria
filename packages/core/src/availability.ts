/**
 * Motor de disponibilidad (directrices, sección 10). Funciones puras: reciben
 * todos los datos ya cargados y devuelven los horarios posibles con los
 * recursos asignados. Se ejecuta en el servidor; la base de datos impide igual
 * la doble reserva con restricciones de exclusión (garantía final).
 *
 * Reglas:
 * - El tiempo de atención de cada servicio debe caer dentro del horario de la
 *   sucursal y del horario del recurso (si el recurso no tiene horario propio,
 *   usa el de la sucursal).
 * - La ocupación incluye las holguras (antes/después) y no puede chocar con
 *   bloqueos ni con otras ocupaciones del recurso o del profesional, incluidas
 *   las de otros negocios donde trabaja.
 * - Varios servicios se encadenan: cada uno empieza cuando termina el anterior.
 * - Los feriados cierran la sucursal.
 * - Las horas se generan en la zona horaria del negocio y se devuelven en UTC.
 *
 * Modo arriendo (`parallel`, fase 3, ADR 0007):
 * - Los servicios no se encadenan: todos son parte del mismo evento y empiezan
 *   a la hora elegida (ej. castillo + toro mecánico en el mismo cumpleaños).
 * - Un servicio de día completo (`fullDay`) ocupa su recurso todo el día local
 *   del evento, aunque se entregue en la tarde. Sus holguras no aplican.
 */
import { timeToMinutes, zonedLocalToUtc } from './time';

export type ResourceType = 'person' | 'space' | 'equipment';

export type HoursRange = { weekday: number; start: string; end: string };
export type TimeBlock = { startsAt: string; endsAt: string };

export type AvailabilityResource = {
  id: string;
  type: ResourceType;
  skills: readonly string[];
  professionalId: string | null;
  /** Vacío = usa el horario de la sucursal. */
  hours: readonly HoursRange[];
};

export type Requirement = { resourceType: ResourceType; quantity: number; requiredSkill: string | null };

export type ServiceSpec = {
  id: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  requirements: readonly Requirement[];
  /** Arriendo por día completo (solo en modo `parallel`). */
  fullDay?: boolean;
};

/** Ocupación existente: de un recurso de este negocio o de un profesional en cualquier negocio. */
export type BusyBlock = TimeBlock & { resourceId?: string | null; professionalId?: string | null };

export type AddonRequest = {
  addonId: string;
  quantity: number;
  /** Unidades disponibles a la vez en la sucursal. */
  stock: number;
  /** Unidades ya reservadas, con su horario. */
  usage: ReadonlyArray<TimeBlock & { quantity: number }>;
};

export type AvailabilityInput = {
  timeZone: string;
  /** Fecha local del negocio, YYYY-MM-DD. */
  date: string;
  /** Instante actual (ISO). */
  now: string;
  slotIntervalMinutes: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  branchHours: readonly HoursRange[];
  holidays: readonly string[];
  branchBlocks: readonly TimeBlock[];
  resources: readonly AvailabilityResource[];
  resourceBlocks: ReadonlyArray<TimeBlock & { resourceId: string }>;
  busy: readonly BusyBlock[];
  /** Servicios en el orden en que se atienden. */
  services: readonly ServiceSpec[];
  /** Persona elegida por el cliente (id de recurso). null = cualquiera. */
  preferredPersonId?: string | null;
  addons?: readonly AddonRequest[];
  /** Modo arriendo: los servicios ocurren a la vez, en el mismo evento. */
  parallel?: boolean;
};

export type SlotItem = {
  serviceId: string;
  startsAt: string;
  endsAt: string;
  /** Ocupación con holguras. */
  occupiedFrom: string;
  occupiedTo: string;
  resourceIds: string[];
};

export type Slot = { startsAt: string; endsAt: string; items: SlotItem[] };

type Interval = { start: number; end: number };

const MINUTE = 60_000;
const DAY = 86_400_000;

function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function toIntervals(hours: readonly HoursRange[], date: string, timeZone: string): Interval[] {
  const weekday = weekdayOf(date);
  return hours
    .filter((h) => h.weekday === weekday)
    .map((h) => ({
      start: Date.parse(zonedLocalToUtc(`${date}T${h.start.slice(0, 5)}`, timeZone)),
      end: Date.parse(zonedLocalToUtc(`${date}T${h.end.slice(0, 5)}`, timeZone)),
    }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
}

function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  }
  return out;
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const contains = (outer: readonly Interval[], inner: Interval) =>
  outer.some((o) => o.start <= inner.start && inner.end <= o.end);
const toInterval = (b: TimeBlock): Interval => ({ start: Date.parse(b.startsAt), end: Date.parse(b.endsAt) });
const iso = (ms: number) => new Date(ms).toISOString();

/** Inicio y fin del día local (cubre los días de 23 y 25 horas del cambio de horario). */
export function localDay(date: string, timeZone: string): Interval {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return {
    start: Date.parse(zonedLocalToUtc(`${date}T00:00`, timeZone)),
    end: Date.parse(zonedLocalToUtc(`${next}T00:00`, timeZone)),
  };
}

type Prepared = {
  open: Interval[];
  /** Día local completo de la fecha pedida (para servicios de día completo). */
  day: Interval;
  resources: Array<AvailabilityResource & { available: Interval[]; blocked: Interval[] }>;
  earliest: number;
  latest: number;
};

function prepare(input: AvailabilityInput): Prepared {
  const now = Date.parse(input.now);
  const day = localDay(input.date, input.timeZone);
  const empty: Prepared = { open: [], day, resources: [], earliest: 0, latest: 0 };
  if (input.holidays.includes(input.date)) return empty;

  const open = toIntervals(input.branchHours, input.date, input.timeZone);
  if (open.length === 0) return empty;

  const branchBlocks = input.branchBlocks.map(toInterval);
  const resources = input.resources.map((r) => {
    const own = r.hours.length > 0 ? toIntervals(r.hours, input.date, input.timeZone) : open;
    const blocked = [
      ...branchBlocks,
      ...input.resourceBlocks.filter((b) => b.resourceId === r.id).map(toInterval),
      ...input.busy
        .filter(
          (b) =>
            (b.resourceId != null && b.resourceId === r.id) ||
            (r.professionalId != null && b.professionalId != null && b.professionalId === r.professionalId),
        )
        .map(toInterval),
    ];
    return { ...r, available: intersect(own, open), blocked };
  });

  return {
    open,
    day,
    resources,
    earliest: now + input.minAdvanceMinutes * MINUTE,
    latest: now + input.maxAdvanceDays * DAY,
  };
}

type Chosen = { resourceId: string; professionalId: string | null; occupied: Interval };

/** Intenta armar la reserva completa empezando en `start`. */
function buildSlot(input: AvailabilityInput, prepared: Prepared, start: number): Slot | null {
  if (start < prepared.earliest || start > prepared.latest) return null;

  const chosen: Chosen[] = [];
  const items: SlotItem[] = [];
  let cursor = start;
  let end = start;

  for (const service of input.services) {
    const fullDay = Boolean(input.parallel && service.fullDay);
    const begin = input.parallel ? start : cursor;
    // Día completo: se entrega a la hora del evento, pero el recurso queda ocupado todo el día
    const serviceTime: Interval = fullDay
      ? { start: begin, end: prepared.day.end }
      : { start: begin, end: begin + service.durationMinutes * MINUTE };
    const occupied: Interval = fullDay
      ? prepared.day
      : {
          start: serviceTime.start - service.bufferBeforeMinutes * MINUTE,
          end: serviceTime.end + service.bufferAfterMinutes * MINUTE,
        };
    if (!fullDay && !contains(prepared.open, serviceTime)) return null;

    // Primero los requisitos más exigentes (con habilidad), para no gastar
    // a la persona especializada en un requisito genérico.
    const requirements = [...service.requirements].sort(
      (a, b) => Number(Boolean(b.requiredSkill)) - Number(Boolean(a.requiredSkill)),
    );
    const resourceIds: string[] = [];

    for (const req of requirements) {
      for (let n = 0; n < req.quantity; n++) {
        const candidate = prepared.resources.find(
          (r) =>
            r.type === req.resourceType &&
            (!req.requiredSkill || r.skills.includes(req.requiredSkill)) &&
            (req.resourceType !== 'person' || !input.preferredPersonId || r.id === input.preferredPersonId) &&
            !resourceIds.includes(r.id) &&
            (fullDay ? r.available.length > 0 : contains(r.available, serviceTime)) &&
            !r.blocked.some((b) => overlaps(b, occupied)) &&
            !chosen.some(
              (c) =>
                overlaps(c.occupied, occupied) &&
                (c.resourceId === r.id || (r.professionalId != null && c.professionalId === r.professionalId)),
            ),
        );
        if (!candidate) return null;
        resourceIds.push(candidate.id);
        chosen.push({ resourceId: candidate.id, professionalId: candidate.professionalId, occupied });
      }
    }

    items.push({
      serviceId: service.id,
      startsAt: iso(serviceTime.start),
      endsAt: iso(serviceTime.end),
      occupiedFrom: iso(occupied.start),
      occupiedTo: iso(occupied.end),
      resourceIds,
    });
    cursor = serviceTime.end;
    end = Math.max(end, serviceTime.end);
  }

  // Stock de adicionales durante toda la reserva
  const whole: Interval = { start, end };
  for (const addon of input.addons ?? []) {
    const used = addon.usage.filter((u) => overlaps(toInterval(u), whole)).reduce((sum, u) => sum + u.quantity, 0);
    if (used + addon.quantity > addon.stock) return null;
  }

  return { startsAt: iso(start), endsAt: iso(end), items };
}

/** Todos los horarios disponibles del día, con los recursos asignados. */
export function findSlots(input: AvailabilityInput): Slot[] {
  if (input.services.length === 0 || input.slotIntervalMinutes <= 0) return [];
  const prepared = prepare(input);
  const slots: Slot[] = [];
  const seen = new Set<number>();
  for (const window of prepared.open) {
    for (let start = window.start; start < window.end; start += input.slotIntervalMinutes * MINUTE) {
      if (seen.has(start)) continue;
      seen.add(start);
      const slot = buildSlot(input, prepared, start);
      if (slot) slots.push(slot);
    }
  }
  return slots;
}

/**
 * Vuelve a calcular un horario concreto justo antes de reservar.
 * Devuelve null si ya no está disponible.
 */
export function checkSlot(input: AvailabilityInput, startsAt: string): Slot | null {
  return findSlots(input).find((s) => s.startsAt === new Date(startsAt).toISOString()) ?? null;
}

/** Duración total de atención de una lista de servicios (sin holguras). */
export function totalDuration(services: ReadonlyArray<Pick<ServiceSpec, 'durationMinutes'>>): number {
  return services.reduce((sum, s) => sum + s.durationMinutes, 0);
}

/** Valida que un horario local tenga formato HH:MM (útil en formularios). */
export function isTime(value: string): boolean {
  try {
    timeToMinutes(value);
    return true;
  } catch {
    return false;
  }
}
