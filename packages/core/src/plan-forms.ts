/**
 * Formularios de la consola para planes y cobro (ADR 0009). Convierten lo que escribe
 * el administrador en datos validados; los montos van en la unidad mínima de cada moneda.
 */
import { z } from 'zod';
import type { PlanFeatureSpec } from './billing';
import { FEATURES } from './entitlements';
import { BILLING_CURRENCY_CODES, InvalidAmountError, parseMoney } from './money';

/** Código de país ISO 3166-1 de 2 letras. */
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

export type PlanFormResult =
  | {
      ok: true;
      value: {
        code: string;
        name: string;
        description: string | null;
        isPublic: boolean;
        active: boolean;
        /** Plan sin cobro: solo se asigna con autorización (ADR 0010). */
        isFree: boolean;
        offeredCountries: string[];
        features: PlanFeatureSpec[];
        prices: Record<string, number>;
        /** Sucursales incluidas en el precio, precio por sucursal adicional y días de prueba (ADR 0011). */
        includedBranches: number;
        extraBranchPrices: Record<string, number>;
        trialDays: number;
        note: string | null;
      };
    }
  | { ok: false; message: string };

const isOn = (v: unknown) => v === 'on' || v === 'true' || v === true;
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Campos: code, name, description, isPublic, active, offeredCountries ("CL, PE"), note,
 * price_<MONEDA> (vacío = sin precio en esa moneda), feature_<f> (incluido) y limit_<f> (vacío = sin límite).
 */
export function parsePlanForm(form: Record<string, unknown>): PlanFormResult {
  const code = text(form.code);
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(code)) {
    return { ok: false, message: 'El código del plan debe tener letras minúsculas, números o guion bajo (ej. plan_pro)' };
  }
  const name = text(form.name);
  if (name.length < 2 || name.length > 60) return { ok: false, message: 'El nombre del plan debe tener entre 2 y 60 caracteres' };

  const offeredCountries = text(form.offeredCountries)
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((c) => c.toUpperCase());
  const badCountry = offeredCountries.find((c) => !COUNTRY_CODE_RE.test(c));
  if (badCountry) return { ok: false, message: `País no válido: ${badCountry}. Usa códigos de 2 letras, ej. CL, PE` };

  const prices: Record<string, number> = {};
  for (const currency of BILLING_CURRENCY_CODES) {
    const raw = text(form[`price_${currency}`]);
    if (raw === '') continue;
    try {
      prices[currency] = parseMoney(raw, currency);
    } catch (error) {
      const message = error instanceof InvalidAmountError ? error.message : 'Monto no válido';
      return { ok: false, message: `Precio en ${currency}: ${message}` };
    }
  }

  const extraBranchPrices: Record<string, number> = {};
  for (const currency of BILLING_CURRENCY_CODES) {
    const raw = text(form[`extraBranch_${currency}`]);
    if (raw === '') continue;
    try {
      extraBranchPrices[currency] = parseMoney(raw, currency);
    } catch (error) {
      const message = error instanceof InvalidAmountError ? error.message : 'Monto no válido';
      return { ok: false, message: `Sucursal adicional en ${currency}: ${message}` };
    }
  }
  const includedBranches = text(form.includedBranches) === '' ? 1 : Number(text(form.includedBranches));
  if (!Number.isInteger(includedBranches) || includedBranches < 1 || includedBranches > 1000) {
    return { ok: false, message: 'Las sucursales incluidas deben ser un número entero desde 1' };
  }
  const trialDays = text(form.trialDays) === '' ? 0 : Number(text(form.trialDays));
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) {
    return { ok: false, message: 'Los días de prueba deben ser un número entero entre 0 y 365' };
  }

  const features: PlanFeatureSpec[] = [];
  for (const feature of FEATURES) {
    const enabled = isOn(form[`feature_${feature}`]);
    const rawLimit = text(form[`limit_${feature}`]);
    let limit: number | null = null;
    if (rawLimit !== '') {
      const n = Number(rawLimit);
      if (!Number.isInteger(n) || n < 0 || n > 100000) return { ok: false, message: `Límite de ${feature}: usa un número entero o déjalo vacío` };
      limit = n;
    }
    features.push({ feature, enabled, limit: enabled ? limit : null });
  }

  return {
    ok: true,
    value: {
      code,
      name,
      description: text(form.description) || null,
      isPublic: isOn(form.isPublic) && !isOn(form.isFree),
      active: isOn(form.active),
      isFree: isOn(form.isFree),
      offeredCountries,
      features,
      prices: isOn(form.isFree) ? {} : prices,
      includedBranches,
      extraBranchPrices: isOn(form.isFree) ? {} : extraBranchPrices,
      trialDays: isOn(form.isFree) ? 0 : trialDays,
      note: text(form.note) || null,
    },
  };
}

/** "19" o "10,5" → puntos básicos (1900, 1050). */
export function parseRatePercent(input: string): number | null {
  const n = Number(input.trim().replace('%', '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  const bp = Math.round(n * 100);
  return Math.abs(bp - n * 100) < 1e-6 ? bp : null;
}

export const DOCUMENT_TYPES = {
  boleta_o_factura: 'Boleta o factura, según el cliente',
  boleta: 'Boleta',
  factura: 'Factura',
  factura_exportacion: 'Factura de exportación',
  otro: 'Otro documento',
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const featureOverrideSchema = z.object({
  businessId: z.uuid(),
  feature: z.enum(FEATURES, { message: 'Elige una función' }),
  enabled: z
    .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal('')])
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
  limit: z
    .union([z.literal(''), z.coerce.number().int('El límite debe ser un número entero').min(0).max(100000)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  /** Último día que rige (YYYY-MM-DD); vacío = sin término. */
  until: z
    .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida')])
    .optional()
    .transform((v) => (v ? v : null)),
  note: z.string({ message: 'Indica el motivo' }).trim().min(3, 'Indica el motivo').max(300),
});
