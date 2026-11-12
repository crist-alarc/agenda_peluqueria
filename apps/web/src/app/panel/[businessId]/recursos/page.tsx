import { can, canManageBranch, checkLimit } from '@agenda/core';
import { countByBusiness, getEntitlements, listBranches, listMembers, listResources, type Member, type Resource } from '@agenda/db';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, EmptyState, Field, Input, PageHeader, Select } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { HoursEditor } from '@/components/hours-editor';
import { requireBusiness } from '@/lib/session';
import { t, weekdayName } from '@/lib/texts';
import { deleteResourceAction, linkProfessionalAction, saveResourceAction } from '../actions';

export const metadata = { title: 'Recursos' };

export default async function ResourcesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business, membership } = await requireBusiness(businessId);
  const canLink = can(membership, 'team.manage');
  const [resources, branches, entitlements, count, members] = await Promise.all([
    listResources(db, business.id),
    listBranches(db, business.id),
    getEntitlements(db, business.id),
    countByBusiness(db, 'resources', business.id),
    canLink ? listMembers(db, business.id) : Promise.resolve([] as Member[]),
  ]);
  const limit = checkLimit(entitlements, 'resources', count);
  const manageableBranches = branches.filter((b) => canManageBranch(membership, b.id));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <>
      <PageHeader
        title="Recursos"
        description="Lo que se reserva: personas (tu equipo), espacios (sillones, boxes, canchas) y equipos (juegos, camionetas)."
      />

      {manageableBranches.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Nuevo recurso</CardTitle>
            <CardDescription>
              {limit.allowed
                ? limit.remaining === null
                  ? 'Sin límite en tu plan.'
                  : `Puedes agregar ${limit.remaining + 1} más con tu plan.`
                : limit.reason === 'limit_reached'
                  ? t.errors.limitReached('recursos', limit.limit ?? 0)
                  : t.errors.notIncluded('recursos')}
            </CardDescription>
          </CardHeader>
          {limit.allowed && (
            <CardContent>
              <ActionForm action={saveResourceAction} className="grid gap-4 sm:grid-cols-2" resetOnSuccess>
                <input type="hidden" name="businessId" value={business.id} />
                <Field label="Tipo">
                  <Select name="type" defaultValue="person">
                    {(['person', 'space', 'equipment'] as const).map((type) => (
                      <option key={type} value={type}>
                        {t.resourceTypes[type]} — {t.resourceTypeHints[type]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Nombre">
                  <Input name="name" placeholder="Ej. Carla Rojas, Sillón 1, Castillo inflable" required />
                </Field>
                <Field label="Sucursal">
                  <Select name="branchId" defaultValue={manageableBranches[0]?.id}>
                    {manageableBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Habilidades" hint="Separadas por coma, ej. barberia, colorimetria">
                  <Input name="skills" />
                </Field>
                <Field label="Email (solo personas)" hint="Para vincularla cuando cree su cuenta">
                  <Input name="professionalEmail" type="email" />
                </Field>
                <Field label="Teléfono (solo personas)">
                  <Input name="professionalPhone" type="tel" />
                </Field>
                <div className="flex items-center gap-4 sm:col-span-2">
                  <Checkbox name="isLogistics" label="Es un recurso de logística (camioneta, equipo de montaje)" />
                </div>
                <Field label="Eventos por día (logística)" hint="Ej. 6 eventos en la ruta de un camión. Vacío = sin tope.">
                  <Input name="maxEventsPerDay" type="number" min={1} max={100} inputMode="numeric" />
                </Field>
                <input type="hidden" name="active" value="true" />
                <div className="sm:col-span-2">
                  <SubmitButton>Crear recurso</SubmitButton>
                </div>
              </ActionForm>
            </CardContent>
          )}
        </Card>
      )}

      {resources.length === 0 ? (
        <EmptyState>Aún no hay recursos. Empieza agregando a las personas de tu equipo.</EmptyState>
      ) : (
        <div className="space-y-3">
          {resources.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              businessId={business.id}
              branchName={branchName.get(r.branch_id) ?? ''}
              editable={canManageBranch(membership, r.branch_id)}
              branches={manageableBranches.map((b) => ({ id: b.id, name: b.name }))}
              members={canLink ? members : null}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ResourceCard({
  resource: r,
  businessId,
  branchName,
  editable,
  branches,
  members,
}: {
  resource: Resource;
  businessId: string;
  branchName: string;
  editable: boolean;
  branches: Array<{ id: string; name: string }>;
  members: Member[] | null;
}) {
  return (
    <Card>
      <details>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-4">
          <span className="font-medium">{r.name}</span>
          <Badge variant="secondary">{t.resourceTypes[r.type]}</Badge>
          {r.is_logistics && (
            <Badge variant="outline">
              Logística{r.max_events_per_day ? ` · ${r.max_events_per_day} eventos/día` : ''}
            </Badge>
          )}
          {!r.active && <Badge variant="muted">Inactivo</Badge>}
          {r.skills.map((s) => (
            <Badge key={s} variant="outline">
              {s}
            </Badge>
          ))}
          <span className="ml-auto text-sm text-muted-foreground">
            {branchName}
            {r.resource_hours.length > 0 ? ` · ${r.resource_hours.length} tramos de horario` : ' · sin horario propio'}
          </span>
        </summary>
        <div className="border-t p-4">
          {editable ? (
            <>
              <ActionForm action={saveResourceAction} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="resourceId" value={r.id} />
                <input type="hidden" name="type" value={r.type} />
                <Field label="Nombre">
                  <Input name="name" defaultValue={r.name} required />
                </Field>
                <Field label="Sucursal">
                  <Select name="branchId" defaultValue={r.branch_id}>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Habilidades" hint="Separadas por coma">
                  <Input name="skills" defaultValue={r.skills.join(', ')} />
                </Field>
                {r.type === 'person' && (
                  <>
                    <Field label="Email">
                      <Input name="professionalEmail" type="email" defaultValue={r.professional?.email ?? ''} />
                    </Field>
                    <Field label="Teléfono">
                      <Input name="professionalPhone" type="tel" defaultValue={r.professional?.phone ?? ''} />
                    </Field>
                  </>
                )}
                <div className="flex flex-wrap gap-4 sm:col-span-2">
                  <Checkbox name="active" label="Activo" defaultChecked={r.active} />
                  <Checkbox name="isLogistics" label="Recurso de logística" defaultChecked={r.is_logistics} />
                </div>
                <Field
                  label="Eventos por día (logística)"
                  hint="Ej. un camión que alcanza 6 eventos en su ruta. Al superarlo, la agenda avisa. Vacío = sin tope."
                >
                  <Input
                    name="maxEventsPerDay"
                    type="number"
                    min={1}
                    max={100}
                    inputMode="numeric"
                    defaultValue={r.max_events_per_day ?? ''}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <h3 className="mb-1 text-sm font-semibold">Horario de disponibilidad</h3>
                  <p className="mb-2 text-xs text-muted-foreground">Si lo dejas vacío, se usará el horario de la sucursal.</p>
                  <HoursEditor
                    emptyLabel="Horario de la sucursal"
                    name="hours"
                    initial={r.resource_hours.map((h) => ({ weekday: h.weekday, start: h.starts_at, end: h.ends_at }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <SubmitButton>Guardar recurso</SubmitButton>
                </div>
              </ActionForm>
              {r.type === 'person' && r.professional && members && (
                <ActionForm action={linkProfessionalAction} className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="professionalId" value={r.professional.id} />
                  <Field label="Cuenta del equipo" hint="Para que esta persona vea su propia agenda al ingresar">
                    <Select name="userId" defaultValue={r.professional.user_id ?? ''} className="w-64">
                      <option value="">Sin vincular</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.fullName ?? m.email} ({t.roles[m.role]})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton variant="outline" size="sm">
                    Vincular
                  </SubmitButton>
                </ActionForm>
              )}
              <ActionForm action={deleteResourceAction} confirm={`¿Eliminar ${r.name}?`} className="mt-4 border-t pt-4">
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="resourceId" value={r.id} />
                <Button variant="ghost" size="sm" className="text-destructive">
                  Eliminar recurso
                </Button>
              </ActionForm>
            </>
          ) : (
            <ul className="text-sm">
              {r.resource_hours.map((h) => (
                <li key={h.id}>
                  {weekdayName(h.weekday)}: {h.starts_at.slice(0, 5)}–{h.ends_at.slice(0, 5)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </Card>
  );
}
