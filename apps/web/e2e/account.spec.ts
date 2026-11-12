/**
 * Una cuenta, varios negocios (directrices, principio 1): desde el teléfono el
 * dueño ve su cuenta, crea un segundo negocio de otro rubro, cambia entre ellos
 * y cierra sesión.
 */
import { expect, test } from '@playwright/test';
import { signUpAndConfirm, testUser } from './helpers';

const owner = testUser('multinegocio');

test.use({ viewport: { width: 390, height: 844 } });

test('un dueño administra una peluquería y un negocio de inflables con la misma cuenta', async ({ page }) => {
  const stamp = Date.now();
  await signUpAndConfirm(page, owner);
  await page.getByLabel('Nombre del negocio').fill(`Peluquería ${stamp}`);
  await page.getByLabel('Rubro').selectOption('hair_salon');
  await page.getByRole('button', { name: 'Crear negocio' }).click();
  await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);

  // En el teléfono también se ve la cuenta
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

  // Segundo negocio, de otro rubro, desde el menú de la cuenta
  await page.getByRole('link', { name: 'Nuevo negocio' }).click();
  await page.getByLabel('Nombre del negocio').fill(`Inflables ${stamp}`);
  await page.getByLabel('Rubro').selectOption('inflatables');
  await page.getByRole('button', { name: 'Crear negocio' }).click();
  await page.waitForURL(/\/panel\/[0-9a-f-]{36}$/);

  await page.getByRole('link', { name: 'Mis negocios' }).click();
  await expect(page.getByRole('heading', { name: 'Mis negocios' })).toBeVisible();
  await expect(page.getByText(`Peluquería ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Inflables ${stamp}`)).toBeVisible();

  // Con la sesión abierta, la portada no ofrece "Crear cuenta" y /registro lleva a sus negocios
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Ir a mis negocios' })).toBeVisible();
  await page.goto('/registro');
  await expect(page).toHaveURL(/\/panel\?todos=1$/);

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL(/\/login/);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Crear cuenta' })).toBeVisible();
});
