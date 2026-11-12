'use server';

/**
 * Acciones de comisiones (fase 2D). Validan con Zod de @agenda/core, exigen el
 * permiso commissions.manage y que el plan incluya comisiones. La base vuelve
 * a verificar todo (RLS, sumas del 100%, liquidaciones cerradas).
 */
import {
  can,
  commissionAdjustmentSchema,
  commissionRuleSchema,
  commissionSettingsSchema,
  hasFeature,
  itemSharesSchema,
  serviceRecipeSchema,
  settlementPeriodSchema,
  zonedLocalToUtc,
} from '@agenda/core';
import * as repo from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { fail, formToObject, ok, toActionError, type ActionState } from '@/lib/actions';
import { generateBookingCommissions, generateMissingCommissions } from '@/lib/commissions';
import { requireWritableBusiness } from '@/lib/session';
import { t } from '@/lib/texts';

const id = z.uuid();

async function manager(form: FormData) {
  const ctx = await requireWritableBusiness(id.parse(form.get('businessId')));
  if (!can(ctx.membership, 'commissions.manage')) throw new repo.DbError(t.errors.forbidden, '42501');
  if (!hasFeature(await repo.getEntitlements(ctx.db, ctx.business.id), 'commissions')) {
    throw new repo.DbError('Tu plan no incluye comisiones');
  }
  return ctx;
}

const refresh = (businessId: string) => revalidatePath(`/panel/${businessId}/comisiones`, 'layout');

export async function createRuleAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await manager(form);
    const r = commissionRuleSchema(business.currency).parse(formToObject(form));
    await repo.createCommissionRule(db, {
      businessId: business.id,
      professionalId: r.professionalId,
      serviceId: r.serviceId,
      kind: r.kind,
      value: r.valueStored,
      includeAddons: r.includeAddons,
    });
    refresh(business.id);
    return ok('Regla guardada. Se aplica a las reservas que se completen desde ahora.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deactivateRuleAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await manager(form);
    await repo.deactivateCommissionRule(db, id.parse(form.get('ruleId')));
    refresh(business.id);
    return ok('Regla quitada');
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveRecipeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await manager(form);
    const serviceId = id.parse(form.get('serviceId'));
    const rows = [0, 1, 2, 3, 4]
      .map((i) => ({
        label: String(form.get(`label_${i}`) ?? '').trim(),
        percent: String(form.get(`percent_${i}`) ?? '').trim(),
        requiredSkill: String(form.get(`skill_${i}`) ?? '').trim(),
      }))
      .filter((r) => r.label || r.percent);
    await repo.setServiceRecipe(db, serviceId, serviceRecipeSchema.parse(rows));
    refresh(business.id);
    return ok(rows.length === 0 ? 'Receta quitada: se reparte en partes iguales' : 'Receta guardada');
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveSharesAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await manager(form);
    const itemId = id.parse(form.get('bookingItemId'));
    const item = await repo.getBookingItemForShares(db, itemId);
    if (!item || item.business_id !== business.id) return fail('Servicio no encontrado');
    if (form.get('reset') === '1') {
      await repo.setItemShares(db, itemId, []);
    } else {
      const mode = form.get('mode') === 'minutes' ? 'minutes' : 'percent';
      const rows = [...form.keys()]
        .filter((k) => k.startsWith('pro_'))
        .map((k) => ({ professionalId: k.slice(4), value: String(form.get(k) ?? '').trim() }));
      const shares = itemSharesSchema.parse({ mode, rows });
      const minutes = new Map(rows.map((r) => [r.professionalId, Number(r.value)]));
      await repo.setItemShares(
        db,
        itemId,
        shares.map((s) => ({ ...s, minutes: mode === 'minutes' ? Math.round(minutes.get(s.professionalId) ?? 0) || null : null })),
      );
    }
    await generateBookingCommissions(repo.createServiceDbClient(), item.booking_id);
    refresh(business.id);
    return ok('Reparto guardado y comisiones recalculadas');
  } catch (error) {
    return toActionError(error);
  }
}

export async function adjustmentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await manager(form);
    const a = commissionAdjustmentSchema(business.currency).parse(formToObject(form));
    await repo.addCommissionAdjustment(db, { businessId: business.id, professionalId: a.professionalId, amount: a.amount, note: a.note });
    refresh(business.id);
    return ok('Ajuste registrado: entra en la próxima liquidación');
  } catch (error) {
    return toActionError(error);
  }
}

export async function createSettlementAction(_: ActionState, form: FormData): Promise<ActionState> {
  let settlementId: string;
  try {
    const { db, business } = await manager(form);
    const p = settlementPeriodSchema.parse(formToObject(form));
    // Reservas completadas que quedaron sin calcular (por ejemplo, si falló la red)
    const endUtc = zonedLocalToUtc(`${p.end}T23:59`, business.timezone);
    await generateMissingCommissions(business.id, new Date(Date.parse(endUtc) + 60_000).toISOString());
    settlementId = await repo.createSettlement(db, business.id, p.start, p.end);
    refresh(business.id);
  } catch (error) {
    return toActionError(error);
  }
  redirect(`/panel/${String(form.get('businessId'))}/comisiones/${settlementId}`);
}

export async function settlementStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  const status = z.enum(['closed', 'paid', 'deleted']).parse(form.get('status'));
  try {
    const { db, business } = await manager(form);
    await repo.setSettlementStatus(db, id.parse(form.get('settlementId')), status);
    refresh(business.id);
    if (status !== 'deleted') return ok(status === 'closed' ? 'Liquidación cerrada: ya no se puede modificar' : 'Marcada como pagada');
  } catch (error) {
    return toActionError(error);
  }
  redirect(`/panel/${String(form.get('businessId'))}/comisiones`);
}

export async function settlementPeriodAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await manager(form);
    const s = commissionSettingsSchema.parse(formToObject(form));
    await repo.updateSettlementPeriod(db, business.id, s.settlementPeriod);
    refresh(business.id);
    return ok(t.saved);
  } catch (error) {
    return toActionError(error);
  }
}
