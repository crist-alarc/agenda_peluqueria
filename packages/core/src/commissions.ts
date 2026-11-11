/**
 * Comisiones del equipo (directrices, sección 16; ADR 0005). Funciones puras.
 *
 * - Una regla da un porcentaje o un monto fijo, por persona y/o por servicio.
 *   Gana la más específica: persona + servicio > servicio > persona > general.
 * - Si varios profesionales atienden un mismo servicio, se reparte según la
 *   "receta" del servicio (ej. corte 70% / secado 30%) o, si no hay, en partes
 *   iguales. El administrador puede cambiar el reparto a mano (por % o por
 *   minutos). El reparto siempre suma 100% (10.000 puntos básicos).
 * - Los adicionales se reparten entre los servicios según su precio y luego
 *   según el reparto de cada servicio; solo suman si la regla lo indica y solo
 *   para reglas de porcentaje.
 * - Todos los montos en pesos chilenos enteros.
 */

/** 100% expresado en puntos básicos (1% = 100). */
export const FULL_SHARE = 10_000;

export type CommissionRule = {
  id: string;
  professionalId: string | null;
  serviceId: string | null;
  kind: 'percent' | 'fixed';
  /** percent: puntos básicos (40% = 4000). fixed: pesos por servicio. */
  value: number;
  includeAddons: boolean;
  active: boolean;
};

export type Share = { professionalId: string; shareBp: number };

export class CommissionError extends Error {}

/** Regla que se aplica a una persona en un servicio (o null si no hay). */
export function findRule(rules: readonly CommissionRule[], professionalId: string, serviceId: string): CommissionRule | null {
  const active = rules.filter((r) => r.active);
  return (
    active.find((r) => r.professionalId === professionalId && r.serviceId === serviceId) ??
    active.find((r) => r.professionalId === null && r.serviceId === serviceId) ??
    active.find((r) => r.professionalId === professionalId && r.serviceId === null) ??
    active.find((r) => r.professionalId === null && r.serviceId === null) ??
    null
  );
}

/** ¿El reparto es válido? Personas distintas, partes positivas y suma 100%. */
export function validateShares(shares: readonly Share[]): string | null {
  if (shares.length === 0) return 'Indica al menos una persona';
  if (new Set(shares.map((s) => s.professionalId)).size !== shares.length) return 'Una persona aparece dos veces';
  if (shares.some((s) => !Number.isInteger(s.shareBp) || s.shareBp <= 0)) return 'Cada parte debe ser mayor que 0%';
  const total = shares.reduce((sum, s) => sum + s.shareBp, 0);
  if (total !== FULL_SHARE) return `El reparto debe sumar 100% (suma ${formatPercent(total)})`;
  return null;
}

/**
 * Convierte pesos relativos (ej. minutos trabajados, o porcentajes con
 * decimales) en partes que suman exactamente 100%. Usa el método del mayor
 * resto para que no se pierda ni sobre ningún punto por redondeo.
 */
