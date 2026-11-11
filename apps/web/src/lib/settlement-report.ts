import 'server-only';
import { currencyInfo, formatMoney, formatPercent, localDate, localTime, summarizeSettlement, type SettlementSummary } from '@agenda/core';
import { getSettlement, listCommissionEntries, type DbClient, type SettlementRow } from '@agenda/db';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * Reporte de una liquidación (sección 16): Excel con todo el detalle y PDF
 * pensado para leerse en el teléfono (página angosta, letra grande, una
 * sección por persona).
 */

export type ReportLine = {
  professionalId: string;
  person: string;
  date: string;
  time: string;
  service: string;
  customer: string;
  baseAmount: number;
  share: string;
  rule: string;
  amount: number;
  kind: 'service' | 'adjustment';
  note: string;
};

export type SettlementReport = {
  businessName: string;
  currency: string;
  settlement: SettlementRow;
  periodLabel: string;
  statusLabel: string;
  summary: SettlementSummary;
  lines: ReportLine[];
};

export const SETTLEMENT_STATUS: Record<string, string> = { draft: 'Borrador', closed: 'Cerrada', paid: 'Pagada' };

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`))
    .replace('.', '');

export function periodLabel(s: Pick<SettlementRow, 'period_start' | 'period_end'>): string {
  return `${shortDate(s.period_start)} – ${shortDate(s.period_end)}`;
}

export async function loadSettlementReport(
  db: DbClient,
  business: { id: string; name: string; timezone: string; currency: string },
  settlementId: string,
): Promise<SettlementReport | null> {
  const settlement = await getSettlement(db, settlementId);
  if (!settlement || settlement.business_id !== business.id) return null;
  const entries = await listCommissionEntries(db, { businessId: business.id, settlementId });
  const lines: ReportLine[] = entries
    .map((e) => ({
      professionalId: e.professional_id,
      person: e.professional?.display_name ?? 'Profesional',
      date: localDate(e.occurred_at, business.timezone),
      time: localTime(e.occurred_at, business.timezone),
      service: e.kind === 'adjustment' ? 'Ajuste' : (e.booking_item?.service_name ?? 'Servicio'),
      customer: e.booking?.customer?.full_name ?? '',
      baseAmount: e.base_amount + e.addon_base_amount,
      share: e.share_bp ? formatPercent(e.share_bp) : '',
      rule: e.rule_kind === 'percent' ? formatPercent(e.rule_value ?? 0) : e.rule_kind === 'fixed' ? `${formatMoney(e.rule_value ?? 0, business.currency)} fijo` : '',
      amount: e.amount,
      kind: e.kind as 'service' | 'adjustment',
      note: e.note ?? '',
    }))
    .sort((a, b) => a.person.localeCompare(b.person, 'es') || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const summary = summarizeSettlement(
    lines.map((l) => ({ professionalId: l.professionalId, professionalName: l.person, kind: l.kind, amount: l.amount })),
  );
  return {
    businessName: business.name,
    currency: business.currency,
    settlement,
    periodLabel: periodLabel(settlement),
    statusLabel: SETTLEMENT_STATUS[settlement.status] ?? settlement.status,
    summary,
    lines,
  };
}

export function reportFileName(r: SettlementReport, ext: 'xlsx' | 'pdf'): string {
  return `liquidacion-${r.settlement.period_start}-al-${r.settlement.period_end}.${ext}`;
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------
export async function settlementXlsx(r: SettlementReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = r.businessName;
  // Las celdas llevan el monto en unidades de la moneda (no en su unidad mínima) para poder sumarlas en Excel.
  const { minorUnits } = currencyInfo(r.currency);
  const digits = minorUnits > 0 ? `.${'0'.repeat(minorUnits)}` : '';
  const money = `"$"#,##0${digits};-"$"#,##0${digits}`;
  const cell = (amount: number) => amount / 10 ** minorUnits;

  const resumen = wb.addWorksheet('Resumen');
  resumen.addRow([`Liquidación de comisiones · ${r.businessName}`]).font = { bold: true, size: 14 };
  resumen.addRow([`Período: ${r.periodLabel}`]);
  resumen.addRow([`Estado: ${r.statusLabel}`]);
  resumen.addRow([]);
  const head = resumen.addRow(['Persona', 'Servicios', 'Comisión servicios', 'Ajustes', 'Total a pagar']);
  head.font = { bold: true };
  for (const p of r.summary.people) resumen.addRow([p.name, p.count, cell(p.servicesTotal), cell(p.adjustmentsTotal), cell(p.total)]);
  const total = resumen.addRow(['Total', '', '', '', cell(r.summary.total)]);
  total.font = { bold: true };
  resumen.columns = [{ width: 28 }, { width: 11 }, { width: 20 }, { width: 14 }, { width: 16 }];
  for (const c of [3, 4, 5]) resumen.getColumn(c).numFmt = money;

  const detalle = wb.addWorksheet('Detalle');
  const h = detalle.addRow(['Persona', 'Fecha', 'Hora', 'Servicio', 'Cliente', 'Base', 'Parte', 'Regla', 'Comisión', 'Nota']);
  h.font = { bold: true };
  for (const l of r.lines) {
    detalle.addRow([l.person, l.date, l.time, l.service, l.customer, l.kind === 'service' ? cell(l.baseAmount) : null, l.share, l.rule, cell(l.amount), l.note]);
  }
  detalle.columns = [{ width: 22 }, { width: 12 }, { width: 7 }, { width: 24 }, { width: 22 }, { width: 12 }, { width: 8 }, { width: 14 }, { width: 12 }, { width: 36 }];
  for (const c of [6, 9]) detalle.getColumn(c).numFmt = money;
  detalle.views = [{ state: 'frozen', ySplit: 1 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// PDF para teléfono
// ---------------------------------------------------------------------------
const PAGE = { width: 360, height: 640, margin: 24 };
const INK = rgb(0.11, 0.11, 0.1);
const MUTED = rgb(0.45, 0.42, 0.4);
const LINE = rgb(0.86, 0.84, 0.81);

/** Las fuentes estándar del PDF solo tienen caracteres latinos (WinAnsi). */
const safe = (s: string) => s.normalize('NFC').replace(/[^\x20-\x7E\xA0-\xFF–—·…€]/g, '?');

export async function settlementPdf(r: SettlementReport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Liquidación ${r.periodLabel}`);
  pdf.setAuthor(safe(r.businessName));
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE.width - PAGE.margin * 2;

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const ensure = (h: number) => {
    if (y - h < PAGE.margin) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };
  const fit = (text: string, font: PDFFont, size: number, max: number) => {
    let t = safe(text);
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > max) t = `${t.slice(0, -2)}…`;
    return t;
  };
  const text = (t: string, opts: { size: number; font?: PDFFont; color?: typeof INK; x?: number; right?: boolean; max?: number }) => {
    const font = opts.font ?? regular;
    const s = fit(t, font, opts.size, opts.max ?? width);
    const x = opts.right ? PAGE.margin + width - font.widthOfTextAtSize(s, opts.size) : (opts.x ?? PAGE.margin);
    page.drawText(s, { x, y, size: opts.size, font, color: opts.color ?? INK });
  };
  const rule = () => {
    page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.margin + width, y }, thickness: 0.6, color: LINE });
  };

  // Encabezado
  text(r.businessName, { size: 13, font: bold, color: MUTED });
  y -= 24;
  text('Liquidación de comisiones', { size: 18, font: bold });
  y -= 20;
  text(`${r.periodLabel} · ${r.statusLabel}`, { size: 12, color: MUTED });
  y -= 30;
  text('Total a pagar', { size: 12, color: MUTED });
  y -= 26;
  text(formatMoney(r.summary.total, r.currency), { size: 26, font: bold });
  y -= 18;
  rule();
  y -= 22;

  for (const p of r.summary.people) {
    ensure(70);
    text(p.name, { size: 15, font: bold, max: width - 110 });
    text(formatMoney(p.total, r.currency), { size: 15, font: bold, right: true });
    y -= 17;
    const parts = [`${p.count} ${p.count === 1 ? 'servicio' : 'servicios'}: ${formatMoney(p.servicesTotal, r.currency)}`];
    if (p.adjustmentsTotal !== 0) parts.push(`ajustes: ${formatMoney(p.adjustmentsTotal, r.currency)}`);
    text(parts.join(' · '), { size: 11, color: MUTED });
    y -= 18;

    for (const l of r.lines.filter((x) => x.professionalId === p.professionalId)) {
      ensure(40);
      const day = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
        .format(new Date(`${l.date}T12:00:00Z`))
        .replace('.', '');
      text(l.kind === 'adjustment' ? `Ajuste · ${day}` : `${day} ${l.time} · ${l.service}`, { size: 12, max: width - 90 });
      text(formatMoney(l.amount, r.currency), { size: 12, font: bold, right: true });
      y -= 15;
      const detail =
        l.kind === 'adjustment' ? l.note : [l.customer, `base ${formatMoney(l.baseAmount, r.currency)}`, l.share !== '100%' ? l.share : '', l.rule].filter(Boolean).join(' · ');
      text(detail, { size: 10, color: MUTED });
      y -= 18;
    }
    rule();
    y -= 22;
  }

  if (r.summary.people.length === 0) {
    text('Sin movimientos en este período.', { size: 12, color: MUTED });
  }
  return pdf.save();
}
