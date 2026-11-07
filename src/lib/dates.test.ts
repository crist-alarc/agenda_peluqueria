import { describe, expect, it } from 'vitest';
import { addDays, dateRange, formatTime, todayInTimeZone, utcToZonedLocal, weekdayOf, zonedLocalToUtcIso } from './dates';

describe('dates', () => {
  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('calcula el día de la semana', () => {
    expect(weekdayOf('2026-11-07')).toBe(6); // sábado
    expect(weekdayOf('2026-11-08')).toBe(0); // domingo
  });

  it('genera rangos de fechas', () => {
    expect(dateRange('2026-11-29', 3)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
  });

  it('obtiene la fecha de hoy en otra zona horaria', () => {
    const instant = new Date('2026-11-07T02:00:00Z');
    expect(todayInTimeZone('America/Santiago', instant)).toBe('2026-11-06');
    expect(todayInTimeZone('Europe/Madrid', instant)).toBe('2026-11-07');
  });

  it('formatea horas en la zona del negocio', () => {
    expect(formatTime('2026-11-17T13:00:00Z', 'America/Santiago')).toBe('10:00');
    expect(formatTime('2026-11-17T13:00:00Z', 'Europe/Madrid')).toBe('14:00');
  });

  it('convierte hora local del negocio a UTC y de vuelta', () => {
    expect(zonedLocalToUtcIso('2026-11-17T10:00', 'America/Santiago')).toBe('2026-11-17T13:00:00.000Z');
    expect(zonedLocalToUtcIso('2026-07-01T10:00', 'Europe/Madrid')).toBe('2026-07-01T08:00:00.000Z');
    expect(utcToZonedLocal('2026-07-01T08:00:00.000Z', 'Europe/Madrid')).toBe('2026-07-01T10:00');
  });
});
