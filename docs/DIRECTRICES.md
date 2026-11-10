# Directrices del proyecto — App Agenda (nombre provisorio)

> **Versión:** 1.0 · **Fecha:** 2026-11-09 · **Autor:** Cristóbal Alarcón
>
> Este documento es la fuente de verdad del proyecto. Claude Code debe leerlo antes de cada tarea y respetarlo. Si una petición contradice este documento, **se debe señalar la contradicción antes de escribir código**. Cuando se tome una decisión nueva, se actualiza este documento en el mismo cambio.

---

## 1. Visión del producto

Plataforma SaaS (Chile) para que pequeños negocios de servicios gestionen su agenda: reservas de servicios, personas y recursos, adicionales, sucursales, comisiones, colaboración entre negocios y una landing propia. Los clientes finales reservan por un link público o el negocio agenda por ellos desde el local.

La plataforma **no son 13 apps distintas**: es un único modelo de datos configurable mediante **plantillas por rubro**.

### Público objetivo

Peluquerías · Barberías · Peluquería canina · Arriendo de canchas deportivas · Gimnasios · Profesores · Arriendo de juegos inflables / juegos para cumpleaños · Centros de eventos de cumpleaños · Veterinarias / consultas veterinarias · Consultas médicas pequeñas · Carwash · Servicentro.

### Pilotos

1. **Peluquería**: caso estándar (persona + horario + multiservicio + comisiones).
2. **Juegos inflables**: dos hermanos con negocios reales, cada uno con su zona, que hoy colaboran compartiendo juegos. Son el piloto para logística, zonas y acuerdos entre negocios.

---

## 2. Principios no negociables

1. **Identidad global, roles por contexto.** Una persona tiene una sola cuenta y puede ser cliente, profesional, vendedor, administrador y dueño al mismo tiempo.
2. **Multi-tenant seguro.** Cada negocio ve solo sus datos. El aislamiento se aplica en la base de datos (Row Level Security), no solo en la interfaz.
3. **Toda la lógica de negocio vive en el servidor.** Disponibilidad, reglas, precios, comisiones y permisos se calculan en el backend. La web y la app móvil solo muestran y envían datos.
4. **Un modelo, plantillas por rubro.** Nada de tablas o lógica especial por rubro ("tabla_peluqueria"). Las diferencias se expresan con configuración: tipos de recurso, tipos de sujeto, reglas y modos de reserva.
5. **Nunca doble reserva.** Las ocupaciones de recursos y profesionales se protegen con restricciones en la base de datos, no solo con validaciones en el código.
6. **Trazabilidad completa.** Toda reserva registra canal, quién la vendió y con qué marca se atendió. Las acciones relevantes quedan en un registro de auditoría.
7. **Privacidad entre negocios.** Un negocio nunca ve las reservas, clientes ni precios de otro, salvo lo estrictamente necesario dentro de un acuerdo.
8. **Construir por fases.** No implementar funciones de fases futuras, pero sí dejar el modelo de datos preparado cuando este documento lo indique.

---

## 3. Stack técnico

| Capa | Tecnología |
|---|---|
| Web (panel + link público + landing) | **Next.js** (App Router) + **TypeScript** estricto |
| Estilos / UI | Tailwind CSS + shadcn/ui |
| Base de datos, auth, storage | **Supabase** (PostgreSQL, Auth, RLS, Storage, Edge Functions) |
| Validación | Zod (esquemas compartidos entre frontend y backend) |
| Constructor de landings | **Puck** (editor por bloques para React) |
| App móvil (fase posterior) | **Expo** (React Native), misma base Supabase y mismos tipos |
| Primera versión móvil | **PWA** instalable desde el día 1 |
| Hosting | Vercel (web) + Supabase |
| Emails | Proveedor transaccional (ej. Resend) |
| WhatsApp | API de WhatsApp Business vía proveedor (ej. Twilio) |
| Pagos (futuro) | Webpay / Mercado Pago / Flow (por definir) |
| Tests | Vitest (unitarios) + Playwright (flujos críticos) |

**Estructura sugerida (monorepo):**
```
/apps/web          → Next.js
/apps/mobile       → Expo (fase posterior)
/packages/core     → lógica de dominio pura en TS: disponibilidad, reglas, precios, comisiones
/packages/db       → tipos generados de Supabase, migraciones SQL
/packages/ui       → componentes compartidos
/docs              → este documento y decisiones (ADR)
```

---

## 4. Glosario y nombres en código

