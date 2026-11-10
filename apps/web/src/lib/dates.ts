import { upcomingDates } from '@agenda/core';
import type { WizardDate } from '@/components/booking-wizard';

/** Próximos días con etiquetas en español de Chile, para elegir fecha. */
export function wizardDates(timeZone: string, count: number, now = new Date().toISOString()): WizardDate[] {
  return upcomingDates(now, timeZone, count).map((value) => {
    const d = new Date(`${value}T12:00:00Z`);
    const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-CL', { ...o, timeZone: 'UTC' }).format(d).replace('.', '');
    return { value, weekday: fmt({ weekday: 'short' }), day: fmt({ day: 'numeric' }), month: fmt({ month: 'short' }) };
  });
}

/** "martes 17 de noviembre, 10:30" en la zona del negocio. */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** "martes 17 de noviembre" para una fecha local YYYY-MM-DD. */
export function formatLongDate(date: string): string {
  const text = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
}
