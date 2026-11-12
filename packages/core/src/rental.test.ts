import { describe, expect, it } from 'vitest';
import {
  deliveryQuote,
  describeServiceDetails,
  logisticsLoad,
  parseServiceDetails,
  parseServiceFields,
  type DeliveryConfig,
} from './rental';

const zonas = [
  { id: 'ph', name: 'Padre Hurtado', fee: 0, active: true },
  { id: 'pen', name: 'Peñaflor', fee: 5000, active: true },
  { id: 'old', name: 'Zona antigua', fee: 1000, active: false },
];

describe('despacho', () => {
  it('incluido: no cobra, pero la zona define la cobertura', () => {
    const c: DeliveryConfig = { mode: 'included', fixedFee: 9999, zones: zonas };
    expect(deliveryQuote(c, 'pen')).toEqual({ ok: true, fee: 0, zoneId: 'pen', zoneName: 'Peñaflor' });
    expect(deliveryQuote(c, null)).toEqual({ ok: false, reason: 'zone_required' });
  });

  it('monto fijo: el mismo costo en cualquier zona cubierta', () => {
    const c: DeliveryConfig = { mode: 'fixed', fixedFee: 8000, zones: zonas };
    expect(deliveryQuote(c, 'ph')).toMatchObject({ ok: true, fee: 8000 });
    expect(deliveryQuote(c, 'pen')).toMatchObject({ ok: true, fee: 8000 });
  });

  it('por zona: cada zona tiene su costo', () => {
    const c: DeliveryConfig = { mode: 'by_zone', fixedFee: 0, zones: zonas };
    expect(deliveryQuote(c, 'ph')).toMatchObject({ ok: true, fee: 0 });
    expect(deliveryQuote(c, 'pen')).toMatchObject({ ok: true, fee: 5000 });
  });

  it('una zona inactiva o de otra sucursal no está cubierta', () => {
    const c: DeliveryConfig = { mode: 'by_zone', fixedFee: 0, zones: zonas };
    expect(deliveryQuote(c, 'old')).toEqual({ ok: false, reason: 'not_covered' });
    expect(deliveryQuote(c, 'otra')).toEqual({ ok: false, reason: 'not_covered' });
  });

  it('sin zonas configuradas se cubre cualquier dirección, salvo en modo por zona', () => {
    expect(deliveryQuote({ mode: 'fixed', fixedFee: 3000, zones: [] }, null)).toEqual({
      ok: true,
      fee: 3000,
      zoneId: null,
      zoneName: null,
    });
    expect(deliveryQuote({ mode: 'by_zone', fixedFee: 0, zones: [] }, null)).toEqual({ ok: false, reason: 'zone_required' });
  });
});

describe('capacidad de logística (avisa, no bloquea)', () => {
  // Hermano A: 3 camiones de hasta 6 eventos cada uno.
  const camionesA = [{ maxEventsPerDay: 6 }, { maxEventsPerDay: 6 }, { maxEventsPerDay: 6 }];

  it('suma los topes de los camiones', () => {
    expect(logisticsLoad(10, camionesA)).toEqual({ events: 10, capacity: 18, level: 'ok' });
    expect(logisticsLoad(18, camionesA).level).toBe('full');
    expect(logisticsLoad(19, camionesA).level).toBe('over');
  });

  it('sin topes configurados no hay aviso', () => {
    expect(logisticsLoad(4, [{ maxEventsPerDay: null }])).toEqual({ events: 4, capacity: null, level: 'unknown' });
    expect(logisticsLoad(4, []).level).toBe('unknown');
  });

  it('ignora los camiones sin tope al sumar', () => {
    expect(logisticsLoad(3, [{ maxEventsPerDay: 3 }, { maxEventsPerDay: null }])).toMatchObject({ capacity: 3, level: 'full' });
  });
});

describe('ficha del servicio', () => {
  const fields = parseServiceFields([
    { key: 'capacity_kids', label: 'Capacidad', type: 'number', unit: 'niños' },
    { key: 'dimensions', label: 'Dimensiones', type: 'text' },
    { key: 'needs_power', label: 'Necesita electricidad', type: 'boolean' },
    { key: 'Mal Formado', label: 'x', type: 'number' },
    'basura',
  ]);

  it('lee los campos válidos de la plantilla', () => {
    expect(fields.map((f) => f.key)).toEqual(['capacity_kids', 'dimensions', 'needs_power']);
    expect(parseServiceFields(null)).toEqual([]);
  });

  it('valida y limpia los datos del formulario', () => {
    expect(parseServiceDetails(fields, { detail_capacity_kids: '1.200', detail_dimensions: ' 4 x 4 m ', detail_needs_power: 'on' })).toEqual({
      ok: true,
      details: { capacity_kids: 1200, dimensions: '4 x 4 m', needs_power: true },
    });
    expect(parseServiceDetails(fields, { detail_capacity_kids: '' })).toEqual({ ok: true, details: {} });
    expect(parseServiceDetails(fields, { detail_capacity_kids: '2,5' })).toMatchObject({ ok: false });
    expect(parseServiceDetails(fields, { detail_capacity_kids: '-1' })).toMatchObject({ ok: false });
    expect(parseServiceDetails(fields, { detail_dimensions: 'x'.repeat(121) })).toMatchObject({ ok: false });
  });

  it('describe la ficha en el orden de la plantilla, con unidades y solo lo que tiene valor', () => {
    expect(describeServiceDetails(fields, { needs_power: false, capacity_kids: 10, otro: 'ignorado' })).toEqual([
      { key: 'capacity_kids', label: 'Capacidad', value: '10 niños' },
      { key: 'needs_power', label: 'Necesita electricidad', value: 'No' },
    ]);
    expect(describeServiceDetails(fields, null)).toEqual([]);
  });
});
