import { getBillingAlerts, listCharges } from '@agenda/db';
import { notFound } from 'next/navigation';
import { chargesXlsx } from '@/lib/charges-report';
import { requirePlatformAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Excel de los cobros de un mes (ADR 0011). */
export async function GET(request: Request) {
  const { db } = await requirePlatformAdmin();
  const month = new URL(request.url).searchParams.get('mes') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const [charges, alerts] = await Promise.all([listCharges(db, month), getBillingAlerts(db)]);
  const body = await chargesXlsx(month, charges, alerts.today);
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="cobros-${month}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
