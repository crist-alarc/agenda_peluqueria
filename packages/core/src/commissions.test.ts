import { describe, expect, it } from 'vitest';
import {
  computeBookingCommissions,
  defaultShares,
  findRule,
  formatPercent,
  parsePercent,
  proposePeriod,
  sharesFromWeights,
  summarizeSettlement,
  validateShares,
  type CommissionRule,
} from './commissions';
import { commissionRuleSchema, itemSharesSchema } from './schemas';

const rule = (over: Partial<CommissionRule>): CommissionRule => ({
  id: 'r',
  professionalId: null,
  serviceId: null,
  kind: 'percent',
  value: 4000,
  includeAddons: false,
  active: true,
  ...over,
});

const rules: CommissionRule[] = [
  rule({ id: 'general', value: 3000 }),
  rule({ id: 'ana', professionalId: 'ana', value: 4000 }),
  rule({ id: 'tintura', serviceId: 'tintura', value: 5000 }),
  rule({ id: 'ana-tintura', professionalId: 'ana', serviceId: 'tintura', kind: 'fixed', value: 8000 }),
  rule({ id: 'inactiva', professionalId: 'beto', value: 9000, active: false }),
];

describe('elegir la regla', () => {
  it('gana la más específica: persona+servicio > servicio > persona > general', () => {
    expect(findRule(rules, 'ana', 'tintura')?.id).toBe('ana-tintura');
    expect(findRule(rules, 'beto', 'tintura')?.id).toBe('tintura');
    expect(findRule(rules, 'ana', 'corte')?.id).toBe('ana');
    expect(findRule(rules, 'beto', 'corte')?.id).toBe('general');
  });
  it('ignora reglas inactivas; sin reglas no hay comisión', () => {
    expect(findRule(rules, 'beto', 'corte')?.id).not.toBe('inactiva');
    expect(findRule([], 'ana', 'corte')).toBeNull();
  });
});

describe('reparto entre profesionales', () => {
  it('debe sumar exactamente 100%', () => {
    expect(validateShares([{ professionalId: 'a', shareBp: 7000 }, { professionalId: 'b', shareBp: 3000 }])).toBeNull();
    expect(validateShares([{ professionalId: 'a', shareBp: 7000 }, { professionalId: 'b', shareBp: 2000 }])).toMatch(/100%.*90%/);
    expect(validateShares([{ professionalId: 'a', shareBp: 5000 }, { professionalId: 'a', shareBp: 5000 }])).toMatch(/dos veces/);
    expect(validateShares([{ professionalId: 'a', shareBp: 10000 }, { professionalId: 'b', shareBp: 0 }])).toMatch(/mayor que 0/);
    expect(validateShares([])).toMatch(/al menos/);
  });

  it('por minutos trabajados, sin perder ni sobrar por redondeo', () => {
    // La peluquera trabajó 40 minutos y tuvo que irse; otra terminó la tintura en 80
    expect(sharesFromWeights([{ professionalId: 'a', weight: 40 }, { professionalId: 'b', weight: 80 }])).toEqual([
      { professionalId: 'a', shareBp: 3333 },
      { professionalId: 'b', shareBp: 6667 },
    ]);
    const thirds = sharesFromWeights(['a', 'b', 'c'].map((p) => ({ professionalId: p, weight: 1 })));
    expect(thirds.reduce((s, x) => s + x.shareBp, 0)).toBe(10000);
    expect(() => sharesFromWeights([{ professionalId: 'a', weight: 0 }])).toThrow();
  });

  it('usa la receta del servicio según la habilidad de cada persona', () => {
    const recipe = [
      { label: 'Peluquería canina', shareBp: 7000, requiredSkill: 'grooming' },
      { label: 'Secado', shareBp: 3000, requiredSkill: 'secado' },
    ];
    const shares = defaultShares(
      [
        { professionalId: 'seca', skills: ['secado'] },
        { professionalId: 'corta', skills: ['grooming'] },
      ],
      recipe,
    );
    expect(shares).toEqual(
      expect.arrayContaining([
        { professionalId: 'corta', shareBp: 7000 },
        { professionalId: 'seca', shareBp: 3000 },
      ]),
    );
  });

  it('una persona = 100%; si la receta no calza, partes iguales', () => {
    expect(defaultShares([{ professionalId: 'a', skills: [] }], [])).toEqual([{ professionalId: 'a', shareBp: 10000 }]);
    const recipe = [{ label: 'Uno', shareBp: 10000, requiredSkill: null }];
    expect(defaultShares([{ professionalId: 'a', skills: [] }, { professionalId: 'b', skills: [] }], recipe)).toEqual([
      { professionalId: 'a', shareBp: 5000 },
      { professionalId: 'b', shareBp: 5000 },
    ]);
  });
});

