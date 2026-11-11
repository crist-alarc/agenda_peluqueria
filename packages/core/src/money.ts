/**
 * Dinero (directrices, sección 20, y ADR 0006).
 *
 * - Cada negocio tiene una moneda (`businesses.currency`, código ISO 4217).
 * - Los montos se guardan siempre como **enteros** en la unidad mínima de esa moneda: pesos para CLP
 *   (sin decimales), centavos para una moneda con 2 decimales. Nunca se usa float para montos.
 * - Agregar una moneda = sumarla a `CURRENCIES` y al check de `businesses.currency` en la base.
 */
export class InvalidAmountError extends Error {}

export interface CurrencyInfo {
  /** Código ISO 4217, ej. 'CLP'. */
  code: string;
  name: string;
  /** Decimales de la moneda: 0 para CLP, 2 para USD. Define la unidad mínima en que se guarda. */
  minorUnits: number;
  /** Idioma y región para mostrar y leer montos (separadores de miles y decimales). */
  locale: string;
}

/** Monedas habilitadas en la app. Debe coincidir con el check de `businesses.currency`. */
export const CURRENCIES = {
  CLP: { code: 'CLP', name: 'Peso chileno', minorUnits: 0, locale: 'es-CL' },
} as const satisfies Record<string, CurrencyInfo>;

export type CurrencyCode = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as [CurrencyCode, ...CurrencyCode[]];

/** Países habilitados (ISO 3166-1). Debe coincidir con el check de `businesses.country`. */
export const COUNTRIES = {
  CL: { code: 'CL', name: 'Chile', defaultCurrency: 'CLP' },
} as const satisfies Record<string, { code: string; name: string; defaultCurrency: CurrencyCode }>;

export type CountryCode = keyof typeof COUNTRIES;
export const COUNTRY_CODES = Object.keys(COUNTRIES) as [CountryCode, ...CountryCode[]];

/** Una moneda se indica por su código (como viene de la base) o por su definición completa. */
export type Currency = string | CurrencyInfo;

export function currencyInfo(currency: Currency): CurrencyInfo {
  if (typeof currency !== 'string') return currency;
  const info = (CURRENCIES as Record<string, CurrencyInfo>)[currency];
  if (!info) throw new Error(`Moneda no habilitada: ${currency}`);
  return info;
}

function separators(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
  };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Convierte un monto escrito por una persona ("$12.000", "12000", "12,50") al entero que se guarda,
 * en la unidad mínima de la moneda. Acepta los separadores de miles y decimales del idioma de la moneda.
 */
export function parseMoney(input: string | number, currency: Currency): number {
  const info = currencyInfo(currency);
  const factor = 10 ** info.minorUnits;
  const invalid =
    info.minorUnits === 0
      ? 'Monto no válido: usa solo números, sin decimales'
      : `Monto no válido: usa números y como máximo ${info.minorUnits} decimales`;

  if (typeof input === 'number') {
    const scaled = Math.round(input * factor);
    if (!Number.isFinite(input) || input < 0 || Math.abs(scaled - input * factor) > 1e-6) {
      throw new InvalidAmountError(info.minorUnits === 0 ? 'El monto debe ser un número entero, sin decimales' : invalid);
    }
    if (!Number.isSafeInteger(scaled)) throw new InvalidAmountError('Monto demasiado grande');
    return scaled;
  }

  const { group, decimal } = separators(info.locale);
  const cleaned = input.trim().replace(/^\$/, '').replace(/\s/g, '');
  const g = escapeRegExp(group);
  const fraction = info.minorUnits > 0 ? `(?:${escapeRegExp(decimal)}(\\d{1,${info.minorUnits}}))?` : '';
  const match = new RegExp(`^(\\d{1,3}(?:${g}\\d{3})+|\\d+)${fraction}$`).exec(cleaned);
  if (!match) throw new InvalidAmountError(invalid);

  const whole = Number(match[1]!.split(group).join(''));
  const minor = match[2] ? Number(match[2].padEnd(info.minorUnits, '0')) : 0;
  const value = whole * factor + minor;
  if (!Number.isSafeInteger(value)) throw new InvalidAmountError('Monto demasiado grande');
  return value;
}

/** 12000 (CLP) → "$12.000"; -123456 (moneda con 2 decimales, en-US) → "-$1,234.56". */
export function formatMoney(amount: number, currency: Currency): string {
  const info = currencyInfo(currency);
  const formatted = new Intl.NumberFormat(info.locale, {
    style: 'currency',
    currency: info.code,
    minimumFractionDigits: info.minorUnits,
    maximumFractionDigits: info.minorUnits,
  }).format(Math.abs(amount) / 10 ** info.minorUnits);
  return `${amount < 0 ? '-' : ''}${formatted}`;
}

/** Valor inicial de un campo de monto: el entero guardado, escrito como lo leerá `parseMoney`. */
export function moneyInputValue(amount: number, currency: Currency): string {
  const info = currencyInfo(currency);
  if (info.minorUnits === 0) return String(amount);
  return new Intl.NumberFormat(info.locale, {
    useGrouping: false,
    minimumFractionDigits: info.minorUnits,
    maximumFractionDigits: info.minorUnits,
  }).format(amount / 10 ** info.minorUnits);
}

/** Ayuda para los campos de monto, ej. "Peso chileno, sin decimales". */
export function moneyInputHint(currency: Currency): string {
  const info = currencyInfo(currency);
  return info.minorUnits === 0 ? `${info.name}, sin decimales` : `${info.name}, hasta ${info.minorUnits} decimales`;
}
