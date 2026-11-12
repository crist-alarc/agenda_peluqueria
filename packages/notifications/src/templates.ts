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
  /** null si el negocio no muestra precios (fase 3A): el email no menciona montos. */
  total: string | null;
  /** Sucursal y dirección, si se conocen. */
  place?: string | null;
};

const totalHtml = (d: BookingEmailData) =>
  d.total ? `<p style="margin:0 0 20px;color:#77706a">Total: ${escape(d.total)}</p>` : '<p style="margin:0 0 20px"></p>';

const details = (d: BookingEmailData) =>
  `<p style="margin:0 0 4px"><strong>${escape(d.services.join(' + '))}</strong></p>
<p style="margin:0 0 4px">${escape(d.when)}</p>
${d.place ? `<p style="margin:0 0 4px">${escape(d.place)}</p>` : ''}
${totalHtml(d)}`;

const detailsText = (d: BookingEmailData) =>
  `${d.services.join(' + ')}\n${d.when}\n${d.place ? `${d.place}\n` : ''}${d.total ? `Total: ${d.total}` : ''}`;

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
${totalHtml(d)}
<p style="margin:0 0 12px">${button(d.confirmUrl, 'Confirmar reserva')}</p>
<p style="margin:0">${button(d.cancelUrl, 'Cancelar', false)}</p>`,
  );
  const text = `Hola ${d.customerName},\n\nConfirma tu reserva en ${d.brand} (${services}, ${d.when}${d.total ? `, total ${d.total}` : ''}) en los próximos ${d.holdMinutes} minutos:\n${d.confirmUrl}\n\nPara cancelar: ${d.cancelUrl}\n`;
  return { to: d.to, subject: `Confirma tu reserva en ${d.brand}`, html, text };
}

type AttendanceLinks = { attendUrl: string | null; cancelUrl: string; cancellationHours: number };

const cancelNote = (hours: number) =>
  hours > 0 ? `Puedes cancelar o cambiar tu hora hasta ${hours} ${hours === 1 ? 'hora' : 'horas'} antes.` : 'Puedes cancelar o cambiar tu hora en línea.';

/**
 * Email al quedar confirmada la reserva (fase 2C), con el archivo .ics. Si se
 * reservó dentro del plazo del recordatorio, ya trae "Confirmo asistencia".
 */
export function bookingCreatedEmail(d: BookingEmailData & AttendanceLinks): EmailMessage {
  const html = layout(
    d.brand,
    `<p style="margin:0 0 12px">Hola ${escape(d.customerName)},</p>
<p style="margin:0 0 12px">Tu reserva quedó <strong>confirmada</strong>. Te dejamos el archivo para agregarla a tu calendario.</p>
${details(d)}
${d.attendUrl ? `<p style="margin:0 0 12px">${button(d.attendUrl, 'Confirmo asistencia')}</p>` : ''}
<p style="margin:0 0 12px">${button(d.cancelUrl, 'Cancelar o cambiar', false)}</p>
<p style="margin:0;font-size:13px;color:#77706a">${escape(cancelNote(d.cancellationHours))}</p>`,
  );
  const text = `Hola ${d.customerName},\n\nTu reserva en ${d.brand} quedó confirmada:\n${detailsText(d)}\n\n${
    d.attendUrl ? `Confirmo asistencia: ${d.attendUrl}\n` : ''
  }Cancelar o cambiar: ${d.cancelUrl}\n${cancelNote(d.cancellationHours)}\n`;
  return { to: d.to, subject: `Reserva confirmada en ${d.brand}`, html, text };
}

/** Recordatorio antes de la cita con "Confirmo asistencia" / "Cancelar o cambiar" (sección 18.1). */
export function reminderEmail(d: BookingEmailData & AttendanceLinks & { attendUrl: string; confirmBy: string }): EmailMessage {
  const html = layout(
    d.brand,
    `<p style="margin:0 0 12px">Hola ${escape(d.customerName)},</p>
<p style="margin:0 0 12px">Te recordamos tu hora. ¿Nos confirmas que vienes? Por favor responde antes del <strong>${escape(d.confirmBy)}</strong>.</p>
${details(d)}
<p style="margin:0 0 12px">${button(d.attendUrl, 'Confirmo asistencia')}</p>
<p style="margin:0 0 12px">${button(d.cancelUrl, 'Cancelar o cambiar', false)}</p>
<p style="margin:0;font-size:13px;color:#77706a">${escape(cancelNote(d.cancellationHours))}</p>`,
  );
  const text = `Hola ${d.customerName},\n\nTe recordamos tu hora en ${d.brand}:\n${detailsText(d)}\n\nConfirmo asistencia (antes del ${d.confirmBy}): ${d.attendUrl}\nCancelar o cambiar: ${d.cancelUrl}\n`;
  return { to: d.to, subject: `Recordatorio: tu hora en ${d.brand}`, html, text };
}
