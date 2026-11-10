import 'server-only';
import { createDbClient, readDbConfig, type DbClient } from '@agenda/db';
import { cookies } from 'next/headers';

/**
 * Cliente de base de datos para Server Components y Server Actions,
 * con la sesión del usuario leída de las cookies.
 */
export async function getDb(): Promise<DbClient> {
  const store = await cookies();
  return createDbClient(readDbConfig(), {
    getAll: () => store.getAll(),
    setAll: (toSet) => {
      try {
        for (const { name, value, options } of toSet) store.set(name, value, options);
      } catch {
        // En Server Components no se pueden escribir cookies; el proxy renueva la sesión.
      }
    },
  });
}
