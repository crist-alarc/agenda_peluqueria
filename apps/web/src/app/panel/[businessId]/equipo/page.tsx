import { can, canAssignRole, ROLES } from '@agenda/core';
import { listBranches, listMembers } from '@agenda/db';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Field, Input, PageHeader, Select } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requireBusiness } from '@/lib/session';
import { t } from '@/lib/texts';
import { addMemberAction, removeMemberAction } from '../actions';
import { setSupportApproverAction } from '../support-actions';

export const metadata = { title: 'Equipo' };

export default async function TeamPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { db, business, membership, user } = await requireBusiness(businessId);
  const [members, branches] = await Promise.all([listMembers(db, business.id), listBranches(db, business.id)]);
  const manage = can(membership, 'team.manage');
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const assignable = ROLES.filter((r) => canAssignRole(membership, r));

  return (
    <>
      <PageHeader title="Equipo" description="Personas con acceso a este negocio y su rol." />

      {manage && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Agregar persona</CardTitle>
            <CardDescription>
              La persona debe crear su cuenta primero (con el mismo email). Si ya está en el equipo, se actualiza su rol.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={addMemberAction} className="grid gap-4 sm:grid-cols-2" resetOnSuccess>
              <input type="hidden" name="businessId" value={business.id} />
              <Field label="Email">
                <Input name="email" type="email" required />
              </Field>
              <Field label="Rol">
                <Select name="role" defaultValue="staff">
                  {assignable.map((r) => (
                    <option key={r} value={r}>
                      {t.roles[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-sm font-medium">Sucursales (obligatorio para administrador de sucursal)</legend>
                <div className="flex flex-wrap gap-4">
                  {branches.map((b) => (
                    <Checkbox key={b.id} name="branchIds" value={b.id} label={b.name} />
                  ))}
                </div>
              </fieldset>
              <div className="sm:col-span-2">
                <SubmitButton>Agregar al equipo</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {m.fullName ?? m.email ?? 'Sin nombre'}
                  {m.userId === user.id && <span className="text-muted-foreground"> (tú)</span>}
                </p>
                <p className="text-sm text-muted-foreground">{m.email}</p>
              </div>
              <Badge variant="secondary">{t.roles[m.role]}</Badge>
              {m.branchIds.length > 0 && (
                <span className="text-sm text-muted-foreground">{m.branchIds.map((id) => branchName.get(id)).join(', ')}</span>
              )}
              {m.role === 'owner' ? (
                <Badge variant="outline">Aprueba soporte</Badge>
              ) : membership.role === 'owner' ? (
                <ActionForm action={setSupportApproverAction} aria-label={`Soporte: ${m.email}`}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="membershipId" value={m.membershipId} />
                  <input type="hidden" name="value" value={m.canApproveSupport ? 'false' : 'true'} />
                  <Button variant={m.canApproveSupport ? 'secondary' : 'ghost'} size="sm" aria-pressed={m.canApproveSupport}>
                    {m.canApproveSupport ? 'Aprueba soporte' : 'Permitir aprobar soporte'}
                  </Button>
                </ActionForm>
              ) : (
                m.canApproveSupport && <Badge variant="outline">Aprueba soporte</Badge>
              )}
              {manage && m.userId !== user.id && canAssignRole(membership, m.role) && (
                <ActionForm action={removeMemberAction} confirm={`¿Quitar a ${m.email} del equipo?`}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="membershipId" value={m.membershipId} />
                  <Button variant="ghost" size="sm" className="text-destructive">
                    Quitar
                  </Button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
