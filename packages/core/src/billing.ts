/**
 * Cobro de la suscripción a los clientes de la plataforma (ADR 0009). Funciones puras:
 * impuesto sobre el neto, prorrateo del mes por días calendario y comparación de
 * versiones de un plan ("¿es una mejora para el cliente?").
 *
 * Todos los montos son enteros en la unidad mínima de la moneda del cobro (ADR 0006).
 */
import { FEATURES, type Feature } from './entitlements';

// ---------------------------------------------------------------------------
// Impuesto: el precio se guarda neto; el impuesto y el bruto se calculan
// ---------------------------------------------------------------------------
/** Tasa en puntos básicos: 1900 = 19%. */
export type TaxBreakdown = { net: number; tax: number; gross: number; rateBp: number };

/** Redondeo al entero más cercano (mitades hacia arriba), sin errores de coma flotante en enteros grandes. */
export function roundDiv(numerator: number, denominator: number): number {
  const q = Math.floor(numerator / denominator);
  const r = numerator - q * denominator;
  return r * 2 >= denominator ? q + 1 : q;
}

export function taxBreakdown(net: number, rateBp: number): TaxBreakdown {
  if (!Number.isSafeInteger(net) || net < 0) throw new Error('El neto debe ser un entero no negativo');
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 10000) throw new Error('Tasa de impuesto no válida');
  const tax = roundDiv(net * rateBp, 10000);
  return { net, tax, gross: net + tax, rateBp };
}

/** "19%" o "0%" a partir de puntos básicos. */
export function formatRate(rateBp: number): string {
  return `${(rateBp / 100).toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`;
}

// ---------------------------------------------------------------------------
// Prorrateo del mes
// ---------------------------------------------------------------------------
/**
 * Tramo de la suscripción. Las fechas son días calendario (YYYY-MM-DD), ambos incluidos.
 * Regla del dueño: un cambio hecho el día D se cobra con lo nuevo desde D + 1, así que el
 * tramo anterior termina el día D y el nuevo empieza el D + 1.
 */
export type SubscriptionPeriod = {
  startsOn: string;
  /** null = sigue vigente. */
  endsOn: string | null;
  /** 'plan' se cobra; 'suspended' y 'trial' (período de prueba) no se cobran. */
  kind: 'plan' | 'suspended' | 'trial';
  label: string;
  /** Precio neto mensual del tramo (0 si está suspendido). */
  monthlyNet: number;
};

export type ProratedLine = { label: string; kind: SubscriptionPeriod['kind']; from: string; to: string; days: number; net: number };

export type MonthCharge = { month: string; daysInMonth: number; lines: ProratedLine[]; net: number };

const DAY = 86_400_000;
const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Días del mes (28 a 31). */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Cobro neto de un mes (YYYY-MM): cada tramo aporta su precio mensual × días / días del mes.
 * Los tramos suspendidos aparecen con 0. Los días sin tramo no se cobran.
 */
export function prorateMonth(periods: readonly SubscriptionPeriod[], month: string): MonthCharge {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Mes no válido');
  const total = daysInMonth(month);
  const first = toUtc(`${month}-01`);
  const last = first + (total - 1) * DAY;
  const lines: ProratedLine[] = [];
  for (const p of [...periods].sort((a, b) => a.startsOn.localeCompare(b.startsOn))) {
    const from = Math.max(first, toUtc(p.startsOn));
    const to = Math.min(last, p.endsOn ? toUtc(p.endsOn) : last);
    if (to < from) continue;
    const days = Math.round((to - from) / DAY) + 1;
    const net = p.kind === 'plan' ? roundDiv(p.monthlyNet * days, total) : 0;
    lines.push({ label: p.label, kind: p.kind, from: toDate(from), to: toDate(to), days, net });
  }
  return { month, daysInMonth: total, lines, net: lines.reduce((sum, l) => sum + l.net, 0) };
}

/** Día siguiente (YYYY-MM-DD): desde cuándo se cobra un cambio hecho hoy. */
export function nextDay(date: string): string {
  return toDate(toUtc(date) + DAY);
}

