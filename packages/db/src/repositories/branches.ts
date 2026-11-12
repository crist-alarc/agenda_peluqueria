import type { WeeklyHours } from '@agenda/core';
import type { DbClient } from '../client';
import type { Tables } from '../database.types';
import { assertOk, expectRows, unwrap } from '../errors';

export type DeliveryZoneRow = Tables<'delivery_zones'>;
export type Branch = Tables<'branches'> & { branch_hours: Tables<'branch_hours'>[]; delivery_zones: DeliveryZoneRow[] };
export type Block = Tables<'blocks'>;

export async function listBranches(db: DbClient, businessId: string): Promise<Branch[]> {
  return unwrap(
    await db
      .from('branches')
      .select('*, branch_hours(*), delivery_zones(*)')
      .eq('business_id', businessId)
      .order('created_at')
      .order('weekday', { referencedTable: 'branch_hours' })
      .order('opens_at', { referencedTable: 'branch_hours' })
      .order('position', { referencedTable: 'delivery_zones' })
      .order('name', { referencedTable: 'delivery_zones' }),
  );
}

export async function createBranch(
  db: DbClient,
  values: { business_id: string; name: string; address: string | null; commune: string | null },
): Promise<string> {
  return unwrap(await db.from('branches').insert(values).select('id').single()).id;
}

export async function updateBranch(
  db: DbClient,
  branchId: string,
  values: { name: string; address: string | null; commune: string | null; active: boolean },
): Promise<void> {
  expectRows(unwrap(await db.from('branches').update(values).eq('id', branchId).select('id')));
}

// ---------------------------------------------------------------------------
// Despacho y zonas (fase 3A)
// ---------------------------------------------------------------------------
export async function updateBranchDelivery(
  db: DbClient,
  branchId: string,
  values: { delivery_mode: 'included' | 'fixed' | 'by_zone'; delivery_fee: number },
): Promise<void> {
  expectRows(unwrap(await db.from('branches').update(values).eq('id', branchId).select('id')));
}

export async function saveDeliveryZone(
  db: DbClient,
  values: { id?: string; business_id: string; branch_id: string; name: string; fee: number; active: boolean },
): Promise<void> {
  const { id, ...rest } = values;
  if (id) {
    expectRows(
      unwrap(
        await db
          .from('delivery_zones')
          .update({ name: rest.name, fee: rest.fee, active: rest.active })
          .eq('id', id)
          .eq('branch_id', rest.branch_id)
          .select('id'),
      ),
    );
  } else {
    assertOk(await db.from('delivery_zones').insert(rest));
  }
}

export async function deleteDeliveryZone(db: DbClient, zoneId: string): Promise<void> {
  expectRows(unwrap(await db.from('delivery_zones').delete().eq('id', zoneId).select('id')));
}

export async function deleteBranch(db: DbClient, branchId: string): Promise<void> {
  expectRows(unwrap(await db.from('branches').delete().eq('id', branchId).select('id')));
}

/**
 * Reemplaza el horario semanal: inserta el nuevo y luego borra el anterior,
 * así un fallo a mitad de camino nunca deja la sucursal sin horario.
 */
export async function replaceBranchHours(db: DbClient, branchId: string, hours: WeeklyHours): Promise<void> {
  const previous = unwrap(await db.from('branch_hours').select('id').eq('branch_id', branchId));
  if (hours.length > 0) {
    assertOk(
      await db
        .from('branch_hours')
        .insert(hours.map((h) => ({ branch_id: branchId, weekday: h.weekday, opens_at: h.start, closes_at: h.end }))),
    );
  }
  if (previous.length > 0) {
    assertOk(await db.from('branch_hours').delete().in('id', previous.map((p) => p.id)));
  }
}

export async function listBlocks(db: DbClient, businessId: string, fromIso: string): Promise<Block[]> {
  return unwrap(
    await db.from('blocks').select('*').eq('business_id', businessId).gte('ends_at', fromIso).order('starts_at'),
  );
}

export async function createBlock(
  db: DbClient,
  values: {
    business_id: string;
    branch_id: string | null;
    resource_id: string | null;
    starts_at: string;
    ends_at: string;
    reason: string | null;
  },
): Promise<void> {
  assertOk(await db.from('blocks').insert(values));
}

export async function deleteBlock(db: DbClient, blockId: string): Promise<void> {
  expectRows(unwrap(await db.from('blocks').delete().eq('id', blockId).select('id')));
}
