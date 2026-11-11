# Estado del proyecto y traspaso

> Documento vivo para retomar el trabajo en una sesión nueva sin perder contexto.
> **Fuente de verdad:** `docs/DIRECTRICES.md` (v1.2, final según el dueño). Decisiones: `docs/adr/`.
> Última actualización: 2026-11-11 (2C implementada).

## 1. Dónde estamos

| Fase | Estado |
|---|---|
| 1 · Fundaciones | **Cerrada** (aprobada). ADR 0001. PR #3 |
| 2 · MVP peluquería | **En curso**, en 4 entregas (ADR 0002) |
| 2A · Reservas | **Hecha** y en `main` (PR #5): motor de disponibilidad, link público `/r/<slug>`, agenda de recepción, clientes |
| 2B · Confirmación por email y portal | **Hecha** y en `main` (PR #6, ADR 0003): botón "Confirmar" en el email, modo auto/email por negocio, `/mis-reservas` |
| 2C · Emails y recordatorios | **Hecha** (ADR 0004): email con `.ics`, recordatorio configurable con "Confirmo asistencia", "Sin confirmar" en la agenda, registro de envíos, tarea programada |
| 2D · Comisiones | **Siguiente** |

## 2. Decisiones del dueño (2026-11-10), además de las directrices

1. Verificación de invitados: **por código al email** primero; WhatsApp queda preparado para cuando se elija proveedor.
2. Dominio de envío de emails: **se compra más adelante** (mientras, Resend en modo desarrollo).
3. Tareas programadas (recordatorios): **Supabase Cron + Edge Function** que solo invoca lógica de `packages/core`.
4. Piloto con peluquería real: **más adelante**; por ahora seguir programando. Antes del piloto: Vercel Pro + Supabase Pro.
5. Las directrices v1.2 son finales: las decisiones nuevas se registran en ADR, no se edita `DIRECTRICES.md`.
6. **(2026-11-11) Regla general: toda interacción con usuarios que dependa de un tiempo es configurable
   por el negocio** (nada de plazos fijos en el código). Tabla de plazos en ADR 0004, sección 1.
7. (2026-11-11) Las horas de envío del recordatorio las elige el dueño de cada negocio (24 h por defecto).

## 3. Plan de las entregas que faltan de la Fase 2

**2C · Emails y recordatorios:** hecha, ver ADR 0004. Sin WhatsApp (no hay proveedor): los clientes sin email
no reciben recordatorio. Reprogramar en un paso ("cambiar") queda para después: hoy es cancelar y reservar de nuevo.

**2D · Comisiones del equipo** (sección 16): reglas por persona y servicio (monto fijo o %), movimientos
al completar una reserva, liquidación por período exportable a Excel; liquidaciones cerradas no se modifican.
Recordar la regla 6: si aparece algún plazo (ej. período de liquidación), debe ser configurable.

**Cierre de la Fase 2:** actualizar este documento con el traspaso a la **Fase 3 (MVP inflables)**.
Antes de programar la Fase 3, documentar con los hermanos su proceso actual paso a paso (sección 24).

## 4. Tareas pendientes del dueño (fuera del código)

- [x] Vercel → Environment Variables: `SUPABASE_SECRET_KEY` (hecho por el dueño).
- [ ] **Recordatorios (2C)**: inventar una clave larga al azar y ponerla como `CRON_SECRET` en Vercel →
      Environment Variables, y también en Supabase → Edge Functions → Secrets junto con
      `APP_URL=https://agenda-peluqueria-virid.vercel.app`. Sin esto la tarea programada no envía recordatorios.
- [ ] Supabase → Authentication → URL Configuration: *Site URL* `https://agenda-peluqueria-virid.vercel.app` y *Redirect URL* `https://agenda-peluqueria-virid.vercel.app/**`.
- [ ] GitHub → Settings → Pages → **Unpublish site** (todavía puede mostrar el prototipo viejo).
- [ ] Supabase → Authentication: activar protección de contraseñas filtradas (aviso del Security Advisor).
- [ ] Verificación en dos pasos en Vercel, Supabase y GitHub (sección 21).
- [ ] Verificar los feriados de Chile 2026–2027 precargados contra la fuente oficial.
- [ ] Cuenta en Resend: en Vercel agregar `RESEND_API_KEY` y `EMAIL_FROM`. **Sin dominio propio Resend solo
      entrega al email del dueño de la cuenta**: mientras tanto usar el modo de confirmación `auto`.
- [ ] Comprar dominio y configurar SPF/DKIM/DMARC (necesario antes del piloto con clientes reales).

## 5. Datos del proyecto

| Qué | Valor |
|---|---|
| Repositorio | `crist-alarc/agenda_peluqueria` (rama de trabajo de Claude: `claude/nifty-mayer-hcosy2`) |
| Supabase | proyecto "App Agenda Peluquería", id `yzqvvmsnpqjntuqeiskf`, región São Paulo |
| App publicada | `https://agenda-peluqueria-virid.vercel.app` (Vercel, Root Directory `apps/web`, preset Next.js) |
| Usuario del dueño | cuenta con email del dueño, rol `owner` en su negocio |
| Migraciones aplicadas | `20261107000000_prototype_init`, `20261110120000_phase1_foundations`, `20261110130000_security_advisor_fixes`, `20261111120000_phase2a_bookings`, `20261112120000_phase2b_confirmation`, `20261112130000_phase2b_advisor_fix`, `20261113120000_phase2c_reminders` (todas verificadas idénticas a local) |
| Tests (2C) | core 58 · notifications 6 · base de datos 83 · Playwright 26 |
| Tarea programada | `pg_cron` job `agenda-tareas-programadas` (cada 15 min) → Edge Function `recordatorios` → `/api/tareas/recordatorios`. URL de la función en `app.settings.reminders_function_url` (dato por ambiente) |

## 6. Cómo trabaja Claude en este repo (notas técnicas)

- Antes de cada push: `pnpm typecheck`, `pnpm test`, `pnpm test:db` y, si cambia la interfaz, e2e.
- `pnpm test:db` necesita PostgreSQL local en `localhost:5432` (usuario/clave `postgres`). Si la sesión se reinicia: `service postgresql start`.
- **Migraciones**: probar primero con `pnpm test:db`; aplicar en Supabase con el conector (`apply_migration`);
  verificar que remoto = local comparando huellas (md5 de políticas, columnas, restricciones, triggers,
  funciones y permisos); regenerar `packages/db/src/database.types.ts`; revisar el Security Advisor.
- **Tests de punta a punta con Supabase local** en el entorno de Claude: `ghcr.io` está bloqueado y Docker Hub
  limita descargas, así que no sirve `supabase start`. Se arma a mano con Docker: `supabase/postgres`,
  `supabase/gotrue`, `postgrest/postgrest`, `axllent/mailpit` y un gateway Node mínimo en `:54321`
  (`/auth/v1` → GoTrue, `/rest/v1` → PostgREST). Claves locales: JWT HS256 firmados con el secreto de prueba.
  En GitHub Actions sí funciona `supabase start` (job `e2e` del CI, CLI fijada en 3.1.0).
- Patrones ya establecidos:
  - Lógica de dominio pura en `packages/core` (con tests); acceso a datos solo en `packages/db`.
  - Server Actions validan con Zod de `@agenda/core` y devuelven `{ ok, message }`; `ActionForm` envía manualmente para no vaciar campos con error.
  - RLS con funciones `app.*` (esquema no expuesto); `app.current_user_id()` y `app.current_request_role()` son los únicos puntos que conocen al proveedor de auth.
  - El link público crea reservas con el cliente de servicio (`SUPABASE_SECRET_KEY`) después de recalcular con el motor.
  - Cada mejora de seguridad o falla encontrada se cubre con un test, y se verifica que el test falle al romper la regla.

## 7. Producción de la 2C (hecho el 2026-11-11)

- [x] Migración `20261113120000_phase2c_reminders` aplicada (huella de funciones igual a la local).
- [x] `app.settings.reminders_function_url` = `https://yzqvvmsnpqjntuqeiskf.supabase.co/functions/v1/recordatorios`.
- [x] Edge Function `recordatorios` desplegada (`verify_jwt = false`).
- [x] Tipos regenerados; Security Advisor sin avisos nuevos (solo los intencionales de antes).
- [ ] El dueño carga `CRON_SECRET` (Vercel y secretos de la función) y `APP_URL` (secretos de la función).

Nota: `apply_migration` puede pedir confirmación al dueño (por ejemplo, si la migración tiene `drop`).
La tarjeta aparece en su app de Claude y vence en ~60 s: avisarle antes de aplicar.
