/**
 * Consola · A2 (ADR 0009): la plataforma crea un plan con precio neto, un dueño lo elige al
 * registrarse y ve el total con IVA, la plataforma le cambia el plan, le da una función puntual
 * y lo suspende (panel en solo lectura, link público fuera de línea), y luego lo reactiva.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { anonymousPage, logIn, makePlatformAdmin, signUpAndConfirm, testUser } from './helpers';

const agent = testUser('planes');
const owner = testUser('suscriptor');
const stamp = Date.now();
const planCode = `plan_e2e_${stamp}`.slice(0, 30);
const planName = `Plan Prueba ${stamp}`;
let businessUrl = '';
let publicUrl = '';

async function session(browser: Browser, user: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago' })).newPage();
  await logIn(page, user);
  return page;
}

test.describe.serial('Consola: planes, cobro y suspensión', () => {
  test('la plataforma crea un plan con precio neto y funciones', async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await signUpAndConfirm(page, agent);
    await makePlatformAdmin(agent.email);
    await page.goto('/admin/planes/nuevo');
    const form = page.getByRole('form', { name: 'Plan' });
    await form.getByRole('textbox', { name: /^Código/ }).fill(planCode);
    await form.getByLabel('Nombre').fill(planName);
    await form.getByLabel('CLP', { exact: true }).fill('10000');
    await form.getByRole('checkbox', { name: 'Incluida' }).nth(0).check(); // Sucursales
    await form.getByLabel('Límite de Sucursales').fill('1');
    await form.getByRole('checkbox', { name: 'Incluida' }).nth(1).check(); // Recursos
    await form.getByLabel('Límite de Recursos').fill('5');
    await form.getByRole('button', { name: 'Crear plan' }).click();
    await expect(form.getByText(/Plan guardado/)).toBeVisible();
    await page.goto('/admin/planes');
    await expect(page.getByRole('link', { name: planName })).toBeVisible();
  });

  test('el dueño elige ese plan al crear su negocio y ve el total con IVA', async ({ page }) => {
    await signUpAndConfirm(page, owner);
    await page.getByLabel('Nombre del negocio').fill(`Negocio Plan ${stamp}`);
    await page.getByLabel('Rubro').selectOption('hair_salon');
    await page.getByRole('radio', { name: new RegExp(planName) }).check();
    await page.getByRole('button', { name: 'Crear negocio' }).click();
    await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);
    businessUrl = new URL(page.url()).pathname;
    await page.goto(`${businessUrl}/plan`);
    await expect(page.getByRole('heading', { name: planName })).toBeVisible();
    await expect(page.getByText('$11.900')).toBeVisible(); // 10.000 + IVA 19%
    await page.goto(`${businessUrl}/configuracion`);
    publicUrl = new URL((await page.getByRole('link', { name: /\/r\// }).getAttribute('href'))!).pathname;
  });

  test('la plataforma le da una función puntual y luego lo suspende', async ({ browser }) => {
    const page = await session(browser, agent);
    const businessId = businessUrl.split('/').pop()!;
    await page.goto(`/admin/negocios/${businessId}/plan`);
    await expect(page.getByRole('heading', { name: /Cobro de/ })).toBeVisible();

    const extra = page.getByRole('form', { name: 'Función puntual' });
    await extra.getByLabel('Función puntual').selectOption('commissions');
    await extra.getByLabel('Motivo').fill('Regalo de prueba');
    await extra.getByRole('button', { name: 'Aplicar función puntual' }).click();
    await expect(page.getByText('Función puntual aplicada.')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    const suspend = page.getByRole('form', { name: 'Suspender' });
    await suspend.getByLabel('Motivo').fill('Prueba de suspensión');
    await suspend.getByRole('button', { name: 'Suspender negocio' }).click();
    await expect(page.getByText(/Suspendido desde el/)).toBeVisible();
  });

  test('suspendido: el link público no aparece y el panel queda en solo lectura', async ({ browser }) => {
    const visitor = await anonymousPage(browser);
    const res = await visitor.goto(publicUrl);
    expect(res?.status()).toBe(404);

    const page = await session(browser, owner);
    await page.goto(`${businessUrl}/servicios`);
    await expect(page.getByText(/Tu negocio está suspendido/).first()).toBeVisible();
    await page.goto(`${businessUrl}/plan`);
    await expect(page.getByText(/Extra de la plataforma/)).toBeVisible();
  });

  test('al reactivar, el link público vuelve', async ({ browser }) => {
    const page = await session(browser, agent);
    const businessId = businessUrl.split('/').pop()!;
    await page.goto(`/admin/negocios/${businessId}/plan`);
    await page.getByRole('form', { name: 'Reactivar' }).getByRole('button', { name: 'Reactivar negocio' }).click();
    // Reactivado: vuelve a aparecer el formulario para suspender
    await expect(page.getByRole('form', { name: 'Suspender' })).toBeVisible();
    const visitor = await anonymousPage(browser);
    expect((await visitor.goto(publicUrl))?.status()).toBe(200);
  });
});