El código (tablas, variables, funciones) va en **inglés**; la interfaz en **español de Chile**.

| Concepto | Nombre en código | Descripción |
|---|---|---|
| Usuario | `user` / `profile` | Cuenta global de una persona |
| Organización | `organization` | Agrupa los negocios de un mismo dueño |
| Negocio | `business` | Suscriptor independiente (tiene su suscripción, sucursales y admins) |
| Sucursal | `branch` | Local físico o base de operación |
| Membresía | `membership` | Rol de un usuario en un negocio o sucursal |
| Recurso | `resource` | Lo que se reserva: `person`, `space` o `equipment` |
| Profesional | `professional` | Identidad global de un recurso persona (puede trabajar en varios negocios) |
| Servicio | `service` | Lo que se vende: duración, precio, recursos requeridos |
| Adicional | `addon` | Extra con precio y stock (balón, secador, máquina de humo) |
| Cliente | `customer` | Ficha del cliente dentro de un negocio |
| Sujeto | `subject` | A quién/qué se le presta el servicio: mascota, vehículo, paciente, festejado |
| Reserva | `booking` | La reserva del cliente |
| Línea de reserva | `booking_item` | Cada servicio/recurso dentro de una reserva |
| Ocupación | `allocation` | Bloque de tiempo ocupado de un recurso o profesional |
| Regla | `rule` | Modifica duración, precio o disponibilidad |
| Acuerdo | `partnership` | Acuerdo de colaboración entre dos negocios |
| Tarifa socio | `partner_fee` | Monto fijo que el vendedor paga al dueño del recurso |
| Acta | `handover_record` | Registro de entrega/devolución de un equipo entre socios |
| Liquidación | `settlement` | Resumen de montos a pagar (comisiones o tarifas socio) |
| Plan / derecho | `plan` / `entitlement` | Funciones habilitadas para un negocio |

---

## 5. Identidad, roles y contextos

### 5.1 Una cuenta, varios roles

```
USUARIO
 ├── Cliente        → ve sus reservas en TODOS los negocios
 ├── Profesional    → ve su agenda consolidada de todos los negocios donde trabaja
 ├── Vendedor       → ve sus ventas y comisiones de todos los negocios que representa
 └── Dueño / Admin  → administra sus negocios
```

La app tiene un **selector de contexto**: "Mis reservas", "Mi agenda de trabajo", "Mis ventas", "Mi negocio".

### 5.2 Roles dentro de un negocio (`membership.role`)

| Rol | Alcance |
|---|---|
| `owner` | Todo el negocio + panel consolidado de su organización |
| `admin` | Todo el negocio, sin facturación de la suscripción |
| `branch_admin` | Una o más sucursales específicas |
| `receptionist` | Crear y gestionar reservas en su sucursal |
| `staff` | Ver y gestionar solo su propia agenda |
| `seller` | Vendedor contratado: ver disponibilidad, crear reservas, ver solo sus ventas |

Los permisos se validan en servidor y en RLS. Un `branch_admin` de una sucursal no ve la caja ni las reservas de otra.

### 5.3 Inicio de sesión

- **Con cuenta:** email + contraseña (con recuperación por email).
- **Invitado:** nombre + teléfono, verificado con **código por WhatsApp**, solo para reservar.
- Si un invitado crea cuenta después y **verifica** el mismo teléfono o email, se le vinculan sus reservas anteriores. **Nunca vincular sin verificación.**

---

## 6. Estructura organizacional

```
ORGANIZACIÓN (dueño)
 ├── Negocio 1 (ej. Peluquería)  → suscripción propia, sucursales, admins, catálogo
 │     ├── Sucursal Centro
 │     └── Sucursal Maipú
 └── Negocio 2 (ej. Inflables)   → suscripción propia, sucursales, admins, catálogo
```

- Cada negocio es **independiente** en su administración.
- El dueño ve un **panel consolidado** (ventas, ocupación, reservas) de todos sus negocios.
- Cada sucursal tiene horario, feriados, bloqueos y, si corresponde, **zona de cobertura** (lista de comunas).
- Feriados de Chile precargados; cada sucursal puede agregar bloqueos propios.

---

## 7. Catálogo

### 7.1 Recursos (`resource`)
- `person`: peluquero, instructor, veterinario. Se vincula a un `professional` (identidad global).
- `space`: cancha, box, sala, sillón.
- `equipment`: juego inflable, camioneta, máquina de lavado.
- Cada recurso tiene horario de disponibilidad, bloqueos y sucursal.
- Los recursos de logística (camioneta, equipo de montaje) también son recursos y limitan la capacidad.

