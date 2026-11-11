/**
 * Fase 2C: recordatorios, confirmación de asistencia y registro de envíos.
 */
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, Session } from './db';

let pool: pg.Pool;
let drop: () => Promise<void>;
let owner: Session;
let stranger: Session;
let server: Session;
let anon: Session;
let business: string;
let otherBusiness: string;
let branch: string;
let corte: string;
let person: string;

// Tres días hacia adelante: fuera del recordatorio de 24 h, dentro del de 168 h
const day = new Date(Date.now() + 3 * 86_400_000);
day.setUTCHours(14, 0, 0, 0);
const at = (min: number) => new Date(day.getTime() + min * 60_000).toISOString();
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

async function one<T extends pg.QueryResultRow>(s: Session, sql: string, params: unknown[] = []): Promise<T> {
  return (await s.query<T>(sql, params))[0]!;
}

let slot = 0;
async function booking(email: string | null = 'cliente@test.cl') {
  const start = (slot += 60);
  return (
    await one<{ id: string }>(server, `select public.app_create_booking($1, $2, $3, $4) as id`, [
      business,
      branch,
      JSON.stringify({ full_name: 'Cliente', phone: `+5691234${String(slot).padStart(4, '0')}`, email }),
      JSON.stringify([{ service_id: corte, starts_at: at(start), resource_ids: [person] }]),
    ])
  ).id;
}

async function settings(values: { reminder_enabled?: boolean; reminder_hours_before?: number; confirmation_cutoff_hours?: number }) {
  const sets = Object.keys(values).map((k, i) => `${k} = $${i + 2}`);
  await owner.query(`update public.businesses set ${sets.join(', ')} where id = $1`, [business, ...Object.values(values)]);
}

const candidates = async () =>
  (await one<{ c: Array<{ id: string }> }>(server, `select public.app_reminder_candidates() as c`)).c.map((b) => b.id);

async function log(bookingId: string) {
  return (
    await one<{ id: string }>(
      server,
      `insert into public.notification_log (business_id, booking_id, channel, kind, recipient, status, sent_at)
       values ($1, $2, 'email', 'reminder', 'cliente@test.cl', 'sent', now()) returning id`,
      [business, bookingId],
    )
  ).id;
}

async function token(bookingId: string, purpose: 'confirm' | 'cancel' | 'attend', notificationId: string | null = null) {
  const raw = randomBytes(32).toString('base64url');
  await server.query(`select public.app_create_booking_token($1, $2, $3, $4, $5)`, [
    bookingId,
    purpose,
    sha(raw),
    new Date(Date.now() + 86_400_000).toISOString(),
    notificationId,
  ]);
  return raw;
}

const use = async (raw: string) =>
  (await one<{ r: { result: string } }>(anon, `select public.app_use_booking_token($1) as r`, [sha(raw)])).r.result;

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });
  owner = new Session(pool, await createUser(pool, 'owner@test.cl'));
  stranger = new Session(pool, await createUser(pool, 'otro@test.cl'));
  server = new Session(pool, null, 'service_role');
  anon = new Session(pool, null);
  business = (await one<{ id: string }>(owner, `select public.app_create_business('Peluquería R', 'hair_salon', 'Centro') as id`)).id;
  otherBusiness = (await one<{ id: string }>(stranger, `select public.app_create_business('Otra', 'barbershop', 'Sur') as id`)).id;
  branch = (await one<{ id: string }>(owner, `select id from public.branches where business_id = $1`, [business])).id;
  corte = (await one<{ id: string }>(owner, `select id from public.services where business_id = $1 and name = 'Corte de pelo'`, [business])).id;
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

describe('configuración de recordatorios', () => {
  it('por defecto: activado, 24 h antes, corte 4 h', async () => {
    const b = await one(owner, `select reminder_enabled, reminder_hours_before, confirmation_cutoff_hours from public.businesses where id = $1`, [
      business,
    ]);
    expect(b).toEqual({ reminder_enabled: true, reminder_hours_before: 24, confirmation_cutoff_hours: 4 });
  });

  it('la hora de corte debe ser menor que las horas del recordatorio', async () => {
    await expect(settings({ reminder_hours_before: 4, confirmation_cutoff_hours: 4 })).rejects.toThrow(/businesses_cutoff_before_reminder/);
    await expect(settings({ reminder_hours_before: 200 })).rejects.toThrow(/check/);
  });

  it('solo el negocio cambia su configuración', async () => {
    const rows = await stranger.query(`update public.businesses set reminder_hours_before = 48 where id = $1 returning id`, [business]);
    expect(rows).toHaveLength(0);
  });
});

