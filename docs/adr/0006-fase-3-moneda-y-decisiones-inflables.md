# ADR 0006 — Fase 3: país y moneda por negocio, y decisiones de la entrevista de inflables

- **Fecha:** 2026-11-11
- **Estado:** aceptada (decisiones del dueño del proyecto del 2026-11-11)
- **Contexto:** entrevista sobre el proceso de los hermanos (`docs/proceso-inflables.md`) y plan de la
  Fase 3 aprobado por el dueño (entregas 3·0 y 3A).

Este ADR **modifica** las directrices v1.2 (secciones 1, 8, 10, 14 y 20) en los puntos indicados. Las
directrices no se editan (decisión 5 de `docs/ESTADO.md`); prevalece lo que dice este documento.

## 1. País y moneda por negocio (entrega 3·0)

**Antes (directrices, secciones 1 y 20):** la app era solo para Chile y el dinero se guardaba siempre en pesos
chilenos enteros. Las columnas se llamaban `price_clp`, `total_clp`, etc.

**Ahora:**

- `businesses.country`: país en código ISO 3166-1 (por defecto `CL`).
- `businesses.currency`: moneda en código ISO 4217 (por defecto `CLP`).
- **Los montos siguen siendo enteros**, nunca `float`. Se guardan en la **unidad mínima** de la moneda del
  negocio:
  - en CLP, que no usa decimales, la unidad mínima es el peso;
  - en una moneda con 2 decimales serían los centavos (USD 12,50 se guarda como 1250).
- Las columnas pierden el sufijo de moneda:

  | Antes | Ahora |
  |---|---|
  | `services.price_clp`, `addons.price_clp`, `booking_items.price_clp` | `price` |
  | `booking_addons.unit_price_clp` | `unit_price` |
  | `bookings.total_clp`, `settlements.total_clp` | `total` |
  | `commission_entries.amount_clp` | `amount` |
  | `commission_entries.base_clp`, `addon_base_clp` | `base_amount`, `addon_base_amount` |

  Lo mismo pasa con las claves de los JSON (`priceClp` → `price`) y con las de las plantillas por rubro.
- Las funciones que entregan la zona horaria del negocio (link público, contexto de reserva, emails, portal
  del cliente, resultado de los enlaces) ahora entregan también `currency`.
- **Habilitado hoy: solo Chile y CLP.**
  - Agregar una moneda requiere dos cambios: sumarla a `CURRENCIES` en `packages/core/src/money.ts` (con sus
    decimales y su idioma) y al check `businesses_currency_check` con una migración.
  - Agregar un país funciona igual, con `COUNTRIES` y `businesses_country_check`.
- **No se puede cambiar la moneda de un negocio que ya tiene reservas.** Lo impide un trigger en la base
  (`app.business_currency_guard`), porque los montos guardados quedarían mal interpretados.
- `@agenda/core` reemplaza `formatClp` y `parseClp` por funciones que reciben la moneda:
  - `formatMoney(monto, moneda)` para mostrar montos;
  - `parseMoney(texto, moneda)` para leer lo que escribe una persona;
  - `moneyInputValue` para el valor inicial de un campo de monto;
  - `moneyInputHint` para la ayuda bajo ese campo.

  Los esquemas con montos (servicio, adicional, regla de comisión y ajuste) reciben la moneda del negocio:
  `serviceSchema(business.currency)`.
- En la pantalla Configuración se eligen el país y la moneda, entre los habilitados.

## 2. Decisiones de la entrevista que aplican a toda la Fase 3

1. **Zonas de cobertura libres.** No se amarran a las comunas de Chile. Cada sucursal define sus zonas con un
   nombre libre y su costo de despacho. Reemplaza a `branches.coverage_communes` (directrices, sección 8).
2. **Camiones: avisar, no impedir.**
   - Las directrices (secciones 8 y 10) dicen que la logística "limita" las reservas.
   - En la práctica, un camión hace una ruta con 3 a 6 eventos en el día.
   - Cada recurso de logística tiene un **tope de eventos por día**, configurable.
   - Si una reserva lo supera, la app **avisa** y el dueño decide. No se bloquea.
3. **Bloque de arriendo por servicio:** día completo (el juego queda ocupado todo el día aunque se entregue
   en la tarde) o bloques de N horas (el toro mecánico se arrienda en bloques de 3 horas, con operador).
4. **Margen de traslado:** cada servicio tiene un valor por defecto, que se puede ajustar en cada reserva. La
   app no calcula distancias.
5. **Precios en el link público:** cada negocio elige si se muestran o no.
6. **Acuerdos con cualquier negocio** (hermano, primo, un contacto en otra zona), no solo entre los hermanos.
   - Cada acuerdo tiene sus propias **tarifas fijas por recurso**.
   - Puede tener un **cargo por servicio del socio** opcional, por evento o por recurso. El nombre es
     genérico a propósito ("armado" no sirve para losas ni mobiliario).
   - El cargo se implementa en la 3C.
7. **Juego propio con logística del socio:** cuando el vendedor no atiende la zona del evento, el socio de esa
   zona lleva también los juegos del vendedor.
   - Se registra con `modality = own` y `logistics_business_id` = el socio.
   - Este caso no aparecía en la tabla 14.2 de las directrices.
   - El socio se presenta con la **marca del vendedor**.
8. **Pago entre socios:** por defecto cada semana (la de la semana anterior), con frecuencia configurable.
9. **Traspaso de juegos entre socios:** no tiene una ventana fija. El acta guarda el lugar y la hora reales.
10. **Abono:**
    - es un porcentaje de la cotización, con un valor predeterminado por negocio;
    - se puede quitar por cliente (por ejemplo, clientes habituales como iglesias, familia o amigos);
    - el plazo para pagarlo es configurable (regla 6 del dueño);
    - se implementa en la 3B.
11. **Reemplazo de un juego dañado:** dentro de una reserva se puede cambiar un juego por otro sin cambiar el
    precio al cliente. Se implementa en la 3C.

## 3. Despliegue de la 3·0

La migración renombra columnas. La versión anterior de la app deja de funcionar apenas se aplica, y la
versión nueva necesita la migración. Por eso el orden es:

1. Fusionar el PR.
2. Aplicar la migración en Supabase.
3. Confirmar que Vercel publicó la versión nueva.

Entre el paso 2 y el 3 la app puede fallar unos minutos. Se acepta porque todavía no hay clientes reales.
Después se regeneran los tipos y se revisa el Security Advisor.
