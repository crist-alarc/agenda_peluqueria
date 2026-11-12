'use server';

/**
 * Acciones del modo arriendo (fase 3A): despacho y zonas de cada sucursal, y
 * fotos del catálogo. Mismo patrón que actions.ts: validar, verificar permisos
 * en el servidor y guardar; la base vuelve a verificar con RLS.
 */
import {
  can,
  canManageBranch,
  deliverySettingsSchema,
  deliveryZoneSchema,
  MAX_SERVICE_PHOTO_BYTES,
  MAX_SERVICE_PHOTOS,
  SERVICE_PHOTO_TYPES,
} from '@agenda/core';
import * as repo from '@agenda/db';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail, formToObject, ok, toActionError, type ActionState } from '@/lib/actions';
import { requireBusiness } from '@/lib/session';
import { t } from '@/lib/texts';

const idSchema = z.uuid();

async function context(form: FormData) {
  return requireBusiness(idSchema.parse(form.get('businessId')));
}

// ---------------------------------------------------------------------------
// Despacho y zonas
// ---------------------------------------------------------------------------
export async function saveDeliverySettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business, membership } = await context(form);
    const input = deliverySettingsSchema(business.currency).parse(formToObject(form));
    if (!canManageBranch(membership, input.branchId)) return fail(t.errors.forbidden);
    await repo.updateBranchDelivery(db, input.branchId, {
      delivery_mode: input.deliveryMode,
      delivery_fee: input.deliveryFee,
    });
    revalidatePath(`/panel/${business.id}/sucursales`);
    return ok(t.saved);
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveDeliveryZoneAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business, membership } = await context(form);
    const input = deliveryZoneSchema(business.currency).parse(formToObject(form));
    if (!canManageBranch(membership, input.branchId)) return fail(t.errors.forbidden);
    await repo.saveDeliveryZone(db, {
      id: input.zoneId,
      business_id: business.id,
      branch_id: input.branchId,
      name: input.name,
      fee: input.fee,
      active: input.zoneId ? input.active : true,
    });
    revalidatePath(`/panel/${business.id}/sucursales`);
    return ok(input.zoneId ? t.saved : 'Zona agregada');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteDeliveryZoneAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business } = await context(form);
    await repo.deleteDeliveryZone(db, idSchema.parse(form.get('zoneId')));
    revalidatePath(`/panel/${business.id}/sucursales`);
    return ok('Zona eliminada');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Fotos del catálogo
// ---------------------------------------------------------------------------
const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function uploadServicePhotoAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business, membership } = await context(form);
    if (!can(membership, 'catalog.manage')) return fail(t.errors.forbidden);
    const serviceId = idSchema.parse(form.get('serviceId'));
    const file = form.get('photo');
    if (!(file instanceof File) || file.size === 0) return fail('Elige una foto');
    if (!(SERVICE_PHOTO_TYPES as readonly string[]).includes(file.type)) return fail('La foto debe ser JPG, PNG o WebP');
    if (file.size > MAX_SERVICE_PHOTO_BYTES) return fail('La foto no puede pesar más de 4 MB');

    const services = await repo.listServices(db, business.id);
    const service = services.find((s) => s.id === serviceId);
    if (!service) return fail(t.errors.forbidden);
    if (service.service_photos.length >= MAX_SERVICE_PHOTOS) return fail(`Cada servicio puede tener hasta ${MAX_SERVICE_PHOTOS} fotos`);

    // El archivo lo sube el servidor con la clave de servicio; la fila se guarda con la sesión
    // del usuario, así la base vuelve a validar el permiso (RLS) y el máximo de fotos.
    const path = `${business.id}/${service.id}/${randomUUID()}.${EXTENSIONS[file.type]}`;
    const serviceDb = repo.createServiceDbClient();
    await repo.uploadCatalogPhoto(serviceDb, path, await file.arrayBuffer(), file.type);
    try {
      await repo.addServicePhoto(db, {
        business_id: business.id,
        service_id: service.id,
        path,
        position: service.service_photos.length,
      });
    } catch (error) {
      await repo.removeCatalogPhoto(serviceDb, path);
      throw error;
    }
    revalidatePath(`/panel/${business.id}/servicios`);
    return ok('Foto agregada');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteServicePhotoAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { db, business, membership } = await context(form);
    if (!can(membership, 'catalog.manage')) return fail(t.errors.forbidden);
    const path = await repo.deleteServicePhoto(db, idSchema.parse(form.get('photoId')));
    await repo.removeCatalogPhoto(repo.createServiceDbClient(), path);
    revalidatePath(`/panel/${business.id}/servicios`);
    return ok('Foto eliminada');
  } catch (error) {
    return toActionError(error);
  }
}
