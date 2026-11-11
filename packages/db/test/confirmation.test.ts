/**
 * Fase 2B: reservas pendientes del link público confirmadas por email,
 * enlaces de un solo uso y portal del cliente.
 */
import { createHash, randomBytes } from 'node:crypto';
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

const day = new Date(Date.now() + 3 * 86_400_000);
day.setUTCHours(14, 0, 0, 0);
const at = (min: number) => new Date(day.getTime() + min * 60_000).toISOString();
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

async function one<T extends pg.QueryResultRow>(s: Session, sql: string, params: unknown[] = []): Promise<T> {
  return (await s.query<T>(sql, params))[0]!;
}

async function publicBooking(start: number, email: string | null, phone: string) {
  return (
    await one<{ id: string }>(server, `select public.app_create_booking($1, $2, $3, $4) as id`, [
      business,
      branch,
      JSON.stringify({ full_name: 'Cliente', phone, email }),
      JSON.stringify([{ service_id: corte, starts_at: at(start), resource_ids: [person] }]),
    ])
  ).id;
}

async function token(bookingId: string, purpose: 'confirm' | 'cancel', ttlMinutes = 30) {
  const raw = randomBytes(32).toString('base64url');
  await server.query(`select public.app_create_booking_token($1, $2, $3, $4)`, [
    bookingId,
    purpose,
    sha(raw),
    new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
  ]);
  return raw;
}

const use = async (raw: string) =>
  (await one<{ r: { result: string; booking?: { status: string } } }>(anon, `select public.app_use_booking_token($1) as r`, [sha(raw)])).r;

const status = async (id: string) => (await one<{ status: string }>(owner, `select status from public.bookings where id = $1`, [id])).status;

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });
  owner = new Session(pool, await createUser(pool, 'owner@test.cl'));
  server = new Session(pool, null, 'service_role');
  anon = new Session(pool, null);
  business = (await one<{ id: string }>(owner, `select public.app_create_business('Peluquería C', 'hair_salon', 'Centro') as id`)).id;
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

describe('modo automático (por defecto)', () => {
  it('la reserva del link público queda confirmada al instante', async () => {
    const id = await publicBooking(0, null, '+56900000001');
    expect(await status(id)).toBe('confirmed');
  });
});

