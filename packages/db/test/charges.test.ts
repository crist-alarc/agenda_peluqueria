/**
 * Consola · A3b (ADR 0011): período de prueba, días de uso de sucursales, plazos y formas de pago,
 * cobros a mes vencido con estados, inmutabilidad de lo facturado y alertas de no pago.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, createUser, Session } from './db';

let pool: pg.Pool;
let drop: () => Promise<void>;
let platformOwner: Session;
let agent: Session;
let owner: Session;
let receptionist: Session;
let stranger: Session;
let business: string;
let trialBusiness: string;
let chargeId: string;

const MONTH = '2020-03'; // un mes ya cerrado (se cobra a mes vencido)

async function one<T extends pg.QueryResultRow>(s: Session, sql: string, params: unknown[] = []): Promise<T> {
  return (await s.query<T>(sql, params))[0]!;
}

const features = JSON.stringify([
  { feature: 'branches', enabled: true, limit: 5 },
  { feature: 'resources', enabled: true, limit: 10 },
]);

const lines = (net = 31000) =>
  JSON.stringify([
    { kind: 'plan', label: 'Emprende v1', from: `${MONTH}-01`, to: `${MONTH}-31`, days: 31, quantity: null, net },
    { kind: 'extra_branches', label: 'Sucursales adicionales', from: `${MONTH}-21`, to: `${MONTH}-31`, days: null, quantity: 11, net: 3300 },
  ]);

const periods = (id: string) =>
  pool
    .query<{ kind: string; starts_on: string; ends_on: string | null }>(
      `select kind, starts_on::text, ends_on::text from public.subscription_periods where business_id = $1 order by starts_on, created_at`,
      [id],
    )
    .then((r) => r.rows);
const today = async () => (await pool.query<{ d: string }>(`select app.platform_today()::text as d`)).rows[0]!.d;
const plusDays = async (n: number) => (await pool.query<{ d: string }>(`select (app.platform_today() + $1::int)::text as d`, [n])).rows[0]!.d;

beforeAll(async () => {
  const db = await createTestDatabase();
  drop = db.drop;
  pool = new pg.Pool({ connectionString: db.url });
  const ownerId = await createUser(pool, 'dueno@cobros.cl', 'Dueño Plataforma');
  const agentId = await createUser(pool, 'agente@cobros.cl', 'Agente');
  await pool.query(`insert into public.platform_admins (user_id, role) values ($1, 'owner'), ($2, 'agent')`, [ownerId, agentId]);
  platformOwner = new Session(pool, ownerId);
  agent = new Session(pool, agentId);
  owner = new Session(pool, await createUser(pool, 'duena@cobros.cl'));
  receptionist = new Session(pool, await createUser(pool, 'recepcion@cobros.cl'));
  stranger = new Session(pool, await createUser(pool, 'ajena@cobros.cl'));

  const save = (code: string, prices: object, included: number, extra: object, trial: number) =>
    platformOwner.query(`select public.app_admin_save_plan($1, $2, null, true, true, '{}', $3::jsonb, $4::jsonb, null, false, $5, $6::jsonb, $7)`, [
      code,
      `Plan ${code}`,
      features,
      JSON.stringify(prices),
      included,
      JSON.stringify(extra),
      trial,
    ]);
  await save('emprende', { CLP: 31000 }, 1, { CLP: 9300 }, 0);
  await save('prueba', { CLP: 20000 }, 1, {}, 14);

  business = (await one<{ id: string }>(owner, `select public.app_create_business('Peluquería Cobros', 'hair_salon', 'Centro', null, null, 'America/Santiago', 'emprende') as id`)).id;
  trialBusiness = (await one<{ id: string }>(owner, `select public.app_create_business('Negocio en prueba', 'hair_salon', 'Centro', null, null, 'America/Santiago', 'prueba') as id`)).id;
  await owner.query(`select public.app_add_member($1, 'recepcion@cobros.cl', 'receptionist')`, [business]);
});

afterAll(async () => {
  await pool?.end();
  await drop?.();
});

describe('condiciones del plan', () => {
  it('la versión guarda sucursales incluidas, precio por sucursal adicional y días de prueba', async () => {
    const plans = (await one<{ p: { plans: Array<{ code: string; includedBranches: number; extraBranchNet: number | null; trialDays: number }> } }>(owner, `select public.app_public_plans('CL') as p`)).p.plans;
    expect(plans.find((p) => p.code === 'emprende')).toMatchObject({ includedBranches: 1, extraBranchNet: 9300, trialDays: 0 });
    expect(plans.find((p) => p.code === 'prueba')).toMatchObject({ trialDays: 14 });
  });
});

describe('todo plan incluye sucursales', () => {
  it('no se guarda un plan sin la función Sucursales, ni con un límite menor que las incluidas', async () => {
    const save = (f: object[], included: number) =>
      platformOwner.query(`select public.app_admin_save_plan('sin_sucursal', 'Sin sucursal', null, true, true, '{}', $1::jsonb, '{}'::jsonb, null, false, $2, '{}'::jsonb, 0)`, [
        JSON.stringify(f),
        included,
      ]);
    await expect(save([{ feature: 'resources', enabled: true, limit: 3 }], 1)).rejects.toThrow(/Sucursales/);
    await expect(save([{ feature: 'branches', enabled: false, limit: null }], 1)).rejects.toThrow(/Sucursales/);
    await expect(save([{ feature: 'branches', enabled: true, limit: 1 }], 2)).rejects.toThrow(/límite/);
    await save([{ feature: 'branches', enabled: true, limit: null }], 2);
  });
});

describe('período de prueba', () => {
  it('al crear el negocio: primero la prueba (sin cobro), después el plan', async () => {
    expect(await periods(trialBusiness)).toEqual([
      { kind: 'trial', starts_on: await today(), ends_on: await plusDays(13) },
      { kind: 'plan', starts_on: await plusDays(14), ends_on: null },
    ]);
  });

  it('un cambio de plan durante la prueba la termina hoy; el plan nuevo corre desde mañana', async () => {
    await platformOwner.query(`select public.app_admin_change_plan($1, 'emprende')`, [trialBusiness]);
    expect(await periods(trialBusiness)).toEqual([
      { kind: 'trial', starts_on: await today(), ends_on: await today() },
      { kind: 'plan', starts_on: await plusDays(1), ends_on: null },
    ]);
  });
});

describe('días de uso de las sucursales', () => {
  it('se registra al crear, al desactivar, al reactivar el mismo día y al borrar', async () => {
    const activity = (branch: string) =>
      pool
        .query<{ starts_on: string; ends_on: string | null }>(`select starts_on::text, ends_on::text from public.branch_activity where branch_id = $1 order by starts_on`, [branch])
        .then((r) => r.rows);
    const branch = (await one<{ id: string }>(owner, `insert into public.branches (business_id, name) values ($1, 'Segunda') returning id`, [business])).id;
    expect(await activity(branch)).toEqual([{ starts_on: await today(), ends_on: null }]);
    await owner.query(`update public.branches set active = false where id = $1`, [branch]);
    expect(await activity(branch)).toEqual([{ starts_on: await today(), ends_on: await today() }]);
    await owner.query(`update public.branches set active = true where id = $1`, [branch]);
    expect(await activity(branch)).toEqual([{ starts_on: await today(), ends_on: null }]);
    await owner.query(`delete from public.branches where id = $1`, [branch]);
    const kept = await pool.query(`select ends_on::text from public.branch_activity where business_id = $1 and branch_id is null`, [business]);
    expect(kept.rows).toEqual([{ ends_on: await today() }]);
  });

  it('nadie lee ni escribe el historial directo', async () => {
    expect(await owner.query(`select id from public.branch_activity`)).toEqual([]);
    await expect(owner.query(`delete from public.branch_activity`)).rejects.toThrow(/permission denied/);
  });
});

describe('plazos y formas de pago', () => {
  it('hay uno por defecto; se puede acordar otro por negocio', async () => {
    const opts = (await one<{ o: { terms: Array<{ id: string; days: number; isDefault: boolean }>; methods: Array<{ id: string; name: string }> } }>(agent, `select public.app_admin_payment_options() as o`)).o;
    expect(opts.terms.find((t) => t.isDefault)?.days).toBe(10);
    const thirty = opts.terms.find((t) => t.days === 30)!;
    await expect(agent.query(`select public.app_admin_set_business_payment($1, $2, null)`, [business, thirty.id])).rejects.toThrow(/Solo un administrador/);
    await platformOwner.query(`select public.app_admin_set_business_payment($1, $2, null)`, [business, thirty.id]);
    const pay = (await one<{ b: { payment: { termDays: number; termIsDefault: boolean; methodName: string } } }>(platformOwner, `select public.app_admin_business_billing($1) as b`, [business])).b.payment;
    expect(pay).toMatchObject({ termDays: 30, termIsDefault: false, methodName: 'Transferencia' });
  });

  it('siempre queda un plazo por defecto', async () => {
    const def = (await pool.query(`select id from public.payment_terms where is_default`)).rows[0];
    await expect(platformOwner.query(`select public.app_admin_save_payment_term($1, '10 días', 10, false, true)`, [def.id])).rejects.toThrow(/por defecto/);
    await platformOwner.query(`select public.app_admin_save_payment_term(null, '15 días', 15, true, true)`);
    expect((await pool.query(`select days from public.payment_terms where is_default`)).rows).toEqual([{ days: 15 }]);
  });
});

describe('cobros', () => {
  it('solo se cobra un mes ya cerrado; un agente no genera cobros', async () => {
    const current = (await pool.query(`select to_char(app.platform_today(), 'YYYY-MM') as m`)).rows[0].m;
    await expect(platformOwner.query(`select public.app_admin_save_charge($1, $2, $3::jsonb)`, [business, current, lines()])).rejects.toThrow(/mes vencido/);
    await expect(agent.query(`select public.app_admin_save_charge($1, $2, $3::jsonb)`, [business, MONTH, lines()])).rejects.toThrow(/Solo un administrador/);
  });

  it('genera el cobro por facturar con IVA; un total de 0 no genera cobro', async () => {
    chargeId = (await one<{ id: string }>(platformOwner, `select public.app_admin_save_charge($1, $2, $3::jsonb) as id`, [business, MONTH, lines()])).id;
    const c = await one<{ status: string; net: number; tax: number; gross: number }>(platformOwner, `select status, net, tax, gross from public.billing_charges where id = $1`, [chargeId]);
    // RLS: ni siquiera el administrador lee la tabla directo; se verifica con la función
    expect(c).toBeUndefined();
    const d = (await one<{ c: { status: string; net: number; tax: number; gross: number; lines: unknown[] } }>(platformOwner, `select public.app_admin_charge($1) as c`, [chargeId])).c;
    expect(d).toMatchObject({ status: 'pending', net: 34300, tax: 6517, gross: 40817 });
    expect(d.lines).toHaveLength(2);
    const zero = await one<{ id: string | null }>(platformOwner, `select public.app_admin_save_charge($1, '2020-02', '[]'::jsonb) as id`, [trialBusiness]);
    expect(zero.id).toBeNull();
  });

  it('los ajustes se conservan al regenerar; el total no puede quedar negativo', async () => {
    await platformOwner.query(`select public.app_admin_add_charge_adjustment($1, 'Descuento de bienvenida', -4300)`, [chargeId]);
    await platformOwner.query(`select public.app_admin_save_charge($1, $2, $3::jsonb)`, [business, MONTH, lines(32000)]);
    const d = (await one<{ c: { net: number; lines: Array<{ kind: string }> } }>(platformOwner, `select public.app_admin_charge($1) as c`, [chargeId])).c;
    expect(d.net).toBe(31000); // 32.000 + 3.300 − 4.300
    expect(d.lines.map((l) => l.kind)).toEqual(['plan', 'extra_branches', 'adjustment']);
    await expect(platformOwner.query(`select public.app_admin_add_charge_adjustment($1, 'Demasiado', -99999)`, [chargeId])).rejects.toThrow(/negativo/);
  });

  it('el dueño del negocio no ve un cobro por facturar', async () => {
    expect(await owner.query(`select id from public.billing_charges`)).toEqual([]);
    expect((await one<{ c: { charges: unknown[] } }>(owner, `select public.app_my_charges($1) as c`, [business])).c.charges).toEqual([]);
  });

  it('facturar exige datos de facturación y copia datos, plazo y forma de pago', async () => {
    await expect(platformOwner.query(`select public.app_admin_invoice_charge($1, '1001', '2020-04-02')`, [chargeId])).rejects.toThrow(/datos de facturación/);
    await owner.query(`select public.app_save_billing_profile($1, $2)`, [
      business,
      JSON.stringify({ documentType: 'factura', taxId: '76.086.428-5', legalName: 'Cobros SpA', activity: 'Peluquería', address: 'Calle 1', commune: 'Maipú', email: 'pagos@cobros.cl' }),
    ]);
    await platformOwner.query(`select public.app_admin_invoice_charge($1, '1001', '2020-04-02')`, [chargeId]);
    const d = (await one<{ c: { status: string; dueOn: string; paymentTermName: string; billTo: { legalName: string }; documentType: string } }>(platformOwner, `select public.app_admin_charge($1) as c`, [chargeId])).c;
    expect(d).toMatchObject({ status: 'invoiced', dueOn: '2020-05-02', paymentTermName: '30 días', documentType: 'factura' });
    expect(d.billTo.legalName).toBe('Cobros SpA');
  });

  it('lo facturado no se modifica, ni siquiera directo en la base', async () => {
    await expect(pool.query(`update public.billing_charges set net = 1 where id = $1`, [chargeId])).rejects.toThrow(/no se modifica/);
    await expect(pool.query(`delete from public.billing_charge_lines where charge_id = $1`, [chargeId])).rejects.toThrow(/no se modifica/);
    await expect(pool.query(`delete from public.billing_charges where id = $1`, [chargeId])).rejects.toThrow(/se anula/);
    await expect(platformOwner.query(`select public.app_admin_save_charge($1, $2, $3::jsonb)`, [business, MONTH, lines()])).rejects.toThrow(/ya está facturado/);
    await expect(platformOwner.query(`select public.app_admin_add_charge_adjustment($1, 'Tarde', 100)`, [chargeId])).rejects.toThrow(/por facturar/);
  });

  it('el dueño ve su cobro emitido; recepción y otros no', async () => {
    const mine = (await one<{ c: { charges: Array<{ folio: string; gross: number }> } }>(owner, `select public.app_my_charges($1) as c`, [business])).c.charges;
    expect(mine).toEqual([expect.objectContaining({ folio: '1001', gross: 36890 })]); // 31.000 + IVA 5.890
    expect(await receptionist.query(`select id from public.billing_charges`)).toEqual([]);
    expect(await stranger.query(`select id from public.billing_charge_lines`)).toEqual([]);
    await expect(receptionist.query(`select public.app_my_charges($1)`, [business])).rejects.toThrow(/No autorizado/);
    await expect(owner.query(`update public.billing_charges set status = 'paid'`)).rejects.toThrow(/permission denied/);
  });

  it('vencido: aparece en las alertas de la consola y en el aviso del dueño', async () => {
    const alerts = (await one<{ a: { overdue: Array<{ id: string; days: number }> } }>(agent, `select public.app_admin_billing_alerts() as a`)).a;
    expect(alerts.overdue.find((o) => o.id === chargeId)?.days).toBeGreaterThan(30);
    const mine = (await one<{ b: { overdue: { count: number; oldestDueOn: string } } }>(owner, `select public.app_business_billing($1) as b`, [business])).b;
    expect(mine.overdue).toEqual({ count: 1, oldestDueOn: '2020-05-02' });
    const rec = (await one<{ b: { overdue: unknown } }>(receptionist, `select public.app_business_billing($1) as b`, [business])).b;
    expect(rec.overdue).toBeNull();
  });

  it('pagado: con fecha y una forma de pago de la lista', async () => {
    await expect(platformOwner.query(`select public.app_admin_pay_charge($1, '2020-05-10', 'Trueque')`, [chargeId])).rejects.toThrow(/forma de pago/);
    await platformOwner.query(`select public.app_admin_pay_charge($1, '2020-05-10', 'Tarjeta', 'Pagó en dos partes')`, [chargeId]);
    const d = (await one<{ c: { status: string; paidMethod: string } }>(platformOwner, `select public.app_admin_charge($1) as c`, [chargeId])).c;
    expect(d).toMatchObject({ status: 'paid', paidMethod: 'Tarjeta' });
    const alerts = (await one<{ a: { overdue: Array<{ id: string }> } }>(agent, `select public.app_admin_billing_alerts() as a`)).a;
    expect(alerts.overdue.find((o) => o.id === chargeId)).toBeUndefined();
  });

  it('anular uno emitido exige la nota de crédito; después se puede volver a generar el mes', async () => {
    await expect(platformOwner.query(`select public.app_admin_void_charge($1, 'Error en el plan')`, [chargeId])).rejects.toThrow(/nota de crédito/);
    await platformOwner.query(`select public.app_admin_void_charge($1, 'Error en el plan', 'NC-55')`, [chargeId]);
    await expect(pool.query(`update public.billing_charges set notes = 'x' where id = $1`, [chargeId])).rejects.toThrow(/anulado/);
    const again = (await one<{ id: string }>(platformOwner, `select public.app_admin_save_charge($1, $2, $3::jsonb) as id`, [business, MONTH, lines()])).id;
    expect(again).not.toBe(chargeId);
    // Uno por facturar se anula sin nota de crédito
    await platformOwner.query(`select public.app_admin_void_charge($1, 'Se cobrará el próximo mes')`, [again]);
    const list = (await one<{ c: Array<{ status: string }> }>(agent, `select public.app_admin_charges($1) as c`, [MONTH])).c;
    expect(list.map((c) => c.status)).toEqual(['void', 'void']);
  });

  it('un folio no se repite', async () => {
    const id = (await one<{ id: string }>(platformOwner, `select public.app_admin_save_charge($1, $2, $3::jsonb) as id`, [business, MONTH, lines()])).id;
    await expect(platformOwner.query(`select public.app_admin_invoice_charge($1, '1001', '2020-04-03')`, [id])).rejects.toThrow(/folio ya está usado/);
  });

  it('los datos para calcular el mes traen tramos, condiciones y sucursales', async () => {
    const inputs = (await one<{ i: Array<{ businessId: string; periods: Array<{ kind: string; extraBranchNet: number; includedBranches: number }> | null; branches: unknown[] }> }>(platformOwner, `select public.app_admin_charge_inputs(to_char(app.platform_today() - interval '1 month', 'YYYY-MM')) as i`)).i;
    // Los negocios de esta prueba se crearon este mes: no tienen tramos el mes anterior
    expect(inputs.find((x) => x.businessId === business)).toBeUndefined();
    const now = (await one<{ i: Array<{ businessId: string; periods: Array<{ kind: string; extraBranchNet: number; includedBranches: number }> }> }>(platformOwner, `select public.app_admin_charge_inputs(to_char(app.platform_today(), 'YYYY-MM')) as i`)).i;
    expect(now.find((x) => x.businessId === business)?.periods[0]).toMatchObject({ kind: 'plan', extraBranchNet: 9300, includedBranches: 1 });
  });
});
