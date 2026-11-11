# ADR 0004 — Fase 2C: emails, recordatorios y tiempos configurables

- **Fecha:** 2026-11-11
- **Estado:** aceptada (decisiones del dueño del proyecto del 2026-11-11)

## 1. Regla general: todo lo que tiene que ver con tiempo es configurable

El dueño fijó una regla para todo el proyecto: **toda interacción con usuarios que dependa de un
tiempo debe ser configurable por el negocio**. No se escriben plazos fijos en el código. Cada plazo se
guarda en `businesses`, con un valor por defecto razonable y límites validados con Zod y con un
`check` en la base. Se muestra en *Configuración*.

Como `DIRECTRICES.md` v1.2 es final, la regla queda registrada aquí y en `docs/ESTADO.md`. Plazos
configurables al cierre de la 2C:

| Plazo | Columna | Por defecto | Rango |
|---|---|---|---|
| Intervalo entre horarios ofrecidos | `slot_interval_minutes` | 15 min | 5–120 |
| Anticipación mínima para reservar | `min_advance_minutes` | 60 min | 0–10080 |
| Hasta cuántos días se puede reservar | `max_advance_days` | 60 días | 1–365 |
| Cancelación en línea con aviso | `cancellation_hours` | 4 h | 0–168 |
| Plazo para confirmar una reserva pendiente | `pending_hold_minutes` | 30 min | 5–1440 |
| Envío del recordatorio antes de la cita | `reminder_hours_before` | 24 h | 1–168 |
| Hora de corte para confirmar asistencia | `confirmation_cutoff_hours` | 4 h | 0–72, menor que el recordatorio |

Los tiempos internos del sistema no son interacciones con usuarios y no se configuran por negocio.
Por ejemplo, cada cuánto corre la tarea programada (15 min). Los enlaces del email vencen con su plazo
de negocio: el de confirmar vence con `pending_hold_minutes`, y los de asistencia y cancelar vencen a
la hora de la cita.

## 2. Flujo de emails (sección 18.1)

1. **Al reservar**, si el cliente tiene email:
   - **Pendiente** (modo `email`, ADR 0003): email con los botones "Confirmar reserva" y "Cancelar".
   - **Confirmada** (modo `auto` o recepción): email "Reserva confirmada" con el archivo **`.ics`** y el
     botón "Cancelar o cambiar".
2. **Antes de la cita**, a las `reminder_hours_before` horas: recordatorio con los botones
   **"Confirmo asistencia"** y **"Cancelar o cambiar"**.
3. **Reserva hecha dentro del plazo del recordatorio** (por ejemplo, hoy para mañana): el email de
   reserva confirmada ya trae "Confirmo asistencia" y cuenta como recordatorio, para no mandar dos emails
   seguidos. Lo mismo vale para el modo `email`: confirmar dentro del plazo también confirma la asistencia.
4. **Hora de corte**: si el cliente no confirmó `confirmation_cutoff_hours` horas antes, la reserva
   aparece **"Sin confirmar"** en la agenda, y el encabezado del día muestra cuántas hay. Recepción
   puede "Marcar confirmada", por ejemplo tras llamar al cliente.
5. Después de la hora de corte ya no se envía el recordatorio.

"Cancelar o cambiar" usa la página de cancelación de la 2B. Al cancelar, se ofrece "Reservar otra hora"
en el link público del negocio. Cambiar la hora en un solo paso (reprogramar) queda para después.

**Sin WhatsApp por ahora** (decisión del 2026-11-10): no hay escalamiento al paso 3 de la sección 18.1.
Los clientes sin email no reciben recordatorio y no aparecen "Sin confirmar". Cuando se elija
proveedor de WhatsApp, se agrega un `WhatsAppSender` y el canal `whatsapp` en `notification_log`, que ya
lo admite.

## 3. Decisiones en `packages/core`, envío en el servidor

- `packages/core/src/reminders.ts` (funciones puras con tests):
  - `shouldSendReminder`: ¿se envía ahora?
  - `bookingEmailAsksAttendance`: ¿el email de reserva pide la asistencia?
  - `attendanceState`: estado de la asistencia en la agenda.
  - `inAttendanceWindow` y `cutoffAt`: plazos de confirmación.
  - Las ventanas se miden en horas reales, así que funcionan igual con el cambio de horario de verano.
- "Sin confirmar" **no se guarda**: se calcula con `reminder_sent_at`, `attendance_confirmed_at`, la
  configuración del negocio y la hora actual. Así no necesita otra tarea programada ni se desincroniza.
- `apps/web/src/lib/notify.ts` arma y envía los emails con el cliente de servicio.

## 4. Tarea programada: Supabase Cron → Edge Function → app

Decisión del dueño (2026-11-10): Supabase Cron + Edge Function. La cadena es:

1. **`pg_cron`** corre `app.run_scheduled_tasks()` cada 15 minutos. Esa función:
   - libera las reservas pendientes vencidas;
   - si `app.settings.reminders_function_url` tiene valor, llama a la Edge Function con `pg_net`.
   Sin ese valor (local, tests) no llama a nada.
2. **Edge Function `recordatorios`** (`packages/db/supabase/functions/recordatorios`). No tiene lógica:
   hace `POST` a `APP_URL/api/tareas/recordatorios` con `Authorization: Bearer CRON_SECRET`.
3. **Ruta de la app** `/api/tareas/recordatorios`:
   - valida `CRON_SECRET`;
   - pide las candidatas a la base (`app_reminder_candidates`, filtro grueso);
   - decide con `shouldSendReminder` de `@agenda/core`;
   - reserva cada envío con `app_claim_reminder`, que lo marca una sola vez aunque la tarea corra dos
     veces a la vez;
   - envía y deja el registro.

**Por qué la Edge Function no ejecuta la lógica ella misma:** corre en Deno, y no puede importar los
paquetes del monorepo sin otro empaquetado. Así la lógica vive en un solo lugar, con sus tests y el
mismo proveedor de email, y la Edge Function solo "toca el timbre". Si se cambia de proveedor de tareas
programadas (Vercel Cron, un cron del servidor), solo cambia el timbre.

La Edge Function no exige sesión (`verify_jwt = false`). Llamarla de más no envía recordatorios dobles,
y la ruta de la app sí exige `CRON_SECRET`.

## 5. Registro de envíos (sección 18.2)

`notification_log` guarda cada envío:

- columnas: canal, tipo (`booking_pending`, `booking_created`, `reminder`), destinatario, estado
  (`queued`, `sent`, `failed`), error, `sent_at`, `clicked_at` y `clicked_action`;
- `clicked_action` guarda el primer botón presionado: `confirm`, `attend` o `cancel`.

Reglas:

- Cada enlace del email apunta a su envío (`booking_tokens.notification_id`). Así se mide el **clic**,
  nunca la apertura.
- El email de reserva que pide asistencia se registra como `reminder`. Así *Configuración* muestra
  "Últimos 30 días: N clientes recibieron la pregunta de asistencia y M confirmaron con el botón (X%)",
  la métrica que pide la sección 18.2 para el piloto.
- RLS: lo leen dueño, administradores y recepción del negocio. Nadie lo escribe desde el navegador;
  solo el servidor con la clave de servicio.

## 6. Configuración por ambiente (no es secreta)

`app.settings` (esquema `app`, no expuesto en la API) guarda `reminders_function_url` en producción.
Es un dato del ambiente, no un cambio de esquema, por eso se carga con un `insert` y no con una
migración. Los secretos `CRON_SECRET` y `APP_URL` van en las variables de entorno de Vercel y en los
secretos de la Edge Function. Nunca van en el repositorio.
