/**
 * Único punto donde se crea el cliente de Supabase (directrices, sección 3.1).
 * Las pantallas y /packages/core nunca importan supabase-js: usan los
 * repositorios de este paquete, que reciben un `DbClient`.
 */
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type DbClient = SupabaseClient<Database>;

export type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

/** Adaptador de cookies: lo implementa el framework web (Next.js). */
export type CookieAdapter = {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: CookieToSet[]): void;
};

export type DbConfig = {
  url: string;
  /** Clave pública (publishable/anon). Nunca la service_role en el navegador. */
  publishableKey: string;
};

export function readDbConfig(env: Record<string, string | undefined> = process.env): DbConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en las variables de entorno');
  }
  return { url, publishableKey };
}

/** Cliente con la sesión del usuario (cookies). Todas las consultas pasan por RLS. */
export function createDbClient(config: DbConfig, cookies: CookieAdapter): DbClient {
  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet) => cookies.setAll(toSet as CookieToSet[]),
    },
  });
}

/**
 * Cliente con la clave de SERVICIO. Solo para el servidor (nunca el navegador):
 * lo usa el link público para crear reservas después de validar el horario
 * con el motor de disponibilidad (directrices, sección 21).
 */
export function createServiceDbClient(env: Record<string, string | undefined> = process.env): DbClient {
  const { url } = readDbConfig(env);
  const secret = env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error('Falta SUPABASE_SECRET_KEY en las variables de entorno del servidor');
  }
  return createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
