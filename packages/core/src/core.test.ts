import { describe, expect, it } from 'vitest';
import {
  addonStockSchema,
  can,
  canAssignRole,
  canManageBranch,
  checkLimit,
  findOverlaps,
  formatClp,
  hasFeature,
  memberSchema,
  parseClp,
  serviceSchema,
  utcToZonedLocal,
  weeklyHoursSchema,
  zonedLocalToUtc,
  type Entitlement,
  type MembershipContext,
} from './index';

const BUSINESS = '6f1c1b1e-1111-4111-8111-111111111111';
const BRANCH_1 = '6f1c1b1e-2222-4222-8222-222222222222';
const BRANCH_2 = '6f1c1b1e-3333-4333-8333-333333333333';

describe('permisos por rol', () => {
  const owner: MembershipContext = { role: 'owner', branchIds: [] };
  const admin: MembershipContext = { role: 'admin', branchIds: [] };
  const branchAdmin: MembershipContext = { role: 'branch_admin', branchIds: [BRANCH_1] };
  const receptionist: MembershipContext = { role: 'receptionist', branchIds: [BRANCH_1] };

  it('owner y admin gestionan catálogo y equipo', () => {
    for (const m of [owner, admin]) {
      expect(can(m, 'catalog.manage')).toBe(true);
      expect(can(m, 'team.manage')).toBe(true);
      expect(can(m, 'audit.view')).toBe(true);
    }
  });

  it('recepción y staff solo ven el catálogo', () => {
    expect(can(receptionist, 'catalog.view')).toBe(true);
    expect(can(receptionist, 'catalog.manage')).toBe(false);
    expect(can({ role: 'staff', branchIds: [] }, 'team.manage')).toBe(false);
    expect(can({ role: 'seller', branchIds: [] }, 'audit.view')).toBe(false);
  });

  it('el branch_admin gestiona solo sus sucursales', () => {
    expect(canManageBranch(branchAdmin, BRANCH_1)).toBe(true);
    expect(canManageBranch(branchAdmin, BRANCH_2)).toBe(false);
    expect(canManageBranch(receptionist, BRANCH_1)).toBe(false);
    expect(canManageBranch(owner, BRANCH_2)).toBe(true);
  });

  it('solo un dueño asigna el rol de dueño', () => {
    expect(canAssignRole(owner, 'owner')).toBe(true);
    expect(canAssignRole(admin, 'owner')).toBe(false);
    expect(canAssignRole(admin, 'receptionist')).toBe(true);
    expect(canAssignRole(branchAdmin, 'staff')).toBe(false);
  });
});

describe('derechos del plan', () => {
  const base: Entitlement[] = [
    { feature: 'branches', enabled: true, limit_value: 1 },
    { feature: 'resources', enabled: true, limit_value: 10 },
    { feature: 'email_notifications', enabled: true, limit_value: null },
    { feature: 'whatsapp_messages', enabled: false, limit_value: 0 },
  ];

  it('permite hasta el límite y luego lo bloquea', () => {
    expect(checkLimit(base, 'branches', 0)).toEqual({ allowed: true, remaining: 0 });
    expect(checkLimit(base, 'branches', 1)).toEqual({ allowed: false, reason: 'limit_reached', limit: 1 });
    expect(checkLimit(base, 'resources', 7)).toEqual({ allowed: true, remaining: 2 });
  });

  it('sin límite cuando limit_value es null', () => {
    expect(checkLimit(base, 'email_notifications', 5000)).toEqual({ allowed: true, remaining: null });
  });

  it('funciones no incluidas o inexistentes no se permiten', () => {
    expect(checkLimit(base, 'whatsapp_messages', 0)).toEqual({ allowed: false, reason: 'not_included' });
    expect(checkLimit(base, 'landing', 0)).toEqual({ allowed: false, reason: 'not_included' });
    expect(hasFeature(base, 'whatsapp_messages')).toBe(false);
    expect(hasFeature(base, 'email_notifications')).toBe(true);
  });
});

describe('montos en CLP enteros', () => {
  it('acepta formatos chilenos comunes', () => {
    expect(parseClp('12000')).toBe(12000);
    expect(parseClp('$12.000')).toBe(12000);
    expect(parseClp('1.250.000')).toBe(1250000);
    expect(parseClp(0)).toBe(0);
  });

  it('rechaza decimales, negativos y texto', () => {
    expect(() => parseClp('12000,50')).toThrow();
    expect(() => parseClp('12.5')).toThrow();
    expect(() => parseClp(-1)).toThrow();
    expect(() => parseClp(10.5)).toThrow();
    expect(() => parseClp('doce mil')).toThrow();
  });

  it('formatea con separador de miles', () => {
    expect(formatClp(12000)).toBe('$12.000');
    expect(formatClp(1250000)).toBe('$1.250.000');
    expect(formatClp(0)).toBe('$0');
  });
});

