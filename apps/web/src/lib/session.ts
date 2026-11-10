import 'server-only';
import { getCurrentUser, type CurrentUser } from '@agenda/auth';
import { can, type Permission } from '@agenda/core';
import { getBusinessContext, type BusinessContext, type DbClient } from '@agenda/db';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { getDb } from './db';

/** Usuario con sesión o redirección al login. */
export const requireUser = cache(async (): Promise<{ db: DbClient; user: CurrentUser }> => {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect('/login');
  return { db, user };
});

/** Negocio en el que el usuario es miembro; 404 si no lo es (RLS no lo deja ver). */
export const requireBusiness = cache(
  async (businessId: string): Promise<BusinessContext & { db: DbClient; user: CurrentUser }> => {
    const { db, user } = await requireUser();
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) notFound();
    const ctx = await getBusinessContext(db, businessId, user.id);
    if (!ctx) notFound();
    return { ...ctx, db, user };
  },
);

/** Igual que requireBusiness, pero exige un permiso; si no lo tiene, 404. */
export async function requirePermission(businessId: string, permission: Permission) {
  const ctx = await requireBusiness(businessId);
  if (!can(ctx.membership, permission)) notFound();
  return ctx;
}
