import { defineConfig } from '@playwright/test';

/**
 * Flujos críticos de punta a punta (directrices, sección 3).
 * Requiere la app en BASE_URL y un Supabase local con Mailpit (ver README).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    trace: 'off',
  },
});
