import { FEATURE_LABELS, formatMoney, formatRate, taxBreakdown, type Feature, type PlanFeatureSpec } from '@agenda/core';
import type { PublicPlans } from '@agenda/db';

/** Funciones que se muestran al comparar planes (las que más diferencian a un negocio pequeño). */
const HIGHLIGHT: Feature[] = ['branches', 'resources', 'commissions', 'whatsapp_messages'];

function featureText(f: PlanFeatureSpec | undefined, feature: Feature): string | null {
  if (!f?.enabled) return null;
  const name = FEATURE_LABELS[feature].toLowerCase();
  if (f.limit === null) return feature === 'branches' || feature === 'resources' ? `${FEATURE_LABELS[feature]} sin límite` : FEATURE_LABELS[feature];
  return `${f.limit} ${f.limit === 1 && feature === 'branches' ? 'sucursal' : name}`;
}

/**
 * Elección de plan al crear un negocio (ADR 0009): radios en columna, con precio neto y total
 * con impuesto, y solo las diferencias que importan. El primero viene marcado.
 */
export function PlanPicker({ offer, name = 'planCode' }: { offer: PublicPlans; name?: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Plan</legend>
      {offer.plans.map((p, i) => {
        const price = p.monthlyNet == null ? null : taxBreakdown(p.monthlyNet, offer.taxRateBp);
        const highlights = HIGHLIGHT.map((f) => featureText(p.features.find((x) => x.feature === f), f)).filter(Boolean);
        return (
          <label
            key={p.code}
            className="flex cursor-pointer gap-3 rounded-md border px-3 py-3 has-[:checked]:border-ring has-[:checked]:bg-accent/40"
          >
            <input type="radio" name={name} value={p.code} defaultChecked={i === 0} className="mt-1 accent-primary" />
            <span className="flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">{p.name}</span>
                {price ? (
                  <span className="text-sm tabular-nums">
                    {formatMoney(price.gross, offer.currency)} al mes
                    <span className="block text-right text-xs text-muted-foreground">
                      {formatMoney(price.net, offer.currency)} + {offer.taxRateBp > 0 ? `IVA ${formatRate(offer.taxRateBp)}` : 'sin impuesto'}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Precio por confirmar</span>
                )}
              </span>
              {p.description && <span className="block text-sm text-muted-foreground">{p.description}</span>}
              {highlights.length > 0 && <span className="mt-1 block text-xs text-muted-foreground">{highlights.join(', ')}</span>}
              {(p.trialDays ?? 0) > 0 && (
                <span className="mt-1 block text-xs font-medium text-success">Los primeros {p.trialDays} días no se cobran</span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
