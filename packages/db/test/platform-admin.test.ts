/**
 * Consola de la plataforma · A1 (ADR 0008): solo los administradores de la plataforma
 * usan las funciones app_admin_*, y la configuración de un negocio solo se ve con un
 * acceso de soporte aprobado por el propio negocio.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, Session } from './db';

let pool: pg.Pool;
let drop: () => Promise<void>;
let agent: Session; // administrador de la plataforma
let owner: Session; // dueño del negocio
let approver: Session; // recepcionista designada para aprobar soporte
let receptionist: Session; // recepcionista sin permiso de aprobar
let stranger: Session; // usuario cualquiera
let business: string;
let approverMembership: string;
let ownerMembership: string;

async function one<T extends pg.QueryResultRow>(s: Session, sql: string, params: unknown[] = []): Promise<T> {
  return (await s.query<T>(sql, params))[0]!;
}

const request = async (reason = 'Revisar horarios de la sucursal', hours = 24) =>
  (await one<{ id: string }>(agent, `select public.app_admin_request_support($1, $2, $3) as id`, [business, reason, hours])).id;

const snapshot = () => agent.query(`select public.app_admin_support_snapshot($1) as s`, [business]);

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });
  const agentId = await createUser(pool, 'soporte@plataforma.cl', 'Agente Soporte');
  agent = new Session(pool, agentId);
  owner = new Session(pool, await createUser(pool, 'duena@peluqueria.cl', 'Dueña'));
  approver = new Session(pool, await createUser(pool, 'aprueba@peluqueria.cl'));
  receptionist = new Session(pool, await createUser(pool, 'recepcion@peluqueria.cl'));
  stranger = new Session(pool, await createUser(pool, 'otro@test.cl'));
  // El primer administrador se agrega directo en la base (no hay función para hacerse admin)
  await pool.query(`insert into public.platform_admins (user_id) values ($1)`, [agentId]);

  business = (await one<{ id: string }>(owner, `select public.app_create_business('Peluquería Soporte', 'hair_salon', 'Centro') as id`)).id;
  await owner.query(`select public.app_add_member($1, 'aprueba@peluqueria.cl', 'receptionist')`, [business]);
  await owner.query(`select public.app_add_member($1, 'recepcion@peluqueria.cl', 'receptionist')`, [business]);
  approverMembership = (
    await one<{ id: string }>(owner, `select m.id from public.memberships m join public.profiles p on p.id = m.user_id where p.email = 'aprueba@peluqueria.cl'`)
  ).id;
  ownerMembership = (await one<{ id: string }>(owner, `select id from public.memberships where role = 'owner'`)).id;
});

afterAll(async () => {
  await pool?.end();
  await drop?.();
});

describe('administradores de la plataforma', () => {
  it('nadie puede hacerse administrador por su cuenta', async () => {
    await expect(stranger.query(`insert into public.platform_admins (user_id) values (app.current_user_id())`)).rejects.toThrow(
      /permission denied|row-level security/,
    );
  });

  it('cada persona solo puede ver si ella misma es administradora', async () => {
    expect((await agent.query(`select user_id from public.platform_admins`)).length).toBe(1);
    expect(await owner.query(`select user_id from public.platform_admins`)).toEqual([]);
  });

  it('solo un administrador ve la lista de clientes', async () => {
    const list = await one<{ c: Array<{ owner: { email: string }; businesses: Array<{ name: string; planCode: string }> }> }>(
      agent,
      `select public.app_admin_clients() as c`,
    );
    const client = list.c.find((c) => c.owner.email === 'duena@peluqueria.cl')!;
    expect(client.businesses[0]).toMatchObject({ name: 'Peluquería Soporte', planCode: 'base' });
    await expect(owner.query(`select public.app_admin_clients()`)).rejects.toThrow(/No autorizado/);
    await expect(new Session(pool, null).query(`select public.app_admin_clients()`)).rejects.toThrow(/permission denied/);
  });

  it('la lista de clientes no incluye clientes finales ni reservas', async () => {
    const raw = JSON.stringify(await agent.query(`select public.app_admin_clients() as c`));
    expect(raw).not.toMatch(/customers|phone_number|full_name/);
  });
});

describe('acceso de soporte', () => {
  it('sin aprobación el agente no ve la configuración', async () => {
    await expect(snapshot()).rejects.toThrow(/acceso de soporte aprobado/);
  });

  it('solo el dueño designa quién aprueba el soporte', async () => {
    await expect(approver.query(`select public.app_set_support_approver($1, true)`, [approverMembership])).rejects.toThrow(/Solo el dueño/);
    await expect(owner.query(`select public.app_set_support_approver($1, false)`, [ownerMembership])).rejects.toThrow(/siempre puede/);
    await owner.query(`select public.app_set_support_approver($1, true)`, [approverMembership]);
  });

  it('una solicitud pendiente la ven el dueño y los designados; no el resto del equipo ni otros', async () => {
    const id = await request();
    expect((await owner.query(`select id from public.support_access_requests`)).map((r) => r.id)).toEqual([id]);
    expect((await approver.query(`select id from public.support_access_requests`)).length).toBe(1);
    expect(await receptionist.query(`select id from public.support_access_requests`)).toEqual([]);
    expect(await stranger.query(`select id from public.support_access_requests`)).toEqual([]);
    // Solo una pendiente por negocio
    await expect(request()).rejects.toThrow(/pendiente/);
  });

  it('quien no está designado no puede aprobar, y nadie puede escribir la tabla directo', async () => {
    const id = (await one<{ id: string }>(owner, `select id from public.support_access_requests where status = 'pending'`)).id;
    await expect(receptionist.query(`select public.app_decide_support_request($1, true)`, [id])).rejects.toThrow(/No autorizado/);
    await expect(agent.query(`select public.app_decide_support_request($1, true)`, [id])).rejects.toThrow(/No autorizado/);
    await expect(owner.query(`update public.support_access_requests set status = 'approved' where id = $1`, [id])).rejects.toThrow(
      /permission denied/,
    );
  });

  it('al aprobar (por 2 horas), el agente ve la configuración y la vista queda registrada', async () => {
    const id = (await one<{ id: string }>(owner, `select id from public.support_access_requests where status = 'pending'`)).id;
    await approver.query(`select public.app_decide_support_request($1, true, 2)`, [id]);
    const r = await one<{ hours: number }>(
      owner,
      `select round(extract(epoch from expires_at - decided_at) / 3600)::int as hours from public.support_access_requests where id = $1`,
      [id],
    );
    expect(r.hours).toBe(2);

    const s = (await snapshot())[0]!.s as { business: { name: string }; branches: unknown[]; members: Array<{ email: string }>; totals: { customers: number } };
    expect(s.business.name).toBe('Peluquería Soporte');
    expect(s.branches.length).toBe(1);
    expect(s.members.map((m) => m.email)).toContain('duena@peluqueria.cl');
    // Solo totales de clientes finales, nunca sus datos
    expect(typeof s.totals.customers).toBe('number');
    expect(JSON.stringify(s)).not.toMatch(/"customers":\[/);

    const log = await owner.query(`select admin_user_id from public.support_access_log`);
    expect(log.length).toBe(1);
    expect(await receptionist.query(`select id from public.support_access_log`)).toEqual([]);
  });

  it('el acceso es solo del agente que lo pidió', async () => {
    const other = new Session(pool, await createUser(pool, 'soporte2@plataforma.cl'));
    await pool.query(`insert into public.platform_admins (user_id) values ($1)`, [other.userId]);
    await expect(other.query(`select public.app_admin_support_snapshot($1)`, [business])).rejects.toThrow(/acceso de soporte aprobado/);
  });

  it('el negocio puede revocar el acceso y el agente deja de ver la configuración', async () => {
    const id = (await one<{ id: string }>(owner, `select id from public.support_access_requests where status = 'approved'`)).id;
    await owner.query(`select public.app_revoke_support_access($1)`, [id]);
    await expect(snapshot()).rejects.toThrow(/acceso de soporte aprobado/);
  });

  it('un acceso vencido ya no sirve', async () => {
    const id = await request('Revisar recordatorios', 1);
    await owner.query(`select public.app_decide_support_request($1, true)`, [id]);
    await pool.query(`update public.support_access_requests set expires_at = now() - interval '1 minute' where id = $1`, [id]);
    await expect(snapshot()).rejects.toThrow(/acceso de soporte aprobado/);
  });

  it('el negocio puede rechazar, y el agente puede cancelar su solicitud', async () => {
    const rejected = await request('Revisar zonas');
    await owner.query(`select public.app_decide_support_request($1, false)`, [rejected]);
    await expect(snapshot()).rejects.toThrow(/acceso de soporte aprobado/);

    const cancelled = await request('Otra revisión');
    await agent.query(`select public.app_admin_cancel_support($1)`, [cancelled]);
    expect((await one<{ status: string }>(owner, `select status from public.support_access_requests where id = $1`, [cancelled])).status).toBe(
      'cancelled',
    );
  });

  it('la duración del acceso está acotada (1 hora a 7 días)', async () => {
    await expect(request('Duración inválida', 200)).rejects.toThrow(/entre 1 hora y 7 días/);
  });
});
