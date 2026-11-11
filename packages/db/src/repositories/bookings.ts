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

// ---------------------------------------------------------------------------
// Fase 2B: confirmación por email y portal del cliente
// ---------------------------------------------------------------------------
export type TokenResult = {
  result: 'confirmed' | 'already_confirmed' | 'cancelled' | 'expired' | 'invalid' | 'too_late';
  booking?: {
    status: string;
    startsAt: string;
    endsAt: string;
    businessName: string;
    timezone: string;
    totalClp: number;
    services: string[];
  };
};

/** Libera las reservas pendientes vencidas (antes de calcular horarios). */
export async function expirePendingBookings(db: DbClient): Promise<void> {
  unwrapMaybe(await db.rpc('app_expire_pending'));
}

/** Solo con el cliente de servicio: guarda el hash de un enlace de un solo uso. */
export async function createBookingToken(
  serviceDb: DbClient,
  args: { bookingId: string; purpose: 'confirm' | 'cancel'; tokenHash: string; expiresAt: string },
): Promise<void> {
  unwrapMaybe(
    await serviceDb.rpc('app_create_booking_token', {
      p_booking_id: args.bookingId,
      p_purpose: args.purpose,
      p_token_hash: args.tokenHash,
      p_expires_at: args.expiresAt,
    }),
  );
}

export async function redeemBookingToken(db: DbClient, tokenHash: string): Promise<TokenResult> {
  return unwrap(await db.rpc('app_use_booking_token', { p_token_hash: tokenHash })) as unknown as TokenResult;
}

/** Estado y datos para el email de una reserva recién creada (cliente de servicio). */
export async function getBookingForEmail(serviceDb: DbClient, bookingId: string) {
  return unwrap(
    await serviceDb
      .from('bookings')
      .select(
        'id, status, starts_at, total_clp, hold_expires_at, customer:customers(full_name, email), business:businesses!bookings_visible_brand_business_id_fkey(name, timezone, pending_hold_minutes), booking_items(service_name, position)',
      )
      .eq('id', bookingId)
      .single(),
  );
}

/** Modo de confirmación del link público (cliente de servicio: dato interno). */
export async function getConfirmationMode(serviceDb: DbClient, businessId: string): Promise<'auto' | 'email'> {
  const row = unwrap(await serviceDb.from('businesses').select('public_confirmation_mode').eq('id', businessId).single());
  return row.public_confirmation_mode === 'email' ? 'email' : 'auto';
}

export type MyBooking = {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  totalClp: number;
  businessName: string;
  businessSlug: string;
  timezone: string;
  cancellationHours: number;
  services: string[];
};

/** Vincula fichas por email verificado y devuelve las reservas de la cuenta. */
export async function listMyBookings(db: DbClient): Promise<MyBooking[]> {
  unwrapMaybe(await db.rpc('app_link_my_customers'));
  return (unwrap(await db.rpc('app_my_bookings')) as unknown as MyBooking[]) ?? [];
}

export async function customerCancelBooking(db: DbClient, bookingId: string): Promise<void> {
  unwrapMaybe(await db.rpc('app_customer_cancel_booking', { p_booking_id: bookingId }));
}

export async function updateConfirmationSettings(
  db: DbClient,
  businessId: string,
  values: { public_confirmation_mode: 'auto' | 'email'; pending_hold_minutes: number },
): Promise<void> {
  expectRows(unwrap(await db.from('businesses').update(values).eq('id', businessId).select('id')));
}
