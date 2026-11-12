import { describe, expect, it } from 'vitest';
import { comparePlanVersions, daysInMonth, formatRate, nextDay, prorateMonth, taxBreakdown, type PlanVersionSpec } from './billing';
import { BILLING_CURRENCY_CODES, CURRENCY_CODES, formatMoney, parseMoney } from './money';

describe('impuesto sobre el neto', () => {
  it('IVA 19% en pesos, redondeado al peso', () => {
    expect(taxBreakdown(15000, 1900)).toEqual({ net: 15000, tax: 2850, gross: 17850, rateBp: 1900 });
    expect(taxBreakdown(15333, 1900)).toEqual({ net: 15333, tax: 2913, gross: 18246, rateBp: 1900 }); // 2913,27
    expect(taxBreakdown(10, 1950).tax).toBe(2); // 1,95 → 2
  });

  it('exportación de servicios: 0%', () => {
    expect(taxBreakdown(1700, 0)).toEqual({ net: 1700, tax: 0, gross: 1700, rateBp: 0 });
  });

  it('rechaza montos y tasas inválidas', () => {
    expect(() => taxBreakdown(-1, 1900)).toThrow();
    expect(() => taxBreakdown(10.5, 1900)).toThrow();
    expect(() => taxBreakdown(100, 10001)).toThrow();
  });

  it('muestra la tasa', () => {
    expect(formatRate(1900)).toBe('19%');
    expect(formatRate(1050)).toBe('10,5%');
  });
});

describe('monedas de cobro', () => {
  it('se cobra en CLP o USD; los negocios operan solo en CLP', () => {
    expect(BILLING_CURRENCY_CODES).toEqual(['CLP', 'USD']);
    expect(CURRENCY_CODES).toEqual(['CLP']);
  });

  it('USD guarda centavos', () => {
    expect(parseMoney('17,50', 'USD')).toBe(1750);
    expect(formatMoney(1750, 'USD')).toBe('US$17,50');
  });
});

describe('prorrateo por días calendario', () => {
  const base = { label: 'Plan Base', kind: 'plan' as const, monthlyNet: 10000 };
  const pro = { label: 'Plan Pro', kind: 'plan' as const, monthlyNet: 20000 };

  it('mes completo con un solo plan', () => {
    const c = prorateMonth([{ ...base, startsOn: '2026-10-01', endsOn: null }], '2026-11');
    expect(c).toMatchObject({ daysInMonth: 30, net: 10000 });
    expect(c.lines[0]).toMatchObject({ from: '2026-11-01', to: '2026-11-30', days: 30 });
  });

  it('cambio el 14: el día del cambio se cobra con el plan anterior y el nuevo corre desde el 15', () => {
    expect(nextDay('2026-11-14')).toBe('2026-11-15');
    const c = prorateMonth(
      [
        { ...base, startsOn: '2026-10-01', endsOn: '2026-11-14' },
        { ...pro, startsOn: '2026-11-15', endsOn: null },
      ],
      '2026-11',
    );
    expect(c.lines.map((l) => [l.label, l.days, l.net])).toEqual([
      ['Plan Base', 14, 4667], // 14/30 × 10.000 = 4.666,67
      ['Plan Pro', 16, 10667], // 16/30 × 20.000 = 10.666,67
    ]);
    expect(c.net).toBe(15334);
  });

  it('varios cambios en el mismo mes', () => {
    const c = prorateMonth(
      [
        { ...base, startsOn: '2026-01-01', endsOn: '2026-02-09' },
        { ...pro, startsOn: '2026-02-10', endsOn: '2026-02-19' },
        { ...base, startsOn: '2026-02-20', endsOn: null },
      ],
      '2026-02',
    );
    expect(c.daysInMonth).toBe(28);
    expect(c.lines.map((l) => l.days)).toEqual([9, 10, 9]);
    expect(c.lines.reduce((n, l) => n + l.days, 0)).toBe(28);
  });

  it('los días suspendidos no se cobran', () => {
    const c = prorateMonth(
      [
        { ...base, startsOn: '2026-12-01', endsOn: '2026-12-10' },
        { label: 'Suspendido', kind: 'suspended', monthlyNet: 10000, startsOn: '2026-12-11', endsOn: '2026-12-20' },
        { ...base, startsOn: '2026-12-21', endsOn: null },
      ],
      '2026-12',
    );
    expect(c.lines.map((l) => [l.days, l.net])).toEqual([
      [10, 3226],
      [10, 0],
      [11, 3548],
    ]);
  });

  it('un cliente que llega a mitad de mes paga solo desde su alta', () => {
    const c = prorateMonth([{ ...base, startsOn: '2026-11-21', endsOn: null }], '2026-11');
    expect(c.lines[0]).toMatchObject({ days: 10, net: 3333 });
  });

  it('meses de 28, 30 y 31 días, y años bisiestos', () => {
    expect([daysInMonth('2026-02'), daysInMonth('2028-02'), daysInMonth('2026-04'), daysInMonth('2026-12')]).toEqual([28, 29, 30, 31]);
  });

  it('ignora tramos de otros meses', () => {
    const c = prorateMonth([{ ...base, startsOn: '2026-01-01', endsOn: '2026-01-31' }], '2026-11');
    expect(c).toMatchObject({ lines: [], net: 0 });
  });
});

