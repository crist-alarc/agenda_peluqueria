'use server';

/**
 * Acciones de la consola para los cobros mensuales y las condiciones de pago (ADR 0011).
 * El cálculo lo hace @agenda/core; la base recalcula los totales y protege lo facturado.
 */
import { buildMonthCharge, parseMoney, InvalidAmountError } from '@agenda/core';
import * as repo from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, ok, toActionError, type ActionState } from '@/lib/actions';
import { requirePlatformManager } from '@/lib/session';

const id = z.uuid();
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige una fecha');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes no válido');
const refresh = () => revalidatePath('/admin', 'layout');

/** Genera (o rehace) los cobros por facturar de un mes. Lo ya facturado no se toca. */
export async function generateChargesAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    const m = month.parse(text(form, 'month'));
    const inputs = await repo.getChargeInputs(db, m);
    let created = 0;
    let empty = 0;
    let issued = 0;
    let noPrice = 0;
    for (const b of inputs) {
      if (b.charge && b.charge.status !== 'pending') {
        issued++;
        continue;
      }
      if (b.periods.some((p) => p.kind === 'plan' && p.monthlyNet === null)) noPrice++;
      const lines = buildMonthCharge({
        month: m,
        periods: b.periods.map((p) => ({ ...p, monthlyNet: p.monthlyNet ?? 0 })),
        branches: b.branches,
      });
      const chargeId = await repo.saveCharge(db, b.businessId, m, lines);
      if (chargeId) created++;
      else empty++;
    }
    refresh();
    const parts = [`${created} ${created === 1 ? 'cobro por facturar' : 'cobros por facturar'}`];
    if (empty) parts.push(`${empty} sin cobro (plan free, prueba o $0)`);
    if (issued) parts.push(`${issued} ya ${issued === 1 ? 'emitido no se tocó' : 'emitidos no se tocaron'}`);
    const warn = noPrice ? ` Ojo: ${noPrice} ${noPrice === 1 ? 'negocio tiene' : 'negocios tienen'} un plan sin precio (suma $0).` : '';
    return ok(`Listo: ${parts.join(', ')}.${warn}`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function addAdjustmentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    const currency = text(form, 'currency');
    let amount: number;
    try {
      amount = parseMoney(text(form, 'amount').replace(/^-/, ''), currency);
    } catch (error) {
      return fail(error instanceof InvalidAmountError ? error.message : 'Monto no válido');
    }
    const net = form.get('sign') === 'discount' ? -amount : amount;
    await repo.addChargeAdjustment(db, id.parse(form.get('chargeId')), text(form, 'label'), net);
    refresh();
    return ok(net < 0 ? 'Descuento agregado.' : 'Cargo agregado.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeAdjustmentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    await repo.removeChargeAdjustment(db, id.parse(form.get('lineId')));
    refresh();
    return ok('Ajuste quitado.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function invoiceChargeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    await repo.invoiceCharge(db, id.parse(form.get('chargeId')), text(form, 'folio'), date.parse(text(form, 'issuedOn')));
    refresh();
    return ok('Facturado. Desde ahora el monto no se puede cambiar.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function payChargeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    await repo.payCharge(db, id.parse(form.get('chargeId')), date.parse(text(form, 'paidOn')), text(form, 'method'), text(form, 'note') || undefined);
    refresh();
    return ok('Pago registrado.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function voidChargeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    await repo.voidCharge(db, id.parse(form.get('chargeId')), text(form, 'reason'), text(form, 'creditNoteFolio') || undefined);
    refresh();
    return ok('Cobro anulado. Puedes generar el mes de nuevo si corresponde.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function savePaymentTermAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    const days = z.coerce.number().int('Usa un número entero de días').min(0).max(365, 'Máximo 365 días').parse(text(form, 'days'));
    const name = text(form, 'name');
    if (name.length < 2) return fail('Indica el nombre del plazo');
    await repo.savePaymentTerm(db, { id: text(form, 'id') || null, name, days, isDefault: form.get('isDefault') === 'on', active: form.get('active') === 'on' });
    refresh();
    return ok('Plazo guardado.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function savePaymentMethodAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    const name = text(form, 'name');
    if (name.length < 2) return fail('Indica el nombre de la forma de pago');
    await repo.savePaymentMethod(db, { id: text(form, 'id') || null, name, isDefault: form.get('isDefault') === 'on', active: form.get('active') === 'on' });
    refresh();
    return ok('Forma de pago guardada.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function setBusinessPaymentAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    await repo.setBusinessPayment(db, id.parse(form.get('businessId')), text(form, 'termId') || null, text(form, 'methodId') || null);
    refresh();
    return ok('Condiciones de pago guardadas. Aplican a los cobros que se facturen desde ahora.');
  } catch (error) {
    return toActionError(error);
  }
}
