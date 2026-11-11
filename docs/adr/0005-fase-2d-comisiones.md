# ADR 0005 — Fase 2D: comisiones del equipo y liquidaciones

- **Fecha:** 2026-11-11
- **Estado:** aceptada (decisiones del dueño del proyecto del 2026-11-11)

## 1. Reglas de comisión

`commission_rules` guarda, por negocio, un **porcentaje** (en puntos básicos: 40% = 4000) o un **monto fijo**
en CLP por servicio. Cada regla puede ser para una persona, para un servicio, para ambos o general. Gana la
**más específica**: persona + servicio, luego servicio, luego persona y al final la general (`findRule` en
`@agenda/core`).

- Solo hay una regla activa por combinación de persona y servicio (índice único parcial). Al cambiar una
  regla, la anterior queda inactiva y se conserva en el historial y en la auditoría.
- Los **adicionales** suman a la base solo si la regla lo indica y solo en reglas de porcentaje. Se reparten
  entre los servicios de la reserva según su precio y después según el reparto de cada servicio.
- Sin regla, el servicio no genera comisión (monto 0, para que quede el registro).
- **Despacho:** no aplica en la Fase 2 (peluquería). Se agrega en la Fase 3, cuando exista el costo de despacho.

## 2. Servicios hechos por varias personas (decisión del dueño)

El reparto es **proporcional y lo decide el negocio**. Siempre se valida que sume **100%**, en el servidor
(`validateShares`) y en la base.

1. **Receta del servicio** (`service_commission_roles`). Ejemplo: peluquería canina 70% y secado 30%.
   - Si un rol exige una habilidad, se asigna a quien la tiene en Recursos.
   - Si la receta no calza con las personas que participaron, se reparte en partes iguales.
2. **Reparto manual por reserva** (`booking_item_shares`), por porcentaje o por **minutos trabajados**:
   - La app convierte los minutos a porcentaje con el método del mayor resto, sin perder ni sobrar puntos.
   - Cubre el caso de quien empezó un servicio y tuvo que irse, y otra persona lo terminó. Se puede elegir
     a cualquier persona con recurso en el negocio, aunque no estuviera agendada.
3. Una sola persona: 100%.

## 3. Quién calcula y quién escribe

Igual que los recordatorios (ADR 0004): la base entrega los datos (`app_booking_commission_data`),
`@agenda/core` calcula (`computeBookingCommissions`) y el servidor guarda con la clave de servicio
(`app_replace_booking_commissions`). **Nadie puede escribir montos de comisión desde el navegador.**

- Al marcar una reserva como **Completada** se calculan sus comisiones. Si eso falla, la reserva queda
  completada igual: al crear una liquidación, el servidor calcula antes las reservas completadas que quedaron
  sin comisión (`app_bookings_missing_commissions`).
- Recalcular reemplaza los movimientos de esa reserva, nunca los duplica. Si estaba en una liquidación
  borrador, sigue en ella.

## 4. Liquidaciones

`settlements` tiene tres estados: **borrador → cerrada → pagada**. Cada movimiento (`commission_entries`)
pertenece como máximo a una liquidación.

- Al crear una liquidación entra **todo lo pendiente hasta la fecha de término**: los servicios del
  período, los ajustes y los pendientes de períodos anteriores. Así nada se pierde.
- El borrador se puede borrar; sus movimientos vuelven a quedar pendientes.
- **Una liquidación cerrada no se modifica.** Lo garantizan dos candados en la base:
  - `app.settlement_guard`: una liquidación cerrada solo puede pasar a pagada y no se borra.
  - `app.commission_entry_guard`: un movimiento de una liquidación cerrada no se cambia ni se borra,
    tampoco con la clave de servicio.
- Las correcciones son **ajustes**: un movimiento nuevo, positivo o negativo, siempre con motivo, que entra
  en la próxima liquidación.
- La frecuencia habitual (`businesses.settlement_period`: semanal, quincenal o mensual) solo sirve para
  proponer las fechas (`proposePeriod`). Cumple la regla del ADR 0004: los plazos son configurables.

## 5. Quién ve qué

| Rol | Comisiones |
|---|---|
| Dueño, administrador | Todo: reglas, recetas, repartos, ajustes y liquidaciones (`commissions.manage`) |
| Profesional con cuenta vinculada | Solo sus movimientos, sus reglas y las liquidaciones donde aparece (RLS) |
| Otros negocios, anónimos | Nada |

## 6. Exportar (decisión del dueño)

- **Excel (.xlsx, `exceljs`):** hoja "Resumen" (total por persona) y hoja "Detalle" (cada movimiento con
  fecha, servicio, cliente, base, parte, regla y comisión).
- **PDF para teléfono (`pdf-lib`):**
  - página angosta (360 × 640 pt), letra grande y total destacado;
  - una sección por persona con sus servicios y ajustes;
  - se abre en el navegador del teléfono sin hacer zoom.
- Ambos respetan RLS: un profesional que descarga ve solo lo suyo.

## 7. Plan "Completo" (decisión del dueño)

Las comisiones son un complemento del plan (sección 17).

- Se creó el plan **`completo`**: todas las funciones, sin límites, no público.
- Los negocios que ya existían pasaron a ese plan. Los negocios nuevos parten en el **Plan Base**, así se
  pueden probar ambos.
- Las pruebas de punta a punta activan la función con la clave de servicio, como lo haría soporte.
- Pendiente para más adelante: una forma de cambiar el plan de un negocio de prueba desde la app (hoy se
  hace en la base).
