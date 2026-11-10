/**
 * Tests de seguridad de la base de datos (directrices, secciones 2, 17 y 21).
 *
 * Se crean dos negocios de dueños distintos y se comprueba, como lo haría la API
 * de Supabase (rol `authenticated`/`anon` + RLS), que:
 *  - ningún negocio puede leer ni modificar datos de otro;
 *  - cada rol solo puede hacer lo que le corresponde;
 *  - los límites del plan y la auditoría se aplican en la base.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, Session } from './db';

let pool: pg.Pool;
let drop: () => Promise<void>;

let ownerA: Session;
let ownerB: Session;
let receptionistA: Session;
let branchAdminA: Session;
let adminA: Session;
let anon: Session;
let businessA: string;
let businessB: string;
let branchA: string;
let branchB: string;

async function createBusiness(session: Session, name: string, industry = 'hair_salon'): Promise<string> {
  const rows = await session.query<{ id: string }>(
    `select public.app_create_business($1, $2, 'Casa matriz', 'Av. Siempre Viva 742', 'Santiago') as id`,
    [name, industry],
  );
  return rows[0]!.id;
}

async function count(session: Session, table: string, where = 'true', params: unknown[] = []): Promise<number> {
  const rows = await session.query<{ n: string }>(`select count(*)::text as n from public.${table} where ${where}`, params);
  return Number(rows[0]!.n);
}

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });

  ownerA = new Session(pool, await createUser(pool, 'dueno.a@test.cl', 'Dueña A'));
  ownerB = new Session(pool, await createUser(pool, 'dueno.b@test.cl', 'Dueño B'));
  receptionistA = new Session(pool, await createUser(pool, 'recepcion.a@test.cl'));
  branchAdminA = new Session(pool, await createUser(pool, 'sucursal.a@test.cl'));
  adminA = new Session(pool, await createUser(pool, 'admin.a@test.cl'));
  anon = new Session(pool, null);

  businessA = await createBusiness(ownerA, 'Peluquería Ánimo');
  businessB = await createBusiness(ownerB, 'Inflables del Sur', 'inflatables');
  branchA = (await ownerA.query<{ id: string }>('select id from public.branches'))[0]!.id;
  branchB = (await ownerB.query<{ id: string }>('select id from public.branches'))[0]!.id;

  await ownerA.query(`select public.app_add_member($1, 'recepcion.a@test.cl', 'receptionist')`, [businessA]);
  await ownerA.query(`select public.app_add_member($1, 'sucursal.a@test.cl', 'branch_admin', array[$2]::uuid[])`, [
    businessA,
    branchA,
  ]);
  await ownerA.query(`select public.app_add_member($1, 'admin.a@test.cl', 'admin')`, [businessA]);
});

afterAll(async () => {
  await pool?.end();
  await drop?.();
});

describe('alta de negocio', () => {
  it('crea organización, negocio, dueño, sucursal, plan y datos de la plantilla', async () => {
    const [business] = await ownerA.query<{ slug: string; booking_mode: string; timezone: string }>(
      'select slug, booking_mode, timezone from public.businesses where id = $1',
      [businessA],
    );
    expect(business).toEqual({ slug: 'peluqueria-animo', booking_mode: 'appointment', timezone: 'America/Santiago' });
    expect(await count(ownerA, 'organizations')).toBe(1);
    expect(await count(ownerA, 'branches')).toBe(1);
    expect(await count(ownerA, 'branch_hours')).toBe(6);
    expect(await count(ownerA, 'services')).toBe(4);
    expect(await count(ownerA, 'service_resource_requirements')).toBe(4);
    expect(await count(ownerA, 'addons')).toBe(1);
    const [sub] = await ownerA.query<{ plan_code: string }>('select plan_code from public.business_subscriptions');
    expect(sub?.plan_code).toBe('base');
    const ent = await ownerA.query<{ feature: string; limit_value: number | null }>(
      `select feature, limit_value from public.business_entitlements where feature in ('branches', 'resources') order by feature`,
    );
    expect(ent).toEqual([
      { feature: 'branches', limit_value: 1 },
      { feature: 'resources', limit_value: 10 },
    ]);
  });

  it('el modo de reserva viene del rubro', async () => {
    const [b] = await ownerB.query<{ booking_mode: string }>('select booking_mode from public.businesses');
    expect(b?.booking_mode).toBe('rental');
  });

  it('genera slugs únicos', async () => {
    const other = new Session(pool, await createUser(pool, 'otro@test.cl'));
    const id = await createBusiness(other, 'Peluquería Ánimo');
    const [b] = await other.query<{ slug: string }>('select slug from public.businesses where id = $1', [id]);
    expect(b?.slug).toBe('peluqueria-animo-2');
  });

  it('un visitante anónimo no puede crear negocios', async () => {
    await expect(createBusiness(anon, 'Pirata')).rejects.toThrow(/permission denied/);
  });
});

describe('aislamiento entre negocios', () => {
  const tables = [
    'businesses',
    'branches',
    'branch_hours',
    'memberships',
    'services',
    'service_resource_requirements',
    'addons',
    'business_subscriptions',
    'business_entitlements',
    'audit_log',
  ];

  it.each(tables)('el negocio B no ve filas del negocio A en %s', async (table) => {
    const rowsA = await count(ownerA, table);
    expect(rowsA).toBeGreaterThan(0);
    const all = await pool.query(`select count(*)::int as n from public.${table}`);
    const rowsB = await count(ownerB, table);
    // B solo ve lo suyo: el total menos lo de A (y menos lo de otros negocios de prueba)
    expect(rowsB).toBeLessThan(all.rows[0].n);
  });

  it('B no ve ningún dato de A por id', async () => {
    expect(await count(ownerB, 'businesses', 'id = $1', [businessA])).toBe(0);
    expect(await count(ownerB, 'branches', 'business_id = $1', [businessA])).toBe(0);
    expect(await count(ownerB, 'services', 'business_id = $1', [businessA])).toBe(0);
    expect(await count(ownerB, 'audit_log', 'business_id = $1', [businessA])).toBe(0);
  });

  it('B no puede modificar ni borrar datos de A', async () => {
    const updated = await ownerB.query(`update public.services set price_clp = 1 where business_id = $1 returning id`, [
      businessA,
    ]);
    expect(updated).toHaveLength(0);
    const deleted = await ownerB.query(`delete from public.branches where id = $1 returning id`, [branchA]);
    expect(deleted).toHaveLength(0);
    expect(await count(ownerA, 'services', 'price_clp = 1')).toBe(0);
  });

  it('B no puede insertar datos en el negocio de A', async () => {
    await expect(
      ownerB.query(
        `insert into public.services (business_id, name, booking_mode, duration_minutes) values ($1, 'X', 'appointment', 30)`,
        [businessA],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      ownerB.query(`insert into public.memberships (user_id, business_id, role) values ($1, $2, 'owner')`, [
        ownerB.userId,
        businessA,
      ]),
    ).rejects.toThrow(/row-level security/);
  });

  it('B no puede agregarse al equipo de A', async () => {
    await expect(ownerB.query(`select public.app_add_member($1, 'dueno.b@test.cl', 'admin')`, [businessA])).rejects.toThrow(
      /No tienes permiso/,
    );
  });

  it('A no puede mezclar su recurso con una sucursal de B', async () => {
    await expect(
      ownerA.query(
        `insert into public.resources (business_id, branch_id, type, name) values ($1, $2, 'space', 'Sillón')`,
        [businessA, branchB],
      ),
    ).rejects.toThrow(/row-level security/);
    const [addon] = await ownerA.query<{ id: string }>('select id from public.addons limit 1');
    await expect(
      ownerA.query(`insert into public.addon_stock (addon_id, branch_id, quantity) values ($1, $2, 5)`, [addon!.id, branchB]),
    ).rejects.toThrow(/row-level security/);
  });

  it('un visitante anónimo no ve datos de negocios, pero sí los catálogos globales', async () => {
    for (const table of ['businesses', 'branches', 'services', 'memberships', 'profiles', 'audit_log']) {
      expect(await count(anon, table)).toBe(0);
    }
    expect(await count(anon, 'industry_templates')).toBeGreaterThan(0);
    expect(await count(anon, 'holidays')).toBeGreaterThan(0);
  });
});

describe('roles dentro del negocio', () => {
  it('la recepcionista ve el catálogo pero no puede modificarlo', async () => {
    expect(await count(receptionistA, 'services')).toBe(4);
    const updated = await receptionistA.query(`update public.services set price_clp = 1 returning id`);
    expect(updated).toHaveLength(0);
    await expect(
      receptionistA.query(
        `insert into public.services (business_id, name, booking_mode, duration_minutes) values ($1, 'X', 'appointment', 30)`,
        [businessA],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('la recepcionista no ve la auditoría', async () => {
    expect(await count(receptionistA, 'audit_log')).toBe(0);
  });

  it('el branch_admin gestiona su sucursal pero no el negocio', async () => {
    const updated = await branchAdminA.query(`update public.branches set address = 'Nueva 123' where id = $1 returning id`, [
      branchA,
    ]);
    expect(updated).toHaveLength(1);
    const notBusiness = await branchAdminA.query(`update public.businesses set name = 'Otro' returning id`);
    expect(notBusiness).toHaveLength(0);
    const notService = await branchAdminA.query(`update public.services set price_clp = 1 returning id`);
    expect(notService).toHaveLength(0);
  });

  it('el branch_admin crea recursos en su sucursal', async () => {
    const rows = await branchAdminA.query(
      `insert into public.resources (business_id, branch_id, type, name) values ($1, $2, 'space', 'Sillón 1') returning id`,
      [businessA, branchA],
    );
    expect(rows).toHaveLength(1);
  });

  it('un admin no puede crear dueños ni degradar al dueño', async () => {
    await expect(adminA.query(`select public.app_add_member($1, 'recepcion.a@test.cl', 'owner')`, [businessA])).rejects.toThrow(
      /Solo un dueño/,
    );
    await expect(adminA.query(`select public.app_add_member($1, 'dueno.a@test.cl', 'admin')`, [businessA])).rejects.toThrow(
      /Solo un dueño/,
    );
    const removed = await adminA.query(`delete from public.memberships where role = 'owner' returning id`);
    expect(removed).toHaveLength(0);
  });

  it('el negocio nunca se queda sin dueño', async () => {
    await expect(
      ownerA.query(`delete from public.memberships where user_id = $1 and business_id = $2`, [ownerA.userId, businessA]),
    ).rejects.toThrow(/al menos un dueño/);
  });

  it('solo se puede sumar al equipo a personas con cuenta', async () => {
    await expect(ownerA.query(`select public.app_add_member($1, 'no.existe@test.cl', 'staff')`, [businessA])).rejects.toThrow(
      /No existe una cuenta/,
    );
  });
});

describe('perfiles', () => {
  it('cada uno ve su perfil y los de su equipo, no los de otros negocios', async () => {
    expect(await count(receptionistA, 'profiles', 'id = $1', [ownerA.userId])).toBe(1);
    expect(await count(ownerB, 'profiles', 'id = $1', [ownerA.userId])).toBe(0);
    const updated = await ownerB.query(`update public.profiles set full_name = 'X' where id = $1 returning id`, [
      ownerA.userId,
    ]);
    expect(updated).toHaveLength(0);
  });
});

describe('profesionales', () => {
  it('un profesional registrado por A no es visible para B', async () => {
    const [pro] = await ownerA.query<{ id: string }>(
      `insert into public.professionals (display_name, created_by_business_id) values ('Carla', $1) returning id`,
      [businessA],
    );
    await ownerA.query(
      `insert into public.resources (business_id, branch_id, type, name, professional_id) values ($1, $2, 'person', 'Carla', $3)`,
      [businessA, branchA, pro!.id],
    );
    expect(await count(ownerA, 'professionals', 'id = $1', [pro!.id])).toBe(1);
    expect(await count(ownerB, 'professionals', 'id = $1', [pro!.id])).toBe(0);
  });

  it('un recurso persona exige profesional', async () => {
    await expect(
      ownerA.query(`insert into public.resources (business_id, branch_id, type, name) values ($1, $2, 'person', 'Sin perfil')`, [
        businessA,
        branchA,
      ]),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('planes y derechos', () => {
  it('el plan base permite una sola sucursal', async () => {
    await expect(
      ownerA.query(`insert into public.branches (business_id, name) values ($1, 'Sucursal 2')`, [businessA]),
    ).rejects.toThrow(/límite de tu plan/);
  });

  it('el plan base permite hasta 10 recursos', async () => {
    const existing = await count(ownerA, 'resources');
    for (let i = existing; i < 10; i++) {
      await ownerA.query(`insert into public.resources (business_id, branch_id, type, name) values ($1, $2, 'space', $3)`, [
        businessA,
        branchA,
        `Box ${i}`,
      ]);
    }
    await expect(
      ownerA.query(`insert into public.resources (business_id, branch_id, type, name) values ($1, $2, 'space', 'Extra')`, [
        businessA,
        branchA,
      ]),
    ).rejects.toThrow(/límite de tu plan/);
  });

  it('el dueño no puede cambiarse los derechos ni el plan', async () => {
    await expect(
      ownerA.query(`update public.business_entitlements set limit_value = 99 where business_id = $1`, [businessA]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      ownerA.query(`update public.business_subscriptions set plan_code = 'base' where business_id = $1`, [businessA]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('auditoría', () => {
  it('registra quién cambió un precio, con valores antes y después', async () => {
    const [service] = await ownerA.query<{ id: string }>(`select id from public.services where name = 'Tinte'`);
    await ownerA.query(`update public.services set price_clp = 38000 where id = $1`, [service!.id]);
    const [log] = await ownerA.query<{ actor_user_id: string; old_price: number; new_price: number; action: string }>(
      `select actor_user_id, action, (old_data ->> 'price_clp')::int as old_price, (new_data ->> 'price_clp')::int as new_price
       from public.audit_log where table_name = 'services' and record_id = $1 and action = 'update'`,
      [service!.id],
    );
    expect(log).toEqual({ actor_user_id: ownerA.userId, action: 'update', old_price: 35000, new_price: 38000 });
  });

  it('nadie puede escribir ni borrar la auditoría desde la app', async () => {
    await expect(ownerA.query(`delete from public.audit_log`)).rejects.toThrow(/permission denied/);
    await expect(
      ownerA.query(`insert into public.audit_log (table_name, action) values ('x', 'insert')`),
    ).rejects.toThrow(/permission denied/);
  });
});
