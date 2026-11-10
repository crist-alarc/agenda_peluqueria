# Instrucciones para Claude Code

**Lee `docs/DIRECTRICES.md` antes de cada tarea.** Es la fuente de verdad del proyecto y prevalece sobre
cualquier otra documentación del repositorio. Resumen de las reglas de trabajo (sección 26):

- Antes de algo no trivial, presentar un plan breve (archivos, tablas, migraciones) y esperar aprobación.
- Trabajar solo en la fase actual; señalar cualquier contradicción con las directrices antes de escribir código.
- Toda tabla con datos de negocio lleva RLS y su test; toda función de disponibilidad, precio o comisión lleva tests.
- Cambios de base de datos solo con migraciones versionadas.
- Explicar los cambios en lenguaje simple, en español.
- Las decisiones nuevas de arquitectura se registran en las directrices o en un ADR en `docs/` en el mismo cambio.

## Estado actual del repositorio

Monorepo pnpm según las directrices (ver `README.md`). **Fase actual: 1 · Fundaciones** (implementada,
pendiente de aprobación). Decisiones tomadas: `docs/adr/0001-fase-1-fundaciones.md`.

Comandos de verificación antes de cada push: `pnpm typecheck`, `pnpm test`, `pnpm test:db`
(PostgreSQL local) y, si cambia la interfaz, `pnpm --filter @agenda/web e2e` con Supabase local.
Tras cada migración: regenerar `packages/db/src/database.types.ts` y revisar el Security Advisor.
