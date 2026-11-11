/**
 * Archivo de calendario (.ics, RFC 5545) para que el cliente agregue la
 * reserva a su calendario con un toque (sección 18.1).
 */
import type { EmailAttachment } from './email';

export type CalendarEvent = {
  uid: string;
  startsAt: string;
  endsAt: string;
  title: string;
  location?: string | null;
  description?: string | null;
};

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Corta las líneas largas en trozos de 75 bytes como pide el estándar. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, 'utf8') > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
    }
    current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function calendarIcs(e: CalendarEvent, now = new Date().toISOString()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Agenda//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function calendarAttachment(e: CalendarEvent): EmailAttachment {
  return { filename: 'reserva.ics', content: calendarIcs(e), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' };
}
