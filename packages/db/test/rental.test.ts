/**
 * Fase 3 · 3A: catálogo de arriendo (ADR 0007).
 * Zonas de despacho, fotos, precios ocultos, tope de camiones y reservas de arriendo
 * (servicios en paralelo y día completo).
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, Session } from './db';

let pool: pg.Pool;
let drop: () => Promise<void>;
let owner: Session; // dueño del negocio de inflables (hermano A)
let receptionist: Session;
let other: Session; // dueño de otro negocio (hermano B)
let anon: Session;
let business: string;
let otherBusiness: string;
let branch: string;
let castilloService: string;
let toroService: string;
let castillo1: string;
let castillo2: string;
let toro: string;
let operador: string;

async function one<T extends pg.QueryResultRow>(s: Session, sql: string, params: unknown[] = []): Promise<T> {
  return (await s.query<T>(sql, params))[0]!;
}

async function equipment(name: string, skill: string): Promise<string> {
  return (
    await one<{ id: string }>(
      owner,
      `insert into public.resources (business_id, branch_id, type, name, skills) values ($1, $2, 'equipment', $3, array[$4]) returning id`,
      [business, branch, name, skill],
    )
  ).id;
}

/** Hora local de Santiago a ISO, en una fecha futura fija (noviembre: UTC-3). */
const DAY = '2027-11-17';
const at = (hhmm: string, date = DAY) => `${date}T${hhmm}:00-03:00`;

async function book(items: Array<{ service: string; startsAt: string; resources: string[] }>) {
  return (
    await one<{ id: string }>(owner, `select public.app_create_booking($1, $2, $3, $4) as id`, [
      business,
      branch,
      JSON.stringify({ full_name: 'Cliente Cumpleaños', phone: `+5691${Math.floor(Math.random() * 1e7)}` }),
      JSON.stringify(items.map((i) => ({ service_id: i.service, starts_at: i.startsAt, resource_ids: i.resources }))),
    ])
  ).id;
}

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });
  owner = new Session(pool, await createUser(pool, 'hermano.a@test.cl'));
  receptionist = new Session(pool, await createUser(pool, 'recepcion.inflables@test.cl'));
  other = new Session(pool, await createUser(pool, 'hermano.b@test.cl'));
  anon = new Session(pool, null);

  business = (await one<{ id: string }>(owner, `select public.app_create_business('Inflables Padre Hurtado', 'inflatables', 'Bodega') as id`)).id;
  otherBusiness = (await one<{ id: string }>(other, `select public.app_create_business('Inflables Maipú', 'inflatables', 'Bodega') as id`)).id;
  await owner.query(`select public.app_add_member($1, 'recepcion.inflables@test.cl', 'receptionist')`, [business]);
  branch = (await one<{ id: string }>(owner, `select id from public.branches where business_id = $1`, [business])).id;
  castilloService = (await one<{ id: string }>(owner, `select id from public.services where business_id = $1 and full_day`, [business])).id;
  toroService = (await one<{ id: string }>(owner, `select id from public.services where business_id = $1 and not full_day`, [business])).id;

  castillo1 = await equipment('Castillo princesa 1', 'castillo');
  castillo2 = await equipment('Castillo princesa 2', 'castillo');
  toro = await equipment('Toro mecánico', 'toro');
  const pro = await one<{ id: string }>(owner, `insert into public.professionals (display_name, created_by_business_id) values ('Operador', $1) returning id`, [business]);
  operador = (
    await one<{ id: string }>(
      owner,
      `insert into public.resources (business_id, branch_id, type, name, skills, professional_id) values ($1, $2, 'person', 'Operador', array['operador'], $3) returning id`,
      [business, branch, pro.id],
    )
  ).id;
});

afterAll(async () => {
  await pool?.end();
  await drop?.();
});

describe('plantilla de inflables', () => {
  it('trae el castillo de día completo con su ficha y el toro de 3 horas con operador', async () => {
    const castillo = await one<{ full_day: boolean; details: Record<string, unknown> }>(
      owner,
      `select full_day, details from public.services where id = $1`,
      [castilloService],
    );
    expect(castillo.full_day).toBe(true);
    expect(castillo.details).toMatchObject({ capacity_kids: 10, needs_power: true });
    const req = await owner.query<{ resource_type: string; required_skill: string }>(
      `select resource_type, required_skill from public.service_resource_requirements where service_id = $1 order by resource_type`,
      [toroService],
    );
    expect(req).toEqual([
      { resource_type: 'person', required_skill: 'operador' },
      { resource_type: 'equipment', required_skill: 'toro' },
    ]);
  });
});

