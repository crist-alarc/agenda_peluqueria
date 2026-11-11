import { can, canManageBranch, formatMoney, moneyInputHint, moneyInputValue } from '@agenda/core';
import { listAddons, listBranches, type Addon } from '@agenda/db';
import { Badge, Button, Card, CardContent, CardTitle, Checkbox, EmptyState, Field, Input, PageHeader, Textarea } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requireBusiness } from '@/lib/session';
import { deleteAddonAction, saveAddonAction, setStockAction } from '../actions';

export const metadata = { title: 'Adicionales' };

export default async function AddonsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business, membership } = await requireBusiness(businessId);
  const [addons, branches] = await Promise.all([listAddons(db, business.id), listBranches(db, business.id)]);
  const editable = can(membership, 'catalog.manage');

  return (
    <>
      <PageHeader
        title="Adicionales"
        description="Extras con precio y stock limitado por sucursal: balones, secadores, máquinas de humo…"
      />

      {editable && (
        <Card className="mb-6">
          <details>
            <summary className="cursor-pointer list-none p-5">
              <CardTitle>Nuevo adicional</CardTitle>
            </summary>
            <CardContent>
              <AddonForm businessId={business.id} currency={business.currency} />
            </CardContent>
          </details>
        </Card>
      )}

      {addons.length === 0 ? (
        <EmptyState>Aún no hay adicionales.</EmptyState>
      ) : (
        <div className="space-y-3">
          {addons.map((a) => (
            <Card key={a.id}>
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-4">
                  <span className="font-medium">{a.name}</span>
                  {!a.active && <Badge variant="muted">Inactivo</Badge>}
                  <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                    {formatMoney(a.price, business.currency)} · stock total {a.addon_stock.reduce((sum, s) => sum + s.quantity, 0)}
                  </span>
                </summary>
                <div className="space-y-5 border-t p-4">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Stock por sucursal</h3>
                    <div className="space-y-2">
                      {branches.map((b) => {
                        const current = a.addon_stock.find((s) => s.branch_id === b.id)?.quantity ?? 0;
                        return canManageBranch(membership, b.id) ? (
                          <ActionForm key={b.id} action={setStockAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="businessId" value={business.id} />
                            <input type="hidden" name="addonId" value={a.id} />
                            <input type="hidden" name="branchId" value={b.id} />
                            <span className="w-40 text-sm">{b.name}</span>
                            <Input
                              name="quantity"
                              type="number"
                              min={0}
                              defaultValue={current}
                              aria-label={`Stock en ${b.name}`}
                              className="h-9 w-24"
                            />
                            <SubmitButton size="sm" variant="outline">
                              Guardar
                            </SubmitButton>
                          </ActionForm>
                        ) : (
                          <p key={b.id} className="text-sm">
                            {b.name}: {current}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                  {editable && (
                    <>
                      <AddonForm businessId={business.id} currency={business.currency} addon={a} />
                      <ActionForm action={deleteAddonAction} confirm={`¿Eliminar ${a.name}?`} className="border-t pt-4">
                        <input type="hidden" name="businessId" value={business.id} />
                        <input type="hidden" name="addonId" value={a.id} />
                        <Button variant="ghost" size="sm" className="text-destructive">
                          Eliminar adicional
                        </Button>
                      </ActionForm>
                    </>
                  )}
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function AddonForm({ businessId, currency, addon }: { businessId: string; currency: string; addon?: Addon }) {
  return (
    <ActionForm action={saveAddonAction} className="grid gap-4 sm:grid-cols-2" resetOnSuccess={!addon}>
      <input type="hidden" name="businessId" value={businessId} />
      {addon && <input type="hidden" name="addonId" value={addon.id} />}
      <Field label="Nombre">
        <Input name="name" defaultValue={addon?.name} required />
      </Field>
      <Field label={`Precio (${currency})`} hint={moneyInputHint(currency)}>
        <Input name="price" inputMode="numeric" defaultValue={addon ? moneyInputValue(addon.price, currency) : ''} required />
      </Field>
      <Field label="Descripción" className="sm:col-span-2">
        <Textarea name="description" defaultValue={addon?.description ?? ''} rows={2} />
      </Field>
      <Checkbox name="active" label="Activo" defaultChecked={addon?.active ?? true} />
      <div className="sm:col-span-2">
        <SubmitButton>{addon ? 'Guardar adicional' : 'Crear adicional'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
