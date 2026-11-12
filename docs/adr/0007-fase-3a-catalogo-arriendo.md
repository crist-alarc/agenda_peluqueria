# ADR 0007 — Fase 3A: catálogo de arriendo

- **Fecha:** 2026-11-12
- **Estado:** aceptada (plan aprobado por el dueño el 2026-11-11; decisiones de base en el ADR 0006)
- **Contexto:** `docs/proceso-inflables.md` y ADR 0006, sección 2.

## 1. Modo arriendo: servicios en paralelo y día completo

En el modo `appointment` los servicios de una reserva se **encadenan** (corte → barba). En el modo `rental`
los servicios son parte del **mismo evento** (castillo + toro en un cumpleaños), así que todos empiezan a la
hora elegida.

- `services.full_day`: el juego se arrienda **por día**. El recurso queda ocupado todo el día local del evento
  (de 00:00 a 00:00 en la zona horaria del negocio), aunque se entregue en la tarde.
  - La duración y las holguras no aplican a este tipo de servicio.
  - El día de cambio de horario de verano dura 23 o 25 horas; el motor y la base lo calculan igual.
- Servicios por bloque (toro mecánico, 3 horas): son servicios normales.
  - La duración define el bloque y las holguras sirven como margen de traslado.
  - El operador es un requisito `person` con la habilidad `operador`, así que siempre lo pone el dueño del toro.
- Motor (`availability.ts`): la opción `parallel` (en `rental`) y `fullDay` por servicio.
- Base (`app_create_booking`):
  - en `rental`, todos los ítems deben empezar a la hora del evento;
  - los de día completo ocupan el día local;
  - la reserva empieza a la hora del evento y termina cuando termina su último ítem;
  - la restricción de exclusión sigue siendo la garantía contra la doble reserva.
- Unidades de un mismo juego (dos castillos iguales): son dos recursos `equipment` con la misma etiqueta
  (habilidad), y el servicio pide un recurso con esa etiqueta. Se reutiliza lo que ya existía, sin tablas nuevas.

## 2. Ficha del servicio y fotos

- `services.details` (JSON) guarda la ficha: capacidad, dimensiones, armado, desarme, electricidad, etc.
  - **Los campos los define la plantilla del rubro** (`industry_templates.config.service_fields`). Así se
    cumple la regla de no hacer tablas por rubro (principio 4).
  - Se validan en el servidor (`parseServiceDetails`) y se muestran con `describeServiceDetails`.
  - Editar la lista de campos desde la app queda para después; por ahora la define la plantilla.
- Fotos: tabla `service_photos` con RLS, y bucket público `catalogo` en Supabase Storage.
  - Ruta: `<negocio>/<servicio>/<archivo>`. Un trigger valida que corresponda al servicio y limita a 6 fotos.
  - Formatos JPG, PNG o WebP de hasta 4 MB: Vercel corta las peticiones de más de 4,5 MB.
  - Subida: el servidor valida el permiso `catalog.manage` y sube el archivo con la clave de servicio. La
    fila se guarda con la sesión del usuario, así RLS vuelve a validar el permiso. Si la fila falla, se borra
    el archivo.
  - El acceso a Storage está solo en `packages/db/src/storage.ts` (principio de portabilidad, sección 3.1).

## 3. Despacho y zonas

- `branches.delivery_mode`:
  - `included`: el despacho va incluido en el precio;
  - `fixed`: se cobra el monto `delivery_fee`;
  - `by_zone`: se cobra el costo de cada zona.
- `delivery_zones` (RLS): zonas con **nombre libre** y costo por sucursal. Reemplaza a
  `branches.coverage_communes`, que nunca se usó (ADR 0006, decisión 1).
- Regla (`deliveryQuote`):
  - si la sucursal tiene zonas activas, la zona es obligatoria y define qué se atiende;
  - sin zonas, se atiende cualquier dirección, salvo en el modo `by_zone`, que necesita zonas.
- En la 3A el link público muestra las zonas y sus costos. **Elegir la zona y la dirección al reservar, y
  sumar el despacho al total, se hace en la 3B**, junto con la dirección del evento.

## 4. Capacidad de los camiones

- `resources.max_events_per_day` en los recursos de logística.
- `logisticsLoad`:
  - suma los topes de los camiones de la sucursal;
  - compara esa suma con las reservas activas del día;
  - la agenda muestra un aviso cuando se llega al tope ("completos") o se supera.
- **No bloquea** las reservas (ADR 0006, decisión 2).
- La asignación de cada evento a un camión, y la ruta, quedan para la orden de trabajo (3B).

## 5. Precios en el link público

- `businesses.show_public_prices`. Si está desactivado, `app_public_business` **no entrega ningún monto**
  (servicios, adicionales, despacho y zonas llegan como `null`). No basta con ocultarlos en pantalla.
- El email al cliente tampoco muestra el total en ese caso.

## 6. Plantilla "Juegos inflables"

Viene con los datos de la entrevista:

- **Castillo inflable:** día completo, con ficha y etiqueta `castillo`.
- **Toro mecánico:** bloques de 3 horas con 60 minutos de traslado antes y después, etiqueta `toro` y
  operador.
- Sin adicionales.
- Los campos de la ficha del rubro.

Los negocios ya creados no cambian. Para usar un juego, el negocio crea sus recursos `equipment` con la
etiqueta.

## 7. Lo que queda para la 3B y la 3C

- **3B:** dirección y referencia del evento, zona y despacho en la reserva, preguntas del evento, abono,
  orden de trabajo del día con lo que hay que llevar y traer, y asignación de camión.
- **3C:** acuerdos, juegos del socio en el catálogo y reemplazo de un juego dañado.
