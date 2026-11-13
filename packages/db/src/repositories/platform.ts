/**
 * Consola de la plataforma (ADR 0008). La consola nunca lee las tablas de los
 * negocios: todo pasa por funciones app_admin_* que exigen ser administrador de
 * la plataforma, y la configuración solo con un acceso de soporte aprobado.
 */
import type { PlatformRole } from '@agenda/core';
import type { DbClient } from '../client';
import type { Tables } from '../database.types';
import { unwrap, unwrapMaybe } from '../errors';

/** Sin fila = no es administrador (resultado válido: por eso unwrapMaybe y no unwrap). */
export async function isPlatformAdmin(db: DbClient, userId: string): Promise<boolean> {
  const row = unwrapMaybe(await db.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle());
  return row != null;
}

/** Rol en la plataforma (ADR 0010), o null si no es parte del equipo. */
export async function getPlatformRole(db: DbClient, userId: string): Promise<PlatformRole | null> {
  const row = unwrapMaybe(await db.from('platform_admins').select('role').eq('user_id', userId).maybeSingle());
  return (row?.role as PlatformRole | undefined) ?? null;
}

export type PlatformMember = { userId: string; name: string | null; email: string | null; role: PlatformRole; createdAt: string; isMe: boolean };

export async function listPlatformTeam(db: DbClient): Promise<PlatformMember[]> {
  return (unwrap(await db.rpc('app_admin_team')) ?? []) as unknown as PlatformMember[];
}

export async function setPlatformTeamMember(db: DbClient, email: string, role: PlatformRole): Promise<void> {
  unwrapMaybe(await db.rpc('app_admin_set_team_member', { p_email: email, p_role: role }));
}

export async function removePlatformTeamMember(db: DbClient, userId: string): Promise<void> {
  unwrapMaybe(await db.rpc('app_admin_remove_team_member', { p_user_id: userId }));
}

export type SupportState = { id: string; status: SupportStatus; expiresAt: string | null; createdAt: string };
export type SupportStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'cancelled';

export type AdminBusiness = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  industry: string;
  bookingMode: string;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  publicBookingEnabled: boolean;
  /** Suspendido por la plataforma (ADR 0009). */
  suspendedAt: string | null;
  bookings30d: number;
  members: number;
  /** Última solicitud de soporte del agente actual para este negocio. */
  support: SupportState | null;
};

export type AdminClient = {
  id: string;
  name: string;
  createdAt: string;
  owner: { id: string; name: string | null; email: string | null; phone: string | null };
  businesses: AdminBusiness[];
};

export async function listAdminClients(db: DbClient, organizationId?: string): Promise<AdminClient[]> {
  return (unwrap(await db.rpc('app_admin_clients', organizationId ? { p_organization_id: organizationId } : {})) ??
    []) as unknown as AdminClient[];
}

export async function requestSupportAccess(
  db: DbClient,
  args: { businessId: string; reason: string; hours: number },
): Promise<string> {
  return unwrap(
    await db.rpc('app_admin_request_support', { p_business_id: args.businessId, p_reason: args.reason, p_hours: args.hours }),
  );
}

export async function cancelSupportAccess(db: DbClient, requestId: string): Promise<void> {
  unwrapMaybe(await db.rpc('app_admin_cancel_support', { p_request_id: requestId }));
}

type Hours = Array<{ weekday: number; start: string; end: string }>;

/** Configuración del negocio para soporte (solo lectura). Cada lectura queda registrada. */
export type SupportSnapshot = {
  accessExpiresAt: string;
  business: {
    id: string;
    name: string;
    slug: string;
    industry: string;
    bookingMode: string;
    timezone: string;
    country: string;
    currency: string;
    phone: string | null;
    email: string | null;
    publicBookingEnabled: boolean;
    showPublicPrices: boolean;
    slotIntervalMinutes: number;
    minAdvanceMinutes: number;
    maxAdvanceDays: number;
    cancellationHours: number;
    confirmationMode: string;
    pendingHoldMinutes: number;
    reminderEnabled: boolean;
    reminderHoursBefore: number;
    confirmationCutoffHours: number;
    settlementPeriod: string;
  };
  plan: { code: string; status: string; startedAt: string } | null;
  entitlements: Array<{ feature: string; enabled: boolean; limit: number | null; source: string }>;
  branches: Array<{
    id: string;
    name: string;
    address: string | null;
    commune: string | null;
    active: boolean;
    deliveryMode: string;
    deliveryFee: number;
    hours: Hours;
    zones: Array<{ name: string; fee: number; active: boolean }>;
  }>;
  resources: Array<{
    id: string;
    name: string;
    type: string;
    skills: string[];
    active: boolean;
    branchId: string;
    isLogistics: boolean;
    maxEventsPerDay: number | null;
    linkedAccount: boolean;
    hours: Hours;
  }>;
  services: Array<{
    id: string;
    name: string;
    active: boolean;
    price: number;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    fullDay: boolean;
    details: Record<string, unknown>;
    photos: number;
    requirements: Array<{ type: string; quantity: number; skill: string | null }>;
  }>;
  addons: Array<{ name: string; price: number; active: boolean; stock: number }>;
  members: Array<{ name: string | null; email: string | null; role: string; canApproveSupport: boolean }>;
  /** Clave "tipo:estado" (ej. "reminder:sent") → cantidad en los últimos 30 días. */
  notifications30d: Record<string, number>;
  totals: { bookings30d: number; customers: number };
};

export async function getSupportSnapshot(db: DbClient, businessId: string): Promise<SupportSnapshot> {
  return unwrap(await db.rpc('app_admin_support_snapshot', { p_business_id: businessId })) as unknown as SupportSnapshot;
}

// ---------------------------------------------------------------------------
// Lado del negocio: solicitudes, aprobación y registro de vistas
// ---------------------------------------------------------------------------
export type SupportRequest = Tables<'support_access_requests'>;

export async function listSupportRequests(db: DbClient, businessId: string, limit = 20): Promise<SupportRequest[]> {
  return unwrap(
    await db
      .from('support_access_requests')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
}

export async function listSupportViews(db: DbClient, businessId: string, limit = 20) {
  return unwrap(
    await db
      .from('support_access_log')
      .select('id, request_id, viewed_at')
      .eq('business_id', businessId)
      .order('viewed_at', { ascending: false })
      .limit(limit),
  );
}

export async function decideSupportRequest(db: DbClient, requestId: string, approve: boolean, hours?: number): Promise<void> {
  unwrapMaybe(
    await db.rpc('app_decide_support_request', { p_request_id: requestId, p_approve: approve, ...(hours ? { p_hours: hours } : {}) }),
  );
}

export async function revokeSupportAccess(db: DbClient, requestId: string): Promise<void> {
  unwrapMaybe(await db.rpc('app_revoke_support_access', { p_request_id: requestId }));
}

export async function setSupportApprover(db: DbClient, membershipId: string, value: boolean): Promise<void> {
  unwrapMaybe(await db.rpc('app_set_support_approver', { p_membership_id: membershipId, p_value: value }));
}
