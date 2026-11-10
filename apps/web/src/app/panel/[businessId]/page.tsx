import { can, checkLimit, utcToZonedLocal } from '@agenda/core';
import { countByBusiness, getEntitlements, listAudit, listMembers } from '@agenda/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from '@agenda/ui';
import Link from 'next/link';
import { requireBusiness } from '@/lib/session';
import { t } from '@/lib/texts';

export const metadata = { title: 'Resumen' };

export default async function OverviewPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business, membership } = await requireBusiness(businessId);
  const base = `/panel/${business.id}`;
  const canAudit = can(membership, 'audit.view');

  const [branches, resources, services, addons, entitlements, audit, members] = await Promise.all([
    countByBusiness(db, 'branches', business.id),
    countByBusiness(db, 'resources', business.id),
    countByBusiness(db, 'services', business.id),
    countByBusiness(db, 'addons', business.id),
    getEntitlements(db, business.id),
    canAudit ? listAudit(db, business.id, 15) : Promise.resolve([]),
    canAudit ? listMembers(db, business.id) : Promise.resolve([]),
  ]);
  const names = new Map(members.map((m) => [m.userId, m.fullName ?? m.email ?? 'Alguien']));
  // Agrupa cambios consecutivos idénticos (ej. los derechos del plan al crear el negocio)
  const auditGroups: Array<{ entry: (typeof audit)[number]; count: number }> = [];
  for (const entry of audit) {
    const last = auditGroups[auditGroups.length - 1];
    const row = (entry.new_data ?? entry.old_data) as { name?: string } | null;
    const lastRow = last ? ((last.entry.new_data ?? last.entry.old_data) as { name?: string } | null) : null;
    if (
      last &&
      !row?.name &&
      !lastRow?.name &&
      last.entry.table_name === entry.table_name &&
      last.entry.action === entry.action &&
      last.entry.actor_user_id === entry.actor_user_id
    ) {
      last.count++;
    } else {
      auditGroups.push({ entry, count: 1 });
    }
  }

  const tiles = [
    { label: 'Sucursales', value: branches, href: '/sucursales', feature: 'branches' as const },
    { label: 'Recursos', value: resources, href: '/recursos', feature: 'resources' as const },
    { label: 'Servicios', value: services, href: '/servicios' },
    { label: 'Adicionales', value: addons, href: '/adicionales' },
  ];

  const steps = [
    { done: resources > 0, text: 'Agrega a tu equipo y tus espacios o equipos como recursos', href: '/recursos' },
    { done: services > 0, text: 'Revisa los servicios, sus precios y duración', href: '/servicios' },
    { done: true, text: 'Revisa el horario de tu sucursal', href: '/sucursales' },
  ];

  return (
    <>
      <PageHeader title={business.name} description={`${t.bookingModes[business.booking_mode]} · ${business.timezone}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const limit = tile.feature ? checkLimit(entitlements, tile.feature, tile.value) : null;
          const max = tile.feature ? entitlements.find((e) => e.feature === tile.feature)?.limit_value : null;
          return (
            <Link key={tile.label} href={`${base}${tile.href}`}>
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{tile.label}</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">
                    {tile.value}
                    {max != null && <span className="text-base font-normal text-muted-foreground"> / {max}</span>}
                  </p>
                  {limit && !limit.allowed && <p className="mt-1 text-xs text-muted-foreground">Límite del plan</p>}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {can(membership, 'catalog.manage') && resources === 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Primeros pasos</CardTitle>
            <CardDescription>Con esto tu negocio queda listo para recibir reservas (próxima fase).</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {steps.map((s, i) => (
                <li key={i}>
                  <Link href={`${base}${s.href}`} className="hover:underline">
                    {i + 1}. {s.text}
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {canAudit && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Últimos cambios</CardTitle>
            <CardDescription>Registro de auditoría: quién cambió qué y cuándo.</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>
            ) : (
              <ul className="divide-y text-sm">
                {auditGroups.map(({ entry: a, count }) => {
                  const row = (a.new_data ?? a.old_data) as { name?: string } | null;
                  return (
                    <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        <strong className="font-medium">{a.actor_user_id ? names.get(a.actor_user_id) ?? 'Alguien' : 'Sistema'}</strong>{' '}
                        {t.auditActions[a.action]} {(t.auditTables[a.table_name] ?? a.table_name).toLowerCase()}
                        {row?.name ? ` «${row.name}»` : ''}
                        {count > 1 && <span className="text-muted-foreground"> (×{count})</span>}
                      </span>
                      <time className="text-muted-foreground tabular-nums">
                        {utcToZonedLocal(a.created_at, business.timezone).replace('T', ' ')}
                      </time>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
