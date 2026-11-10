'use server';

/**
 * Acciones del panel de un negocio. Cada acción:
 *  1. valida la entrada con los esquemas de @agenda/core (Zod),
 *  2. verifica la sesión, el rol y los límites del plan en el servidor,
 *  3. llama a la capa de datos (@agenda/db). La base vuelve a verificar todo con RLS.
 */
import {
  addonSchema,
  addonStockSchema,
  blockSchema,
  bookingSettingsSchema,
  branchSchema,
  can,
  canAssignRole,
  canManageBranch,
  checkLimit,
  memberSchema,
  resourceSchema,
  serviceSchema,
  updateBusinessSchema,
  weeklyHoursSchema,
  zonedLocalToUtc,
  type Feature,
  type Permission,
} from '@agenda/core';
import * as repo from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, formToObject, jsonField, ok, toActionError, type ActionState } from '@/lib/actions';
import { requireBusiness } from '@/lib/session';
import { t } from '@/lib/texts';

const idSchema = z.uuid();

async function contextFor(form: FormData, permission?: Permission) {
  const businessId = idSchema.parse(form.get('businessId'));
  const ctx = await requireBusiness(businessId);
  if (permission && !can(ctx.membership, permission)) throw new repo.DbError(t.errors.forbidden, '42501');
  return ctx;
}

function revalidate(businessId: string, section = '') {
  revalidatePath(`/panel/${businessId}${section}`);
  revalidatePath(`/panel/${businessId}`);
}

async function assertLimit(
  db: repo.DbClient,
  businessId: string,
  feature: Feature & ('branches' | 'resources'),
  label: string,
): Promise<void> {
  const [entitlements, current] = await Promise.all([
    repo.getEntitlements(db, businessId),
    repo.countByBusiness(db, feature, businessId),
  ]);
  const check = checkLimit(entitlements, feature, current);
  if (!check.allowed) {
    throw new repo.DbError(
      check.reason === 'limit_reached' ? t.errors.limitReached(label, check.limit ?? 0) : t.errors.notIncluded(label),
      'P0001',
    );
  }
}

// ---------------------------------------------------------------------------
// Negocio
// ---------------------------------------------------------------------------
export async function updateBusinessAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db } = await contextFor(form, 'business.update');
    const input = updateBusinessSchema.parse(formToObject(form));
    await repo.updateBusiness(db, input.businessId, {
      name: input.name,
      phone: input.phone,
      email: input.email,
      timezone: input.timezone,
    });
    revalidatePath(`/panel/${input.businessId}`, 'layout');
    return ok(t.saved);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Sucursales
// ---------------------------------------------------------------------------
export async function saveBranchAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, membership } = await contextFor(form);
    const input = branchSchema.parse(formToObject(form));
    const values = { name: input.name, address: input.address, commune: input.commune };
    if (input.branchId) {
      if (!canManageBranch(membership, input.branchId)) return fail(t.errors.forbidden);
      await repo.updateBranch(db, input.branchId, { ...values, active: input.active });
      const hours = weeklyHoursSchema.parse(jsonField(form, 'hours'));
      await repo.replaceBranchHours(db, input.branchId, hours);
    } else {
      if (!can(membership, 'branches.create')) return fail(t.errors.forbidden);
      await assertLimit(db, input.businessId, 'branches', t.features.branches!);
      await repo.createBranch(db, { ...values, business_id: input.businessId });
    }
    revalidate(input.businessId, '/sucursales');
    return ok(input.branchId ? t.saved : 'Sucursal creada');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBranchAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await contextFor(form, 'branches.create');
    await repo.deleteBranch(db, idSchema.parse(form.get('branchId')));
    revalidate(business.id, '/sucursales');
    return ok('Sucursal eliminada');
  } catch (error) {
    return toActionError(error);
  }
}

export async function createBlockAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business, membership } = await contextFor(form);
    const input = blockSchema.parse({
      ...formToObject(form),
      branchId: form.get('branchId') || undefined,
      resourceId: form.get('resourceId') || undefined,
    });
    if (input.branchId && !canManageBranch(membership, input.branchId)) return fail(t.errors.forbidden);
    await repo.createBlock(db, {
      business_id: business.id,
      branch_id: input.branchId ?? null,
      resource_id: input.resourceId ?? null,
      // La persona ingresa la hora local del negocio; se guarda en UTC
      starts_at: zonedLocalToUtc(input.startsAt, business.timezone),
      ends_at: zonedLocalToUtc(input.endsAt, business.timezone),
      reason: input.reason,
    });
    revalidate(business.id, input.branchId ? '/sucursales' : '/recursos');
    return ok('Bloqueo agregado');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBlockAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await contextFor(form);
    await repo.deleteBlock(db, idSchema.parse(form.get('blockId')));
    revalidate(business.id, '/sucursales');
    revalidate(business.id, '/recursos');
    return ok('Bloqueo eliminado');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------
