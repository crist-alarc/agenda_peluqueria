import type { BookingContext, BookingStatus } from '@agenda/core';
import type { DbClient } from '../client';
import type { Tables } from '../database.types';
import { expectRows, unwrap, unwrapMaybe } from '../errors';

/** Con `showPrices` en false, los montos llegan como null (la base no los entrega). */
export type PublicBusiness = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  phone: string | null;
  bookingMode: string;
  maxAdvanceDays: number;
  cancellationHours: number;
  showPrices: boolean;
  /** Campos de la ficha de servicio de la plantilla del rubro (sin validar). */
  serviceFields: unknown;
  branches: Array<{
    id: string;
    name: string;
    address: string | null;
    commune: string | null;
    deliveryMode: 'included' | 'fixed' | 'by_zone';
    deliveryFee: number | null;
    zones: Array<{ id: string; name: string; fee: number | null }>;
  }>;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    price: number | null;
    fullDay: boolean;
    details: Record<string, unknown>;
    /** Rutas dentro del bucket "catalogo". */
    photos: string[];
    needsPerson: boolean;
  }>;
  people: Array<{ id: string; name: string; branchId: string }>;
  addons: Array<{ id: string; name: string; description: string | null; price: number | null }>;
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
  booking_items: Array<Pick<Tables<'booking_items'>, 'id' | 'position' | 'service_name' | 'starts_at' | 'ends_at' | 'price'>>;
  allocations: Array<Pick<Tables<'allocations'>, 'resource_id' | 'starts_at' | 'ends_at' | 'booking_item_id'>>;
  booking_addons: Array<Pick<Tables<'booking_addons'>, 'addon_name' | 'quantity' | 'unit_price'>>;
};

