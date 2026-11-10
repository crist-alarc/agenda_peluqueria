/**
 * Traduce errores de PostgreSQL/PostgREST a mensajes en español para el usuario.
 */
export class DbError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'DbError';
  }
}

type PostgrestLikeError = { code?: string; message?: string; details?: string | null };

export function toDbError(error: PostgrestLikeError): DbError {
  const code = error.code;
  // Mensajes escritos por nuestras funciones SQL (raise exception ... errcode P0001 / 42501 con texto propio)
  if (code === 'P0001') return new DbError(error.message ?? 'Operación no permitida', code);
  if (code === '42501') {
    const msg = error.message ?? '';
    const ours = /permiso|dueño|sesión/i.test(msg);
    return new DbError(ours ? msg : 'No tienes permiso para hacer esto', code);
  }
  if (code === '23505') return new DbError('Ya existe un registro con esos datos', code);
  if (code === '23503') return new DbError('No se puede eliminar porque está en uso', code);
  if (code === '23514') return new DbError('Algún dato no cumple las reglas (revisa los valores)', code);
  if (code === 'PGRST116') return new DbError('No encontrado o sin permiso', code);
  return new DbError('Ocurrió un error al guardar. Intenta de nuevo.', code);
}

type Response = { data: unknown; error: PostgrestLikeError | null };

/** Lanza DbError si la respuesta trae error o viene vacía; si no, devuelve los datos. */
export function unwrap<R extends Response>(result: R): NonNullable<R['data']> {
  if (result.error) throw toDbError(result.error);
  if (result.data === null || result.data === undefined) throw new DbError('No encontrado o sin permiso', 'PGRST116');
  return result.data as NonNullable<R['data']>;
}

/** Igual que unwrap, pero un resultado vacío (maybeSingle) es válido y devuelve null. */
export function unwrapMaybe<R extends Response>(result: R): R['data'] {
  if (result.error) throw toDbError(result.error);
  return result.data;
}

/** Para escrituras que no devuelven datos: solo verifica que no haya error. */
export function assertOk(result: { error: PostgrestLikeError | null }): void {
  if (result.error) throw toDbError(result.error);
}

/** Para escrituras donde RLS puede filtrar silenciosamente (0 filas afectadas). */
export function expectRows<T>(rows: T[] | null, message = 'No tienes permiso para modificar este registro'): T[] {
  if (!rows || rows.length === 0) throw new DbError(message, '42501');
  return rows;
}
