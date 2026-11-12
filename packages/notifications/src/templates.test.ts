import { describe, expect, it } from 'vitest';
import { emailSenderFromEnv, LogSender, MailpitSender, ResendSender } from './email';
import { calendarIcs } from './ics';
import { bookingCreatedEmail, confirmBookingEmail, reminderEmail } from './templates';

describe('emails', () => {
  it('el email de confirmación lleva la marca, los botones y escapa el HTML', () => {
    const m = confirmBookingEmail({
      to: 'a@b.cl',
      brand: 'Barbería <El Filo>',
      customerName: 'Juan',
      when: 'martes 17 de noviembre, 10:00',
      services: ['Corte', 'Barba'],
      total: '$15.000',
      confirmUrl: 'https://app.cl/reserva/confirmar?t=abc',
      cancelUrl: 'https://app.cl/reserva/cancelar?t=def',
      holdMinutes: 30,
    });
    expect(m.subject).toBe('Confirma tu reserva en Barbería <El Filo>');
    expect(m.html).toContain('Barbería &lt;El Filo&gt;');
    expect(m.html).toContain('href="https://app.cl/reserva/confirmar?t=abc"');
    expect(m.html).toContain('Confirmar reserva');
    expect(m.text).toContain('https://app.cl/reserva/cancelar?t=def');
  });

  it('si el negocio oculta los precios, el email no menciona montos (fase 3A)', () => {
    const m = confirmBookingEmail({
      to: 'a@b.cl',
      brand: 'Inflables PH',
      customerName: 'Ana',
      when: 'sábado 21 de noviembre, 15:00',
      services: ['Castillo inflable'],
      total: null,
      confirmUrl: 'https://app.cl/c',
      cancelUrl: 'https://app.cl/x',
      holdMinutes: 30,
    });
    expect(m.html).not.toContain('Total');
    expect(m.text).not.toContain('total');
    expect(m.text).toContain('Castillo inflable, sábado 21 de noviembre, 15:00)');
  });

  it('elige el proveedor según la configuración', () => {
    expect(emailSenderFromEnv({ RESEND_API_KEY: 're_x' })).toBeInstanceOf(ResendSender);
    expect(emailSenderFromEnv({ MAILPIT_URL: 'http://localhost:54324' })).toBeInstanceOf(MailpitSender);
    expect(emailSenderFromEnv({})).toBeInstanceOf(LogSender);
  });
});

describe('emails de la fase 2C', () => {
  const data = {
    to: 'a@b.cl',
    brand: 'Barbería Sur',
    customerName: 'Ana',
    when: 'viernes 20 de noviembre, 12:00',
    services: ['Corte'],
    total: '$10.000',
    place: 'Centro, Av. Siempre Viva 123',
    cancelUrl: 'https://app.cl/reserva/cancelar?t=c',
    cancellationHours: 4,
  };

  it('el email de reserva confirmada pide asistencia solo si trae el enlace', () => {
    const sin = bookingCreatedEmail({ ...data, attendUrl: null });
    expect(sin.subject).toBe('Reserva confirmada en Barbería Sur');
    expect(sin.html).not.toContain('Confirmo asistencia');
    expect(sin.html).toContain('Cancelar o cambiar');
    expect(sin.text).toContain('hasta 4 horas antes');
    const con = bookingCreatedEmail({ ...data, attendUrl: 'https://app.cl/reserva/asistencia?t=a' });
    expect(con.html).toContain('href="https://app.cl/reserva/asistencia?t=a"');
  });

  it('el recordatorio lleva ambos botones y la hora límite', () => {
    const m = reminderEmail({ ...data, attendUrl: 'https://app.cl/reserva/asistencia?t=a', confirmBy: 'viernes 20 de noviembre, 08:00' });
    expect(m.subject).toBe('Recordatorio: tu hora en Barbería Sur');
    expect(m.html).toContain('Confirmo asistencia');
    expect(m.html).toContain('Cancelar o cambiar');
    expect(m.text).toContain('antes del viernes 20 de noviembre, 08:00');
  });
});

describe('archivo de calendario', () => {
  const ics = calendarIcs(
    {
      uid: 'abc@agenda',
      startsAt: '2026-11-20T15:00:00.000Z',
      endsAt: '2026-11-20T15:45:00.000Z',
      title: 'Corte, barba; y más',
      location: 'Av. Larga '.repeat(12),
    },
    '2026-11-11T12:00:00.000Z',
  );
  it('usa horas UTC, escapa el texto y separa líneas con CRLF', () => {
    expect(ics).toContain('DTSTART:20261120T150000Z\r\n');
    expect(ics).toContain('DTEND:20261120T154500Z\r\n');
    expect(ics).toContain('SUMMARY:Corte\\, barba\\; y más');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  });
  it('corta las líneas largas a 75 bytes', () => {
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(ics).toContain('\r\n ');
  });
});
