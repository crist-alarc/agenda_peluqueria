# Agenda (nombre provisorio)

Plataforma SaaS para que pequeños negocios de servicios en Chile gestionen su agenda: peluquerías,
barberías, canchas, inflables, veterinarias y más. **Fuente de verdad del proyecto:
[`docs/DIRECTRICES.md`](docs/DIRECTRICES.md).** Decisiones de arquitectura en [`docs/adr/`](docs/adr).

**Fase actual:** 1 · Fundaciones — cuentas y roles, organización → negocio → sucursal, recursos,
servicios, adicionales con stock, planes y derechos, auditoría y RLS.

## Estructura (monorepo pnpm)

```
apps/web          Next.js (App Router): panel, login, PWA
packages/core     Lógica de dominio pura: permisos, límites del plan, montos CLP, horarios, validación (Zod)
packages/db       Capa de acceso a datos (repositorios), tipos generados y migraciones SQL de Supabase
packages/auth     Módulo propio de autenticación (envuelve Supabase Auth)
packages/ui       Componentes de interfaz (estilo shadcn/ui + Tailwind)
docs              Directrices y ADR
```

## Desarrollo

Requisitos: Node 22, pnpm 10, Docker (para Supabase local).

```bash
pnpm install

# Supabase local (base, Auth, API y Mailpit para ver los emails en http://localhost:54324)
npx supabase start --workdir packages/db
npx supabase status --workdir packages/db -o env   # copia API_URL y ANON_KEY

# apps/web/.env.local
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>
#   NEXT_PUBLIC_SITE_URL=http://localhost:3000

pnpm dev        # http://localhost:3000
```

## Pruebas

| Comando | Qué prueba |
|---|---|
| `pnpm typecheck` | Tipos en todos los paquetes |
| `pnpm test` | Lógica de dominio (`packages/core`) |
| `pnpm test:db` | Seguridad de la base: aislamiento entre negocios, roles, límites, auditoría. Necesita un PostgreSQL en `TEST_DATABASE_URL` (por defecto `postgres://postgres:postgres@localhost:5432/postgres`) |
| `pnpm --filter @agenda/web e2e` | Flujos críticos con Playwright (app corriendo + Supabase local) |

GitHub Actions ejecuta los tres niveles en cada PR (`.github/workflows/ci.yml`).

## Base de datos

- Los cambios se hacen **solo con migraciones** en `packages/db/supabase/migrations/`.
- Después de cada migración, regenerar `packages/db/src/database.types.ts`.
- Antes de publicar, revisar el Security Advisor de Supabase.

## Despliegue (Vercel)

1. Vercel → proyecto → *Settings → Build and Deployment → Root Directory*: `apps/web`.
2. La URL y la clave pública de Supabase vienen en `apps/web/.env.production` (no son secretas).
3. Supabase → *Authentication → URL Configuration*: agregar la URL de Vercel en *Site URL* y
   `https://<tu-app>.vercel.app/**` en *Redirect URLs*.

La app usa Next.js estándar (sin servicios exclusivos de Vercel), así que también puede correr en Docker
con `NEXT_OUTPUT=standalone`.
