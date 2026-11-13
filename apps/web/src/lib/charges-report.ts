import 'server-only';
import { BILLING_DOCUMENTS, CHARGE_STATUSES, currencyInfo, formatRut, overdueDays, type BillingDocument } from '@agenda/core';
import type { ChargeSummary } from '@agenda/db';
import ExcelJS from 'exceljs';

/**
 * Excel de los cobros de un mes (ADR 0011): una hoja por moneda, porque los totales no se suman entre
 * monedas. Los montos van en unidades de la moneda (no en su unidad mínima) para poder sumarlos en Excel.
 */
export async function chargesXlsx(month: string, charges: ChargeSummary[], today: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Plataforma';
  const currencies = [...new Set(charges.map((c) => c.currency))].sort();
  if (currencies.length === 0) currencies.push('CLP');
  for (const currency of currencies) {
    const { minorUnits } = currencyInfo(currency);
    const digits = minorUnits > 0 ? `.${'0'.repeat(minorUnits)}` : '';
    const money = `"$"#,##0${digits};-"$"#,##0${digits}`;
    const cell = (amount: number) => amount / 10 ** minorUnits;
    const ws = wb.addWorksheet(`Cobros ${currency}`);
    const head = ws.addRow([
      'Mes', 'Negocio', 'Razón social o nombre', 'RUT o identificación', 'Documento', 'Folio', 'Emisión', 'Vence', 'Plazo',
      'Neto', 'Impuesto', 'Total', 'Estado', 'Días de atraso', 'Pagado el', 'Forma de pago', 'Email', 'Nota de crédito', 'Motivo de anulación',
    ]);
    head.font = { bold: true };
    const rows = charges.filter((c) => c.currency === currency);
    for (const c of rows) {
      const who = c.billTo ?? (c.profile ? { legalName: c.profile.legalName, taxId: c.profile.taxId, country: c.profile.country, email: c.profile.email } : null);
      const taxId = who?.taxId ? (who.country === 'CL' ? formatRut(who.taxId) : who.taxId) : '';
      const doc = (c.documentType ?? c.profile?.documentType) as BillingDocument | undefined;
      ws.addRow([
        c.month, c.businessName, who?.legalName ?? '', taxId, doc ? BILLING_DOCUMENTS[doc] : '', c.folio ?? '', c.issuedOn ?? '', c.dueOn ?? '',
        c.paymentTermName ?? '', cell(c.net), cell(c.tax), cell(c.gross), CHARGE_STATUSES[c.status],
        c.status === 'invoiced' && c.dueOn ? overdueDays(c.dueOn, today) : '', c.paidOn ?? '', c.paidMethod ?? c.paymentMethodName ?? '',
        who?.email ?? '', c.creditNoteFolio ?? '', c.voidReason ?? '',
      ]);
    }
    const valid = rows.filter((c) => c.status !== 'void');
    const total = ws.addRow(['', 'Total (sin anulados)', '', '', '', '', '', '', '', cell(valid.reduce((s, c) => s + c.net, 0)), cell(valid.reduce((s, c) => s + c.tax, 0)), cell(valid.reduce((s, c) => s + c.gross, 0))]);
    total.font = { bold: true };
    ws.columns = [8, 26, 28, 16, 20, 10, 11, 11, 12, 13, 13, 13, 13, 9, 11, 18, 26, 14, 26].map((width) => ({ width }));
    for (const col of [10, 11, 12]) ws.getColumn(col).numFmt = money;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.addRow([]);
    ws.addRow([`Cobros de ${month}, generados el ${today}`]).font = { italic: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
