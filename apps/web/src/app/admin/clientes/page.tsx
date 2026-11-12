import { listAdminClients } from '@agenda/db';
import { EmptyState, Input, PageHeader } from '@agenda/ui';
import Link from 'next/link';
import { SupportAccess } from '@/components/support-access';
import { requirePlatformAdmin } from '@/lib/session';

export const metadata = { title: 'Clientes' };

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }).format(new Date(iso));

/** Clientes de la plataforma: cada dueño con sus negocios (ADR 0008). */
export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { db } = await requirePlatformAdmin();
  const { q = '' } = await searchParams;
  const all = await listAdminClients(db);
  const needle = q.trim().toLocaleLowerCase('es-CL');
  const clients = needle
    ? all.filter((c) =>
        [c.name, c.owner.name, c.owner.email, ...c.businesses.map((b) => b.name)]
          .filter(Boolean)
          .some((v) => v!.toLocaleLowerCase('es-CL').includes(needle)),
      )
    : all;
  const businesses = all.reduce((n, c) => n + c.businesses.length, 0);
  const now = new Date().toISOString();

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`${all.length} ${all.length === 1 ? 'dueño' : 'dueños'} con ${businesses} ${businesses === 1 ? 'negocio' : 'negocios'}`}
        actions={
          <form className="w-full sm:w-72" role="search">
            <Input name="q" defaultValue={q} placeholder="Buscar cliente o negocio" aria-label="Buscar cliente o negocio" />
          </form>
        }
      />

      {clients.length === 0 ? (
        <EmptyState>{needle ? `Ningún cliente coincide con "${q}".` : 'Todavía no hay clientes.'}</EmptyState>
      ) : (
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sr-only sm:not-sr-only">
            <tr className="text-left text-muted-foreground [&_th]:border-b [&_th]:px-3 [&_th]:pb-2 [&_th]:font-medium">
              <th>Cliente</th>
              <th>Negocio</th>
              <th>Plan</th>
              <th className="text-right">Reservas 30 días</th>
              <th>Soporte</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) =>
              (c.businesses.length > 0 ? c.businesses : [null]).map((b, i) => (
                <tr
                  key={`${c.id}-${b?.id ?? 'sin-negocio'}`}
                  className="align-top max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-1 max-sm:py-3 [&_td]:px-3 sm:[&_td]:border-b sm:[&_td]:py-3 max-sm:border-b"
                >
                  <td className="max-sm:col-span-2">
                    {i === 0 && (
                      <Link href={`/admin/clientes/${c.id}`} className="block font-medium hover:underline">
                        {c.owner.name || c.owner.email || c.name}
                        <span className="block font-normal text-muted-foreground">{c.owner.email}</span>
                        <span className="block text-xs font-normal text-muted-foreground">Cliente desde {shortDate(c.createdAt)}</span>
                      </Link>
                    )}
                  </td>
                  <td>
                    {b ? (
                      <>
                        {b.name}
                        {b.suspendedAt && <span className="ml-2 text-xs font-medium text-destructive">Suspendido</span>}
                        <span className="block text-muted-foreground">{b.industry}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Sin negocios</span>
                    )}
                  </td>
                  <td>{b?.planName ?? ''}</td>
                  <td className="tabular-nums sm:text-right">{b ? b.bookings30d : ''}</td>
                  <td className="max-sm:col-span-2">
                    {b && <SupportAccess request={b.support} now={now} />}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
