/**
 * Datos de facturación de cada negocio y días de gracia (ADR 0010). El dueño del negocio los
 * guarda con app_save_billing_profile; la consola, con app_admin_save_billing_profile.
 */
import type { BillingProfile, BillingStatus, ChargeStatus } from '@agenda/core';
import type { DbClient } from '../client';
import { unwrap, unwrapMaybe } from '../errors';

/** Plazo y forma de pago acordados con un negocio, o los por defecto. */
export type BusinessPayment = {
  termId: string | null;
  termName: string | null;
  termDays: number | null;
  termIsDefault: boolean;
  methodId: string | null;
  methodName: string | null;
  methodIsDefault: boolean;
};

export type StoredBillingProfile = BillingProfile & { updatedAt: string };

export type BusinessBilling = {
  status: BillingStatus;
  /** Último día (incluido) para completar los datos sin que el negocio se bloquee. */
  graceUntil: string;
  isOwner: boolean;
  /** Solo para el dueño. */
  profile: StoredBillingProfile | null;
  /** Datos de otro negocio del mismo dueño, para completar más rápido. */
  suggestion: (BillingProfile & { fromBusiness: string }) | null;
  /** Solo para el dueño: cobros facturados y vencidos sin pagar (ADR 0011). */
  overdue: { count: number; oldestDueOn: string } | null;
};

export async function getBusinessBilling(db: DbClient, businessId: string): Promise<BusinessBilling | null> {
  return (unwrapMaybe(await db.rpc('app_business_billing', { p_business_id: businessId })) ?? null) as unknown as BusinessBilling | null;
}

export async function saveBillingProfile(db: DbClient, businessId: string, profile: BillingProfile): Promise<void> {
  unwrapMaybe(await db.rpc('app_save_billing_profile', { p_business_id: businessId, p_profile: profile }));
}

export type FreePlanRequest = {
  id: string;
  planCode: string;
  endsOn: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string;
  createdAt: string;
  requestedBy: string | null;
};

export type AdminBusinessBilling = {
  status: BillingStatus;
  graceUntil: string;
  profile: StoredBillingProfile | null;
  freePlan: { endsOn: string | null; nextPlanCode: string | null; reason: string; approvedAt: string | null; approvedBy: string | null } | null;
  freeRequests: FreePlanRequest[];
  payment: BusinessPayment;
  charges: Array<{ id: string; month: string; status: ChargeStatus; currency: string; gross: number; folio: string | null; dueOn: string | null; paidOn: string | null }>;
};

export async function getAdminBusinessBilling(db: DbClient, businessId: string): Promise<AdminBusinessBilling | null> {
  return (unwrapMaybe(await db.rpc('app_admin_business_billing', { p_business_id: businessId })) ?? null) as unknown as AdminBusinessBilling | null;
}

export async function adminSaveBillingProfile(db: DbClient, businessId: string, profile: BillingProfile): Promise<void> {
  unwrapMaybe(await db.rpc('app_admin_save_billing_profile', { p_business_id: businessId, p_profile: profile }));
}

export async function extendBillingGrace(db: DbClient, businessId: string, until: string): Promise<void> {
  unwrapMaybe(await db.rpc('app_admin_extend_billing_grace', { p_business_id: businessId, p_until: until }));
}

export type PlatformSettings = { billingGraceMinDays: number };

export async function getPlatformSettings(db: DbClient): Promise<PlatformSettings> {
  return unwrap(await db.rpc('app_admin_settings')) as unknown as PlatformSettings;
}

export async function savePlatformSettings(db: DbClient, settings: PlatformSettings): Promise<void> {
  unwrapMaybe(await db.rpc('app_admin_save_settings', { p_billing_grace_min_days: settings.billingGraceMinDays }));
}
