import { parseServiceFields, type ServiceDetails, type ServiceField, type ServiceInput } from '@agenda/core';
import type { DbClient } from '../client';
import type { Tables } from '../database.types';
import { assertOk, expectRows, unwrap } from '../errors';

export type Service = Tables<'services'> & {
  service_resource_requirements: Tables<'service_resource_requirements'>[];
  service_photos: Tables<'service_photos'>[];
};
export type ServicePhoto = Tables<'service_photos'>;
export type Addon = Tables<'addons'> & { addon_stock: Tables<'addon_stock'>[] };
export type IndustryTemplate = Pick<Tables<'industry_templates'>, 'code' | 'name' | 'booking_mode'>;

// ---------------------------------------------------------------------------
// Rubros y feriados (catálogos globales)
// ---------------------------------------------------------------------------
export async function listIndustryTemplates(db: DbClient): Promise<IndustryTemplate[]> {
  return unwrap(await db.from('industry_templates').select('code, name, booking_mode').order('sort_order'));
}

/** Campos de la ficha de servicio que define la plantilla del rubro (fase 3A). */
export async function getServiceFields(db: DbClient, industryCode: string): Promise<ServiceField[]> {
  const row = unwrap(await db.from('industry_templates').select('config').eq('code', industryCode).maybeSingle());
  const config = row?.config as { service_fields?: unknown } | null | undefined;
  return parseServiceFields(config?.service_fields);
}

export async function listHolidays(db: DbClient, fromDate: string, toDate: string) {
  return unwrap(await db.from('holidays').select('date, name').gte('date', fromDate).lte('date', toDate).order('date'));
}

// ---------------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------------
export async function listServices(db: DbClient, businessId: string): Promise<Service[]> {
  return unwrap(
    await db
      .from('services')
      .select('*, service_resource_requirements(*), service_photos(*)')
      .eq('business_id', businessId)
      .order('name')
      .order('position', { referencedTable: 'service_photos' }),
  );
}

function serviceValues(input: ServiceInput, details: ServiceDetails) {
  return {
    full_day: input.fullDay,
    details,
    name: input.name,
    description: input.description,
    duration_minutes: input.durationMinutes,
    price: input.price,
    buffer_before_minutes: input.bufferBeforeMinutes,
    buffer_after_minutes: input.bufferAfterMinutes,
    active: input.active,
  };
}

function requirementRows(serviceId: string, input: ServiceInput) {
  return input.requirements.map((r) => ({
    service_id: serviceId,
    resource_type: r.resourceType,
    quantity: r.quantity,
    required_skill: r.requiredSkill,
  }));
}

export async function createService(
  db: DbClient,
  input: ServiceInput,
  bookingMode: Tables<'services'>['booking_mode'],
  details: ServiceDetails = {},
): Promise<string> {
  const id = unwrap(
    await db
      .from('services')
      .insert({ ...serviceValues(input, details), business_id: input.businessId, booking_mode: bookingMode })
      .select('id')
      .single(),
  ).id;
  if (input.requirements.length > 0) {
    const result = await db.from('service_resource_requirements').insert(requirementRows(id, input));
    if (result.error) {
      await db.from('services').delete().eq('id', id);
      assertOk(result);
    }
  }
  return id;
}

export async function updateService(
  db: DbClient,
  serviceId: string,
  input: ServiceInput,
  details: ServiceDetails = {},
): Promise<void> {
  expectRows(unwrap(await db.from('services').update(serviceValues(input, details)).eq('id', serviceId).select('id')));
  const previous = unwrap(await db.from('service_resource_requirements').select('id').eq('service_id', serviceId));
  if (input.requirements.length > 0) {
    assertOk(await db.from('service_resource_requirements').insert(requirementRows(serviceId, input)));
  }
  if (previous.length > 0) {
    assertOk(await db.from('service_resource_requirements').delete().in('id', previous.map((p) => p.id)));
  }
}

export async function deleteService(db: DbClient, serviceId: string): Promise<void> {
  expectRows(unwrap(await db.from('services').delete().eq('id', serviceId).select('id')));
}

// ---------------------------------------------------------------------------
// Fotos del catálogo (fase 3A). El archivo vive en Storage; aquí solo su ruta.
// ---------------------------------------------------------------------------
export async function addServicePhoto(
  db: DbClient,
  values: { business_id: string; service_id: string; path: string; position: number },
): Promise<void> {
  assertOk(await db.from('service_photos').insert(values));
}

/** Borra la foto y devuelve su ruta para quitar también el archivo. */
export async function deleteServicePhoto(db: DbClient, photoId: string): Promise<string> {
  const rows = expectRows(unwrap(await db.from('service_photos').delete().eq('id', photoId).select('path')));
  return rows[0]!.path;
}

// ---------------------------------------------------------------------------
// Adicionales y stock
// ---------------------------------------------------------------------------
export async function listAddons(db: DbClient, businessId: string): Promise<Addon[]> {
  return unwrap(await db.from('addons').select('*, addon_stock(*)').eq('business_id', businessId).order('name'));
}

export async function createAddon(
  db: DbClient,
  values: { business_id: string; name: string; description: string | null; price: number; active: boolean },
): Promise<void> {
  assertOk(await db.from('addons').insert(values));
}

export async function updateAddon(
  db: DbClient,
  addonId: string,
  values: { name: string; description: string | null; price: number; active: boolean },
): Promise<void> {
  expectRows(unwrap(await db.from('addons').update(values).eq('id', addonId).select('id')));
}

export async function deleteAddon(db: DbClient, addonId: string): Promise<void> {
  expectRows(unwrap(await db.from('addons').delete().eq('id', addonId).select('id')));
}

export async function setAddonStock(db: DbClient, addonId: string, branchId: string, quantity: number): Promise<void> {
  assertOk(
    await db
      .from('addon_stock')
      .upsert({ addon_id: addonId, branch_id: branchId, quantity }, { onConflict: 'addon_id,branch_id' }),
  );
}
