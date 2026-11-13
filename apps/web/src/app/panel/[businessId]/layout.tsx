import { can, type Permission } from '@agenda/core';
import { getPlatformRole, listSupportRequests } from '@agenda/db';
import { Badge, Button } from '@agenda/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BillingGate } from '@/components/billing-gate';
import { BillingBlocked, BillingGraceNotice } from '@/components/billing-notice';
import { NavLink } from '@/components/nav-link';
import { getBillingState, requireBusiness } from '@/lib/session';
import { t } from '@/lib/texts';
import { signOutAction } from '../../(auth)/actions';

const NAV: Array<{ href: string; label: string; permission: Permission }> = [
  { href: '/agenda', label: 'Agenda', permission: 'bookings.view' },
  { href: '/clientes', label: 'Clientes', permission: 'customers.view' },
  { href: '', label: 'Resumen', permission: 'catalog.view' },
  { href: '/sucursales', label: 'Sucursales', permission: 'catalog.view' },
  { href: '/recursos', label: 'Recursos', permission: 'catalog.view' },
  { href: '/servicios', label: 'Servicios', permission: 'catalog.view' },
  { href: '/adicionales', label: 'Adicionales', permission: 'catalog.view' },
  { href: '/equipo', label: 'Equipo', permission: 'catalog.view' },
  { href: '/comisiones', label: 'Comisiones', permission: 'commissions.view' },
  { href: '/plan', label: 'Plan', permission: 'plan.view' },
  { href: '/configuracion', label: 'Configuración', permission: 'business.update' },
];

export default async function BusinessLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { db, business, membership, user, canApproveSupport } = await requireBusiness(businessId);
  const base = `/panel/${business.id}`;
  const [requests, platformRole, billing] = await Promise.all([
    canApproveSupport ? listSupportRequests(db, business.id, 1) : Promise.resolve([]),
    getPlatformRole(db, user.id),
    getBillingState(business.id),
  ]);
  const platformAdmin = platformRole !== null;
  const pendingSupport = requests.find((r) => r.status === 'pending');

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b bg-card md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2 p-4">
          <Link href="/panel" className="flex min-w-0 items-center gap-2">
            <img src="/icon.svg" alt="" className="size-7 shrink-0" />
            <span className="truncate font-semibold">{business.name}</span>
          </Link>
        </div>
        <div className="px-4 pb-3">
          <Badge variant="secondary">{t.roles[membership.role]}</Badge>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-4">
          {NAV.filter((item) => can(membership, item.permission)).map((item) => (
            <NavLink key={item.href} href={`${base}${item.href}`} exact={item.href === ''}>
              {item.label}
            </NavLink>
          ))}
          {membership.role === 'owner' && <NavLink href={`${base}/facturacion`}>Facturación</NavLink>}
          {canApproveSupport && <NavLink href={`${base}/soporte`}>Soporte</NavLink>}
        </nav>
        {/* Cuenta: visible también en el teléfono (antes solo en pantallas grandes) */}
        <div className="border-t px-4 py-3 text-xs text-muted-foreground md:p-4">
          <p className="truncate">{user.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href="/panel?todos=1" className="hover:underline">
              Mis negocios
            </Link>
            <Link href="/panel/nuevo" className="hover:underline">
              Nuevo negocio
            </Link>
            <Link href="/mis-reservas" className="hover:underline">
              Mis reservas
            </Link>
            {platformAdmin && (
              <Link href="/admin" className="hover:underline">
                Plataforma
              </Link>
            )}
            <form action={signOutAction}>
              <Button variant="link" size="xs" className="h-auto p-0 text-xs text-muted-foreground">
                Cerrar sesión
              </Button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        {business.suspended_at && (
          <div role="alert" className="mb-6 rounded-lg border border-destructive/50 px-4 py-3 text-sm">
            Tu negocio está suspendido{business.suspension_reason ? `: ${business.suspension_reason}` : ''}. El panel está en solo lectura y
            el link público no recibe reservas. Revisa los detalles en{' '}
            <Link href={`${base}/plan`} className="font-medium underline underline-offset-2">
              Plan
            </Link>
            .
          </div>
        )}
        {pendingSupport && (
          <div role="status" className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-access-pending/50 px-4 py-3 text-sm">
            <span className="size-2 rounded-full bg-access-pending" aria-hidden />
            Soporte pide acceso para revisar tu configuración.
            <Link href={`${base}/soporte`} className="font-medium underline underline-offset-2">
              Revisar solicitud
            </Link>
          </div>
        )}
        {billing?.status === 'grace' && <BillingGraceNotice billing={billing} base={base} />}
        <BillingGate base={base} blocked={billing?.status === 'blocked'} gate={billing ? <BillingBlocked billing={billing} base={base} /> : null}>
          {children}
        </BillingGate>
      </main>
    </div>
  );
}
