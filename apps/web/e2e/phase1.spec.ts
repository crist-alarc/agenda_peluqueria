/**
 * Criterio de término de la Fase 1 (directrices, sección 24):
 * "Un dueño crea su negocio, sucursal, recursos y servicios; RLS probado".
 *
 * Usa emails reales del Supabase local (Mailpit) para confirmar cuentas y
 * recuperar la contraseña.
 */
import { expect, test, type Page } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:54324';
const run = Date.now();
const owner = { name: 'Dueña Prueba', email: `duena.${run}@test.cl`, password: 'clave-segura-1' };
const receptionist = { name: 'Recepción Prueba', email: `recepcion.${run}@test.cl`, password: 'clave-segura-2' };
const stranger = { name: 'Otro Dueño', email: `otro.${run}@test.cl`, password: 'clave-segura-3' };

let businessUrl = '';

/** Busca el último email enviado a `to` y devuelve el primer enlace que contenga `contains`. */
async function linkFromEmail(to: string, contains: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const links = [...String(msg.HTML || msg.Text).matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'));
      const link = links.find((l) => l.includes(contains));
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó el email a ${to}`);
}

async function signUpAndConfirm(page: Page, user: { name: string; email: string; password: string }) {
  await page.goto('/registro');
  await page.getByLabel('Tu nombre').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Te enviamos un email para confirmar tu cuenta')).toBeVisible();
  await page.goto(await linkFromEmail(user.email, 'verify'));
  await page.waitForURL(/\/panel/);
}

async function logIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/\/panel/);
}

async function logOut(page: Page) {
  await page.context().clearCookies();
}

test.describe.serial('Fase 1: un dueño arma su negocio', () => {
  test('sin sesión, el panel redirige al login', async ({ page }) => {
    await page.goto('/panel');
    await expect(page).toHaveURL(/\/login\?next=%2Fpanel/);
  });

  test('registro con confirmación por email y alta del negocio con plantilla', async ({ page }) => {
    await signUpAndConfirm(page, owner);
    await expect(page).toHaveURL(/\/panel\/nuevo/);

    await page.getByLabel('Nombre del negocio').fill('Barbería El Filo');
    await page.getByLabel('Rubro').selectOption('barbershop');
    await page.getByLabel('Dirección').fill('Av. Providencia 1234');
    await page.getByLabel('Comuna').fill('Providencia');
    await page.getByRole('button', { name: 'Crear negocio' }).click();

    await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);
    businessUrl = new URL(page.url()).pathname;
    await expect(page.getByRole('heading', { name: 'Barbería El Filo' })).toBeVisible();
    // La plantilla de barbería precarga 3 servicios
    await page.getByRole('link', { name: 'Servicios' }).first().click();
    await expect(page.getByText('Corte + barba')).toBeVisible();
    await expect(page.getByText('$15.000')).toBeVisible();
  });

  test('crea recursos: una persona y un espacio', async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`${businessUrl}/recursos`);
    const form = page.locator('form', { has: page.getByRole('button', { name: 'Crear recurso' }) });

    await form.getByLabel('Tipo').selectOption('person');
    await form.getByLabel('Nombre').fill('Carla Rojas');
    await form.getByLabel('Habilidades').fill('barberia, colorimetria');
    await form.getByRole('button', { name: 'Crear recurso' }).click();
    await expect(page.getByText('Recurso creado')).toBeVisible();

    await form.getByLabel('Tipo').selectOption('space');
    await form.getByLabel('Nombre').fill('Sillón 1');
    await form.getByLabel('Habilidades').fill('');
    await form.getByRole('button', { name: 'Crear recurso' }).click();
    await expect(page.getByText('Sillón 1')).toBeVisible();
    await expect(page.locator('summary', { hasText: 'Carla Rojas' }).getByText('barberia')).toBeVisible();
  });

  test('crea un servicio con requisitos y precio en CLP enteros', async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`${businessUrl}/servicios`);
    await page.getByText('Nuevo servicio').click();
    const form = page.locator('details', { hasText: 'Nuevo servicio' });
    await form.getByLabel('Nombre').fill('Perfilado de cejas');
    await form.getByLabel('Precio (CLP)').fill('5.000,50');
    await form.getByLabel('Duración (minutos)').fill('15');
    await form.getByRole('button', { name: 'Crear servicio' }).click();
    await expect(form.getByText('sin decimales')).toBeVisible();

    await form.getByLabel('Precio (CLP)').fill('$5.000');
    await form.getByRole('button', { name: 'Crear servicio' }).click();
    await expect(page.getByText('Servicio creado')).toBeVisible();
    await expect(page.locator('summary', { hasText: 'Perfilado de cejas' })).toContainText('15 min · $5.000');
  });

  test('edita el horario de la sucursal y rechaza tramos superpuestos', async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`${businessUrl}/sucursales`);
    const addSunday = page.getByRole('button', { name: 'Agregar tramo el Domingo' });
    await addSunday.click();
    await addSunday.click();
    await page.getByLabel('Domingo inicio').nth(1).fill('12:00');
    await page.getByRole('button', { name: 'Guardar sucursal' }).click();
    await expect(page.getByText('Hay tramos que se superponen el mismo día')).toBeVisible();

    await page.getByRole('button', { name: 'Quitar tramo del Domingo' }).nth(1).click();
    await page.getByRole('button', { name: 'Guardar sucursal' }).click();
    await expect(page.getByText('Cambios guardados')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Domingo inicio')).toHaveValue('10:00');
  });

  test('el plan base no permite una segunda sucursal', async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`${businessUrl}/sucursales`);
    await expect(page.getByText('Tu plan permite hasta 1 sucursales')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear sucursal' })).toHaveCount(0);
  });

  test('adicional con stock por sucursal', async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`${businessUrl}/adicionales`);
    await page.getByText('Nuevo adicional').click();
    const form = page.locator('details', { hasText: 'Nuevo adicional' });
    await form.getByLabel('Nombre').fill('Toalla caliente');
    await form.getByLabel('Precio (CLP)').fill('2000');
    await form.getByRole('button', { name: 'Crear adicional' }).click();
    await expect(page.getByText('Adicional creado')).toBeVisible();

    await page.locator('summary', { hasText: 'Toalla caliente' }).click();
    await page.getByLabel('Stock en Casa matriz').fill('8');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Stock actualizado')).toBeVisible();
    await expect(page.locator('summary', { hasText: 'Toalla caliente' })).toContainText('stock total 8');
  });

  test('la auditoría muestra los cambios', async ({ page }) => {
    await logIn(page, owner);
    await page.goto(businessUrl);
    await expect(page.getByText('Últimos cambios')).toBeVisible();
    await expect(page.getByText(/Dueña Prueba creó servicio «Perfilado de cejas»/)).toBeVisible();
  });

  test('agrega una recepcionista, que ve el catálogo pero no puede editarlo', async ({ page }) => {
    await signUpAndConfirm(page, receptionist);
    await logOut(page);

    await logIn(page, owner);
    await page.goto(`${businessUrl}/equipo`);
    await page.getByLabel('Email').fill('no.existe@test.cl');
    await page.getByRole('button', { name: 'Agregar al equipo' }).click();
    await expect(page.getByText('No existe una cuenta con ese email')).toBeVisible();
    await page.getByLabel('Email').fill(receptionist.email);
    await page.getByLabel('Rol').selectOption('receptionist');
    await page.getByRole('button', { name: 'Agregar al equipo' }).click();
    await expect(page.getByText(`${receptionist.email} ahora es recepción`)).toBeVisible();
    await logOut(page);

    await logIn(page, receptionist);
    await page.goto(`${businessUrl}/servicios`);
    await expect(page.getByText('Perfilado de cejas')).toBeVisible();
    await expect(page.getByText('Nuevo servicio')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Configuración' })).toHaveCount(0);
    const res = await page.goto(`${businessUrl}/configuracion`);
    expect(res?.status()).toBe(404);
  });

  test('otro dueño no puede ver el negocio (aislamiento)', async ({ page }) => {
    await signUpAndConfirm(page, stranger);
    const res = await page.goto(businessUrl);
    expect(res?.status()).toBe(404);
    const resources = await page.goto(`${businessUrl}/recursos`);
    expect(resources?.status()).toBe(404);
  });

  test('recupera la contraseña por email', async ({ page }) => {
    await page.goto('/recuperar');
    await page.getByLabel('Email').fill(owner.email);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByText('te enviamos un enlace')).toBeVisible();

    await page.goto(await linkFromEmail(owner.email, 'type=recovery'));
    await page.waitForURL(/\/nueva-clave/);
    await page.getByLabel('Nueva contraseña').fill('otra-clave-segura');
    await page.getByLabel('Repite la contraseña').fill('otra-clave-segura');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await page.waitForURL(/\/panel/);
    await logOut(page);
    await logIn(page, { email: owner.email, password: 'otra-clave-segura' });
    await expect(page.getByRole('heading', { name: 'Barbería El Filo' })).toBeVisible();
  });
});
