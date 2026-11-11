import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/session';
import { loadSettlementReport, reportFileName, settlementPdf } from '@/lib/settlement-report';

export const dynamic = 'force-dynamic';

/** Descarga de la liquidación (PDF para teléfono). Cada profesional solo ve lo suyo (RLS). */
export async function GET(_: Request, { params }: { params: Promise<{ businessId: string; settlementId: string }> }) {
  const { businessId, settlementId } = await params;
  const { db, business } = await requirePermission(businessId, 'commissions.view');
  if (!/^[0-9a-f-]{36}$/i.test(settlementId)) notFound();
  const report = await loadSettlementReport(db, business, settlementId);
  if (!report) notFound();
  const body = await settlementPdf(report);
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${reportFileName(report, 'pdf')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
