# Proceso actual de los hermanos (inflables)

> Documento previo a la Fase 3, que exigen las directrices (sección 24). Describe **cómo trabajan hoy**,
> sin app. Fuente: relato del dueño del proyecto (2026-11-11). Lo marcado como **[por confirmar]** falta
> preguntarlo a los hermanos.

## 1. Zonas

| Hermano | Zona |
|---|---|
| A | Padre Hurtado |
| B | Maipú |

- **[por confirmar]** ¿Cada zona es solo esa comuna o incluye comunas vecinas? ¿Qué pasa con un evento fuera
  de ambas zonas (lo toman, cobran más o lo rechazan)?

## 2. Cómo llega y se cierra un pedido

1. El cliente escribe por **WhatsApp o Facebook Messenger** y pregunta qué juegos hay para una fecha.
2. El hermano revisa de memoria lo que tiene libre ese día y le ofrece las alternativas.
3. Pide la **dirección del evento** y cierra el negocio.

- **[por confirmar]** Otros datos que piden (nombre, teléfono, hora del evento, edad de los niños) y con
  cuánta anticipación reservan normalmente.

## 3. Bloques de arriendo

- **Juegos inflables: se arriendan por día.** Los eventos suelen ser en la tarde. El juego se deja en la
  tarde y se retira casi de noche en una ruta de retiro, pero **queda reservado todo el día** para ese evento.
  En la práctica, un juego se arrienda como máximo una vez por día.
- **Toro mecánico: se arrienda por hora.** Puede arrendarse más de una vez el mismo día.
  - **[por confirmar]** ¿Va con un operador? ¿Cuántas horas como mínimo? ¿Cuánto tiempo hace falta entre un
    evento y otro para trasladarlo, montarlo y desmontarlo?

## 4. Colaboración entre hermanos

### 4.1 El cliente está en la zona del otro hermano

Ejemplo: A recibe un cliente con evento en Maipú (zona de B).

1. A le pregunta a B qué tiene disponible para esa fecha.
2. A le ofrece al cliente los juegos de B y también los suyos.
3. Si el cliente elige juegos de ambos, **A hace una sola cotización** y cierra el negocio.
4. A le entrega a B los juegos propios que hagan falta, y **B lleva todo al evento**: lo suyo y lo de A.

### 4.2 Al revés

Si un cliente de B tiene el evento en Padre Hurtado, A le dice a B lo que tiene disponible, **recibe los
juegos de B** y reserva los suyos, según cómo se haya cerrado el negocio.

### 4.3 Cobro y pago entre ellos

- **Cada hermano cobra al cliente los negocios que cierra.**
- Después le paga a su hermano un **valor acordado previamente** por los juegos del hermano.

### 4.4 Preguntas abiertas

- **[por confirmar]** ¿Con qué nombre se presenta el hermano que hace la entrega: con el suyo o con el del
  que vendió?
- **[por confirmar]** ¿El valor acordado es un monto fijo por juego? ¿Es el mismo para los dos hermanos?
- **[por confirmar]** Cuando el hermano de la zona lleva juegos que no son suyos, ¿cobra algo por ese
  traslado o solo recibe el valor de sus propios juegos?
- **[por confirmar]** ¿Cada cuánto se pagan entre ellos (por evento, semanal o mensual) y cómo llevan la
  cuenta hoy?
- **[por confirmar]** ¿Qué pasa si el cliente cancela, o si un juego se daña o vuelve sucio?
- **[por confirmar]** ¿Dónde y cuándo se pasan los juegos entre ellos (el día antes, la misma mañana)?

## 5. Cómo se traduce al modelo de la app (lectura preliminar)

Esto no es una decisión; es para revisar con el dueño.

- **Zona = cobertura de la sucursal** (`branches.coverage_communes`). El hermano de la zona es quien hace la
  logística del evento.
- **Bloque por día** para los inflables y **bloque por hora** para el toro mecánico. Es la misma idea con
  distinta unidad, configurable por servicio (regla 6 del dueño: nada de plazos fijos en el código).
- **Una sola reserva por cliente**, aunque mezcle juegos de los dos hermanos (reserva mixta, sección 14.3).
  Para el caso 4.1, en cada línea:

  | Línea | Dueño del juego | Logística | Modalidad en las directrices |
  |---|---|---|---|
  | Juego de B | B | B | `full_service` (B atiende el pedido que vendió A) |
  | Juego de A | A | B | Juego propio, pero lo transporta el socio (`logistics_business_id` = B) |

  La segunda línea no aparece tal cual en la tabla 14.2 de las directrices (allí el préstamo lo usa el
  vendedor para su propio cliente). Las columnas que ya existen en `booking_items` permiten guardarla, pero
  hay que decidir cómo se llama y si el traslado genera una tarifa. Se registrará en un ADR.
- **Vendedor cobra y paga la tarifa socio fija**: coincide con los valores por defecto de la sección 14.4.

## 6. Pendiente de la entrevista

Faltan los bloques 2 a 4 del guion de `docs/ESTADO.md` (sección 7.1):

- **Catálogo:** juegos y adicionales de cada hermano, con cantidades y tiempos de montaje.
- **Logística:** camionetas, personas y rutas.
- **Abono y cancelación.**
- **Condiciones del evento:** enchufe, superficie y lluvia.
- **Registros que llevan hoy.**
- **Dolores.**