describe('calcular comisiones de una reserva', () => {
  it('porcentaje sobre la parte del precio de cada persona', () => {
    const lines = computeBookingCommissions(
      [{ bookingItemId: 'i1', serviceId: 'corte', priceClp: 15000, shares: [{ professionalId: 'ana', shareBp: 10000 }] }],
      0,
      rules,
    );
    expect(lines).toEqual([expect.objectContaining({ professionalId: 'ana', ruleId: 'ana', baseClp: 15000, amountClp: 6000 })]);
  });

  it('servicio compartido 70/30 y monto fijo repartido', () => {
    const lines = computeBookingCommissions(
      [
        {
          bookingItemId: 'i1',
          serviceId: 'tintura',
          priceClp: 40000,
          shares: [
            { professionalId: 'ana', shareBp: 7000 },
            { professionalId: 'beto', shareBp: 3000 },
          ],
        },
      ],
      0,
      rules,
    );
    // Ana: fijo $8.000 × 70% = $5.600. Beto: 50% de $12.000 = $6.000
    expect(lines.map((l) => [l.professionalId, l.baseClp, l.amountClp])).toEqual([
      ['ana', 28000, 5600],
      ['beto', 12000, 6000],
    ]);
  });

  it('los adicionales suman solo si la regla lo indica', () => {
    const withAddons = [rule({ id: 'g', value: 1000, includeAddons: true })];
    const items = [
      { bookingItemId: 'i1', serviceId: 'corte', priceClp: 10000, shares: [{ professionalId: 'a', shareBp: 10000 }] },
      { bookingItemId: 'i2', serviceId: 'barba', priceClp: 5000, shares: [{ professionalId: 'b', shareBp: 10000 }] },
    ];
    // $3.000 en adicionales: 2/3 al corte, 1/3 a la barba
    const lines = computeBookingCommissions(items, 3000, withAddons);
    expect(lines.map((l) => [l.professionalId, l.addonBaseClp, l.amountClp])).toEqual([
      ['a', 2000, 1200],
      ['b', 1000, 600],
    ]);
    expect(computeBookingCommissions(items, 3000, [rule({ id: 'g', value: 1000 })]).map((l) => l.amountClp)).toEqual([1000, 500]);
  });

  it('montos en pesos enteros y sin regla la comisión es 0', () => {
    const lines = computeBookingCommissions(
      [{ bookingItemId: 'i1', serviceId: 'corte', priceClp: 9999, shares: [{ professionalId: 'x', shareBp: 10000 }] }],
      0,
      [rule({ id: 'g', value: 3333 })],
    );
    expect(lines[0]!.amountClp).toBe(3333);
    expect(Number.isInteger(lines[0]!.amountClp)).toBe(true);
    const none = computeBookingCommissions(
      [{ bookingItemId: 'i1', serviceId: 'corte', priceClp: 9999, shares: [{ professionalId: 'x', shareBp: 10000 }] }],
      0,
      [],
    );
    expect(none[0]).toMatchObject({ ruleId: null, amountClp: 0 });
  });

  it('rechaza un reparto que no suma 100%', () => {
    expect(() =>
      computeBookingCommissions(
        [{ bookingItemId: 'i1', serviceId: 'c', priceClp: 1000, shares: [{ professionalId: 'a', shareBp: 9000 }] }],
        0,
        rules,
      ),
    ).toThrow(/100%/);
  });
});

