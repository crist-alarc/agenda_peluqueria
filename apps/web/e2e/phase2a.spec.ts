/**
 * Fase 2A: un cliente reserva por el link público, la recepción ve y gestiona
 * la agenda, agenda a un cliente existente y nunca hay doble reserva.
 */
import { expect, test, type Page } from '@playwright/test';
import { anonymousPage, logIn, signUpAndConfirm, testUser } from './helpers';

const owner = testUser('barbero');
let businessUrl = '';
let publicUrl = '';
let bookedDate = '';
let bookedTime = '';
let raceTime = '';

/** Elige servicio y profesional, y el primer día con horarios. Devuelve la fecha elegida. */
async function chooseServiceAndDay(page: Page, service = 'Corte de pelo', person = 'Carla Rojas'): Promise<string> {
  await page.getByRole('button', { name: new RegExp(service) }).click();
  await page.getByRole('button', { name: person, exact: true }).click();
  const days = page.getByRole('group', { name: 'Día' }).getByRole('button');
  const hours = page.getByRole('group', { name: 'Hora' }).getByRole('button');
  for (let i = 1; i < 8; i++) {
    await days.nth(i).click();
    await expect(page.getByText('Buscando horarios…')).toHaveCount(0);
    if ((await hours.count()) > 0) return (await days.nth(i).getAttribute('aria-label')) ?? '';
  }
  throw new Error('No hay días con horarios');
}

