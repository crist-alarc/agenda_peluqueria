import 'server-only';
import { headers } from 'next/headers';

/** URL pública de la app, para los enlaces de los emails. */
export async function siteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Solo rutas internas (evita redirecciones abiertas a otros sitios). */
export function safeNext(next: unknown, fallback = '/panel'): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
