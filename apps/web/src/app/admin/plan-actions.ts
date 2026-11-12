'use server';

/**
 * Acciones de la consola para planes, cobro y suspensión (ADR 0009). Cada una verifica
 * en el servidor que la persona sea administradora; la base lo vuelve a verificar.
 */
import { featureOverrideSchema, nextDay, parsePlanForm, parseRatePercent, zonedLocalToUtc, type DocumentType } from '@agenda/core';
import * as repo from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, formToObject, ok, toActionError, type ActionState } from '@/lib/actions';
import { requirePlatformAdmin } from '@/lib/session';

const id = z.uuid();
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const refresh = () => revalidatePath('/admin', 'layout');

export async function savePlanAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    const parsed = parsePlanForm(formToObject(form));
    if (!parsed.ok) return fail(parsed.message);
    await repo.savePlan(db, parsed.value);
    refresh();
    return ok('Plan guardado. Si cambiaste funciones o precios, se creó una versión nueva para quienes lo contraten desde ahora.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function migrateVersionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    const n = await repo.migratePlanVersion(db, id.parse(form.get('versionId')), text(form, 'note') || undefined);
    refresh();
    return ok(`${n} ${n === 1 ? 'negocio pasó' : 'negocios pasaron'} a la versión vigente. Se les cobra el precio nuevo desde mañana.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function changePlanAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    await repo.changeBusinessPlan(db, id.parse(form.get('businessId')), text(form, 'planCode'), text(form, 'note') || undefined);
    refresh();
    return ok('Plan cambiado. Las funciones ya están activas; el cobro del plan nuevo corre desde mañana.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function addOverrideAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    const input = featureOverrideSchema.parse(formToObject(form));
    // Rige hasta el final del día elegido (hora de Chile)
    const expiresAt = input.until ? zonedLocalToUtc(`${nextDay(input.until)}T00:00`, 'America/Santiago') : null;
    await repo.addFeatureOverride(db, { ...input, expiresAt });
    refresh();
    return ok('Función puntual aplicada.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function endOverrideAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    await repo.endFeatureOverride(db, id.parse(form.get('overrideId')));
    refresh();
    return ok('Función puntual terminada: el negocio vuelve a lo que da su plan.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function suspendAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    await repo.suspendBusiness(db, id.parse(form.get('businessId')), text(form, 'reason'));
    refresh();
    return ok('Negocio suspendido. Desde mañana no se le cobra.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function reactivateAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    await repo.reactivateBusiness(db, id.parse(form.get('businessId')), text(form, 'note') || undefined);
    refresh();
    return ok('Negocio reactivado. Vuelve a recibir reservas; el cobro corre desde mañana.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveBillingEntityAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    const name = text(form, 'name');
    if (name.length < 2) return fail('Indica el nombre de la empresa');
    await repo.saveBillingEntity(db, { id: id.parse(form.get('id')), name, taxId: text(form, 'taxId') || null, active: form.get('active') === 'on' });
    refresh();
    return ok('Empresa guardada.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveTaxRuleAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformAdmin();
    const rate = parseRatePercent(text(form, 'rate'));
    if (rate === null) return fail('El impuesto debe ser un porcentaje entre 0 y 100, con hasta 2 decimales');
    await repo.saveTaxRule(db, {
      id: id.parse(form.get('id')),
      currency: text(form, 'currency'),
      documentType: text(form, 'documentType') as DocumentType,
      taxRateBp: rate,
      active: form.get('active') === 'on',
    });
    refresh();
    return ok('Regla guardada.');
  } catch (error) {
    return toActionError(error);
  }
}
