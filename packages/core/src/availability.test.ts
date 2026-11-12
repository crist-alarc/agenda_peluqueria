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

describe('modo arriendo (fase 3)', () => {
  // Inflables: horario amplio, juegos como equipos con etiqueta, toro con operador.
  const castillo1: AvailabilityResource = { id: 'castillo-1', type: 'equipment', skills: ['castillo'], professionalId: null, hours: [] };
  const castillo2: AvailabilityResource = { id: 'castillo-2', type: 'equipment', skills: ['castillo'], professionalId: null, hours: [] };
  const toro: AvailabilityResource = { id: 'toro', type: 'equipment', skills: ['toro'], professionalId: null, hours: [] };
  const operador: AvailabilityResource = { id: 'op', type: 'person', skills: ['operador'], professionalId: 'p-op', hours: [] };

  const arriendoCastillo = {
    id: 'castillo',
    durationMinutes: 1440,
    bufferBeforeMinutes: 60,
    bufferAfterMinutes: 60,
    fullDay: true,
    requirements: [{ resourceType: 'equipment' as const, quantity: 1, requiredSkill: 'castillo' }],
  };
  const arriendoToro = {
    id: 'toro',
    durationMinutes: 180,
    bufferBeforeMinutes: 60,
    bufferAfterMinutes: 60,
    requirements: [
      { resourceType: 'equipment' as const, quantity: 1, requiredSkill: 'toro' },
      { resourceType: 'person' as const, quantity: 1, requiredSkill: 'operador' },
    ],
  };
  const rental = (overrides: Partial<AvailabilityInput> = {}) =>
    input({
      parallel: true,
      slotIntervalMinutes: 60,
      branchHours: [{ weekday: 3, start: '09:00', end: '21:00' }],
      resources: [castillo1, castillo2, toro, operador],
      services: [arriendoCastillo],
      ...overrides,
    });
  // Día local completo del 18-nov-2026 en Santiago (UTC-3)
  const DAY_START = '2026-11-18T03:00:00.000Z';
  const DAY_END = '2026-11-19T03:00:00.000Z';

  it('un juego de día completo ocupa todo el día aunque se entregue en la tarde', () => {
    const slot = findSlots(rental()).find((s) => local(s.startsAt) === '15:00')!;
    expect(slot.items[0]).toMatchObject({ occupiedFrom: DAY_START, occupiedTo: DAY_END, endsAt: DAY_END });
  });

  it('con una reserva de día completo, el mismo juego ya no está libre ese día (a ninguna hora)', () => {
    const busy = [{ resourceId: 'castillo-1', startsAt: DAY_START, endsAt: DAY_END }];
    const slots = findSlots(rental({ busy }));
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.items[0]!.resourceIds[0] === 'castillo-2')).toBe(true);

    const both = [...busy, { resourceId: 'castillo-2', startsAt: '2026-11-18T22:00:00Z', endsAt: '2026-11-18T23:00:00Z' }];
    expect(findSlots(rental({ busy: both }))).toEqual([]);
  });

  it('el juego reservado para el día anterior no impide el día siguiente', () => {
    const ayer = [{ resourceId: 'castillo-1', startsAt: '2026-11-17T03:00:00Z', endsAt: DAY_START }];
    expect(findSlots(rental({ busy: ayer, resources: [castillo1] }))).not.toEqual([]);
  });

  it('el toro se arrienda por bloques de 3 horas con operador y se puede arrendar dos veces el mismo día', () => {
    const base = rental({ services: [arriendoToro] });
    expect(times(base)[0]).toBe('09:00'); // la holgura de traslado puede quedar fuera del horario de atención
    expect(times(base).at(-1)).toBe('18:00'); // termina a las 21:00
    // Toro ocupado de 10:00 a 13:00 (+ holguras 09:00–14:00): vuelve a estar libre para las 15:00
    const busy = [{ resourceId: 'toro', startsAt: '2026-11-18T12:00:00Z', endsAt: '2026-11-18T17:00:00Z' }];
    expect(times(rental({ services: [arriendoToro], busy }))).toEqual(['15:00', '16:00', '17:00', '18:00']);
  });

  it('castillo y toro en el mismo evento empiezan a la misma hora (no se encadenan)', () => {
    const slot = findSlots(rental({ services: [arriendoCastillo, arriendoToro] })).find((s) => local(s.startsAt) === '15:00')!;
    expect(slot.items.map((i) => local(i.startsAt))).toEqual(['15:00', '15:00']);
    expect(slot.items[1]!.resourceIds.sort()).toEqual(['op', 'toro']);
    expect(slot.endsAt).toBe(DAY_END);
  });

  it('fuera del modo arriendo, día completo no aplica y los servicios se encadenan como siempre', () => {
    const corto = { ...arriendoCastillo, durationMinutes: 60 };
    const slots = findSlots(rental({ parallel: false, services: [corto] }));
    expect(slots[0]!.items[0]!.occupiedFrom).not.toBe(DAY_START);
  });

  it('los feriados y los días sin horario cierran también el arriendo de día completo', () => {
    expect(findSlots(rental({ holidays: [DATE] }))).toEqual([]);
    expect(findSlots(rental({ branchHours: [{ weekday: 4, start: '09:00', end: '21:00' }] }))).toEqual([]);
  });

  it('día completo en el cambio de horario de verano (6 de septiembre de 2026, día de 23 horas)', () => {
    const sept = rental({
      date: '2026-09-06',
      now: '2026-09-01T12:00:00Z',
      branchHours: [{ weekday: 0, start: '09:00', end: '21:00' }],
    });
    const slot = findSlots(sept)[0]!;
    const from = Date.parse(slot.items[0]!.occupiedFrom);
    const to = Date.parse(slot.items[0]!.occupiedTo);
    expect((to - from) / 3_600_000).toBe(23);
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
    expect(bookingTotal([{ price: 12000 }, { price: 2000, quantity: 2 }])).toBe(16000);
    expect(() => bookingTotal([{ price: 10.5 }])).toThrow();
  });

  it('normaliza teléfonos chilenos', () => {
    expect(normalizePhone('+56 9 1234 5678')).toBe('+56912345678');
    expect(normalizePhone('9 1234 5678')).toBe('+56912345678');
    expect(normalizePhone('56912345678')).toBe('+56912345678');
  });
});
