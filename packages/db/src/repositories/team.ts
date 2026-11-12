import type { Role } from '@agenda/core';
import type { DbClient } from '../client';
import { expectRows, unwrap, unwrapMaybe } from '../errors';

export type Member = {
  membershipId: string;
  userId: string;
  role: Role;
  fullName: string | null;
  email: string | null;
  branchIds: string[];
  /** Puede aprobar el acceso de soporte de la plataforma (el dueño siempre puede). */
  canApproveSupport: boolean;
};

export async function listMembers(db: DbClient, businessId: string): Promise<Member[]> {
  const rows = unwrap(
    await db
      .from('memberships')
      .select('id, user_id, role, can_approve_support, profile:profiles(full_name, email), membership_branches(branch_id)')
      .eq('business_id', businessId)
      .order('created_at'),
  );
  return rows.map((r) => ({
    membershipId: r.id,
    userId: r.user_id,
    role: r.role,
    fullName: r.profile?.full_name ?? null,
    email: r.profile?.email ?? null,
    branchIds: r.membership_branches.map((b) => b.branch_id),
    canApproveSupport: r.role === 'owner' || r.can_approve_support,
  }));
}

/** Agrega o cambia el rol de un miembro (la persona debe tener cuenta). */
export async function addMember(
  db: DbClient,
  input: { businessId: string; email: string; role: Role; branchIds: string[] },
): Promise<void> {
  unwrap(
    await db.rpc('app_add_member', {
      p_business_id: input.businessId,
      p_email: input.email,
      p_role: input.role,
      p_branch_ids: input.branchIds,
    }),
  );
}

export async function removeMember(db: DbClient, membershipId: string): Promise<void> {
  expectRows(unwrap(await db.from('memberships').delete().eq('id', membershipId).select('id')));
}

export async function listAudit(db: DbClient, businessId: string, limit = 30) {
  return unwrap(
    await db
      .from('audit_log')
      .select('id, table_name, action, actor_user_id, created_at, old_data, new_data')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
}

export async function getProfile(db: DbClient, userId: string) {
  return unwrapMaybe(await db.from('profiles').select('id, full_name, email').eq('id', userId).maybeSingle());
}
