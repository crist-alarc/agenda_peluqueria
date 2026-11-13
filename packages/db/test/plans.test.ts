/**
 * Consola de la plataforma · A2 (ADR 0009): planes con versiones, cambio de plan con tramos de cobro,
 * funciones puntuales con vencimiento, suspensión, impuestos y elección de plan al crear el negocio.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, Session } from './db';

let pool: pg.Pool;
let drop: () => Promise<void>;
let admin: Session;
let owner: Session;
let receptionist: Session;
let server: Session;
let anon: Session;
let business: string;
let branch: string;

async function one<T extends pg.QueryResultRow>(s: Session, sql: string, params: unknown[] = []): Promise<T> {
  return (await s.query<T>(sql, params))[0]!;
}

const features = (overrides: Record<string, { enabled: boolean; limit: number | null }> = {}) =>
  JSON.stringify(
    Object.entries({
      branches: { enabled: true, limit: 1 },
      resources: { enabled: true, limit: 3 },
      email_notifications: { enabled: true, limit: null },
      commissions: { enabled: false, limit: null },
      ...overrides,
    }).map(([feature, v]) => ({ feature, ...v })),
  );

const savePlan = (code: string, f: string, prices: Record<string, number>, isPublic = true) =>
  admin.query(`select public.app_admin_save_plan($1, $2, 'Plan de prueba', $3, true, '{}', $4::jsonb, $5::jsonb, 'nota') as id`, [
    code,
    `Plan ${code}`,
    isPublic,
    f,
    JSON.stringify(prices),
  ]);

const entitlement = async (feature: string) =>
  (await one<{ enabled: boolean; limit_value: number | null; source: string }>(
    owner,
    `select enabled, limit_value, source from public.business_entitlements where business_id = $1 and feature = $2`,
    [business, feature],
  )) ?? null;

const periods = () =>
  pool
    .query<{ kind: string; starts_on: string; ends_on: string | null; monthly_net: number | null }>(
      `select kind, starts_on::text, ends_on::text, monthly_net from public.subscription_periods where business_id = $1 order by starts_on, created_at`,
      [business],
    )
    .then((r) => r.rows);

const today = async () => (await pool.query<{ d: string }>(`select app.platform_today()::text as d`)).rows[0]!.d;
const tomorrow = async () => (await pool.query<{ d: string }>(`select (app.platform_today() + 1)::text as d`)).rows[0]!.d;

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });
  const adminId = await createUser(pool, 'admin@plataforma.cl', 'Admin');
  admin = new Session(pool, adminId);
  owner = new Session(pool, await createUser(pool, 'duena@planes.cl'));
  receptionist = new Session(pool, await createUser(pool, 'recepcion@planes.cl'));
  server = new Session(pool, null, 'service_role');
  anon = new Session(pool, null);
  await pool.query(`insert into public.platform_admins (user_id, role) values ($1, 'owner')`, [adminId]);

  // Dos planes a la venta en Chile, con precio neto en CLP y USD
  await savePlan('emprende', features(), { CLP: 10000, USD: 1200 });
  await savePlan('pro', features({ resources: { enabled: true, limit: 10 }, commissions: { enabled: true, limit: null } }), { CLP: 20000, USD: 2400 });
});

afterAll(async () => {
  await pool?.end();
  await drop?.();
});

describe('impuestos y planes a la venta', () => {
  it('el negocio ve los planes de su país con la moneda y el IVA que le corresponden', async () => {
    const r = await one<{ p: { currency: string; taxRateBp: number; plans: Array<{ code: string; monthlyNet: number }> } }>(
      owner,
      `select public.app_public_plans('CL') as p`,
    );
    expect(r.p).toMatchObject({ currency: 'CLP', taxRateBp: 1900 });
    expect(r.p.plans.map((p) => [p.code, p.monthlyNet])).toEqual(
      expect.arrayContaining([
        ['emprende', 10000],
        ['pro', 20000],
      ]),
    );
    // Un plan no ofrecido (el Completo) no aparece
    expect(r.p.plans.map((p) => p.code)).not.toContain('completo');
  });

  it('un cliente de otro país se cobra en dólares y sin IVA (exportación de servicios)', async () => {
    const r = await one<{ p: { currency: string; taxRateBp: number; documentType: string } }>(owner, `select public.app_public_plans('PE') as p`);
    expect(r.p).toMatchObject({ currency: 'USD', taxRateBp: 0, documentType: 'factura_exportacion' });
  });

  it('las empresas emisoras y las reglas no se leen ni se escriben directo', async () => {
    expect(await owner.query(`select id from public.billing_entities`)).toEqual([]);
    await expect(admin.query(`update public.tax_rules set tax_rate_bp = 0`)).rejects.toThrow(/permission denied/);
  });
});

describe('alta con el plan elegido', () => {
  it('el dueño elige su plan al crear el negocio; el tramo de cobro parte hoy', async () => {
    business = (await one<{ id: string }>(owner, `select public.app_create_business('Peluquería Planes', 'hair_salon', 'Centro', null, null, 'America/Santiago', 'emprende') as id`)).id;
    branch = (await one<{ id: string }>(owner, `select id from public.branches where business_id = $1`, [business])).id;
    await owner.query(`select public.app_add_member($1, 'recepcion@planes.cl', 'receptionist')`, [business]);
    const sub = await one<{ plan_code: string; currency: string }>(owner, `select plan_code, currency from public.business_subscriptions where business_id = $1`, [business]);
    expect(sub).toEqual({ plan_code: 'emprende', currency: 'CLP' });
    expect(await periods()).toEqual([{ kind: 'plan', starts_on: await today(), ends_on: null, monthly_net: 10000 }]);
    expect(await entitlement('resources')).toMatchObject({ enabled: true, limit_value: 3, source: 'plan' });
  });

  it('no se puede elegir un plan que no está a la venta', async () => {
    await expect(
      owner.query(`select public.app_create_business('Otro', 'hair_salon', 'Centro', null, null, 'America/Santiago', 'completo')`),
    ).rejects.toThrow(/no está disponible/);
  });

  it('el negocio ve su plan; recepción no ve los tramos de cobro', async () => {
    const mine = await one<{ p: { planName: string; monthlyNet: number; taxRateBp: number } }>(owner, `select public.app_my_plan($1) as p`, [business]);
    expect(mine.p).toMatchObject({ planName: 'Plan emprende', monthlyNet: 10000, taxRateBp: 1900 });
    expect((await owner.query(`select id from public.subscription_periods`)).length).toBe(1);
    expect(await receptionist.query(`select id from public.subscription_periods`)).toEqual([]);
    await expect(new Session(pool, await createUser(pool, 'ajeno@planes.cl')).query(`select public.app_my_plan($1)`, [business])).rejects.toThrow(
      /No autorizado/,
    );
  });
});

describe('solo la plataforma administra planes', () => {
  it('un dueño no puede crear planes ni cambiarse de plan', async () => {
    await expect(owner.query(`select public.app_admin_plans()`)).rejects.toThrow(/No autorizado/);
    await expect(owner.query(`select public.app_admin_change_plan($1, 'pro')`, [business])).rejects.toThrow(/Solo un administrador/);
    await expect(owner.query(`update public.business_subscriptions set plan_code = 'pro'`)).rejects.toThrow(/permission denied/);
    await expect(anon.query(`select public.app_public_plans('CL')`)).rejects.toThrow(/permission denied/);
  });
});

describe('versiones de un plan', () => {
  it('guardar sin cambios no crea versión; cambiar el precio sí', async () => {
    const count = async () => (await pool.query<{ n: number }>(`select count(*)::int as n from public.plan_versions where plan_code = 'emprende'`)).rows[0]!.n;
    await savePlan('emprende', features(), { CLP: 10000, USD: 1200 });
    expect(await count()).toBe(1);
    await savePlan('emprende', features(), { CLP: 12000, USD: 1200 });
    expect(await count()).toBe(2);
  });

  it('quien tiene la versión anterior la conserva hasta que la plataforma decida pasarlo', async () => {
    const version = await pool.query<{ version: number }>(
      `select v.version from public.business_subscriptions s join public.plan_versions v on v.id = s.plan_version_id where s.business_id = $1`,
      [business],
    );
    expect(version.rows[0]!.version).toBe(1);

    const old = (await pool.query<{ id: string }>(`select id from public.plan_versions where plan_code = 'emprende' and version = 1`)).rows[0]!.id;
    const moved = await one<{ n: number }>(admin, `select public.app_admin_migrate_plan_version($1, 'Mejora de precio') as n`, [old]);
    expect(moved.n).toBe(1);
    // Se cobra con el precio nuevo desde mañana
    expect(await periods()).toEqual([
      { kind: 'plan', starts_on: await today(), ends_on: await today(), monthly_net: 10000 },
      { kind: 'plan', starts_on: await tomorrow(), ends_on: null, monthly_net: 12000 },
    ]);
  });
});

describe('cambio de plan y funciones puntuales', () => {
  it('al cambiar de plan, las funciones cambian ya; un segundo cambio el mismo día reemplaza el tramo de mañana', async () => {
    await admin.query(`select public.app_admin_change_plan($1, 'pro', 'Pidió comisiones')`, [business]);
    expect(await entitlement('commissions')).toMatchObject({ enabled: true });
    expect(await entitlement('resources')).toMatchObject({ limit_value: 10 });
    const p = await periods();
    const next = await tomorrow();
    expect(p.at(-1)).toEqual({ kind: 'plan', starts_on: next, ends_on: null, monthly_net: 20000 });
    expect(p.filter((x) => x.starts_on === next).length).toBe(1);
  });

  it('al bajar de plan no se borra nada, pero no se pueden crear más recursos que el nuevo límite', async () => {
    for (let i = 1; i <= 5; i++) {
      await owner.query(`insert into public.resources (business_id, branch_id, type, name) values ($1, $2, 'space', $3)`, [business, branch, `Sillón ${i}`]);
    }
    await admin.query(`select public.app_admin_change_plan($1, 'emprende')`, [business]);
    expect((await owner.query(`select id from public.resources where business_id = $1`, [business])).length).toBe(5);
    await expect(
      owner.query(`insert into public.resources (business_id, branch_id, type, name) values ($1, $2, 'space', 'Sillón 6')`, [business, branch]),
    ).rejects.toThrow(/límite/);
  });

  it('una función puntual con fecha de término se aplica y, al vencer, vuelve lo del plan', async () => {
    const id = (
      await one<{ id: string }>(admin, `select public.app_admin_add_override($1, 'commissions', true, null, now() + interval '1 day', 'Regalo de prueba') as id`, [
        business,
      ])
    ).id;
    expect(await entitlement('commissions')).toMatchObject({ enabled: true, source: 'manual' });
    await pool.query(`update public.business_feature_overrides set expires_at = now() - interval '1 minute' where id = $1`, [id]);
    expect((await pool.query<{ n: number }>(`select app.expire_feature_overrides() as n`)).rows[0]!.n).toBe(1);
    expect(await entitlement('commissions')).toMatchObject({ enabled: false, source: 'plan' });
  });

  it('una función puntual para subir un límite, y se puede terminar antes', async () => {
    const id = (await one<{ id: string }>(admin, `select public.app_admin_add_override($1, 'resources', true, 8, null, 'Temporada alta') as id`, [business])).id;
    expect(await entitlement('resources')).toMatchObject({ limit_value: 8, source: 'manual' });
    await admin.query(`select public.app_admin_end_override($1)`, [id]);
    expect(await entitlement('resources')).toMatchObject({ limit_value: 3, source: 'plan' });
    await expect(admin.query(`select public.app_admin_add_override($1, 'resources', true, 8, now() - interval '1 day', 'Pasada')`, [business])).rejects.toThrow(
      /futura/,
    );
  });
});

describe('suspensión', () => {
  it('suspendido: sin link público ni reservas nuevas, y los días no se cobran', async () => {
    await expect(owner.query(`select public.app_admin_suspend($1, 'Falta de pago')`, [business])).rejects.toThrow(/Solo un administrador/);
    await admin.query(`select public.app_admin_suspend($1, 'Falta de pago')`, [business]);

    const slug = (await one<{ slug: string }>(owner, `select slug from public.businesses where id = $1`, [business])).slug;
    expect((await one<{ b: unknown }>(anon, `select public.app_public_business($1) as b`, [slug])).b).toBeNull();
    await expect(
      server.query(`select public.app_booking_context($1, $2, now(), now() + interval '1 day')`, [business, branch]),
    ).rejects.toThrow(/suspendido/);
    await expect(
      owner.query(`select public.app_create_booking($1, $2, $3, $4)`, [
        business,
        branch,
        JSON.stringify({ full_name: 'Cliente', phone: '+56911112222' }),
        JSON.stringify([{ service_id: '00000000-0000-4000-8000-000000000000', starts_at: new Date(Date.now() + 86_400_000).toISOString() }]),
      ]),
    ).rejects.toThrow(/suspendido/);

    expect((await periods()).at(-1)).toMatchObject({ kind: 'suspended', starts_on: await tomorrow(), monthly_net: null });
  });

  it('al reactivar vuelve el plan, también para el cobro', async () => {
    await admin.query(`select public.app_admin_reactivate($1)`, [business]);
    const slug = (await one<{ slug: string }>(owner, `select slug from public.businesses where id = $1`, [business])).slug;
    expect((await one<{ b: unknown }>(anon, `select public.app_public_business($1) as b`, [slug])).b).not.toBeNull();
    expect((await periods()).at(-1)).toMatchObject({ kind: 'plan', ends_on: null, monthly_net: 12000 });
  });
});

describe('ficha del negocio en la consola', () => {
  it('muestra plan, tramos, funciones puntuales, uso y condiciones de cobro', async () => {
    const r = await one<{
      p: { subscription: { planCode: string; currency: string }; billing: { taxRateBp: number }; periods: unknown[]; overrides: unknown[]; usage: { resources: number } };
    }>(admin, `select public.app_admin_business_plan($1) as p`, [business]);
    expect(r.p.subscription).toMatchObject({ planCode: 'emprende', currency: 'CLP' });
    expect(r.p.billing.taxRateBp).toBe(1900);
    expect(r.p.periods.length).toBeGreaterThan(1);
    expect(r.p.overrides.length).toBe(2);
    expect(r.p.usage.resources).toBe(5);
  });
});