/** Reservas de una sucursal entre dos instantes (agenda de recepción o del profesional). */
export async function listAgenda(db: DbClient, args: { branchId: string; from: string; to: string }): Promise<AgendaBooking[]> {
  return unwrap(
    await db
      .from('bookings')
      .select(
        '*, customer:customers(id, full_name, phone, email), booking_items(id, position, service_name, starts_at, ends_at, price), allocations(resource_id, starts_at, ends_at, booking_item_id), booking_addons(addon_name, quantity, unit_price)',
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
    show_public_prices: boolean;
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
export type TokenPurpose = 'confirm' | 'cancel' | 'attend';

export type TokenResult = {
  result: 'confirmed' | 'already_confirmed' | 'attending' | 'already_attending' | 'cancelled' | 'expired' | 'invalid' | 'too_late';
  booking?: {
    status: string;
    startsAt: string;
    endsAt: string;
    businessName: string;
    businessSlug: string;
    timezone: string;
    currency: string;
    total: number;
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
  args: { bookingId: string; purpose: TokenPurpose; tokenHash: string; expiresAt: string; notificationId?: string | null },
): Promise<void> {
  unwrapMaybe(
    await serviceDb.rpc('app_create_booking_token', {
      p_booking_id: args.bookingId,
      p_purpose: args.purpose,
      p_token_hash: args.tokenHash,
      p_expires_at: args.expiresAt,
      p_notification_id: args.notificationId ?? undefined,
    }),
  );
}

export async function redeemBookingToken(db: DbClient, tokenHash: string): Promise<TokenResult> {
  return unwrap(await db.rpc('app_use_booking_token', { p_token_hash: tokenHash })) as unknown as TokenResult;
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
  total: number;
  businessName: string;
  businessSlug: string;
  timezone: string;
  currency: string;
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

// ---------------------------------------------------------------------------
// Fase 2C: emails, recordatorios y registro de envíos
// ---------------------------------------------------------------------------
export type BookingEmailData = {
  id: string;
  businessId: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  total: number;
  holdExpiresAt: string | null;
  reminderSentAt: string | null;
  attendanceConfirmedAt: string | null;
  customerName: string | null;
  customerEmail: string | null;
  brand: string;
  businessSlug: string;
  timezone: string;
  currency: string;
  /** El negocio muestra precios al cliente (fase 3A). */
  showPrices?: boolean;
  branchName: string;
  branchAddress: string;
  settings: {
    reminderEnabled: boolean;
    reminderHoursBefore: number;
    confirmationCutoffHours: number;
    pendingHoldMinutes: number;
    cancellationHours: number;
  };
  services: string[];
};

/** Todo lo necesario para escribir un email de una reserva (cliente de servicio). */
export async function getBookingEmailData(serviceDb: DbClient, bookingId: string): Promise<BookingEmailData> {
  const data = unwrapMaybe(await serviceDb.rpc('app_booking_email_data', { p_booking_id: bookingId }));
  if (!data) throw new Error('Reserva no encontrada');
  return data as unknown as BookingEmailData;
}

/** Reservas que podrían necesitar recordatorio; la decisión final es de @agenda/core. */
export async function listReminderCandidates(serviceDb: DbClient, now: string): Promise<BookingEmailData[]> {
  return (unwrap(await serviceDb.rpc('app_reminder_candidates', { p_now: now })) as unknown as BookingEmailData[]) ?? [];
}

/** Marca el recordatorio como enviado. false si otra ejecución ya lo tomó. */
export async function claimReminder(serviceDb: DbClient, bookingId: string): Promise<boolean> {
  return unwrap(await serviceDb.rpc('app_claim_reminder', { p_booking_id: bookingId })) === true;
}

export type NotificationKind = 'booking_pending' | 'booking_created' | 'reminder';

/** Registra un envío antes de mandarlo (para enlazar los botones y medir el clic). */
export async function logNotification(
  serviceDb: DbClient,
  n: { businessId: string; bookingId: string; kind: NotificationKind; recipient: string; channel?: 'email' | 'whatsapp' },
): Promise<string> {
  const row = unwrap(
    await serviceDb
      .from('notification_log')
      .insert({ business_id: n.businessId, booking_id: n.bookingId, kind: n.kind, recipient: n.recipient, channel: n.channel ?? 'email' })
      .select('id')
      .single(),
  );
  return row.id;
}

export async function markNotification(serviceDb: DbClient, id: string, result: { ok: true } | { ok: false; error: string }): Promise<void> {
  unwrap(
    await serviceDb
      .from('notification_log')
      .update(result.ok ? { status: 'sent', sent_at: new Date().toISOString() } : { status: 'failed', error: result.error.slice(0, 500) })
      .eq('id', id)
      .select('id'),
  );
}

/** clicked: presionó algún botón; attended: presionó "Confirmo asistencia". */
export type NotificationStats = Record<NotificationKind, { sent: number; failed: number; clicked: number; attended: number }>;

/** Cuántos emails se enviaron y cuántos clientes presionaron un botón (sección 18.2). */
export async function notificationStats(db: DbClient, businessId: string, since: string): Promise<NotificationStats> {
  const rows = unwrap(
    await db.from('notification_log').select('kind, status, clicked_at, clicked_action').eq('business_id', businessId).gte('created_at', since).limit(10000),
  );
  const stats: NotificationStats = {
    booking_pending: { sent: 0, failed: 0, clicked: 0, attended: 0 },
    booking_created: { sent: 0, failed: 0, clicked: 0, attended: 0 },
    reminder: { sent: 0, failed: 0, clicked: 0, attended: 0 },
  };
  for (const r of rows) {
    const s = stats[r.kind as NotificationKind];
    if (!s) continue;
    if (r.status === 'sent') s.sent++;
    if (r.status === 'failed') s.failed++;
    if (r.clicked_at) s.clicked++;
    if (r.clicked_action === 'attend') s.attended++;
  }
  return stats;
}

export async function updateReminderSettings(
  db: DbClient,
  businessId: string,
  values: { reminder_enabled: boolean; reminder_hours_before: number; confirmation_cutoff_hours: number },
): Promise<void> {
  expectRows(unwrap(await db.from('businesses').update(values).eq('id', businessId).select('id')));
}

/** Recepción marca (o desmarca) que el cliente confirmó su asistencia, por ejemplo por teléfono. */
export async function setAttendanceConfirmed(db: DbClient, bookingId: string, confirmed: boolean): Promise<void> {
  expectRows(
    unwrap(
      await db
        .from('bookings')
        .update({ attendance_confirmed_at: confirmed ? new Date().toISOString() : null })
        .eq('id', bookingId)
        .select('id'),
    ),
  );
}
