# ADR 0011 — Consola A3b: cobros mensuales a los clientes

- **Fecha:** 2026-11-13
- **Estado:** aceptada (decisiones del dueño del proyecto del 2026-11-13)
- **Contexto:**
  - ADR 0009: planes, tramos y prorrateo.
  - ADR 0010: roles, planes free y datos de facturación.
  - Directrices, sección 17: fee por sucursal adicional.

## 1. Mes vencido y por días

- En noviembre se cobra octubre, con los días reales de cada tramo (`prorateMonth`).
- Los días en **prueba** y los **suspendidos** no se cobran. Un plan free tiene precio 0.
- **Sucursales adicionales por tiempo de uso:**
  - `branch_activity` guarda, sola, desde y hasta qué día estuvo activa cada sucursal. La registran triggers
    en `branches` al crear, desactivar, reactivar y borrar.
  - El día en que se abre o se cierra cuenta como día de uso.
  - Una sucursal cerrada por vacaciones con bloqueos sigue activa, así que cuenta. Si se borra, su historial se
    conserva.
- `buildMonthCharge` (en `@agenda/core`, con tests) arma las líneas:
  - el plan de cada tramo;
  - una línea de "Sucursales adicionales" que suma, día por día, (activas − incluidas en el plan de ese día) ×
    precio por sucursal / días del mes, con un solo redondeo.

## 2. Condiciones del plan

Cada versión de plan define:

- **sucursales incluidas** (`included_branches`);
- **precio neto por sucursal adicional** por moneda (`extra_branch_prices`);
- **días de prueba** (`trial_days`).

Pasan por la misma aprobación del dueño (ADR 0010).

**Todo plan incluye la función Sucursales**, con un límite que no puede ser menor que las sucursales incluidas.
Sin ella, quien elige el plan no puede crear su negocio. Lo validan el formulario y la base. `comparePlanVersions` cuenta como empeoramiento incluir menos
sucursales o subir el precio por sucursal adicional.

## 3. Período de prueba

- Solo al crear el negocio: un tramo `trial` desde hoy por N días, y luego el plan.
- **Cualquier cambio termina la prueba:** un cambio de plan, una suspensión o un paso de versión la cortan hoy, y lo
  nuevo corre desde mañana (`app.open_subscription_period`).
- Los datos de facturación se piden igual, con los días de gracia de la A3a.

## 4. Plazos y formas de pago

- Se mantienen dos listas, con un valor por defecto cada una: `payment_terms` (nombre y días) y `payment_methods`.
- Cada negocio puede tener un plazo y una forma de pago **acordados** (`business_subscriptions.payment_term_id` y
  `payment_method_id`); si no, usa los por defecto.
  - Los decide la plataforma. El dueño del negocio los ve, pero no los cambia.
- Al facturar, el cobro **copia** el plazo y la forma de pago. El vencimiento es la fecha de emisión más los días
  del plazo, y no cambia si después se modifica el acuerdo.
- Al pagar se registra la forma en que efectivamente pagó, que debe estar en la lista.

## 5. Cobros y estados

- `billing_charges` (un cobro por negocio y mes, salvo los anulados) y `billing_charge_lines`.
  - Quedan preparadas para cobrar a otro destinatario en la A4 (modalidad de reventa).
- Estados:
  - **Por facturar:** se genera o rehace desde la consola, y los ajustes con motivo se conservan. Un total de 0
    (plan free o prueba todo el mes) no crea cobro.
  - **Facturado:** con folio del SII y fecha de emisión. Exige datos de facturación y los copia (`bill_to`). Desde
    aquí el trigger `app.protect_billing_charge` impide cambiar montos, líneas, folio o datos, incluso directo en
    la base. El folio no se repite por empresa y documento.
  - **Pagado:** con fecha, forma de pago y nota opcional.
  - **Anulado:** con motivo; si estaba facturado o pagado, también con el folio de la nota de crédito. Después se
    puede generar el mes de nuevo.
- **Pagos parciales:** no por ahora. Se anotan en la nota del pago.
- Los totales los recalcula la base (`app.recompute_charge`), con el mismo redondeo que `taxBreakdown`.
- **RLS:** el dueño del negocio ve sus cobros emitidos (no los que están por facturar). Recepción y otros
  negocios no ven nada. Todo lo demás pasa por funciones `app_admin_*`.
  - Generar, ajustar, facturar, pagar y anular es solo para dueño o administrador de la plataforma, no para
    agentes.

## 6. Avisos y Excel

- **Consola:**
  - una franja con los cobros vencidos sin pagar y su monto, que lleva a `/admin/cobros/vencidos`;
  - "Faltan los cobros de <mes>" desde el día 1, mientras el mes anterior no tenga ningún cobro;
  - un contador en el menú Cobros.
- **Panel del dueño:** un aviso "Tienes un pago vencido desde el…", sin bloquear nada, y la sección "Tus cobros" en
  Plan. La suspensión la sigue decidiendo la plataforma.
- **Excel (`.xlsx`) del mes:** una hoja por moneda, con datos del documento, montos, estado, días de atraso y pago.

## 7. Pendiente

- **A4:** ejecutivos comerciales con acuerdos a mes vencido.
  - Comisión en % o monto fijo, que puede variar por plan.
  - La comisión se gana al facturar o al pagar.
  - Modalidad de reventa: el cobro va a la empresa del ejecutivo, con el precio de licencia.
