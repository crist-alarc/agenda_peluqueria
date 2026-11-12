/**
 * Consola de la plataforma · A1 (ADR 0008): el agente ve a sus clientes, pide
 * acceso de soporte, el dueño lo aprueba en su panel, el agente revisa la
 * configuración (solo lectura) y el dueño revoca el acceso.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { logIn, makePlatformAdmin, signUpAndConfirm, testUser } from './helpers';

const owner = testUser('cliente');
const agent = testUser('soporte');
const businessName = `Peluquería Cliente ${Date.now()}`;
let businessUrl = '';
const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ownerLink = () => new RegExp(escapeRe(owner.email));

async function session(browser: Browser, user: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago' })).newPage();
  await logIn(page, user);
  return page;
}

test.describe.serial('Consola de la plataforma: clientes y soporte', () => {
  test('preparación: un cliente con su negocio y un agente de soporte', async ({ page, browser }) => {
    await signUpAndConfirm(page, owner);
    await page.getByLabel('Nombre del negocio').fill(businessName);
    await page.getByLabel('Rubro').selectOption('hair_salon');
    await page.getByRole('button', { name: 'Crear negocio' }).click();
    await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);
    businessUrl = new URL(page.url()).pathname;

    const agentPage = await (await browser.newContext()).newPage();
    await signUpAndConfirm(agentPage, agent);
    await makePlatformAdmin(agent.email);
  });

  test('quien no es administrador no encuentra la consola', async ({ browser }) => {
    const page = await session(browser, owner);
    const res = await page.goto('/admin/clientes');
    expect(res?.status()).toBe(404);
  });

  test('el agente ve al cliente y pide acceso de soporte', async ({ browser }) => {
    const page = await session(browser, agent);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
    await page.getByLabel('Buscar cliente o negocio').fill(owner.email);
    await page.keyboard.press('Enter');
    await page.getByRole('link', { name: ownerLink() }).click();
    await expect(page.getByRole('heading', { name: businessName })).toBeVisible();

    const form = page.getByRole('form', { name: `Pedir acceso a ${businessName}` });
    await form.getByLabel('Para qué necesitas el acceso').fill('Revisar por qué no aparecen horarios el sábado');
    await form.getByLabel('Por cuánto tiempo').selectOption('4');
    await form.getByRole('button', { name: 'Pedir acceso' }).click();
    await expect(page.getByText('Esperando aprobación')).toBeVisible();
  });

  test('el dueño ve el aviso y aprueba el acceso por 1 hora', async ({ browser }) => {
    const page = await session(browser, owner);
    await page.goto(businessUrl);
    await expect(page.getByText('Soporte pide acceso para revisar tu configuración.')).toBeVisible();
    await page.getByRole('link', { name: 'Revisar solicitud' }).click();
    await expect(page.getByText('Revisar por qué no aparecen horarios el sábado')).toBeVisible();
    const form = page.getByRole('form', { name: 'Responder solicitud de soporte' });
    await form.getByLabel('Dar acceso por').selectOption('1');
    await form.getByRole('button', { name: 'Aprobar acceso' }).click();
    await expect(page.getByText('Acceso vigente')).toBeVisible();
  });

  test('el agente revisa la configuración en modo solo lectura', async ({ browser }) => {
    const page = await session(browser, agent);
    await page.goto('/admin/clientes');
    await page.getByRole('link', { name: ownerLink() }).click();
    await page.getByRole('link', { name: 'Ver configuración' }).click();
    await expect(page.getByText(/Solo lectura\./)).toBeVisible();
    await expect(page.getByRole('heading', { name: businessName })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Servicios' })).toBeVisible();
    await expect(page.locator('main form')).toHaveCount(0);
  });

  test('el dueño ve la visita registrada y revoca el acceso', async ({ browser }) => {
    const owners = await session(browser, owner);
    await owners.goto(`${businessUrl}/soporte`);
    await expect(owners.getByText('Cuándo revisó soporte tu configuración')).toBeVisible();
    owners.once('dialog', (d) => d.accept()); // confirmación del navegador
    await owners.getByRole('button', { name: 'Revocar acceso' }).click();
    // La tarjeta del acceso vigente desaparece y la solicitud pasa al historial como revocada
    await expect(owners.getByRole('button', { name: 'Revocar acceso' })).toHaveCount(0);
    await expect(owners.getByText('Acceso revocado', { exact: true })).toBeVisible();

    const agents = await session(browser, agent);
    const businessId = businessUrl.split('/').pop();
    await agents.goto(`/admin/negocios/${businessId}`);
    await expect(agents.getByRole('heading', { name: 'Sin acceso a este negocio' })).toBeVisible();
  });
});
