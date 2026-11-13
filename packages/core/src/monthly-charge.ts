/**
 * Cobro mensual a un cliente de la plataforma (ADR 0011). Se cobra a mes vencido, por días
 * calendario: el plan de cada tramo, más las sucursales que superan las incluidas por cada día
 * que estuvieron activas. Los días de prueba y suspendidos no se cobran. Funciones puras.
 */
import { daysInMonth, nextDay, prorateMonth, roundDiv, taxBreakdown, type SubscriptionPeriod, type TaxBreakdown } from './billing';

/** Tramo con lo que hace falta para cobrar sucursales adicionales. */
export type ChargePeriod = SubscriptionPeriod & {
  /** Sucursales incluidas en el plan del tramo. */
  includedBranches: number;
  /** Precio neto mensual por sucursal adicional en la moneda del cobro (0 = no se cobra). */
  extraBranchNet: number;
};

/** Días (YYYY-MM-DD, ambos incluidos) en que una sucursal estuvo activa; endsOn null = sigue activa. */
export type BranchActivity = { startsOn: string; endsOn: string | null };

export type ChargeLineKind = 'plan' | 'trial' | 'suspended' | 'extra_branches' | 'adjustment';

export type ChargeLine = {
  kind: ChargeLineKind;
  label: string;
  from: string | null;
  to: string | null;
  days: number | null;
  /** Para sucursales: días-sucursal cobrados (una sucursal adicional un día = 1). */
  quantity: number | null;
  net: number;
};

export type MonthChargeInput = {
  month: string;
  periods: readonly ChargePeriod[];
  branches: readonly BranchActivity[];
};

const inRange = (day: string, from: string, to: string | null) => day >= from && (to === null || day <= to);

function* monthDays(month: string): Generator<string> {
  let day = `${month}-01`;
  for (let i = 0; i < daysInMonth(month); i++) {
    yield day;
    day = nextDay(day);
  }
}

/**
 * Líneas del cobro de un mes, sin ajustes. Las sucursales adicionales se cuentan día por día:
 * cada día aporta (sucursales activas − incluidas en el plan de ese día) × precio / días del mes.
 * Un día sin tramo, de prueba o suspendido no cobra sucursales.
 */
export function buildMonthCharge(input: MonthChargeInput): ChargeLine[] {
  const { month } = input;
  const plan = prorateMonth(input.periods, month);
  const lines: ChargeLine[] = plan.lines.map((l) => ({
    kind: l.kind,
    label: l.label,
    from: l.from,
    to: l.to,
    days: l.days,
    quantity: null,
    net: l.net,
  }));

  // Sucursales adicionales: se acumula precio × días y se divide una sola vez (un solo redondeo)
  let branchDays = 0;
  let weighted = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const day of monthDays(month)) {
    const period = input.periods.find((p) => inRange(day, p.startsOn, p.endsOn));
    if (!period || period.kind !== 'plan' || period.extraBranchNet <= 0) continue;
    const active = input.branches.filter((b) => inRange(day, b.startsOn, b.endsOn)).length;
    const extra = Math.max(0, active - period.includedBranches);
    if (extra === 0) continue;
    branchDays += extra;
    weighted += extra * period.extraBranchNet;
    first ??= day;
    last = day;
  }
  if (branchDays > 0) {
    lines.push({
      kind: 'extra_branches',
      label: 'Sucursales adicionales',
      from: first,
      to: last,
      days: null,
      quantity: branchDays,
      net: roundDiv(weighted, daysInMonth(month)),
    });
  }
  return lines;
}

/** Total de un cobro: suma de las líneas (los ajustes pueden ser negativos) más el impuesto. */
export function chargeTotals(lines: readonly Pick<ChargeLine, 'net'>[], rateBp: number): TaxBreakdown {
  const net = lines.reduce((sum, l) => sum + l.net, 0);
  if (net < 0) throw new Error('El total del cobro no puede ser negativo');
  return taxBreakdown(net, rateBp);
}

/** Mes anterior a una fecha (YYYY-MM-DD → YYYY-MM): el que se cobra a mes vencido. */
export function previousMonth(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Días de atraso de un cobro facturado (0 si aún no vence). */
export function overdueDays(dueOn: string, today: string): number {
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000);
  return Math.max(0, diff);
}

export const CHARGE_STATUSES = {
  pending: 'Por facturar',
  invoiced: 'Facturado',
  paid: 'Pagado',
  void: 'Anulado',
} as const;
export type ChargeStatus = keyof typeof CHARGE_STATUSES;
