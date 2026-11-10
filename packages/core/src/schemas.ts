/**
 * Esquemas de validación compartidos entre frontend y backend (directrices, sección 3).
 * Cada acción del servidor valida su entrada con estos esquemas antes de tocar la base.
 * Los mensajes van en español de Chile porque se muestran directamente al usuario.
 */
import { z } from 'zod';
import { InvalidAmountError, parseClp } from './money';
import { ROLES } from './roles';
import { findOverlaps, isValidTimeZone, timeToMinutes } from './time';

const uuid = z.uuid({ message: 'Identificador no válido' });
const name = (label: string) =>
  z
    .string({ message: `${label} es obligatorio` })
    .trim()
    .min(1, `${label} es obligatorio`)
    .max(120, `${label} es demasiado largo`);
const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, 'Texto demasiado largo')
    .optional()
    .transform((v) => (v ? v : null));
function isValidTime(t: string): boolean {
  try {
    timeToMinutes(t);
    return true;
  } catch {
    return false;
  }
}
const time = z.string().refine(isValidTime, 'Hora no válida (usa HH:MM)');
const weekday = z.coerce.number().int().min(0).max(6);
const minutes = (label: string, min: number, max: number) =>
  z.coerce
    .number({ message: `${label} debe ser un número` })
    .int(`${label} debe ser un número entero`)
    .min(min, `${label} debe ser al menos ${min}`)
    .max(max, `${label} no puede superar ${max}`);
const clp = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    return parseClp(value === '' ? 0 : value);
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message: error instanceof InvalidAmountError ? error.message : 'Monto no válido',
    });
    return z.NEVER;
  }
});
const checkbox = z
  .union([z.boolean(), z.literal('on'), z.literal('true'), z.literal('false'), z.literal('')])
  .optional()
  .transform((v) => v === true || v === 'on' || v === 'true');

export const resourceTypeSchema = z.enum(['person', 'space', 'equipment']);
export const roleSchema = z.enum(ROLES);

