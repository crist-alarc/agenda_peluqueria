import { listCustomers, searchCustomers } from '@agenda/db';
import { Button, Card, EmptyState, Input, PageHeader } from '@agenda/ui';
import { requirePermission } from '@/lib/session';

export const metadata = { title: 'Clientes' };

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { businessId } = await params;
  const { q } = await searchParams;
  const { db, business } = await requirePermission(businessId, 'customers.view');
  const customers = q ? await searchCustomers(db, business.id, q) : await listCustomers(db, business.id);

  return (
    <>
      <PageHeader title="Clientes" description="Fichas de tus clientes. Solo las ve tu negocio." />
      <form className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre o teléfono" aria-label="Buscar cliente" className="max-w-sm" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      {customers.length === 0 ? (
        <EmptyState>{q ? 'Sin resultados.' : 'Aún no hay clientes. Se crean al reservar.'}</EmptyState>
      ) : (
        <Card>
          <ul className="divide-y">
            {customers.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <span className="font-medium">{c.full_name}</span>
                <span className="text-muted-foreground">
                  {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                  {c.email && ` · ${c.email}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
