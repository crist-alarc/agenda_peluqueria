import type { CreateBusinessInput, Entitlement, MembershipContext, Role } from '@agenda/core';
import type { DbClient } from '../client';
import type { Tables } from '../database.types';
import { DbError, expectRows, unwrap, unwrapMaybe } from '../errors';

export type Business = Tables<'businesses'>;

export type MyBusiness = Pick<Business, 'id' | 'name' | 'slug' | 'booking_mode' | 'industry_code'> & { role: Role };

export type BusinessContext = {
  business: Business;
  membership: MembershipContext;
};

/** Negocios donde la persona tiene una membresía (selector de contexto "Mi negocio"). */
export async function listMyBusinesses(db: DbClient, userId: string): Promise<MyBusiness[]> {
  const rows = unwrap(
    await db
      .from('memberships')
      .select('role, business:businesses(id, name, slug, booking_mode, industry_code)')
      .eq('user_id', userId)
      .order('created_at'),
  );
  return rows.flatMap((r) => (r.business ? [{ ...r.business, role: r.role }] : []));
}

/** Negocio + rol del usuario en él. null si no es miembro (RLS no lo deja ver). */
export async function getBusinessContext(db: DbClient, businessId: string, userId: string): Promise<BusinessContext | null> {
  const membership = unwrapMaybe(
    await db
      .from('memberships')
      .select('id, role, membership_branches(branch_id), business:businesses(*)')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .maybeSingle(),
  );
  if (!membership?.business) return null;
  return {
    business: membership.business,
    membership: {
      role: membership.role,
      branchIds: membership.membership_branches.map((mb) => mb.branch_id),
    },
  };
}

export async function createBusiness(db: DbClient, input: CreateBusinessInput): Promise<string> {
  return unwrap(
    await db.rpc('app_create_business', {
      p_business_name: input.businessName,
      p_industry_code: input.industryCode,
      p_branch_name: input.branchName,
      p_branch_address: input.branchAddress ?? undefined,
      p_branch_commune: input.branchCommune ?? undefined,
      p_timezone: input.timezone,
    }),
  );
}

export async function updateBusiness(
  db: DbClient,
  businessId: string,
  values: { name: string; phone: string | null; email: string | null; timezone: string; country: string; currency: string },
): Promise<void> {
  expectRows(unwrap(await db.from('businesses').update(values).eq('id', businessId).select('id')));
}

export async function getEntitlements(db: DbClient, businessId: string): Promise<Entitlement[]> {
  return unwrap(
    await db.from('business_entitlements').select('feature, enabled, limit_value').eq('business_id', businessId).order('feature'),
  );
}

export async function getSubscription(db: DbClient, businessId: string) {
  const sub = unwrapMaybe(
    await db
      .from('business_subscriptions')
      .select('plan_code, status, started_at, plan:plans(name, description)')
      .eq('business_id', businessId)
      .maybeSingle(),
  );
  if (!sub) throw new DbError('El negocio no tiene suscripción');
  return sub;
}

/** Cantidad de filas del negocio en una tabla (para límites del plan y resúmenes). */
export async function countByBusiness(
  db: DbClient,
  table: 'branches' | 'resources' | 'services' | 'addons' | 'memberships',
  businessId: string,
): Promise<number> {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq('business_id', businessId);
  if (error) throw new DbError('No se pudo contar los registros');
  return count ?? 0;
}
