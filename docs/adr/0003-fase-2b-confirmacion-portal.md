# ADR 0003 — Fase 2B: confirmación por email y portal del cliente

- **Fecha:** 2026-11-11
- **Estado:** aceptada (decisiones del dueño del proyecto del 2026-11-11)

## 1. Confirmación con un botón, no con un código

El dueño pidió que el cliente confirme con un **botón en el email** en vez de digitar un código. El
enlace lleva un token aleatorio de un solo uso; hacer clic demuestra que el email es del cliente, que es
la verificación que exige la sección 5.3 ("nunca vincular sin verificación").

- En la base solo se guarda el **hash SHA-256** del token (`booking_tokens`, RLS sin políticas: nadie la
  lee desde la app). Los tokens los crea solo el servidor (`app_create_booking_token`, rol de servicio).
- `app_use_booking_token(hash)` confirma o cancela y devuelve un resumen sin datos internos.
- **Confirmar** se hace al abrir el enlace (repetirlo no hace daño). **Cancelar** pide un segundo clic,
  porque algunos correos abren los enlaces automáticamente para revisarlos.

## 2. Modo de confirmación por negocio

`businesses.public_confirmation_mode`:

- `auto` (por defecto): la reserva del link público queda confirmada al instante. En 2C se envía el
  recordatorio con botón de confirmación (sección 18.1).
- `email`: el email es obligatorio; la reserva queda `pending` y **aparta el horario** durante
  `pending_hold_minutes` (30 por defecto). Si no se confirma, se cancela sola con motivo
  "No se confirmó a tiempo" y el horario se libera.

En ambos modos el negocio puede confirmar o cancelar desde la Agenda. El estado pendiente lo fija un
trigger (`app.booking_before_insert`), sin cambiar `app_create_booking`.

Las pendientes vencidas se liberan al crear cualquier reserva, al usar un token y antes de calcular
horarios (`app_expire_pending`). En 2C se agrega una tarea programada (Supabase Cron).

## 3. Portal del cliente ("Mis reservas")

- `app_link_my_customers()` vincula las fichas de cliente con la cuenta **solo si el email de la cuenta
  está verificado** (`app.current_user_email()`, único punto que lee `auth.users`).
- `app_my_bookings()` lista las reservas de la cuenta en todos los negocios, sin datos internos.
- `app_customer_cancel_booking()` respeta la política `cancellation_hours` del negocio.
- `app.can_view_booking()` incluye al cliente dueño de la reserva.

## 4. Emails detrás de una interfaz propia

`packages/notifications`: `EmailSender` con `ResendSender` (producción, `RESEND_API_KEY`),
`MailpitSender` (desarrollo y tests, `MAILPIT_URL`) y `LogSender` (sin proveedor: solo registra).
Plantillas en español con la marca visible de la reserva.

**Limitación conocida:** sin dominio propio verificado, Resend solo entrega al email del dueño de la
cuenta. Hasta comprar el dominio, el modo recomendado es `auto` (o `email` solo para pruebas).