### 7.2 Servicios (`service`)
- Duración base, precio base, holgura antes/después (limpieza, montaje, traslado).
- **Requisitos de recursos**: ej. "Corte + barba" requiere 1 `person` con habilidad barbería + 1 `space` sillón.
- Modo de reserva (ver sección 8).
- Precios variables por horario (ej. cancha en horario punta).

### 7.3 Adicionales (`addon`)
- Precio, **stock limitado** por sucursal y período (ej. 10 balones).
- Se reservan junto a la reserva y descuentan disponibilidad de stock en ese horario.

### 7.4 Sujetos (`subject`) y plantillas por rubro
- El cliente guarda sujetos reutilizables. Cada rubro define un `subject_type` con campos propios (esquema JSON validado con Zod):
  - Mascota: especie, raza, tamaño, tipo de pelo, temperamento.
  - Vehículo: patente, tipo (city car, SUV, camioneta).
  - Festejado: nombre, edad, cantidad de niños.
  - Paciente: solo datos de agenda (ver sección 15).
- Los atributos del sujeto alimentan el motor de reglas.

### 7.5 Plantillas por rubro
Al crear un negocio se elige un rubro y se precargan: tipos de recurso, tipos de sujeto, servicios de ejemplo, reglas de ejemplo y modo de reserva. Todo es editable después.

---

## 8. Modos de reserva

| Modo | Código | Rubros | Fase |
|---|---|---|---|
| Persona + horario | `appointment` | Peluquería, barbería, médico, veterinaria, profesores | MVP |
| Recurso en bloques fijos | `fixed_slot` | Canchas | Posterior |
| Cupos (clases grupales) | `capacity` | Gimnasio, clases | Posterior |
| Arriendo por bloque con logística | `rental` | Inflables, juegos, centros de eventos | MVP (piloto) |
| Orden de llegada con hora estimada | `queue` | Carwash, servicentro | Posterior |

### Detalle del modo `rental` (inflables)
- Reserva por bloque (medio día / día / horario definido).
- **Dirección del evento** obligatoria; se valida contra la **zona de cobertura** (comunas).
- **Costo de despacho configurable**: incluido, monto fijo o tarifa por comuna.
- **Tiempos de montaje y desmontaje** y traslado antes y después del evento.
- La capacidad de logística (camionetas, equipo) limita cuántos eventos se pueden atender en paralelo.
- **Abono** para confirmar (en MVP: registro manual de transferencia).
- Condiciones del evento: enchufe, superficie, política de lluvia.

---

## 9. Reservas

### 9.1 Estructura
- `booking`: cliente (o invitado), negocio vendedor, estado, totales, notas.
- `booking_item`: cada línea (servicio, recurso, horario). Una reserva puede tener **varios servicios en cadena** (ej. lavado → peluquería canina) o **varios recursos** (3 juegos inflables).
- `booking_addon`: adicionales.

### 9.2 Campos obligatorios desde la primera versión
Aunque algunas funciones lleguen después, **toda reserva debe guardar**:
- `channel`: `public_link`, `reception`, `seller`, `partner`, `reseller`.
- `sold_by_user_id`: quién cerró la venta.
- `created_by_user_id`: quién la creó en el sistema.
- `visible_brand_business_id`: con qué marca se atiende al cliente.

Y **toda línea** (`booking_item`) debe guardar:
- `owner_business_id`: dueño del recurso.
- `partnership_id` (nulo si es recurso propio).
- `modality`: `own`, `full_service` o `equipment_loan`.
- `logistics_business_id`: quién hace la logística.

### 9.3 Estados
`pending` (espera verificación o abono) → `confirmed` → `checked_in` → `in_progress` → `completed`. También: `cancelled`, `no_show`. Cada cambio de estado queda en auditoría.

### 9.4 Reglas
- **Atomicidad:** una reserva con varias líneas se confirma completa o no se confirma. Nunca dejar líneas a medias.
- **Concurrencia:** las ocupaciones (`allocation`) usan rangos de tiempo (`tstzrange`) con **restricción de exclusión** (`EXCLUDE USING gist`) por recurso y por profesional. Es la garantía final contra la doble reserva.
- **Políticas de cancelación** configurables por negocio (ej. hasta 4 h antes).
- **Reservas recurrentes** (ej. cancha todos los martes): modelo preparado, implementación posterior.
- **Panel de recepción:** buscar cliente por teléfono, crearlo en segundos, agendar y enviar confirmación.

---

