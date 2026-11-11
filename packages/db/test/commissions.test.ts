/**
 * Fase 2D: comisiones del equipo y liquidaciones.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, Session } from './db';

let pool: pg.Pool;
let drop: () => Promise<void>;
let owner: Session;
let staff: Session;
let stranger: Session;
let server: Session;
let anon: Session;
let business: string;
let otherBusiness: string;
let branch: string;
let corte: string;
let ana: string; // profesional con cuenta (staff)
let beto: string; // profesional sin cuenta
let otherPro: string; // trabaja en otro negocio

const day = new Date(Date.now() - 5 * 86_400_000);
day.setUTCHours(14, 0, 0, 0);
const at = (min: number) => new Date(day.getTime() + min * 60_000).toISOString();

async function one<T extends pg.QueryResultRow>(s: Session, sql: string, params: unknown[] = []): Promise<T> {
  return (await s.query<T>(sql, params))[0]!;
}

async function person(name: string, userId: string | null, biz = business, br = branch) {
  const pro = (
    await pool.query<{ id: string }>(
      `insert into public.professionals (display_name, created_by_business_id, user_id) values ($1, $2, $3) returning id`,
      [name, biz, userId],
    )
  ).rows[0]!.id;
  await pool.query(`insert into public.resources (business_id, branch_id, type, name, professional_id) values ($1, $2, 'person', $3, $4)`, [
    biz,
    br,
    name,
    pro,
  ]);
  return pro;
}

let slot = 0;
/** Reserva completada (en el pasado, creada directo en la base como lo haría la historia). */
async function completedBooking() {
  slot += 60;
  const resource = (await pool.query<{ id: string }>(`select id from public.resources where professional_id = $1`, [ana])).rows[0]!.id;
  const { rows } = await pool.query<{ id: string; item: string }>(
    `with c as (insert into public.customers (business_id, full_name, phone) values ($1, 'Cliente', $2) returning id),
     b as (insert into public.bookings (business_id, branch_id, customer_id, channel, status, starts_at, ends_at, total_clp, visible_brand_business_id)
           select $1, $3, c.id, 'reception', 'confirmed', $4, $5, 20000, $1 from c returning id),
     i as (insert into public.booking_items (booking_id, business_id, owner_business_id, service_id, service_name, position, starts_at, ends_at, duration_minutes, price_clp)
           select b.id, $1, $1, $6, 'Corte de pelo', 0, $4, $5, 30, 20000 from b returning id, booking_id)
     select i.booking_id as id, i.id as item from i`,
    [business, `+5699${String(slot).padStart(7, '0')}`, branch, at(slot), at(slot + 30), corte],
  );
  const { id, item } = rows[0]!;
  await pool.query(
    `insert into public.allocations (booking_id, booking_item_id, business_id, resource_id, professional_id, starts_at, ends_at) values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, item, business, resource, ana, at(slot), at(slot + 30)],
  );
  await owner.query(`update public.bookings set status = 'completed' where id = $1`, [id]);
  return { id, item };
}

const lines = (item: string, amounts: Array<[string, number]>) =>
  JSON.stringify(
    amounts.map(([professionalId, amountClp]) => ({
      professionalId,
      bookingItemId: item,
      shareBp: Math.round(10000 / amounts.length),
      baseClp: 20000,
      addonBaseClp: 0,
      ruleId: null,
      ruleKind: 'percent',
      ruleValue: 4000,
      amountClp,
    })),
  );

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });
  const ownerId = await createUser(pool, 'owner@test.cl');
  const staffId = await createUser(pool, 'ana@test.cl');
  owner = new Session(pool, ownerId);
  staff = new Session(pool, staffId);
  stranger = new Session(pool, await createUser(pool, 'otro@test.cl'));
  server = new Session(pool, null, 'service_role');
  anon = new Session(pool, null);
  business = (await one<{ id: string }>(owner, `select public.app_create_business('Peluquería D', 'hair_salon', 'Centro') as id`)).id;
  otherBusiness = (await one<{ id: string }>(stranger, `select public.app_create_business('Otra', 'barbershop', 'Sur') as id`)).id;
  branch = (await one<{ id: string }>(owner, `select id from public.branches where business_id = $1`, [business])).id;
  const otherBranch = (await one<{ id: string }>(stranger, `select id from public.branches where business_id = $1`, [otherBusiness])).id;
  corte = (await one<{ id: string }>(owner, `select id from public.services where business_id = $1 and name = 'Corte de pelo'`, [business])).id;
  await pool.query(`insert into public.memberships (user_id, business_id, role) values ($1, $2, 'staff')`, [staffId, business]);
  ana = await person('Ana', staffId);
  beto = await person('Beto', null);
  otherPro = await person('Otro', null, otherBusiness, otherBranch);
});

afterAll(async () => {
  await pool?.end();
  await drop?.();
});

describe('plan y reglas', () => {
  it('el plan base no incluye comisiones; el completo sí', async () => {
    await expect(
      owner.query(`insert into public.commission_rules (business_id, kind, value) values ($1, 'percent', 4000)`, [business]),
    ).rejects.toThrow(/plan no incluye/);
    const plan = await pool.query<{ n: number }>(`select count(*)::int as n from public.plan_features where plan_code = 'completo' and enabled and limit_value is null`);
    expect(plan.rows[0]!.n).toBeGreaterThanOrEqual(9);
    await pool.query(`update public.business_entitlements set enabled = true where business_id = $1 and feature = 'commissions'`, [business]);
    await owner.query(`insert into public.commission_rules (business_id, kind, value) values ($1, 'percent', 4000)`, [business]);
  });

  it('una sola regla activa por persona y servicio; porcentaje máximo 100%', async () => {
    await expect(
      owner.query(`insert into public.commission_rules (business_id, kind, value) values ($1, 'fixed', 5000)`, [business]),
    ).rejects.toThrow(/commission_rules_unique_active/);
    await expect(
      owner.query(`insert into public.commission_rules (business_id, professional_id, kind, value) values ($1, $2, 'percent', 15000)`, [business, ana]),
    ).rejects.toThrow(/check/);
    await owner.query(`insert into public.commission_rules (business_id, professional_id, service_id, kind, value) values ($1, $2, $3, 'fixed', 8000)`, [
      business,
      ana,
      corte,
    ]);
  });

  it('no se puede usar una persona de otro negocio ni tocar reglas ajenas', async () => {
    await expect(
      owner.query(`insert into public.commission_rules (business_id, professional_id, kind, value) values ($1, $2, 'percent', 1000)`, [business, otherPro]),
    ).rejects.toThrow(/row-level security/);
    expect(await stranger.query(`select id from public.commission_rules where business_id = $1`, [business])).toHaveLength(0);
    expect(await stranger.query(`update public.commission_rules set value = 0 where business_id = $1 returning id`, [business])).toHaveLength(0);
    await expect(anon.query(`select id from public.commission_rules`)).rejects.toThrow(/permission denied/);
  });

  it('cada profesional ve solo sus reglas', async () => {
    const rows = await staff.query<{ professional_id: string | null }>(`select professional_id from public.commission_rules`);
    expect(rows.length).toBe(1);
    expect(rows[0]!.professional_id).toBe(ana);
  });
});

describe('reparto y receta', () => {
  it('la receta del servicio debe sumar 100%', async () => {
    await expect(
      owner.query(`select public.app_set_service_recipe($1, $2)`, [corte, JSON.stringify([{ label: 'Corte', shareBp: 7000 }, { label: 'Secado', shareBp: 2000 }])]),
    ).rejects.toThrow(/100%/);
    await owner.query(`select public.app_set_service_recipe($1, $2)`, [
      corte,
      JSON.stringify([{ label: 'Corte', shareBp: 7000 }, { label: 'Secado', shareBp: 3000, requiredSkill: 'secado' }]),
    ]);
    expect(await staff.query(`select label from public.service_commission_roles where service_id = $1`, [corte])).toHaveLength(2);
    await expect(stranger.query(`select public.app_set_service_recipe($1, '[]')`, [corte])).rejects.toThrow(/No autorizado/);
  });

  it('el reparto manual suma 100% y solo con personas del negocio', async () => {
    const { item } = await completedBooking();
    const set = (s: Session, shares: unknown) => s.query(`select public.app_set_item_shares($1, $2)`, [item, JSON.stringify(shares)]);
    await expect(set(owner, [{ professionalId: ana, shareBp: 6000 }, { professionalId: beto, shareBp: 3000 }])).rejects.toThrow(/100%/);
    await expect(set(owner, [{ professionalId: ana, shareBp: 5000 }, { professionalId: otherPro, shareBp: 5000 }])).rejects.toThrow(
      /no trabaja en este negocio/,
    );
    await expect(set(staff, [{ professionalId: ana, shareBp: 10000 }])).rejects.toThrow(/No autorizado/);
    await set(owner, [{ professionalId: ana, shareBp: 3333, minutes: 40 }, { professionalId: beto, shareBp: 6667, minutes: 80 }]);
    expect(await owner.query(`select * from public.booking_item_shares where booking_item_id = $1`, [item])).toHaveLength(2);
    await expect(owner.query(`insert into public.booking_item_shares (booking_item_id, professional_id, business_id, share_bp) values ($1, $2, $3, 10000)`, [item, ana, business])).rejects.toThrow(/permission denied/);
  });
});

describe('movimientos y liquidaciones', () => {
  it('solo el servidor guarda comisiones, y solo de reservas completadas', async () => {
    const { id, item } = await completedBooking();
    await expect(owner.query(`select public.app_replace_booking_commissions($1, $2)`, [id, lines(item, [[ana, 8000]])])).rejects.toThrow(
      /permission denied|No autorizado/,
    );
    await expect(owner.query(`select public.app_booking_commission_data($1)`, [id])).rejects.toThrow(/permission denied|No autorizado/);
    const data = (await one<{ d: { enabled: boolean; items: Array<{ participants: Array<{ professionalId: string }>; recipe: unknown[] }> } }>(
      server,
      `select public.app_booking_commission_data($1) as d`,
      [id],
    )).d;
    expect(data.enabled).toBe(true);
    expect(data.items[0]!.participants.map((p) => p.professionalId)).toEqual([ana]);
    expect(data.items[0]!.recipe).toHaveLength(2);

    expect((await one<{ n: number }>(server, `select public.app_replace_booking_commissions($1, $2) as n`, [id, lines(item, [[ana, 8000]])])).n).toBe(1);
    // Recalcular reemplaza, no duplica
    await server.query(`select public.app_replace_booking_commissions($1, $2)`, [id, lines(item, [[ana, 5600], [beto, 6000]])]);
    expect(await owner.query(`select amount_clp from public.commission_entries where booking_id = $1 order by amount_clp`, [id])).toEqual([
      { amount_clp: 5600 },
      { amount_clp: 6000 },
    ]);
  });

  it('cada profesional ve solo sus movimientos; otros negocios nada', async () => {
    const mine = await staff.query<{ professional_id: string }>(`select professional_id from public.commission_entries`);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.professional_id === ana)).toBe(true);
    expect(await stranger.query(`select id from public.commission_entries`)).toHaveLength(0);
    await expect(owner.query(`update public.commission_entries set amount_clp = 1`)).rejects.toThrow(/permission denied/);
  });

  it('una liquidación cerrada no cambia; las correcciones son ajustes que van a la siguiente', async () => {
    const { id, item } = await completedBooking();
    await server.query(`select public.app_replace_booking_commissions($1, $2)`, [id, lines(item, [[ana, 8000]])]);
    const today = new Date().toISOString().slice(0, 10);
    const s1 = (await one<{ id: string }>(owner, `select public.app_create_settlement($1, '2020-01-01', $2) as id`, [business, today])).id;
    const total = await one<{ total_clp: string; status: string }>(owner, `select total_clp, status from public.settlements where id = $1`, [s1]);
    expect(total.status).toBe('draft');
    expect(Number(total.total_clp)).toBe(5600 + 6000 + 8000);

    // En borrador todavía se puede recalcular (sigue en la misma liquidación)
    await server.query(`select public.app_replace_booking_commissions($1, $2)`, [id, lines(item, [[ana, 9000]])]);
    expect(Number((await one<{ total_clp: string }>(owner, `select total_clp from public.settlements where id = $1`, [s1])).total_clp)).toBe(20600);

    await owner.query(`select public.app_set_settlement_status($1, 'closed')`, [s1]);
    await expect(server.query(`select public.app_replace_booking_commissions($1, $2)`, [id, lines(item, [[ana, 1]])])).rejects.toThrow(
      /liquidación cerrada/,
    );
    await expect(owner.query(`select public.app_set_item_shares($1, '[]')`, [item])).rejects.toThrow(/liquidación cerrada/);
    await expect(owner.query(`select public.app_set_settlement_status($1, 'deleted')`, [s1])).rejects.toThrow(/No se puede/);
    // Ni siquiera la clave de servicio puede cambiar un movimiento cerrado
    await expect(server.query(`update public.commission_entries set amount_clp = 1 where settlement_id = $1`, [s1])).rejects.toThrow(
      /liquidación cerrada/,
    );
    await expect(server.query(`update public.settlements set total_clp = 1 where id = $1`, [s1])).rejects.toThrow(/no se modifica/);

    await expect(owner.query(`select public.app_add_commission_adjustment($1, $2, -1000, '')`, [business, ana])).rejects.toThrow(/check/);
    await expect(owner.query(`select public.app_add_commission_adjustment($1, $2, 500, 'Bono')`, [business, otherPro])).rejects.toThrow(
      /no trabaja/,
    );
    await expect(staff.query(`select public.app_add_commission_adjustment($1, $2, 500, 'Bono')`, [business, ana])).rejects.toThrow(
      /No autorizado/,
    );
    await owner.query(`select public.app_add_commission_adjustment($1, $2, -1000, 'Corrección de la tintura del día 3')`, [business, ana]);
    const s2 = (await one<{ id: string }>(owner, `select public.app_create_settlement($1, $2, $2) as id`, [business, today])).id;
    expect(Number((await one<{ total_clp: string }>(owner, `select total_clp from public.settlements where id = $1`, [s2])).total_clp)).toBe(-1000);

    await owner.query(`select public.app_set_settlement_status($1, 'paid')`, [s1]);
    expect((await one<{ status: string }>(owner, `select status from public.settlements where id = $1`, [s1])).status).toBe('paid');
    // El borrador se puede borrar y sus movimientos vuelven a quedar pendientes
    await owner.query(`select public.app_set_settlement_status($1, 'deleted')`, [s2]);
    expect(await owner.query(`select id from public.commission_entries where kind = 'adjustment' and settlement_id is null`)).toHaveLength(1);
  });

  it('las liquidaciones: solo el negocio las crea; el profesional ve las que lo incluyen', async () => {
    await expect(stranger.query(`select public.app_create_settlement($1, '2020-01-01', '2020-01-31')`, [business])).rejects.toThrow(/No autorizado/);
    await expect(staff.query(`select public.app_create_settlement($1, '2020-01-01', '2020-01-31')`, [business])).rejects.toThrow(/No autorizado/);
    expect((await staff.query(`select id from public.settlements`)).length).toBeGreaterThan(0);
    expect(await stranger.query(`select id from public.settlements where business_id = $1`, [business])).toHaveLength(0);
  });

  it('el servidor encuentra reservas completadas sin comisiones', async () => {
    const { id } = await completedBooking();
    const r = await one<{ ids: string[] }>(server, `select public.app_bookings_missing_commissions($1, now()) as ids`, [business]);
    expect(r.ids).toContain(id);
    await expect(owner.query(`select public.app_bookings_missing_commissions($1, now())`, [business])).rejects.toThrow(/permission denied|No autorizado/);
  });
});