export async function saveResourceAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, membership } = await contextFor(form);
    const input = resourceSchema.parse(formToObject(form));
    if (!canManageBranch(membership, input.branchId)) return fail(t.errors.forbidden);
    if (input.resourceId) {
      await repo.updateResource(db, input.resourceId, input);
      const hours = weeklyHoursSchema.parse(jsonField(form, 'hours'));
      await repo.replaceResourceHours(db, input.resourceId, hours);
    } else {
      await assertLimit(db, input.businessId, 'resources', t.features.resources!);
      await repo.createResource(db, input);
    }
    revalidate(input.businessId, '/recursos');
    return ok(input.resourceId ? t.saved : 'Recurso creado');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteResourceAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await contextFor(form);
    await repo.deleteResource(db, idSchema.parse(form.get('resourceId')));
    revalidate(business.id, '/recursos');
    return ok('Recurso eliminado');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------------
export async function saveServiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await contextFor(form, 'catalog.manage');
    const input = serviceSchema.parse({ ...formToObject(form), requirements: jsonField(form, 'requirements') });
    if (input.serviceId) await repo.updateService(db, input.serviceId, input);
    else await repo.createService(db, input, business.booking_mode);
    revalidate(business.id, '/servicios');
    return ok(input.serviceId ? t.saved : 'Servicio creado');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteServiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await contextFor(form, 'catalog.manage');
    await repo.deleteService(db, idSchema.parse(form.get('serviceId')));
    revalidate(business.id, '/servicios');
    return ok('Servicio eliminado');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Adicionales
// ---------------------------------------------------------------------------
export async function saveAddonAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await contextFor(form, 'catalog.manage');
    const input = addonSchema.parse(formToObject(form));
    const values = { name: input.name, description: input.description, price_clp: input.priceClp, active: input.active };
    if (input.addonId) await repo.updateAddon(db, input.addonId, values);
    else await repo.createAddon(db, { ...values, business_id: business.id });
    revalidate(business.id, '/adicionales');
    return ok(input.addonId ? t.saved : 'Adicional creado');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteAddonAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await contextFor(form, 'catalog.manage');
    await repo.deleteAddon(db, idSchema.parse(form.get('addonId')));
    revalidate(business.id, '/adicionales');
    return ok('Adicional eliminado');
  } catch (error) {
    return toActionError(error);
  }
}

export async function setStockAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business, membership } = await contextFor(form);
    const input = addonStockSchema.parse(formToObject(form));
    if (!canManageBranch(membership, input.branchId)) return fail(t.errors.forbidden);
    await repo.setAddonStock(db, input.addonId, input.branchId, input.quantity);
    revalidate(business.id, '/adicionales');
    return ok('Stock actualizado');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------
export async function addMemberAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business, membership } = await contextFor(form, 'team.manage');
    const input = memberSchema.parse(formToObject(form, ['branchIds']));
    if (!canAssignRole(membership, input.role)) return fail('Solo un dueño puede asignar el rol de dueño');
    await repo.addMember(db, input);
    revalidate(business.id, '/equipo');
    return ok(`${input.email} ahora es ${t.roles[input.role].toLowerCase()}`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeMemberAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await contextFor(form, 'team.manage');
    await repo.removeMember(db, idSchema.parse(form.get('membershipId')));
    revalidate(business.id, '/equipo');
    return ok('Persona quitada del equipo');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Reservas: configuración y vínculo profesional ↔ cuenta
// ---------------------------------------------------------------------------
export async function updateBookingSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await contextFor(form, 'business.update');
    const input = bookingSettingsSchema.parse(formToObject(form));
    await repo.updateBookingSettings(db, business.id, {
      slot_interval_minutes: input.slotIntervalMinutes,
      min_advance_minutes: input.minAdvanceMinutes,
      max_advance_days: input.maxAdvanceDays,
      cancellation_hours: input.cancellationHours,
      public_booking_enabled: input.publicBookingEnabled,
    });
    revalidatePath(`/panel/${business.id}`, 'layout');
    return ok(t.saved);
  } catch (error) {
    return toActionError(error);
  }
}

export async function linkProfessionalAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await contextFor(form, 'team.manage');
    const professionalId = idSchema.parse(form.get('professionalId'));
    const raw = form.get('userId');
    const userId = raw ? idSchema.parse(raw) : null;
    await repo.linkProfessionalUser(db, professionalId, userId);
    revalidate(business.id, '/recursos');
    return ok(userId ? 'Cuenta vinculada: verá su propia agenda' : 'Cuenta desvinculada');
  } catch (error) {
    return toActionError(error);
  }
}
