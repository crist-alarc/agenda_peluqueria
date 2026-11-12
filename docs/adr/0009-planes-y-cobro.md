# ADR 0009 — Consola A2: planes, empresas que facturan, impuestos y prorrateo

- **Fecha:** 2026-11-12
- **Estado:** aceptada (decisiones del dueño del proyecto del 2026-11-12)
- **Contexto:** ADR 0008 (consola de la plataforma). Directrices, secciones 17 (planes y derechos) y 20
  (pagos).

## 1. Quién factura, en qué moneda y con qué impuesto

Se separan cuatro cosas que antes venían juntas:

1. **Empresa que factura** (`billing_entities`): hoy, la del dueño en Chile, cuyo nombre y RUT se completan en
   `/admin/facturacion`. Mañana puede haber empresas en otros países que facturen localmente.
2. **Moneda del cobro:** es independiente de la moneda con que opera el negocio. Un negocio que opera en otra
   moneda puede pagar su plan en dólares.
   - Monedas de cobro: CLP y USD (`BILLING_CURRENCY_CODES`).
   - La moneda de operación de los negocios sigue siendo solo CLP (`CURRENCY_CODES`).
3. **Dónde se ofrece cada plan** (`plans.offered_countries`; vacío = en todos los países).
4. **Regla de impuesto** (`tax_rules`): depende de la empresa que factura y del país del cliente. Define la
   moneda, el tipo de documento y el % de impuesto. "Resto del mundo" es la regla con `client_country` nulo.
   - Configuración inicial:
     - Chile → Chile: CLP, boleta o factura, IVA 19%.
     - Chile → resto del mundo: USD, factura de exportación, 0%.
   - **La exención de exportación de servicios tiene requisitos ante el SII:** el dueño la confirma con su
     contador. La app solo aplica lo configurado.

Los precios se guardan **netos**. El impuesto y el bruto los calcula `taxBreakdown`, que redondea a la unidad
mínima de la moneda.

## 2. Planes con versiones

- Cada plan tiene **versiones inmutables** (`plan_versions`): funciones con límite y precios netos por moneda.
- Al editar funciones o precios se crea una versión nueva, que aplica a quienes contratan desde ese momento.
  Cada negocio conserva la versión que contrató.
- `comparePlanVersions` **sugiere** qué hacer con quienes tienen una versión anterior:
  - **Mejora:** más funciones o límites más altos, sin perder nada y sin subir el precio. Se sugiere pasarlos.
  - **Cambio mixto** (mejora algo pero empeora otra cosa o sube el precio): cuenta como "no es una mejora" y se
    sugiere mantenerlos. Ante la duda, se respeta lo contratado.
- **El dueño decide** con un botón (`app_admin_migrate_plan_version`).
- `plan_features` se mantiene como espejo de la versión vigente, por compatibilidad.
- Un plan se puede **archivar** (`active = false`): no se ofrece ni se asigna, pero lo conservan quienes ya lo
  tienen.
- `is_public` indica si se ofrece a los negocios nuevos.

## 3. El negocio elige su plan al crearse

`app_create_business` recibe `p_plan_code`, que debe ser un plan activo, ofrecido y disponible en su país.
- La pantalla "Crea tu negocio" muestra los planes con su precio neto y el total con impuesto.
- El primer tramo de cobro empieza el mismo día del alta.

## 4. Tramos de suscripción y prorrateo

- `subscription_periods`: cada tramo guarda el plan, la versión y el precio neto, o la suspensión.
- **Regla del dueño:** un cambio hecho el día D se cobra desde D + 1. El tramo anterior incluye el día D.
- Si hay otro cambio el mismo día, se reemplaza el tramo de mañana en vez de crear uno vacío.
- `prorateMonth` calcula el cobro del mes **por días calendario**: precio mensual × días del tramo / días del
  mes. Admite tantos cambios en el mes como haya habido.
- **Los días suspendidos no se cobran.**
- Las fechas de los tramos se cuentan en días calendario de Chile (`app.platform_today()`).
- La ficha "Plan y cobro" de cada negocio muestra la vista previa del mes. La facturación (A3) usará el mismo
  cálculo.

## 5. Funciones puntuales

- `business_feature_overrides` activa o quita una función, o cambia un límite, para un solo negocio, con motivo
  y **fecha de término opcional**.
- `app.refresh_entitlements` recalcula las funciones efectivas a partir de la versión del plan más los extras
  vigentes.
- La tarea programada existente (`app.run_scheduled_tasks`, cada 15 minutos) vence los extras con
  `app.expire_feature_overrides()`.
- **Al bajar de plan no se borra nada.** Si el negocio queda sobre el nuevo límite, no puede crear más (lo impide
  el trigger existente) y la consola lo avisa.

## 6. Suspensión (solo la plataforma)

- `businesses.suspended_at` y `suspension_reason`. Mientras está suspendido:
  - el link público no aparece;
  - no se pueden pedir horarios ni crear reservas, tampoco desde recepción;
  - el panel queda en **solo lectura** (`requireWritableBusiness` en las acciones);
  - las reservas ya tomadas y sus recordatorios siguen.
- El cobro de los días suspendidos es $0.
- **El dueño del negocio no se suspende a sí mismo.** Para cerrar por vacaciones, duelo u otro motivo usa los
  bloqueos de sucursal, que ya existen y aceptan un motivo libre.

## 7. Pendiente

- **A3:** cobros por período con folio del SII, datos de facturación del cliente y exportación. Usará
  `prorateMonth` y `taxBreakdown`.
- **Fee por sucursal adicional** (sección 17): se modelará como un cargo extra en la A3.
- **Período de prueba:** no se definió; se evaluará con la A3.
