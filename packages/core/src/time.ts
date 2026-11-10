/**
 * Utilidades de horario. Las horas se guardan en UTC y se muestran en la zona
 * horaria del negocio (directrices, sección 10). Funciones puras y testeadas,
 * incluidos los cambios de horario de verano.
 */
export type TimeRange = { weekday: number; start: string; end: string };

/** "09:30" o "09:30:00" → minutos desde medianoche */
export function timeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) throw new Error(`Hora no válida: ${time}`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) throw new Error(`Hora no válida: ${time}`);
  return h * 60 + m;
}

/** "09:30:00" → "09:30" */
export function trimSeconds(time: string): string {
  return time.slice(0, 5);
}

/** Devuelve los pares de tramos del mismo día que se solapan. */
export function findOverlaps(ranges: readonly TimeRange[]): Array<[TimeRange, TimeRange]> {
  const overlaps: Array<[TimeRange, TimeRange]> = [];
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      if (a.weekday !== b.weekday) continue;
      if (timeToMinutes(a.start) < timeToMinutes(b.end) && timeToMinutes(b.start) < timeToMinutes(a.end)) {
        overlaps.push([a, b]);
      }
    }
  }
  return overlaps;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Instante UTC → "YYYY-MM-DDTHH:MM" en la zona del negocio. */
export function utcToZonedLocal(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Desfase (ms) entre la zona horaria y UTC en un instante dado. */
function offsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Hora local del negocio ("2026-09-06T10:00") → instante UTC (ISO).
 * - Hora que no existe (se adelanta el reloj): se usa el primer instante válido posterior.
 * - Hora ambigua (se atrasa el reloj): se usa la primera ocurrencia.
 */
export function zonedLocalToUtc(local: string, timeZone: string): string {
  const match = LOCAL_PATTERN.exec(local);
  if (!match) throw new Error(`Fecha y hora no válidas: ${local}`);
  const [y, mo, d, h, mi] = match.slice(1).map(Number) as [number, number, number, number, number];
  const target = Date.UTC(y, mo - 1, d, h, mi);
  const candidates = [...new Set([target - offsetMs(target - 86_400_000, timeZone), target - offsetMs(target + 86_400_000, timeZone)])];
  const valid = candidates
    .filter((c) => utcToZonedLocal(new Date(c).toISOString(), timeZone) === local)
    .sort((a, b) => a - b);
  if (valid.length > 0) return new Date(valid[0]!).toISOString();
  // Hora inexistente: el instante correcto es el del desfase anterior al cambio,
  // que cae justo después del salto.
  return new Date(Math.max(...candidates)).toISOString();
}
