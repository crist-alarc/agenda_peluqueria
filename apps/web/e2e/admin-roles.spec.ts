/**
 * Consola · A3a (ADR 0010): un administrador propone un plan y el dueño de la plataforma lo aprueba;
 * un negocio nuevo ve el plazo para sus datos de facturación, se pausa si vence y vuelve al completarlos;
 * un plan free se asigna con autorización.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { logIn, makePlatformAdmin, setBillingGrace, signUpAndConfirm, testUser } from './helpers';

const platformOwner = testUser('dueno-plataforma');
const platformAdmin = testUser('admin-plataforma');
const owner = testUser('facturable');
const stamp = Date.now();
const planCode = `prop_${stamp}`.slice(0, 30);
const planName = `Propuesta ${stamp}`;
const freeCode = `free_${stamp}`.slice(0, 30);
const freeName = `Free ${stamp}`;
let businessUrl = '';

async function session(browser: Browser, user: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago' })).newPage();
  await logIn(page, user);
  return page;
}

test.describe.serial('Consola: roles, aprobaciones y datos de facturación', () => {
  test('un administrador propone un plan y queda por aprobar', async ({ browser }) => {
    const ownerPage = await (await browser.newContext()).newPage();
    await signUpAndConfirm(ownerPage, platformOwner);
    await makePlatformAdmin(platformOwner.email, 'owner');

    const page = await (await browser.newContext()).newPage();
    await signUpAndConfirm(page, platformAdmin);
    await makePlatformAdmin(platformAdmin.email, 'admin');
    await page.goto('/admin/planes/nuevo');
    const form = page.getByRole('form', { name: 'Plan' });
    await form.getByRole('textbox', { name: /^Código/ }).fill(planCode);
    await form.getByLabel('Nombre').fill(planName);
    await form.getByLabel('CLP').fill('12000');
    await form.getByRole('button', { name: 'Proponer plan' }).click();
    await expect(form.getByText(/Propuesta enviada/)).toBeVisible();
    await page.goto(`/admin/planes/${planCode}`);
    await expect(page.getByText(/espera la aprobación del dueño/)).toBeVisible();
  });

  test('el dueño de la plataforma lo aprueba y crea un plan free', async ({ browser }) => {
    const page = await session(browser, platformOwner);
    await page.goto('/admin/aprobaciones');
    const item = page.getByRole('listitem').filter({ hasText: planName });
    await expect(item.getByText('$12.000')).toBeVisible();
    await item.getByRole('button', { name: 'Aprobar' }).click();
    // Aprobada: sale de la bandeja (con ella, el mensaje) y el plan queda vigente
    await expect(item).toHaveCount(0);
    await page.goto(`/admin/planes/${planCode}`);
    await expect(page.getByText(/espera la aprobación/)).toHaveCount(0);
    await expect(page.getByText('Vigente', { exact: true })).toBeVisible();

    await page.goto('/admin/planes/nuevo');
    const form = page.getByRole('form', { name: 'Plan' });
    await form.getByRole('textbox', { name: /^Código/ }).fill(freeCode);
    await form.getByLabel('Nombre').fill(freeName);
    await form.getByRole('checkbox', { name: /Plan free/ }).check();
    await form.getByRole('button', { name: 'Crear plan' }).click();
    await expect(form.getByText(/Plan guardado/)).toBeVisible();
  });

  test('un negocio nuevo ve el plazo para sus datos de facturación', async ({ page }) => {
    await signUpAndConfirm(page, owner);
    await page.getByLabel('Nombre del negocio').fill(`Negocio Facturable ${stamp}`);
    await page.getByLabel('Rubro').selectOption('hair_salon');
    await page.getByRole('button', { name: 'Crear negocio' }).click();
    await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);
    businessUrl = new URL(page.url()).pathname;
    await expect(page.getByText(/Completa los datos de facturación antes del/)).toBeVisible();
  });

  test('si el plazo vence, el panel se pausa; al completar los datos, vuelve', async ({ browser }) => {
    await setBillingGrace(businessUrl.split('/').pop()!, '2020-01-31');
    const page = await session(browser, owner);
    await page.goto(`${businessUrl}/servicios`);
    await expect(page.getByRole('heading', { name: 'El panel está en pausa' })).toBeVisible();

    await page.getByRole('link', { name: 'Completar datos de facturación' }).click();
    const form = page.getByRole('form', { name: 'Datos de facturación' });
    await form.getByRole('radio', { name: /Factura/ }).first().check();
    await form.getByLabel('Razón social').fill('Peluquería Facturable SpA');
    await form.getByRole('textbox', { name: /^RUT/ }).fill('76.086.428-6');
    await form.getByLabel('Giro').fill('Peluquería');
    await form.getByLabel('Dirección').fill('Av. Siempre Viva 123');
    await form.getByLabel('Comuna').fill('Maipú');
    await form.getByLabel('Email para recibir los documentos').fill(owner.email);
    await form.getByRole('button', { name: 'Guardar datos de facturación' }).click();
    await expect(form.getByText(/RUT no es válido/)).toBeVisible();
    await form.getByRole('textbox', { name: /^RUT/ }).fill('76.086.428-5');
    await form.getByRole('button', { name: 'Guardar datos de facturación' }).click();
    await expect(form.getByText(/Datos de facturación guardados/)).toBeVisible();

    await page.goto(`${businessUrl}/servicios`);
    await expect(page.getByRole('heading', { name: 'El panel está en pausa' })).toHaveCount(0);
    await expect(page.getByText(/Completa los datos de facturación/)).toHaveCount(0);
  });

  test('un administrador autoriza un plan free para ese negocio', async ({ browser }) => {
    const page = await session(browser, platformAdmin);
    await page.goto(`/admin/negocios/${businessUrl.split('/').pop()}/plan`);
    await expect(page.getByText('76.086.428-5')).toBeVisible();
    const form = page.getByRole('form', { name: 'Plan free' });
    await form.getByLabel('Plan free').selectOption(freeCode);
    await form.getByLabel('Motivo').fill('Piloto de prueba');
    await form.getByRole('button', { name: 'Autorizar plan free' }).click();
    await expect(page.getByText(/sin fecha de término\. Autorizado por/)).toBeVisible();
  });
});
