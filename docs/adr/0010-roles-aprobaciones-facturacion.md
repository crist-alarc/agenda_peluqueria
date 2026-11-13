# ADR 0010 — Consola A3a: roles de la plataforma, aprobaciones, planes free y datos de facturación

- **Fecha:** 2026-11-13
- **Estado:** aceptada (decisiones del dueño del proyecto del 2026-11-13)
- **Contexto:** ADR 0008 (consola), ADR 0009 (planes y cobro). La A3 (facturación a los clientes) se dividió en
  dos entregas: **A3a** (este ADR) y **A3b** (cobros mensuales, sucursales por días, prueba, alertas de no pago y
  Excel). Después viene la **A4** (ejecutivos comerciales y acuerdos).

## 1. Roles de la plataforma

`platform_admins.role` tiene tres valores:

| Rol | Puede |
|---|---|
| `owner`: dueño de la plataforma | Todo. Es el único que aprueba planes nuevos y cambios de planes, y administra el equipo. |
| `admin`: administrador | Gestionar clientes, planes y cobros. Autorizar planes free. Proponer planes. |
| `agent`: agente de soporte | Mirar, pedir accesos de soporte y **solicitar** planes free, sin autorizarlos. |

- El rol por defecto es `agent`, el más limitado. Quien ya administraba la plataforma quedó como `owner`.
- Las funciones que cambian planes, cobros o el estado de un negocio exigen `app.require_platform_manager()`
  (dueño o administrador). Las de solo lectura siguen con `app.require_platform_admin()`.
- El equipo se administra en `/admin/equipo`, y solo lo cambia el dueño. Nadie cambia su propio rol.

## 2. Planes que requieren aprobación

- Si **el dueño** crea un plan o cambia sus funciones o precios, el cambio queda aprobado de inmediato, como en la
  A2.
- Si lo hace **un administrador**, se crea una versión con `status = 'pending'` y no cambia nada hasta que el
  dueño la apruebe en `/admin/aprobaciones` (`app_admin_decide_plan_version`).
  - Un plan nuevo propuesto por un administrador no tiene versión vigente, así que no se ofrece ni se asigna.
  - Hay una sola propuesta pendiente por plan. Si el administrador la vuelve a guardar, se corrige la misma.
  - El nombre, la visibilidad, el archivo y el tipo free de un plan existente solo los cambia el dueño.
- Las versiones rechazadas quedan en el historial con su nota.

## 3. Planes free

- `plans.is_free`: plan sin cobro. Sus tramos tienen precio 0, no se ofrece al registrarse y **no se asigna con un
  cambio de plan normal**.
- Se asigna con `app_admin_request_free_plan`:
  - Si lo pide el dueño o un administrador, queda autorizado y se aplica.
  - Si lo pide un agente, queda pendiente hasta que **otro** administrador lo autorice. Quien pide nunca autoriza
    su propia solicitud.
- La fecha de término es opcional. El caso de los hermanos de los juegos, por ayudar con el piloto, es indefinido.
  - Si tiene término, se elige a qué plan con cobro pasa.
  - La tarea programada (`app.expire_free_plans`) hace el cambio ese día, y el plan nuevo se cobra desde el día
    siguiente, como cualquier cambio.
- Todo queda en `free_plan_grants`: quién pidió, quién autorizó y el motivo. Reemplaza a la marca "sin cobro" que
  se había propuesto.

## 4. Datos de facturación obligatorios

- `business_billing_profiles`, uno por negocio. Lo que pide cada documento:
  - **Boleta:** nombre y email (el RUT es opcional).
  - **Factura:** RUT válido (módulo 11), razón social, giro, dirección, comuna y email.
  - **Fuera de Chile:** factura de exportación, con identificación tributaria, nombre, dirección y email.
- Los guarda el **dueño del negocio** (`app_save_billing_profile`) o la **plataforma**
  (`app_admin_save_billing_profile`). El rol `admin` del negocio no los ve, porque la facturación de la
  suscripción es del dueño.
- Al completarlos en un segundo negocio, el panel sugiere los datos del primero.

### Días de gracia

- `businesses.billing_grace_until`: **último día hábil del mes del alta**, sin contar fines de semana ni feriados
  de `holidays`.
  - Si quedan menos días corridos que el mínimo configurable (`platform_settings.billing_grace_min_days`, 15 por
    defecto), el plazo pasa al último día hábil del mes siguiente.
  - Para los negocios que ya existían se aplicó la misma regla desde el día de la migración.
- Mientras falten los datos, el panel muestra un aviso con la fecha límite y los días que quedan.
- **Con el plazo vencido** (`app.billing_status = 'blocked'`):
  - el panel muestra "El panel está en pausa", salvo en Facturación y Plan;
  - las acciones se rechazan en el servidor (`requireWritableBusiness`);
  - el link público no aparece;
  - no se pueden crear reservas (`app_booking_context` y `app_create_booking`);
  - las reservas ya tomadas y sus recordatorios siguen.
- La plataforma puede dar más plazo a un negocio (`app_admin_extend_billing_grace`).

## 5. Cómo se cambiaron las funciones existentes

Para no copiar funciones largas, la migración usa una ayuda temporal (`pg_temp.patch_function`). Esa ayuda:

- reemplaza un trozo exacto del cuerpo de una función;
- falla si no lo encuentra, así que un cambio inesperado en producción detiene la migración en vez de aplicar algo
  a medias.

Se usó para:

- `require_platform_manager` en las acciones de la A2;
- el bloqueo por facturación en `app_public_business`, `app_booking_context` y `app_create_booking`;
- excluir los planes free al registrarse.

## 6. Pendiente

- **A3b:** cobros mensuales a mes vencido, con:
  - estados *por facturar → facturado (folio) → pagado*, o anulado;
  - sucursales adicionales cobradas por días de uso;
  - período de prueba por plan;
  - alertas de no pago;
  - exportación a Excel (`.xlsx`).
- **A4:** ejecutivos comerciales con acuerdos comerciales a mes vencido:
  - comisión en % o monto fijo, que puede variar por plan;
  - se gana al facturar o al pagar, según el acuerdo;
  - modalidad de reventa, en la que el ejecutivo cobra y paga licencia. Sus negocios no se bloquean por datos de
    facturación.
- Pantalla propia para los ejecutivos, después de la A4.
- La verificación en dos pasos para `/admin` es ahora más importante: hay roles que aprueban.