// ---------------------------------------------------------------------------
// Versiones de un plan: ¿la nueva es una mejora para quien ya lo tiene?
// ---------------------------------------------------------------------------
export type PlanFeatureSpec = { feature: string; enabled: boolean; limit: number | null };
export type PlanVersionSpec = {
  features: readonly PlanFeatureSpec[];
  /** Precio neto mensual por moneda de cobro, ej. { CLP: 15000, USD: 1700 }. */
  prices: Readonly<Record<string, number>>;
  /** Sucursales incluidas en el precio (ADR 0011). Por defecto, 1. */
  includedBranches?: number;
  /** Precio neto mensual por cada sucursal adicional, por moneda. */
  extraBranchPrices?: Readonly<Record<string, number>>;
};

export type PlanComparison = {
  /** improvement: mejora algo y no empeora nada; same: mismas condiciones; worse: empeora algo. */
  kind: 'improvement' | 'same' | 'worse';
  better: string[];
  worse: string[];
};

export const FEATURE_LABELS: Record<Feature, string> = {
  branches: 'Sucursales',
  resources: 'Recursos',
  email_notifications: 'Emails',
  whatsapp_messages: 'Mensajes de WhatsApp',
  rules: 'Reglas de cálculo',
  landing: 'Página propia',
  commissions: 'Comisiones',
  partnerships: 'Acuerdos entre negocios',
  sellers: 'Vendedores',
};

const label = (feature: string) => FEATURE_LABELS[feature as Feature] ?? feature;
/** null = sin límite, que es más que cualquier número. */
const limitValue = (limit: number | null) => (limit === null ? Number.POSITIVE_INFINITY : limit);

/**
 * Compara dos versiones desde el punto de vista del cliente. Un cambio mixto (mejora algo
 * pero empeora otra cosa, o sube el precio) cuenta como "worse": ante la duda se respeta
 * lo contratado (decisión del dueño). La plataforma solo sugiere; el dueño decide.
 */
export function comparePlanVersions(previous: PlanVersionSpec, next: PlanVersionSpec): PlanComparison {
  const better: string[] = [];
  const worse: string[] = [];
  const features = new Set([...previous.features.map((f) => f.feature), ...next.features.map((f) => f.feature)]);
  for (const feature of features) {
    const a = previous.features.find((f) => f.feature === feature) ?? { feature, enabled: false, limit: 0 };
    const b = next.features.find((f) => f.feature === feature) ?? { feature, enabled: false, limit: 0 };
    if (a.enabled && !b.enabled) worse.push(`${label(feature)}: deja de estar incluido`);
    else if (!a.enabled && b.enabled) better.push(`${label(feature)}: ahora está incluido`);
    else if (a.enabled && b.enabled && limitValue(a.limit) !== limitValue(b.limit)) {
      const text = `${label(feature)}: de ${a.limit ?? 'sin límite'} a ${b.limit ?? 'sin límite'}`;
      (limitValue(b.limit) > limitValue(a.limit) ? better : worse).push(text);
    }
  }
  const currencies = new Set([...Object.keys(previous.prices), ...Object.keys(next.prices)]);
  for (const currency of currencies) {
    const a = previous.prices[currency];
    const b = next.prices[currency];
    if (a === undefined || b === undefined) {
      if (a !== undefined) worse.push(`Precio en ${currency}: se quita`);
      continue;
    }
    if (b > a) worse.push(`Precio en ${currency}: sube`);
    else if (b < a) better.push(`Precio en ${currency}: baja`);
  }
  const inA = previous.includedBranches ?? 1;
  const inB = next.includedBranches ?? 1;
  if (inB > inA) better.push(`Sucursales incluidas: de ${inA} a ${inB}`);
  else if (inB < inA) worse.push(`Sucursales incluidas: de ${inA} a ${inB}`);
  const extraA = previous.extraBranchPrices ?? {};
  const extraB = next.extraBranchPrices ?? {};
  for (const currency of new Set([...Object.keys(extraA), ...Object.keys(extraB)])) {
    const a = extraA[currency] ?? 0;
    const b = extraB[currency] ?? 0;
    if (b > a) worse.push(`Sucursal adicional en ${currency}: sube`);
    else if (b < a) better.push(`Sucursal adicional en ${currency}: baja`);
  }
  return { kind: worse.length > 0 ? 'worse' : better.length > 0 ? 'improvement' : 'same', better, worse };
}

/** Todas las funciones conocidas, en orden, con su valor en la versión (las que faltan van como no incluidas). */
export function normalizeFeatures(features: readonly PlanFeatureSpec[]): PlanFeatureSpec[] {
  return FEATURES.map((feature) => features.find((f) => f.feature === feature) ?? { feature, enabled: false, limit: null });
}
