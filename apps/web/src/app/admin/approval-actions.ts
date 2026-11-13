'use server';

/**
 * Acciones de la consola para roles, aprobaciones, planes free y datos de facturación (ADR 0010).
 * Cada una verifica el rol en el servidor; la base lo vuelve a verificar.
 */
import { parseBillingProfileForm, PLATFORM_ROLES, type PlatformRole } from '@agenda/core';
import * as repo from '@agenda/db';
import { DbError } from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, formToObject, ok, toActionError, type ActionState } from '@/lib/actions';
import { requirePlatformAdmin, requirePlatformManager } from '@/lib/session';

const id = z.uuid();
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const date = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida')]);
const refresh = () => revalidatePath('/admin', 'layout');

async function requireOwner() {
  const ctx = await requirePlatformAdmin();
  if (ctx.role !== 'owner') throw new DbError('Solo el dueño de la plataforma puede hacer esto.', '42501');
  return ctx;
}

export async function decidePlanVersionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requireOwner();
    const approve = form.get('decision') === 'approve';
    await repo.decidePlanVersion(db, id.parse(form.get('versionId')), approve, text(form, 'note') || undefined);
    refresh();
    return ok(approve ? 'Aprobada: ya es la versión vigente para quienes contraten desde ahora.' : 'Propuesta rechazada. El plan sigue como estaba.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function requestFreePlanAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, role } = await requirePlatformAdmin();
    const endsOn = date.parse(text(form, 'endsOn')) || null;
    await repo.requestFreePlan(db, {
      businessId: id.parse(form.get('businessId')),
      planCode: text(form, 'planCode'),
      endsOn,
      nextPlanCode: endsOn ? text(form, 'nextPlanCode') || null : null,
      reason: text(form, 'reason'),
    });
    refresh();
    return ok(
      role === 'agent'
        ? 'Solicitud enviada. Un administrador debe autorizarla en Aprobaciones.'
        : 'Plan free autorizado y aplicado. Desde mañana el negocio no paga.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function decideFreePlanAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    const approve = form.get('decision') === 'approve';
    await repo.decideFreePlan(db, id.parse(form.get('grantId')), approve);
    refresh();
    return ok(approve ? 'Plan free autorizado y aplicado.' : 'Solicitud rechazada.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function setTeamMemberAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requireOwner();
    const email = z.email('Escribe un email válido').parse(text(form, 'email'));
    const role = z.enum(Object.keys(PLATFORM_ROLES) as [PlatformRole, ...PlatformRole[]]).parse(text(form, 'role'));
    await repo.setPlatformTeamMember(db, email, role);
    refresh();
    return ok(`${email} quedó como ${PLATFORM_ROLES[role].label.toLowerCase()}.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeTeamMemberAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requireOwner();
    await repo.removePlatformTeamMember(db, id.parse(form.get('userId')));
    refresh();
    return ok('Ya no tiene acceso a la consola.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function adminSaveBillingProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    const parsed = parseBillingProfileForm(formToObject(form));
    if (!parsed.ok) return fail(parsed.message);
    await repo.adminSaveBillingProfile(db, id.parse(form.get('businessId')), parsed.value);
    refresh();
    return ok('Datos de facturación guardados.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function extendGraceAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requirePlatformManager();
    const until = date.parse(text(form, 'until'));
    if (!until) return fail('Elige hasta qué día');
    await repo.extendBillingGrace(db, id.parse(form.get('businessId')), until);
    refresh();
    return ok('Plazo extendido.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await requireOwner();
    const days = z.coerce.number().int('Usa un número entero').min(0).max(90, 'Máximo 90 días').parse(text(form, 'billingGraceMinDays'));
    await repo.savePlatformSettings(db, { billingGraceMinDays: days });
    refresh();
    return ok('Guardado. Aplica a los negocios que se creen desde ahora.');
  } catch (error) {
    return toActionError(error);
  }
}