// ---------------------------------------------------------------------------
// Negocio
// ---------------------------------------------------------------------------
export const createBusinessSchema = z.object({
  businessName: name('El nombre del negocio'),
  industryCode: z.string().trim().min(1, 'Elige un rubro'),
  branchName: name('El nombre de la sucursal'),
  branchAddress: optionalText(200),
  branchCommune: optionalText(80),
  timezone: z.string().refine(isValidTimeZone, 'Zona horaria no válida').default('America/Santiago'),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = z.object({
  businessId: uuid,
  name: name('El nombre del negocio'),
  phone: optionalText(30),
  email: z
    .union([z.literal(''), z.email('Email no válido')])
    .optional()
    .transform((v) => (v ? v : null)),
  timezone: z.string().refine(isValidTimeZone, 'Zona horaria no válida'),
});

// ---------------------------------------------------------------------------
// Sucursales y horarios
// ---------------------------------------------------------------------------
export const branchSchema = z.object({
  businessId: uuid,
  branchId: uuid.optional(),
  name: name('El nombre de la sucursal'),
  address: optionalText(200),
  commune: optionalText(80),
  active: checkbox,
});

/** Horario semanal: tramos válidos, término posterior al inicio y sin solapes. */
export const weeklyHoursSchema = z
  .array(z.object({ weekday, start: time, end: time }))
  .max(50)
  .superRefine((ranges, ctx) => {
    // Los tramos con horas inválidas ya tienen su propio error: aquí se ignoran.
    const valid = ranges.filter((r) => isValidTime(r.start) && isValidTime(r.end));
    valid.forEach((r) => {
      if (timeToMinutes(r.end) <= timeToMinutes(r.start)) {
        ctx.addIssue({ code: 'custom', message: 'La hora de término debe ser posterior a la de inicio' });
      }
    });
    if (findOverlaps(valid).length > 0) {
      ctx.addIssue({ code: 'custom', message: 'Hay tramos que se superponen el mismo día' });
    }
  });
export type WeeklyHours = z.infer<typeof weeklyHoursSchema>;

export const blockSchema = z
  .object({
    businessId: uuid,
    branchId: uuid.optional(),
    resourceId: uuid.optional(),
    startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Fecha y hora de inicio no válidas'),
    endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Fecha y hora de término no válidas'),
    reason: optionalText(200),
  })
  .refine((b) => Boolean(b.branchId) !== Boolean(b.resourceId), 'El bloqueo debe ser de una sucursal o de un recurso')
  .refine((b) => b.endsAt > b.startsAt, { message: 'El término debe ser posterior al inicio', path: ['endsAt'] });

// ---------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------
const skills = z
  .string()
  .optional()
  .transform((v) =>
    [
      ...new Set(
        (v ?? '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].slice(0, 20),
  );

export const resourceSchema = z.object({
  businessId: uuid,
  resourceId: uuid.optional(),
  branchId: uuid,
  type: resourceTypeSchema,
  name: name('El nombre del recurso'),
  skills,
  isLogistics: checkbox,
  active: checkbox,
  // Datos del profesional (solo recursos persona)
  professionalEmail: z
    .union([z.literal(''), z.email('Email no válido')])
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null)),
  professionalPhone: optionalText(30),
});
export type ResourceInput = z.infer<typeof resourceSchema>;

// ---------------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------------
export const requirementSchema = z.object({
  resourceType: resourceTypeSchema,
  quantity: z.coerce.number().int().min(1, 'Cantidad mínima 1').max(50),
  requiredSkill: z
    .string()
    .trim()
    .toLowerCase()
    .max(60)
    .optional()
    .transform((v) => (v ? v : null)),
});

export const serviceSchema = z.object({
  businessId: uuid,
  serviceId: uuid.optional(),
  name: name('El nombre del servicio'),
  description: optionalText(500),
  durationMinutes: minutes('La duración', 5, 10080),
  priceClp: clp,
  bufferBeforeMinutes: minutes('La holgura previa', 0, 1440).default(0),
  bufferAfterMinutes: minutes('La holgura posterior', 0, 1440).default(0),
  active: checkbox,
  requirements: z.array(requirementSchema).max(10).default([]),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

// ---------------------------------------------------------------------------
// Adicionales
// ---------------------------------------------------------------------------
export const addonSchema = z.object({
  businessId: uuid,
  addonId: uuid.optional(),
  name: name('El nombre del adicional'),
  description: optionalText(500),
  priceClp: clp,
  active: checkbox,
});

export const addonStockSchema = z.object({
  businessId: uuid,
  addonId: uuid,
  branchId: uuid,
  quantity: z.coerce.number({ message: 'El stock debe ser un número' }).int('El stock debe ser un número entero').min(0, 'El stock no puede ser negativo').max(100000),
});

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------
export const memberSchema = z
  .object({
    businessId: uuid,
    email: z.email('Email no válido').transform((v) => v.trim().toLowerCase()),
    role: roleSchema,
    branchIds: z.array(uuid).default([]),
  })
  .refine((m) => m.role !== 'branch_admin' || m.branchIds.length > 0, {
    message: 'Un administrador de sucursal debe tener al menos una sucursal asignada',
    path: ['branchIds'],
  });

// ---------------------------------------------------------------------------
// Cuenta
// ---------------------------------------------------------------------------
export const signUpSchema = z.object({
  fullName: name('Tu nombre'),
  email: z.email('Email no válido').transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
});

export const signInSchema = z.object({
  email: z.email('Email no válido').transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

export const passwordResetSchema = z.object({
  email: z.email('Email no válido').transform((v) => v.trim().toLowerCase()),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Las contraseñas no coinciden', path: ['confirm'] });

/** Primer mensaje de error legible de un resultado de Zod. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos no válidos';
}

// ---------------------------------------------------------------------------
// Reservas (fase 2A)
// ---------------------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida');

export const slotQuerySchema = z.object({
  businessId: uuid,
  branchId: uuid,
  date: isoDate,
  serviceIds: z.array(uuid).min(1, 'Elige al menos un servicio').max(10),
  preferredPersonId: uuid.nullable().optional(),
  addons: z
    .array(z.object({ addonId: uuid, quantity: z.coerce.number().int().min(1).max(20) }))
    .max(10)
    .default([]),
});
export type SlotQuery = z.infer<typeof slotQuerySchema>;

const customerFields = {
  fullName: name('Tu nombre'),
  phone: z
    .string({ message: 'El teléfono es obligatorio' })
    .trim()
    .min(8, 'Teléfono no válido')
    .max(20, 'Teléfono no válido')
    .regex(/^\+?[\d\s()-]+$/, 'Teléfono no válido'),
  email: z
    .union([z.literal(''), z.email('Email no válido')])
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null)),
};

export const publicBookingSchema = slotQuerySchema.extend({
  startsAt: z.iso.datetime({ offset: true, message: 'Horario no válido' }),
  ...customerFields,
  notes: optionalText(300),
});

export const receptionBookingSchema = slotQuerySchema
  .extend({
    startsAt: z.iso.datetime({ offset: true, message: 'Horario no válido' }),
    customerId: uuid.optional(),
    fullName: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(20).optional(),
    email: customerFields.email,
    notes: optionalText(300),
  })
  .refine((b) => b.customerId || (b.fullName && b.phone && b.phone.length >= 8), {
    message: 'Elige un cliente o ingresa nombre y teléfono',
    path: ['fullName'],
  });

export const bookingSettingsSchema = z.object({
  businessId: uuid,
  slotIntervalMinutes: z.coerce.number().int().min(5).max(120),
  minAdvanceMinutes: z.coerce.number().int().min(0, 'No puede ser negativo').max(10080),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  cancellationHours: z.coerce.number().int().min(0).max(168),
  publicBookingEnabled: checkbox,
});
