import { expect, type Browser, type Page } from '@playwright/test';

export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:54324';

export type TestUser = { name: string; email: string; password: string };

export function testUser(prefix: string): TestUser {
  return { name: `${prefix} Prueba`, email: `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@test.cl`, password: 'clave-segura-1' };
}

/** Busca el último email enviado a `to` y devuelve el primer enlace que contenga `contains`. */
export async function linkFromEmail(to: string, contains: string): Promise<string> {
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

export async function signUpAndConfirm(page: Page, user: TestUser) {
  await page.goto('/registro');
  await page.getByLabel('Tu nombre').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Te enviamos un email para confirmar tu cuenta')).toBeVisible();
  await page.goto(await linkFromEmail(user.email, 'verify'));
  await page.waitForURL(/\/panel/);
}

export async function logIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/\/panel/);
}

/** Página nueva sin sesión (como un cliente cualquiera). */
export async function anonymousPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ locale: 'es-CL', timezoneId: 'America/Santiago' });
  return ctx.newPage();
}

export type MailpitMessage = {
  ID: string;
  Subject: string;
  HTML: string;
  Text: string;
  Attachments: Array<{ FileName: string; ContentType: string }>;
};

/** Último email enviado a `to` cuyo asunto contiene `subject` (espera hasta 10 s). */
export async function emailTo(to: string, subject: string): Promise<MailpitMessage & { links: string[] }> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const found = (list.messages ?? []).find((m: { Subject: string }) => m.Subject.includes(subject));
    if (found) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${found.ID}`)).json()) as MailpitMessage;
      const links = [...String(msg.HTML).matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'));
      return { ...msg, links };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó el email "${subject}" a ${to}`);
}

/**
 * Activa una función del plan para un negocio de prueba (los negocios nuevos
 * parten en el Plan Base). Usa la clave de servicio, como haría soporte.
 */
export async function enableFeature(businessId: string, feature: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY para las pruebas');
  const res = await fetch(`${url}/rest/v1/business_entitlements?business_id=eq.${businessId}&feature=eq.${feature}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ enabled: true, source: 'manual' }),
  });
  if (!res.ok) throw new Error(`No se pudo activar ${feature}: ${res.status} ${await res.text()}`);
}

/** Marca a una cuenta como administradora de la plataforma (ADR 0008). Solo con la clave de servicio. */
export async function makePlatformAdmin(email: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY para las pruebas');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const profiles = await (await fetch(`${url}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`, { headers })).json();
  const id = profiles?.[0]?.id;
  if (!id) throw new Error(`No existe el perfil de ${email}`);
  const res = await fetch(`${url}/rest/v1/platform_admins`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: id }),
  });
  if (!res.ok) throw new Error(`No se pudo crear el administrador: ${res.status} ${await res.text()}`);
}
