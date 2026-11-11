/**
 * Plantillas de email en español de Chile. Siempre con la marca visible de la
 * reserva (sección 18.3). Sin lógica de negocio: reciben datos ya calculados.
 */
import type { EmailMessage } from './email';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(brand: string, body: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6f4f1;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1b19">
<div style="max-width:520px;margin:0 auto;padding:24px">
<p style="font-size:18px;font-weight:600;margin:0 0 16px">${escape(brand)}</p>
<div style="background:#fff;border:1px solid #e4dfd9;border-radius:12px;padding:24px">${body}</div>
<p style="font-size:12px;color:#77706a;margin-top:16px">Si no hiciste esta reserva, ignora este mensaje.</p>
</div></body></html>`;
}

const button = (href: string, label: string, primary = true) =>
  `<a href="${escape(href)}" style="display:inline-block;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;${
    primary ? 'background:#2b3445;color:#fff' : 'background:#fff;color:#2b3445;border:1px solid #c9c3bc'
  }">${escape(label)}</a>`;

export type BookingEmailData = {
  to: string;
  brand: string;
  customerName: string;
  when: string;
  services: string[];
  total: string;
};

/** Email para confirmar una reserva pendiente con un botón (fase 2B). */
export function confirmBookingEmail(
  d: BookingEmailData & { confirmUrl: string; cancelUrl: string; holdMinutes: number },
): EmailMessage {
  const services = d.services.join(' + ');
  const html = layout(
    d.brand,
    `<p style="margin:0 0 12px">Hola ${escape(d.customerName)},</p>
<p style="margin:0 0 12px">Para dejar lista tu reserva, confírmala con el botón. Tienes <strong>${d.holdMinutes} minutos</strong>; si no, el horario se libera.</p>
<p style="margin:0 0 4px"><strong>${escape(services)}</strong></p>
<p style="margin:0 0 4px">${escape(d.when)}</p>
<p style="margin:0 0 20px;color:#77706a">Total: ${escape(d.total)}</p>
<p style="margin:0 0 12px">${button(d.confirmUrl, 'Confirmar reserva')}</p>
<p style="margin:0">${button(d.cancelUrl, 'Cancelar', false)}</p>`,
  );
  const text = `Hola ${d.customerName},\n\nConfirma tu reserva en ${d.brand} (${services}, ${d.when}, total ${d.total}) en los próximos ${d.holdMinutes} minutos:\n${d.confirmUrl}\n\nPara cancelar: ${d.cancelUrl}\n`;
  return { to: d.to, subject: `Confirma tu reserva en ${d.brand}`, html, text };
}
