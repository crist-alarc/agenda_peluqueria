import { formatMoney, moneyInputHint, moneyInputValue, type DeliveryMode } from '@agenda/core';
import type { Branch } from '@agenda/db';
import { Badge, Button, Checkbox, Field, Input, Select } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { deleteDeliveryZoneAction, saveDeliveryZoneAction, saveDeliverySettingsAction } from '../rental-actions';

const MODES: Record<DeliveryMode, string> = {
  included: 'Incluido en el precio',
  fixed: 'Monto fijo',
  by_zone: 'Según la zona',
};

/**
 * Despacho y zonas de cobertura de una sucursal (modo arriendo, fase 3A).
 * Las zonas son nombres libres: el negocio decide qué cubre (no se amarran a las comunas).
 */
export function DeliverySection({
  businessId,
  branch,
  currency,
  editable,
}: {
  businessId: string;
  branch: Branch;
  currency: string;
  editable: boolean;
}) {
  const mode = branch.delivery_mode as DeliveryMode;
  return (
    <div className="mt-6 border-t pt-4">
      <h3 className="text-sm font-semibold">Despacho y zonas de cobertura</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Si agregas zonas, el cliente debe elegir una y solo se atienden esas. Sin zonas, se acepta cualquier dirección.
      </p>

      {editable ? (
        <ActionForm action={saveDeliverySettingsAction} className="flex flex-wrap items-end gap-2" aria-label={`Despacho de ${branch.name}`}>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="branchId" value={branch.id} />
          <Field label="Cobro del despacho">
            <Select name="deliveryMode" defaultValue={mode} className="w-52">
              {Object.entries(MODES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Monto fijo (${currency})`} hint="Solo si el cobro es un monto fijo">
            <Input
              name="deliveryFee"
              inputMode="numeric"
              defaultValue={moneyInputValue(branch.delivery_fee, currency)}
              className="w-36"
            />
          </Field>
          <SubmitButton variant="outline">Guardar despacho</SubmitButton>
        </ActionForm>
      ) : (
        <p className="text-sm">
          {MODES[mode]}
          {mode === 'fixed' && `: ${formatMoney(branch.delivery_fee, currency)}`}
        </p>
      )}

      <ul className="mt-4 space-y-2" aria-label={`Zonas de ${branch.name}`}>
        {branch.delivery_zones.length === 0 && <li className="text-sm text-muted-foreground">Sin zonas: se atiende cualquier dirección.</li>}
        {branch.delivery_zones.map((z) =>
          editable ? (
            <li key={z.id} className="flex flex-wrap items-end gap-2">
              <ActionForm action={saveDeliveryZoneAction} className="flex flex-wrap items-end gap-2" aria-label={`Zona ${z.name}`}>
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="branchId" value={branch.id} />
                <input type="hidden" name="zoneId" value={z.id} />
                <Field label="Zona">
                  <Input name="name" defaultValue={z.name} required className="w-48" />
                </Field>
                {mode === 'by_zone' && (
                  <Field label={`Costo (${currency})`}>
                    <Input name="fee" inputMode="numeric" defaultValue={moneyInputValue(z.fee, currency)} className="w-32" />
                  </Field>
                )}
                {mode !== 'by_zone' && <input type="hidden" name="fee" value={moneyInputValue(z.fee, currency)} />}
                <Checkbox name="active" label="Activa" defaultChecked={z.active} />
                <SubmitButton variant="outline" size="sm">
                  Guardar
                </SubmitButton>
              </ActionForm>
              <ActionForm action={deleteDeliveryZoneAction} confirm={`¿Eliminar la zona ${z.name}?`}>
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="zoneId" value={z.id} />
                <Button variant="ghost" size="sm" className="text-destructive">
                  Eliminar
                </Button>
              </ActionForm>
            </li>
          ) : (
            <li key={z.id} className="flex items-center gap-2 text-sm">
              {z.name}
              {mode === 'by_zone' && <span className="text-muted-foreground">· {formatMoney(z.fee, currency)}</span>}
              {!z.active && <Badge variant="muted">Inactiva</Badge>}
            </li>
          ),
        )}
      </ul>

      {editable && (
        <ActionForm action={saveDeliveryZoneAction} className="mt-3 flex flex-wrap items-end gap-2" resetOnSuccess aria-label={`Nueva zona de ${branch.name}`}>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="branchId" value={branch.id} />
          <Field label="Nueva zona" hint="Ej. Padre Hurtado, Peñaflor, Talagante">
            <Input name="name" required className="w-48" />
          </Field>
          {mode === 'by_zone' && (
            <Field label={`Costo (${currency})`} hint={moneyInputHint(currency)}>
              <Input name="fee" inputMode="numeric" defaultValue="0" className="w-32" />
            </Field>
          )}
          <SubmitButton variant="outline">Agregar zona</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
