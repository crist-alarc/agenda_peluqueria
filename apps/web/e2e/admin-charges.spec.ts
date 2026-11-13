/**
 * Consola · A3b (ADR 0011): la plataforma genera el cobro de un mes vencido, lo factura con el folio
 * del SII, el cobro vence y aparece en las alertas y en el panel del dueño, y luego se registra el pago.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { backdateBilling, logIn, makePlatformAdmin, signUpAndConfirm, testUser } from './helpers';

const platform = testUser('cobrador');
const owner = testUser('cliente-cobro');
const stamp = Date.now();
const planCode = `cobro_${stamp}`.slice(0, 30);
const planName = `Plan Cobro ${stamp}`;
const businessName = `Negocio Cobro ${stamp}`;
const MONTH = '2020-03';
let businessUrl = '';
let chargeUrl = '';

async function session(browser: Browser, user: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago' })).newPage();
  await logIn(page, user);
  return page;
}

test.describe.serial('Consola: cobros mensuales', () => {
  test('la plataforma crea un plan con precio y sucursal adicional', async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await signUpAndConfirm(page, platform);
    await makePlatformAdmin(platform.email, 'owner');
    await page.goto('/admin/planes/nuevo');
    const form = page.getByRole('form', { name: 'Plan' });
    await form.getByRole('textbox', { name: /^Código/ }).fill(planCode);
    await form.getByLabel('Nombre').fill(planName);
    await form.getByRole('textbox', { name: /^CLP/ }).fill('10000');
    await form.getByLabel(/Sucursal adicional al mes, neto en CLP/).fill('3000');
    await form.getByRole('button', { name: 'Crear plan' }).click();
    await expect(form.getByText(/Plan guardado/)).toBeVisible();
  });

  test('un negocio contrata el plan y completa sus datos de facturación', async ({ page }) => {
    await signUpAndConfirm(page, owner);
    await page.getByLabel('Nombre del negocio').fill(businessName);
    await page.getByLabel('Rubro').selectOption('hair_salon');
    await page.getByRole('radio', { name: new RegExp(planName) }).check();
    await page.getByRole('button', { name: 'Crear negocio' }).click();
    await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);
    businessUrl = new URL(page.url()).pathname;
    await page.goto(`${businessUrl}/facturacion`);
    const form = page.getByRole('form', { name: 'Datos de facturación' });
    await form.getByLabel('Razón social').fill('Cliente Cobro SpA');
    await form.getByRole('textbox', { name: /^RUT/ }).fill('76.086.428-5');
    await form.getByLabel('Giro').fill('Peluquería');
    await form.getByLabel('Dirección').fill('Calle 1');
    await form.getByLabel('Comuna').fill('Maipú');
    await form.getByLabel('Email para recibir los documentos').fill(owner.email);
    await form.getByRole('button', { name: 'Guardar datos de facturación' }).click();
    await expect(form.getByText(/Datos de facturación guardados/)).toBeVisible();
    // Para probar un mes ya cerrado, el plan y la sucursal parten en enero de 2020
    await backdateBilling(businessUrl.split('/').pop()!, '2020-01-01');
  });

  test('la plataforma genera el cobro del mes y lo factura con el folio del SII', async ({ browser }) => {
    const page = await session(browser, platform);
    await page.goto(`/admin/cobros?mes=${MONTH}`);
    await page.getByRole('form', { name: 'Generar cobros' }).getByRole('button').click();
    const link = page.getByRole('link', { name: businessName });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(/\/admin\/cobros\/[0-9a-f-]{36}$/);
    chargeUrl = new URL(page.url()).pathname;
    await expect(page.getByText('$11.900')).toBeVisible(); // 10.000 + IVA 19%, una sola sucursal

    const invoice = page.getByRole('form', { name: 'Facturar' });
    await invoice.getByLabel('Folio del SII').fill(`${stamp}`.slice(-7));
    await invoice.getByRole('button', { name: 'Marcar como facturado' }).click();
    // Emitido hoy con plazo de 10 días: aún no vence
    await expect(page.getByText('Facturado', { exact: true })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Pago' })).toBeVisible();
  });

  test('el dueño ve su cobro en el panel', async ({ browser }) => {
    const page = await session(browser, owner);
    await page.goto(`${businessUrl}/plan`);
    await expect(page.getByRole('heading', { name: 'Tus cobros' })).toBeVisible();
    await expect(page.getByText(`folio ${`${stamp}`.slice(-7)}`)).toBeVisible();
  });

  test('la plataforma registra el pago y lo exporta a Excel', async ({ browser }) => {
    const page = await session(browser, platform);
    await page.goto(chargeUrl);
    const pay = page.getByRole('form', { name: 'Pago' });
    await pay.getByLabel('Forma de pago').selectOption('Tarjeta');
    await pay.getByRole('button', { name: 'Marcar como pagado' }).click();
    await expect(page.getByRole('form', { name: 'Pago' })).toHaveCount(0);
    await expect(page.getByText('Pagado', { exact: true }).first()).toBeVisible();

    const download = await page.request.get(`/admin/cobros/exportar?mes=${MONTH}`);
    expect(download.status()).toBe(200);
    expect(download.headers()['content-type']).toContain('spreadsheetml');
  });
});
