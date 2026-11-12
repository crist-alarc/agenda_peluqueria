/**
 * Fase 3A: catálogo de arriendo. Un negocio de inflables configura juegos,
 * camión y zonas, oculta sus precios, y un cliente arrienda un castillo por el
 * día completo desde el link público. El mismo castillo no se puede arrendar
 * otra vez ese día y la agenda avisa cuando el camión está completo.
 */
import { expect, test, type Page } from '@playwright/test';
import { anonymousPage, logIn, signUpAndConfirm, testUser } from './helpers';

const owner = testUser('inflables');
let businessUrl = '';
let publicUrl = '';
let dayIndex = 0;
let dayLabel = '';

/** Fecha local de Santiago (YYYY-MM-DD) dentro de `days` días. */
const santiagoDate = (days: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(Date.now() + days * 86_400_000));

async function chooseCastle(page: Page) {
  await page.getByRole('button', { name: /Castillo inflable/ }).click();
}

test.describe.serial('Fase 3A: catálogo de arriendo', () => {
  test('el dueño prepara su negocio de inflables: juego, camión, zonas y precios ocultos', async ({ page }) => {
    await signUpAndConfirm(page, owner);
    await page.getByLabel('Nombre del negocio').fill(`Inflables Test ${Date.now()}`);
    await page.getByLabel('Rubro').selectOption('inflatables');
    await page.getByRole('button', { name: 'Crear negocio' }).click();
    await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);
    businessUrl = new URL(page.url()).pathname;

    // Un solo castillo y un camión que atiende 1 evento por día
    await page.goto(`${businessUrl}/recursos`);
    const form = page.locator('form', { has: page.getByRole('button', { name: 'Crear recurso' }) });
    await form.getByLabel('Tipo').selectOption('equipment');
    await form.getByLabel('Nombre').fill('Castillo princesa');
    await form.getByLabel('Habilidades').fill('castillo');
    await form.getByRole('button', { name: 'Crear recurso' }).click();
    await expect(page.getByText('Recurso creado')).toBeVisible();

    await form.getByLabel('Tipo').selectOption('equipment');
    await form.getByLabel('Nombre').fill('Camión 1');
    await form.getByLabel(/Es un recurso de logística/).check();
    await form.getByLabel('Eventos por día (logística)').fill('1');
    await form.getByRole('button', { name: 'Crear recurso' }).click();
    await expect(page.getByText('Logística · 1 eventos/día')).toBeVisible();

    // Despacho por zona, con zonas libres (no comunas)
    await page.goto(`${businessUrl}/sucursales`);
    const delivery = page.getByRole('form', { name: /Despacho de/ });
    await delivery.getByLabel('Cobro del despacho').selectOption('by_zone');
    await delivery.getByRole('button', { name: 'Guardar despacho' }).click();
    await expect(delivery.getByText('Cambios guardados')).toBeVisible();
    for (const [zone, fee] of [
      ['Padre Hurtado', '0'],
      ['Peñaflor', '5000'],
    ] as const) {
      const add = page.getByRole('form', { name: /Nueva zona de/ });
      await add.getByLabel('Nueva zona').fill(zone);
      await add.getByLabel(/Costo/).fill(fee);
      await add.getByRole('button', { name: 'Agregar zona' }).click();
      await expect(page.getByRole('form', { name: `Zona ${zone}` })).toBeVisible();
    }

    // Precios ocultos en el link público
    await page.goto(`${businessUrl}/configuracion`);
    const settings = page.locator('form', { has: page.getByLabel('Mostrar precios en el link público') });
    await settings.getByLabel('Mostrar precios en el link público').uncheck();
    await settings.getByRole('button', { name: 'Guardar' }).click();
    await expect(settings.getByText('Cambios guardados')).toBeVisible();
    publicUrl = new URL((await page.getByRole('link', { name: /\/r\// }).getAttribute('href'))!).pathname;
  });

  test('el catálogo público muestra día completo, la ficha y las zonas, sin precios', async ({ browser }) => {
    const page = await anonymousPage(browser);
    await page.goto(publicUrl);
    await expect(page.getByText('Arrienda en')).toBeVisible();
    await expect(page.getByRole('button', { name: /Castillo inflable/ })).toContainText('Día completo');
    await expect(page.getByText(/Zonas que atendemos: Padre Hurtado, Peñaflor/)).toBeVisible();
    await expect(page.locator('main')).not.toContainText('$');

    await page.getByRole('link', { name: 'Ver ficha de Castillo inflable' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Castillo inflable');
    await expect(page.getByText('10 niños')).toBeVisible();
    await expect(page.locator('main')).not.toContainText('$');
  });

  test('un cliente arrienda el castillo por el día', async ({ browser }) => {
    const page = await anonymousPage(browser);
    await page.goto(publicUrl);
    await chooseCastle(page);
    await expect(page.getByText('3. Día y hora del evento')).toBeVisible();
    const days = page.getByRole('group', { name: 'Día' }).getByRole('button');
    const hours = page.getByRole('group', { name: 'Hora' }).getByRole('button');
    for (let i = 2; i < 9; i++) {
      await days.nth(i).click();
      await expect(page.getByText('Buscando horarios…')).toHaveCount(0);
      if ((await hours.count()) > 0) {
        dayIndex = i;
        dayLabel = (await days.nth(i).getAttribute('aria-label')) ?? '';
        break;
      }
    }
    expect(dayLabel).not.toBe('');
    await hours.filter({ hasText: '15:00' }).click();
    await page.getByLabel('Nombre').fill('Ana Cumpleaños');
    await page.getByLabel('Teléfono').fill('9 3333 4444');
    await page.getByRole('button', { name: /Confirmar reserva/ }).click();
    await expect(page.getByText('¡Reserva confirmada!')).toBeVisible();
  });

  test('ese día el castillo ya no está libre a ninguna hora', async ({ browser }) => {
    const page = await anonymousPage(browser);
    await page.goto(publicUrl);
    await chooseCastle(page);
    await page.getByRole('button', { name: dayLabel }).click();
    await expect(page.getByText('Buscando horarios…')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Hora' }).getByRole('button')).toHaveCount(0);
  });

  test('la agenda avisa que el camión está completo', async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`${businessUrl}/agenda?fecha=${santiagoDate(dayIndex)}`);
    await expect(page.getByText('Ana Cumpleaños')).toBeVisible();
    await expect(page.getByText('Los camiones están completos: 1 eventos de 1.')).toBeVisible();
  });
});