describe('comparar versiones de un plan', () => {
  const v1: PlanVersionSpec = {
    features: [
      { feature: 'branches', enabled: true, limit: 1 },
      { feature: 'resources', enabled: true, limit: 10 },
      { feature: 'commissions', enabled: false, limit: null },
    ],
    prices: { CLP: 15000, USD: 1700 },
  };
  const change = (patch: Partial<PlanVersionSpec>): PlanVersionSpec => ({ ...v1, ...patch });

  it('más recursos o una función nueva, sin subir el precio: mejora', () => {
    const r = comparePlanVersions(
      v1,
      change({
        features: [
          { feature: 'branches', enabled: true, limit: 1 },
          { feature: 'resources', enabled: true, limit: 15 },
          { feature: 'commissions', enabled: true, limit: null },
        ],
      }),
    );
    expect(r.kind).toBe('improvement');
    expect(r.better).toEqual(['Recursos: de 10 a 15', 'Comisiones: ahora está incluido']);
  });

  it('pasar a "sin límite" es una mejora; bajar el precio también', () => {
    expect(
      comparePlanVersions(v1, change({ features: [{ feature: 'branches', enabled: true, limit: null }, ...v1.features.slice(1)] })).kind,
    ).toBe('improvement');
    expect(comparePlanVersions(v1, change({ prices: { CLP: 12000, USD: 1700 } })).kind).toBe('improvement');
  });

  it('cambio mixto (mejora algo pero sube el precio): no es mejora', () => {
    const r = comparePlanVersions(
      v1,
      change({
        features: [{ feature: 'branches', enabled: true, limit: 3 }, ...v1.features.slice(1)],
        prices: { CLP: 18000, USD: 1700 },
      }),
    );
    expect(r.kind).toBe('worse');
    expect(r.better).toEqual(['Sucursales: de 1 a 3']);
    expect(r.worse).toEqual(['Precio en CLP: sube']);
  });

  it('quitar una función o un precio: no es mejora', () => {
    expect(comparePlanVersions(v1, change({ features: v1.features.filter((f) => f.feature !== 'resources') })).kind).toBe('worse');
    expect(comparePlanVersions(v1, change({ prices: { CLP: 15000 } })).worse).toEqual(['Precio en USD: se quita']);
  });

  it('agregar un precio en otra moneda no afecta a los actuales', () => {
    expect(comparePlanVersions(change({ prices: { CLP: 15000 } }), v1).kind).toBe('same');
  });

  it('mismas condiciones (por ejemplo, solo cambió la descripción): igual', () => {
    expect(comparePlanVersions(v1, v1)).toEqual({ kind: 'same', better: [], worse: [] });
  });
});
