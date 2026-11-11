# Estado del proyecto y traspaso

> Documento vivo para retomar el trabajo en una sesión nueva sin perder contexto.
> **Fuente de verdad:** `docs/DIRECTRICES.md` (v1.2, final según el dueño). Decisiones: `docs/adr/`.
> Última actualización: 2026-11-11 (**Fase 2 programada completa**; traspaso a la Fase 3).

## 1. Dónde estamos

| Fase | Estado |
|---|---|
| 1 · Fundaciones | **Cerrada** (aprobada). ADR 0001. PR #3 |
| 2 · MVP peluquería | **Programada completa** (2A–2D). Falta su criterio de término: *una peluquería real opera una semana* (piloto, más adelante por decisión del dueño) |
| 2A · Reservas | En `main` (PR #5, ADR 0002): motor de disponibilidad, link público `/r/<slug>`, agenda de recepción, clientes |
| 2B · Confirmación y portal | En `main` (PR #6, ADR 0003): botón "Confirmar" en el email, modo auto/email, `/mis-reservas` |
| 2C · Emails y recordatorios | En `main` (PR #8, ADR 0004): email con `.ics`, recordatorio configurable, "Sin confirmar", registro de envíos, tarea programada |
| 2D · Comisiones | Hecha (ADR 0005): reglas, reparto entre profesionales (receta o manual por % o minutos), ajustes, liquidaciones cerradas inmutables, Excel y PDF para teléfono |
| 3 · MVP inflables | **Siguiente.** Ver sección 7 (traspaso) |

**Quedó fuera de la Fase 2, a propósito:**

- **WhatsApp** (invitados y escalamiento del recordatorio): no hay proveedor elegido (decisión del
  2026-11-10). El canal `whatsapp` ya existe en `notification_log`.
- **Reprogramar en un paso:** hoy se cancela y se reserva de nuevo.
- **Cambiar el plan de un negocio desde la app:** hoy se hace en la base.

## 2. Decisiones del dueño, además de las directrices

1. (2026-11-10) Verificación de invitados: **por email** primero; WhatsApp queda preparado para cuando se elija proveedor.
2. (2026-11-10) Dominio de envío de emails: **se compra más adelante** (mientras, Resend en modo desarrollo).
3. (2026-11-10) Tareas programadas: **Supabase Cron + Edge Function**. La lógica vive en `packages/core` (ADR 0004).
4. (2026-11-10) Piloto con peluquería real: **más adelante**. Antes del piloto: Vercel Pro + Supabase Pro.
5. Las directrices v1.2 son finales: las decisiones nuevas van en un ADR; no se edita `DIRECTRICES.md`.
6. **(2026-11-11) Regla general: toda interacción con usuarios que dependa de un tiempo es configurable
   por el negocio.** Nada de plazos fijos en el código. La tabla de plazos está en el ADR 0004, sección 1;
   la 2D agregó la frecuencia de liquidación.
7. (2026-11-11) Confirmación con **botón en el email**, no con código. El negocio también puede confirmar.
   Cada negocio elige el modo automático o por email.
8. (2026-11-11) Las horas del recordatorio y la hora de corte las elige cada negocio.
9. (2026-11-11) **Comisiones compartidas:** el reparto es proporcional y lo decide el negocio, siempre debe
   sumar 100%.
   - Puede venir de una receta del servicio, por ejemplo peluquería canina 70% y secado 30%.
   - O de un reparto manual por reserva, por % o por minutos (por ejemplo, si alguien se fue y otra persona
     terminó el trabajo).
10. (2026-11-11) **Planes:** se pueden crear negocios de prueba con distintos planes. Por ahora los negocios
    existentes tienen todo (plan `completo`) y los nuevos parten en el Plan Base.
11. (2026-11-11) Las liquidaciones se exportan a **Excel y a PDF legible en el teléfono**.

## 3. Tareas pendientes del dueño (fuera del código)

- [x] Vercel → Environment Variables: `SUPABASE_SECRET_KEY`.
- [x] Recordatorios (2C): `CRON_SECRET` en Vercel y en los secretos de la Edge Function, junto con `APP_URL`.
- [ ] Supabase → Authentication → URL Configuration:
  - *Site URL*: `https://agenda-peluqueria-virid.vercel.app`;
  - *Redirect URL*: `https://agenda-peluqueria-virid.vercel.app/**`.
- [ ] GitHub → Settings → Pages → **Unpublish site** (todavía puede mostrar el prototipo viejo).
- [ ] Supabase → Authentication: activar la protección de contraseñas filtradas (aviso del Security Advisor).
- [ ] Verificación en dos pasos en Vercel, Supabase y GitHub (sección 21).
- [ ] Verificar los feriados de Chile 2026–2027 precargados contra la fuente oficial.
- [ ] Cuenta en Resend: en Vercel, agregar `RESEND_API_KEY` y `EMAIL_FROM`. **Sin dominio propio, Resend solo
      entrega al email del dueño de la cuenta.** Mientras tanto, usar el modo de confirmación `auto`.
- [ ] Comprar el dominio y configurar SPF, DKIM y DMARC (necesario antes del piloto con clientes reales).
- [ ] **Antes de la Fase 3:** documentar con los hermanos su proceso actual paso a paso (sección 7.1).

## 4. Datos del proyecto

| Qué | Valor |
|---|---|
| Repositorio | `crist-alarc/agenda_peluqueria`. Rama de trabajo de Claude: `claude/nifty-mayer-hcosy2`; cuando su PR se fusiona, se reinicia desde `main` |
| Supabase | Proyecto "App Agenda Peluquería", id `yzqvvmsnpqjntuqeiskf`, región São Paulo |
| App publicada | `https://agenda-peluqueria-virid.vercel.app` (Vercel, Root Directory `apps/web`, preset Next.js) |
| Usuario del dueño | Cuenta con el email del dueño, rol `owner` en su negocio (plan `completo`) |
| Migraciones | `20261114130000_phase2d_advisor_fix`, `20261107000000_prototype_init`, `20261110120000_phase1_foundations`, `20261110130000_security_advisor_fixes`, `20261111120000_phase2a_bookings`, `20261112120000_phase2b_confirmation`, `20261112130000_phase2b_advisor_fix`, `20261113120000_phase2c_reminders`, `20261114120000_phase2d_commissions` (ver sección 6) |
| Tests (2D) | core 74 · notifications 6 · base de datos 94 · Playwright 29 |
| Tarea programada | Job de `pg_cron` `agenda-tareas-programadas` (cada 15 min) → Edge Function `recordatorios` → `/api/tareas/recordatorios`. La URL de la función está en `app.settings.reminders_function_url` (dato por ambiente) |

### Mapa del código (dónde está cada cosa)

| Tema | Lógica (`packages/core/src`) | Datos (`packages/db`) | Pantallas (`apps/web/src/app`) |
|---|---|---|---|
| Permisos y planes | `roles.ts`, `entitlements.ts` | `repositories/team.ts`, `businesses.ts` | `panel/[businessId]/equipo`, `plan` |
| Disponibilidad | `availability.ts`, `booking-context.ts`, `time.ts` | `repositories/bookings.ts` | `r/[slug]`, `panel/[businessId]/agenda` |
| Reservas y estados | `bookings.ts` | `repositories/bookings.ts` | `panel/[businessId]/agenda` |
| Confirmación y portal | — | `repositories/bookings.ts` | `reserva/*`, `mis-reservas` |
| Recordatorios | `reminders.ts` | `repositories/bookings.ts` | `api/tareas/recordatorios`, `lib/notify.ts` |
| Comisiones | `commissions.ts` | `repositories/commissions.ts` | `panel/[businessId]/comisiones/*`, `lib/commissions.ts`, `lib/settlement-report.ts` |
| Emails | — | — | `packages/notifications` (`email.ts`, `templates.ts`, `ics.ts`) |
| Validación de formularios | `schemas.ts` (Zod) | — | Server Actions en cada carpeta |

## 5. Cómo trabaja Claude en este repo (notas técnicas)

- Antes de cada push: `pnpm typecheck`, `pnpm test`, `pnpm test:db` y, si cambia la interfaz, las pruebas
  de punta a punta (e2e).
- `pnpm test:db` necesita PostgreSQL local en `localhost:5432` (usuario y clave `postgres`). Si la sesión se
  reinicia: `service postgresql start`. Los archivos de test corren en paralelo; los roles se crean sin
  carrera (PR #7).
- **Migraciones:**
  1. Probar primero con `pnpm test:db`.
  2. Aplicar en Supabase con el conector (`apply_migration`). **Avisar antes al dueño:** a veces Supabase
     pide confirmación en su app de Claude y la tarjeta vence en unos 60 segundos.
  3. Verificar que remoto = local comparando huellas: md5 de `pg_get_functiondef`, políticas, columnas, etc.
  4. Regenerar `packages/db/src/database.types.ts` y revisar el Security Advisor.
- **Pruebas de punta a punta en el entorno de Claude:** `ghcr.io` está bloqueado, así que no sirve
  `supabase start`. El stack se arma a mano con Docker:
  - contenedores `sb-db` (`supabase/postgres`), `sb-auth` (`supabase/gotrue`), `sb-rest` (`postgrest/postgrest`)
    y `sb-mail` (`axllent/mailpit`);
  - un gateway Node mínimo en `:54321` (`/auth/v1` → GoTrue, `/rest/v1` → PostgREST);
  - las claves locales son JWT HS256 firmados con el secreto de prueba;
  - una migración nueva se aplica con `docker exec -i sb-db psql ... < archivo.sql`, y después se recarga
    PostgREST con `docker kill -s SIGUSR1 sb-rest`;
  - Playwright necesita las variables de `apps/web/.env.local` exportadas: `set -a; . ./.env.local`.

  En GitHub Actions sí funciona `supabase start` (job `e2e` del CI, CLI fijada en 3.1.0). Si ese job falla
  al instalar Playwright por la red de GitHub, se reintenta.
- **Patrones establecidos:**
  - Lógica de dominio pura en `packages/core`, con tests. El acceso a datos va solo en `packages/db`.
  - Los cálculos sensibles (reservas públicas, recordatorios, comisiones) siguen el mismo camino: la base
    entrega los datos, `@agenda/core` decide y el servidor guarda con la clave de servicio, mediante
    funciones `app_*` que solo acepta `service_role`.
  - Las Server Actions validan con Zod de `@agenda/core` y devuelven `{ ok, message }`. `ActionForm` envía
    el formulario a mano para no vaciar los campos cuando hay un error, y acepta `aria-label`.
  - RLS con funciones `app.*` (esquema no expuesto). `app.current_user_id()` y `app.current_request_role()`
    son los únicos puntos que conocen al proveedor de auth.
  - Los derechos del plan se validan en el servidor (`hasFeature`) y en la base
    (`app.enforce_entitlement_limit`, `app.has_feature`).
  - Cada regla de seguridad tiene un test, y se verifica que el test falle al romper la regla.

## 6. Producción

- 2C: migración aplicada y verificada; `reminders_function_url` configurada; Edge Function `recordatorios`
  desplegada; tipos regenerados.
- 2D (2026-11-11): `20261114120000_phase2d_commissions` y `20261114130000_phase2d_advisor_fix` aplicadas. La
  huella de las 13 funciones es igual a la local. El negocio del dueño quedó en el plan `completo`, con
  comisiones activas. Tipos regenerados. En el Security Advisor no hay avisos nuevos: las funciones
  `app_*` para usuarios con sesión son intencionales y validan permisos por dentro.
- **Recordatorios:** funcionando desde el 2026-11-11. La tarea programada responde 200
  (`{"ok":true,...}`). Para revisar: `select created, status_code, content from net._http_response order by
  created desc limit 3;`. Si vuelve a dar 401, el `CRON_SECRET` de Vercel y el de los secretos de la Edge
  Function no coinciden; si da 503, falta en Vercel. Después de cambiarlo hay que volver a publicar en Vercel.

## 7. Traspaso a la Fase 3 · MVP inflables (piloto de los hermanos)

**Objetivo (sección 24):** los hermanos registran en la app sus arriendos y sus colaboraciones.

### 7.1 Primer paso obligatorio: entender el proceso actual (antes de programar)

Las directrices exigen documentar con los hermanos su proceso actual paso a paso. Guion sugerido para esa
conversación (el resultado se guarda en `docs/proceso-inflables.md`):

1. **Cómo llega un pedido:** canal (WhatsApp, Instagram, teléfono), qué datos piden y cuánto se anticipan.
2. **Catálogo:**
   - qué juegos tienen y cuántos de cada uno;
   - qué adicionales (máquinas, mesas, monitores) y cuánto stock;
   - qué tiempos de montaje y desmontaje tiene cada juego.
3. **Bloques que arriendan:** medio día, día completo, horario libre. Qué pasa con los eventos de noche o de
   varios días.
4. **Zonas:** comunas que cubre cada hermano y cómo cobran el despacho (incluido, fijo o por comuna).
5. **Logística:**
   - cuántas camionetas y personas tienen;
   - cuántos eventos pueden atender a la vez;
   - cómo planifican las rutas del día.
6. **Abono:** cuánto, cómo se paga (transferencia), cuándo se considera confirmado y qué pasa si cancelan.
7. **Condiciones del evento:** enchufe, superficie, lluvia y qué hacen cuando no se cumplen.
8. **Colaboración entre ellos:**
   - cuándo se prestan juegos y quién va a dejarlos;
   - cuánto se cobran entre ellos (la tarifa socio);
   - con qué marca atienden al cliente del otro;
   - cómo y cuándo se pagan entre ellos;
   - qué pasa si un juego se daña.
9. **Registros actuales:** cuaderno, planilla, fotos de entrega y devolución.
10. **Dolores:** qué se les olvida, qué les cuesta más y qué les gustaría ver en el teléfono.

### 7.2 Alcance de la fase (directrices, secciones 8, 14 y 24)

- **Modo `rental`:**
  - reserva por bloque;
  - dirección del evento obligatoria, validada contra la zona de cobertura (`branches.coverage_communes`
    ya existe);
  - costo de despacho configurable (incluido, monto fijo o por comuna);
  - montaje, desmontaje y traslado antes y después;
  - capacidad de logística (`resources.is_logistics` ya existe);
  - **abono manual** (registro de transferencia);
  - condiciones del evento.
- **Acuerdos entre negocios (`partnership`, sección 14):**
  - recursos compartidos;
  - modalidades `full_service` y `equipment_loan` (el enum `booking_modality` y las columnas
    `owner_business_id`, `partnership_id` y `logistics_business_id` de `booking_items` ya existen);
  - tarifa socio fija;
  - precio y cobro del vendedor;
  - "Atender como: [marca del vendedor]";
  - el margen visible para el vendedor.
- **Actas de entrega y devolución** (`handover_record`): fecha, hora, responsable, estado, fotos y daños.
  Las fotos requieren Supabase Storage, que aún no se usa.
- **Liquidación entre socios:** saldo neto por período y detalle por reserva, con estados pendiente, pagada
  y en disputa. Se puede **reutilizar el patrón de la 2D** (movimientos + liquidación inmutable al cerrar),
  pero en una tabla aparte, porque es entre negocios y no entre personas.
- **Comisiones:** agregar a la base de comisión el **despacho**, configurable si se incluye (sección 16).
  En la 2D quedó fuera porque la peluquería no tiene despacho.

### 7.3 Lo que ya sirve de la Fase 2

- **Motor de disponibilidad** (`availability.ts`): ya maneja recursos, holguras, stock de adicionales y
  zonas horarias. Para `rental` hay que agregar bloques, montaje y desmontaje como holguras por recurso,
  traslado, y la capacidad de logística como un recurso más.
- Exclusión en la base (`allocations`) contra la doble reserva, por recurso y por profesional.
- Link público, agenda, clientes, emails con `.ics`, recordatorios, registro de envíos y la tarea programada.
- Plantillas por rubro (`industry_templates`): agregar "Juegos inflables" con modo `rental`.
- Plan `completo` para los negocios de los hermanos, más un negocio de prueba en el Plan Base.

### 7.4 Preguntas abiertas para el dueño (sección 25 y nuevas)

- Valores por defecto de cancelación y daños entre socios.
- ¿El abono es un porcentaje o un monto, y es configurable por negocio? Según la regla 6, el plazo para
  pagarlo debe ser configurable.
- ¿Las fotos de las actas son obligatorias? ¿Cuántas por acta?
- ¿Cada hermano tendrá su propia cuenta y su propio negocio en la app? (Así lo suponen las directrices.)
- Nombre de la app y dominio (pendiente desde la Fase 1).

### 7.5 Propuesta de entregas (presentar el plan y esperar aprobación antes de programar)

1. **3A · Catálogo `rental`:**
   - plantilla del rubro;
   - bloques;
   - montaje y desmontaje;
   - zona de cobertura y despacho;
   - motor de disponibilidad con logística.
2. **3B · Reserva de arriendo:**
   - dirección y condiciones del evento;
   - abono manual;
   - orden de trabajo del día.
3. **3C · Acuerdos entre negocios:**
   - recursos compartidos y tarifa socio;
   - servicio completo con la marca del vendedor;
   - préstamo de equipo con actas.
4. **3D · Liquidación entre socios** y cierre de la Fase 3, con el traspaso a la Fase 4.
