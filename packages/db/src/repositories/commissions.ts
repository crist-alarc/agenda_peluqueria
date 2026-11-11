import type { CommissionLine, CommissionRule, Participant, RecipeRole, SettlementPeriod, Share } from '@agenda/core';
import type { DbClient } from '../client';
import type { Tables } from '../database.types';
import { expectRows, unwrap, unwrapMaybe } from '../errors';

/**
 * Comisiones (fase 2D). Las escrituras sensibles (movimientos, liquidaciones,
 * repartos) pasan por funciones de la base que validan permisos y bloqueos.
 */

export type CommissionRuleRow = Tables<'commission_rules'>;

export async function listCommissionRules(db: DbClient, businessId: string): Promise<CommissionRuleRow[]> {
  return unwrap(await db.from('commission_rules').select('*').eq('business_id', businessId).eq('active', true).order('created_at'));
}

export async function createCommissionRule(
  db: DbClient,
  r: { businessId: string; professionalId: string | null; serviceId: string | null; kind: 'percent' | 'fixed'; value: number; includeAddons: boolean },
): Promise<void> {
  // Reemplaza la regla activa de la misma combinación (se conserva en el historial)
  let q = db.from('commission_rules').update({ active: false }).eq('business_id', r.businessId).eq('active', true);
  q = r.professionalId ? q.eq('professional_id', r.professionalId) : q.is('professional_id', null);
  q = r.serviceId ? q.eq('service_id', r.serviceId) : q.is('service_id', null);
  unwrap(await q.select('id'));
  unwrap(
    await db
      .from('commission_rules')
      .insert({
        business_id: r.businessId,
        professional_id: r.professionalId,
        service_id: r.serviceId,
        kind: r.kind,
        value: r.value,
        include_addons: r.includeAddons,
      })
      .select('id'),
  );
}

export async function deactivateCommissionRule(db: DbClient, ruleId: string): Promise<void> {
  expectRows(unwrap(await db.from('commission_rules').update({ active: false }).eq('id', ruleId).select('id')));
}

export async function listServiceRecipes(db: DbClient, businessId: string): Promise<Tables<'service_commission_roles'>[]> {
  return unwrap(await db.from('service_commission_roles').select('*').eq('business_id', businessId).order('position'));
}

export async function setServiceRecipe(db: DbClient, serviceId: string, roles: RecipeRole[]): Promise<void> {
  unwrapMaybe(await db.rpc('app_set_service_recipe', { p_service_id: serviceId, p_roles: roles }));
}

export async function setItemShares(db: DbClient, bookingItemId: string, shares: Array<Share & { minutes?: number | null }>): Promise<void> {
  unwrapMaybe(await db.rpc('app_set_item_shares', { p_booking_item_id: bookingItemId, p_shares: shares }));
}

export async function listItemShares(db: DbClient, bookingItemId: string): Promise<Tables<'booking_item_shares'>[]> {
  return unwrap(await db.from('booking_item_shares').select('*').eq('booking_item_id', bookingItemId));
}

export type BookingCommissionData = {
  bookingId: string;
  businessId: string;
  status: string;
  startsAt: string;
  enabled: boolean;
  locked: boolean;
  addonsTotalClp: number;
  items: Array<{
    bookingItemId: string;
    serviceId: string;
    serviceName: string;
    priceClp: number;
    participants: Participant[];
    manualShares: Share[];
    recipe: RecipeRole[];
  }>;
  rules: CommissionRule[];
};

/** Solo con el cliente de servicio. */
export async function getBookingCommissionData(serviceDb: DbClient, bookingId: string): Promise<BookingCommissionData | null> {
  return (unwrapMaybe(await serviceDb.rpc('app_booking_commission_data', { p_booking_id: bookingId })) as unknown as BookingCommissionData) ?? null;
}

/** Solo con el cliente de servicio: guarda las líneas calculadas por @agenda/core. */
export async function replaceBookingCommissions(serviceDb: DbClient, bookingId: string, lines: CommissionLine[]): Promise<void> {
  unwrapMaybe(
    await serviceDb.rpc('app_replace_booking_commissions', {
      p_booking_id: bookingId,
      p_lines: lines.map((l) => ({ ...l, serviceId: undefined })),
    }),
  );
}

