import type { ReactNode } from 'react';
import Link from 'next/link';
import { NavLink } from '@/components/nav-link';
import { requirePlatformAdmin } from '@/lib/session';
import { signOutAction } from '../(auth)/actions';

export const metadata = { title: { default: 'Plataforma', template: '%s · Plataforma' }, robots: { index: false } };

/**
 * Consola de la plataforma (ADR 0008). La franja pino la distingue del panel de un
 * negocio: quien la usa también puede tener negocios propios y no debe confundirse.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = await requirePlatformAdmin();
  return (
    <div className="min-h-dvh">
      <header className="bg-platform text-platform-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin/clientes" className="flex items-center gap-2 font-semibold">
            <img src="/icon.svg" alt="" className="size-6" />
            Plataforma
          </Link>
          <nav className="flex gap-1" aria-label="Plataforma">
            <NavLink href="/admin/clientes" variant="platform">
              Clientes
            </NavLink>
            <NavLink href="/admin/planes" variant="platform">
              Planes
            </NavLink>
            <NavLink href="/admin/facturacion" variant="platform">
              Facturación
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-platform-foreground/80">
            <span className="hidden truncate sm:inline">{user.email}</span>
            <Link href="/panel?todos=1" className="hover:underline">
              Mis negocios
            </Link>
            <form action={signOutAction}>
              <button className="hover:underline">Cerrar sesión</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

