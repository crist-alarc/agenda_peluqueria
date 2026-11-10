import { describe, expect, it } from 'vitest';
import { checkSlot, findSlots, type AvailabilityInput, type AvailabilityResource } from './availability';
import { bookingTotal, canTransition, customerCanCancel, normalizePhone } from './bookings';
import { utcToZonedLocal } from './time';

const TZ = 'America/Santiago';
// 2026-11-18 es miércoles (weekday 3). En noviembre Santiago está en UTC-3.
const DATE = '2026-11-18';

const carla: AvailabilityResource = { id: 'carla', type: 'person', skills: ['barberia'], professionalId: 'p-carla', hours: [] };
const diego: AvailabilityResource = { id: 'diego', type: 'person', skills: [], professionalId: 'p-diego', hours: [] };
const sillon: AvailabilityResource = { id: 'sillon', type: 'space', skills: [], professionalId: null, hours: [] };

const corte = {
  id: 'corte',
  durationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  requirements: [{ resourceType: 'person' as const, quantity: 1, requiredSkill: null }],
};
const barba = {
  id: 'barba',
  durationMinutes: 20,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 10,
  requirements: [{ resourceType: 'person' as const, quantity: 1, requiredSkill: 'barberia' }],
};

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timeZone: TZ,
    date: DATE,
    now: '2026-11-17T12:00:00Z',
    slotIntervalMinutes: 30,
    minAdvanceMinutes: 0,
    maxAdvanceDays: 60,
    branchHours: [{ weekday: 3, start: '10:00', end: '12:00' }],
    holidays: [],
    branchBlocks: [],
    resources: [diego],
    resourceBlocks: [],
    busy: [],
    services: [corte],
    ...overrides,
  };
}

const local = (iso: string) => utcToZonedLocal(iso, TZ).slice(11);
const times = (i: AvailabilityInput) => findSlots(i).map((s) => local(s.startsAt));

