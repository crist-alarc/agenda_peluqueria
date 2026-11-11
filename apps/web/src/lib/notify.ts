import 'server-only';
import { bookingEmailAsksAttendance, cutoffAt, formatClp, shouldSendReminder, type ReminderSettings } from '@agenda/core';
import {
  claimReminder,
  createBookingToken,
  getBookingEmailData,
  listReminderCandidates,
  logNotification,
  markNotification,
  type BookingEmailData,
  type DbClient,
  type NotificationKind,
} from '@agenda/db';
import {
  bookingCreatedEmail,
  calendarAttachment,
  confirmBookingEmail,
  emailSenderFromEnv,
  reminderEmail,
  type EmailMessage,
} from '@agenda/notifications';
import { formatDateTime } from './dates';
import { newToken } from './tokens';

/**
 * Emails a clientes (sección 18). Las decisiones de "cuándo" están en
 * @agenda/core (reminders.ts); aquí solo se arman y envían, y cada envío
 * queda registrado en notification_log. Usa siempre el cliente de servicio.
 */

const reminderSettings = (b: BookingEmailData): ReminderSettings => ({
  reminderEnabled: b.settings.reminderEnabled,
  reminderHoursBefore: b.settings.reminderHoursBefore,
  confirmationCutoffHours: b.settings.confirmationCutoffHours,
});

function common(b: BookingEmailData) {
  return {
    to: b.customerEmail!,
    brand: b.brand,
    customerName: (b.customerName ?? '').split(' ')[0] || 'hola',
    when: formatDateTime(b.startsAt, b.timezone),
    services: b.services ?? [],
    total: formatClp(b.totalClp),
    place: [b.branchName, b.branchAddress].filter(Boolean).join(' · ') || null,
    cancellationHours: b.settings.cancellationHours,
  };
}

/** Crea un enlace de un solo uso ligado al envío y devuelve la URL. */
async function link(
  service: DbClient,
  base: string,
  b: BookingEmailData,
  notificationId: string,
  purpose: 'confirm' | 'cancel' | 'attend',
  expiresAt: string,
): Promise<string> {
  const token = newToken();
  await createBookingToken(service, { bookingId: b.id, purpose, tokenHash: token.hash, expiresAt, notificationId });
  const path = { confirm: 'confirmar', cancel: 'cancelar', attend: 'asistencia' }[purpose];
  return `${base}/reserva/${path}?t=${token.raw}`;
}

/** Registra, arma y envía. Si falla el proveedor, queda como 'failed' (no se reintenta solo). */
async function deliver(
  service: DbClient,
  b: BookingEmailData,
  kind: NotificationKind,
  build: (notificationId: string) => Promise<EmailMessage>,
): Promise<boolean> {
  const id = await logNotification(service, { businessId: b.businessId, bookingId: b.id, kind, recipient: b.customerEmail! });
  try {
    await emailSenderFromEnv().send(await build(id));
    await markNotification(service, id, { ok: true });
    return true;
  } catch (error) {
    console.error(`No se pudo enviar el email (${kind})`, error);
    await markNotification(service, id, { ok: false, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/**
 * Email al crear una reserva:
 * - pendiente (modo "por email"): botones Confirmar / Cancelar (fase 2B);
 * - confirmada: aviso con .ics y, si ya estamos en el plazo del recordatorio,
 *   el botón "Confirmo asistencia" (reemplaza al recordatorio).
 */
export async function sendBookingEmail(
  service: DbClient,
  bookingId: string,
  base: string,
  now = new Date().toISOString(),
): Promise<boolean> {
  const b = await getBookingEmailData(service, bookingId);
  if (!b.customerEmail) return false;

  if (b.status === 'pending' && b.holdExpiresAt) {
    return deliver(service, b, 'booking_pending', async (id) =>
      confirmBookingEmail({
        ...common(b),
        confirmUrl: await link(service, base, b, id, 'confirm', b.holdExpiresAt!),
        cancelUrl: await link(service, base, b, id, 'cancel', b.startsAt),
        holdMinutes: b.settings.pendingHoldMinutes,
      }),
    );
  }
  if (b.status !== 'confirmed') return false;

  // Si se pide la asistencia en este email, cuenta como recordatorio enviado
  const asksAttendance = bookingEmailAsksAttendance(b.startsAt, reminderSettings(b), now) && (await claimReminder(service, b.id));
  // Cuando pide la asistencia se registra como recordatorio, para medir cuántos confirman
  return deliver(service, b, asksAttendance ? 'reminder' : 'booking_created', async (id) => ({
    ...bookingCreatedEmail({
      ...common(b),
      attendUrl: asksAttendance ? await link(service, base, b, id, 'attend', b.startsAt) : null,
      cancelUrl: await link(service, base, b, id, 'cancel', b.startsAt),
    }),
    attachments: [
      calendarAttachment({
        uid: `${b.id}@agenda`,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        title: `${(b.services ?? []).join(' + ')} · ${b.brand}`,
        location: [b.branchName, b.branchAddress].filter(Boolean).join(', '),
      }),
    ],
  }));
}

/** Tarea programada: envía los recordatorios que correspondan ahora. */
export async function sendDueReminders(service: DbClient, base: string, now = new Date().toISOString()) {
  const candidates = await listReminderCandidates(service, now);
  let sent = 0;
  let failed = 0;
  for (const b of candidates) {
    const settings = reminderSettings(b);
    if (!shouldSendReminder(b, settings, now)) continue;
    // Se marca antes de enviar: si dos ejecuciones coinciden, solo una envía
    if (!(await claimReminder(service, b.id))) continue;
    const ok = await deliver(service, b, 'reminder', async (id) =>
      reminderEmail({
        ...common(b),
        attendUrl: await link(service, base, b, id, 'attend', b.startsAt),
        cancelUrl: await link(service, base, b, id, 'cancel', b.startsAt),
        confirmBy: formatDateTime(cutoffAt(b.startsAt, settings).toISOString(), b.timezone),
      }),
    );
    if (ok) sent++;
    else failed++;
  }
  return { candidates: candidates.length, sent, failed };
}
