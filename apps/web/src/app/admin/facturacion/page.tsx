import { BILLING_CURRENCY_CODES, DOCUMENT_TYPES, formatRate } from '@agenda/core';
import { getBillingSetup, getPaymentOptions, getPlatformSettings, type PaymentMethod, type PaymentTerm } from '@agenda/db';
import { Checkbox, Field, Input, PageHeader, Select } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePlatformAdmin } from '@/lib/session';
import { saveSettingsAction } from '../approval-actions';
import { savePaymentMethodAction, savePaymentTermAction } from '../charge-actions';
import { saveBillingEntityAction, saveTaxRuleAction } from '../plan-actions';

export const metadata = { title: 'Facturación' };

/**
 * Quién factura y con qué impuesto (ADR 0009). La regla se elige por el país del cliente;
 * "Resto del mundo" aplica a cualquier país sin regla propia.
 */
export default async function BillingSetupPage() {
  const { db, role } = await requirePlatformAdmin();
  const [setup, settings, payment] = await Promise.all([getBillingSetup(db), getPlatformSettings(db), getPaymentOptions(db)]);

  return (
    <>
      <PageHeader
        title="Facturación"
        description="La empresa que emite los documentos y el impuesto que se suma al precio neto de los planes, según el país del cliente."
      />
      <div className="max-w-4xl space-y-10">
        {setup.entities.map((e) => (
          <section key={e.id} aria-label={`Empresa ${e.name}`}>
            <ActionForm action={saveBillingEntityAction} className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
              <input type="hidden" name="id" value={e.id} />
              <Field label={`Empresa que factura (${e.country})`}>
                <Input name="name" defaultValue={e.name} required />
              </Field>
              <Field label="RUT">
                <Input name="taxId" defaultValue={e.taxId ?? ''} placeholder="76.123.456-7" />
              </Field>
              <div className="flex items-center gap-4 pb-2">
                <Checkbox name="active" label="Activa" defaultChecked={e.active} />
                <SubmitButton size="sm" variant="outline">
                  Guardar
                </SubmitButton>
              </div>
            </ActionForm>

            <h2 className="mt-6 mb-2 font-semibold">Reglas por país del cliente</h2>
            <ul className="divide-y border-y">
              {setup.rules
                .filter((r) => r.entityId === e.id)
                .map((r) => (
                  <li key={r.id} className="py-3">
                    <ActionForm
                      action={saveTaxRuleAction}
                      className="grid gap-3 sm:grid-cols-[9rem_7rem_1fr_7rem_auto] sm:items-end"
                      aria-label={`Regla ${r.clientCountry ?? 'resto del mundo'}`}
                    >
                      <input type="hidden" name="id" value={r.id} />
                      <p className="pb-2 text-sm font-medium">{r.clientCountry ? `Clientes de ${r.clientCountry}` : 'Resto del mundo'}</p>
                      <Field label="Moneda">
                        <Select name="currency" defaultValue={r.currency}>
                          {BILLING_CURRENCY_CODES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Documento">
                        <Select name="documentType" defaultValue={r.documentType}>
                          {Object.entries(DOCUMENT_TYPES).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Impuesto (%)">
                        <Input name="rate" inputMode="decimal" defaultValue={formatRate(r.taxRateBp).replace('%', '')} />
                      </Field>
                      <div className="flex items-center gap-3 pb-2">
                        <Checkbox name="active" label="Activa" defaultChecked={r.active} />
                        <SubmitButton size="sm" variant="outline">
                          Guardar
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <section aria-labelledby="plazos">
          <h2 id="plazos" className="mb-1 font-semibold">
            Plazos de pago
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            El vencimiento de cada cobro es la fecha de emisión más el plazo acordado con el negocio. El marcado por defecto aplica a quien no
            tiene uno acordado.
          </p>
          <ul className="space-y-2">
            {payment.terms.map((t) => (
              <li key={t.id}>
                <TermForm term={t} />
              </li>
            ))}
            <li>
              <TermForm term={null} />
            </li>
          </ul>
        </section>
        <section aria-labelledby="formas">
          <h2 id="formas" className="mb-1 font-semibold">
            Formas de pago
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">La acordada con cada negocio, y entre las que eliges al registrar un pago.</p>
          <ul className="space-y-2">
            {payment.methods.map((m) => (
              <li key={m.id}>
                <MethodForm method={m} />
              </li>
            ))}
            <li>
              <MethodForm method={null} />
            </li>
          </ul>
        </section>
        <section aria-labelledby="gracia">
          <h2 id="gracia" className="mb-1 font-semibold">
            Plazo para los datos de facturación
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Un negocio nuevo funciona sin datos de facturación hasta el último día hábil de su mes de alta. Si le quedan menos días que este
            mínimo, el plazo pasa al último día hábil del mes siguiente.
          </p>
          {role === 'owner' ? (
            <ActionForm action={saveSettingsAction} className="flex flex-wrap items-end gap-3" aria-label="Plazo de facturación">
              <Field label="Mínimo de días corridos">
                <Input name="billingGraceMinDays" type="number" min={0} max={90} defaultValue={settings.billingGraceMinDays} className="w-28" />
              </Field>
              <SubmitButton size="sm" variant="outline">
                Guardar
              </SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm">Mínimo: {settings.billingGraceMinDays} días corridos.</p>
          )}
        </section>
        <p className="text-sm text-muted-foreground">
          La exención de IVA para clientes de otros países (exportación de servicios) tiene requisitos ante el SII. Confírmalo con tu contador
          antes de facturar fuera de Chile.
        </p>
      </div>
    </>
  );
}

function TermForm({ term }: { term: PaymentTerm | null }) {
  return (
    <ActionForm action={savePaymentTermAction} className="flex flex-wrap items-end gap-3" resetOnSuccess={!term} aria-label={term ? `Plazo ${term.name}` : 'Nuevo plazo'}>
      {term && <input type="hidden" name="id" value={term.id} />}
      <Field label={term ? 'Nombre' : 'Nuevo plazo'}>
        <Input name="name" defaultValue={term?.name ?? ''} required placeholder="Ej. 15 días" className="w-40" />
      </Field>
      <Field label="Días">
        <Input name="days" type="number" min={0} max={365} defaultValue={term?.days ?? ''} required className="w-20" />
      </Field>
      <div className="flex items-center gap-4 pb-2">
        <Checkbox name="isDefault" label="Por defecto" defaultChecked={term?.isDefault ?? false} />
        <Checkbox name="active" label="Activo" defaultChecked={term?.active ?? true} />
        <SubmitButton size="sm" variant="outline">
          {term ? 'Guardar' : 'Agregar'}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

function MethodForm({ method }: { method: PaymentMethod | null }) {
  return (
    <ActionForm action={savePaymentMethodAction} className="flex flex-wrap items-end gap-3" resetOnSuccess={!method} aria-label={method ? `Forma ${method.name}` : 'Nueva forma de pago'}>
      {method && <input type="hidden" name="id" value={method.id} />}
      <Field label={method ? 'Nombre' : 'Nueva forma de pago'}>
        <Input name="name" defaultValue={method?.name ?? ''} required placeholder="Ej. Mercado Pago" className="w-56" />
      </Field>
      <div className="flex items-center gap-4 pb-2">
        <Checkbox name="isDefault" label="Por defecto" defaultChecked={method?.isDefault ?? false} />
        <Checkbox name="active" label="Activa" defaultChecked={method?.active ?? true} />
        <SubmitButton size="sm" variant="outline">
          {method ? 'Guardar' : 'Agregar'}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
