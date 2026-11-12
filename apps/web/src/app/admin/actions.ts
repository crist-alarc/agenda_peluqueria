'use server';

/**
 * Acciones de la consola de la plataforma (ADR 0008). Cada una verifica en el
 * servidor que la persona sea administradora; la base lo vuelve a verificar.
 */
import { supportRequestSchema } from '@agenda/core';
import * as repo from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formToObject, ok, toActionError, type ActionState } from '@/lib/actions';
import { requirePlatformAdmin } from '@/lib/session';

export async function requestSupportAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    const input = supportRequestSchema.parse(formToObject(form));
    await repo.requestSupportAccess(db, input);
    revalidatePath('/admin', 'layout');
    return ok('Solicitud enviada. El negocio la verá en su panel, en Soporte.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function cancelSupportAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    await repo.cancelSupportAccess(db, z.uuid().parse(form.get('requestId')));
    revalidatePath('/admin', 'layout');
    return ok('Listo: ya no tienes acceso a este negocio.');
  } catch (error) {
    return toActionError(error);
  }
}
