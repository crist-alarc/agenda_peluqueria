import { describe, expect, it } from 'vitest';
import { attendanceState, bookingEmailAsksAttendance, inAttendanceWindow, shouldSendReminder, type ReminderBooking } from './reminders';
import { reminderSettingsSchema } from './schemas';

const settings = { reminderEnabled: true, reminderHoursBefore: 24, confirmationCutoffHours: 4 };
const startsAt = '2026-11-20T15:00:00.000Z';
const hoursBefore = (h: number) => new Date(Date.parse(startsAt) - h * 3_600_000).toISOString();
const booking = (over: Partial<ReminderBooking> = {}): ReminderBooking => ({
  status: 'confirmed',
  startsAt,
  reminderSentAt: null,
  attendanceConfirmedAt: null,
  customerEmail: 'cliente@test.cl',
  ...over,
});

describe('recordatorios', () => {
  it('se envía desde las horas configuradas antes de la cita y hasta la hora de corte', () => {
    expect(shouldSendReminder(booking(), settings, hoursBefore(25))).toBe(false);
    expect(shouldSendReminder(booking(), settings, hoursBefore(24))).toBe(true);
    expect(shouldSendReminder(booking(), settings, hoursBefore(5))).toBe(true);
    expect(shouldSendReminder(booking(), settings, hoursBefore(4))).toBe(false);
  });

  it('respeta las horas que elige cada negocio', () => {
    const s = { ...settings, reminderHoursBefore: 48, confirmationCutoffHours: 12 };
    expect(shouldSendReminder(booking(), s, hoursBefore(47))).toBe(true);
    expect(shouldSendReminder(booking(), s, hoursBefore(11))).toBe(false);
    expect(shouldSendReminder(booking(), settings, hoursBefore(47))).toBe(false);
  });

  it('no se envía si está desactivado, sin email, ya enviado, ya confirmado o la reserva no está confirmada', () => {
    const now = hoursBefore(10);
    expect(shouldSendReminder(booking(), { ...settings, reminderEnabled: false }, now)).toBe(false);
    expect(shouldSendReminder(booking({ customerEmail: null }), settings, now)).toBe(false);
    expect(shouldSendReminder(booking({ reminderSentAt: hoursBefore(20) }), settings, now)).toBe(false);
    expect(shouldSendReminder(booking({ attendanceConfirmedAt: hoursBefore(20) }), settings, now)).toBe(false);
    expect(shouldSendReminder(booking({ status: 'pending' }), settings, now)).toBe(false);
    expect(shouldSendReminder(booking({ status: 'cancelled' }), settings, now)).toBe(false);
  });

  it('una reserva hecha dentro del plazo pide la asistencia en el mismo email', () => {
    expect(bookingEmailAsksAttendance(startsAt, settings, hoursBefore(30))).toBe(false);
    expect(bookingEmailAsksAttendance(startsAt, settings, hoursBefore(10))).toBe(true);
    // Reservada a última hora (después del corte): no se pregunta
    expect(bookingEmailAsksAttendance(startsAt, settings, hoursBefore(2))).toBe(false);
  });

  it('la ventana usa horas reales aunque cambie el horario de verano', () => {
    // Chile adelanta el reloj el 6 de septiembre de 2026: 24 h antes siguen siendo 24 h reales
    const dst = '2026-09-06T15:00:00.000Z';
    expect(inAttendanceWindow(dst, settings, '2026-09-05T15:00:00.000Z')).toBe(true);
    expect(inAttendanceWindow(dst, settings, '2026-09-05T14:59:00.000Z')).toBe(false);
  });
});

describe('estado de la asistencia en la agenda', () => {
  const sent = { reminderSentAt: hoursBefore(24) };
  it('sin recordatorio enviado no muestra nada', () => {
    expect(attendanceState(booking(), settings, hoursBefore(1))).toBeNull();
  });
  it('esperando antes de la hora de corte, "sin confirmar" después', () => {
    expect(attendanceState(booking(sent), settings, hoursBefore(5))).toBe('waiting');
    expect(attendanceState(booking(sent), settings, hoursBefore(4))).toBe('unconfirmed');
    expect(attendanceState(booking(sent), { ...settings, confirmationCutoffHours: 2 }, hoursBefore(3))).toBe('waiting');
  });
  it('confirmada si el cliente presionó el botón; nada si está cancelada', () => {
    expect(attendanceState(booking({ ...sent, attendanceConfirmedAt: hoursBefore(20) }), settings, hoursBefore(1))).toBe('confirmed');
    expect(attendanceState(booking({ ...sent, status: 'cancelled' }), settings, hoursBefore(1))).toBeNull();
  });
});

describe('configuración de recordatorios', () => {
  const base = { businessId: '00000000-0000-4000-8000-000000000000', reminderEnabled: 'on' };
  it('acepta horas válidas', () => {
    expect(reminderSettingsSchema.parse({ ...base, reminderHoursBefore: '48', confirmationCutoffHours: '6' })).toMatchObject({
      reminderEnabled: true,
      reminderHoursBefore: 48,
      confirmationCutoffHours: 6,
    });
  });
  it('la hora de corte debe ser antes que el recordatorio y estar en rango', () => {
    expect(() => reminderSettingsSchema.parse({ ...base, reminderHoursBefore: '4', confirmationCutoffHours: '4' })).toThrow(
      /antes/,
    );
    expect(() => reminderSettingsSchema.parse({ ...base, reminderHoursBefore: '200', confirmationCutoffHours: '4' })).toThrow();
    expect(() => reminderSettingsSchema.parse({ ...base, reminderHoursBefore: '24', confirmationCutoffHours: '-1' })).toThrow();
  });
});
