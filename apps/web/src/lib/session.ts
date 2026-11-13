import 'server-only';
import { getCurrentUser, type CurrentUser } from '@agenda/auth';
import { can, isPlatformManager, type Permission, type PlatformRole } from '@agenda/core';
import { DbError, getBusinessBilling, getBusinessContext, getPlatformRole, type BusinessContext, type DbClient } from '@agenda/db';
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

/**
 * Consola de la plataforma (/admin): solo administradores de la plataforma. A cualquier
 * otra persona se le responde 404, para no revelar que la consola existe (ADR 0008).
 */
export const requirePlatformAdmin = cache(async (): Promise<{ db: DbClient; user: CurrentUser; role: PlatformRole }> => {
  const { db, user } = await requireUser();
  const role = await getPlatformRole(db, user.id);
  if (!role) notFound();
  return { db, user, role };
});

/**
 * Acciones que cambian planes, cobros o el estado de un negocio: dueño o administrador de la
 * plataforma, no agentes (ADR 0010). La base lo vuelve a verificar.
 */
export async function requirePlatformManager() {
  const ctx = await requirePlatformAdmin();
  if (!isPlatformManager(ctx.role)) throw new DbError('Solo un administrador de la plataforma puede hacer esto.', '42501');
  return ctx;
}

/** Estado de los datos de facturación del negocio (ADR 0010), una vez por solicitud. */
export const getBillingState = cache(async (businessId: string) => {
  const { db } = await requireBusiness(businessId);
  return getBusinessBilling(db, businessId);
});

/**
 * Para acciones que modifican el negocio: si la plataforma lo suspendió, el panel queda en solo
 * lectura (ADR 0009). La base además bloquea las reservas nuevas.
 */
export async function requireWritableBusiness(businessId: string) {
  const ctx = await requireBusiness(businessId);
  if (ctx.business.suspended_at) {
    throw new DbError('Tu negocio está suspendido: el panel está en solo lectura. Escríbenos para reactivarlo.', 'P0001');
  }
  if ((await getBillingState(businessId))?.status === 'blocked') {
    throw new DbError('Faltan los datos de facturación: el panel está en pausa hasta que el dueño los complete.', 'P0001');
  }
  return ctx;
}

/** Igual que requireBusiness, pero exige un permiso; si no lo tiene, 404. */
export async function requirePermission(businessId: string, permission: Permission) {
  const ctx = await requireBusiness(businessId);
  if (!can(ctx.membership, permission)) notFound();
  return ctx;
}
