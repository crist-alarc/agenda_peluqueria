import { PLATFORM_ROLES, type PlatformRole } from '@agenda/core';
import { listPlatformTeam } from '@agenda/db';
import { Button, Field, Input, PageHeader, Select } from '@agenda/ui';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { requirePlatformAdmin } from '@/lib/session';
import { removeTeamMemberAction, setTeamMemberAction } from '../approval-actions';

export const metadata = { title: 'Equipo' };

const ROLES = Object.keys(PLATFORM_ROLES) as PlatformRole[];

/** Quiénes trabajan en la consola y qué pueden hacer (ADR 0010). Solo el dueño lo cambia. */
export default async function TeamPage() {
  const { db, role } = await requirePlatformAdmin();
  const team = await listPlatformTeam(db);
  const isOwner = role === 'owner';

  return (
    <>
      <PageHeader title="Equipo de la plataforma" description="Las personas que entran a esta consola. No tienen relación con los equipos de cada negocio." />

      <dl className="mb-8 grid max-w-3xl gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
        {ROLES.map((r) => (
          <div key={r} className="contents">
            <dt className="font-medium">{PLATFORM_ROLES[r].label}</dt>
            <dd className="text-muted-foreground">{PLATFORM_ROLES[r].description}</dd>
          </div>
        ))}
      </dl>

      <div className="max-w-3xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="[&_th]:border-b [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
              <th>Persona</th>
              <th>Rol</th>
              {isOwner && <th className="sr-only">Acciones</th>}
            </tr>
          </thead>
          <tbody className="[&_td]:border-b [&_td]:py-2.5 [&_td]:pr-4">
            {team.map((m) => (
              <tr key={m.userId}>
                <td>
                  <span className="block font-medium">{m.name || m.email}</span>
                  {m.name && <span className="text-muted-foreground">{m.email}</span>}
                </td>
                <td>
                  {isOwner && !m.isMe ? (
                    <ActionForm action={setTeamMemberAction} className="flex items-center gap-2" aria-label={`Rol de ${m.email}`}>
                      <input type="hidden" name="email" value={m.email ?? ''} />
                      <Select name="role" defaultValue={m.role} aria-label="Rol" className="w-52">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {PLATFORM_ROLES[r].label}
                          </option>
                        ))}
                      </Select>
                      <SubmitButton size="sm" variant="outline">
                        Cambiar
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    <>
                      {PLATFORM_ROLES[m.role].label}
                      {m.isMe && <span className="text-muted-foreground"> (tú)</span>}
                    </>
                  )}
                </td>
                {isOwner && (
                  <td className="text-right">
                    {!m.isMe && (
                      <ActionForm action={removeTeamMemberAction} confirm={`¿Quitarle el acceso a la consola a ${m.email}?`}>
                        <input type="hidden" name="userId" value={m.userId} />
                        <Button variant="ghost" size="xs">
                          Quitar acceso
                        </Button>
                      </ActionForm>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isOwner && (
        <section aria-labelledby="sumar" className="mt-10 max-w-3xl">
          <h2 id="sumar" className="mb-1 font-semibold">
            Sumar a alguien
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">La persona debe tener una cuenta en la app (con el mismo email).</p>
          <ActionForm action={setTeamMemberAction} className="flex flex-wrap items-end gap-3" resetOnSuccess aria-label="Sumar al equipo">
            <Field label="Email" className="min-w-64 flex-1">
              <Input name="email" type="email" required />
            </Field>
            <Field label="Rol">
              <Select name="role" defaultValue="agent">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {PLATFORM_ROLES[r].label}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton>Sumar al equipo</SubmitButton>
          </ActionForm>
        </section>
      )}
    </>
  );
}
