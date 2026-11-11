/**
 * Fase 2D: reglas de comisión, reparto entre profesionales, ajustes y
 * liquidación cerrada exportable (Excel y PDF).
 */
import { expect, test, type Page } from '@playwright/test';
import { anonymousPage, enableFeature, logIn, signUpAndConfirm, testUser } from './helpers';

const owner = testUser('duena2d');
let businessUrl = '';
let businessId = '';
let publicUrl = '';

async function createPerson(page: Page, name: string) {
  await page.goto(`${businessUrl}/recursos`);
  const form = page.locator('form', { has: page.getByRole('button', { name: 'Crear recurso' }) });
  await form.getByLabel('Nombre').fill(name);
  await form.getByRole('button', { name: 'Crear recurso' }).click();
  await expect(page.getByText('Recurso creado')).toBeVisible();
}

async function addRule(page: Page, person: string, service: string, kind: 'percent' | 'fixed', value: string) {
  const form = page.getByRole('form', { name: 'Nueva regla' });
  await form.locator('select[name="professionalId"]').selectOption({ label: person });
  await form.locator('select[name="serviceId"]').selectOption({ label: service });
  await form.locator('select[name="kind"]').selectOption(kind);
  await form.locator('input[name="value"]').fill(value);
  await form.getByRole('button', { name: 'Guardar regla' }).click();
  await expect(page.getByText(/Regla guardada/)).toBeVisible();
}

test.describe.serial('Fase 2D: comisiones del equipo', () => {
  test('las comisiones dependen del plan; el dueño define reglas', async ({ page }) => {
    await signUpAndConfirm(page, owner);
    await page.getByLabel('Nombre del negocio').fill(`Peluquería Dos D ${Date.now()}`);
    await page.getByLabel('Rubro').selectOption('hair_salon');
    await page.getByRole('button', { name: 'Crear negocio' }).click();
    await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);
    businessUrl = new URL(page.url()).pathname;
    businessId = businessUrl.split('/').pop()!;
    await createPerson(page, 'Ana Díaz');
    await createPerson(page, 'Beto Soto');

    await page.goto(`${businessUrl}/comisiones`);
    await expect(page.getByText('Tu plan no incluye comisiones')).toBeVisible();
    await enableFeature(businessId, 'commissions');
    await page.reload();

    await addRule(page, 'Todo el equipo', 'Todos los servicios', 'percent', '40');
    await addRule(page, 'Ana Díaz', 'Corte de pelo', 'fixed', '5.000');
    const rules = page.getByRole('list', { name: 'Reglas de comisión' });
    await expect(rules.getByText(/Todo el equipo.*40%/)).toBeVisible();
    await expect(rules.getByText(/Ana Díaz.*Corte de pelo.*\$5\.000 fijo/)).toBeVisible();

    await page.goto(`${businessUrl}/configuracion`);
    publicUrl = new URL((await page.getByRole('link', { name: /\/r\// }).getAttribute('href'))!).pathname;
  });

  test('al completar una reserva se genera la comisión, y se puede repartir por minutos', async ({ browser, page }) => {
    const client = await anonymousPage(browser);
    await client.goto(publicUrl);
    await client.getByRole('button', { name: /Corte de pelo/ }).first().click();
    await client.getByRole('button', { name: 'Ana Díaz', exact: true }).click();
    const days = client.getByRole('group', { name: 'Día' }).getByRole('button');
    const hours = client.getByRole('group', { name: 'Hora' }).getByRole('button');
    for (let i = 1; i < 8; i++) {
      await days.nth(i).click();
      await expect(client.getByText('Buscando horarios…')).toHaveCount(0);
      if ((await hours.count()) > 0) break;
    }
    await hours.first().click();
    await client.getByLabel('Nombre').fill('Clara Cliente');
    await client.getByLabel('Teléfono').fill('9 7777 1111');
    await client.getByRole('button', { name: /Confirmar reserva/ }).click();
    await expect(client.getByText(/Te esperamos el/)).toBeVisible();

    await logIn(page, owner);
    await page.goto(`${businessUrl}/agenda`);
    let card = page.getByRole('article', { name: /Reserva de Clara Cliente/ });
    for (let i = 0; i < 8 && (await card.count()) === 0; i++) {
      await page.getByRole('link', { name: 'Día siguiente' }).click();
      await page.waitForLoadState('networkidle');
      card = page.getByRole('article', { name: /Reserva de Clara Cliente/ });
    }
    await card.getByRole('button', { name: 'Completar' }).click();
    await expect(card.getByText('Completada', { exact: true })).toBeVisible();

    await page.goto(`${businessUrl}/comisiones`);
    const pending = page.getByRole('list', { name: 'Movimientos pendientes' });
    await expect(pending.getByText('Ana Díaz · Corte de pelo')).toBeVisible();
    await expect(pending.getByText('$5.000')).toBeVisible();

    // Ana empezó, tuvo que irse; Beto terminó: 40 y 80 minutos
    await pending.getByRole('link', { name: 'Repartir' }).click();
    await page.getByLabel('Repartir por').selectOption('minutes');
    await page.getByLabel('Ana Díaz').fill('40');
    await page.getByLabel('Beto Soto').fill('80');
    await page.getByRole('button', { name: 'Guardar reparto' }).click();
    await expect(page.getByText('Reparto guardado y comisiones recalculadas')).toBeVisible();

    await page.goto(`${businessUrl}/comisiones`);
    // Ana: $5.000 fijo × 33,33% = $1.667 · Beto: 40% de $12.000 × 66,67% = $3.200
    await expect(pending.getByText('$1.667')).toBeVisible();
    await expect(pending.getByText('$3.200')).toBeVisible();
  });

  test('ajuste, liquidación cerrada y descargas', async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`${businessUrl}/comisiones`);
    const adjustment = page.locator('form', { has: page.getByRole('button', { name: 'Registrar ajuste' }) });
    await adjustment.locator('select[name="professionalId"]').selectOption({ label: 'Beto Soto' });
    await adjustment.locator('select[name="sign"]').selectOption('-');
    await adjustment.getByLabel('Monto ($)').fill('500');
    await adjustment.getByLabel('Motivo').fill('Corrección de prueba');
    await adjustment.getByRole('button', { name: 'Registrar ajuste' }).click();
    await expect(page.getByText(/Ajuste registrado/)).toBeVisible();

    const end = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Desde').fill('2026-01-01');
    await page.getByLabel('Hasta').fill(end);
    await page.getByRole('button', { name: 'Crear liquidación' }).click();
    await page.waitForURL(/\/comisiones\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Total: $4.367')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Comisiones de Beto Soto' }).getByText('$2.700')).toBeVisible();

    page.on('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Cerrar liquidación' }).click();
    await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Borrar borrador' })).toHaveCount(0);

    const base = new URL(page.url()).pathname;
    const pdf = await page.request.get(`${base}/pdf`);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
    const xlsx = await page.request.get(`${base}/excel`);
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe('PK');

    await page.getByRole('button', { name: 'Marcar como pagada' }).click();
    await expect(page.getByText('Pagada', { exact: true })).toBeVisible();

    await page.goto(`${businessUrl}/comisiones`);
    await expect(page.getByText('No hay movimientos pendientes.')).toBeVisible();
  });
});
