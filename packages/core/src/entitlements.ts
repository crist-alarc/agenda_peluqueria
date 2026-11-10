/**
 * Planes y derechos (directrices, sección 17). Funciones puras: reciben los
 * derechos del negocio y responden si una acción está permitida.
 * La base aplica los mismos límites con triggers (garantía final).
 */
export const FEATURES = [
  'branches',
  'resources',
  'email_notifications',
  'whatsapp_messages',
  'rules',
  'landing',
  'commissions',
  'partnerships',
  'sellers',
] as const;
export type Feature = (typeof FEATURES)[number];

export type Entitlement = {
  feature: string;
  enabled: boolean;
  /** null = sin límite */
  limit_value: number | null;
};

export type LimitCheck =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: 'not_included' | 'limit_reached'; limit?: number };

export function findEntitlement(entitlements: readonly Entitlement[], feature: Feature): Entitlement | undefined {
  return entitlements.find((e) => e.feature === feature);
}

export function hasFeature(entitlements: readonly Entitlement[], feature: Feature): boolean {
  return findEntitlement(entitlements, feature)?.enabled ?? false;
}

/** ¿Se puede crear un elemento más de `feature` si ya existen `currentCount`? */
export function checkLimit(entitlements: readonly Entitlement[], feature: Feature, currentCount: number): LimitCheck {
  const e = findEntitlement(entitlements, feature);
  if (!e || !e.enabled) return { allowed: false, reason: 'not_included' };
  if (e.limit_value === null) return { allowed: true, remaining: null };
  if (currentCount >= e.limit_value) return { allowed: false, reason: 'limit_reached', limit: e.limit_value };
  return { allowed: true, remaining: e.limit_value - currentCount - 1 };
}
