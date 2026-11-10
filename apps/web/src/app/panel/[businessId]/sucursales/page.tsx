import { can, canManageBranch, checkLimit, utcToZonedLocal } from '@agenda/core';
import { countByBusiness, getEntitlements, listBlocks, listBranches, listHolidays } from '@agenda/db';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, PageHeader } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { HoursEditor } from '@/components/hours-editor';
import { requireBusiness } from '@/lib/session';
import { t, weekdayName } from '@/lib/texts';
import { createBlockAction, deleteBlockAction, deleteBranchAction, saveBranchAction } from '../actions';

export const metadata = { title: 'Sucursales' };

export default async function BranchesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business, membership } = await requireBusiness(businessId);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const nextYear = new Date(now.getTime() + 365 * 86_400_000).toISOString().slice(0, 10);

  const [branches, blocks, holidays, entitlements, count] = await Promise.all([
    listBranches(db, business.id),
    listBlocks(db, business.id, now.toISOString()),
    listHolidays(db, today, nextYear),
    getEntitlements(db, business.id),
    countByBusiness(db, 'branches', business.id),
  ]);
  const limit = checkLimit(entitlements, 'branches', count);
  const canCreate = can(membership, 'branches.create');
  const localNow = utcToZonedLocal(now.toISOString(), business.timezone);

  return (
    <>
      <PageHeader title="Sucursales" description="Cada sucursal tiene su dirección, horario y bloqueos." />

      <div className="space-y-6">
        {branches.map((branch) => {
          const editable = canManageBranch(membership, branch.id);
          const branchBlocks = blocks.filter((b) => b.branch_id === branch.id);
          return (
            <Card key={branch.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {branch.name}
                  {!branch.active && <Badge variant="muted">Inactiva</Badge>}
                </CardTitle>
                <CardDescription>{[branch.address, branch.commune].filter(Boolean).join(', ') || 'Sin dirección'}</CardDescription>
              </CardHeader>
              <CardContent>
                {editable ? (
                  <ActionForm action={saveBranchAction} className="space-y-5">
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="branchId" value={branch.id} />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Nombre">
                        <Input name="name" defaultValue={branch.name} required />
                      </Field>
                      <Field label="Dirección">
                        <Input name="address" defaultValue={branch.address ?? ''} />
                      </Field>
                      <Field label="Comuna">
                        <Input name="commune" defaultValue={branch.commune ?? ''} />
                      </Field>
                    </div>
                    <Checkbox name="active" label="Sucursal activa" defaultChecked={branch.active} />
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Horario de atención</h3>
                      <HoursEditor
                        name="hours"
                        initial={branch.branch_hours.map((h) => ({ weekday: h.weekday, start: h.opens_at, end: h.closes_at }))}
                      />
                    </div>
                    <SubmitButton>Guardar sucursal</SubmitButton>
                  </ActionForm>
                ) : (
                  <ul className="text-sm">
                    {branch.branch_hours.map((h) => (
                      <li key={h.id}>
                        {weekdayName(h.weekday)}: {h.opens_at.slice(0, 5)}–{h.closes_at.slice(0, 5)}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-6 border-t pt-4">
                  <h3 className="mb-2 text-sm font-semibold">Bloqueos (cierres, vacaciones)</h3>
                  {branchBlocks.length === 0 && <p className="text-sm text-muted-foreground">Sin bloqueos próximos.</p>}
                  <ul className="space-y-1 text-sm">
                    {branchBlocks.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums">
                          {utcToZonedLocal(b.starts_at, business.timezone).replace('T', ' ')} →{' '}
                          {utcToZonedLocal(b.ends_at, business.timezone).replace('T', ' ')}
                        </span>
                        {b.reason && <span className="text-muted-foreground">· {b.reason}</span>}
                        {editable && (
                          <ActionForm action={deleteBlockAction} confirm="¿Quitar este bloqueo?">
                            <input type="hidden" name="businessId" value={business.id} />
                            <input type="hidden" name="blockId" value={b.id} />
                            <Button variant="ghost" size="xs">
                              Quitar
                            </Button>
                          </ActionForm>
                        )}
                      </li>
                    ))}
                  </ul>
                  {editable && (
                    <ActionForm action={createBlockAction} className="mt-3 flex flex-wrap items-end gap-2" resetOnSuccess>
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="branchId" value={branch.id} />
                      <Field label="Desde">
                        <Input type="datetime-local" name="startsAt" defaultValue={localNow} required />
                      </Field>
                      <Field label="Hasta">
                        <Input type="datetime-local" name="endsAt" required />
                      </Field>
                      <Field label="Motivo" className="min-w-40 flex-1">
                        <Input name="reason" placeholder="Ej. Vacaciones" />
                      </Field>
                      <SubmitButton variant="outline">Agregar bloqueo</SubmitButton>
                    </ActionForm>
                  )}
                </div>

                {canCreate && branches.length > 1 && (
                  <ActionForm
                    action={deleteBranchAction}
                    confirm={`¿Eliminar la sucursal ${branch.name}? Se borrarán su horario y bloqueos.`}
                    className="mt-6 border-t pt-4"
                  >
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="branchId" value={branch.id} />
                    <Button variant="ghost" size="sm" className="text-destructive">
                      Eliminar sucursal
                    </Button>
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          );
        })}

        {canCreate && (
          <Card>
            <CardHeader>
              <CardTitle>Nueva sucursal</CardTitle>
              {!limit.allowed && (
                <CardDescription>
                  {limit.reason === 'limit_reached'
                    ? t.errors.limitReached('sucursales', limit.limit ?? 0)
                    : t.errors.notIncluded('sucursales')}
                </CardDescription>
              )}
            </CardHeader>
            {limit.allowed && (
              <CardContent>
                <ActionForm action={saveBranchAction} className="grid gap-4 sm:grid-cols-4 sm:items-end" resetOnSuccess>
                  <input type="hidden" name="businessId" value={business.id} />
                  <Field label="Nombre">
                    <Input name="name" required />
                  </Field>
                  <Field label="Dirección">
                    <Input name="address" />
                  </Field>
                  <Field label="Comuna">
                    <Input name="commune" />
                  </Field>
                  <SubmitButton>Crear sucursal</SubmitButton>
                </ActionForm>
              </CardContent>
            )}
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Feriados nacionales</CardTitle>
            <CardDescription>Precargados para Chile. En la fase de reservas se consideran como días cerrados.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {holidays.map((h) => (
                <li key={h.date}>
                  <span className="tabular-nums text-muted-foreground">{h.date}</span> · {h.name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
