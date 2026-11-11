/**
 * Recordatorios y confirmación de asistencia (directrices, sección 18; ADR 0004).
 *
 * Todo lo que tiene que ver con tiempo es configurable por negocio:
 * - reminderHoursBefore: cuántas horas antes de la cita se envía el recordatorio.
 * - confirmationCutoffHours: hora de corte; si el cliente no confirma antes,
 *   la reserva aparece "sin confirmar" en la agenda.
 *
 * Funciones puras: reciben `now` para poder probarlas.
 */
import type { BookingStatus } from './bookings';

const HOUR = 3_600_000;

export type ReminderSettings = {
  reminderEnabled: boolean;
  reminderHoursBefore: number;
  confirmationCutoffHours: number;
};

export type ReminderBooking = {
  status: BookingStatus;
  startsAt: string;
  reminderSentAt: string | null;
  attendanceConfirmedAt: string | null;
  customerEmail: string | null;
};

/** Momento en que corresponde enviar el recordatorio. */
export function reminderAt(startsAt: string, s: ReminderSettings): Date {
  return new Date(Date.parse(startsAt) - s.reminderHoursBefore * HOUR);
}

/** Hora de corte para confirmar asistencia. */
export function cutoffAt(startsAt: string, s: ReminderSettings): Date {
  return new Date(Date.parse(startsAt) - s.confirmationCutoffHours * HOUR);
}

/**
 * ¿Se puede pedir confirmación de asistencia ahora? Solo entre el momento
 * del recordatorio y la hora de corte (después ya no tiene sentido preguntar).
 */
export function inAttendanceWindow(startsAt: string, s: ReminderSettings, now: string): boolean {
  const t = Date.parse(now);
  return s.reminderEnabled && t >= reminderAt(startsAt, s).getTime() && t < cutoffAt(startsAt, s).getTime();
}

/** ¿Hay que enviar el recordatorio de esta reserva ahora? */
export function shouldSendReminder(b: ReminderBooking, s: ReminderSettings, now: string): boolean {
  return (
    b.status === 'confirmed' &&
    !!b.customerEmail &&
    !b.reminderSentAt &&
    !b.attendanceConfirmedAt &&
    inAttendanceWindow(b.startsAt, s, now)
  );
}

/**
 * ¿El email de una reserva recién confirmada debe pedir ya la asistencia?
 * Pasa cuando se reserva dentro del plazo del recordatorio (ej. hoy para
 * mañana): ese email reemplaza al recordatorio, para no enviar dos seguidos.
 */
export function bookingEmailAsksAttendance(startsAt: string, s: ReminderSettings, now: string): boolean {
  return inAttendanceWindow(startsAt, s, now);
}

export type AttendanceState = 'confirmed' | 'waiting' | 'unconfirmed';

/**
 * Estado de la confirmación de asistencia que se muestra en la agenda:
 * - confirmed: el cliente presionó "Confirmo asistencia" (o recepción lo marcó).
 * - waiting: se le preguntó y aún no llega la hora de corte.
 * - unconfirmed: se le preguntó y pasó la hora de corte sin respuesta.
 * - null: no se le ha preguntado (o la reserva no está activa).
 */
export function attendanceState(
  b: Pick<ReminderBooking, 'status' | 'startsAt' | 'reminderSentAt' | 'attendanceConfirmedAt'>,
  s: ReminderSettings,
  now: string,
): AttendanceState | null {
  if (b.status === 'cancelled' || b.status === 'no_show') return null;
  if (b.attendanceConfirmedAt) return 'confirmed';
  if (!b.reminderSentAt || b.status !== 'confirmed') return null;
  return Date.parse(now) >= cutoffAt(b.startsAt, s).getTime() ? 'unconfirmed' : 'waiting';
}
