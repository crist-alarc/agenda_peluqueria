# Agenda Peluquería ✂️

Aplicación web en **TypeScript** (React + Vite) para agendar horas en peluquerías y barberías, con **Supabase** como base de datos y autenticación.

## Funcionalidades

**Página pública de reservas** (`/`), sin necesidad de cuenta:
1. El cliente elige el servicio (corte, barba, tinte…), con duración y precio.
2. Elige profesional o "Cualquiera".
3. Elige día y una hora libre (calculada en el servidor según horario, citas y bloqueos).
4. Deja nombre, teléfono, email y comentarios → reserva confirmada.

**Panel de administración** (`/admin`), con login de Supabase Auth:
- **Agenda** diaria con filtro por profesional, estados (confirmada, completada, no asistió, cancelada), resumen de facturación y actualización en tiempo real cuando entra una reserva.
- **Servicios**: crear, editar, activar/desactivar y eliminar.
- **Profesionales**: datos, servicios que realiza, horario semanal por tramos (ej. 10–14 y 15–19) y bloqueos/ausencias (vacaciones, almuerzo…).
- **Ajustes**: nombre, teléfono, dirección, zona horaria, moneda, intervalo entre horas y días de anticipación para reservar.

### Seguridad e integridad
- **Row Level Security** en todas las tablas: el público sólo lee el catálogo; las citas sólo las ven los administradores.
- Los clientes reservan a través de la función `book_appointment()`, que valida que el horario siga disponible.
- Una **restricción de exclusión** (`btree_gist`) impide en la base de datos que un profesional tenga dos citas solapadas, incluso con reservas simultáneas.
- Los horarios se calculan en la **zona horaria del negocio**, sin depender de la del navegador.

## Puesta en marcha

### 1. Crear el proyecto en Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta el contenido de `supabase/migrations/20261107000000_init.sql`.
3. (Opcional) Ejecuta `supabase/seed.sql` para cargar servicios, profesionales y horarios de ejemplo.

> Con la [CLI de Supabase](https://supabase.com/docs/guides/cli) también puedes usar `supabase link` y `supabase db push`.

### 2. Configurar la app
```bash
# El repositorio ya trae .env apuntando al proyecto Supabase de producción.
# Para usar otro proyecto: cp .env.example .env.local y completa los valores.
npm install
npm run dev
```
Abre http://localhost:5173.

### 3. Crear el primer administrador
1. Entra en `/login` y regístrate (o crea el usuario en **Authentication → Users**).
2. En el SQL Editor de Supabase, dale permisos de administrador:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'tu-email@ejemplo.com';
   ```
3. Recarga `/admin`.

> Recomendado: una vez creados los administradores, desactiva el registro público en **Authentication → Sign In / Providers → Allow new users to sign up**. Aunque alguien se registre, no tendrá acceso al panel si no está en la tabla `admins`.

## Scripts
| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck + build de producción en `dist/` |
| `npm run typecheck` | Sólo comprobación de tipos |
| `npm test` | Tests unitarios (Vitest) |

## Publicación en GitHub Pages

La app se publica automáticamente en **https://crist-alarc.github.io/agenda_peluqueria/** con el workflow
`.github/workflows/deploy.yml` en cada push a `main` (o a mano desde la pestaña *Actions*).

Configuración necesaria (una sola vez):
1. **GitHub** → *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
2. **Supabase** → *Authentication → URL Configuration*:
   - *Site URL*: `https://crist-alarc.github.io/agenda_peluqueria/`
   - *Redirect URLs*: añade `https://crist-alarc.github.io/agenda_peluqueria/**` y `http://localhost:5173/**`

La conexión a Supabase está en `.env` (URL y clave *publishable*, que son públicas por diseño;
la seguridad la dan las políticas RLS). Para apuntar a otro proyecto en local, usa `.env.local`.

## Estructura
```
supabase/
  migrations/…_init.sql   Tablas, RLS y funciones (get_available_slots, book_appointment, get_agenda)
  seed.sql                Datos de ejemplo
src/
  lib/                    Cliente Supabase, contexto (ajustes + sesión), fechas y formato
  types/database.ts       Tipos de la base de datos
  pages/BookingPage.tsx   Reserva pública
  pages/LoginPage.tsx     Acceso del personal
  pages/admin/            Agenda, Servicios, Profesionales, Ajustes
```

## Modelo de datos
| Tabla | Contenido |
|---|---|
| `business_settings` | Configuración del negocio (una fila) |
| `services` | Servicios con duración y precio |
| `staff` | Profesionales |
| `staff_services` | Qué servicios hace cada profesional |
| `working_hours` | Horario semanal por tramos |
| `time_off` | Bloqueos y ausencias |
| `appointments` | Citas |
| `admins` | Usuarios con acceso al panel |
