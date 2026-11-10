/**
 * Textos de la interfaz en español de Chile, centralizados (directrices, sección 23).
 */
import type { Role } from '@agenda/core';

export const t = {
  appName: 'Agenda',
  tagline: 'La agenda de tu negocio de servicios, en un solo lugar.',
  roles: {
    owner: 'Dueño',
    admin: 'Administrador',
    branch_admin: 'Administrador de sucursal',
    receptionist: 'Recepción',
    staff: 'Profesional',
    seller: 'Vendedor',
  } satisfies Record<Role, string>,
  resourceTypes: {
    person: 'Persona',
    space: 'Espacio',
    equipment: 'Equipo',
  },
  resourceTypeHints: {
    person: 'Peluquero, instructor, veterinario…',
    space: 'Sillón, box, cancha, sala…',
    equipment: 'Juego inflable, camioneta, máquina…',
  },
  bookingModes: {
    appointment: 'Persona + horario',
    fixed_slot: 'Bloques fijos',
    capacity: 'Cupos',
    rental: 'Arriendo con logística',
    queue: 'Orden de llegada',
  },
  weekdays: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  features: {
    branches: 'Sucursales',
    resources: 'Recursos',
    email_notifications: 'Notificaciones por email',
    whatsapp_messages: 'Mensajes de WhatsApp',
    rules: 'Reglas de cálculo',
    landing: 'Landing page',
    commissions: 'Comisiones',
    partnerships: 'Acuerdos entre negocios',
    sellers: 'Vendedores',
  } as Record<string, string>,
  auditTables: {
    businesses: 'Negocio',
    branches: 'Sucursal',
    memberships: 'Equipo',
    resources: 'Recurso',
    services: 'Servicio',
    service_resource_requirements: 'Requisito de servicio',
    addons: 'Adicional',
    addon_stock: 'Stock',
    blocks: 'Bloqueo',
    business_subscriptions: 'Suscripción',
    business_entitlements: 'Derechos del plan',
  } as Record<string, string>,
  auditActions: { insert: 'creó', update: 'modificó', delete: 'eliminó' } as Record<string, string>,
  errors: {
    invalid: 'Revisa los datos ingresados',
    unexpected: 'Ocurrió un error inesperado. Intenta de nuevo.',
    limitReached: (feature: string, limit: number) =>
      `Tu plan permite hasta ${limit} ${feature.toLowerCase()}. Para agregar más, mejora tu plan.`,
    notIncluded: (feature: string) => `Tu plan no incluye ${feature.toLowerCase()}.`,
    forbidden: 'No tienes permiso para hacer esto',
  },
  saved: 'Cambios guardados',
};

export function weekdayName(weekday: number): string {
  return t.weekdays[weekday] ?? '';
}
