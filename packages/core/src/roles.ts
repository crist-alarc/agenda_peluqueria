/**
 * Roles y permisos dentro de un negocio (directrices, sección 5.2).
 * Refleja lo que imponen las políticas RLS de la base: se usa en el servidor
 * para validar antes de llamar a la base y para decidir qué acciones ofrecer.
 * La base de datos sigue siendo la garantía final.
 */
export const ROLES = ['owner', 'admin', 'branch_admin', 'receptionist', 'staff', 'seller'] as const;
export type Role = (typeof ROLES)[number];

/** Roles que se limitan a sucursales concretas. */
export const BRANCH_SCOPED_ROLES: readonly Role[] = ['branch_admin', 'receptionist', 'staff', 'seller'];

export type MembershipContext = {
  role: Role;
  /** Sucursales asignadas; vacío = sin restricción por sucursal. */
  branchIds: readonly string[];
};

export type Permission =
  | 'business.update'
  | 'catalog.view'
  | 'catalog.manage'
  | 'branches.create'
  | 'team.manage'
  | 'audit.view'
  | 'plan.view'
  /** Ver la agenda (staff: solo la propia; lo filtra la base). */
  | 'bookings.view'
  /** Crear reservas y cambiar su estado (recepción). */
  | 'bookings.manage'
  | 'customers.view'
  /** Reglas, repartos, ajustes y liquidaciones del equipo. */
  | 'commissions.manage'
  /** Ver comisiones (cada profesional solo las suyas; lo filtra la base). */
  | 'commissions.view';

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: [
    'business.update', 'catalog.view', 'catalog.manage', 'branches.create', 'team.manage', 'audit.view', 'plan.view',
    'bookings.view', 'bookings.manage', 'customers.view', 'commissions.manage', 'commissions.view',
  ],
  admin: [
    'business.update', 'catalog.view', 'catalog.manage', 'branches.create', 'team.manage', 'audit.view', 'plan.view',
    'bookings.view', 'bookings.manage', 'customers.view', 'commissions.manage', 'commissions.view',
  ],
  branch_admin: ['catalog.view', 'plan.view', 'bookings.view', 'bookings.manage', 'customers.view', 'commissions.view'],
  receptionist: ['catalog.view', 'bookings.view', 'bookings.manage', 'customers.view', 'commissions.view'],
  staff: ['catalog.view', 'bookings.view', 'commissions.view'],
  seller: ['catalog.view'],
};

export function can(membership: MembershipContext, permission: Permission): boolean {
  return MATRIX[membership.role].includes(permission);
}

/** Puede editar la sucursal, su horario, sus recursos y su stock. */
export function canManageBranch(membership: MembershipContext, branchId: string): boolean {
  if (membership.role === 'owner' || membership.role === 'admin') return true;
  return membership.role === 'branch_admin' && membership.branchIds.includes(branchId);
}

/** Solo un dueño puede asignar (o quitar) el rol de dueño. */
export function canAssignRole(actor: MembershipContext, role: Role): boolean {
  if (!can(actor, 'team.manage')) return false;
  return role !== 'owner' || actor.role === 'owner';
}
