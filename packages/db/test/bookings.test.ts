/**
 * Reservas (fase 2A): doble reserva imposible, atomicidad, permisos por rol,
 * privacidad entre negocios, stock de adicionales y transiciones de estado.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, Session } from './db';

let pool: pg.Pool;
let drop: () => Promise<void>;

let ownerA: Session;
let receptionA: Session;
let staffDiego: Session;
let ownerB: Session;
let anon: Session;
let server: Session;

let businessA: string;
let branchA: string;
let businessB: string;
let branchB: string;
let corte: string;
let carla: { resource: string; professional: string };
let diego: { resource: string; professional: string };
let toalla: string;

// Pasado mañana a las 14:00 UTC (11:00 en Santiago): siempre en el futuro
const day = new Date(Date.now() + 2 * 86_400_000);
day.setUTCHours(14, 0, 0, 0);
const at = (minutes: number) => new Date(day.getTime() + minutes * 60_000).toISOString();

async function one<T extends pg.QueryResultRow>(s: Session, sql: string, params: unknown[] = []): Promise<T> {
  return (await s.query<T>(sql, params))[0]!;
}

async function addPerson(s: Session, business: string, branch: string, name: string, skills: string[] = []) {
  const pro = await one<{ id: string }>(
    s,
    `insert into public.professionals (display_name, created_by_business_id) values ($1, $2) returning id`,
    [name, business],
  );
  const res = await one<{ id: string }>(
    s,
    `insert into public.resources (business_id, branch_id, type, name, professional_id, skills)
     values ($1, $2, 'person', $3, $4, $5) returning id`,
    [business, branch, name, pro.id, skills],
  );
  return { resource: res.id, professional: pro.id };
}

type BookOptions = { resources: string[]; start?: number; phone?: string; addons?: unknown[]; business?: string; branch?: string; service?: string };

function book(s: Session, o: BookOptions) {
  return one<{ id: string }>(
    s,
    `select public.app_create_booking($1, $2, $3, $4, $5) as id`,
    [
      o.business ?? businessA,
      o.branch ?? branchA,
      JSON.stringify({ full_name: 'Juan Pérez', phone: o.phone ?? '+56911111111', email: 'juan@test.cl' }),
      JSON.stringify([{ service_id: o.service ?? corte, starts_at: at(o.start ?? 0), resource_ids: o.resources }]),
      JSON.stringify(o.addons ?? []),
    ],
  );
}

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });

  ownerA = new Session(pool, await createUser(pool, 'a@test.cl', 'Dueña A'));
  receptionA = new Session(pool, await createUser(pool, 'recepcion@test.cl'));
  staffDiego = new Session(pool, await createUser(pool, 'diego@test.cl', 'Diego'));
  ownerB = new Session(pool, await createUser(pool, 'b@test.cl', 'Dueño B'));
  anon = new Session(pool, null);
  server = new Session(pool, null, 'service_role');

  businessA = (await one<{ id: string }>(ownerA, `select public.app_create_business('Peluquería A', 'hair_salon', 'Centro') as id`)).id;
  businessB = (await one<{ id: string }>(ownerB, `select public.app_create_business('Barbería B', 'barbershop', 'Sur') as id`)).id;
  branchA = (await one<{ id: string }>(ownerA, `select id from public.branches where business_id = $1`, [businessA])).id;
  branchB = (await one<{ id: string }>(ownerB, `select id from public.branches where business_id = $1`, [businessB])).id;
  corte = (await one<{ id: string }>(ownerA, `select id from public.services where business_id = $1 and name = 'Corte de pelo'`, [businessA])).id;
  toalla = (await one<{ id: string }>(ownerA, `select id from public.addons where business_id = $1`, [businessA])).id;

  carla = await addPerson(ownerA, businessA, branchA, 'Carla', ['colorimetria']);
  diego = await addPerson(ownerA, businessA, branchA, 'Diego');

  await ownerA.query(`select public.app_add_member($1, 'recepcion@test.cl', 'receptionist', array[$2]::uuid[])`, [businessA, branchA]);
  await ownerA.query(`select public.app_add_member($1, 'diego@test.cl', 'staff')`, [businessA]);
  await ownerA.query(`update public.professionals set user_id = $1 where id = $2`, [staffDiego.userId, diego.professional]);
});

afterAll(async () => {
  await pool?.end();
  await drop?.();
});

describe('crear reservas', () => {
  it('recepción crea una reserva con cliente nuevo, total en CLP y campos de trazabilidad', async () => {
    const { id } = await book(receptionA, { resources: [carla.resource] });
    const b = await one<Record<string, unknown>>(
      ownerA,
      `select channel, status, total_clp, created_by_user_id, sold_by_user_id, visible_brand_business_id, ends_at from public.bookings where id = $1`,
      [id],
    );
    expect(b).toMatchObject({
      channel: 'reception',
      status: 'confirmed',
      total_clp: 12000,
      created_by_user_id: receptionA.userId,
      sold_by_user_id: receptionA.userId,
      visible_brand_business_id: businessA,
    });
    expect((b.ends_at as Date).toISOString()).toBe(at(30));
    const item = await one(ownerA, `select owner_business_id, modality, partnership_id from public.booking_items where booking_id = $1`, [id]);
    expect(item).toEqual({ owner_business_id: businessA, modality: 'own', partnership_id: null });
  });

  it('NUNCA doble reserva: el mismo recurso no se puede reservar dos veces', async () => {
    const before = await one<{ n: number }>(ownerA, `select count(*)::int as n from public.bookings`);
    await expect(book(receptionA, { resources: [carla.resource], start: 15, phone: '+56922222222' })).rejects.toThrow(
      /ya no está disponible/,
    );
    // Atomicidad: no queda ni la reserva ni el cliente nuevo
    expect((await one<{ n: number }>(ownerA, `select count(*)::int as n from public.bookings`)).n).toBe(before.n);
    expect(await ownerA.query(`select id from public.customers where phone = '+56922222222'`)).toHaveLength(0);
  });

  it('NUNCA doble reserva de un espacio o equipo (sin profesional)', async () => {
    const sillon = await one<{ id: string }>(
      ownerA,
      `insert into public.resources (business_id, branch_id, type, name) values ($1, $2, 'space', 'Sillón 1') returning id`,
      [businessA, branchA],
    );
    await book(receptionA, { resources: [diego.resource, sillon.id], start: 60, phone: '+56912121212' });
    await expect(
      book(receptionA, { resources: [carla.resource, sillon.id], start: 75, phone: '+56913131313' }),
    ).rejects.toThrow(/ya no está disponible/);
  });

  it('con concurrencia, solo una de dos reservas simultáneas gana', async () => {
    const results = await Promise.allSettled([
      book(receptionA, { resources: [diego.resource], start: 120, phone: '+56933333333' }),
      book(receptionA, { resources: [diego.resource], start: 120, phone: '+56944444444' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('el profesional no puede estar en dos negocios a la vez', async () => {
    // Simula la fase 4: Carla también trabaja en el negocio B (vinculada por el sistema)
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.resources (business_id, branch_id, type, name, professional_id)
       values ($1, $2, 'person', 'Carla (B)', $3) returning id`,
      [businessB, branchB, carla.professional],
    );
    const serviceB = (await one<{ id: string }>(ownerB, `select id from public.services where business_id = $1 and name = 'Corte de pelo'`, [businessB])).id;
    await expect(
      book(ownerB, { business: businessB, branch: branchB, service: serviceB, resources: [rows[0]!.id], start: 10 }),
    ).rejects.toThrow(/ya no está disponible/);

    // B ve que Carla está ocupada, pero no en qué recurso ni con quién
    const ctx = await one<{ ctx: { busy: Array<{ resourceId: string | null; professionalId: string }> } }>(
      ownerB,
      `select public.app_booking_context($1, $2, $3, $4) as ctx`,
      [businessB, branchB, at(-60), at(600)],
    );
    const carlaBusy = ctx.ctx.busy.filter((b) => b.professionalId === carla.professional);
    expect(carlaBusy.length).toBeGreaterThan(0);
    expect(carlaBusy.every((b) => b.resourceId === null)).toBe(true);
  });

  it('exige que los recursos cubran los requisitos del servicio', async () => {
    const tinte = (await one<{ id: string }>(ownerA, `select id from public.services where business_id = $1 and name = 'Tinte'`, [businessA])).id;
    await expect(book(receptionA, { service: tinte, resources: [diego.resource], start: 300 })).rejects.toThrow(/Faltan recursos/);
  });

  it('no permite usar recursos de otro negocio', async () => {
    const pro = await addPerson(ownerB, businessB, branchB, 'Pedro');
    await expect(book(receptionA, { resources: [pro.resource], start: 360 })).rejects.toThrow(/Recurso no disponible/);
  });

  it('rechaza horarios pasados', async () => {
    await expect(
      receptionA.query(`select public.app_create_booking($1, $2, $3, $4)`, [
        businessA,
        branchA,
        JSON.stringify({ full_name: 'X', phone: '+56955555555' }),
        JSON.stringify([{ service_id: corte, starts_at: '2020-01-01T13:00:00Z', resource_ids: [diego.resource] }]),
      ]),
    ).rejects.toThrow(/ya pasó/);
  });
});

describe('link público', () => {
  it('un visitante no puede llamar directamente a la creación de reservas', async () => {
    await expect(book(anon, { resources: [diego.resource], start: 420 })).rejects.toThrow(/permission denied/);
  });

  it('el servidor de la app crea reservas del link público (canal public_link)', async () => {
    const { id } = await book(server, { resources: [diego.resource], start: 420, phone: '+56966666666' });
    const b = await one(ownerA, `select channel, created_by_user_id, sold_by_user_id from public.bookings where id = $1`, [id]);
    expect(b).toEqual({ channel: 'public_link', created_by_user_id: null, sold_by_user_id: null });
  });

  it('si el negocio desactiva su link público, no se aceptan reservas ni datos', async () => {
    await ownerA.query(`update public.businesses set public_booking_enabled = false where id = $1`, [businessA]);
    await expect(book(server, { resources: [diego.resource], start: 480 })).rejects.toThrow(/permiso/);
    await expect(
      anon.query(`select public.app_booking_context($1, $2, $3, $4)`, [businessA, branchA, at(0), at(600)]),
    ).rejects.toThrow(/no disponible/);
    expect((await one(anon, `select public.app_public_business('peluqueria-a') as b`)).b).toBeNull();
    await ownerA.query(`update public.businesses set public_booking_enabled = true where id = $1`, [businessA]);
  });

  it('los datos públicos no exponen información interna', async () => {
    const { b } = await one<{ b: Record<string, unknown> }>(anon, `select public.app_public_business('peluqueria-a') as b`);
    expect(b.name).toBe('Peluquería A');
    const text = JSON.stringify(b);
    expect(text).not.toContain(carla.professional);
    expect(text).not.toContain('juan@test.cl');
    expect(text).not.toContain('+569');
  });
});

describe('quién ve qué', () => {
  it('otro negocio no ve reservas, líneas, ocupaciones ni clientes', async () => {
    for (const table of ['bookings', 'booking_items', 'allocations', 'customers']) {
      expect(await ownerB.query(`select 1 from public.${table} where business_id = $1`, [businessA])).toHaveLength(0);
    }
  });

  it('un visitante no ve nada', async () => {
    for (const table of ['bookings', 'customers', 'allocations']) {
      expect(await anon.query(`select 1 from public.${table}`)).toHaveLength(0);
    }
  });

  it('el profesional (staff) ve solo su propia agenda', async () => {
    const mine = await staffDiego.query<{ id: string }>(
      `select distinct b.id from public.bookings b join public.allocations a on a.booking_id = b.id`,
    );
    const diegoBookings = await ownerA.query<{ id: string }>(
      `select distinct booking_id as id from public.allocations where resource_id = $1`,
      [diego.resource],
    );
    expect(mine.length).toBe(diegoBookings.length);
    expect(mine.length).toBeGreaterThan(0);
    const carlaBookings = await ownerA.query<{ id: string }>(`select booking_id as id from public.allocations where resource_id = $1`, [carla.resource]);
    expect(await staffDiego.query(`select 1 from public.bookings where id = $1`, [carlaBookings[0]!.id])).toHaveLength(0);
  });

  it('staff no puede crear reservas', async () => {
    await expect(book(staffDiego, { resources: [diego.resource], start: 540 })).rejects.toThrow(/permiso/);
  });
});

describe('estados y cancelación', () => {
  it('recepción cambia el estado; las transiciones inválidas se rechazan', async () => {
    const { id } = await book(receptionA, { resources: [carla.resource], start: 600, phone: '+56977777777' });
    await receptionA.query(`update public.bookings set status = 'checked_in' where id = $1`, [id]);
    await receptionA.query(`update public.bookings set status = 'completed' where id = $1`, [id]);
    await expect(receptionA.query(`update public.bookings set status = 'cancelled' where id = $1`, [id])).rejects.toThrow(
      /No se puede pasar/,
    );
    const log = await ownerA.query(`select 1 from public.audit_log where table_name = 'bookings' and record_id = $1 and action = 'update'`, [id]);
    expect(log.length).toBeGreaterThanOrEqual(2);
  });

  it('cancelar libera el horario para otra reserva', async () => {
    const { id } = await book(receptionA, { resources: [carla.resource], start: 660, phone: '+56988888888' });
    await expect(book(receptionA, { resources: [carla.resource], start: 660, phone: '+56999999999' })).rejects.toThrow();
    await receptionA.query(`update public.bookings set status = 'cancelled', cancel_reason = 'Avisó' where id = $1`, [id]);
    const b = await one<{ cancelled_at: Date | null }>(ownerA, `select cancelled_at from public.bookings where id = $1`, [id]);
    expect(b.cancelled_at).not.toBeNull();
    await expect(book(receptionA, { resources: [carla.resource], start: 660, phone: '+56999999999' })).resolves.toBeTruthy();
  });

  it('recepción no puede mover horarios ni montos directamente', async () => {
    const [b] = await receptionA.query<{ id: string }>(`select id from public.bookings limit 1`);
    await expect(receptionA.query(`update public.bookings set total_clp = 1 where id = $1`, [b!.id])).rejects.toThrow(
      /permission denied/,
    );
    await expect(receptionA.query(`delete from public.bookings where id = $1`, [b!.id])).rejects.toThrow(/permission denied/);
  });
});

describe('stock de adicionales', () => {
  it('no se reserva más stock del disponible en el mismo horario', async () => {
    await ownerA.query(`insert into public.addon_stock (addon_id, branch_id, quantity) values ($1, $2, 1)`, [toalla, branchA]);
    const addons = [{ addon_id: toalla, quantity: 1 }];
    const first = await book(receptionA, { resources: [carla.resource], start: 720, addons, phone: '+56910101010' });
    const total = await one<{ total_clp: number }>(ownerA, `select total_clp from public.bookings where id = $1`, [first.id]);
    expect(total.total_clp).toBe(12000 + 8000);
    await expect(book(receptionA, { resources: [diego.resource], start: 720, addons, phone: '+56920202020' })).rejects.toThrow(
      /No queda stock/,
    );
    await receptionA.query(`update public.bookings set status = 'cancelled' where id = $1`, [first.id]);
    await expect(book(receptionA, { resources: [diego.resource], start: 720, addons, phone: '+56920202020' })).resolves.toBeTruthy();
  });
});

describe('profesionales (corrección de seguridad)', () => {
  it('un negocio no puede vincular a un profesional de otro negocio', async () => {
    await expect(
      ownerB.query(
        `insert into public.resources (business_id, branch_id, type, name, professional_id) values ($1, $2, 'person', 'Robo', $3)`,
        [businessB, branchB, diego.professional],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('solo se vincula un profesional a una cuenta del equipo', async () => {
    await expect(
      ownerA.query(`update public.professionals set user_id = $1 where id = $2`, [ownerB.userId, carla.professional]),
    ).rejects.toThrow(/row-level security/);
  });
});