export async function bookingsMissingCommissions(serviceDb: DbClient, businessId: string, to: string): Promise<string[]> {
  return unwrap(await serviceDb.rpc('app_bookings_missing_commissions', { p_business_id: businessId, p_to: to })) ?? [];
}

export async function addCommissionAdjustment(
  db: DbClient,
  a: { businessId: string; professionalId: string; amountClp: number; note: string },
): Promise<void> {
  unwrapMaybe(
    await db.rpc('app_add_commission_adjustment', {
      p_business_id: a.businessId,
      p_professional_id: a.professionalId,
      p_amount_clp: a.amountClp,
      p_note: a.note,
    }),
  );
}

export type SettlementRow = Tables<'settlements'>;

export async function listSettlements(db: DbClient, businessId: string): Promise<SettlementRow[]> {
  return unwrap(await db.from('settlements').select('*').eq('business_id', businessId).order('period_start', { ascending: false }).limit(50));
}

export async function getSettlement(db: DbClient, settlementId: string): Promise<SettlementRow | null> {
  return unwrapMaybe(await db.from('settlements').select('*').eq('id', settlementId).maybeSingle()) ?? null;
}

export async function createSettlement(db: DbClient, businessId: string, start: string, end: string): Promise<string> {
  return unwrap(await db.rpc('app_create_settlement', { p_business_id: businessId, p_start: start, p_end: end }));
}

export async function setSettlementStatus(db: DbClient, settlementId: string, status: 'closed' | 'paid' | 'deleted'): Promise<void> {
  unwrapMaybe(await db.rpc('app_set_settlement_status', { p_settlement_id: settlementId, p_status: status }));
}

export type CommissionEntryView = Tables<'commission_entries'> & {
  professional: { display_name: string } | null;
  booking_item: { service_name: string; starts_at: string } | null;
  booking: { customer: { full_name: string } | null } | null;
};

const ENTRY_SELECT =
  '*, professional:professionals(display_name), booking_item:booking_items(service_name, starts_at), booking:bookings(customer:customers(full_name))';

/** Movimientos de una liquidación, o los pendientes (sin liquidar) si settlementId es null. */
export async function listCommissionEntries(
  db: DbClient,
  args: { businessId: string; settlementId: string | null; limit?: number },
): Promise<CommissionEntryView[]> {
  let q = db.from('commission_entries').select(ENTRY_SELECT).eq('business_id', args.businessId);
  q = args.settlementId ? q.eq('settlement_id', args.settlementId) : q.is('settlement_id', null);
  const rows = unwrap(await q.order('occurred_at', { ascending: false }).limit(args.limit ?? 500));
  return rows as unknown as CommissionEntryView[];
}

/** Profesionales con recurso en el negocio (para reglas, repartos y ajustes). */
export async function listBusinessProfessionals(db: DbClient, businessId: string): Promise<Array<{ id: string; name: string; skills: string[] }>> {
  const rows = unwrap(
    await db.from('resources').select('professional_id, name, skills').eq('business_id', businessId).not('professional_id', 'is', null).order('name'),
  );
  const seen = new Set<string>();
  return rows
    .filter((r) => r.professional_id && !seen.has(r.professional_id) && seen.add(r.professional_id))
    .map((r) => ({ id: r.professional_id!, name: r.name, skills: r.skills }));
}

export async function updateSettlementPeriod(db: DbClient, businessId: string, period: SettlementPeriod): Promise<void> {
  expectRows(unwrap(await db.from('businesses').update({ settlement_period: period }).eq('id', businessId).select('id')));
}

/** Servicio de una reserva con sus participantes, para editar el reparto. */
export async function getBookingItemForShares(db: DbClient, bookingItemId: string) {
  return unwrapMaybe(
    await db
      .from('booking_items')
      .select('id, booking_id, business_id, service_id, service_name, starts_at, duration_minutes, price_clp')
      .eq('id', bookingItemId)
      .maybeSingle(),
  );
}
