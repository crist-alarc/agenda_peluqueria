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
