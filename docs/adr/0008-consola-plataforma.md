# ADR 0008 — Consola de la plataforma (`/admin`)

- **Fecha:** 2026-11-12
- **Estado:** aceptada (decisiones del dueño del proyecto del 2026-11-12). Entregada la A1; A2 y A3 pendientes.
- **Contexto:** las directrices describen los roles *dentro* de cada negocio, pero no a quien administra la
  plataforma. El dueño necesita atender a sus clientes antes del piloto con los hermanos.

Es una decisión nueva, fuera de las fases de la sección 24. El dueño la pidió antes de la 3B.

## 1. Quiénes son los clientes

Los **clientes de la plataforma** son los dueños de negocios que usan la app (las organizaciones). Un cliente
puede tener varios negocios (principio 1), y cada negocio tiene su propio plan (sección 17).

No se confunden con los clientes finales de cada negocio (`customers`), que siguen en el panel de cada negocio.

## 2. Administradores de la plataforma

- Tabla `platform_admins`, separada de los roles de negocio (`memberships`).
- Nadie puede agregarse a sí mismo: no hay política de escritura. Se agrega con SQL (el primero, el dueño) o
  con la clave de servicio.
- La consola **nunca lee las tablas de los negocios**. Todo pasa por funciones `app_admin_*` que exigen
  `app.is_platform_admin()`.
- Para quien no es administrador, `/admin` responde 404 y no revela que la consola existe.
- **Verificación en dos pasos (pendiente).** Por decisión del dueño, por ahora se entra con la cuenta normal.
  Queda como requisito obligatorio antes de dar acceso a otros agentes o antes del piloto (sección 21). Está
  anotado en `docs/ESTADO.md`.

## 3. Acceso de soporte con aprobación del cliente (diseño del dueño)

1. El agente pide acceso a un negocio desde `/admin`, con motivo y duración.
2. En el panel del negocio aparece un aviso y la página **Soporte**. La pueden ver y responder:
   - el **dueño**, que siempre puede;
   - las personas que el dueño designe en Equipo (`memberships.can_approve_support`). Solo el dueño las
     designa.
3. Al aprobar se elige por cuánto tiempo, entre 1 hora y 7 días (regla 6: tiempo configurable). El negocio
   puede revocar el acceso en cualquier momento, y el agente puede terminarlo.
4. Con el acceso vigente, el agente ve la **configuración en solo lectura** (`app_admin_support_snapshot`):
   ajustes, plan y funciones, sucursales con horarios y zonas, recursos, servicios, adicionales, equipo y
   totales de actividad.
   - **Nunca ve reservas ni datos de clientes finales**, solo totales (ley de datos personales, sección 21).
   - El acceso es del agente que lo pidió, no de toda la plataforma.
5. Cada lectura queda en `support_access_log`, y el negocio la ve en su página Soporte (transparencia). Las
   solicitudes quedan además en `audit_log`.
6. Sin acceso aprobado, la consola solo muestra datos de la cuenta: dueño, negocios, rubro, plan, fecha de
   alta, reservas de los últimos 30 días y tamaño del equipo.

## 4. Entregas

- **A1 (hecha):** acceso a la consola, lista de clientes con buscador, ficha del cliente, acceso de soporte de
  punta a punta y designación de aprobadores.
- **A2:** catálogo de planes editable (nombre, precio, funciones y límites); cambio de plan y funciones puntuales
  con fecha de término; suspensión y reactivación de un negocio.
- **A3:** facturación a los clientes, registrada a mano mientras se factura en el portal del SII.
  - Datos de facturación del cliente: RUT, razón social, giro, dirección, email y boleta o factura.
  - Cobros por período: *por facturar → facturado (folio del SII) → pagado*, o anulado. Un cobro facturado
    no se modifica.
  - Exportación a Excel.

  Emitir los documentos desde la app queda para el futuro. No es lo mismo que la boleta electrónica de la
  Fase 6, que es la que los negocios emiten a sus propios clientes.

## 5. Diseño

- Una franja superior color pino (`--platform`) y el título "Plataforma" distinguen la consola del panel de un
  negocio (azul marino, con barra lateral). Es importante, porque quien administra la plataforma también puede
  tener negocios propios.
- El elemento principal es el **indicador de acceso de soporte**: dice siempre si se puede mirar la
  configuración y por cuánto tiempo más.
- Las listas para comparar clientes son tablas, y la configuración se muestra en listas de definición, sin
  tarjetas decorativas.
- Desde el 2026-11-12, el diseño de pantallas se trabaja con el skill `anthropic-skills:frontend-design`
  (indicación del dueño, en `CLAUDE.md`).