describe('zonas de despacho', () => {
  it('el dueño crea zonas libres; el otro negocio y los anónimos no las ven', async () => {
    await owner.query(`update public.branches set delivery_mode = 'by_zone' where id = $1`, [branch]);
    await owner.query(
      `insert into public.delivery_zones (business_id, branch_id, name, fee, position) values ($1, $2, 'Padre Hurtado', 0, 0), ($1, $2, 'Peñaflor', 5000, 1), ($1, $2, 'Talagante', 8000, 2)`,
      [business, branch],
    );
    expect((await owner.query(`select id from public.delivery_zones`)).length).toBe(3);
    expect(await other.query(`select id from public.delivery_zones`)).toEqual([]);
    expect(await anon.query(`select id from public.delivery_zones`)).toEqual([]);
  });

  it('no se repite el nombre de una zona en la misma sucursal', async () => {
    await expect(
      owner.query(`insert into public.delivery_zones (business_id, branch_id, name) values ($1, $2, ' peñaflor ')`, [business, branch]),
    ).rejects.toThrow(/duplicate|único|unique/i);
  });

  it('recepción las ve pero no las cambia; otro negocio no puede crear zonas en mi sucursal', async () => {
    expect((await receptionist.query(`select id from public.delivery_zones`)).length).toBe(3);
    await expect(
      receptionist.query(`insert into public.delivery_zones (business_id, branch_id, name) values ($1, $2, 'Calera')`, [business, branch]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      other.query(`insert into public.delivery_zones (business_id, branch_id, name) values ($1, $2, 'Calera')`, [otherBusiness, branch]),
    ).rejects.toThrow(/row-level security/);
    const updated = await receptionist.query(`update public.delivery_zones set fee = 1 returning id`);
    expect(updated).toEqual([]);
  });

  it('el modo de despacho solo acepta valores conocidos', async () => {
    await expect(owner.query(`update public.branches set delivery_mode = 'gratis' where id = $1`, [branch])).rejects.toThrow(/check/);
  });
});

describe('fotos del catálogo', () => {
  const path = (n: number, service = castilloService, biz = business) => `${biz}/${service}/foto-${n}.jpg`;

  it('el dueño registra fotos de sus servicios; nadie más las ve directamente', async () => {
    await owner.query(`insert into public.service_photos (business_id, service_id, path, position) values ($1, $2, $3, 0)`, [
      business,
      castilloService,
      path(1),
    ]);
    expect((await owner.query(`select id from public.service_photos`)).length).toBe(1);
    expect(await other.query(`select id from public.service_photos`)).toEqual([]);
    expect(await anon.query(`select id from public.service_photos`)).toEqual([]);
  });

  it('recepción y otros negocios no pueden subir fotos', async () => {
    await expect(
      receptionist.query(`insert into public.service_photos (business_id, service_id, path) values ($1, $2, $3)`, [business, castilloService, path(2)]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      other.query(`insert into public.service_photos (business_id, service_id, path) values ($1, $2, $3)`, [
        otherBusiness,
        castilloService,
        path(2, castilloService, otherBusiness),
      ]),
    ).rejects.toThrow(/no es de este negocio/);
  });

  it('la ruta debe corresponder al negocio y al servicio', async () => {
    await expect(
      owner.query(`insert into public.service_photos (business_id, service_id, path) values ($1, $2, $3)`, [business, castilloService, path(3, toroService)]),
    ).rejects.toThrow(/no corresponde/);
    await expect(
      owner.query(`insert into public.service_photos (business_id, service_id, path) values ($1, $2, '../otra/ruta.jpg')`, [business, castilloService]),
    ).rejects.toThrow(/check|no corresponde/);
  });

  it('máximo 6 fotos por servicio', async () => {
    for (let n = 2; n <= 6; n++) {
      await owner.query(`insert into public.service_photos (business_id, service_id, path, position) values ($1, $2, $3, $4)`, [
        business,
        castilloService,
        path(n),
        n,
      ]);
    }
    await expect(
      owner.query(`insert into public.service_photos (business_id, service_id, path) values ($1, $2, $3)`, [business, castilloService, path(7)]),
    ).rejects.toThrow(/hasta 6 fotos/);
  });
});

describe('link público', () => {
  type Pub = {
    showPrices: boolean;
    serviceFields: Array<{ key: string }>;
    services: Array<{ id: string; price: number | null; fullDay: boolean; photos: string[] }>;
    branches: Array<{ deliveryMode: string; zones: Array<{ name: string; fee: number | null }> }>;
  };
  const slug = async () => (await one<{ slug: string }>(owner, `select slug from public.businesses where id = $1`, [business])).slug;
  const pub = async () => (await one<{ b: Pub }>(anon, `select public.app_public_business($1) as b`, [await slug()])).b;

  it('entrega la ficha, las fotos, las zonas y los precios', async () => {
    const b = await pub();
    expect(b.showPrices).toBe(true);
    expect(b.serviceFields.map((f) => f.key)).toContain('capacity_kids');
    const castillo = b.services.find((s) => s.id === castilloService)!;
    expect(castillo).toMatchObject({ fullDay: true, price: 45000 });
    expect(castillo.photos).toHaveLength(6);
    expect(b.branches[0]).toMatchObject({ deliveryMode: 'by_zone' });
    expect(b.branches[0]!.zones.map((z) => [z.name, z.fee])).toEqual([
      ['Padre Hurtado', 0],
      ['Peñaflor', 5000],
      ['Talagante', 8000],
    ]);
  });

  it('con precios ocultos, la base no entrega ningún monto', async () => {
    await owner.query(`update public.businesses set show_public_prices = false where id = $1`, [business]);
    const b = await pub();
    expect(b.showPrices).toBe(false);
    expect(b.services.every((s) => s.price === null)).toBe(true);
    expect(b.branches[0]!.zones.every((z) => z.fee === null)).toBe(true);
    expect(JSON.stringify(b)).not.toContain('45000');
    await owner.query(`update public.businesses set show_public_prices = true where id = $1`, [business]);
  });
});

describe('tope de eventos de los camiones', () => {
  it('se guarda por recurso y está acotado', async () => {
    const camion = await one<{ id: string }>(
      owner,
      `insert into public.resources (business_id, branch_id, type, name, is_logistics, max_events_per_day) values ($1, $2, 'equipment', 'Camión 1', true, 6) returning id`,
      [business, branch],
    );
    expect((await one<{ max: number }>(owner, `select max_events_per_day as max from public.resources where id = $1`, [camion.id])).max).toBe(6);
    await expect(owner.query(`update public.resources set max_events_per_day = 0 where id = $1`, [camion.id])).rejects.toThrow(/check/);
  });
});

describe('reservas de arriendo', () => {
  type Alloc = { resource_id: string; lower: string; upper: string };
  const allocations = (bookingId: string) =>
    owner.query<Alloc>(
      `select resource_id, lower(tstzrange(starts_at, ends_at))::text as lower, upper(tstzrange(starts_at, ends_at))::text as upper
       from public.allocations where booking_id = $1 order by resource_id`,
      [bookingId],
    );
  const iso = (s: string) => new Date(s).toISOString();
  const allocOf = async (bookingId: string, resourceId: string) => {
    const a = (await allocations(bookingId)).find((x) => x.resource_id === resourceId)!;
    return { from: iso(a.lower), to: iso(a.upper) };
  };

  it('castillo + toro en el mismo evento: el castillo ocupa el día completo y el toro su bloque con traslado', async () => {
    const id = await book([
      { service: castilloService, startsAt: at('15:00'), resources: [castillo1] },
      { service: toroService, startsAt: at('15:00'), resources: [toro, operador] },
    ]);
    expect(await allocOf(id, castillo1)).toEqual({ from: iso(at('00:00')), to: iso(`2027-11-18T00:00:00-03:00`) });
    expect(await allocOf(id, toro)).toEqual({ from: iso(at('14:00')), to: iso(at('19:00')) });
    const b = await one<{ starts_at: Date; ends_at: Date; total: number }>(
      owner,
      `select starts_at, ends_at, total from public.bookings where id = $1`,
      [id],
    );
    expect(b.starts_at.toISOString()).toBe(iso(at('15:00')));
    expect(b.ends_at.toISOString()).toBe(iso('2027-11-18T00:00:00-03:00'));
    expect(b.total).toBe(45000 + 120000);
  });

  it('el mismo castillo no se puede arrendar otra vez ese día, a ninguna hora', async () => {
    await expect(book([{ service: castilloService, startsAt: at('10:00'), resources: [castillo1] }])).rejects.toThrow(
      /ya no está disponible/,
    );
    // El otro castillo igual sí
    await book([{ service: castilloService, startsAt: at('10:00'), resources: [castillo2] }]);
  });

  it('al día siguiente el castillo vuelve a estar libre', async () => {
    await book([{ service: castilloService, startsAt: at('16:00', '2027-11-18'), resources: [castillo1] }]);
  });

  it('el toro se puede arrendar dos veces el mismo día si no se cruzan sus bloques con traslado', async () => {
    await expect(book([{ service: toroService, startsAt: at('19:00'), resources: [toro, operador] }])).rejects.toThrow(
      /ya no está disponible/,
    );
    await book([{ service: toroService, startsAt: at('20:00'), resources: [toro, operador] }]);
  });

  it('en un arriendo todos los servicios empiezan a la hora del evento', async () => {
    await expect(
      book([
        { service: castilloService, startsAt: at('15:00', '2027-11-19'), resources: [castillo1] },
        { service: toroService, startsAt: at('18:00', '2027-11-19'), resources: [toro, operador] },
      ]),
    ).rejects.toThrow(/hora del evento/);
  });

  it('día completo en el inicio del horario de verano (5 de septiembre de 2027): 23 horas', async () => {
    const id = await book([{ service: castilloService, startsAt: '2027-09-05T15:00:00-03:00', resources: [castillo2] }]);
    const a = await allocOf(id, castillo2);
    expect((Date.parse(a.to) - Date.parse(a.from)) / 3_600_000).toBe(23);
  });
});
