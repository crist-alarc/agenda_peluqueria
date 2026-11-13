'use server';

import { parseBillingProfileForm } from '@agenda/core';
import { saveBillingProfile } from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, formToObject, ok, toActionError, type ActionState } from '@/lib/actions';
import { requireBusiness } from '@/lib/session';

/**
 * El dueño guarda sus datos de facturación (ADR 0010). No usa requireWritableBusiness: es justo
 * lo que se puede hacer cuando el panel está en pausa por falta de estos datos.
 */
export async function saveBillingProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const businessId = z.uuid().parse(form.get('businessId'));
    const { db } = await requireBusiness(businessId);
    const parsed = parseBillingProfileForm(formToObject(form));
    if (!parsed.ok) return fail(parsed.message);
    await saveBillingProfile(db, businessId, parsed.value);
    revalidatePath(`/panel/${businessId}`, 'layout');
    return ok('Datos de facturación guardados. Con esto tu negocio sigue funcionando sin interrupciones.');
  } catch (error) {
    return toActionError(error);
  }
}
