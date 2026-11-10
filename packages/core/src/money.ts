/**
 * Dinero en pesos chilenos como enteros (directrices, sección 20). Nunca float.
 */
export class InvalidAmountError extends Error {}

const CLP_PATTERN = /^(\d{1,3}(\.\d{3})+|\d+)$/;

/** Convierte un monto ingresado por una persona ("$12.000", "12000") a pesos enteros. */
export function parseClp(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isSafeInteger(input) || input < 0) {
      throw new InvalidAmountError('El monto debe ser un número entero, sin decimales');
    }
    return input;
  }
  const cleaned = input.trim().replace(/^\$/, '').replace(/\s/g, '');
  if (!CLP_PATTERN.test(cleaned)) {
    throw new InvalidAmountError('Monto no válido: usa solo números, sin decimales');
  }
  const value = Number(cleaned.replace(/\./g, ''));
  if (!Number.isSafeInteger(value)) throw new InvalidAmountError('Monto demasiado grande');
  return value;
}

/** 12000 → "$12.000" */
export function formatClp(amount: number): string {
  const digits = String(Math.trunc(Math.abs(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${amount < 0 ? '-' : ''}$${digits}`;
}
