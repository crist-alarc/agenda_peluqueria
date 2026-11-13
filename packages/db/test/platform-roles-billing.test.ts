/**
 * Consola de la plataforma · A3a (ADR 0010): roles de la plataforma, aprobación de planes por el dueño,
 * planes free autorizados por un administrador y datos de facturación obligatorios con días de gracia.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, Session } from './db';

let pool: pg.Pool;
let drop: () => Promise<void>;
let platformOwner: Session;
let platformAdmin: Session;
let agent: Session;
let owner: Session;
let receptionist: Session;
let stranger: Session;
let anon: Session;
let server: Session;
let business: string;
let branch: string;
let slug: string;

async function one<T extends pg.QueryResultRow>(s: Session, sql: string, params: unknown[] = []): Promise<T> {
  return (await s.query<T>(sql, params))[0]!;
}

const features = JSON.stringify([
  { feature: 'branches', enabled: true, limit: 1 },
  { feature: 'resources', enabled: true, limit: 3 },
]);

const savePlan = (s: Session, code: string, opts: { prices?: Record<string, number>; isFree?: boolean; name?: string; isPublic?: boolean } = {}) =>
  s.query(`select public.app_admin_save_plan($1, $2, null, $3, true, '{}', $4::jsonb, $5::jsonb, null, $6) as id`, [
    code,
    opts.name ?? `Plan ${code}`,
    opts.isPublic ?? true,
    features,
    JSON.stringify(opts.prices ?? {}),
    opts.isFree ?? false,
  ]);

const subscription = () =>
  pool
    .query<{ plan_code: string; free_until: string | null; next_plan_code: string | null }>(
      `select plan_code, free_until::text, next_plan_code from public.business_subscriptions where business_id = $1`,
      [business],
    )
    .then((r) => r.rows[0]!);

const lastPeriod = () =>
  pool
    .query<{ monthly_net: number | null }>(
      `select monthly_net from public.subscription_periods where business_id = $1 order by starts_on desc, created_at desc limit 1`,
      [business],
    )
    .then((r) => r.rows[0]!);

const validProfile = {
  documentType: 'factura',
  taxId: '76.086.428-5',
  legalName: 'Peluquería Roles SpA',
  activity: 'Peluquería',
  address: 'Av. Siempre Viva 123',
  commune: 'Maipú',
  email: 'Facturas@Roles.cl',
};

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });
  const ids = {
    owner: await createUser(pool, 'dueno@plataforma.cl', 'Dueño Plataforma'),
    admin: await createUser(pool, 'admin@plataforma.cl', 'Admin Plataforma'),
    agent: await createUser(pool, 'agente@plataforma.cl', 'Agente Soporte'),
  };
  await pool.query(
    `insert into public.platform_admins (user_id, role) values ($1, 'owner'), ($2, 'admin'), ($3, 'agent')`,
    [ids.owner, ids.admin, ids.agent],
  );
  platformOwner = new Session(pool, ids.owner);
  platformAdmin = new Session(pool, ids.admin);
  agent = new Session(pool, ids.agent);
  owner = new Session(pool, await createUser(pool, 'duena@roles.cl'));
  receptionist = new Session(pool, await createUser(pool, 'recepcion@roles.cl'));
  stranger = new Session(pool, await createUser(pool, 'ajena@roles.cl'));
  anon = new Session(pool, null);
  server = new Session(pool, null, 'service_role');

  await savePlan(platformOwner, 'emprende', { prices: { CLP: 10000 } });
  await savePlan(platformOwner, 'amigos', { isFree: true, name: 'Free amigos' });

  business = (await one<{ id: string }>(owner, `select public.app_create_business('Peluquería Roles', 'hair_salon', 'Centro', null, null, 'America/Santiago', 'emprende') as id`)).id;
  branch = (await one<{ id: string }>(owner, `select id from public.branches where business_id = $1`, [business])).id;
  slug = (await one<{ slug: string }>(owner, `select slug from public.businesses where id = $1`, [business])).slug;
  await owner.query(`select public.app_add_member($1, 'recepcion@roles.cl', 'receptionist')`, [business]);
});

afterAll(async () => {
  await pool?.end();
  await drop?.();
});

describe('roles de la plataforma', () => {
  it('nadie se agrega solo; el rol por defecto es el más limitado (agente)', async () => {
    await expect(stranger.query(`insert into public.platform_admins (user_id, role) values (app.current_user_id(), 'owner')`)).rejects.toThrow(
      /permission denied/,
    );
    const u = await createUser(pool, 'nuevo@plataforma.cl');
    await pool.query(`insert into public.platform_admins (user_id) values ($1)`, [u]);
    expect((await pool.query(`select role from public.platform_admins where user_id = $1`, [u])).rows[0]).toEqual({ role: 'agent' });
  });

  it('solo el dueño administra el equipo y no puede cambiarse a sí mismo', async () => {
    await expect(platformAdmin.query(`select public.app_admin_set_team_member('nuevo@plataforma.cl', 'admin')`)).rejects.toThrow(/Solo el dueño/);
    await platformOwner.query(`select public.app_admin_set_team_member('nuevo@plataforma.cl', 'admin')`);
    await expect(platformOwner.query(`select public.app_admin_set_team_member('dueno@plataforma.cl', 'agent')`)).rejects.toThrow(/propio rol/);
    await expect(platformOwner.query(`select public.app_admin_set_team_member('nadie@x.cl', 'agent')`)).rejects.toThrow(/No hay una cuenta/);
    const team = (await one<{ t: Array<{ email: string; role: string }> }>(agent, `select public.app_admin_team() as t`)).t;
    expect(team.find((m) => m.email === 'nuevo@plataforma.cl')?.role).toBe('admin');
    expect(team[0]!.role).toBe('owner');
  });

  it('un agente no cambia planes, no suspende ni edita impuestos', async () => {
    await expect(agent.query(`select public.app_admin_change_plan($1, 'emprende')`, [business])).rejects.toThrow(/Solo un administrador/);
    await expect(agent.query(`select public.app_admin_suspend($1, 'Prueba')`, [business])).rejects.toThrow(/Solo un administrador/);
    await expect(agent.query(`select public.app_admin_add_override($1, 'resources', true, 9, null, 'Prueba')`, [business])).rejects.toThrow(
      /Solo un administrador/,
    );
    await expect(savePlan(agent, 'del_agente')).rejects.toThrow(/Solo un administrador/);
    // Puede seguir mirando
    expect((await one<{ p: unknown[] }>(agent, `select public.app_admin_plans() as p`)).p.length).toBeGreaterThan(0);
  });
});

describe('planes con aprobación del dueño', () => {
  it('un plan nuevo de un administrador queda pendiente y no se ofrece ni se asigna', async () => {
    await savePlan(platformAdmin, 'pyme', { prices: { CLP: 15000 } });
    const plans = (await one<{ p: { plans: Array<{ code: string }> } }>(owner, `select public.app_public_plans('CL') as p`)).p.plans;
    expect(plans.map((p) => p.code)).not.toContain('pyme');
    await expect(platformAdmin.query(`select public.app_admin_change_plan($1, 'pyme')`, [business])).rejects.toThrow(/no disponible/);
    const approvals = (await one<{ a: { planVersions: Array<{ planCode: string; isNewPlan: boolean }> } }>(agent, `select public.app_admin_approvals() as a`)).a;
    expect(approvals.planVersions).toEqual([expect.objectContaining({ planCode: 'pyme', isNewPlan: true })]);
  });

  it('el administrador corrige su propuesta en vez de crear otra; solo el dueño la aprueba', async () => {
    await savePlan(platformAdmin, 'pyme', { prices: { CLP: 14000 } });
    const pending = await pool.query(`select id, prices from public.plan_versions where plan_code = 'pyme' and status = 'pending'`);
    expect(pending.rows).toHaveLength(1);
    expect(pending.rows[0].prices).toEqual({ CLP: 14000 });
    await expect(platformAdmin.query(`select public.app_admin_decide_plan_version($1, true)`, [pending.rows[0].id])).rejects.toThrow(/Solo el dueño/);
    await platformOwner.query(`select public.app_admin_decide_plan_version($1, true, 'Ok')`, [pending.rows[0].id]);
    const plans = (await one<{ p: { plans: Array<{ code: string; monthlyNet: number }> } }>(owner, `select public.app_public_plans('CL') as p`)).p.plans;
    expect(plans.find((p) => p.code === 'pyme')?.monthlyNet).toBe(14000);
  });

  it('un cambio de precio de un administrador no afecta a nadie hasta que el dueño lo aprueba', async () => {
    await savePlan(platformAdmin, 'emprende', { prices: { CLP: 99000 } });
    const plans = (await one<{ p: { plans: Array<{ code: string; monthlyNet: number }> } }>(owner, `select public.app_public_plans('CL') as p`)).p.plans;
    expect(plans.find((p) => p.code === 'emprende')?.monthlyNet).toBe(10000);
    const v = (await pool.query(`select id from public.plan_versions where plan_code = 'emprende' and status = 'pending'`)).rows[0];
    await platformOwner.query(`select public.app_admin_decide_plan_version($1, false, 'Muy caro')`, [v.id]);
    expect((await pool.query(`select status from public.plan_versions where id = $1`, [v.id])).rows[0]).toEqual({ status: 'rejected' });
  });

  it('un administrador no cambia nombre, visibilidad ni el tipo free de un plan existente', async () => {
    await expect(savePlan(platformAdmin, 'emprende', { prices: { CLP: 10000 }, name: 'Otro nombre' })).rejects.toThrow(/Solo el dueño/);
    await expect(savePlan(platformAdmin, 'emprende', { prices: { CLP: 10000 }, isFree: true })).rejects.toThrow(/Solo el dueño/);
  });
});

describe('planes free con autorización', () => {
  it('un plan free no se elige al registrarse ni se asigna como un cambio normal', async () => {
    const plans = (await one<{ p: { plans: Array<{ code: string }> } }>(owner, `select public.app_public_plans('CL') as p`)).p.plans;
    expect(plans.map((p) => p.code)).not.toContain('amigos');
    await expect(
      owner.query(`select public.app_create_business('Otro', 'hair_salon', 'Centro', null, null, 'America/Santiago', 'amigos')`),
    ).rejects.toThrow(/no está disponible/);
    await expect(platformAdmin.query(`select public.app_admin_change_plan($1, 'amigos')`, [business])).rejects.toThrow(/autorización/);
  });

  it('lo pide un agente: queda pendiente; él no lo autoriza; un administrador sí, y se cobra $0', async () => {
    const id = (await one<{ id: string }>(agent, `select public.app_admin_request_free_plan($1, 'amigos', null, null, 'Piloto de los juegos') as id`, [business])).id;
    expect((await subscription()).plan_code).toBe('emprende');
    await expect(agent.query(`select public.app_admin_decide_free_plan($1, true)`, [id])).rejects.toThrow(/Solo un administrador/);
    await expect(agent.query(`select public.app_admin_request_free_plan($1, 'amigos', null, null, 'Otra vez')`, [business])).rejects.toThrow(
      /pendiente/,
    );
    await platformAdmin.query(`select public.app_admin_decide_free_plan($1, true)`, [id]);
    expect(await subscription()).toEqual({ plan_code: 'amigos', free_until: null, next_plan_code: null });
    expect((await lastPeriod()).monthly_net).toBe(0);
  });

  it('quien pide no autoriza su propia solicitud', async () => {
    const other = (await one<{ id: string }>(owner, `select public.app_create_business('Otro negocio', 'hair_salon', 'Centro', null, null, 'America/Santiago', 'emprende') as id`)).id;
    await platformOwner.query(`select public.app_admin_set_team_member('agente@plataforma.cl', 'agent')`);
    const id = (await one<{ id: string }>(agent, `select public.app_admin_request_free_plan($1, 'amigos', null, null, 'Pedido') as id`, [other])).id;
    // El agente pasa a administrador: igual no puede autorizar lo que él pidió
    await platformOwner.query(`select public.app_admin_set_team_member('agente@plataforma.cl', 'admin')`);
    await expect(agent.query(`select public.app_admin_decide_free_plan($1, true)`, [id])).rejects.toThrow(/Otra persona/);
    await platformAdmin.query(`select public.app_admin_decide_free_plan($1, false)`, [id]);
    await platformOwner.query(`select public.app_admin_set_team_member('agente@plataforma.cl', 'agent')`);
  });

  it('con fecha de término, al llegar ese día pasa al plan elegido (desde el día siguiente)', async () => {
    await expect(
      platformAdmin.query(`select public.app_admin_request_free_plan($1, 'amigos', app.platform_today() + 30, null, 'Sin plan siguiente')`, [business]),
    ).rejects.toThrow(/Elige a qué plan/);
    await platformAdmin.query(`select public.app_admin_request_free_plan($1, 'amigos', app.platform_today() + 30, 'emprende', 'Un mes gratis')`, [business]);
    expect((await subscription()).next_plan_code).toBe('emprende');
    expect(await pool.query(`select app.expire_free_plans() as n`).then((r) => r.rows[0].n)).toBe(0);

    await pool.query(`update public.business_subscriptions set free_until = app.platform_today() where business_id = $1`, [business]);
    expect(await pool.query(`select app.expire_free_plans() as n`).then((r) => r.rows[0].n)).toBe(1);
    expect(await subscription()).toEqual({ plan_code: 'emprende', free_until: null, next_plan_code: null });
    expect((await lastPeriod()).monthly_net).toBe(10000);
  });
});

describe('datos de facturación', () => {
  it('solo el dueño los ve y los guarda; el RUT se valida', async () => {
    await expect(owner.query(`select public.app_save_billing_profile($1, $2)`, [business, JSON.stringify({ ...validProfile, taxId: '76.086.428-6' })])).rejects.toThrow(
      /RUT no es válido/,
    );
    await expect(
      owner.query(`select public.app_save_billing_profile($1, $2)`, [business, JSON.stringify({ ...validProfile, activity: '' })]),
    ).rejects.toThrow(/Para factura/);
    await expect(receptionist.query(`select public.app_save_billing_profile($1, $2)`, [business, JSON.stringify(validProfile)])).rejects.toThrow(
      /Solo el dueño/,
    );
    await owner.query(`select public.app_save_billing_profile($1, $2)`, [business, JSON.stringify(validProfile)]);
    const row = await one<{ tax_id: string; email: string }>(owner, `select tax_id, email from public.business_billing_profiles where business_id = $1`, [business]);
    expect(row).toEqual({ tax_id: '76086428-5', email: 'facturas@roles.cl' });
    expect(await receptionist.query(`select id from public.business_billing_profiles`)).toEqual([]);
    expect(await stranger.query(`select id from public.business_billing_profiles`)).toEqual([]);
    await expect(owner.query(`update public.business_billing_profiles set legal_name = 'x'`)).rejects.toThrow(/permission denied/);
  });

  it('boleta: basta nombre y email; cliente de otro país: exportación', async () => {
    const other = (await one<{ id: string }>(owner, `select id from public.businesses where name = 'Otro negocio'`)).id;
    await owner.query(`select public.app_save_billing_profile($1, $2)`, [other, JSON.stringify({ documentType: 'boleta', legalName: 'Ana Pérez', email: 'ana@x.cl' })]);
    await owner.query(`select public.app_save_billing_profile($1, $2)`, [
      other,
      JSON.stringify({ documentType: 'boleta', country: 'PE', taxId: '20123456789', legalName: 'Ana SAC', address: 'Lima 1', email: 'ana@x.pe' }),
    ]);
    expect((await one<{ document_type: string }>(owner, `select document_type from public.business_billing_profiles where business_id = $1`, [other])).document_type).toBe(
      'exportacion',
    );
  });

  it('el panel sugiere los datos de otro negocio del mismo dueño; recepción solo ve el estado', async () => {
    const newId = (await one<{ id: string }>(owner, `select public.app_create_business('Tercero', 'hair_salon', 'Centro', null, null, 'America/Santiago', 'emprende') as id`)).id;
    const mine = (await one<{ b: { status: string; profile: unknown; suggestion: { fromBusiness: string } } }>(owner, `select public.app_business_billing($1) as b`, [newId])).b;
    expect(mine.status).toBe('grace');
    expect(mine.profile).toBeNull();
    expect(mine.suggestion.fromBusiness).toBeTruthy();
    const rec = (await one<{ b: { status: string; profile: unknown; isOwner: boolean } }>(receptionist, `select public.app_business_billing($1) as b`, [business])).b;
    expect(rec).toMatchObject({ status: 'ok', profile: null, isOwner: false });
    await expect(stranger.query(`select public.app_business_billing($1)`, [business])).rejects.toThrow(/No autorizado/);
  });
});

describe('días de gracia', () => {
  it('último día hábil del mes del alta, o del mes siguiente si quedan menos de 15 días', async () => {
    const deadline = async (d: string) => (await pool.query(`select app.billing_grace_deadline($1::date)::text as d`, [d])).rows[0].d;
    expect(await deadline('2026-11-13')).toBe('2026-11-30');
    // 30 de enero de 2027 es sábado: el último día hábil es el viernes 29
    expect(await deadline('2027-01-04')).toBe('2027-01-29');
    // Quedan 10 días: pasa al último día hábil de diciembre
    expect(await deadline('2026-11-20')).toBe('2026-12-31');
    // Un feriado el último día hábil lo corre al día hábil anterior
    await pool.query(`insert into public.holidays (date, name) values ('2026-11-30', 'Feriado de prueba') on conflict do nothing`);
    expect(await deadline('2026-11-02')).toBe('2026-11-27');
    // El mínimo es configurable (solo el dueño de la plataforma)
    await expect(platformAdmin.query(`select public.app_admin_save_settings(5)`)).rejects.toThrow(/Solo el dueño/);
    await platformOwner.query(`select public.app_admin_save_settings(5)`);
    expect(await deadline('2026-11-20')).toBe('2026-11-27');
    await platformOwner.query(`select public.app_admin_save_settings(15)`);
  });

  it('vencido el plazo sin datos: sin link público ni reservas nuevas; al completar, vuelve', async () => {
    const id = (await one<{ id: string }>(owner, `select id from public.businesses where name = 'Tercero'`)).id;
    const b = await one<{ slug: string }>(owner, `select slug from public.businesses where id = $1`, [id]);
    const br = (await one<{ id: string }>(owner, `select id from public.branches where business_id = $1`, [id])).id;
    expect((await one<{ b: unknown }>(anon, `select public.app_public_business($1) as b`, [b.slug])).b).not.toBeNull();

    await pool.query(`update public.businesses set billing_grace_until = app.platform_today() - 1 where id = $1`, [id]);
    expect((await one<{ b: { status: string } }>(owner, `select public.app_business_billing($1) as b`, [id])).b.status).toBe('blocked');
    expect((await one<{ b: unknown }>(anon, `select public.app_public_business($1) as b`, [b.slug])).b).toBeNull();
    await expect(server.query(`select public.app_booking_context($1, $2, now(), now() + interval '1 day')`, [id, br])).rejects.toThrow(
      /no está recibiendo reservas/,
    );
    await expect(
      owner.query(`select public.app_create_booking($1, $2, $3, $4)`, [
        id,
        br,
        JSON.stringify({ full_name: 'Cliente', phone: '+56911112222' }),
        JSON.stringify([{ service_id: '00000000-0000-4000-8000-000000000000', starts_at: new Date(Date.now() + 86_400_000).toISOString() }]),
      ]),
    ).rejects.toThrow(/no está recibiendo reservas/);

    // La plataforma puede dar más plazo, o el dueño completa los datos
    await expect(agent.query(`select public.app_admin_extend_billing_grace($1, app.platform_today() + 5)`, [id])).rejects.toThrow(/Solo un administrador/);
    await platformAdmin.query(`select public.app_admin_extend_billing_grace($1, app.platform_today() + 5)`, [id]);
    expect((await one<{ b: { status: string } }>(owner, `select public.app_business_billing($1) as b`, [id])).b.status).toBe('grace');
    await pool.query(`update public.businesses set billing_grace_until = app.platform_today() - 1 where id = $1`, [id]);
    await owner.query(`select public.app_save_billing_profile($1, $2)`, [id, JSON.stringify(validProfile)]);
    expect((await one<{ b: unknown }>(anon, `select public.app_public_business($1) as b`, [b.slug])).b).not.toBeNull();
  });

  it('los negocios con datos o en plazo siguen funcionando normal', async () => {
    expect((await one<{ b: unknown }>(anon, `select public.app_public_business($1) as b`, [slug])).b).not.toBeNull();
    await server.query(`select public.app_booking_context($1, $2, now(), now() + interval '1 day')`, [business, branch]);
  });

  it('la consola ve los datos, el estado y el plan free de un negocio', async () => {
    const r = (await one<{ b: { status: string; profile: { taxId: string }; freeRequests: unknown[] } }>(agent, `select public.app_admin_business_billing($1) as b`, [business])).b;
    expect(r.status).toBe('ok');
    expect(r.profile.taxId).toBe('76086428-5');
    expect(r.freeRequests.length).toBe(2);
    await expect(owner.query(`select public.app_admin_business_billing($1)`, [business])).rejects.toThrow(/No autorizado/);
  });
});