describe('horarios', () => {
  it('detecta tramos superpuestos del mismo día', () => {
    expect(
      findOverlaps([
        { weekday: 1, start: '10:00', end: '14:00' },
        { weekday: 1, start: '13:00', end: '19:00' },
        { weekday: 2, start: '10:00', end: '14:00' },
      ]),
    ).toHaveLength(1);
    expect(
      findOverlaps([
        { weekday: 1, start: '10:00', end: '14:00' },
        { weekday: 1, start: '14:00', end: '19:00' },
      ]),
    ).toHaveLength(0);
  });

  it('valida el horario semanal', () => {
    expect(weeklyHoursSchema.safeParse([{ weekday: 1, start: '10:00', end: '14:00' }]).success).toBe(true);
    expect(weeklyHoursSchema.safeParse([{ weekday: 1, start: '14:00', end: '10:00' }]).success).toBe(false);
    expect(
      weeklyHoursSchema.safeParse([
        { weekday: 1, start: '10:00', end: '14:00' },
        { weekday: 1, start: '12:00', end: '16:00' },
      ]).success,
    ).toBe(false);
    expect(weeklyHoursSchema.safeParse([{ weekday: 1, start: '25:00', end: '26:00' }]).success).toBe(false);
  });
});

describe('zona horaria y horario de verano (America/Santiago)', () => {
  const tz = 'America/Santiago';

  it('convierte hora local a UTC en invierno (UTC-4) y verano (UTC-3)', () => {
    expect(zonedLocalToUtc('2026-07-15T10:00', tz)).toBe('2026-07-15T14:00:00.000Z');
    expect(zonedLocalToUtc('2026-12-15T10:00', tz)).toBe('2026-12-15T13:00:00.000Z');
  });

  it('ida y vuelta conserva la hora local', () => {
    for (const local of ['2026-01-01T00:00', '2026-09-06T12:30', '2026-04-05T08:15']) {
      expect(utcToZonedLocal(zonedLocalToUtc(local, tz), tz)).toBe(local);
    }
  });

  it('una hora que no existe (se adelanta el reloj en septiembre) pasa al primer instante válido', () => {
    // 2026-09-06 a las 00:00 el reloj salta a la 01:00: las 00:30 no existen
    const utc = zonedLocalToUtc('2026-09-06T00:30', tz);
    expect(utc).toBe('2026-09-06T04:30:00.000Z');
    expect(utcToZonedLocal(utc, tz)).toBe('2026-09-06T01:30');
  });

  it('una hora ambigua (se atrasa el reloj en abril) usa la primera ocurrencia', () => {
    // 2026-04-05 a las 00:00 el reloj vuelve a las 23:00 del sábado: las 23:30 ocurren dos veces
    expect(zonedLocalToUtc('2026-04-04T23:30', tz)).toBe('2026-04-05T02:30:00.000Z');
  });

  it('funciona en otras zonas (Europa)', () => {
    expect(zonedLocalToUtc('2026-07-01T10:00', 'Europe/Madrid')).toBe('2026-07-01T08:00:00.000Z');
  });
});

describe('validación de entradas', () => {
  it('servicio: precio en enteros CLP y requisitos', () => {
    const parsed = serviceSchema.parse({
      businessId: BUSINESS,
      name: '  Corte + barba ',
      durationMinutes: '45',
      priceClp: '$15.000',
      active: 'on',
      requirements: [{ resourceType: 'person', quantity: '1', requiredSkill: ' Barberia ' }],
    });
    expect(parsed).toMatchObject({
      name: 'Corte + barba',
      durationMinutes: 45,
      priceClp: 15000,
      bufferBeforeMinutes: 0,
      active: true,
      requirements: [{ resourceType: 'person', quantity: 1, requiredSkill: 'barberia' }],
    });
    expect(serviceSchema.safeParse({ businessId: BUSINESS, name: 'X', durationMinutes: 30, priceClp: '15000,5' }).success).toBe(
      false,
    );
    expect(serviceSchema.safeParse({ businessId: BUSINESS, name: 'X', durationMinutes: 2, priceClp: 0 }).success).toBe(false);
  });

  it('stock no negativo y entero', () => {
    const base = { businessId: BUSINESS, addonId: BRANCH_1, branchId: BRANCH_2 };
    expect(addonStockSchema.safeParse({ ...base, quantity: '10' }).success).toBe(true);
    expect(addonStockSchema.safeParse({ ...base, quantity: '-1' }).success).toBe(false);
    expect(addonStockSchema.safeParse({ ...base, quantity: '1.5' }).success).toBe(false);
  });

  it('un administrador de sucursal necesita sucursales asignadas', () => {
    expect(memberSchema.safeParse({ businessId: BUSINESS, email: 'a@b.cl', role: 'branch_admin' }).success).toBe(false);
    expect(
      memberSchema.safeParse({ businessId: BUSINESS, email: 'A@B.cl', role: 'branch_admin', branchIds: [BRANCH_1] }).data?.email,
    ).toBe('a@b.cl');
  });
});
