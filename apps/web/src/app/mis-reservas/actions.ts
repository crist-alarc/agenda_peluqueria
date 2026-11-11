'use server';

import { customerCancelBooking } from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, toActionError, type ActionState } from '@/lib/actions';
import { requireUser } from '@/lib/session';

export async function cancelMyBookingAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requireUser();
    await customerCancelBooking(db, z.uuid().parse(form.get('bookingId')));
    revalidatePath('/mis-reservas');
    return ok('Reserva cancelada');
  } catch (error) {
    return toActionError(error);
  }
}
