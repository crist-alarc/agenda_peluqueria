import type { BusinessBilling } from '@agenda/db';
import { buttonVariants } from '@agenda/ui';
import Link from 'next/link';

const TZ = 'America/Santiago';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const longDate = (d: string) =>
  new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Aviso de días de gracia: la fecha límite es lo importante, y se dice qué pasa si vence. */
export function BillingGraceNotice({ billing, base }: { billing: BusinessBilling; base: string }) {
  const left = daysBetween(today(), billing.graceUntil);
  const urgent = left <= 3;
  return (
    <div
      role="status"
      className={`mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border-l-4 border-access-pending bg-access-pending/8 px-4 py-3 ${urgent ? 'ring-1 ring-access-pending/40' : ''}`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-access-pending">{left}</span>
        <span className="text-sm text-access-pending">{left === 1 ? 'día' : 'días'}</span>
      </div>
      <p className="min-w-0 flex-1 basis-64 text-sm">
        <span className="font-medium">Completa los datos de facturación antes del {longDate(billing.graceUntil)}.</span>{' '}
        Si no, el panel y tu link de reservas se pausan hasta que estén. Las reservas ya tomadas no se afectan.
      </p>
      {billing.isOwner ? (
        <Link href={`${base}/facturacion`} className={buttonVariants({ size: 'sm' })}>
          Completar datos
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">El dueño del negocio debe completarlos.</p>
      )}
    </div>
  );
}

/** Lo que se ve en vez del panel cuando el plazo venció. */
export function BillingBlocked({ billing, base }: { billing: BusinessBilling; base: string }) {
  return (
    <section className="max-w-xl py-10" aria-labelledby="pausa">
      <h1 id="pausa" className="text-2xl font-semibold">
        El panel está en pausa
      </h1>
      <p className="mt-3 text-muted-foreground">
        El plazo para completar los datos de facturación venció el {longDate(billing.graceUntil)}. Mientras falten, tu link no recibe reservas
        nuevas. Las que ya tenías siguen en pie y sus clientes reciben sus recordatorios.
      </p>
      {billing.isOwner ? (
        <Link href={`${base}/facturacion`} className={`${buttonVariants()} mt-6`}>
          Completar datos de facturación
        </Link>
      ) : (
        <p className="mt-6 text-sm">Pídele al dueño del negocio que complete los datos de facturación.</p>
      )}
    </section>
  );
}
