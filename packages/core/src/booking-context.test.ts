import { describe, expect, it } from 'vitest';
import { addDays, buildAvailabilityInput, dayRange, localTime, slotsForRequest, upcomingDates, type BookingContext } from './booking-context';

const ctx: BookingContext = {
  business: {
    id: 'b1',
    name: 'Barbería',
    timezone: 'America/Santiago',
    slot_interval_minutes: 30,
    min_advance_minutes: 60,
    max_advance_days: 30,
    cancellation_hours: 4,
  },
  // Igual que la base: las horas vienen como HH:MM:SS
  branch_hours: [{ weekday: 3, start: '10:00:00', end: '12:00:00' }],
  branch_blocks: [],
  holidays: [],
  resources: [{ id: 'r1', type: 'person', name: 'Carla', skills: [], professionalId: 'p1', hours: [] }],
  resource_blocks: [],
  busy: [{ resourceId: null, professionalId: 'p1', startsAt: '2026-11-18T13:00:00Z', endsAt: '2026-11-18T13:30:00Z' }],
  services: [
    {
      id: 's1',
      name: 'Corte',
      description: null,
      priceClp: 10000,
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      requirements: [{ resourceType: 'person', quantity: 1, requiredSkill: null }],
    },
  ],
  addons: [{ id: 'a1', name: 'Toalla', priceClp: 2000, stock: 0, usage: [] }],
};

describe('contexto de reservas', () => {
  it('calcula horarios con los datos tal como vienen de la base', () => {
    const slots = slotsForRequest(ctx, { date: '2026-11-18', serviceIds: ['s1'], now: '2026-11-17T12:00:00Z' });
    expect(slots.map((s) => localTime(s.startsAt, 'America/Santiago'))).toEqual(['10:30', '11:00', '11:30']);
  });

  it('recepción puede ignorar la anticipación mínima', () => {
    const now = '2026-11-18T13:20:00Z'; // 10:20 local
    expect(slotsForRequest(ctx, { date: '2026-11-18', serviceIds: ['s1'], now })).toHaveLength(1);
    expect(slotsForRequest(ctx, { date: '2026-11-18', serviceIds: ['s1'], now, ignoreMinAdvance: true })).toHaveLength(3);
  });

  it('rechaza servicios o adicionales que no existen', () => {
    expect(() => buildAvailabilityInput(ctx, { date: '2026-11-18', serviceIds: ['x'], now: '2026-11-17T12:00:00Z' })).toThrow(
      /ya no está disponible/,
    );
    expect(() => buildAvailabilityInput(ctx, { date: '2026-11-18', serviceIds: [], now: '2026-11-17T12:00:00Z' })).toThrow(
      /al menos un servicio/,
    );
  });

  it('sin stock del adicional no hay horarios', () => {
    const slots = slotsForRequest(ctx, {
      date: '2026-11-18',
      serviceIds: ['s1'],
      addons: [{ addonId: 'a1', quantity: 1 }],
      now: '2026-11-17T12:00:00Z',
    });
    expect(slots).toEqual([]);
  });

  it('utilidades de fechas locales', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(upcomingDates('2026-11-18T02:00:00Z', 'America/Santiago', 3)).toEqual(['2026-11-17', '2026-11-18', '2026-11-19']);
    const range = dayRange('2026-11-18', 'America/Santiago');
    expect(range.from < '2026-11-18T03:00:00.000Z' && range.to > '2026-11-19T03:00:00.000Z').toBe(true);
  });
});
