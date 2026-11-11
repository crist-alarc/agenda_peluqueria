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
- **Fase 2 · MVP peluquería:** en curso, en entregas 2A–2D. 2A y 2B implementadas; sigue 2C.
  Decisiones: `docs/adr/0002-fase-2a-reservas.md`, `docs/adr/0003-fase-2b-confirmacion-portal.md`.

Comandos de verificación antes de cada push: `pnpm typecheck`, `pnpm test`, `pnpm test:db`
(PostgreSQL local) y, si cambia la interfaz, `pnpm --filter @agenda/web e2e` con Supabase local.
Tras cada migración: regenerar `packages/db/src/database.types.ts` y revisar el Security Advisor.
