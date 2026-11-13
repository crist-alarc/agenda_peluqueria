/**
 * Cobros mensuales a los clientes de la plataforma (ADR 0011). El cálculo vive en @agenda/core
 * (buildMonthCharge); la base guarda las líneas, recalcula los totales y protege lo facturado.
 */
import type { ChargeLine, ChargePeriod, BranchActivity, ChargeStatus } from '@agenda/core';
import type { DbClient } from '../client';
import { unwrap, unwrapMaybe } from '../errors';
import type { BusinessPayment } from './billing';

export type PaymentTerm = { id: string; name: string; days: number; isDefault: boolean; active: boolean };
export type PaymentMethod = { id: string; name: string; isDefault: boolean; active: boolean };
export type PaymentOptions = { terms: PaymentTerm[]; methods: PaymentMethod[] };

export async function getPaymentOptions(db: DbClient): Promise<PaymentOptions> {
  return (unwrap(await db.rpc('app_admin_payment_options')) ?? { terms: [], methods: [] }) as unknown as PaymentOptions;
}

export async function savePaymentTerm(db: DbClient, input: { id: string | null; name: string; days: number; isDefault: boolean; active: boolean }) {
  return unwrap(
    await db.rpc('app_admin_save_payment_term', {
      // null = crear uno nuevo (la función lo acepta; el generador de tipos no lo refleja)
      p_id: input.id as string,
      p_name: input.name,
      p_days: input.days,
      p_is_default: input.isDefault,
      p_active: input.active,
    }),
  );
}

export async function savePaymentMethod(db: DbClient, input: { id: string | null; name: string; isDefault: boolean; active: boolean }) {
  return unwrap(
    await db.rpc('app_admin_save_payment_method', { p_id: input.id as string, p_name: input.name, p_is_default: input.isDefault, p_active: input.active }),
  );
}

export async function setBusinessPayment(db: DbClient, businessId: string, termId: string | null, methodId: string | null) {
  unwrapMaybe(
    await db.rpc('app_admin_set_business_payment', { p_business_id: businessId, p_term_id: termId as string, p_method_id: methodId as string }),
  );
}

export type ChargeInput = {
  businessId: string;
  businessName: string;
  ownerName: string | null;
  currency: string;
  hasProfile: boolean;
  periods: Array<Omit<ChargePeriod, 'monthlyNet'> & { monthlyNet: number | null }>;
  branches: BranchActivity[];
  charge: { id: string; status: ChargeStatus; gross: number } | null;
};

export async function getChargeInputs(db: DbClient, month: string): Promise<ChargeInput[]> {
  return (unwrap(await db.rpc('app_admin_charge_inputs', { p_month: month })) ?? []) as unknown as ChargeInput[];
}

/** Guarda (o rehace) el cobro por facturar; null si el mes no tiene nada que cobrar. */
export async function saveCharge(db: DbClient, businessId: string, month: string, lines: ChargeLine[]): Promise<string | null> {
  const id = unwrapMaybe(await db.rpc('app_admin_save_charge', { p_business_id: businessId, p_month: month, p_lines: lines }));
  return (id as string | null) ?? null;
}

export type ChargeSummary = {
  id: string;
  businessId: string;
  businessName: string;
  month: string;
  status: ChargeStatus;
  currency: string;
  net: number;
  tax: number;
  gross: number;
  taxRateBp: number;
  documentType: string | null;
  billTo: Record<string, string | null> | null;
  folio: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  paidOn: string | null;
  paidMethod: string | null;
  paymentTermName: string | null;
  paymentMethodName: string | null;
  voidReason: string | null;
  creditNoteFolio: string | null;
  profile: { documentType: string; legalName: string; taxId: string | null; email: string; country: string } | null;
};

export async function listCharges(db: DbClient, month: string): Promise<ChargeSummary[]> {
  return (unwrap(await db.rpc('app_admin_charges', { p_month: month })) ?? []) as unknown as ChargeSummary[];
}

export type ChargeDetail = Omit<ChargeSummary, 'profile'> & {
  paymentNote: string | null;
  voidedAt: string | null;
  createdAt: string;
  hasProfile: boolean;
  payment: BusinessPayment;
  lines: Array<{ id: string; kind: ChargeLine['kind']; label: string; from: string | null; to: string | null; days: number | null; quantity: number | null; net: number }>;
};

export async function getCharge(db: DbClient, chargeId: string): Promise<ChargeDetail | null> {
  return (unwrapMaybe(await db.rpc('app_admin_charge', { p_charge_id: chargeId })) ?? null) as unknown as ChargeDetail | null;
}

export async function addChargeAdjustment(db: DbClient, chargeId: string, label: string, net: number) {
  unwrapMaybe(await db.rpc('app_admin_add_charge_adjustment', { p_charge_id: chargeId, p_label: label, p_net: net }));
}

export async function removeChargeAdjustment(db: DbClient, lineId: string) {
  unwrapMaybe(await db.rpc('app_admin_remove_charge_adjustment', { p_line_id: lineId }));
}

export async function invoiceCharge(db: DbClient, chargeId: string, folio: string, issuedOn: string) {
  unwrapMaybe(await db.rpc('app_admin_invoice_charge', { p_charge_id: chargeId, p_folio: folio, p_issued_on: issuedOn }));
}

export async function payCharge(db: DbClient, chargeId: string, paidOn: string, method: string, note?: string) {
  unwrapMaybe(await db.rpc('app_admin_pay_charge', { p_charge_id: chargeId, p_paid_on: paidOn, p_method: method, p_note: note }));
}

export async function voidCharge(db: DbClient, chargeId: string, reason: string, creditNoteFolio?: string) {
  unwrapMaybe(await db.rpc('app_admin_void_charge', { p_charge_id: chargeId, p_reason: reason, p_credit_note_folio: creditNoteFolio }));
}

export type BillingAlerts = {
  today: string;
  overdue: Array<{ id: string; businessId: string; businessName: string; month: string; gross: number; currency: string; dueOn: string; days: number }>;
  monthToGenerate: string | null;
};

export async function getBillingAlerts(db: DbClient): Promise<BillingAlerts> {
  return unwrap(await db.rpc('app_admin_billing_alerts')) as unknown as BillingAlerts;
}

export type MyCharges = {
  today: string;
  payment: BusinessPayment | null;
  charges: Array<{
    id: string;
    month: string;
    status: ChargeStatus;
    currency: string;
    net: number;
    tax: number;
    gross: number;
    folio: string | null;
    documentType: string | null;
    issuedOn: string | null;
    dueOn: string | null;
    paidOn: string | null;
    creditNoteFolio: string | null;
  }>;
};

export async function getMyCharges(db: DbClient, businessId: string): Promise<MyCharges> {
  return unwrap(await db.rpc('app_my_charges', { p_business_id: businessId })) as unknown as MyCharges;
}