describe('motor de disponibilidad', () => {
  it('genera horarios dentro del horario de la sucursal, en la zona del negocio', () => {
    expect(times(input())).toEqual(['10:00', '10:30', '11:00', '11:30']);
    const [first] = findSlots(input());
    expect(first?.startsAt).toBe('2026-11-18T13:00:00.000Z');
    expect(first?.items[0]?.resourceIds).toEqual(['diego']);
  });

  it('no ofrece servicios que terminarían después del cierre', () => {
    const largo = { ...corte, durationMinutes: 90 };
    expect(times(input({ services: [largo] }))).toEqual(['10:00', '10:30']);
  });

  it('respeta las ocupaciones existentes del recurso', () => {
    const busy = [{ resourceId: 'diego', startsAt: '2026-11-18T13:30:00Z', endsAt: '2026-11-18T14:00:00Z' }];
    expect(times(input({ busy }))).toEqual(['10:00', '11:00', '11:30']);
  });

  it('el profesional ocupado en OTRO negocio tampoco está disponible', () => {
    const busy = [{ professionalId: 'p-diego', startsAt: '2026-11-18T14:00:00Z', endsAt: '2026-11-18T15:00:00Z' }];
    expect(times(input({ busy }))).toEqual(['10:00', '10:30']);
  });

  it('las holguras ocupan tiempo extra del recurso', () => {
    // Barba de 20 min + 10 de limpieza: a las 10:30 Carla está ocupada hasta las 11:00
    const busy = [{ resourceId: 'carla', startsAt: '2026-11-18T13:30:00Z', endsAt: '2026-11-18T14:00:00Z' }];
    const result = times(input({ resources: [carla], services: [barba], busy, slotIntervalMinutes: 10 }));
    expect(result).not.toContain('10:10');
    expect(result).toContain('10:00');
    expect(result).toContain('11:00');
    // Termina a las 11:50 + 10 de holgura: la limpieza puede salir del horario de atención
    expect(result).toContain('11:40');
    expect(result).not.toContain('11:50');
  });

  it('exige la habilidad requerida por el servicio', () => {
    expect(findSlots(input({ resources: [diego], services: [barba] }))).toEqual([]);
    const [slot] = findSlots(input({ resources: [diego, carla], services: [barba] }));
    expect(slot?.items[0]?.resourceIds).toEqual(['carla']);
  });

  it('respeta al profesional elegido por el cliente', () => {
    const [slot] = findSlots(input({ resources: [diego, carla], preferredPersonId: 'carla' }));
    expect(slot?.items[0]?.resourceIds).toEqual(['carla']);
  });

  it('asigna varios recursos (persona + sillón)', () => {
    const conSillon = {
      ...corte,
      requirements: [...corte.requirements, { resourceType: 'space' as const, quantity: 1, requiredSkill: null }],
    };
    expect(findSlots(input({ services: [conSillon] }))).toEqual([]);
    const [slot] = findSlots(input({ resources: [diego, sillon], services: [conSillon] }));
    expect(slot?.items[0]?.resourceIds.sort()).toEqual(['diego', 'sillon']);
  });

  it('no gasta a la persona especializada en un requisito genérico', () => {
    const doble = {
      ...corte,
      requirements: [
        { resourceType: 'person' as const, quantity: 1, requiredSkill: null },
        { resourceType: 'person' as const, quantity: 1, requiredSkill: 'barberia' },
      ],
    };
    const [slot] = findSlots(input({ resources: [carla, diego], services: [doble] }));
    expect(slot?.items[0]?.resourceIds).toEqual(['carla', 'diego']);
  });

  it('encadena varios servicios', () => {
    const slots = findSlots(input({ resources: [carla], services: [corte, barba] }));
    expect(slots.map((s) => local(s.startsAt))).toEqual(['10:00', '10:30', '11:00']);
    const [first] = slots;
    expect(local(first!.items[1]!.startsAt)).toBe('10:30');
    expect(local(first!.endsAt)).toBe('10:50');
  });

  it('los feriados cierran la sucursal', () => {
    expect(findSlots(input({ holidays: [DATE] }))).toEqual([]);
  });

  it('respeta bloqueos de sucursal y de recurso', () => {
    const branchBlocks = [{ startsAt: '2026-11-18T13:00:00Z', endsAt: '2026-11-18T14:00:00Z' }];
    expect(times(input({ branchBlocks }))).toEqual(['11:00', '11:30']);
    const resourceBlocks = [{ resourceId: 'diego', startsAt: '2026-11-18T14:30:00Z', endsAt: '2026-11-18T15:00:00Z' }];
    expect(times(input({ resourceBlocks }))).toEqual(['10:00', '10:30', '11:00']);
  });

  it('respeta el horario propio del recurso', () => {
    const tarde = { ...diego, hours: [{ weekday: 3, start: '11:00', end: '18:00' }] };
    expect(times(input({ resources: [tarde] }))).toEqual(['11:00', '11:30']);
  });

  it('respeta la anticipación mínima y máxima', () => {
    expect(times(input({ now: '2026-11-18T13:10:00Z', minAdvanceMinutes: 60 }))).toEqual(['11:30']);
    expect(times(input({ now: '2026-11-01T12:00:00Z', maxAdvanceDays: 7 }))).toEqual([]);
  });

  it('controla el stock de adicionales', () => {
    const addon = { addonId: 'toalla', quantity: 1, stock: 1, usage: [{ startsAt: '2026-11-18T13:00:00Z', endsAt: '2026-11-18T14:00:00Z', quantity: 1 }] };
    expect(times(input({ addons: [addon] }))).toEqual(['11:00', '11:30']);
    expect(times(input({ addons: [{ ...addon, stock: 2 }] }))).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });

  it('checkSlot confirma o rechaza un horario puntual', () => {
    expect(checkSlot(input(), '2026-11-18T13:30:00Z')?.items[0]?.resourceIds).toEqual(['diego']);
    const busy = [{ resourceId: 'diego', startsAt: '2026-11-18T13:30:00Z', endsAt: '2026-11-18T14:00:00Z' }];
    expect(checkSlot(input({ busy }), '2026-11-18T13:30:00Z')).toBeNull();
  });

  it('día de cambio de horario de verano (6 de septiembre de 2026)', () => {
    // Domingo 6/9/2026: a las 00:00 el reloj salta a la 01:00 (UTC-4 → UTC-3)
    const slots = findSlots(
      input({
        date: '2026-09-06',
        now: '2026-09-01T00:00:00Z',
        branchHours: [{ weekday: 0, start: '10:00', end: '11:00' }],
      }),
    );
    expect(slots.map((s) => s.startsAt)).toEqual(['2026-09-06T13:00:00.000Z', '2026-09-06T13:30:00.000Z']);
  });

  it('día de fin del horario de verano (4 de abril de 2026)', () => {
    const slots = findSlots(
      input({ date: '2026-04-04', now: '2026-04-01T00:00:00Z', branchHours: [{ weekday: 6, start: '10:00', end: '11:00' }] }),
    );
    // Sábado 4/4 aún en UTC-3
    expect(slots.map((s) => s.startsAt)).toEqual(['2026-04-04T13:00:00.000Z', '2026-04-04T13:30:00.000Z']);
  });
});

describe('reglas de reservas', () => {
  it('transiciones de estado', () => {
    expect(canTransition('confirmed', 'checked_in')).toBe(true);
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('in_progress', 'no_show')).toBe(false);
  });

  it('política de cancelación del cliente', () => {
    expect(customerCanCancel('2026-11-18T14:00:00Z', '2026-11-18T09:00:00Z', 4)).toBe(true);
    expect(customerCanCancel('2026-11-18T14:00:00Z', '2026-11-18T11:00:00Z', 4)).toBe(false);
  });

  it('total en CLP enteros', () => {
    expect(bookingTotal([{ priceClp: 12000 }, { priceClp: 2000, quantity: 2 }])).toBe(16000);
    expect(() => bookingTotal([{ priceClp: 10.5 }])).toThrow();
  });

  it('normaliza teléfonos chilenos', () => {
    expect(normalizePhone('+56 9 1234 5678')).toBe('+56912345678');
    expect(normalizePhone('9 1234 5678')).toBe('+56912345678');
    expect(normalizePhone('56912345678')).toBe('+56912345678');
  });
});
