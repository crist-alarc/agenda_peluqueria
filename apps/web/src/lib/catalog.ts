import 'server-only';
import { describeServiceDetails, formatMoney, parseServiceFields, type DeliveryMode } from '@agenda/core';
import { catalogPhotoUrl, type PublicBusiness } from '@agenda/db';
import type { WizardService } from '@/components/booking-wizard';

/**
 * Catálogo del link público (fase 3A): arma lo que muestra la pantalla a partir
 * de los datos públicos del negocio. Si el negocio oculta los precios, la base
 * ya los entrega como null y aquí no se muestran.
 */
type PublicService = PublicBusiness['services'][number];

export const isRental = (b: Pick<PublicBusiness, 'bookingMode'>) => b.bookingMode === 'rental';

export function priceLabel(amount: number | null, currency: string): string | null {
  return amount == null ? null : formatMoney(amount, currency);
}

export function durationLabel(b: PublicBusiness, s: PublicService): string {
  if (isRental(b) && s.fullDay) return 'Día completo';
  const h = s.durationMinutes / 60;
  return s.durationMinutes >= 120 && Number.isInteger(h) ? `${h} horas` : `${s.durationMinutes} min`;
}

export function serviceDetails(b: PublicBusiness, s: PublicService) {
  return describeServiceDetails(parseServiceFields(b.serviceFields), s.details);
}

export function wizardServices(b: PublicBusiness): WizardService[] {
  return b.services.map((s) => ({
    id: s.id,
    name: s.name,
    durationMinutes: s.durationMinutes,
    needsPerson: s.needsPerson,
    priceLabel: priceLabel(s.price, b.currency),
    durationLabel: durationLabel(b, s),
    photoUrl: s.photos[0] ? catalogPhotoUrl(s.photos[0]) : null,
    summary: serviceDetails(b, s)
      .slice(0, 2)
      .map((d) => `${d.label}: ${d.value}`)
      .join(' · ') || undefined,
    detailsHref: s.photos.length > 0 || Object.keys(s.details ?? {}).length > 0 || s.description ? `/r/${b.slug}/s/${s.id}` : undefined,
  }));
}

const DELIVERY: Record<DeliveryMode, string> = { included: 'Despacho incluido', fixed: 'Despacho', by_zone: 'Despacho según zona' };

/** Texto de cobertura y despacho de una sucursal, ej. "Despacho según zona: Padre Hurtado ($0), Peñaflor ($5.000)". */
export function deliveryText(b: PublicBusiness, branch: PublicBusiness['branches'][number]): string | null {
  const fee = (amount: number | null) => priceLabel(amount, b.currency);
  const zones = branch.zones.map((z) => (branch.deliveryMode === 'by_zone' && fee(z.fee) ? `${z.name} (${fee(z.fee)})` : z.name));
  const head =
    branch.deliveryMode === 'fixed' && fee(branch.deliveryFee) ? `${DELIVERY.fixed}: ${fee(branch.deliveryFee)}` : DELIVERY[branch.deliveryMode];
  if (zones.length === 0) return branch.deliveryMode === 'included' ? null : head;
  return `${head}. Zonas que atendemos: ${zones.join(', ')}.`;
}
