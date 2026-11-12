# Instrucciones para Claude Code

**Lee `docs/DIRECTRICES.md` antes de cada tarea, y `docs/ESTADO.md` al empezar una sesión** (estado, pendientes y cómo retomar). Es la fuente de verdad del proyecto y prevalece sobre
cualquier otra documentación del repositorio. Resumen de las reglas de trabajo (sección 26):

- Antes de algo no trivial, presentar un plan breve (archivos, tablas, migraciones) y esperar aprobación.
- Trabajar solo en la fase actual; señalar cualquier contradicción con las directrices antes de escribir código.
- Toda tabla con datos de negocio lleva RLS y su test; toda función de disponibilidad, precio o comisión lleva tests.
- Cambios de base de datos solo con migraciones versionadas.
- Explicar los cambios en lenguaje simple, en español.
- Las decisiones nuevas de arquitectura se registran en las directrices o en un ADR en `docs/` en el mismo cambio.

## Estado actual del repositorio

Monorepo pnpm según las directrices (ver `README.md`).
- **Fase 1 · Fundaciones:** cerrada (aprobada por el dueño). Decisiones: `docs/adr/0001-fase-1-fundaciones.md`.
- **Fase 2 · MVP peluquería:** programada completa (2A–2D); el piloto con una peluquería real queda para más adelante.
  Decisiones: ADR 0002 (reservas), 0003 (confirmación y portal), 0004 (emails y recordatorios), 0005 (comisiones).
- **Fase 3 · MVP inflables:** en curso. Proceso de los hermanos en `docs/proceso-inflables.md`; decisiones y
  plan aprobado en el ADR 0006 y `docs/ESTADO.md` (sección 7.5). Hechas la 3·0 (país y moneda) y la 3A
  (catálogo de arriendo, ADR 0007); sigue la 3B.
- **Dinero:** enteros en la unidad mínima de la moneda del negocio (`businesses.currency`); usar
  `formatMoney`/`parseMoney` de `@agenda/core`, nunca formatear montos a mano (ADR 0006).
- **Regla del dueño:** todo tiempo que afecte a usuarios es configurable por negocio (ADR 0004).
- **Diseño de pantallas:** usar siempre el skill `anthropic-skills:frontend-design` (indicación del dueño, 2026-11-12).
- **Consola de la plataforma `/admin`** (ADR 0008): los clientes son los dueños de negocios; soporte solo con acceso
  aprobado por el negocio y sin datos de clientes finales. A1 hecha; siguen A2 (planes) y A3 (facturación).

Comandos de verificación antes de cada push: `pnpm typecheck`, `pnpm test`, `pnpm test:db`
(PostgreSQL local) y, si cambia la interfaz, `pnpm --filter @agenda/web e2e` con Supabase local.
Tras cada migración: regenerar `packages/db/src/database.types.ts` y revisar el Security Advisor.