describe('liquidación', () => {
  it('suma por persona servicios y ajustes', () => {
    const s = summarizeSettlement([
      { professionalId: 'b', professionalName: 'Beto', kind: 'service', amountClp: 6000 },
      { professionalId: 'a', professionalName: 'Ana', kind: 'service', amountClp: 5600 },
      { professionalId: 'a', professionalName: 'Ana', kind: 'service', amountClp: 4000 },
      { professionalId: 'a', professionalName: 'Ana', kind: 'adjustment', amountClp: -1000 },
    ]);
    expect(s.totalClp).toBe(14600);
    expect(s.people.map((p) => [p.name, p.count, p.servicesClp, p.adjustmentsClp, p.totalClp])).toEqual([
      ['Ana', 2, 9600, -1000, 8600],
      ['Beto', 1, 6000, 0, 6000],
    ]);
  });

  it('propone el último período completo según la frecuencia del negocio', () => {
    expect(proposePeriod('monthly', '2026-11-11')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(proposePeriod('monthly', '2026-01-05')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(proposePeriod('biweekly', '2026-11-11')).toEqual({ start: '2026-10-16', end: '2026-10-31' });
    expect(proposePeriod('biweekly', '2026-11-20')).toEqual({ start: '2026-11-01', end: '2026-11-15' });
    // 11-11-2026 es miércoles: la semana anterior va del lunes 2 al domingo 8
    expect(proposePeriod('weekly', '2026-11-11')).toEqual({ start: '2026-11-02', end: '2026-11-08' });
  });
});

describe('formatos y validación', () => {
  it('porcentajes', () => {
    expect(formatPercent(4000)).toBe('40%');
    expect(formatPercent(3333)).toBe('33,33%');
    expect(parsePercent('33,5')).toBe(3350);
    expect(parsePercent('120')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
  });

  it('una regla de porcentaje no pasa de 100% y una fija es un monto entero', () => {
    const base = { businessId: '00000000-0000-4000-8000-000000000000', professionalId: '', serviceId: '' };
    expect(commissionRuleSchema.parse({ ...base, kind: 'percent', value: '40' })).toMatchObject({ valueStored: 4000, professionalId: null });
    expect(commissionRuleSchema.parse({ ...base, kind: 'fixed', value: '5.000' })).toMatchObject({ valueStored: 5000 });
    expect(() => commissionRuleSchema.parse({ ...base, kind: 'percent', value: '150' })).toThrow();
  });

  it('el reparto manual del formulario debe sumar 100%', () => {
    const id = '00000000-0000-4000-8000-00000000000';
    expect(
      itemSharesSchema.parse({ mode: 'percent', rows: [{ professionalId: `${id}1`, value: '70' }, { professionalId: `${id}2`, value: '30' }] }),
    ).toEqual([
      { professionalId: `${id}1`, shareBp: 7000 },
      { professionalId: `${id}2`, shareBp: 3000 },
    ]);
    expect(
      itemSharesSchema.parse({ mode: 'minutes', rows: [{ professionalId: `${id}1`, value: '40' }, { professionalId: `${id}2`, value: '80' }] }),
    ).toEqual([
      { professionalId: `${id}1`, shareBp: 3333 },
      { professionalId: `${id}2`, shareBp: 6667 },
    ]);
    expect(() =>
      itemSharesSchema.parse({ mode: 'percent', rows: [{ professionalId: `${id}1`, value: '70' }, { professionalId: `${id}2`, value: '20' }] }),
    ).toThrow(/100%/);
  });
});
