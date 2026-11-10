'use server';

import { normalizePhone, publicBookingSchema, slotQuerySchema } from '@agenda/core';
import { createServiceDbClient, DbError, getPublicBusiness } from '@agenda/db';
import { z } from 'zod';
import type { BookingInput, SlotQueryInput } from '@/components/booking-wizard';
import { availableSlots, bookSlot } from '@/lib/booking';
import { getDb } from '@/lib/db';
import { formatDateTime } from '@/lib/dates';
import { t } from '@/lib/texts';

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

export async function bookPublic(slug: string, input: BookingInput): Promise<Result<{ summary: string }>> {
  try {
    const b = publicBookingSchema.parse(input);
    const business = await businessFor(slug, b.businessId);
    const result = await bookSlot(
      await getDb(),
      // Solo el servidor crea reservas del link público, con la clave de servicio
      createServiceDbClient(),
      b,
      { full_name: b.fullName, phone: normalizePhone(b.phone), email: b.email },
      b.notes,
      business.timezone,
    );
    return {
      ok: true,
      data: { summary: `Te esperamos el ${formatDateTime(result.startsAt, business.timezone)} en ${business.name}.` },
    };
  } catch (error) {
    return fail(error);
  }
}
