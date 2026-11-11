import { describe, expect, it } from 'vitest';
import { emailSenderFromEnv, LogSender, MailpitSender, ResendSender } from './email';
import { confirmBookingEmail } from './templates';

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

  it('elige el proveedor según la configuración', () => {
    expect(emailSenderFromEnv({ RESEND_API_KEY: 're_x' })).toBeInstanceOf(ResendSender);
    expect(emailSenderFromEnv({ MAILPIT_URL: 'http://localhost:54324' })).toBeInstanceOf(MailpitSender);
    expect(emailSenderFromEnv({})).toBeInstanceOf(LogSender);
  });
});
