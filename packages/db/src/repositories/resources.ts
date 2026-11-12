import type { ResourceInput, WeeklyHours } from '@agenda/core';
import type { DbClient } from '../client';
import type { Tables } from '../database.types';
import { assertOk, expectRows, unwrap } from '../errors';

export type Resource = Tables<'resources'> & {
  professional: Pick<Tables<'professionals'>, 'id' | 'display_name' | 'email' | 'phone' | 'user_id'> | null;
  resource_hours: Tables<'resource_hours'>[];
};

export async function listResources(db: DbClient, businessId: string): Promise<Resource[]> {
  return unwrap(
    await db
      .from('resources')
      .select('*, professional:professionals(id, display_name, email, phone, user_id), resource_hours(*)')
      .eq('business_id', businessId)
      .order('type')
      .order('name')
      .order('weekday', { referencedTable: 'resource_hours' })
      .order('starts_at', { referencedTable: 'resource_hours' }),
  );
}

/**
 * Crea un recurso. Si es una persona, primero crea su identidad global
 * (`professional`); si el recurso falla, se elimina esa identidad.
 */
export async function createResource(db: DbClient, input: ResourceInput): Promise<string> {
  let professionalId: string | null = null;
  if (input.type === 'person') {
    professionalId = unwrap(
      await db
        .from('professionals')
        .insert({
          display_name: input.name,
          email: input.professionalEmail,
          phone: input.professionalPhone,
          created_by_business_id: input.businessId,
        })
        .select('id')
        .single(),
    ).id;
  }
  const result = await db
    .from('resources')
    .insert({
      business_id: input.businessId,
      branch_id: input.branchId,
      type: input.type,
      name: input.name,
      skills: input.skills,
      is_logistics: input.isLogistics,
      max_events_per_day: input.isLogistics ? input.maxEventsPerDay : null,
      professional_id: professionalId,
    })
    .select('id')
    .single();
  if (result.error && professionalId) {
    await db.from('professionals').delete().eq('id', professionalId);
  }
  return unwrap(result).id;
}

export async function updateResource(db: DbClient, resourceId: string, input: ResourceInput): Promise<void> {
  const updated = expectRows(
    unwrap(
      await db
        .from('resources')
        .update({
          branch_id: input.branchId,
          name: input.name,
          skills: input.skills,
          is_logistics: input.isLogistics,
          max_events_per_day: input.isLogistics ? input.maxEventsPerDay : null,
          active: input.active,
        })
        .eq('id', resourceId)
        .select('professional_id'),
    ),
  );
  const professionalId = updated[0]?.professional_id;
  if (professionalId) {
    assertOk(
      await db
        .from('professionals')
        .update({ display_name: input.name, email: input.professionalEmail, phone: input.professionalPhone })
        .eq('id', professionalId),
    );
  }
}

export async function deleteResource(db: DbClient, resourceId: string): Promise<void> {
  expectRows(unwrap(await db.from('resources').delete().eq('id', resourceId).select('id')));
}

/** Igual que el horario de sucursal: primero inserta el nuevo y luego borra el anterior. */
export async function replaceResourceHours(db: DbClient, resourceId: string, hours: WeeklyHours): Promise<void> {
  const previous = unwrap(await db.from('resource_hours').select('id').eq('resource_id', resourceId));
  if (hours.length > 0) {
    assertOk(
      await db
        .from('resource_hours')
        .insert(hours.map((h) => ({ resource_id: resourceId, weekday: h.weekday, starts_at: h.start, ends_at: h.end }))),
    );
  }
  if (previous.length > 0) {
    assertOk(await db.from('resource_hours').delete().in('id', previous.map((p) => p.id)));
  }
}
