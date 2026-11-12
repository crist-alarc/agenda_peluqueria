import { Badge, Button, Card, CardContent, PageHeader } from '@agenda/ui';
import { listMyBusinesses } from '@agenda/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { t } from '@/lib/texts';
import { signOutAction } from '../(auth)/actions';

export const metadata = { title: 'Mis negocios' };

/** Selector de contexto "Mi negocio" (directrices, sección 5.1). */
export default async function PanelPage({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const { db, user } = await requireUser();
  const { todos } = await searchParams;
  const businesses = await listMyBusinesses(db, user.id);
  if (businesses.length === 0) redirect('/panel/nuevo');
  // Con un solo negocio se entra directo, salvo que la persona pida ver la lista (para crear otro)
  if (businesses.length === 1 && !todos) redirect(`/panel/${businesses[0]!.id}`);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader
        title="Mis negocios"
        description={`${user.email ?? ''} · Una sola cuenta para todos tus negocios`}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/panel/nuevo">Nuevo negocio</Link>
            </Button>
            <form action={signOutAction}>
              <Button variant="ghost">Cerrar sesión</Button>
            </form>
          </div>
        }
      />
      <div className="grid gap-3">
        {businesses.map((b) => (
          <Link key={b.id} href={`/panel/${b.id}`}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-sm text-muted-foreground">{t.bookingModes[b.booking_mode]}</p>
                </div>
                <Badge variant="secondary">{t.roles[b.role]}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
