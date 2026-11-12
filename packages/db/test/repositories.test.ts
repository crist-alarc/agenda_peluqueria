/**
 * Repositorios que leen con maybeSingle: un resultado vacío es válido y no debe
 * lanzar error (regresión: isPlatformAdmin rompía el panel de quien no es admin).
 */
import { describe, expect, it } from 'vitest';
import type { DbClient } from '../src/client';
import { getServiceFields } from '../src/repositories/catalog';
import { isPlatformAdmin } from '../src/repositories/platform';

function fakeDb(data: unknown): DbClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data, error: null }),
  };
  return { from: () => chain } as unknown as DbClient;
}

describe('lecturas opcionales', () => {
  it('sin fila en platform_admins, la persona no es administradora (sin error)', async () => {
    await expect(isPlatformAdmin(fakeDb(null), 'u1')).resolves.toBe(false);
    await expect(isPlatformAdmin(fakeDb({ user_id: 'u1' }), 'u1')).resolves.toBe(true);
  });

  it('un rubro sin plantilla no tiene campos de ficha (sin error)', async () => {
    await expect(getServiceFields(fakeDb(null), 'x')).resolves.toEqual([]);
  });
});
