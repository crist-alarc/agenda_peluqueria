import { getCurrentUser } from '@agenda/auth';
import { Button } from '@agenda/ui';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { t } from '@/lib/texts';
import { signOutAction } from './(auth)/actions';

export default async function HomePage() {
  // Con una sesión abierta, "Crear cuenta" llevaría al panel: se ofrece ir al panel o cerrar sesión.
  const user = await getCurrentUser(await getDb());
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center gap-6 px-6 py-16">
      <div className="flex items-center gap-3">
        <img src="/icon.svg" alt="" className="size-12" />
        <span className="text-2xl font-semibold">{t.appName}</span>
      </div>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t.tagline}</h1>
      <p className="text-lg text-muted-foreground">
        Peluquerías, barberías, canchas, inflables, veterinarias y más: servicios, personas, recursos y sucursales con
        una sola cuenta.
      </p>
      {user ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Sesión abierta como {user.email}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/panel?todos=1">Ir a mis negocios</Link>
            </Button>
            <form action={signOutAction}>
              <Button size="lg" variant="outline">
                Cerrar sesión
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/registro">Crear cuenta</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Ingresar</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
