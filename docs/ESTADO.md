# Estado del proyecto y traspaso

> Documento vivo para retomar el trabajo en una sesión nueva sin perder contexto.
> **Fuente de verdad:** `docs/DIRECTRICES.md` (v1.2, final según el dueño). Decisiones: `docs/adr/`.
> Última actualización: 2026-11-11.

## 1. Dónde estamos

| Fase | Estado |
|---|---|
| 1 · Fundaciones | **Cerrada** (aprobada). ADR 0001. PR #3 |
| 2 · MVP peluquería | **En curso**, en 4 entregas (ADR 0002) |
| 2A · Reservas | **Hecha** y en `main` (PR #5): motor de disponibilidad, link público `/r/<slug>`, agenda de recepción, clientes |
| 2B · Portal del cliente e invitados | **Siguiente** |
| 2C · Emails y recordatorios | Pendiente |
| 2D · Comisiones | Pendiente |

## 2. Decisiones del dueño (2026-11-10), además de las directrices

1. Verificación de invitados: **por código al email** primero; WhatsApp queda preparado para cuando se elija proveedor.
2. Dominio de envío de emails: **se compra más adelante** (mientras, Resend en modo desarrollo).
3. Tareas programadas (recordatorios): **Supabase Cron + Edge Function** que solo invoca lógica de `packages/core`.
4. Piloto con peluquería real: **más adelante**; por ahora seguir programando. Antes del piloto: Vercel Pro + Supabase Pro.
5. Las directrices v1.2 son finales: las decisiones nuevas se registran en ADR, no se edita `DIRECTRICES.md`.

## 3. Plan de la entrega 2B (propuesto, falta aprobar detalle)

- **Portal del cliente** ("Mis reservas"): una cuenta ve sus reservas en todos los negocios (sección 12) y cancela
  según la política del negocio (`cancellation_hours`, ya existe; regla en `customerCanCancel` de `packages/core`).
- **Invitados verificados**: en el link público, nombre + teléfono + email → código de 6 dígitos por email →
  la reserva pasa de `pending` a `confirmed` al verificar (o reserva `pending` con vencimiento corto).
  Requiere tabla de códigos (hash del código, intentos, expiración) con RLS, y límite de intentos.
- **Vinculación** de reservas de invitado a una cuenta **solo tras verificar** el mismo email o teléfono (sección 5.3).
- Envío de email detrás de una interfaz propia (`packages/notifications`, sección 3.1); Resend como primer proveedor.
- Riesgo abierto que 2B mitiga: hoy el link público acepta reservas solo con nombre y teléfono (reservas falsas).

## 4. Tareas pendientes del dueño (fuera del código)

- [ ] **Vercel → Environment Variables: `SUPABASE_SECRET_KEY`** (clave *secret* de Supabase). Sin ella el link público no guarda reservas.
- [ ] Supabase → Authentication → URL Configuration: *Site URL* `https://agenda-peluqueria-virid.vercel.app` y *Redirect URL* `https://agenda-peluqueria-virid.vercel.app/**`.
- [ ] GitHub → Settings → Pages → **Unpublish site** (todavía puede mostrar el prototipo viejo).
- [ ] Supabase → Authentication: activar protección de contraseñas filtradas (aviso del Security Advisor).
- [ ] Verificación en dos pasos en Vercel, Supabase y GitHub (sección 21).
- [ ] Verificar los feriados de Chile 2026–2027 precargados contra la fuente oficial.
- [ ] Antes de 2C: cuenta en Resend (y más adelante dominio con SPF/DKIM/DMARC).

## 5. Datos del proyecto

| Qué | Valor |
|---|---|
| Repositorio | `crist-alarc/agenda_peluqueria` (rama de trabajo de Claude: `claude/nifty-mayer-hcosy2`) |
| Supabase | proyecto "App Agenda Peluquería", id `yzqvvmsnpqjntuqeiskf`, región São Paulo |
| App publicada | `https://agenda-peluqueria-virid.vercel.app` (Vercel, Root Directory `apps/web`, preset Next.js) |
| Usuario del dueño | cuenta con email del dueño, rol `owner` en su negocio |
| Migraciones aplicadas | `20261107000000_prototype_init`, `20261110120000_phase1_foundations`, `20261110130000_security_advisor_fixes`, `20261111120000_phase2a_bookings` |

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