describe('selección de recordatorios', () => {
  it('respeta las horas configuradas, la activación y el email', async () => {
    const withEmail = await booking();
    const noEmail = await booking(null);
    expect(await candidates()).not.toContain(withEmail); // 3 días > 24 h

    await settings({ reminder_hours_before: 168 });
    const list = await candidates();
    expect(list).toContain(withEmail);
    expect(list).not.toContain(noEmail);

    await settings({ reminder_enabled: false });
    expect(await candidates()).not.toContain(withEmail);
    await settings({ reminder_enabled: true });
  });

  it('el recordatorio se marca una sola vez', async () => {
    const id = await booking();
    const claim = async () => (await one<{ ok: boolean }>(server, `select public.app_claim_reminder($1) as ok`, [id])).ok;
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
    expect(await candidates()).not.toContain(id);
  });

  it('las funciones del servidor no se pueden llamar desde el navegador', async () => {
    const id = await booking();
    for (const s of [owner, anon]) {
      await expect(s.query(`select public.app_reminder_candidates()`)).rejects.toThrow(/permission denied|No autorizado/);
      await expect(s.query(`select public.app_claim_reminder($1)`, [id])).rejects.toThrow(/permission denied|No autorizado/);
      await expect(s.query(`select public.app_booking_email_data($1)`, [id])).rejects.toThrow(/permission denied|No autorizado/);
    }
  });

  it('los datos para el email traen la configuración del negocio', async () => {
    const id = await booking();
    const d = (await one<{ d: Record<string, unknown> }>(server, `select public.app_booking_email_data($1) as d`, [id])).d;
    expect(d).toMatchObject({ brand: 'Peluquería R', customerEmail: 'cliente@test.cl', settings: { reminderHoursBefore: 168 } });
  });
});

describe('confirmar asistencia', () => {
  it('el botón "Confirmo asistencia" funciona una vez y registra el clic', async () => {
    const id = await booking();
    const notification = await log(id);
    const raw = await token(id, 'attend', notification);
    expect(await use(raw)).toBe('attending');
    expect(await use(raw)).toBe('already_attending');
    const b = await one<{ attendance_confirmed_at: string | null }>(owner, `select attendance_confirmed_at from public.bookings where id = $1`, [id]);
    expect(b.attendance_confirmed_at).not.toBeNull();
    const l = await one<{ clicked_at: string | null; clicked_action: string }>(
      owner,
      `select clicked_at, clicked_action from public.notification_log where id = $1`,
      [notification],
    );
    expect(l.clicked_at).not.toBeNull();
    expect(l.clicked_action).toBe('attend');
    expect(await candidates()).not.toContain(id);
  });

  it('una reserva cancelada no se puede confirmar', async () => {
    const id = await booking();
    await owner.query(`update public.bookings set status = 'cancelled' where id = $1`, [id]);
    expect(await use(await token(id, 'attend'))).toBe('cancelled');
  });

  it('confirmar una reserva pendiente dentro del plazo del recordatorio también confirma la asistencia', async () => {
    await owner.query(`update public.businesses set public_confirmation_mode = 'email' where id = $1`, [business]);
    const id = await booking();
    expect((await one<{ status: string }>(owner, `select status from public.bookings where id = $1`, [id])).status).toBe('pending');
    expect(await use(await token(id, 'confirm'))).toBe('confirmed');
    const b = await one<{ attendance_confirmed_at: string | null }>(owner, `select attendance_confirmed_at from public.bookings where id = $1`, [id]);
    expect(b.attendance_confirmed_at).not.toBeNull();

    // Fuera del plazo (24 h y la cita en 3 días) solo se confirma la reserva
    await settings({ reminder_hours_before: 24 });
    const later = await booking();
    expect(await use(await token(later, 'confirm'))).toBe('confirmed');
    const b2 = await one<{ attendance_confirmed_at: string | null }>(owner, `select attendance_confirmed_at from public.bookings where id = $1`, [later]);
    expect(b2.attendance_confirmed_at).toBeNull();
    await owner.query(`update public.businesses set public_confirmation_mode = 'auto', reminder_hours_before = 168 where id = $1`, [business]);
  });

  it('recepción puede marcar la asistencia, pero no el envío del recordatorio', async () => {
    const id = await booking();
    await owner.query(`update public.bookings set attendance_confirmed_at = now() where id = $1`, [id]);
    await expect(owner.query(`update public.bookings set reminder_sent_at = now() where id = $1`, [id])).rejects.toThrow(/permission denied/);
    const rows = await stranger.query(`update public.bookings set attendance_confirmed_at = now() where id = $1 returning id`, [id]);
    expect(rows).toHaveLength(0);
  });
});

describe('registro de envíos', () => {
  it('lo ve solo el negocio; nadie lo escribe desde el navegador', async () => {
    const id = await booking();
    const notification = await log(id);
    expect(await owner.query(`select id from public.notification_log where id = $1`, [notification])).toHaveLength(1);
    expect(await stranger.query(`select id from public.notification_log where id = $1`, [notification])).toHaveLength(0);
    await expect(anon.query(`select id from public.notification_log`)).rejects.toThrow(/permission denied/);
    await expect(
      owner.query(`insert into public.notification_log (business_id, channel, kind, recipient) values ($1, 'email', 'reminder', 'x@y.cl')`, [
        business,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(owner.query(`update public.notification_log set clicked_at = now() where id = $1`, [notification])).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      stranger.query(`insert into public.notification_log (business_id, channel, kind, recipient) values ($1, 'email', 'reminder', 'x@y.cl')`, [
        otherBusiness,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it('solo el servidor crea enlaces, también los de asistencia', async () => {
    const id = await booking();
    await expect(
      owner.query(`select public.app_create_booking_token($1, 'attend', $2, now() + interval '1 day', null)`, [id, sha('x')]),
    ).rejects.toThrow(/permission denied|No autorizado/);
  });
});

describe('tarea programada', () => {
  it('sin URL configurada solo libera reservas pendientes vencidas', async () => {
    await pool.query(`select app.run_scheduled_tasks()`);
    await expect(owner.query(`select app.run_scheduled_tasks()`)).rejects.toThrow(/permission denied/);
  });
});
