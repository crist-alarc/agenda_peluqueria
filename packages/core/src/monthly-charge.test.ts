import { describe, expect, it } from 'vitest';
import { comparePlanVersions } from './billing';
import { buildMonthCharge, chargeTotals, overdueDays, previousMonth, type ChargePeriod } from './monthly-charge';

const plan = (over: Partial<ChargePeriod> = {}): ChargePeriod => ({
  startsOn: '2026-10-01',
  endsOn: null,
  kind: 'plan',
  label: 'Base v1',
  monthlyNet: 31000,
  includedBranches: 1,
  extraBranchNet: 9300,
  ...over,
});

describe('cobro del mes', () => {
  it('mes completo con una sucursal: solo el plan', () => {
    const lines = buildMonthCharge({ month: '2026-10', periods: [plan()], branches: [{ startsOn: '2026-01-10', endsOn: null }] });
    expect(lines).toEqual([expect.objectContaining({ kind: 'plan', days: 31, net: 31000 })]);
  });

  it('segunda sucursal abierta el 21 de octubre: 11 de 31 días del precio por sucursal', () => {
    const lines = buildMonthCharge({
      month: '2026-10',
      periods: [plan()],
      branches: [
        { startsOn: '2026-01-10', endsOn: null },
        { startsOn: '2026-10-21', endsOn: null },
      ],
    });
    const extra = lines.find((l) => l.kind === 'extra_branches')!;
    expect(extra).toMatchObject({ from: '2026-10-21', to: '2026-10-31', quantity: 11, net: 3300 }); // 9.300 × 11 / 31
  });

  it('una sucursal adicional cerrada a mitad de mes cuenta hasta el día en que se cerró (incluido)', () => {
    const lines = buildMonthCharge({
      month: '2026-11',
      periods: [plan({ startsOn: '2026-11-01', extraBranchNet: 3000 })],
      branches: [
        { startsOn: '2026-01-01', endsOn: null },
        { startsOn: '2026-01-01', endsOn: '2026-11-10' },
      ],
    });
    expect(lines.find((l) => l.kind === 'extra_branches')).toMatchObject({ quantity: 10, net: 1000 }); // 3.000 × 10 / 30
  });

  it('prueba y suspensión no cobran el plan ni las sucursales', () => {
    const lines = buildMonthCharge({
      month: '2026-11',
      periods: [
        plan({ kind: 'trial', startsOn: '2026-11-01', endsOn: '2026-11-14', label: 'Prueba' }),
        plan({ startsOn: '2026-11-15', endsOn: '2026-11-24' }),
        plan({ kind: 'suspended', startsOn: '2026-11-25', endsOn: null, label: 'Suspendido', monthlyNet: 0 }),
      ],
      branches: [
        { startsOn: '2026-01-01', endsOn: null },
        { startsOn: '2026-01-01', endsOn: null },
      ],
    });
    expect(lines.map((l) => [l.kind, l.days, l.net])).toEqual([
      ['trial', 14, 0],
      ['plan', 10, 10333], // 31.000 × 10 / 30
      ['suspended', 6, 0],
      ['extra_branches', null, 3100], // 9.300 × 10 / 30
    ]);
  });

  it('un plan que incluye más sucursales, o sin precio por sucursal, no cobra adicionales', () => {
    const branches = [
      { startsOn: '2026-01-01', endsOn: null },
      { startsOn: '2026-01-01', endsOn: null },
    ];
    expect(buildMonthCharge({ month: '2026-10', periods: [plan({ includedBranches: 2 })], branches }).some((l) => l.kind === 'extra_branches')).toBe(false);
    expect(buildMonthCharge({ month: '2026-10', periods: [plan({ extraBranchNet: 0 })], branches }).some((l) => l.kind === 'extra_branches')).toBe(false);
  });

  it('cambio de plan a mitad de mes: cada día usa las sucursales incluidas de su plan', () => {
    const lines = buildMonthCharge({
      month: '2026-10',
      periods: [
        plan({ endsOn: '2026-10-15' }), // incluye 1
        plan({ startsOn: '2026-10-16', label: 'Pro v1', monthlyNet: 62000, includedBranches: 3 }),
      ],
      branches: [
        { startsOn: '2026-01-01', endsOn: null },
        { startsOn: '2026-01-01', endsOn: null },
      ],
    });
    expect(lines.find((l) => l.kind === 'extra_branches')).toMatchObject({ from: '2026-10-01', to: '2026-10-15', quantity: 15, net: 4500 });
  });

  it('totales con ajustes e impuesto; un total negativo no se acepta', () => {
    expect(chargeTotals([{ net: 31000 }, { net: -1000 }], 1900)).toEqual({ net: 30000, tax: 5700, gross: 35700, rateBp: 1900 });
    expect(() => chargeTotals([{ net: 1000 }, { net: -2000 }], 1900)).toThrow(/negativo/);
  });

  it('mes vencido y días de atraso', () => {
    expect(previousMonth('2026-12-01')).toBe('2026-11');
    expect(previousMonth('2027-01-05')).toBe('2026-12');
    expect(overdueDays('2026-12-10', '2026-12-09')).toBe(0);
    expect(overdueDays('2026-12-10', '2026-12-15')).toBe(5);
  });

  it('subir el precio por sucursal o incluir menos sucursales no es una mejora', () => {
    const base = { features: [], prices: { CLP: 10000 }, includedBranches: 2, extraBranchPrices: { CLP: 3000 } };
    expect(comparePlanVersions(base, { ...base, extraBranchPrices: { CLP: 4000 } }).kind).toBe('worse');
    expect(comparePlanVersions(base, { ...base, includedBranches: 1 }).kind).toBe('worse');
    expect(comparePlanVersions(base, { ...base, includedBranches: 3 }).kind).toBe('improvement');
  });
});

describe('formulario de plan: sucursales y prueba', () => {
  it('lee sucursales incluidas, precio por sucursal adicional y días de prueba', async () => {
    const { parsePlanForm } = await import('./plan-forms');
    const base = { code: 'pro', name: 'Pro', feature_branches: 'on' };
    const r = parsePlanForm({ ...base, includedBranches: '2', extraBranch_CLP: '9.300', trialDays: '14' });
    expect(r).toMatchObject({ ok: true, value: { includedBranches: 2, extraBranchPrices: { CLP: 9300 }, trialDays: 14 } });
    expect(parsePlanForm({ ...base, includedBranches: '0' })).toMatchObject({ ok: false });
    expect(parsePlanForm({ ...base, trialDays: '400' })).toMatchObject({ ok: false });
    expect(parsePlanForm(base)).toMatchObject({ ok: true, value: { includedBranches: 1, trialDays: 0 } });
  });

  it('todo plan incluye sucursales, con un límite no menor que las incluidas', async () => {
    const { parsePlanForm } = await import('./plan-forms');
    expect(parsePlanForm({ code: 'pro', name: 'Pro' })).toMatchObject({ ok: false, message: expect.stringMatching(/Sucursales/) });
    expect(parsePlanForm({ code: 'pro', name: 'Pro', feature_branches: 'on', limit_branches: '1', includedBranches: '2' })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/límite/),
    });
    expect(parsePlanForm({ code: 'pro', name: 'Pro', feature_branches: 'on', limit_branches: '', includedBranches: '2' })).toMatchObject({ ok: true });
  });
});
