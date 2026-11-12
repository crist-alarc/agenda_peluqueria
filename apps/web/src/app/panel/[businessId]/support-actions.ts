'use server';

/**
 * Acceso de soporte de la plataforma, lado del negocio (ADR 0008): aprobar o
 * rechazar, revocar y designar quién puede aprobar. La base valida los permisos.
 */
import { supportDecisionSchema } from '@agenda/core';
import * as repo from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, formToObject, ok, toActionError, type ActionState } from '@/lib/actions';
import { requireBusiness } from '@/lib/session';
import { t } from '@/lib/texts';

const id = z.uuid();

export async function decideSupportAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const input = supportDecisionSchema.parse(formToObject(form));
    const { db, business, canApproveSupport } = await requireBusiness(input.businessId);
    if (!canApproveSupport) return fail(t.errors.forbidden);
    const approve = input.decision === 'approve';
    await repo.decideSupportRequest(db, input.requestId, approve, input.hours);
    revalidatePath(`/panel/${business.id}`, 'layout');
    return ok(approve ? 'Acceso aprobado. Puedes revocarlo cuando quieras.' : 'Solicitud rechazada.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function revokeSupportAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business, canApproveSupport } = await requireBusiness(id.parse(form.get('businessId')));
    if (!canApproveSupport) return fail(t.errors.forbidden);
    await repo.revokeSupportAccess(db, id.parse(form.get('requestId')));
    revalidatePath(`/panel/${business.id}`, 'layout');
    return ok('Acceso revocado: soporte ya no puede ver tu configuración.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function setSupportApproverAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business, membership } = await requireBusiness(id.parse(form.get('businessId')));
    if (membership.role !== 'owner') return fail('Solo el dueño puede designar quién aprueba el soporte');
    await repo.setSupportApprover(db, id.parse(form.get('membershipId')), form.get('value') === 'true');
    revalidatePath(`/panel/${business.id}/equipo`);
    return ok(t.saved);
  } catch (error) {
    return toActionError(error);
  }
}
