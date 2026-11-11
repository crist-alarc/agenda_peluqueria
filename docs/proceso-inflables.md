# Proceso actual de los hermanos (inflables)

> Documento previo a la Fase 3, que exigen las directrices (sección 24). Describe **cómo trabajan hoy**,
> sin app. Fuente: relato del dueño del proyecto (2026-11-11), en tres bloques. **Entrevista cerrada.** Lo marcado como **[por confirmar]** falta
> preguntarlo a los hermanos.

## 1. Zonas

| Hermano | Zona |
|---|---|
| A | Padre Hurtado |
| B | Maipú |

- Cada zona **incluye comunas vecinas** (Talagante, Lonquén, Peñaflor, etc.).
- **Decisión del dueño:** las zonas **no se amarran a las comunas de Chile**. Cada negocio escribe sus
  propias zonas, porque otros clientes (y otros países) las definen de otra forma.
- **Fuera de las dos zonas:** buscan un contacto que trabaje en esa zona y operan con el mismo sistema que
  usan entre hermanos. Es decir, los acuerdos no son solo entre hermanos: puede haber un acuerdo A ↔ primo C.

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
  - **Va con operador** y se arrienda en **bloques de 3 horas**.
  - El tiempo entre un evento y otro depende de la distancia entre ellos.
  - Si se arrienda entre hermanos, **el operador lo pone el dueño del toro**.

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

### 4.4 Respuestas del bloque 2 (2026-11-11)

- **Marca:** el hermano que entrega se presenta con la marca **del que vendió**. En el caso 4.1, B se
  presenta como A.
- **Valor entre socios:** es un **monto fijo por juego**, y cada juego tiene su propio valor. Ese valor es
  parte de un **acuerdo comercial**: hoy es el de A ↔ B, pero mañana puede ser A ↔ primo C, con otros valores.
- **Traslado:** el hermano que lleva el pedido cobra solo por sus propios juegos, porque el costo de
  logística es el mismo. El acuerdo debería permitir, de forma opcional, un **cargo por servicio** del socio.
  Ese cargo debe tener un nombre genérico, no "armado", porque sirve para otros rubros (arriendo de losa,
  mobiliario, etc.).
- **Pago entre ellos:** en general, **cada semana se paga lo de la semana anterior**. Depende de cada caso.
- **Traspaso de juegos:** se juntan en la bodega de uno de ellos o en un punto común de sus rutas. Depende
  del juego y de la cantidad, y se organiza semana a semana.
- **Daños:**
  - Cada uno tiene su política de cobro por daño.
  - Si el juego dañado tiene otro evento, intentan repararlo. Casi siempre lo logran: lo que más se daña son
    las turbinas, y tienen repuestos.
  - Si no se puede reparar, consiguen el mismo juego con otro arrendador.
  - Si eso tampoco funciona, hablan con el cliente afectado y le cambian el juego por uno mejor al mismo
    precio. Los clientes quedan contentos.
  - Muy rara vez, si el juego mejor no cabe en el espacio, el cliente desiste.

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
  - La tarifa es por recurso y por acuerdo: cada par de negocios tiene sus propios valores.
- **Cargo por servicio opcional del socio**, con nombre genérico. Es nuevo respecto de las directrices y va
  en el ADR.
- **Liquidación semanal por defecto**, con la frecuencia configurable (regla 6), igual que en la 2D.
- **Marca:** es la del vendedor (`visible_brand_business_id`), y la orden de trabajo del socio muestra
  "Atender como: A". Ya está en la sección 14.3.
- **Traspaso entre socios:** no tiene una ventana fija. El acta guarda el lugar y la hora reales, y no se
  exige una ventana configurada.
- **Toro mecánico:** el operador es un recurso `person` del dueño del toro. El servicio requiere el toro y un
  operador, por eso siempre lo atiende el dueño, aunque lo venda el socio.
  - El tiempo de traslado entre eventos depende de la distancia, y el motor no calcula distancias. Propuesta:
    una holgura configurable por servicio, que la recepción puede ajustar en cada reserva.
- **Capacidad de logística:** **no es "un camión, un evento a la vez"**. Un camión hace una ruta con 3 a 6
  eventos en el día. Propuesta: un tope de eventos por camión por día, configurable. Esto difiere de la
  idea de "eventos en paralelo" de las secciones 8 y 10, así que hay que decidirlo y anotarlo en el ADR.
- **Daños y reemplazos:** hace falta poder **cambiar el juego de una reserva por otro** sin cambiar el
  precio. Conseguir un juego con un tercero equivale a un acuerdo con ese tercero.

## 6. Logística

- **Camiones:** el hermano A tiene 3 y el hermano B tiene 1.
- Cada camión atiende en promedio **entre 3 y 6 eventos por día**. Depende mucho de las rutas.

- **Decisión del dueño:** si se pasa del tope de eventos por camión, **la app avisa pero no impide** la
  reserva. El dueño decide cómo lo gestiona.

## 7. Catálogo, abono, condiciones y dolores (bloque 3, 2026-11-11)

- **Catálogo como una tienda en línea:** cada juego tiene precio y una ficha con sus datos importantes:
  - capacidad de niños;
  - dimensiones;
  - tiempo estimado de armado y de desarme;
  - si necesita electricidad;
  - otros datos.
- **Adicionales:** los juegos casi no tienen. En otros rubros sí (por ejemplo, mesa con 6 sillas más sillas
  adicionales). El modelo actual de adicionales con stock ya cubre ese caso.
- **Abono:**
  - es un **porcentaje de la cotización**, con un valor predeterminado por negocio;
  - a clientes habituales (iglesias, familia, amigos) **no se les cobra abono**, así que debe poder quitarse
    por cliente.
- **Condiciones del evento:** se le hacen preguntas al cliente, por ejemplo si hay enchufe cerca. Según la
  respuesta, van preparados con extensiones eléctricas. Es muy raro que el terreno no sirva. Sobre la lluvia
  no hay antecedentes.
- **Registros:** hoy no anotan nada. Las actas de entrega y devolución les servirían.
- **Dolores:**
  1. **Se les quedan las extensiones eléctricas** en los eventos.
  2. **Las direcciones no son claras:** tienen que llamar al cliente para pedirle la ubicación por WhatsApp.

## 8. Decisiones generales del dueño surgidas en la entrevista

- **País y moneda configurables por negocio.** Los decimales dependen de la moneda: el CLP no usa
  decimales. Esto contradice las secciones 1 y 20 de las directrices (solo Chile, pesos enteros), así que va
  en un ADR.
- **Mostrar u ocultar los precios en la agenda pública:** cada negocio lo configura.
