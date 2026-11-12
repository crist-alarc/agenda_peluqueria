/**
 * Archivos (fase 3A): fotos del catálogo. Único punto que conoce Supabase Storage
 * (directrices, sección 3.1): las pantallas solo piden subir, borrar o la URL pública.
 */
import type { DbClient } from './client';
import { DbError } from './errors';

/** Bucket público de imágenes del catálogo (lo crea la migración de la fase 3A). */
export const CATALOG_BUCKET = 'catalogo';

/** Sube una foto. Usar solo con el cliente de servicio, después de validar el permiso. */
export async function uploadCatalogPhoto(
  serviceDb: DbClient,
  path: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { error } = await serviceDb.storage.from(CATALOG_BUCKET).upload(path, body, { contentType, upsert: false });
  if (error) {
    console.error('No se pudo subir la foto', error);
    throw new DbError('No se pudo subir la foto. Intenta de nuevo.');
  }
}

export async function removeCatalogPhoto(serviceDb: DbClient, path: string): Promise<void> {
  const { error } = await serviceDb.storage.from(CATALOG_BUCKET).remove([path]);
  if (error) console.error('No se pudo borrar el archivo de la foto', error);
}

/** URL pública de una foto del catálogo. */
export function catalogPhotoUrl(path: string, env: Record<string, string | undefined> = process.env): string {
  const base = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${CATALOG_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