export function sharesFromWeights(weights: ReadonlyArray<{ professionalId: string; weight: number }>): Share[] {
  const valid = weights.filter((w) => w.weight > 0);
  const total = valid.reduce((sum, w) => sum + w.weight, 0);
  if (valid.length === 0 || total <= 0) throw new CommissionError('Indica cuánto trabajó cada persona');
  const raw = valid.map((w) => ({ professionalId: w.professionalId, exact: (w.weight * FULL_SHARE) / total }));
  const shares = raw.map((r) => ({ professionalId: r.professionalId, shareBp: Math.floor(r.exact) }));
  let missing = FULL_SHARE - shares.reduce((sum, s) => sum + s.shareBp, 0);
  const order = raw.map((r, i) => ({ i, rest: r.exact - Math.floor(r.exact) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (missing <= 0) break;
    shares[i]!.shareBp += 1;
    missing -= 1;
  }
  return shares;
}

export type RecipeRole = { label: string; shareBp: number; requiredSkill: string | null };
export type Participant = { professionalId: string; skills: readonly string[] };

/**
 * Reparto por defecto de un servicio: una persona = 100%. Con varias, se usa
 * la receta del servicio si calza (misma cantidad de roles que de personas;
 * cada rol con habilidad va a quien la tiene); si no, partes iguales.
 */
export function defaultShares(participants: readonly Participant[], recipe: readonly RecipeRole[]): Share[] {
  const unique = participants.filter((p, i) => participants.findIndex((q) => q.professionalId === p.professionalId) === i);
  if (unique.length === 0) return [];
  if (unique.length === 1) return [{ professionalId: unique[0]!.professionalId, shareBp: FULL_SHARE }];
  if (recipe.length === unique.length && recipe.reduce((s, r) => s + r.shareBp, 0) === FULL_SHARE) {
    const free = [...unique];
    const assigned: Share[] = [];
    // Primero los roles que exigen una habilidad, luego el resto en orden
    const roles = [...recipe].sort((a, b) => Number(!!b.requiredSkill) - Number(!!a.requiredSkill));
    for (const role of roles) {
      const idx = role.requiredSkill ? free.findIndex((p) => p.skills.includes(role.requiredSkill!)) : 0;
      if (idx < 0) break;
      assigned.push({ professionalId: free[idx]!.professionalId, shareBp: role.shareBp });
      free.splice(idx, 1);
    }
    if (assigned.length === unique.length) return assigned;
  }
  return sharesFromWeights(unique.map((p) => ({ professionalId: p.professionalId, weight: 1 })));
}

export type CommissionItem = {
  bookingItemId: string;
  serviceId: string;
  price: number;
  shares: readonly Share[];
};

export type CommissionLine = {
  professionalId: string;
  bookingItemId: string;
  serviceId: string;
  ruleId: string | null;
  ruleKind: 'percent' | 'fixed' | null;
  ruleValue: number | null;
  shareBp: number;
  /** Parte del precio del servicio que le corresponde. */
  baseAmount: number;
  /** Parte de los adicionales que le corresponde (0 si la regla no los incluye). */
  addonBaseAmount: number;
  amount: number;
};

/** Comisiones de una reserva completada: una línea por persona y servicio. */
export function computeBookingCommissions(
  items: readonly CommissionItem[],
  addonsTotal: number,
  rules: readonly CommissionRule[],
): CommissionLine[] {
  const itemsTotal = items.reduce((sum, i) => sum + i.price, 0);
  const lines: CommissionLine[] = [];
  for (const item of items) {
    const error = validateShares(item.shares);
    if (error) throw new CommissionError(error);
    // Adicionales de la reserva repartidos entre servicios según su precio
    const itemAddons =
      itemsTotal > 0 ? (addonsTotal * item.price) / itemsTotal : addonsTotal / Math.max(items.length, 1);
    for (const share of item.shares) {
      const rule = findRule(rules, share.professionalId, item.serviceId);
      const base = (item.price * share.shareBp) / FULL_SHARE;
      const addonBase = rule?.includeAddons && rule.kind === 'percent' ? (itemAddons * share.shareBp) / FULL_SHARE : 0;
      let amount = 0;
      if (rule?.kind === 'percent') amount = ((base + addonBase) * rule.value) / FULL_SHARE;
      if (rule?.kind === 'fixed') amount = (rule.value * share.shareBp) / FULL_SHARE;
      lines.push({
        professionalId: share.professionalId,
        bookingItemId: item.bookingItemId,
        serviceId: item.serviceId,
        ruleId: rule?.id ?? null,
        ruleKind: rule?.kind ?? null,
        ruleValue: rule?.value ?? null,
        shareBp: share.shareBp,
        baseAmount: Math.round(base),
        addonBaseAmount: Math.round(addonBase),
        amount: Math.round(amount),
      });
    }
  }
  return lines;
}

export type SettlementEntry = {
  professionalId: string;
  professionalName: string;
  kind: 'service' | 'adjustment';
  amount: number;
};

export type SettlementSummary = {
  total: number;
  people: Array<{ professionalId: string; name: string; servicesTotal: number; adjustmentsTotal: number; total: number; count: number }>;
};

/** Totales por persona de una liquidación (ordenados por nombre). */
export function summarizeSettlement(entries: readonly SettlementEntry[]): SettlementSummary {
  const map = new Map<string, SettlementSummary['people'][number]>();
  for (const e of entries) {
    const p = map.get(e.professionalId) ?? {
      professionalId: e.professionalId,
      name: e.professionalName,
      servicesTotal: 0,
      adjustmentsTotal: 0,
      total: 0,
      count: 0,
    };
    if (e.kind === 'service') {
      p.servicesTotal += e.amount;
      p.count += 1;
    } else p.adjustmentsTotal += e.amount;
    p.total += e.amount;
    map.set(e.professionalId, p);
  }
  const people = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return { total: people.reduce((sum, p) => sum + p.total, 0), people };
}

export const SETTLEMENT_PERIODS = ['weekly', 'biweekly', 'monthly'] as const;
export type SettlementPeriod = (typeof SETTLEMENT_PERIODS)[number];

/**
 * Período que se propone para la próxima liquidación (fechas locales
 * YYYY-MM-DD, ambas incluidas): el último período completo antes de `today`.
 * Semanal: lunes a domingo. Quincenal: 1–15 y 16–fin de mes. Mensual: mes completo.
 */
export function proposePeriod(period: SettlementPeriod, today: string): { start: string; end: string } {
  const d = new Date(`${today}T12:00:00Z`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const day = (y: number, m: number, dd: number) => new Date(Date.UTC(y, m, dd, 12));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (period === 'weekly') {
    const weekday = (d.getUTCDay() + 6) % 7; // lunes = 0
    const thisMonday = day(y, m, d.getUTCDate() - weekday);
    const start = new Date(thisMonday.getTime() - 7 * 86_400_000);
    return { start: iso(start), end: iso(new Date(thisMonday.getTime() - 86_400_000)) };
  }
  if (period === 'biweekly') {
    if (d.getUTCDate() > 15) return { start: iso(day(y, m, 1)), end: iso(day(y, m, 15)) };
    return { start: iso(day(y, m - 1, 16)), end: iso(day(y, m, 0)) };
  }
  return { start: iso(day(y, m - 1, 1)), end: iso(day(y, m, 0)) };
}

/** 4000 → "40%", 3333 → "33,33%". */
export function formatPercent(bp: number): string {
  const value = bp / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}%`;
}

/** "40" / "33,5" / "33.5" → puntos básicos. null si no es un porcentaje válido. */
export function parsePercent(text: string): number | null {
  const n = Number(String(text).trim().replace('%', '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}
