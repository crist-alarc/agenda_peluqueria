# Estado del proyecto y traspaso

> Documento vivo para retomar el trabajo en una sesión nueva sin perder contexto.
> **Fuente de verdad:** `docs/DIRECTRICES.md` (v1.2, final según el dueño). Decisiones: `docs/adr/`.
> Última actualización: 2026-11-12 (**Fase 3 en curso**: 3·0 y 3A en producción; sigue la 3B).

## 1. Dónde estamos

| Fase | Estado |
|---|---|
| 1 · Fundaciones | **Cerrada** (aprobada). ADR 0001. PR #3 |
| 2 · MVP peluquería | **Programada completa** (2A–2D). Falta su criterio de término: *una peluquería real opera una semana* (piloto, más adelante por decisión del dueño) |
| 2A · Reservas | En `main` (PR #5, ADR 0002): motor de disponibilidad, link público `/r/<slug>`, agenda de recepción, clientes |
| 2B · Confirmación y portal | En `main` (PR #6, ADR 0003): botón "Confirmar" en el email, modo auto/email, `/mis-reservas` |
| 2C · Emails y recordatorios | En `main` (PR #8, ADR 0004): email con `.ics`, recordatorio configurable, "Sin confirmar", registro de envíos, tarea programada |
| 2D · Comisiones | Hecha (ADR 0005): reglas, reparto entre profesionales (receta o manual por % o minutos), ajustes, liquidaciones cerradas inmutables, Excel y PDF para teléfono |
| 3 · MVP inflables | **En curso.** Proceso documentado (`docs/proceso-inflables.md`); plan aprobado (ADR 0006, sección 7.5) |
| 3·0 · País y moneda | Hecha (ADR 0006): `businesses.country` y `currency`, montos sin sufijo `_clp`, `formatMoney`/`parseMoney`. PR #12, **en producción** desde el 2026-11-12 |
| 3A · Catálogo de arriendo | Hecha (ADR 0007): día completo y servicios en paralelo, ficha y fotos (Storage), zonas de despacho libres, tope de camiones con aviso, precios ocultos, catálogo y ficha en `/r/<slug>`. PR #13, **en producción** desde el 2026-11-12 |
| Consola `/admin` · A1 | Hecha (ADR 0008): clientes de la plataforma, ficha, acceso de soporte aprobado por el negocio, vista de solo lectura. PR #15, **en producción** desde el 2026-11-12; el dueño es administrador |
| Consola `/admin` · A2 | Hecha (ADR 0009): empresas emisoras e impuestos por país, planes con versiones (CLP y USD, netos), elegir plan al registrarse, tramos y prorrateo, funciones puntuales, suspensión. En producción desde el 2026-11-12 |
| Consola `/admin` · A3a | Hecha (ADR 0010): roles de la plataforma (dueño, administrador, agente), aprobación de planes por el dueño, planes free con autorización, datos de facturación obligatorios con días de gracia y pausa. PR #17, en producción desde el 2026-11-13 |
| Consola `/admin` · A3b | **Siguiente**: cobros mensuales a mes vencido (folio SII, pagado, anulado), sucursales por días, período de prueba, alertas de no pago, Excel |
| Consola `/admin` · A4 | Ejecutivos comerciales y acuerdos comerciales (ADR 0010, sección 6) |
| 3B · Reserva de arriendo | Después de la consola (decisión del dueño del 2026-11-12) |

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
12. (2026-11-11) **País y moneda configurables por negocio**; los decimales dependen de la moneda (ADR 0006).
    Por ahora solo Chile y CLP.
13. (2026-11-11) Fase 3: zonas libres (no comunas), aviso (no bloqueo) por tope de camiones, precios
    visibles u ocultos en el link público, acuerdos con cualquier negocio y cargo por servicio genérico.
    Detalle en el ADR 0006, sección 2.
14. (2026-11-12) **Consola de la plataforma `/admin`** antes de la 3B (ADR 0008). Los clientes son los dueños de
    negocios. Soporte ve la configuración solo con la aprobación del negocio (dueño o designados), por un tiempo que
    elige quien aprueba; nunca ve reservas ni datos de clientes finales. Facturación a los clientes: manual
    (portal del SII) por ahora. Precios de los planes: pendientes.
15. (2026-11-12) El diseño de pantallas se trabaja con el skill `anthropic-skills:frontend-design`.
16. (2026-11-12) Planes y cobro (ADR 0009):
    - una empresa que factura y una regla de impuesto por país (Chile 19%; resto del mundo en USD, exento);
    - precios netos por moneda;
    - versiones de plan: el sistema sugiere si es mejora y el dueño decide;
    - prorrateo por días calendario desde el día siguiente al cambio;
    - los días suspendidos no se cobran y solo la plataforma suspende;
    - el negocio elige su plan al registrarse.
17. (2026-11-13) Facturación a los clientes (ADR 0010):
    - se cobra a mes vencido;
    - datos de facturación por negocio, obligatorios: plazo hasta el último día hábil del mes del alta (mínimo
      15 días, configurable); vencido, el panel y el link público se pausan;
    - roles de la plataforma: el dueño aprueba los planes; un administrador autoriza los planes free;
    - plan free por negocio, con fecha de término opcional (el de los hermanos, indefinido);
    - sucursales adicionales cobradas por días de uso;
    - período de prueba configurable por plan;
    - alertas de no pago para decidir la suspensión;
    - exportación a Excel (`.xlsx`).
18. (2026-11-13) Ejecutivos comerciales (A4): venden la plataforma, no son los vendedores de la Fase 4.
    - Trabajan con acuerdos comerciales a mes vencido, con inicio y fin (o indefinido).
    - Comisión en % o monto fijo, que puede variar por plan; se gana al facturar o al pagar, según el acuerdo.
    - Modalidad de reventa: la empresa del ejecutivo cobra a sus clientes y paga licencia; esos negocios no se
      cortan. El dueño se hace cargo si el ejecutivo no paga (revisar con abogado).

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
- [ ] **Requisito pendiente (ADR 0008):** verificación en dos pasos obligatoria para entrar a `/admin`. Por ahora
      se entra con la cuenta normal; hacerla antes de sumar otros agentes o antes del piloto.
- [ ] **Requisito pendiente (dueño, 2026-11-13):** los ejecutivos comerciales tendrán su propia pantalla de
      administración (su cartera de negocios, sus acuerdos y comisiones). Después de la A4; requiere la
      verificación en dos pasos.
- [x] **Antes de la Fase 3:** documentar con los hermanos su proceso actual paso a paso (sección 7.1). Hecho: `docs/proceso-inflables.md`.

## 4. Datos del proyecto

| Qué | Valor |
|---|---|
| Repositorio | `crist-alarc/agenda_peluqueria`. Rama de trabajo de Claude: `claude/modest-dirac-nxeqle`; cuando su PR se fusiona, se reinicia desde `main` |
| Supabase | Proyecto "App Agenda Peluquería", id `yzqvvmsnpqjntuqeiskf`, región São Paulo |
| App publicada | `https://agenda-peluqueria-virid.vercel.app` (Vercel, Root Directory `apps/web`, preset Next.js) |
| Usuario del dueño | Cuenta con el email del dueño, rol `owner` en su negocio (plan `completo`) |
| Migraciones | `20261119120000_platform_roles_billing_profiles`, `20261118130000_platform_plans_advisor_fix`, `20261118120000_platform_plans`, `20261117120000_platform_admin`, `20261116120000_phase3a_rental_catalog`, `20261115120000_phase3_currency`, `20261114130000_phase2d_advisor_fix`, `20261107000000_prototype_init`, `20261110120000_phase1_foundations`, `20261110130000_security_advisor_fixes`, `20261111120000_phase2a_bookings`, `20261112120000_phase2b_confirmation`, `20261112130000_phase2b_advisor_fix`, `20261113120000_phase2c_reminders`, `20261114120000_phase2d_commissions` (ver sección 6) |
| Tests (A3a) | core 134 · notifications 7 · base de datos 167 · Playwright (corren en el CI) |
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
| Dinero (moneda del negocio) | `money.ts` (`formatMoney`, `parseMoney`) | — | Configuración |
| Arriendo (fase 3) | `rental.ts` (despacho, camiones, ficha), `availability.ts` (`parallel`, `fullDay`) | `repositories/catalog.ts`, `branches.ts`, `storage.ts` | `r/[slug]`, `r/[slug]/s/[serviceId]`, `panel/[businessId]/rental-actions.ts`, `sucursales/delivery.tsx`, `lib/catalog.ts` |
| Consola de la plataforma | `support.ts`, `billing.ts`, `plan-forms.ts` | `repositories/platform.ts`, `plans.ts` | `admin/*`, `panel/[businessId]/soporte`, `support-actions.ts`, `components/support-access.tsx` |
| Validación de formularios | `schemas.ts` (Zod; los esquemas con montos reciben la moneda) | — | Server Actions en cada carpeta |

## 5. Cómo trabaja Claude en este repo (notas técnicas)

- Antes de cada push: `pnpm typecheck`, `pnpm test`, `pnpm test:db` y, si cambia la interfaz, las pruebas
  de punta a punta (e2e).
- `pnpm test:db` necesita PostgreSQL local en `localhost:5432` (usuario y clave `postgres`). Si la sesión se
  reinicia: `service postgresql start`; en un contenedor nuevo, además:
  `su postgres -c "psql -c \"alter user postgres password 'postgres'\""`. Los archivos de test corren en paralelo; los roles se crean sin
  carrera (PR #7).
- **Migraciones:**
  1. Probar primero con `pnpm test:db`.
  2. Aplicar en Supabase con el conector (`apply_migration`). **Avisar antes al dueño:** Supabase pide
     confirmación y la tarjeta vence en unos 60 segundos. **La tarjeta aparece en el navegador, no en la app
     del teléfono** (2026-11-12): el dueño debe tener esta conversación abierta en el navegador.
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
- Consola A3a (2026-11-13): `platform_roles_billing_profiles` aplicada **a mano por el dueño desde el SQL Editor**,
  porque el conector de Supabase falló con un error 502 en esa sesión. Se registró en
  `supabase_migrations.schema_migrations`. Verificado: rol `owner`, plazo 2026-11-30 en los negocios existentes,
  mínimo 15 días y funciones creadas. **Pendiente cuando vuelva el conector:** regenerar `database.types.ts` desde
  producción (hoy está editado a mano) y revisar el Security Advisor.
  - Si el SQL Editor responde "column role already exists", la migración ya estaba aplicada: no repetirla.
- Consola A2 (2026-11-12): `platform_plans` y `platform_plans_advisor_fix` aplicadas. Huella igual a la local en
  las 29 funciones nuevas o cambiadas. Los 2 negocios existentes quedaron con versión de plan y su primer tramo.
  Tipos regenerados desde producción. Security Advisor: `app.platform_today` sin search_path fijo (corregido con
  `platform_plans_advisor_fix`); `billing_entities`, `plan_versions` y `tax_rules` sin políticas es intencional
  (solo se leen por funciones `app_admin_*`). Ojo: el PR #16 también se fusionó antes de aplicar la migración.
  **Pendiente del dueño:** precios de Base y Completo en `/admin/planes`, nombre y RUT en `/admin/facturacion`, y
  confirmar con su contador la exención de exportación.
- Consola A1 (2026-11-12): `platform_admin` aplicada; huella igual a la local (11 funciones, columnas y políticas).
  El dueño quedó en `platform_admins`. Tipos regenerados. Security Advisor: las 7 funciones nuevas aparecen como
  "usuarios con sesión pueden ejecutarlas", intencional (validan admin o aprobador por dentro); ninguna para anónimos.
  Ojo: el PR se fusionó antes de aplicar la migración y el panel falló unos minutos; aplicar antes de fusionar.
- 3A (2026-11-12): `phase3a_rental_catalog` aplicada. Huella igual a la local en las 6 funciones tocadas, las
  columnas de `public`, las políticas de `delivery_zones` y `service_photos` y la plantilla de inflables. Bucket
  `catalogo` creado (público, 4 MB, JPG/PNG/WebP). Tipos regenerados sin diferencias con los escritos a mano.
  Security Advisor sin avisos nuevos.
- **Orden de despliegue:** si la migración solo agrega cosas, aplicarla **antes** de fusionar el PR. Así la app
  publicada no se cae.
- 3·0 (2026-11-12): `phase3_currency` aplicada. La huella de las 14 funciones y la de las columnas de
  `public` son iguales a las locales. Tipos regenerados (sin diferencias). Security Advisor sin avisos nuevos.
- **Recordatorios:** funcionando desde el 2026-11-11. La tarea programada responde 200
  (`{"ok":true,...}`). Para revisar: `select created, status_code, content from net._http_response order by
  created desc limit 3;`. Si vuelve a dar 401, el `CRON_SECRET` de Vercel y el de los secretos de la Edge
  Function no coinciden; si da 503, falta en Vercel. Después de cambiarlo hay que volver a publicar en Vercel.

## 7. Fase 3 · MVP inflables (piloto de los hermanos)

> **Estado:** entrevista hecha (`docs/proceso-inflables.md`), decisiones en el ADR 0006, 3·0 hecha.
> Lo que sigue de esta sección es el traspaso original; la 7.5 es el plan aprobado.

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

### 7.5 Entregas (plan aprobado el 2026-11-11)

0. **3·0 · País y moneda** (hecha, ADR 0006).
1. **3A · Catálogo `rental`** (hecha, ADR 0007):
   - ficha de cada juego como un servicio con datos del rubro (capacidad, dimensiones, armado, desarme,
     electricidad), fotos en Supabase Storage y unidades por etiqueta;
   - bloque por servicio: día completo o bloques de N horas (toro mecánico: 3 h + operador);
   - margen de traslado por servicio, ajustable por reserva;
   - zonas de despacho libres por sucursal, con costo (incluido, fijo o por zona);
   - tope de eventos por día por camión, con aviso;
   - precios visibles u ocultos en el link público;
   - catálogo tipo tienda en `/r/<slug>`.

   Lo que seguía en la propuesta original:
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
