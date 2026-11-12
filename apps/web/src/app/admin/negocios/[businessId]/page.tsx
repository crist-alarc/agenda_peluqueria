import { formatMoney, remainingLabel } from '@agenda/core';
import { DbError, getSupportSnapshot, type SupportSnapshot } from '@agenda/db';
import { Alert, Badge, PageHeader } from '@agenda/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requirePlatformAdmin } from '@/lib/session';
import { t, weekdayName } from '@/lib/texts';

export const metadata = { title: 'Soporte' };

const time = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(iso));

const yesNo = (v: boolean) => (v ? 'Sí' : 'No');

/**
 * Configuración de un negocio para darle soporte (ADR 0008). Solo lectura: aquí no hay
 * ningún formulario. Exige un acceso aprobado por el negocio y cada visita queda registrada.
 */
export default async function SupportViewPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) notFound();
  const { db } = await requirePlatformAdmin();

  let s: SupportSnapshot;
  try {
    s = await getSupportSnapshot(db, businessId);
  } catch (error) {
    if (!(error instanceof DbError)) throw error;
    return (
      <>
        <PageHeader title="Sin acceso a este negocio" />
        <Alert className="max-w-2xl">
          {error.message}. Pide el acceso desde la ficha del cliente; el negocio lo aprueba en su panel, en Soporte.
        </Alert>
        <Link href="/admin/clientes" className="mt-4 inline-block text-sm hover:underline">
          Volver a clientes
        </Link>
      </>
    );
  }

  const b = s.business;
  const money = (n: number) => formatMoney(n, b.currency);
  const now = new Date().toISOString();
  const branchName = (id: string) => s.branches.find((x) => x.id === id)?.name ?? '';
  const sentCount = (kind: string) => s.notifications30d[`${kind}:sent`] ?? 0;
  const failed = Object.entries(s.notifications30d)
    .filter(([k]) => k.endsWith(':failed'))
    .reduce((n, [, v]) => n + v, 0);

  return (
    <>
      <div className="mb-6 rounded-lg bg-platform-soft px-4 py-3 text-sm text-foreground dark:text-platform-foreground" role="status">
        <strong className="font-semibold">Solo lectura.</strong> El negocio aprobó tu acceso hasta {time(s.accessExpiresAt)} (quedan{' '}
        {remainingLabel(s.accessExpiresAt, now)}). Esta visita quedó registrada y el negocio la puede ver.
      </div>

      <PageHeader
        title={b.name}
        description={`${t.bookingModes[b.bookingMode as keyof typeof t.bookingModes] ?? b.bookingMode}, plan ${s.plan?.code ?? 'sin plan'}`}
      />

      <nav aria-label="Secciones" className="mb-8 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {['Ajustes', 'Plan y funciones', 'Sucursales', 'Recursos', 'Servicios', 'Equipo', 'Actividad'].map((label) => (
          <a key={label} href={`#${slug(label)}`} className="text-muted-foreground hover:text-foreground hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-10">
        <Section title="Ajustes">
          <Pairs
            items={[
              ['Zona horaria', b.timezone],
              ['País y moneda', `${b.country}, ${b.currency}`],
              ['Contacto', [b.phone, b.email].filter(Boolean).join(', ') || 'Sin datos'],
              ['Link público', b.publicBookingEnabled ? `/r/${b.slug}` : 'Desactivado'],
              ['Precios en el link', yesNo(b.showPublicPrices)],
              ['Intervalo de horarios', `${b.slotIntervalMinutes} min`],
              ['Anticipación mínima', `${b.minAdvanceMinutes} min`],
              ['Reservas hasta', `${b.maxAdvanceDays} días adelante`],
              ['Cancelación', b.cancellationHours ? `hasta ${b.cancellationHours} h antes` : 'sin restricción'],
              ['Confirmación', b.confirmationMode === 'email' ? `por email, espera ${b.pendingHoldMinutes} min` : 'automática'],
              ['Recordatorio', b.reminderEnabled ? `${b.reminderHoursBefore} h antes, corte ${b.confirmationCutoffHours} h antes` : 'desactivado'],
              ['Liquidación de comisiones', b.settlementPeriod],
            ]}
          />
        </Section>

        <Section title="Plan y funciones">
          <p className="mb-3 text-sm">
            Plan <strong>{s.plan?.code ?? 'sin plan'}</strong>
            {s.plan && `, ${s.plan.status}, desde ${time(s.plan.startedAt)}`}
          </p>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {s.entitlements.map((e) => (
              <li key={e.feature} className={e.enabled ? '' : 'text-muted-foreground line-through'}>
                {e.feature}
                {e.limit != null && `: hasta ${e.limit}`}
                {e.source !== 'plan' && <Badge variant="outline" className="ml-2">{e.source}</Badge>}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Sucursales">
          {s.branches.map((br) => (
            <div key={br.id} className="mb-5">
              <h3 className="font-medium">
                {br.name} {!br.active && <Badge variant="muted">Inactiva</Badge>}
              </h3>
              <p className="text-sm text-muted-foreground">{[br.address, br.commune].filter(Boolean).join(', ') || 'Sin dirección'}</p>
              <p className="mt-1 text-sm">{hours(br.hours) || 'Sin horario: no recibe reservas'}</p>
              {b.bookingMode === 'rental' && (
                <p className="mt-1 text-sm">
                  Despacho {br.deliveryMode === 'fixed' ? `fijo ${money(br.deliveryFee)}` : br.deliveryMode === 'by_zone' ? 'según zona' : 'incluido'}
                  {br.zones.length > 0 && `. Zonas: ${br.zones.map((z) => `${z.name}${br.deliveryMode === 'by_zone' ? ` (${money(z.fee)})` : ''}${z.active ? '' : ' inactiva'}`).join(', ')}`}
                </p>
              )}
            </div>
          ))}
        </Section>

        <Section title="Recursos">
          {s.resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin recursos: los servicios que requieren uno no tendrán horarios.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="[&_td]:border-b [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top">
                {s.resources.map((r) => (
                  <tr key={r.id} className={r.active ? '' : 'text-muted-foreground'}>
                    <td className="font-medium">{r.name}</td>
                    <td>{t.resourceTypes[r.type as keyof typeof t.resourceTypes] ?? r.type}</td>
                    <td>{r.skills.join(', ') || 'Sin habilidades'}</td>
                    <td>{branchName(r.branchId)}</td>
                    <td>
                      {r.isLogistics && `Logística${r.maxEventsPerDay ? `, ${r.maxEventsPerDay} eventos/día` : ''}. `}
                      {r.hours.length > 0 ? hours(r.hours) : 'Horario de la sucursal'}
                      {r.type === 'person' && (r.linkedAccount ? '. Con cuenta' : '. Sin cuenta vinculada')}
                      {!r.active && '. Inactivo'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Servicios">
          <table className="w-full text-sm">
            <tbody className="[&_td]:border-b [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top">
              {s.services.map((sv) => (
                <tr key={sv.id} className={sv.active ? '' : 'text-muted-foreground'}>
                  <td className="font-medium">{sv.name}</td>
                  <td className="tabular-nums">{money(sv.price)}</td>
                  <td>
                    {sv.fullDay ? 'Día completo' : `${sv.durationMinutes} min`}
                    {(sv.bufferBeforeMinutes > 0 || sv.bufferAfterMinutes > 0) && `, holgura ${sv.bufferBeforeMinutes}/${sv.bufferAfterMinutes} min`}
                  </td>
                  <td>
                    {sv.requirements.length === 0
                      ? 'No requiere recursos'
                      : sv.requirements
                          .map((q) => `${q.quantity} ${t.resourceTypes[q.type as keyof typeof t.resourceTypes] ?? q.type}${q.skill ? ` (${q.skill})` : ''}`)
                          .join(' + ')}
                  </td>
                  <td>
                    {sv.photos > 0 && `${sv.photos} fotos. `}
                    {!sv.active && 'Inactivo'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.addons.length > 0 && (
            <p className="mt-3 text-sm">
              Adicionales: {s.addons.map((a) => `${a.name} ${money(a.price)}, stock ${a.stock}${a.active ? '' : ' (inactivo)'}`).join('; ')}
            </p>
          )}
        </Section>

        <Section title="Equipo">
          <ul className="space-y-1 text-sm">
            {s.members.map((m) => (
              <li key={`${m.email}-${m.role}`}>
                {m.name || m.email} <span className="text-muted-foreground">({t.roles[m.role as keyof typeof t.roles] ?? m.role})</span>
                {m.canApproveSupport && <Badge variant="outline" className="ml-2">Aprueba soporte</Badge>}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Actividad">
          <Pairs
            items={[
              ['Reservas, 30 días', String(s.totals.bookings30d)],
              ['Fichas de clientes', String(s.totals.customers)],
              ['Emails de reserva, 30 días', String(sentCount('booking_created') + sentCount('booking_pending'))],
              ['Recordatorios, 30 días', String(sentCount('reminder'))],
              ['Envíos fallidos, 30 días', String(failed)],
            ]}
          />
        </Section>
      </div>
    </>
  );
}

const slug = (label: string) =>
  label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section id={slug(title)} aria-labelledby={`${slug(title)}-t`} className="scroll-mt-6">
      <h2 id={`${slug(title)}-t`} className="mb-3 border-b pb-2 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Pairs({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid max-w-3xl grid-cols-[minmax(9rem,14rem)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function hours(list: Array<{ weekday: number; start: string; end: string }>): string {
  return list.map((h) => `${weekdayName(h.weekday)} ${h.start.slice(0, 5)}–${h.end.slice(0, 5)}`).join(', ');
}