test.describe.serial('Fase 2A: reservas', () => {
  test('el dueño prepara su barbería: profesional y link público', async ({ page }) => {
    await signUpAndConfirm(page, owner);
    await page.getByLabel('Nombre del negocio').fill(`Barbería Test ${Date.now()}`);
    await page.getByLabel('Rubro').selectOption('barbershop');
    await page.getByRole('button', { name: 'Crear negocio' }).click();
    await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);
    businessUrl = new URL(page.url()).pathname;

    await page.goto(`${businessUrl}/recursos`);
    const form = page.locator('form', { has: page.getByRole('button', { name: 'Crear recurso' }) });
    await form.getByLabel('Nombre').fill('Carla Rojas');
    await form.getByLabel('Habilidades').fill('barberia');
    await form.getByRole('button', { name: 'Crear recurso' }).click();
    await expect(page.getByText('Recurso creado')).toBeVisible();

    await page.goto(`${businessUrl}/configuracion`);
    publicUrl = new URL((await page.getByRole('link', { name: /\/r\// }).getAttribute('href'))!).pathname;
    expect(publicUrl).toMatch(/^\/r\/barberia-test-/);
  });

  test('un cliente reserva por el link público sin cuenta', async ({ browser }) => {
    const page = await anonymousPage(browser);
    await page.goto(publicUrl);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Barbería Test');
    bookedDate = await chooseServiceAndDay(page);
    const first = page.getByRole('group', { name: 'Hora' }).getByRole('button').first();
    bookedTime = (await first.textContent())!.trim();
    await first.click();
    await page.getByLabel('Nombre').fill('Juan Cliente');
    await page.getByLabel('Teléfono').fill('9 8765 4321');
    await page.getByRole('button', { name: /Confirmar reserva/ }).click();
    await expect(page.getByText('¡Reserva confirmada!')).toBeVisible();
    await expect(page.getByText(/Te esperamos el/)).toBeVisible();
  });

  test('el horario tomado ya no se ofrece (nunca doble reserva)', async ({ browser }) => {
    const page = await anonymousPage(browser);
    await page.goto(publicUrl);
    await page.getByRole('button', { name: /Corte de pelo/ }).click();
    await page.getByRole('button', { name: 'Carla Rojas', exact: true }).click();
    await page.getByRole('button', { name: bookedDate }).click();
    await expect(page.getByText('Buscando horarios…')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Hora' }).getByRole('button', { name: bookedTime, exact: true })).toHaveCount(0);
  });

  test('si dos clientes eligen la misma hora, solo uno la obtiene', async ({ browser }) => {
    const [a, b] = [await anonymousPage(browser), await anonymousPage(browser)];
    let time = '';
    for (const [page, name, phone] of [
      [a, 'Ana Uno', '9 1111 1111'],
      [b, 'Beto Dos', '9 2222 2222'],
    ] as const) {
      await page.goto(publicUrl);
      await page.getByRole('button', { name: /Corte de pelo/ }).click();
      await page.getByRole('button', { name: 'Carla Rojas', exact: true }).click();
      await page.getByRole('button', { name: bookedDate }).click();
      await expect(page.getByText('Buscando horarios…')).toHaveCount(0);
      const slot = page.getByRole('group', { name: 'Hora' }).getByRole('button').first();
      time ||= (await slot.textContent())!.trim();
      await page.getByRole('group', { name: 'Hora' }).getByRole('button', { name: time, exact: true }).click();
      await page.getByLabel('Nombre').fill(name);
      await page.getByLabel('Teléfono').fill(phone);
    }
    await a.getByRole('button', { name: /Confirmar reserva/ }).click();
    await expect(a.getByText('¡Reserva confirmada!')).toBeVisible();
    raceTime = time;
    await b.getByRole('button', { name: /Confirmar reserva/ }).click();
    await expect(b.getByText('Ese horario ya no está disponible')).toBeVisible();
    // Tras el error se refrescan los horarios: esa hora ya no aparece
    await expect(b.getByRole('group', { name: 'Hora' }).getByRole('button', { name: time, exact: true })).toHaveCount(0);
  });

  test('recepción ve la reserva en la agenda de Carla y cambia su estado', async ({ page }) => {
    await logIn(page, owner);
    const date = await dateParam(page);
    await page.goto(`${businessUrl}/agenda?fecha=${date}`);
    const column = page.getByRole('region', { name: 'Agenda de Carla Rojas' });
    const card = column.getByRole('article', { name: `Reserva de Juan Cliente, ${bookedTime}` });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Link público');
    await card.getByRole('button', { name: 'Llegó' }).click();
    // La tarjeta se actualiza con el nuevo estado y las acciones siguientes
    await expect(card.getByText('Llegó', { exact: true })).toBeVisible();
    await page.reload();
    await expect(card.getByText('Llegó', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Atender' })).toBeVisible();
  });

  test('recepción agenda a un cliente existente buscándolo por teléfono', async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`${businessUrl}/agenda?nueva=1`);
    await chooseServiceAndDay(page);
    await page.getByRole('group', { name: 'Hora' }).getByRole('button').last().click();
    await page.getByLabel('Buscar cliente por teléfono o nombre').fill('8765');
    await page.getByRole('button', { name: /Juan Cliente/ }).click();
    await page.getByRole('button', { name: /Confirmar reserva/ }).click();
    await expect(page.getByText('Reserva creada')).toBeVisible();

    await page.goto(`${businessUrl}/clientes?q=Juan`);
    await expect(page.getByText('Juan Cliente')).toHaveCount(1);
  });

  test('cancelar libera el horario en el link público', async ({ page, browser }) => {
    await logIn(page, owner);
    const date = await dateParam(page);
    await page.goto(`${businessUrl}/agenda?fecha=${date}`);
    page.on('dialog', (d) => void d.accept());
    const card = page.getByRole('article', { name: /Reserva de Ana Uno/ });
    await card.getByRole('button', { name: 'Cancelar' }).click();
    await expect(card.getByText('Cancelada', { exact: true })).toBeVisible();

    const client = await anonymousPage(browser);
    await client.goto(publicUrl);
    await client.getByRole('button', { name: /Corte de pelo/ }).click();
    await client.getByRole('button', { name: 'Carla Rojas', exact: true }).click();
    await client.getByRole('button', { name: bookedDate }).click();
    await expect(client.getByText('Buscando horarios…')).toHaveCount(0);
    const hours = await client.getByRole('group', { name: 'Hora' }).getByRole('button').allTextContents();
    expect(hours).not.toContain(bookedTime); // Juan sigue reservado
    expect(hours).toContain(raceTime); // la hora de Ana quedó libre
  });
});

/** Convierte la etiqueta del día ("mié 18 nov") en la fecha YYYY-MM-DD buscándola en el link público. */
async function dateParam(page: Page): Promise<string> {
  const client = await page.context().newPage();
  await client.goto(publicUrl);
  await client.getByRole('button', { name: /Corte de pelo/ }).click();
  const labels = await client.getByRole('group', { name: 'Día' }).getByRole('button').evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label')),
  );
  await client.close();
  const index = labels.indexOf(bookedDate);
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  today.setDate(today.getDate() + index);
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}