describe('modo confirmación por email', () => {
  beforeAll(async () => {
    await owner.query(`update public.businesses set public_confirmation_mode = 'email', pending_hold_minutes = 30`);
  });

  it('exige email y deja la reserva pendiente con plazo', async () => {
    await expect(publicBooking(60, null, '+56900000002')).rejects.toThrow(/Ingresa tu email/);
    const id = await publicBooking(60, 'cliente@test.cl', '+56900000002');
    const b = await one<{ status: string; hold_expires_at: Date }>(owner, `select status, hold_expires_at from public.bookings where id = $1`, [id]);
    expect(b.status).toBe('pending');
    expect(b.hold_expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('la reserva pendiente aparta el horario', async () => {
    await expect(publicBooking(60, 'otro@test.cl', '+56900000003')).rejects.toThrow(/ya no está disponible/);
  });

  it('el botón del email confirma la reserva (una sola vez)', async () => {
    const id = await publicBooking(120, 'cliente@test.cl', '+56900000002');
    const raw = await token(id, 'confirm');
    expect((await use(raw)).result).toBe('confirmed');
    expect(await status(id)).toBe('confirmed');
    expect((await use(raw)).result).toBe('already_confirmed');
    const b = await one<{ hold_expires_at: Date | null; customer_confirmed_at: Date | null }>(
      owner,
      `select hold_expires_at, customer_confirmed_at from public.bookings where id = $1`,
      [id],
    );
    expect(b.hold_expires_at).toBeNull();
    expect(b.customer_confirmed_at).not.toBeNull();
  });

  it('el negocio también puede confirmar una pendiente', async () => {
    const id = await publicBooking(180, 'cliente@test.cl', '+56900000002');
    await owner.query(`update public.bookings set status = 'confirmed' where id = $1`, [id]);
    expect(await status(id)).toBe('confirmed');
  });

  it('si no se confirma a tiempo, el horario se libera solo', async () => {
    const id = await publicBooking(240, 'cliente@test.cl', '+56900000002');
    const raw = await token(id, 'confirm');
    await pool.query(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [id]);
    expect((await use(raw)).result).toBe('expired');
    expect(await status(id)).toBe('cancelled');
    // Otra persona puede tomar ese horario
    await expect(publicBooking(240, 'otro@test.cl', '+56900000004')).resolves.toBeTruthy();
  });

  it('tokens falsos o vencidos no sirven', async () => {
    expect((await use('no-existe')).result).toBe('invalid');
    const id = await publicBooking(300, 'cliente@test.cl', '+56900000002');
    const raw = await token(id, 'confirm', -1);
    expect((await use(raw)).result).toBe('invalid');
    expect(await status(id)).toBe('pending');
  });

  it('solo el servidor puede crear tokens y nadie lee la tabla', async () => {
    const id = await publicBooking(360, 'cliente@test.cl', '+56900000002');
    await expect(
      anon.query(`select public.app_create_booking_token($1, 'confirm', $2, now() + interval '1 hour')`, [id, sha('x')]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      owner.query(`select public.app_create_booking_token($1, 'confirm', $2, now() + interval '1 hour')`, [id, sha('y')]),
    ).rejects.toThrow(/permission denied/);
    await expect(owner.query(`select * from public.booking_tokens`)).rejects.toThrow(/permission denied/);
  });

  it('el enlace de cancelar respeta la política de aviso', async () => {
    const id = await publicBooking(420, 'cliente@test.cl', '+56900000002');
    const raw = await token(id, 'cancel');
    await owner.query(`update public.businesses set cancellation_hours = 168`);
    expect((await use(raw)).result).toBe('too_late');
    await owner.query(`update public.businesses set cancellation_hours = 4`);
    expect((await use(raw)).result).toBe('cancelled');
    expect(await status(id)).toBe('cancelled');
  });
});

describe('portal del cliente', () => {
  it('una cuenta con el email verificado ve sus reservas tras vincularlas', async () => {
    const client = new Session(pool, await createUser(pool, 'cliente@test.cl'));
    expect(await client.query(`select 1 from public.bookings`)).toHaveLength(0);
    const linked = await one<{ n: number }>(client, `select public.app_link_my_customers() as n`);
    expect(linked.n).toBe(1);
    const mine = await one<{ b: Array<{ businessName: string }> }>(client, `select public.app_my_bookings() as b`);
    expect(mine.b.length).toBeGreaterThan(0);
    expect(mine.b[0]!.businessName).toBe('Peluquería C');
  });

  it('nunca se vincula con un email sin verificar', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), 'otro@test.cl', null) returning id`,
    );
    const unverified = new Session(pool, rows[0]!.id);
    expect((await one<{ n: number }>(unverified, `select public.app_link_my_customers() as n`)).n).toBe(0);
    expect((await one<{ b: unknown[] }>(unverified, `select public.app_my_bookings() as b`)).b).toEqual([]);
  });

  it('el cliente cancela lo suyo según la política, y no lo de otros', async () => {
    const client = new Session(pool, (await pool.query<{ id: string }>(`select id from auth.users where email = 'cliente@test.cl'`)).rows[0]!.id);
    const mine = await one<{ b: Array<{ id: string; status: string }> }>(client, `select public.app_my_bookings() as b`);
    const target = mine.b.find((b) => b.status === 'confirmed' || b.status === 'pending')!;
    await client.query(`select public.app_customer_cancel_booking($1)`, [target.id]);
    expect(await status(target.id)).toBe('cancelled');

    const other = await publicBooking(480, 'tercero@test.cl', '+56900000009');
    await expect(client.query(`select public.app_customer_cancel_booking($1)`, [other])).rejects.toThrow(/no encontrada/);
    // Dentro del plazo de aviso no se puede cancelar en línea
    await owner.query(`update public.businesses set cancellation_hours = 168`);
    const late = mine.b.find((b) => b.id !== target.id && (b.status === 'confirmed' || b.status === 'pending'));
    if (late) {
      await expect(client.query(`select public.app_customer_cancel_booking($1)`, [late.id])).rejects.toThrow(/Ya no puedes cancelar/);
    }
    await owner.query(`update public.businesses set cancellation_hours = 4`);
  });
});
