import type { BookingContext, BookingStatus } from '@agenda/core';
import type { DbClient } from '../client';
import type { Tables } from '../database.types';
import { expectRows, unwrap, unwrapMaybe } from '../errors';

export type PublicBusiness = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  phone: string | null;
  bookingMode: string;
  maxAdvanceDays: number;
  cancellationHours: number;
  branches: Array<{ id: string; name: string; address: string | null; commune: string | null }>;
  services: Array<{ id: string; name: string; description: string | null; durationMinutes: number; priceClp: number; needsPerson: boolean }>;
  people: Array<{ id: string; name: string; branchId: string }>;
  addons: Array<{ id: string; name: string; description: string | null; priceClp: number }>;
};

/** Datos públicos para el link de reservas. null si no existe o está desactivado. */
export async function getPublicBusiness(db: DbClient, slug: string): Promise<PublicBusiness | null> {
  return (unwrapMaybe(await db.rpc('app_public_business', { p_slug: slug })) as PublicBusiness | null) ?? null;
}

export async function getBookingContext(
  db: DbClient,
  args: { businessId: string; branchId: string; from: string; to: string },
): Promise<BookingContext> {
  return unwrap(
    await db.rpc('app_booking_context', {
      p_business_id: args.businessId,
      p_branch_id: args.branchId,
      p_from: args.from,
      p_to: args.to,
    }),
  ) as unknown as BookingContext;
}

export type NewBooking = {
  businessId: string;
  branchId: string;
  customer: { id: string } | { full_name: string; phone: string; email: string | null };
  items: Array<{ service_id: string; starts_at: string; resource_ids: string[] }>;
  addons: Array<{ addon_id: string; quantity: number }>;
  notes: string | null;
};

/** Crea la reserva completa (o nada). La base impide la doble reserva. */
export async function createBooking(db: DbClient, b: NewBooking): Promise<string> {
  return unwrap(
    await db.rpc('app_create_booking', {
      p_business_id: b.businessId,
      p_branch_id: b.branchId,
      p_customer: b.customer,
      p_items: b.items,
      p_addons: b.addons,
      p_notes: b.notes ?? undefined,
    }),
  );
}

export type AgendaBooking = Tables<'bookings'> & {
  customer: Pick<Tables<'customers'>, 'id' | 'full_name' | 'phone' | 'email'> | null;
  booking_items: Array<Pick<Tables<'booking_items'>, 'id' | 'position' | 'service_name' | 'starts_at' | 'ends_at' | 'price_clp'>>;
  allocations: Array<Pick<Tables<'allocations'>, 'resource_id' | 'starts_at' | 'ends_at' | 'booking_item_id'>>;
  booking_addons: Array<Pick<Tables<'booking_addons'>, 'addon_name' | 'quantity' | 'unit_price_clp'>>;
};

/** Reservas de una sucursal entre dos instantes (agenda de recepción o del profesional). */
export async function listAgenda(db: DbClient, args: { branchId: string; from: string; to: string }): Promise<AgendaBooking[]> {
  return unwrap(
    await db
      .from('bookings')
      .select(
        '*, customer:customers(id, full_name, phone, email), booking_items(id, position, service_name, starts_at, ends_at, price_clp), allocations(resource_id, starts_at, ends_at, booking_item_id), booking_addons(addon_name, quantity, unit_price_clp)',
      )
      .eq('branch_id', args.branchId)
      .lt('starts_at', args.to)
      .gt('ends_at', args.from)
      .order('starts_at')
      .order('position', { referencedTable: 'booking_items' }),
  );
}

export async function setBookingStatus(
  db: DbClient,
  bookingId: string,
  status: BookingStatus,
  cancelReason: string | null = null,
): Promise<void> {
  expectRows(
    unwrap(
      await db
        .from('bookings')
        .update(status === 'cancelled' ? { status, cancel_reason: cancelReason } : { status })
        .eq('id', bookingId)
        .select('id'),
    ),
  );
}

export type Customer = Tables<'customers'>;

/** Busca clientes del negocio por teléfono o nombre (recepción). */
export async function searchCustomers(db: DbClient, businessId: string, query: string): Promise<Customer[]> {
  const q = query.trim().replace(/[%_,()]/g, '');
  if (q.length < 2) return [];
  return unwrap(
    await db
      .from('customers')
      .select('*')
      .eq('business_id', businessId)
      .or(`phone.ilike.%${q}%,full_name.ilike.%${q}%`)
      .order('full_name')
      .limit(10),
  );
}

export async function listCustomers(db: DbClient, businessId: string, limit = 200): Promise<Customer[]> {
  return unwrap(await db.from('customers').select('*').eq('business_id', businessId).order('full_name').limit(limit));
}

export async function updateBookingSettings(
  db: DbClient,
  businessId: string,
  values: {
    slot_interval_minutes: number;
    min_advance_minutes: number;
    max_advance_days: number;
    cancellation_hours: number;
    public_booking_enabled: boolean;
  },
): Promise<void> {
  expectRows(unwrap(await db.from('businesses').update(values).eq('id', businessId).select('id')));
}

/** Vincula (o desvincula) un profesional a la cuenta de alguien del equipo. */
export async function linkProfessionalUser(db: DbClient, professionalId: string, userId: string | null): Promise<void> {
  expectRows(unwrap(await db.from('professionals').update({ user_id: userId }).eq('id', professionalId).select('id')));
}
