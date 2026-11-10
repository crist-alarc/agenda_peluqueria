# ADR 0001 — Decisiones de la Fase 1 (Fundaciones)

- **Fecha:** 2026-11-10
- **Estado:** aceptada
- **Contexto:** implementación de la Fase 1 de `docs/DIRECTRICES.md` (v1.2). Este documento registra las
  decisiones de arquitectura tomadas que no estaban explícitas en las directrices (regla 26.9).

## 1. Reemplazo del prototipo

El prototipo (Vite + React, una sola peluquería, GitHub Pages) se eliminó. Su migración se conserva en
`packages/db/supabase/migrations/20261107000000_prototype_init.sql` porque ya estaba aplicada en Supabase;
la migración de la Fase 1 borra sus tablas. Aprobado por el dueño del proyecto el 2026-11-10.

## 2. Esquema interno `app` para funciones de permisos

Las funciones auxiliares de RLS (`app.current_user_id()`, `app.is_business_member()`,
`app.can_manage_business()`, `app.can_manage_branch()`, etc.) viven en el esquema `app`, que **no** se
expone por la API de Supabase. Solo dos funciones se exponen como RPC en `public`:

- `app_create_business(...)`: alta atómica de organización + negocio + dueño + sucursal + plan + plantilla.
- `app_add_member(...)`: agregar o cambiar el rol de un miembro por email.

Ambas son `SECURITY DEFINER` y validan los permisos dentro de la función. El Security Advisor de Supabase
las marca como advertencia; es intencional.

## 3. Una organización por dueño

La primera vez que alguien crea un negocio se crea su organización; los negocios siguientes se agregan a
la misma. Si en el futuro un dueño necesita varias organizaciones, el modelo ya lo permite.

## 4. Membresías: un rol por negocio + sucursales asignadas

`memberships` tiene un rol por persona y negocio (`unique (user_id, business_id)`). El alcance por
sucursal (para `branch_admin`, `receptionist`, `staff`, `seller`) se guarda en `membership_branches`.
Sin filas ahí = sin restricción por sucursal. Un negocio nunca puede quedarse sin dueño (trigger).

## 5. Límites del plan en dos capas

Los límites (`branches`, `resources`) se validan:

1. en el servidor con `checkLimit()` de `@agenda/core`, para dar un mensaje claro, y
2. en la base con el trigger `app.enforce_entitlement_limit`, como garantía final.

Los derechos de cada negocio se copian del plan a `business_entitlements` al crearlo, para que los
add-ons y ajustes manuales se puedan agregar sin tocar el plan. La app no puede escribir esas tablas.

## 6. Identidad de profesionales

Un recurso `person` siempre apunta a un `professional` (identidad global, sección 13). En la Fase 1 el
profesional lo crea el negocio (`created_by_business_id`); vincularlo a una cuenta (`user_id`) queda para
la fase 4 (agenda consolidada).

## 7. Auditoría genérica

`app.audit_row()` registra inserciones, cambios y borrados de las tablas de negocio con valores antes y
después y el usuario que los hizo. Nadie puede escribir ni borrar `audit_log` desde la app.

## 8. Capa de datos y autenticación

- `@agenda/db` es el único paquete que importa `supabase-js`. Expone repositorios por entidad que reciben
  un `DbClient` y traducen errores de PostgreSQL a mensajes en español.
- `@agenda/auth` envuelve Supabase Auth. Junto con `app.current_user_id()` son lo único que hay que
  cambiar si se migra de proveedor de autenticación.
- El cliente se crea siempre en el servidor (Server Components, Server Actions y `proxy.ts` de Next.js)
  con la clave pública; todas las consultas pasan por RLS.

## 9. Formularios

Las Server Actions validan con los esquemas Zod de `@agenda/core` y devuelven `{ ok, message }`.
El componente `ActionForm` envía el formulario manualmente para que React no vacíe los campos cuando
hay un error de validación.

## 10. Pruebas

- `packages/core`: Vitest (permisos, límites, montos CLP, horarios y horario de verano de Santiago).
- `packages/db/test`: Vitest contra un PostgreSQL limpio con un stub mínimo de Supabase. Prueba el
  aislamiento entre negocios y los permisos de cada rol.
- `apps/web/e2e`: Playwright contra Supabase local (CLI) con emails reales en Mailpit.

## 11. Configuración pública en el repositorio

`apps/web/.env.production` contiene la URL y la clave *publishable* de Supabase. No son secretos (la
seguridad la da RLS), y así Vercel no necesita variables configuradas a mano. Los secretos
(`service_role`, claves de proveedores) nunca van al repositorio.

## 12. Feriados

Se precargan los feriados de Chile 2026–2027 en `holidays`. **Deben verificarse contra la fuente oficial**
y agregarse los años siguientes con nuevas migraciones.
