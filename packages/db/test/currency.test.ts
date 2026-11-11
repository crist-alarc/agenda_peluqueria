/**
 * Fase 3 · 3·0: país y moneda por negocio (ADR 0006).
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, Session } from './db';

let pool: pg.Pool;
let drop: () => Promise<void>;
let owner: Session;
let server: Session;
let anon: Session;
let business: string;
let branch: string;
let corte: string;
let person: string;

async function one<T extends pg.QueryResultRow>(s: Session, sql: string, params: unknown[] = []): Promise<T> {
  return (await s.query<T>(sql, params))[0]!;
}

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });
  owner = new Session(pool, await createUser(pool, 'owner@test.cl'));
  server = new Session(pool, null, 'service_role');
  anon = new Session(pool, null);
  business = (await one<{ id: string }>(owner, `select public.app_create_business('Peluquería M', 'hair_salon', 'Centro') as id`)).id;
  branch = (await one<{ id: string }>(owner, `select id from public.branches`)).id;
  corte = (await one<{ id: string }>(owner, `select id from public.services where name = 'Corte de pelo'`)).id;
  const pro = await one<{ id: string }>(owner, `insert into public.professionals (display_name, created_by_business_id) values ('Ana', $1) returning id`, [business]);
  person = (
    await one<{ id: string }>(
      owner,
      `insert into public.resources (business_id, branch_id, type, name, professional_id) values ($1, $2, 'person', 'Ana', $3) returning id`,
      [business, branch, pro.id],
    )
  ).id;
});

afterAll(async () => {
  await pool?.end();
  await drop?.();
});

describe('país y moneda', () => {
  it('un negocio nuevo parte en Chile y en pesos chilenos', async () => {
    const b = await one<{ country: string; currency: string }>(owner, `select country, currency from public.businesses where id = $1`, [business]);
    expect(b).toEqual({ country: 'CL', currency: 'CLP' });
  });

  it('solo acepta monedas habilitadas y códigos de país válidos', async () => {
    await expect(owner.query(`update public.businesses set currency = 'XYZ' where id = $1`, [business])).rejects.toThrow(/check/);
    await expect(owner.query(`update public.businesses set country = 'chile' where id = $1`, [business])).rejects.toThrow(/check/);
  });

  it('las plantillas usan la clave "price" (sin sufijo de moneda)', async () => {
    const s = await one<{ price: number }>(owner, `select price from public.services where id = $1`, [corte]);
    expect(s.price).toBeGreaterThan(0);
    const keys = await one<{ n: number }>(server, `select count(*)::int as n from public.industry_templates where config::text like '%price_clp%'`);
    expect(keys.n).toBe(0);
  });

  it('el link público y la reserva entregan la moneda del negocio', async () => {
    const slug = (await one<{ slug: string }>(owner, `select slug from public.businesses where id = $1`, [business])).slug;
    const pub = await one<{ b: { currency: string; services: Array<{ price: number }> } }>(anon, `select public.app_public_business($1) as b`, [slug]);
    expect(pub.b.currency).toBe('CLP');
    expect(pub.b.services[0]!.price).toBeGreaterThan(0);
  });

  it('no se puede cambiar la moneda cuando el negocio ya tiene reservas', async () => {
    // Sin reservas, volver a guardar la misma moneda está permitido (el formulario siempre la envía).
    await owner.query(`update public.businesses set currency = 'CLP', country = 'CL' where id = $1`, [business]);

    const start = new Date(Date.now() + 3 * 86_400_000);
    start.setUTCHours(14, 0, 0, 0);
    await server.query(`select public.app_create_booking($1, $2, $3, $4)`, [
      business,
      branch,
      JSON.stringify({ full_name: 'Cliente', phone: '+56911111111', email: null }),
      JSON.stringify([{ service_id: corte, starts_at: start.toISOString(), resource_ids: [person] }]),
    ]);
    const total = await one<{ total: number }>(owner, `select total from public.bookings where business_id = $1`, [business]);
    expect(total.total).toBeGreaterThan(0);

    // El guardia se prueba saltándose el check (que hoy solo admite CLP) para simular otra moneda.
    await pool.query(`alter table public.businesses drop constraint businesses_currency_check`);
    try {
      await expect(owner.query(`update public.businesses set currency = 'USD' where id = $1`, [business])).rejects.toThrow(
        /No se puede cambiar la moneda/,
      );
      await owner.query(`update public.businesses set currency = 'CLP' where id = $1`, [business]);
    } finally {
      await pool.query(`alter table public.businesses add constraint businesses_currency_check check (currency in ('CLP'))`);
    }
  });
});
