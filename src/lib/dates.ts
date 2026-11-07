// Utilidades de fecha. Las fechas "locales del negocio" se manejan como
// strings ISO `YYYY-MM-DD` para evitar problemas de zona horaria del navegador.

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria indicada. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Suma días a una fecha YYYY-MM-DD. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Día de la semana (0 = domingo) de una fecha YYYY-MM-DD. */
export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Lista de `count` fechas consecutivas empezando en `start`. */
export function dateRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** "mar 17 nov" */
export function formatDayShort(isoDate: string): { weekday: string; day: string; month: string } {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es', { ...opts, timeZone: 'UTC' }).format(date).replace('.', '');
  return { weekday: fmt({ weekday: 'short' }), day: fmt({ day: 'numeric' }), month: fmt({ month: 'short' }) };
}

/** "martes, 17 de noviembre de 2026" */
export function formatDayLong(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('es', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Hora (HH:MM) de un timestamp en la zona horaria del negocio. */
export function formatTime(timestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(timestamp),
  );
}

/** Recorta "HH:MM:SS" de Postgres a "HH:MM". */
export function trimSeconds(time: string): string {
  return time.slice(0, 5);
}

/**
 * Convierte una fecha+hora local del negocio (`YYYY-MM-DDTHH:MM`) a ISO UTC.
 * Itera para resolver correctamente el desfase, incluidos cambios de horario.
 */
export function zonedLocalToUtcIso(local: string, timeZone: string): string {
  const [datePart, timePart = '00:00'] = local.split('T') as [string, string?];
  const [y, mo, d] = datePart.split('-').map(Number) as [number, number, number];
  const [h, mi] = timePart.split(':').map(Number) as [number, number];
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const offset = tzOffsetMs(new Date(guess), timeZone);
    guess = target - offset;
  }
  return new Date(guess).toISOString();
}

/** Desfase (ms) entre la zona horaria y UTC en un instante dado. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convierte un timestamp a `YYYY-MM-DDTHH:MM` en la zona del negocio (para <input type="datetime-local">). */
export function utcToZonedLocal(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  return `${todayInTimeZone(timeZone, date)}T${formatTime(timestamp, timeZone)}`;
}
