/**
 * Módulo propio de autenticación (directrices, sección 3.1).
 * Toda la app usa estas funciones; solo este archivo conoce Supabase Auth.
 * Si se cambia de proveedor, se reemplaza este módulo y `app.current_user_id()`.
 */
import { DbError, type DbClient } from '@agenda/db';

export type CurrentUser = { id: string; email: string | null };

type AuthErrorLike = { message?: string; code?: string; status?: number } | null;

function authError(error: AuthErrorLike, fallback: string): DbError {
  const code = error?.code ?? '';
  const messages: Record<string, string> = {
    invalid_credentials: 'Email o contraseña incorrectos',
    email_not_confirmed: 'Debes confirmar tu email antes de entrar. Revisa tu bandeja de entrada.',
    user_already_exists: 'Ya existe una cuenta con ese email',
    weak_password: 'La contraseña es demasiado débil',
    over_email_send_rate_limit: 'Se enviaron demasiados emails. Espera unos minutos e intenta de nuevo.',
    same_password: 'La nueva contraseña debe ser distinta de la anterior',
  };
  return new DbError(messages[code] ?? fallback, code);
}

/** Usuario con sesión válida (verificada con el servidor de autenticación), o null. */
export async function getCurrentUser(db: DbClient): Promise<CurrentUser | null> {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function signIn(db: DbClient, email: string, password: string): Promise<void> {
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw authError(error, 'No se pudo iniciar sesión');
}

/**
 * Registro con email y contraseña. Devuelve `needsConfirmation` cuando Supabase
 * exige confirmar el email antes del primer inicio de sesión.
 */
export async function signUp(
  db: DbClient,
  input: { email: string; password: string; fullName: string; redirectTo: string },
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await db.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName }, emailRedirectTo: input.redirectTo },
  });
  if (error) throw authError(error, 'No se pudo crear la cuenta');
  return { needsConfirmation: !data.session };
}

export async function signOut(db: DbClient): Promise<void> {
  await db.auth.signOut();
}

export async function requestPasswordReset(db: DbClient, email: string, redirectTo: string): Promise<void> {
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw authError(error, 'No se pudo enviar el email de recuperación');
}

export async function updatePassword(db: DbClient, password: string): Promise<void> {
  const { error } = await db.auth.updateUser({ password });
  if (error) throw authError(error, 'No se pudo cambiar la contraseña');
}

/** Verifica el enlace de un email (confirmación de cuenta o recuperación) y crea la sesión. */
export async function verifyEmailLink(
  db: DbClient,
  params: { tokenHash?: string | null; type?: string | null; code?: string | null },
): Promise<boolean> {
  if (params.code) {
    const { error } = await db.auth.exchangeCodeForSession(params.code);
    return !error;
  }
  const allowed = ['signup', 'recovery', 'email', 'email_change', 'invite', 'magiclink'] as const;
  type OtpType = (typeof allowed)[number];
  if (params.tokenHash && params.type && (allowed as readonly string[]).includes(params.type)) {
    const { error } = await db.auth.verifyOtp({ token_hash: params.tokenHash, type: params.type as OtpType });
    return !error;
  }
  return false;
}
