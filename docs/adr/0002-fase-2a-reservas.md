# ADR 0002 — Fase 2A: reservas

- **Fecha:** 2026-11-10
- **Estado:** aceptada
- **Contexto:** primera entrega de la Fase 2 (MVP peluquería). Plan aprobado por el dueño del proyecto
  el 2026-11-10, con estas decisiones: códigos de invitado por email (2B), dominio de email más adelante,
  recordatorios con Supabase Cron + Edge Function (2C), piloto real más adelante.

## 1. Plan de la Fase 2 en cuatro entregas

| Entrega | Contenido |
|---|---|
| **2A** | Motor de disponibilidad, reservas, link público, agenda de recepción, clientes |
| 2B | Portal del cliente, cancelación por el cliente, invitados verificados con código por email |
| 2C | Emails de confirmación (.ics) y recordatorios con confirmación por clic |
| 2D | Comisiones del equipo y liquidaciones |

## 2. Dónde vive cada regla

- **Motor de disponibilidad** (`packages/core/src/availability.ts`): horarios de sucursal y recurso,
  feriados, bloqueos, habilidades, holguras, servicios encadenados, stock de adicionales, anticipación
  mínima/máxima y horario de verano. Funciones puras con tests.
- **Servidor** (`apps/web/src/lib/booking.ts`): carga los datos con `app_booking_context`, calcula los
  horarios y, al reservar, **vuelve a calcular** el horario elegido antes de guardar.
- **Base de datos** (`app_create_booking`): garantías finales que no dependen del servidor:
  - no hay doble reserva: restricciones de exclusión por recurso **y** por profesional (`allocations`);
  - la reserva se guarda completa o no se guarda;
  - los recursos son de la sucursal y cubren los requisitos del servicio;
  - los servicios son consecutivos, el horario es futuro y el stock de adicionales alcanza;
  - los precios y el total se toman de la base (no del navegador).

  Los horarios de atención, feriados y bloqueos los valida el motor en el servidor. Recepción puede
  agendar sin la anticipación mínima del link público.

## 3. Link público con clave de servicio

El navegador **no** puede crear reservas directamente (`anon` no tiene permiso sobre
`app_create_booking`). El link público llama a una Server Action que valida con Zod y con el motor, y
luego crea la reserva con un cliente de servicio (`SUPABASE_SECRET_KEY`, solo en el servidor,
sección 21). La función reconoce ese rol con `app.current_request_role()`, que —igual que
`app.current_user_id()`— es el único punto que conoce al proveedor de autenticación.

En 2A el link público confirma la reserva solo con nombre y teléfono. En 2B se agrega la verificación
con código por email para invitados. Hasta entonces no hay límite de reservas por persona: es un riesgo
conocido (reservas falsas) que se mitiga en 2B.

## 4. Privacidad

- `app_booking_context` entrega las ocupaciones de un profesional en **otros** negocios solo como
  horario ocupado, sin recurso ni cliente (sección 10.3).
- `app_public_business` no expone identificadores de profesionales, emails ni teléfonos de personas.
- Clientes (`customers`): los ven recepción y quienes ven alguna de sus reservas.

## 5. Quién ve qué reserva

`app.can_view_booking()`: recepción de la sucursal (owner/admin, o branch_admin/receptionist asignados),
quien la vendió, o el profesional que la atiende. Para que un profesional (rol `staff`) vea su propia
agenda, el dueño vincula su recurso a la cuenta del equipo en *Recursos* (`professionals.user_id`, solo a
miembros del negocio).

Recepción solo puede cambiar `status`, `notes` y `cancel_reason` (permisos por columna). Las
transiciones de estado se validan en `@agenda/core` y en un trigger; cancelar o "no asistió" libera los
recursos y el stock.

## 6. Corrección de seguridad de la Fase 1

Un negocio podía vincular a uno de sus recursos el profesional de otro negocio si conocía su
identificador. Ahora `app.can_link_professional()` solo permite profesionales registrados por el mismo
negocio (o la propia persona). La colaboración entre negocios llega en la fase 4 con acuerdo explícito.

## 7. Configuración de reservas por negocio

`businesses`: intervalo entre horarios, anticipación mínima, días hacia adelante, horas de aviso para
cancelar y link público activo/inactivo. Editables en *Configuración*.
