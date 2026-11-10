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

El código existente (Vite + React, una sola peluquería, publicado en GitHub Pages y Vercel) es un **prototipo anterior
a las directrices**. No sigue el modelo multi-negocio ni el stack definido (Next.js, Tailwind, monorepo).
Fase actual: **1. Fundaciones** (pendiente de iniciar).
