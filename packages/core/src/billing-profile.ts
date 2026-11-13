/**
 * Datos de facturación de un negocio y roles de la plataforma (ADR 0010). La base vuelve a validar
 * todo (app.save_billing_profile); aquí se valida para dar mensajes claros en el formulario.
 */

// ---------------------------------------------------------------------------
// RUT chileno
// ---------------------------------------------------------------------------
/** Deja solo dígitos y dígito verificador en mayúscula: "76.086.428-5" → "760864285". */
function compactRut(input: string): string {
  return input.replace(/[.\s-]/g, '').toUpperCase();
}

/** Dígito verificador (módulo 11) de un cuerpo de RUT. */
export function rutCheckDigit(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  return res === 11 ? '0' : res === 10 ? 'K' : String(res);
}

export function isValidRut(input: string): boolean {
  const v = compactRut(input);
  if (!/^[0-9]{7,8}[0-9K]$/.test(v)) return false;
  return rutCheckDigit(v.slice(0, -1)) === v.slice(-1);
}

/** Formato de lectura: "76.086.428-5". */
export function formatRut(input: string): string {
  const v = compactRut(input);
  const body = v.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${v.slice(-1)}`;
}

/** Formato en que se guarda: "76086428-5". */
export function normalizeRut(input: string): string {
  const v = compactRut(input);
  return `${v.slice(0, -1)}-${v.slice(-1)}`;
}

// ---------------------------------------------------------------------------
// Datos de facturación
// ---------------------------------------------------------------------------
export const BILLING_DOCUMENTS = {
  boleta: 'Boleta',
  factura: 'Factura',
  exportacion: 'Factura de exportación',
} as const;
export type BillingDocument = keyof typeof BILLING_DOCUMENTS;

export type BillingProfile = {
  documentType: BillingDocument;
  country: string;
  taxId: string | null;
  legalName: string;
  activity: string | null;
  address: string | null;
  commune: string | null;
  city: string | null;
  email: string;
};

export type BillingProfileResult = { ok: true; value: BillingProfile } | { ok: false; message: string };

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Lo que pide cada documento:
 * - Boleta: nombre y email (el RUT es opcional, pero si viene debe ser válido).
 * - Factura: RUT, razón social, giro, dirección, comuna y email.
 * - Otro país: factura de exportación con identificación tributaria, nombre, dirección y email.
 */
export function parseBillingProfileForm(form: Record<string, unknown>): BillingProfileResult {
  const country = (text(form.country) || 'CL').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, message: 'País no válido' };
  const foreign = country !== 'CL';
  const documentType = (foreign ? 'exportacion' : text(form.documentType)) as BillingDocument;
  if (!foreign && documentType !== 'boleta' && documentType !== 'factura') return { ok: false, message: 'Elige boleta o factura' };

  const rawTaxId = text(form.taxId);
  let taxId: string | null = rawTaxId || null;
  if (!foreign && taxId) {
    if (!isValidRut(taxId)) return { ok: false, message: 'El RUT no es válido. Revisa el dígito verificador' };
    taxId = normalizeRut(taxId);
  }
  const legalName = text(form.legalName);
  if (legalName.length < 2) return { ok: false, message: documentType === 'boleta' ? 'Indica tu nombre' : 'Indica la razón social' };
  const email = text(form.email).toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, message: 'Indica un email válido para recibir los documentos' };

  const value: BillingProfile = {
    documentType,
    country,
    taxId,
    legalName,
    activity: text(form.activity) || null,
    address: text(form.address) || null,
    commune: text(form.commune) || null,
    city: text(form.city) || null,
    email,
  };
  if (documentType === 'factura' && (!value.taxId || !value.activity || !value.address || !value.commune)) {
    return { ok: false, message: 'Para factura se necesitan RUT, razón social, giro, dirección y comuna' };
  }
  if (documentType === 'exportacion' && !value.address) return { ok: false, message: 'Indica la dirección' };
  return { ok: true, value };
}

/** Estado de los datos de facturación de un negocio. */
export type BillingStatus = 'ok' | 'grace' | 'blocked';

// ---------------------------------------------------------------------------
// Roles de la plataforma
// ---------------------------------------------------------------------------
export const PLATFORM_ROLES = {
  owner: { label: 'Dueño de la plataforma', description: 'Todo, y aprueba planes nuevos y sus cambios.' },
  admin: { label: 'Administrador', description: 'Gestiona clientes, planes y cobros; autoriza planes free.' },
  agent: { label: 'Agente de soporte', description: 'Pide accesos de soporte y solicita planes free, sin autorizarlos.' },
} as const;
export type PlatformRole = keyof typeof PLATFORM_ROLES;

export const isPlatformManager = (role: PlatformRole | null | undefined) => role === 'owner' || role === 'admin';
