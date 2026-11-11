import { createServiceDbClient, expirePendingBookings } from '@agenda/db';
import { timingSafeEqual } from 'node:crypto';
import { sendDueReminders } from '@/lib/notify';
import { siteUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

/**
 * Tarea programada (ADR 0004): Supabase Cron → Edge Function "recordatorios"
 * → esta ruta, cada 15 minutos. Protegida con CRON_SECRET (variable de entorno).
 * Repetirla es seguro: cada recordatorio se marca antes de enviarse.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }
  const service = createServiceDbClient();
  await expirePendingBookings(service);
  const result = await sendDueReminders(service, await siteUrl());
  return Response.json({ ok: true, ...result });
}
