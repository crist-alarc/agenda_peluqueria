/**
 * Fase 2C: email al reservar con .ics, recordatorio configurable con
 * "Confirmo asistencia" y estado de la asistencia en la agenda.
 */
import { expect, test, type Page } from '@playwright/test';
import { anonymousPage, emailTo, logIn, signUpAndConfirm, testUser } from './helpers';

const owner = testUser('duena2c');
const stamp = Date.now();
const first = `primera.${stamp}@test.cl`;
const second = `segunda.${stamp}@test.cl`;
let businessUrl = '';
let publicUrl = '';

async function bookPublic(page: Page, name: string, phone: string, email: string, slotIndex: number) {
  await page.goto(publicUrl);
  await page.getByRole('button', { name: /Corte de pelo/ }).click();
  await page.getByRole('button', { name: 'Diego Soto', exact: true }).click();
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
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /Confirmar reserva/ }).click();
  await expect(page.getByText(/Te esperamos el/)).toBeVisible();
}

async function saveReminders(page: Page, enabled: boolean, hours: string, cutoff: string) {
  await page.goto(`${businessUrl}/configuracion`);
  const form = page.locator('form', { has: page.locator('input[name="reminderHoursBefore"]') });
  const box = form.getByLabel('Enviar recordatorios');
  if ((await box.isChecked()) !== enabled) await box.click();
  await form.getByLabel(/Enviar recordatorio \(horas/).fill(hours);
  await form.getByLabel(/Hora de corte/).fill(cutoff);
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(form.getByText('Cambios guardados')).toBeVisible();
}

test.describe.serial('Fase 2C: emails y recordatorios', () => {
  test('el negocio configura el recordatorio con sus propias horas', async ({ page }) => {
    await signUpAndConfirm(page, owner);
    await page.getByLabel('Nombre del negocio').fill(`Barbería Dos C ${stamp}`);
    await page.getByLabel('Rubro').selectOption('barbershop');
    await page.getByRole('button', { name: 'Crear negocio' }).click();
    await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);
    businessUrl = new URL(page.url()).pathname;

    await page.goto(`${businessUrl}/recursos`);
    const form = page.locator('form', { has: page.getByRole('button', { name: 'Crear recurso' }) });
    await form.getByLabel('Nombre').fill('Diego Soto');
    await form.getByRole('button', { name: 'Crear recurso' }).click();
    await expect(page.getByText('Recurso creado')).toBeVisible();

    await page.goto(`${businessUrl}/configuracion`);
    publicUrl = new URL((await page.getByRole('link', { name: /\/r\// }).getAttribute('href'))!).pathname;

    // La hora de corte debe ser antes que el recordatorio
    const reminders = page.locator('form', { has: page.locator('input[name="reminderHoursBefore"]') });
    await reminders.getByLabel(/Enviar recordatorio \(horas/).fill('6');
    await reminders.getByLabel(/Hora de corte/).fill('6');
    await reminders.getByRole('button', { name: 'Guardar' }).click();
    await expect(reminders.getByText(/La hora de corte debe ser antes/)).toBeVisible();

    // 168 h: cualquier reserva de la próxima semana ya está dentro del plazo
    await saveReminders(page, true, '168', '0');
  });

  test('al reservar dentro del plazo, el email trae .ics y "Confirmo asistencia"', async ({ browser, page }) => {
    const client = await anonymousPage(browser);
    await bookPublic(client, 'Paula Primera', '9 6666 1111', first, 0);

    const email = await emailTo(first, 'Reserva confirmada');
    expect(email.Attachments.map((a) => a.FileName)).toContain('reserva.ics');
    const attend = email.links.find((l) => l.includes('/reserva/asistencia'))!;
    expect(email.links.some((l) => l.includes('/reserva/cancelar'))).toBe(true);

    await client.goto(attend);
    await expect(client.getByRole('heading', { name: '¡Gracias por confirmar!' })).toBeVisible();
    await client.goto(attend);
    await expect(client.getByRole('heading', { name: 'Ya habías confirmado tu asistencia' })).toBeVisible();

    await logIn(page, owner);
    await page.goto(`${businessUrl}/agenda`);
    let card = page.getByRole('article', { name: /Reserva de Paula Primera/ });
    for (let i = 0; i < 8 && (await card.count()) === 0; i++) {
      await page.getByRole('link', { name: 'Día siguiente' }).click();
      await page.waitForLoadState('networkidle');
      card = page.getByRole('article', { name: /Reserva de Paula Primera/ });
    }
    await expect(card.getByText('Asistencia confirmada')).toBeVisible();
  });

  test('la tarea programada envía el recordatorio cuando corresponde', async ({ browser, page, request }) => {
    await logIn(page, owner);
    await saveReminders(page, false, '168', '0');

    const client = await anonymousPage(browser);
    await bookPublic(client, 'Sergio Segundo', '9 6666 2222', second, 1);
    const booked = await emailTo(second, 'Reserva confirmada');
    expect(booked.links.some((l) => l.includes('/reserva/asistencia'))).toBe(false);

    // Sin la clave secreta, la tarea no se ejecuta
    expect((await request.post('/api/tareas/recordatorios')).status()).toBe(401);

    await saveReminders(page, true, '168', '0');
    const run = await request.post('/api/tareas/recordatorios', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(run.status()).toBe(200);
    expect((await run.json()).sent).toBeGreaterThanOrEqual(1);

    const reminder = await emailTo(second, 'Recordatorio');
    expect(reminder.HTML).toContain('Confirmo asistencia');
    expect(reminder.HTML).toContain('Cancelar o cambiar');
    await client.goto(reminder.links.find((l) => l.includes('/reserva/asistencia'))!);
    await expect(client.getByRole('heading', { name: '¡Gracias por confirmar!' })).toBeVisible();

    // Correr la tarea de nuevo no repite el recordatorio
    const again = await request.post('/api/tareas/recordatorios', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect((await again.json()).sent).toBe(0);

    await page.goto(`${businessUrl}/configuracion`);
    await expect(page.getByLabel('Resultados de los últimos 30 días')).toContainText('2 clientes recibieron');
    await expect(page.getByLabel('Resultados de los últimos 30 días')).toContainText('2 confirmaron con el botón (100%)');
  });
});
