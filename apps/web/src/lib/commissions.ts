import 'server-only';
import { computeBookingCommissions, defaultShares } from '@agenda/core';
import {
  bookingsMissingCommissions,
  createServiceDbClient,
  getBookingCommissionData,
  replaceBookingCommissions,
  type DbClient,
} from '@agenda/db';

/**
 * Comisiones en el servidor (sección 16, ADR 0005): la base entrega los datos,
 * @agenda/core calcula y el servidor guarda con la clave de servicio. Nadie
 * puede escribir montos de comisión desde el navegador.
 */

/** Calcula (o recalcula) las comisiones de una reserva completada. */
export async function generateBookingCommissions(service: DbClient, bookingId: string): Promise<'saved' | 'skipped'> {
  const data = await getBookingCommissionData(service, bookingId);
  if (!data || !data.enabled || data.status !== 'completed' || data.locked) return 'skipped';
  const items = data.items
    .map((item) => ({
      bookingItemId: item.bookingItemId,
      serviceId: item.serviceId,
      price: item.price,
      shares: item.manualShares.length > 0 ? item.manualShares : defaultShares(item.participants, item.recipe),
    }))
    // Servicios sin profesional (ej. solo una sala) no generan comisión
    .filter((item) => item.shares.length > 0);
  const lines = computeBookingCommissions(items, data.addonsTotal, data.rules);
  await replaceBookingCommissions(service, bookingId, lines);
  return 'saved';
}

/** Igual, pero sin interrumpir la acción del usuario si algo falla (se reintenta al liquidar). */
export async function tryGenerateBookingCommissions(bookingId: string): Promise<void> {
  if (!process.env.SUPABASE_SECRET_KEY) return;
  try {
    await generateBookingCommissions(createServiceDbClient(), bookingId);
  } catch (error) {
    console.error('No se pudieron calcular las comisiones de la reserva', bookingId, error);
  }
}

/** Antes de liquidar: calcula las reservas completadas que quedaron sin comisiones. */
export async function generateMissingCommissions(businessId: string, to: string): Promise<number> {
  const service = createServiceDbClient();
  const ids = await bookingsMissingCommissions(service, businessId, to);
  let saved = 0;
  for (const id of ids) {
    if ((await generateBookingCommissions(service, id)) === 'saved') saved++;
  }
  return saved;
}
