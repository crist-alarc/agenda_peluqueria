/**
 * Planes, suscripciones y condiciones de cobro (ADR 0009). La consola usa funciones
 * app_admin_* (solo administradores de la plataforma); el negocio, app_my_plan y app_public_plans.
 */
import type { PlanFeatureSpec } from '@agenda/core';
import type { DbClient } from '../client';
import { unwrap, unwrapMaybe } from '../errors';

export type PlanVersion = {
  id: string;
  version: number;
  features: PlanFeatureSpec[];
  prices: Record<string, number>;
  note: string | null;
  createdAt: string;
  /** Negocios que tienen esta versión. */
  businesses: number;
};

export type AdminPlan = {
  code: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  active: boolean;
  sortOrder: number;
  offeredCountries: string[];
  currentVersionId: string | null;
  /** De la más nueva a la más antigua. */
  versions: PlanVersion[];
};

export async function listAdminPlans(db: DbClient): Promise<AdminPlan[]> {
  return (unwrap(await db.rpc('app_admin_plans')) ?? []) as unknown as AdminPlan[];
}

export type SavePlanInput = {
  code: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  active: boolean;
  offeredCountries: string[];
  features: PlanFeatureSpec[];
  prices: Record<string, number>;
  note: string | null;
};

export async function savePlan(db: DbClient, input: SavePlanInput): Promise<string> {
  return unwrap(
    await db.rpc('app_admin_save_plan', {
      p_code: input.code,
      p_name: input.name,
      p_description: input.description ?? '',
      p_is_public: input.isPublic,
      p_active: input.active,
      p_offered_countries: input.offeredCountries,
      p_features: input.features,
      p_prices: input.prices,
      p_note: input.note ?? undefined,
    }),
  );
}

export async function migratePlanVersion(db: DbClient, fromVersionId: string, note?: string): Promise<number> {
  return unwrap(await db.rpc('app_admin_migrate_plan_version', { p_from_version_id: fromVersionId, p_note: note }));
}

export async function changeBusinessPlan(db: DbClient, businessId: string, planCode: string, note?: string): Promise<void> {
  unwrapMaybe(await db.rpc('app_admin_change_plan', { p_business_id: businessId, p_plan_code: planCode, p_note: note }));
}

export async function addFeatureOverride(
  db: DbClient,
  input: { businessId: string; feature: string; enabled: boolean; limit: number | null; expiresAt: string | null; note: string },
): Promise<string> {
  return unwrap(
    await db.rpc('app_admin_add_override', {
      p_business_id: input.businessId,
      p_feature: input.feature,
      p_enabled: input.enabled,
      p_limit: input.limit,
      p_expires_at: input.expiresAt,
      p_note: input.note,
    }),
  );
}

export async function endFeatureOverride(db: DbClient, overrideId: string): Promise<void> {
  unwrapMaybe(await db.rpc('app_admin_end_override', { p_override_id: overrideId }));
}

export async function suspendBusiness(db: DbClient, businessId: string, reason: string): Promise<void> {
  unwrapMaybe(await db.rpc('app_admin_suspend', { p_business_id: businessId, p_reason: reason }));
}

export async function reactivateBusiness(db: DbClient, businessId: string, note?: string): Promise<void> {
  unwrapMaybe(await db.rpc('app_admin_reactivate', { p_business_id: businessId, p_note: note }));
}

export type AdminPeriod = {
  id: string;
  kind: 'plan' | 'suspended';
  planName: string | null;
  version: number | null;
  currency: string;
  monthlyNet: number | null;
  startsOn: string;
  endsOn: string | null;
  note: string | null;
  createdAt: string;
};

export type FeatureOverride = {
  id: string;
  feature: string;
  enabled: boolean;
  limit: number | null;
  expiresAt: string | null;
  endedAt: string | null;
  note: string;
  createdAt: string;
};

export type AdminBusinessPlan = {
  businessId: string;
  country: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  subscription: {
    planCode: string;
    planName: string;
    version: number;
    versionId: string;
    currentVersionId: string;
    currency: string;
    startedAt: string;
    monthlyNet: number | null;
    features: PlanFeatureSpec[];
  };
  billing: { entityName: string; documentType: string | null; taxRateBp: number | null } | null;
  periods: AdminPeriod[];
  overrides: FeatureOverride[];
  entitlements: Array<{ feature: string; enabled: boolean; limit: number | null; source: string }>;
  usage: { branches: number; resources: number };
};

export async function getAdminBusinessPlan(db: DbClient, businessId: string): Promise<AdminBusinessPlan | null> {
  return (unwrapMaybe(await db.rpc('app_admin_business_plan', { p_business_id: businessId })) ?? null) as unknown as AdminBusinessPlan | null;
}

export type BillingSetup = {
  entities: Array<{ id: string; name: string; country: string; taxId: string | null; active: boolean }>;
  rules: Array<{
    id: string;
    entityId: string;
    clientCountry: string | null;
    currency: string;
    documentType: string;
    taxRateBp: number;
    active: boolean;
  }>;
};

export async function getBillingSetup(db: DbClient): Promise<BillingSetup> {
  return unwrap(await db.rpc('app_admin_billing_setup')) as unknown as BillingSetup;
}

export async function saveBillingEntity(db: DbClient, input: { id: string; name: string; taxId: string | null; active: boolean }) {
  unwrapMaybe(
    await db.rpc('app_admin_save_billing_entity', { p_id: input.id, p_name: input.name, p_tax_id: input.taxId ?? '', p_active: input.active }),
  );
}

export async function saveTaxRule(
  db: DbClient,
  input: { id: string; currency: string; documentType: string; taxRateBp: number; active: boolean },
) {
  unwrapMaybe(
    await db.rpc('app_admin_save_tax_rule', {
      p_id: input.id,
      p_currency: input.currency,
      p_document_type: input.documentType,
      p_tax_rate_bp: input.taxRateBp,
      p_active: input.active,
    }),
  );
}

// ---------------------------------------------------------------------------
// Lado del negocio
// ---------------------------------------------------------------------------
export type PublicPlans = {
  currency: string;
  taxRateBp: number;
  documentType: string;
  plans: Array<{ code: string; name: string; description: string | null; features: PlanFeatureSpec[]; monthlyNet: number | null }>;
};

export async function listPublicPlans(db: DbClient, country = 'CL'): Promise<PublicPlans | null> {
  return (unwrapMaybe(await db.rpc('app_public_plans', { p_country: country })) ?? null) as unknown as PublicPlans | null;
}

export type MyPlan = {
  planName: string;
  description: string | null;
  version: number;
  currency: string;
  monthlyNet: number | null;
  status: string;
  startedAt: string;
  taxRateBp: number | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  overrides: Array<{ feature: string; enabled: boolean; limit: number | null; expiresAt: string | null; note: string }>;
};

export async function getMyPlan(db: DbClient, businessId: string): Promise<MyPlan | null> {
  return (unwrapMaybe(await db.rpc('app_my_plan', { p_business_id: businessId })) ?? null) as unknown as MyPlan | null;
}
