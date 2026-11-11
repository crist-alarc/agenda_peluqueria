'use server';

import { bookingTotal, formatClp, normalizePhone, publicBookingSchema, slotQuerySchema } from '@agenda/core';
import { createBookingToken, createServiceDbClient, DbError, getBookingForEmail, getConfirmationMode, getPublicBusiness } from '@agenda/db';
import { confirmBookingEmail, emailSenderFromEnv } from '@agenda/notifications';
import { z } from 'zod';
import type { BookingInput, SlotQueryInput } from '@/components/booking-wizard';
import { availableSlots, bookSlot } from '@/lib/booking';
import { getDb } from '@/lib/db';
import { formatDateTime } from '@/lib/dates';
import { t } from '@/lib/texts';
import { newToken } from '@/lib/tokens';
import { siteUrl } from '@/lib/url';

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

function fail(error: unknown): { ok: false; message: string } {
  if (error instanceof DbError) return { ok: false, message: error.message };
  if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? t.errors.invalid };
  console.error(error);
  return { ok: false, message: t.errors.unexpected };
}

/** El negocio del link debe coincidir con el de la petición (no se confía en el navegador). */
async function businessFor(slug: string, businessId: string) {
  const business = await getPublicBusiness(await getDb(), slug);
  if (!business || business.id !== businessId) throw new DbError('Este negocio no está recibiendo reservas');
  return business;
}

export async function getPublicSlots(slug: string, input: SlotQueryInput): Promise<Result<Array<{ startsAt: string; label: string }>>> {
  try {
    const q = slotQuerySchema.parse(input);
    const business = await businessFor(slug, q.businessId);
    return { ok: true, data: await availableSlots(await getDb(), q, business.timezone) };
  } catch (error) {
    return fail(error);
  }
}

/** Envía el email con los botones Confirmar / Cancelar de una reserva pendiente. */
async function sendConfirmationEmail(service: ReturnType<typeof createServiceDbClient>, bookingId: string) {
  const b = await getBookingForEmail(service, bookingId);
  if (b.status !== 'pending' || !b.customer?.email || !b.business || !b.hold_expires_at) return;
  const confirm = newToken();
  const cancel = newToken();
  await createBookingToken(service, { bookingId, purpose: 'confirm', tokenHash: confirm.hash, expiresAt: b.hold_expires_at });
  await createBookingToken(service, { bookingId, purpose: 'cancel', tokenHash: cancel.hash, expiresAt: b.starts_at });
  const base = await siteUrl();
  await emailSenderFromEnv().send(
    confirmBookingEmail({
      to: b.customer.email,
      brand: b.business.name,
      customerName: b.customer.full_name.split(' ')[0] ?? b.customer.full_name,
      when: formatDateTime(b.starts_at, b.business.timezone),
      services: [...b.booking_items].sort((x, y) => x.position - y.position).map((i) => i.service_name),
      total: formatClp(bookingTotal([{ priceClp: b.total_clp }])),
      confirmUrl: `${base}/reserva/confirmar?t=${confirm.raw}`,
      cancelUrl: `${base}/reserva/cancelar?t=${cancel.raw}`,
      holdMinutes: b.business.pending_hold_minutes,
    }),
  );
}

export async function bookPublic(slug: string, input: BookingInput): Promise<Result<{ summary: string; title?: string }>> {
  try {
    const b = publicBookingSchema.parse(input);
    const business = await businessFor(slug, b.businessId);
    const service = createServiceDbClient();
    const mode = await getConfirmationMode(service, business.id);
    if (mode === 'email' && !b.email) throw new DbError('Ingresa tu email: te enviaremos un botón para confirmar la reserva');

    const result = await bookSlot(
      await getDb(),
      // Solo el servidor crea reservas del link público, con la clave de servicio
      service,
      b,
      { full_name: b.fullName, phone: normalizePhone(b.phone), email: b.email },
      b.notes,
      business.timezone,
    );
    const when = formatDateTime(result.startsAt, business.timezone);
    if (mode === 'email') {
      try {
        await sendConfirmationEmail(service, result.bookingId);
      } catch (error) {
        console.error('No se pudo enviar el email de confirmación', error);
      }
      return {
        ok: true,
        data: {
          title: 'Revisa tu email',
          summary: `Apartamos tu hora del ${when} en ${business.name}. Para confirmarla, presiona el botón del email que te enviamos a ${b.email}.`,
        },
      };
    }
    return { ok: true, data: { summary: `Te esperamos el ${when} en ${business.name}.` } };
  } catch (error) {
    return fail(error);
  }
}
