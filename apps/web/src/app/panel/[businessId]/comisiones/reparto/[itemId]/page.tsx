import { formatMoney, formatPercent, localDate, localTime } from '@agenda/core';
import { getBookingItemForShares, listBusinessProfessionals, listCommissionEntries, listItemShares } from '@agenda/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, PageHeader, Select } from '@agenda/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePermission } from '@/lib/session';
import { saveSharesAction } from '../../actions';

export const metadata = { title: 'Repartir comisión' };

/**
 * Reparto manual de un servicio entre profesionales (por % o por minutos).
 * Sirve cuando dos personas hacen un servicio, o cuando una tuvo que irse y
 * otra terminó el trabajo. Siempre suma 100%.
 */
export default async function SharesPage({ params }: { params: Promise<{ businessId: string; itemId: string }> }) {
  const { businessId, itemId } = await params;
  const { db, business } = await requirePermission(businessId, 'commissions.manage');
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) notFound();
  const item = await getBookingItemForShares(db, itemId);
  if (!item || item.business_id !== business.id) notFound();
  const [people, manual, pending] = await Promise.all([
    listBusinessProfessionals(db, business.id),
    listItemShares(db, itemId),
    listCommissionEntries(db, { businessId: business.id, settlementId: null }),
  ]);
  const current = pending.filter((e) => e.booking_item_id === itemId);
  const usesMinutes = manual.length > 0 && manual.every((s) => s.minutes);
  const valueFor = (professionalId: string) => {
    const m = manual.find((s) => s.professional_id === professionalId);
    if (m) return usesMinutes ? String(m.minutes) : String(m.share_bp / 100).replace('.', ',');
    if (manual.length === 0) {
      const e = current.find((x) => x.professional_id === professionalId);
      if (e?.share_bp) return String(e.share_bp / 100).replace('.', ',');
    }
    return '';
  };

  return (
    <>
      <PageHeader
        title="Repartir comisión"
        description={`${item.service_name} · ${localDate(item.starts_at, business.timezone)} ${localTime(item.starts_at, business.timezone)} · ${formatMoney(item.price, business.currency)}`}
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>¿Quién hizo este servicio?</CardTitle>
          <CardDescription>
            Indica el porcentaje de cada persona (debe sumar 100%) o los minutos que trabajó cada una y la app calcula el
            porcentaje. Deja en blanco a quien no participó.
            {current.length > 0 &&
              ` Hoy: ${current.map((e) => `${e.professional?.display_name} ${formatPercent(e.share_bp ?? 10000)} = ${formatMoney(e.amount, business.currency)}`).join(' · ')}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionForm action={saveSharesAction} className="grid gap-3">
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="bookingItemId" value={item.id} />
            <Field label="Repartir por">
              <Select name="mode" defaultValue={usesMinutes ? 'minutes' : 'percent'}>
                <option value="percent">Porcentaje (%)</option>
                <option value="minutes">Minutos trabajados</option>
              </Select>
            </Field>
            {people.map((p) => (
              <Field key={p.id} label={p.name}>
                <Input name={`pro_${p.id}`} inputMode="decimal" defaultValue={valueFor(p.id)} />
              </Field>
            ))}
            <SubmitButton>Guardar reparto</SubmitButton>
          </ActionForm>
          {manual.length > 0 && (
            <ActionForm action={saveSharesAction} className="border-t pt-3">
              <input type="hidden" name="businessId" value={business.id} />
              <input type="hidden" name="bookingItemId" value={item.id} />
              <input type="hidden" name="reset" value="1" />
              <SubmitButton variant="ghost">Volver al reparto automático</SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>
      <p className="mt-6 text-sm">
        <Link href={`/panel/${business.id}/comisiones`} className="underline">
          Volver a comisiones
        </Link>
      </p>
    </>
  );
}
