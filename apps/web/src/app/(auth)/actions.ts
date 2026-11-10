'use server';

import { requestPasswordReset, signIn, signOut, signUp, updatePassword } from '@agenda/auth';
import { newPasswordSchema, passwordResetSchema, signInSchema, signUpSchema } from '@agenda/core';
import { redirect } from 'next/navigation';
import { fail, formToObject, ok, toActionError, type ActionState } from '@/lib/actions';
import { getDb } from '@/lib/db';
import { safeNext, siteUrl } from '@/lib/url';

export async function signInAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(formToObject(form));
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  try {
    await signIn(await getDb(), parsed.data.email, parsed.data.password);
  } catch (error) {
    return toActionError(error);
  }
  redirect(safeNext(form.get('next')));
}

export async function signUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(formToObject(form));
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  let needsConfirmation: boolean;
  try {
    ({ needsConfirmation } = await signUp(await getDb(), {
      ...parsed.data,
      redirectTo: `${await siteUrl()}/auth/confirm?next=/panel`,
    }));
  } catch (error) {
    return toActionError(error);
  }
  if (needsConfirmation) {
    return ok('Te enviamos un email para confirmar tu cuenta. Ábrelo y luego vuelve a ingresar.');
  }
  redirect('/panel');
}

export async function requestResetAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = passwordResetSchema.safeParse(formToObject(form));
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  try {
    await requestPasswordReset(await getDb(), parsed.data.email, `${await siteUrl()}/auth/confirm?next=/nueva-clave`);
  } catch (error) {
    return toActionError(error);
  }
  // Mismo mensaje exista o no la cuenta (no revela qué emails están registrados)
  return ok('Si existe una cuenta con ese email, te enviamos un enlace para crear una nueva contraseña.');
}

export async function newPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse(formToObject(form));
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);
  try {
    await updatePassword(await getDb(), parsed.data.password);
  } catch (error) {
    return toActionError(error);
  }
  redirect('/panel');
}

export async function signOutAction(): Promise<void> {
  await signOut(await getDb());
  redirect('/login');
}