## 10. Motor de disponibilidad

Vive en `/packages/core` como funciones puras y testeadas, y se ejecuta en servidor.

Para calcular horarios disponibles considera:
1. Horario de la sucursal, feriados y bloqueos.
2. Horario y bloqueos de cada recurso.
3. **Ocupaciones del profesional en TODOS los negocios** donde trabaja (otros negocios solo aparecen como "no disponible", sin detalle).
4. Duración calculada por el motor de reglas.
5. Holguras, montaje, desmontaje y traslado.
6. Stock de adicionales en ese horario.
7. Recursos compartidos por acuerdos.
8. Capacidad de logística (modo `rental`).

**Horas:** se guardan en UTC (`timestamptz`) y se muestran en la zona horaria del negocio (por defecto `America/Santiago`). Los tests deben cubrir los cambios de horario de verano.

---

## 11. Motor de reglas

Una regla tiene **condición** y **efecto**:
- Condiciones: atributos del sujeto, servicio, día/horario, sucursal, comuna, cantidad.
- Efectos: sumar/restar duración, sumar/restar o multiplicar precio, bloquear la reserva, exigir recurso adicional.

Ejemplo: "Si mascota.tamaño = grande → duración +30 min, precio +$5.000".

- Las reglas se guardan como datos (JSON validado), no como código.
- El resultado del cálculo debe ser **explicable**: la reserva guarda el desglose de qué reglas se aplicaron.
- Es una función con plan (add-on).

---

## 12. Clientes y privacidad

- `customer` es la **ficha del cliente dentro de un negocio**. Puede estar vinculada a un usuario global o ser solo nombre + teléfono (creada en recepción).
- El cliente con cuenta ve **todas sus reservas** en todos los negocios.
- Cada negocio ve **solo su relación** con el cliente: sus reservas, notas e historial. Nunca sabe con qué otros negocios reserva el cliente.
- Historial por cliente/sujeto (ej. "último corte: degradado n° 2").

---

## 13. Profesionales multi-negocio

- Un `professional` (identidad global) puede ser recurso persona en varios negocios, en días u horarios distintos.
- Ve su **agenda consolidada**.
- Su disponibilidad se cruza entre negocios (sección 10).
- Puede ser al mismo tiempo **dueño** de su propio negocio y **cliente** de otro (ej. instructor de tenis que arrienda cancha en un club).

**Caso instructor + club:**
- Etapa 1: el instructor arrienda la cancha como cliente; sus alumnos solo pueden agendar dentro de esos bloques.
- Etapa 2: el club y el instructor firman un **acuerdo** (sección 14); al reservar un alumno, la cancha se reserva automáticamente.

---

## 14. Acuerdos entre negocios (`partnership`)

Mecanismo único para que un negocio venda usando recursos de otro. Cubre a los hermanos de inflables, al instructor y el club, y a los revendedores.

### 14.1 Contenido del acuerdo
```
ACUERDO (Negocio A ↔ Negocio B) — bidireccional
 ├── Recursos compartidos: todos / lista
 ├── Modalidades permitidas: servicio completo / préstamo de equipo / ambas
 ├── Tarifa socio: monto fijo por recurso y por modalidad
 ├── Precio al cliente: lo fija el vendedor
 ├── Cobro al cliente: el vendedor
 ├── Ventanas de entrega y devolución (préstamo)
 ├── Política de cancelación y daños entre socios
 └── Liquidación periódica: pendiente / pagada / en disputa
```

### 14.2 Modalidades

| | Servicio completo (`full_service`) | Préstamo de equipo (`equipment_loan`) |
|---|---|---|
| Caso | Cliente en la zona del dueño, vende el socio | El vendedor necesita un juego extra para su propio cliente |
| Logística al cliente | La hace el dueño del recurso, **atendiendo con la marca del vendedor** | La hace el vendedor |
| Datos del cliente para el dueño | Sí (dirección, horario, contacto) | **No**, solo datos de entrega/devolución |
| Bloqueo del recurso | Montaje + evento + desmontaje | Desde la entrega al socio hasta la devolución |

