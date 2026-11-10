'use server';

import { createBusinessSchema } from '@agenda/core';
import { createBusiness } from '@agenda/db';
import { redirect } from 'next/navigation';
import { fail, formToObject, toActionError, type ActionState } from '@/lib/actions';
import { requireUser } from '@/lib/session';

export async function createBusinessAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = createBusinessSchema.safeParse(formToObject(form));
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  let businessId: string;
  try {
    const { db } = await requireUser();
    businessId = await createBusiness(db, parsed.data);
  } catch (error) {
    return toActionError(error);
  }
  redirect(`/panel/${businessId}`);
}
