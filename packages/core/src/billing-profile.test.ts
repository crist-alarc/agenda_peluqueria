import { describe, expect, it } from 'vitest';
import { formatRut, isPlatformManager, isValidRut, normalizeRut, parseBillingProfileForm, rutCheckDigit } from './billing-profile';
import { parsePlanForm } from './plan-forms';

describe('RUT', () => {
  it('calcula el dígito verificador, incluidos K y 0', () => {
    expect(rutCheckDigit('76086428')).toBe('5');
    expect(rutCheckDigit('11111111')).toBe('1');
    expect(isValidRut('10.000.013-K')).toBe(true);
    expect(isValidRut('5126663-3')).toBe(true);
  });

  it('acepta puntos, guion y k minúscula; rechaza dígito o largo incorrectos', () => {
    expect(isValidRut('76.086.428-5')).toBe(true);
    expect(isValidRut('760864285')).toBe(true);
    expect(isValidRut('10000013-k')).toBe(true);
    expect(isValidRut('76.086.428-6')).toBe(false);
    expect(isValidRut('123-4')).toBe(false);
    expect(isValidRut('abc')).toBe(false);
  });

  it('formatea para leer y normaliza para guardar', () => {
    expect(formatRut('760864285')).toBe('76.086.428-5');
    expect(formatRut('5126663-3')).toBe('5.126.663-3');
    expect(normalizeRut('76.086.428-5')).toBe('76086428-5');
    expect(normalizeRut('10000013k')).toBe('10000013-K');
  });
});

describe('datos de facturación', () => {
  const factura = {
    documentType: 'factura',
    taxId: '76.086.428-5',
    legalName: 'Peluquería SpA',
    activity: 'Peluquería',
    address: 'Av. 1',
    commune: 'Maipú',
    email: 'Pagos@Pelu.cl',
  };

  it('factura completa: normaliza RUT y email', () => {
    const r = parseBillingProfileForm(factura);
    expect(r).toEqual({
      ok: true,
      value: expect.objectContaining({ documentType: 'factura', country: 'CL', taxId: '76086428-5', email: 'pagos@pelu.cl' }),
    });
  });

  it('factura sin giro o sin RUT no pasa', () => {
    expect(parseBillingProfileForm({ ...factura, activity: '' })).toMatchObject({ ok: false, message: expect.stringMatching(/giro/) });
    expect(parseBillingProfileForm({ ...factura, taxId: '' })).toMatchObject({ ok: false });
  });

  it('boleta: basta nombre y email; si trae RUT debe ser válido', () => {
    expect(parseBillingProfileForm({ documentType: 'boleta', legalName: 'Ana', email: 'ana@x.cl' })).toMatchObject({ ok: true });
    expect(parseBillingProfileForm({ documentType: 'boleta', legalName: 'Ana', email: 'ana@x.cl', taxId: '1-1' })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/RUT/),
    });
    expect(parseBillingProfileForm({ documentType: 'boleta', legalName: 'Ana', email: 'no-es-email' })).toMatchObject({ ok: false });
  });

  it('otro país: factura de exportación con dirección; la identificación no se valida como RUT', () => {
    const r = parseBillingProfileForm({ country: 'pe', documentType: 'boleta', taxId: '20123456789', legalName: 'Ana SAC', address: 'Lima', email: 'a@x.pe' });
    expect(r).toMatchObject({ ok: true, value: { country: 'PE', documentType: 'exportacion', taxId: '20123456789' } });
    expect(parseBillingProfileForm({ country: 'PE', legalName: 'Ana SAC', email: 'a@x.pe' })).toMatchObject({ ok: false });
  });

  it('sin documento elegido en Chile', () => {
    expect(parseBillingProfileForm({ legalName: 'Ana', email: 'a@x.cl' })).toMatchObject({ ok: false, message: 'Elige boleta o factura' });
  });
});

describe('roles y planes free', () => {
  it('solo dueño y administrador gestionan', () => {
    expect(isPlatformManager('owner')).toBe(true);
    expect(isPlatformManager('admin')).toBe(true);
    expect(isPlatformManager('agent')).toBe(false);
    expect(isPlatformManager(null)).toBe(false);
  });

  it('un plan free no se publica para el registro y no lleva precios', () => {
    const r = parsePlanForm({ code: 'amigos', name: 'Amigos', isFree: 'on', isPublic: 'on', active: 'on', price_CLP: '10.000' });
    expect(r).toMatchObject({ ok: true, value: { isFree: true, isPublic: false, prices: {} } });
  });
});