### 14.3 Reglas
- El vendedor ve la disponibilidad de los recursos compartidos como libre/ocupado, sin datos de otros clientes.
- El cliente ve **una sola reserva, una sola marca y un solo precio**.
- En servicio completo, la orden de trabajo del dueño muestra de forma destacada **"Atender como: [marca del vendedor]"**, y todas las comunicaciones al cliente salen con la marca del vendedor.
- Reservas **mixtas**: una reserva puede combinar recursos propios y de socios (ver campos de `booking_item` en 9.2).
- La app muestra al vendedor su **margen** (precio al cliente − tarifa socio).
- **Actas de entrega y devolución** (`handover_record`) en préstamo de equipo: fecha, hora, responsable, estado, fotos y observaciones/daños.
- **Liquidación** entre negocios con saldo neto (ej. "este mes B le debe $35.000 a A") y detalle por reserva.
- **Zonas de cobertura y derivación** (posterior): si la dirección del cliente cae en la zona de un socio, ofrecer sus recursos automáticamente.

### 14.4 Valores por defecto (caso hermanos)
- Quien cierra el negocio cobra al cliente y paga la tarifa socio al dueño.
- La tarifa socio es un **monto fijo**; el vendedor fija libremente el precio al cliente.

---

## 15. Vendedores y revendedores (fase 4)

### 15.1 Revendedor
- Es un **negocio sin recursos propios** que opera con acuerdos.
- Marca, link y landing propios; precios propios; cobra al cliente y paga la tarifa socio.
- Plan específico **"Revendedor"** (sin gestión de recursos).

### 15.2 Vendedor contratado
- Es un **usuario con rol `seller`** dentro del negocio del dueño.
- Vende con la marca y precios del dueño (con descuento máximo opcional).
- **Link personal de venta** con código de atribución.
- Ve solo disponibilidad, sus clientes y sus ventas.
- Gana **comisión** (fija o %) liquidada con el mismo motor de comisiones del staff.
- Cobro configurable: lo cobra el dueño (por defecto) o el vendedor y luego lo rinde (la app lleva el saldo por rendir).
- Puede representar a **varios negocios** con vista consolidada.

---

## 16. Comisiones y liquidaciones

- Reglas de comisión por persona (staff o vendedor) y por servicio: **monto fijo ($) o porcentaje (%)**.
- Configurable si incluye o no adicionales y despacho.
- Cada reserva completada genera movimientos de comisión.
- **Liquidación por período** exportable (Excel/PDF), con estados.
- Las liquidaciones cerradas no se modifican; los ajustes se registran como movimientos nuevos.

---

## 17. Planes y derechos (`plan` / `entitlement`)

- **Plan Base:** agenda, 1 sucursal, límite de recursos.
- **Add-ons:** reglas de cálculo, recursos extra, landing, comisiones, acuerdos entre negocios, vendedores, recordatorios por WhatsApp.
- **Fee por sucursal adicional.**
- **Plan Revendedor** (fase 4).
- Cada negocio tiene su propia suscripción.

Implementación: tabla de derechos por negocio (función habilitada + límites). **Se valida en servidor**, nunca solo ocultando botones. Crear o cambiar planes no debe requerir cambios de código. Precios por definir.

---

## 18. Notificaciones

- Confirmación de reserva por email con archivo **`.ics`** y mensaje de WhatsApp.
- Recordatorios automáticos (por defecto 24 h y 2 h antes) con botón confirmar/cancelar.
- Avisos al staff, al dueño del recurso compartido y al vendedor.
- Todas las comunicaciones al cliente usan la **marca visible** de la reserva.
- Plantillas editables por negocio. Los mensajes de WhatsApp tienen costo: controlar su uso por plan.

---

## 19. Landing page con constructor por bloques

- Editor **por bloques** (Puck), no lienzo libre: Hero, Servicios (se carga desde el catálogo), Equipo, Galería, Horarios, Mapa, Botón Reservar, Testimonios, Contacto.
- El usuario arrastra, reordena y edita textos, imágenes y colores.
- Se guarda como JSON por negocio.
- URL: `nombrenegocio.[dominio]`; dominio propio en plan superior.
- Siempre adaptable a celular.

---

## 20. Pagos

- **MVP:** registro manual de abonos y pagos (transferencia/efectivo), con quién lo registró.
- **Futuro:** pago en línea (Webpay / Mercado Pago / Flow), abonos automáticos, boleta electrónica SII.
- Dinero siempre en **pesos chilenos como enteros** (sin decimales). Nunca usar `float` para montos.

---

## 21. Seguridad, privacidad y cumplimiento

