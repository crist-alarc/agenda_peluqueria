/**
 * Modo arriendo (fase 3 · 3A, ADR 0007): despacho por zona, capacidad de
 * logística y ficha de cada servicio. Funciones puras con tests; el servidor
 * las usa para calcular y la interfaz solo muestra el resultado.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Despacho y zonas de cobertura
// ---------------------------------------------------------------------------
export const DELIVERY_MODES = ['included', 'fixed', 'by_zone'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export type DeliveryZone = { id: string; name: string; fee: number; active: boolean };

export type DeliveryConfig = {
  mode: DeliveryMode;
  /** Monto fijo (modo `fixed`), en la unidad mínima de la moneda. */
  fixedFee: number;
  zones: readonly DeliveryZone[];
};

export type DeliveryQuote =
  | { ok: true; fee: number; zoneId: string | null; zoneName: string | null }
  | { ok: false; reason: 'zone_required' | 'not_covered' };

/**
 * Costo de despacho a una zona.
 * - Si la sucursal tiene zonas activas, la zona es obligatoria y define la cobertura.
 * - Sin zonas, se cubre cualquier dirección (salvo en modo por zona, que necesita zonas).
 */
export function deliveryQuote(config: DeliveryConfig, zoneId: string | null): DeliveryQuote {
  const zones = config.zones.filter((z) => z.active);
  const zone = zoneId ? zones.find((z) => z.id === zoneId) : undefined;
  if (zoneId && !zone) return { ok: false, reason: 'not_covered' };
  if (!zone && (zones.length > 0 || config.mode === 'by_zone')) return { ok: false, reason: 'zone_required' };

  const fee = config.mode === 'included' ? 0 : config.mode === 'fixed' ? config.fixedFee : (zone?.fee ?? 0);
  return { ok: true, fee, zoneId: zone?.id ?? null, zoneName: zone?.name ?? null };
}

// ---------------------------------------------------------------------------
// Capacidad de logística (camiones): avisa, no bloquea (ADR 0006, decisión 2)
// ---------------------------------------------------------------------------
export type LogisticsLoad = {
  events: number;
  /** Suma de los topes de los camiones con tope configurado; null si ninguno tiene. */
  capacity: number | null;
  /** 'ok' bajo el tope, 'full' justo en el tope, 'over' sobre el tope. */
  level: 'ok' | 'full' | 'over' | 'unknown';
};

export function logisticsLoad(events: number, trucks: ReadonlyArray<{ maxEventsPerDay: number | null }>): LogisticsLoad {
  const caps = trucks.map((t) => t.maxEventsPerDay).filter((c): c is number => c != null && c > 0);
  if (caps.length === 0) return { events, capacity: null, level: 'unknown' };
  const capacity = caps.reduce((sum, c) => sum + c, 0);
  return { events, capacity, level: events > capacity ? 'over' : events === capacity ? 'full' : 'ok' };
}

// ---------------------------------------------------------------------------
// Ficha del servicio: campos definidos por la plantilla del rubro
// ---------------------------------------------------------------------------
export const serviceFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string().min(1).max(60),
  type: z.enum(['number', 'text', 'boolean']),
  unit: z.string().max(20).optional(),
});
export type ServiceField = z.infer<typeof serviceFieldSchema>;

/** Lee la definición de campos de una plantilla; ignora entradas mal formadas. */
export function parseServiceFields(raw: unknown): ServiceField[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((f) => {
    const parsed = serviceFieldSchema.safeParse(f);
    return parsed.success ? [parsed.data] : [];
  });
}

export type ServiceDetails = Record<string, string | number | boolean>;

/**
 * Valida los datos de la ficha que vienen de un formulario (`detail_<key>`).
 * Los campos vacíos no se guardan; los números son enteros no negativos.
 */
export function parseServiceDetails(
  fields: readonly ServiceField[],
  form: Record<string, unknown>,
): { ok: true; details: ServiceDetails } | { ok: false; message: string } {
  const details: ServiceDetails = {};
  for (const f of fields) {
    const raw = form[`detail_${f.key}`];
    if (f.type === 'boolean') {
      if (raw === 'on' || raw === 'true' || raw === true) details[f.key] = true;
      else if (raw === 'false' || raw === false) details[f.key] = false;
      continue;
    }
    const text = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw);
    if (text === '') continue;
    if (f.type === 'number') {
      const n = Number(text.replace(/\./g, '').replace(',', '.'));
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
        return { ok: false, message: `${f.label}: ingresa un número entero` };
      }
      details[f.key] = n;
    } else {
      if (text.length > 120) return { ok: false, message: `${f.label}: máximo 120 caracteres` };
      details[f.key] = text;
    }
  }
  return { ok: true, details };
}

/** Ficha lista para mostrar: solo los campos con valor, en el orden de la plantilla. */
export function describeServiceDetails(
  fields: readonly ServiceField[],
  details: Readonly<Record<string, unknown>> | null | undefined,
): Array<{ key: string; label: string; value: string }> {
  if (!details) return [];
  return fields.flatMap((f) => {
    const v = details[f.key];
    if (v == null || v === '') return [];
    if (f.type === 'boolean') {
      if (typeof v !== 'boolean') return [];
      return [{ key: f.key, label: f.label, value: v ? 'Sí' : 'No' }];
    }
    const text = typeof v === 'number' ? v.toLocaleString('es-CL') : String(v);
    return [{ key: f.key, label: f.label, value: f.unit ? `${text} ${f.unit}` : text }];
  });
}

/** Máximo de fotos por servicio en el catálogo. */
export const MAX_SERVICE_PHOTOS = 6;
export const SERVICE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Vercel limita el cuerpo de cada petición a 4,5 MB: las fotos pasan por el servidor. */
export const MAX_SERVICE_PHOTO_BYTES = 4 * 1024 * 1024;
