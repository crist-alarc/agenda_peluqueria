/**
 * Fase 2B: confirmación con botón en el email, confirmación por el negocio
 * y portal "Mis reservas" del cliente.
 */
import { expect, test, type Page } from '@playwright/test';
import { anonymousPage, linkFromEmail, logIn, signUpAndConfirm, testUser } from './helpers';

const owner = testUser('duena2b');
const customerEmail = `cliente.${Date.now()}@test.cl`;
let businessUrl = '';
let publicUrl = '';

async function bookPublic(page: Page, name: string, phone: string, slotIndex: number) {
  await page.goto(publicUrl);
  await page.getByRole('button', { name: /Corte de pelo/ }).click();
  await page.getByRole('button', { name: 'Carla Rojas', exact: true }).click();
  const days = page.getByRole('group', { name: 'Día' }).getByRole('button');
  const hours = page.getByRole('group', { name: 'Hora' }).getByRole('button');
  for (let i = 1; i < 8; i++) {
    await days.nth(i).click();
    await expect(page.getByText('Buscando horarios…')).toHaveCount(0);
    if ((await hours.count()) > slotIndex) break;
  }
  await hours.nth(slotIndex).click();
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Teléfono').fill(phone);
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByRole('button', { name: /Confirmar reserva/ }).click();
}

test.describe.serial('Fase 2B: confirmación y portal del cliente', () => {
  test('el negocio activa la confirmación por email', async ({ page }) => {
    await signUpAndConfirm(page, owner);
    await page.getByLabel('Nombre del negocio').fill(`Peluquería Dos B ${Date.now()}`);
    await page.getByLabel('Rubro').selectOption('barbershop');
    await page.getByRole('button', { name: 'Crear negocio' }).click();
    await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);
    businessUrl = new URL(page.url()).pathname;

    await page.goto(`${businessUrl}/recursos`);
    const form = page.locator('form', { has: page.getByRole('button', { name: 'Crear recurso' }) });
    await form.getByLabel('Nombre').fill('Carla Rojas');
    await form.getByRole('button', { name: 'Crear recurso' }).click();
    await expect(page.getByText('Recurso creado')).toBeVisible();

    await page.goto(`${businessUrl}/configuracion`);
    publicUrl = new URL((await page.getByRole('link', { name: /\/r\// }).getAttribute('href'))!).pathname;
    const confirmation = page.locator('form', { has: page.locator('select[name="confirmationMode"]') });
    await confirmation.locator('select[name="confirmationMode"]').selectOption('email');
    await confirmation.getByRole('button', { name: 'Guardar' }).click();
    await expect(confirmation.getByText('Cambios guardados')).toBeVisible();
  });

  test('el cliente reserva y confirma con el botón del email', async ({ browser }) => {
    const page = await anonymousPage(browser);
    await bookPublic(page, 'Marta Cliente', '9 5555 1111', 0);
    await expect(page.getByText('Revisa tu email')).toBeVisible();

    const confirmUrl = await linkFromEmail(customerEmail, '/reserva/confirmar');
    await page.goto(confirmUrl);
    await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible();
    await page.goto(confirmUrl);
    await expect(page.getByRole('heading', { name: 'Tu reserva ya estaba confirmada' })).toBeVisible();
  });

  test('cancelar desde el email pide un segundo clic', async ({ browser }) => {
    const page = await anonymousPage(browser);
    const cancelUrl = await linkFromEmail(customerEmail, '/reserva/cancelar');
    await page.goto(cancelUrl);
    await expect(page.getByRole('heading', { name: '¿Cancelar tu reserva?' })).toBeVisible();
    await page.getByRole('button', { name: 'Sí, cancelar reserva' }).click();
    await expect(page.getByRole('heading', { name: 'Reserva cancelada' })).toBeVisible();
  });

  test('el negocio confirma una reserva pendiente desde la agenda', async ({ browser, page }) => {
    const client = await anonymousPage(browser);
    await bookPublic(client, 'Pedro Pendiente', '9 5555 2222', 1);
    await expect(client.getByText('Revisa tu email')).toBeVisible();

    await logIn(page, owner);
    await page.goto(`${businessUrl}/agenda`);
    // Buscar el día de la reserva avanzando día a día
    let card = page.getByRole('article', { name: /Reserva de Pedro Pendiente/ });
    for (let i = 0; i < 8 && (await card.count()) === 0; i++) {
      await page.getByRole('link', { name: 'Día siguiente' }).click();
      await page.waitForLoadState('networkidle');
      card = page.getByRole('article', { name: /Reserva de Pedro Pendiente/ });
    }
    await expect(card.getByText('Pendiente', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Confirmar' }).click();
    await expect(card.getByText('Confirmada', { exact: true })).toBeVisible();
  });

  test('con una cuenta del mismo email, el cliente ve y cancela sus reservas', async ({ browser }) => {
    const page = await (await browser.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago' })).newPage();
    await signUpAndConfirm(page, { name: 'Cliente Portal', email: customerEmail, password: 'clave-segura-9' });
    await page.goto('/mis-reservas');
    await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible();
    const cards = page.getByRole('article', { name: /Reserva en Peluquería Dos B/ });
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: 'Cancelada' })).toHaveCount(1);

    page.on('dialog', (d) => void d.accept());
    const active = cards.filter({ hasText: 'Confirmada' }).first();
    await active.getByRole('button', { name: 'Cancelar reserva' }).click();
    await expect(cards.filter({ hasText: 'Cancelada' })).toHaveCount(2);
  });
});