- **RLS en todas las tablas** con datos de negocio. Tests que verifiquen que un negocio no puede leer datos de otro.
- **Consultas médicas:** la app solo guarda datos de agenda (nombre, contacto, motivo general). **No guardar fichas clínicas** (Ley 20.584 y ley de protección de datos personales). Revisar con asesoría legal antes de ampliar.
- Mínimo de datos personales necesarios; los datos del cliente se comparten con un socio solo en modalidad servicio completo.
- **Registro de auditoría** (`audit_log`): quién creó, modificó, anuló o cambió de estado reservas, precios, comisiones, acuerdos y liquidaciones, con fecha y valores antes/después.
- Secretos solo en variables de entorno; nunca en el repositorio.
- Verificación obligatoria (código) para vincular reservas de invitado a una cuenta.

---

## 22. App móvil

- Desde el día 1: **PWA** instalable.
- Después: **Expo (React Native)** reutilizando `/packages/core`, tipos y Supabase. Notificaciones push y publicación en tiendas.
- Prioridad de la app móvil: agenda del día, crear reserva en recepción, agenda consolidada del profesional.
- Requisito para que funcione: toda la lógica en servidor (principio 3).

---

## 23. Convenciones de código

- TypeScript en modo `strict`; sin `any` salvo justificación comentada.
- Lógica de dominio en `/packages/core` como **funciones puras** con tests unitarios. Prioridad de tests: disponibilidad, reglas, precios, comisiones, liquidaciones, permisos.
- Validación de entradas con Zod en todo endpoint.
- Cambios de base de datos **solo con migraciones** versionadas; nunca editar la base a mano.
- Nombres en inglés en el código; textos de la interfaz en español de Chile, centralizados para facilitar cambios.
- Fechas en UTC en la base; conversión a zona horaria del negocio solo al mostrar.
- Montos en enteros CLP.
- Componentes de UI sin lógica de negocio.
- Commits pequeños y descriptivos.

---

## 24. Fases

| Fase | Contenido | Criterio de término |
|---|---|---|
| **1. Fundaciones** | Cuentas globales y roles, organización → negocio → sucursal, recursos, servicios, adicionales con stock, planes y derechos, auditoría, RLS | Un dueño crea su negocio, sucursal, recursos y servicios; RLS probado |
| **2. MVP peluquería** | Modo `appointment`, link público, multiservicio, panel de recepción, portal del cliente, invitados con WhatsApp, recordatorios por email, comisiones de staff | Una peluquería real opera una semana con la app |
| **3. MVP inflables (piloto hermanos)** | Modo `rental`, zonas de cobertura, despacho, montaje/desmontaje, recursos de logística, abonos manuales, acuerdos entre negocios (ambas modalidades), actas, liquidación entre socios | Los hermanos registran sus arriendos y colaboraciones en la app |
| **4. Red y ventas** | Profesional multi-negocio con agenda consolidada, instructor + club, revendedores, vendedores contratados | Un profesional ve dos negocios en una agenda; un vendedor liquida comisiones |
| **5. Expansión** | Motor de reglas y sujetos (mascotas, vehículos), modos `fixed_slot`, `capacity` y `queue`, landing con Puck, packs/membresías, lista de espera, app Expo | Nuevos rubros activables solo con plantillas |
| **6. Pagos y automatización** | Pagos en línea, abonos automáticos, WhatsApp completo, derivación automática por zona, boleta SII | Reserva pagada en línea de punta a punta |

Antes de programar la fase 3, documentar con los hermanos su proceso actual paso a paso.

---

## 25. Decisiones pendientes

- Nombre de la app (revisar dominio en NIC Chile y marca en INAPI).
- Precios de planes, add-ons y fee por sucursal.
- Proveedor de WhatsApp y costo por mensaje.
- Pasarela de pago.
- Valores por defecto de cancelación y daños entre socios.
- Integración de boleta electrónica.

---

## 26. Reglas de trabajo para Claude Code

1. Leer este documento al inicio de cada sesión.
2. Antes de implementar algo no trivial, **presentar un plan breve** (archivos, tablas, migraciones) y esperar aprobación.
3. Trabajar solo en la fase actual. Si algo pertenece a una fase futura, decirlo y no implementarlo, salvo dejar el modelo preparado cuando este documento lo pida.
4. Si una petición contradice este documento, señalarlo antes de escribir código.
5. Nunca poner lógica de negocio en componentes de UI.
6. Toda tabla nueva con datos de negocio lleva políticas RLS y su test.
7. Toda función de disponibilidad, precio o comisión lleva tests.
8. Explicar los cambios en lenguaje simple: el dueño del proyecto programa con apoyo de Claude y necesita entender qué se hizo y por qué.
9. Al tomar una decisión nueva de arquitectura, actualizar este documento (o agregar un ADR en `/docs`) en el mismo cambio.
