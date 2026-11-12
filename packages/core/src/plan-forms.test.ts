import { describe, expect, it } from 'vitest';
import { featureOverrideSchema, parsePlanForm, parseRatePercent } from './plan-forms';

const base = {
  code: 'plan_pro',
  name: 'Plan Pro',
  description: '',
  isPublic: 'on',
  active: 'on',
  offeredCountries: 'cl, pe',
  price_CLP: '20.000',
  price_USD: '24,50',
  feature_branches: 'on',
  limit_branches: '3',
  feature_resources: 'on',
  limit_resources: '',
  feature_commissions: 'on',
  note: 'Nuevo plan',
};

describe('formulario de plan', () => {
  it('lee precios por moneda, países y funciones con límite', () => {
    const r = parsePlanForm(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.prices).toEqual({ CLP: 20000, USD: 2450 });
    expect(r.value.offeredCountries).toEqual(['CL', 'PE']);
    expect(r.value.features.find((f) => f.feature === 'branches')).toEqual({ feature: 'branches', enabled: true, limit: 3 });
    expect(r.value.features.find((f) => f.feature === 'resources')).toEqual({ feature: 'resources', enabled: true, limit: null });
    expect(r.value.features.find((f) => f.feature === 'landing')).toEqual({ feature: 'landing', enabled: false, limit: null });
    expect(r.value.description).toBeNull();
  });

  it('un precio vacío significa que el plan no se cobra en esa moneda', () => {
    const r = parsePlanForm({ ...base, price_USD: '' });
    expect(r.ok && r.value.prices).toEqual({ CLP: 20000 });
  });

  it('rechaza códigos, precios, límites y países inválidos', () => {
    expect(parsePlanForm({ ...base, code: 'Plan Pro' }).ok).toBe(false);
    expect(parsePlanForm({ ...base, price_CLP: '20000,5' })).toMatchObject({ ok: false, message: expect.stringMatching(/Precio en CLP/) });
    expect(parsePlanForm({ ...base, limit_branches: '1,5' }).ok).toBe(false);
    expect(parsePlanForm({ ...base, offeredCountries: 'Chile' }).ok).toBe(false);
  });
});

describe('tasa de impuesto', () => {
  it('convierte porcentaje a puntos básicos', () => {
    expect(parseRatePercent('19')).toBe(1900);
    expect(parseRatePercent('10,5%')).toBe(1050);
    expect(parseRatePercent('0')).toBe(0);
    expect(parseRatePercent('101')).toBeNull();
    expect(parseRatePercent('19,123')).toBeNull();
  });
});

describe('función puntual', () => {
  it('valida función, límite opcional y fecha de término opcional', () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect(featureOverrideSchema.parse({ businessId: id, feature: 'commissions', enabled: 'on', limit: '', until: '2027-01-31', note: 'Regalo' })).toEqual({
      businessId: id,
      feature: 'commissions',
      enabled: true,
      limit: null,
      until: '2027-01-31',
      note: 'Regalo',
    });
    expect(featureOverrideSchema.safeParse({ businessId: id, feature: 'nada', note: 'x' }).success).toBe(false);
  });
});
