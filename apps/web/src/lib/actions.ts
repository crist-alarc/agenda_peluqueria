import 'server-only';
import { DbError } from '@agenda/db';
import { z } from 'zod';
import { t } from './texts';

/** Estado que devuelven las Server Actions a los formularios. */
export type ActionState = { ok: boolean; message: string } | null;

export const ok = (message: string): ActionState => ({ ok: true, message });
export const fail = (message: string): ActionState => ({ ok: false, message });

/** Convierte cualquier error en un mensaje para el usuario (sin filtrar detalles internos). */
export function toActionError(error: unknown): ActionState {
  if (error instanceof DbError) return fail(error.message);
  if (error instanceof z.ZodError) return fail(error.issues[0]?.message ?? t.errors.invalid);
  console.error(error);
  return fail(t.errors.unexpected);
}

/** FormData → objeto plano (los campos repetidos se vuelven arreglos si `arrays` los nombra). */
export function formToObject(form: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    if (key.startsWith('$ACTION')) continue;
    out[key] = arrays.includes(key) ? form.getAll(key) : form.get(key);
  }
  return out;
}

/** Lee un campo JSON del formulario (los editores de horario y requisitos lo usan). */
export function jsonField(form: FormData, key: string): unknown {
  const raw = form.get(key);
  if (typeof raw !== 'string' || raw === '') return [];
  try {
    return JSON.parse(raw);
  } catch {
    throw new DbError(t.errors.invalid);
  }
}
