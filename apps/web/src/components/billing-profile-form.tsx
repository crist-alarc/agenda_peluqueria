'use client';

import type { BillingProfile } from '@agenda/core';
import { Field, Input } from '@agenda/ui';
import { useState } from 'react';
import { ActionForm, SubmitButton, type ActionState } from './action-form';

type Kind = 'boleta' | 'factura' | 'exterior';

const KINDS: Array<{ value: Kind; label: string; hint: string }> = [
  { value: 'boleta', label: 'Boleta', hint: 'A nombre de una persona' },
  { value: 'factura', label: 'Factura', hint: 'Para una empresa con RUT' },
  { value: 'exterior', label: 'Fuera de Chile', hint: 'Factura de exportación' },
];

const kindOf = (p: Partial<BillingProfile> | null | undefined): Kind =>
  !p ? 'factura' : p.country && p.country !== 'CL' ? 'exterior' : p.documentType === 'boleta' ? 'boleta' : 'factura';

/**
 * Datos de facturación (ADR 0010). Cada documento pide solo lo suyo: la boleta, nombre y email;
 * la factura, además RUT, giro, dirección y comuna; fuera de Chile, identificación y dirección.
 */
export function BillingProfileForm({
  action,
  businessId,
  initial,
  submitLabel = 'Guardar datos de facturación',
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  businessId: string;
  initial?: Partial<BillingProfile> | null;
  submitLabel?: string;
}) {
  const [kind, setKind] = useState<Kind>(kindOf(initial));
  const foreign = kind === 'exterior';
  const factura = kind === 'factura';
  return (
    <ActionForm action={action} className="space-y-5" aria-label="Datos de facturación">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="documentType" value={foreign ? 'exportacion' : kind} />
      {!foreign && <input type="hidden" name="country" value="CL" />}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">¿Qué documento necesitas?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className="flex cursor-pointer flex-col rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="accent-primary" />
                {k.label}
              </span>
              <span className="pl-6 text-xs text-muted-foreground">{k.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={kind === 'boleta' ? 'Nombre completo' : 'Razón social'}>
          <Input name="legalName" required minLength={2} defaultValue={initial?.legalName ?? ''} autoComplete="organization" />
        </Field>
        <Field
          label={foreign ? 'Identificación tributaria' : 'RUT'}
          hint={kind === 'boleta' ? 'Opcional en boleta' : foreign ? 'El número fiscal de tu país' : 'Con dígito verificador, ej. 76.086.428-5'}
        >
          <Input name="taxId" required={factura || foreign} defaultValue={initial?.taxId ?? ''} />
        </Field>
        {foreign && (
          <Field label="País" hint="Código de 2 letras, ej. PE, AR, US">
            <Input name="country" required pattern="[A-Za-z]{2}" maxLength={2} defaultValue={initial?.country && initial.country !== 'CL' ? initial.country : ''} />
          </Field>
        )}
        {factura && (
          <Field label="Giro">
            <Input name="activity" required defaultValue={initial?.activity ?? ''} placeholder="Ej. Peluquería y estética" />
          </Field>
        )}
        {kind !== 'boleta' && (
          <Field label="Dirección" className={factura ? '' : 'sm:col-span-2'}>
            <Input name="address" required defaultValue={initial?.address ?? ''} autoComplete="street-address" />
          </Field>
        )}
        {factura && (
          <Field label="Comuna">
            <Input name="commune" required defaultValue={initial?.commune ?? ''} />
          </Field>
        )}
        {kind !== 'boleta' && (
          <Field label="Ciudad" hint="Opcional">
            <Input name="city" defaultValue={initial?.city ?? ''} />
          </Field>
        )}
        <Field label="Email para recibir los documentos" className="sm:col-span-2">
          <Input name="email" type="email" required defaultValue={initial?.email ?? ''} autoComplete="email" />
        </Field>
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
