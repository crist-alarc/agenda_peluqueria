'use server';

import {
  BOOKING_STATUSES,
  can,
  canTransition,
  normalizePhone,
  receptionBookingSchema,
  slotQuerySchema,
  type BookingStatus,
} from '@agenda/core';
import { DbError, searchCustomers, setBookingStatus } from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { BookingInput, SlotQueryInput, WizardCustomer } from '@/components/booking-wizard';
import { fail as failState, ok, toActionError, type ActionState } from '@/lib/actions';
import { availableSlots, bookSlot } from '@/lib/booking';
import { formatDateTime } from '@/lib/dates';
import { requireBusiness } from '@/lib/session';
import { t } from '@/lib/texts';

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

function fail(error: unknown): { ok: false; message: string } {
  if (error instanceof DbError) return { ok: false, message: error.message };
  if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? t.errors.invalid };
  console.error(error);
  return { ok: false, message: t.errors.unexpected };
}

async function reception(businessId: string) {
  const ctx = await requireBusiness(businessId);
  if (!can(ctx.membership, 'bookings.manage')) throw new DbError(t.errors.forbidden, '42501');
  return ctx;
}

export async function getReceptionSlots(input: SlotQueryInput): Promise<Result<Array<{ startsAt: string; label: string }>>> {
  try {
    const q = slotQuerySchema.parse(input);
    const { db, business } = await reception(q.businessId);
    // Recepción puede agendar con menos anticipación que el link público
    return { ok: true, data: await availableSlots(db, q, business.timezone, { ignoreMinAdvance: true }) };
  } catch (error) {
    return fail(error);
  }
}

export async function bookReception(input: BookingInput): Promise<Result<{ summary: string }>> {
  try {
    const b = receptionBookingSchema.parse(input);
    const { db, business } = await reception(b.businessId);
    const customer = b.customerId
      ? { id: b.customerId }
      : { full_name: b.fullName!, phone: normalizePhone(b.phone!), email: b.email };
    const result = await bookSlot(db, db, b, customer, b.notes, business.timezone, { ignoreMinAdvance: true });
    revalidatePath(`/panel/${business.id}/agenda`);
    return { ok: true, data: { summary: `Agendada para el ${formatDateTime(result.startsAt, business.timezone)}.` } };
  } catch (error) {
    return fail(error);
  }
}

export async function searchCustomersAction(businessId: string, query: string): Promise<Result<WizardCustomer[]>> {
  try {
    const { db } = await reception(businessId);
    const rows = await searchCustomers(db, businessId, query);
    return { ok: true, data: rows.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone, email: c.email })) };
  } catch (error) {
    return fail(error);
  }
}

export async function setStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const businessId = z.uuid().parse(form.get('businessId'));
    const bookingId = z.uuid().parse(form.get('bookingId'));
    const from = z.enum(BOOKING_STATUSES).parse(form.get('from'));
    const to = z.enum(BOOKING_STATUSES).parse(form.get('to')) as BookingStatus;
    const { db } = await reception(businessId);
    if (!canTransition(from, to)) return failState(t.errors.invalid);
    const reason = typeof form.get('reason') === 'string' ? String(form.get('reason')).trim() || null : null;
    await setBookingStatus(db, bookingId, to, reason);
    revalidatePath(`/panel/${businessId}/agenda`);
    return ok(t.bookingStatusDone[to] ?? t.saved);
  } catch (error) {
    return toActionError(error);
  }
}
