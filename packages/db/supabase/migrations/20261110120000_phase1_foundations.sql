-- =============================================================================
-- Fase 1 · Fundaciones (docs/DIRECTRICES.md, secciones 5, 6, 7, 17, 21)
--
-- Reemplaza el esquema del prototipo (una sola peluquería) por el modelo
-- multi-negocio: organización → negocio → sucursal, membresías con roles,
-- recursos, servicios, adicionales con stock, planes/derechos y auditoría.
-- Todas las tablas tienen RLS. SQL estándar de PostgreSQL (principio 9).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Eliminar el prototipo (aprobado por el dueño del proyecto el 2026-11-10)
-- -----------------------------------------------------------------------------
drop function if exists public.get_agenda(date);
drop function if exists public.book_appointment(uuid, uuid, timestamptz, text, text, text, text);
drop function if exists public.get_available_slots(uuid, date, uuid);
drop table if exists public.appointments, public.time_off, public.working_hours,
  public.staff_services, public.staff, public.services, public.admins,
  public.business_settings cascade;
drop function if exists public.is_admin();
drop type if exists public.appointment_status;

-- -----------------------------------------------------------------------------
-- 1. Esquema interno `app` (no se expone por la API) y usuario actual
-- -----------------------------------------------------------------------------
create schema if not exists app;
grant usage on schema app to anon, authenticated;

-- Única función que conoce al proveedor de autenticación (sección 3.1).
-- Si se cambia de proveedor, solo se modifica esta función.
create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- 2. Tipos
-- -----------------------------------------------------------------------------
create type public.membership_role as enum ('owner', 'admin', 'branch_admin', 'receptionist', 'staff', 'seller');
create type public.resource_type as enum ('person', 'space', 'equipment');
create type public.booking_mode as enum ('appointment', 'fixed_slot', 'capacity', 'rental', 'queue');

-- -----------------------------------------------------------------------------
-- 3. Catálogos globales (solo lectura para la app)
-- -----------------------------------------------------------------------------
create table public.industry_templates (
  code text primary key,
  name text not null,
  booking_mode public.booking_mode not null,
  -- { branch_hours: [...], services: [...], addons: [...] } — ver datos al final
  config jsonb not null default '{}'::jsonb,
  sort_order int not null default 0
);

create table public.plans (
  code text primary key,
  name text not null,
  description text,
  is_public boolean not null default true
);

-- Derechos que otorga cada plan. limit_value null = sin límite.
create table public.plan_features (
  plan_code text not null references public.plans (code) on delete cascade,
  feature text not null,
  enabled boolean not null default true,
  limit_value int check (limit_value is null or limit_value >= 0),
  primary key (plan_code, feature)
);

-- Feriados nacionales de Chile (sección 6)
create table public.holidays (
  date date primary key,
  name text not null
);

-- -----------------------------------------------------------------------------
-- 4. Identidad
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5. Estructura organizacional
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  owner_user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  industry_code text not null references public.industry_templates (code),
  booking_mode public.booking_mode not null,
  timezone text not null default 'America/Santiago',
  phone text,
  email text,
  created_at timestamptz not null default now()
);
create index businesses_organization_idx on public.businesses (organization_id);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  address text,
  commune text,
  -- Zona de cobertura (lista de comunas). Se usa en la fase 3 (modo rental).
  coverage_communes text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index branches_business_idx on public.branches (business_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, business_id)
);
create index memberships_business_idx on public.memberships (business_id);

-- Sucursales a las que se limita una membresía (branch_admin, receptionist, staff, seller).
-- Sin filas = sin restricción por sucursal.
create table public.membership_branches (
  membership_id uuid not null references public.memberships (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  primary key (membership_id, branch_id)
);

-- Horario semanal de la sucursal (0 = domingo … 6 = sábado)
create table public.branch_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  check (closes_at > opens_at)
);
create index branch_hours_branch_idx on public.branch_hours (branch_id, weekday);

-- -----------------------------------------------------------------------------
-- 6. Catálogo: profesionales, recursos, servicios, adicionales
-- -----------------------------------------------------------------------------
-- Identidad global de una persona que presta servicios (sección 13).
create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete set null,
  display_name text not null check (length(trim(display_name)) > 0),
  email text,
  phone text,
  -- Negocio que la registró: sus administradores pueden editarla.
  created_by_business_id uuid references public.businesses (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete restrict,
  type public.resource_type not null,
  name text not null check (length(trim(name)) > 0),
  professional_id uuid references public.professionals (id) on delete restrict,
  -- Habilidades (ej. 'barberia', 'colorimetria') para los requisitos de servicios
  skills text[] not null default '{}',
  -- Recursos de logística (camioneta, equipo de montaje), fase 3
  is_logistics boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Un recurso persona siempre está vinculado a un profesional
  check ((type = 'person') = (professional_id is not null))
);
create index resources_business_idx on public.resources (business_id);
create index resources_branch_idx on public.resources (branch_id);

create table public.resource_hours (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at)
);
create index resource_hours_resource_idx on public.resource_hours (resource_id, weekday);

-- Bloqueos (vacaciones, cierre, mantención) de una sucursal o de un recurso
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((branch_id is null) <> (resource_id is null))
);
create index blocks_business_idx on public.blocks (business_id, starts_at);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  booking_mode public.booking_mode not null,
  duration_minutes int not null check (duration_minutes between 5 and 10080),
  -- Montos en pesos chilenos enteros (sección 20)
  price_clp int not null default 0 check (price_clp >= 0),
  buffer_before_minutes int not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes int not null default 0 check (buffer_after_minutes >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index services_business_idx on public.services (business_id);

-- Requisitos de recursos: ej. 1 person con habilidad 'barberia' + 1 space
create table public.service_resource_requirements (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  resource_type public.resource_type not null,
  quantity int not null default 1 check (quantity between 1 and 50),
  required_skill text
);
create index service_requirements_service_idx on public.service_resource_requirements (service_id);

create table public.addons (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  price_clp int not null default 0 check (price_clp >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index addons_business_idx on public.addons (business_id);

-- Stock de cada adicional por sucursal (unidades disponibles a la vez)
create table public.addon_stock (
  addon_id uuid not null references public.addons (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  quantity int not null check (quantity >= 0),
  primary key (addon_id, branch_id)
);

-- -----------------------------------------------------------------------------
-- 7. Suscripción y derechos por negocio (sección 17)
-- -----------------------------------------------------------------------------
create table public.business_subscriptions (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  plan_code text not null references public.plans (code),
  status text not null default 'active' check (status in ('trial', 'active', 'past_due', 'cancelled')),
  started_at timestamptz not null default now()
);

-- Derechos efectivos del negocio (plan + add-ons + ajustes manuales).
create table public.business_entitlements (
  business_id uuid not null references public.businesses (id) on delete cascade,
  feature text not null,
  enabled boolean not null default true,
  limit_value int check (limit_value is null or limit_value >= 0),
  source text not null default 'plan' check (source in ('plan', 'addon', 'manual')),
  primary key (business_id, feature)
);

-- -----------------------------------------------------------------------------
-- 8. Auditoría (sección 21)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid,
  table_name text not null,
  record_id text,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_user_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_business_idx on public.audit_log (business_id, created_at desc);

-- =============================================================================
-- 9. Funciones de permisos (security definer: leen membresías sin pasar por RLS)
-- =============================================================================
create or replace function app.has_business_role(p_business_id uuid, p_roles public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id
      and m.user_id = app.current_user_id()
      and m.role = any (p_roles)
  );
$$;

create or replace function app.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id and m.user_id = app.current_user_id()
  );
$$;

-- owner o admin: gestionan todo el negocio
create or replace function app.can_manage_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.has_business_role(p_business_id, array['owner', 'admin']::public.membership_role[]);
$$;

-- owner/admin del negocio, o branch_admin asignado a esa sucursal
create or replace function app.can_manage_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.branches b
    join public.memberships m on m.business_id = b.business_id and m.user_id = app.current_user_id()
    where b.id = p_branch_id
      and (
        m.role in ('owner', 'admin')
        or (m.role = 'branch_admin'
            and exists (select 1 from public.membership_branches mb
                        where mb.membership_id = m.id and mb.branch_id = b.id))
      )
  );
$$;

create or replace function app.can_manage_resource(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.resources r
    where r.id = p_resource_id and app.can_manage_branch(r.branch_id)
  );
$$;

-- ¿El usuario actual comparte algún negocio con p_user_id? (para ver nombres del equipo)
create or replace function app.shares_business_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.business_id = mine.business_id
    where mine.user_id = app.current_user_id() and theirs.user_id = p_user_id
  );
$$;

-- =============================================================================
-- 10. Row Level Security — ninguna tabla queda sin RLS (sección 21)
-- =============================================================================
alter table public.industry_templates            enable row level security;
alter table public.plans                         enable row level security;
alter table public.plan_features                 enable row level security;
alter table public.holidays                      enable row level security;
alter table public.profiles                      enable row level security;
alter table public.organizations                 enable row level security;
alter table public.businesses                    enable row level security;
alter table public.branches                      enable row level security;
alter table public.memberships                   enable row level security;
alter table public.membership_branches           enable row level security;
alter table public.branch_hours                  enable row level security;
alter table public.professionals                 enable row level security;
alter table public.resources                     enable row level security;
alter table public.resource_hours                enable row level security;
alter table public.blocks                        enable row level security;
alter table public.services                      enable row level security;
alter table public.service_resource_requirements enable row level security;
alter table public.addons                        enable row level security;
alter table public.addon_stock                   enable row level security;
alter table public.business_subscriptions        enable row level security;
alter table public.business_entitlements         enable row level security;
alter table public.audit_log                     enable row level security;

-- Catálogos globales: lectura para todos, sin escritura desde la app
create policy industry_templates_read on public.industry_templates for select using (true);
create policy plans_read on public.plans for select using (is_public);
create policy plan_features_read on public.plan_features for select using (
  exists (select 1 from public.plans p where p.code = plan_code and p.is_public)
);
create policy holidays_read on public.holidays for select using (true);

-- Perfiles: el propio, y los de personas con quienes comparto negocio
create policy profiles_read on public.profiles for select to authenticated
  using (id = app.current_user_id() or app.shares_business_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = app.current_user_id()) with check (id = app.current_user_id());

-- Organizaciones: el dueño, o miembros de alguno de sus negocios
create policy organizations_read on public.organizations for select to authenticated
  using (
    owner_user_id = app.current_user_id()
    or exists (select 1 from public.businesses b
               where b.organization_id = organizations.id and app.is_business_member(b.id))
  );
create policy organizations_update on public.organizations for update to authenticated
  using (owner_user_id = app.current_user_id()) with check (owner_user_id = app.current_user_id());

-- Negocios: se crean con app_create_business(); los ven sus miembros
create policy businesses_read on public.businesses for select to authenticated
  using (app.is_business_member(id));
create policy businesses_update on public.businesses for update to authenticated
  using (app.can_manage_business(id)) with check (app.can_manage_business(id));

-- Sucursales
create policy branches_read on public.branches for select to authenticated
  using (app.is_business_member(business_id));
create policy branches_insert on public.branches for insert to authenticated
  with check (app.can_manage_business(business_id));
create policy branches_update on public.branches for update to authenticated
  using (app.can_manage_branch(id)) with check (app.can_manage_branch(id));
create policy branches_delete on public.branches for delete to authenticated
  using (app.can_manage_business(business_id));

-- Membresías: los miembros ven al equipo; owner/admin gestionan.
-- Solo un owner puede crear, modificar o quitar a otro owner.
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = app.current_user_id() or app.is_business_member(business_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (
    app.can_manage_business(business_id)
    and (role <> 'owner' or app.has_business_role(business_id, array['owner']::public.membership_role[]))
  );
create policy memberships_update on public.memberships for update to authenticated
  using (
    app.can_manage_business(business_id)
    and (role <> 'owner' or app.has_business_role(business_id, array['owner']::public.membership_role[]))
  )
  with check (
    app.can_manage_business(business_id)
    and (role <> 'owner' or app.has_business_role(business_id, array['owner']::public.membership_role[]))
  );
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    app.can_manage_business(business_id)
    and (role <> 'owner' or app.has_business_role(business_id, array['owner']::public.membership_role[]))
  );

create policy membership_branches_read on public.membership_branches for select to authenticated
  using (exists (select 1 from public.memberships m
                 where m.id = membership_id and app.is_business_member(m.business_id)));
create policy membership_branches_write on public.membership_branches for all to authenticated
  using (exists (select 1 from public.memberships m
                 where m.id = membership_id and app.can_manage_business(m.business_id)))
  with check (exists (select 1 from public.memberships m join public.branches b on b.id = branch_id
                      where m.id = membership_id and b.business_id = m.business_id
                        and app.can_manage_business(m.business_id)));

-- Horario de sucursal
create policy branch_hours_read on public.branch_hours for select to authenticated
  using (exists (select 1 from public.branches b where b.id = branch_id and app.is_business_member(b.business_id)));
create policy branch_hours_write on public.branch_hours for all to authenticated
  using (app.can_manage_branch(branch_id)) with check (app.can_manage_branch(branch_id));

-- Profesionales (identidad global)
create policy professionals_read on public.professionals for select to authenticated
  using (
    user_id = app.current_user_id()
    or app.is_business_member(created_by_business_id)
    or exists (select 1 from public.resources r
               where r.professional_id = professionals.id and app.is_business_member(r.business_id))
  );
create policy professionals_insert on public.professionals for insert to authenticated
  with check (created_by_business_id is not null and app.can_manage_business(created_by_business_id));
create policy professionals_update on public.professionals for update to authenticated
  using (user_id = app.current_user_id() or app.can_manage_business(created_by_business_id))
  with check (user_id = app.current_user_id() or app.can_manage_business(created_by_business_id));

-- Recursos: los ven los miembros; los gestionan owner/admin o el branch_admin de su sucursal
create policy resources_read on public.resources for select to authenticated
  using (app.is_business_member(business_id));
create policy resources_insert on public.resources for insert to authenticated
  with check (
    app.can_manage_branch(branch_id)
    and exists (select 1 from public.branches b where b.id = branch_id and b.business_id = resources.business_id)
  );
create policy resources_update on public.resources for update to authenticated
  using (app.can_manage_branch(branch_id))
  with check (
    app.can_manage_branch(branch_id)
    and exists (select 1 from public.branches b where b.id = branch_id and b.business_id = resources.business_id)
  );
create policy resources_delete on public.resources for delete to authenticated
  using (app.can_manage_branch(branch_id));

create policy resource_hours_read on public.resource_hours for select to authenticated
  using (exists (select 1 from public.resources r where r.id = resource_id and app.is_business_member(r.business_id)));
create policy resource_hours_write on public.resource_hours for all to authenticated
  using (app.can_manage_resource(resource_id)) with check (app.can_manage_resource(resource_id));

-- Bloqueos
create policy blocks_read on public.blocks for select to authenticated
  using (app.is_business_member(business_id));
create policy blocks_write on public.blocks for all to authenticated
  using (
    (branch_id is not null and app.can_manage_branch(branch_id))
    or (resource_id is not null and app.can_manage_resource(resource_id))
  )
  with check (
    (branch_id is not null and app.can_manage_branch(branch_id)
       and exists (select 1 from public.branches b where b.id = branch_id and b.business_id = blocks.business_id))
    or (resource_id is not null and app.can_manage_resource(resource_id)
       and exists (select 1 from public.resources r where r.id = resource_id and r.business_id = blocks.business_id))
  );

-- Servicios, requisitos y adicionales: los ven los miembros; gestionan owner/admin
create policy services_read on public.services for select to authenticated
  using (app.is_business_member(business_id));
create policy services_write on public.services for all to authenticated
  using (app.can_manage_business(business_id)) with check (app.can_manage_business(business_id));

create policy service_requirements_read on public.service_resource_requirements for select to authenticated
  using (exists (select 1 from public.services s where s.id = service_id and app.is_business_member(s.business_id)));
create policy service_requirements_write on public.service_resource_requirements for all to authenticated
  using (exists (select 1 from public.services s where s.id = service_id and app.can_manage_business(s.business_id)))
  with check (exists (select 1 from public.services s where s.id = service_id and app.can_manage_business(s.business_id)));

create policy addons_read on public.addons for select to authenticated
  using (app.is_business_member(business_id));
create policy addons_write on public.addons for all to authenticated
  using (app.can_manage_business(business_id)) with check (app.can_manage_business(business_id));

create policy addon_stock_read on public.addon_stock for select to authenticated
  using (exists (select 1 from public.addons a where a.id = addon_id and app.is_business_member(a.business_id)));
create policy addon_stock_write on public.addon_stock for all to authenticated
  using (app.can_manage_branch(branch_id))
  with check (
    app.can_manage_branch(branch_id)
    and exists (select 1 from public.addons a join public.branches b on b.business_id = a.business_id
                where a.id = addon_id and b.id = branch_id)
  );

-- Suscripción y derechos: los miembros los ven; solo el sistema los modifica
create policy subscriptions_read on public.business_subscriptions for select to authenticated
  using (app.is_business_member(business_id));
create policy entitlements_read on public.business_entitlements for select to authenticated
  using (app.is_business_member(business_id));

-- Auditoría: solo owner/admin del negocio; nadie escribe desde la app (lo hace el trigger)
create policy audit_log_read on public.audit_log for select to authenticated
  using (business_id is not null and app.can_manage_business(business_id));

-- =============================================================================
-- 11. Triggers
-- =============================================================================

-- 11.1 Perfil automático al registrarse
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function app.handle_new_user();

-- Perfiles para usuarios que ya existían
insert into public.profiles (id, email, full_name)
select u.id, lower(u.email), nullif(trim(u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
on conflict (id) do nothing;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- 11.2 Límites del plan (garantía final en la base; sección 17)
create or replace function app.enforce_entitlement_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_feature text := tg_argv[0];
  v_enabled boolean;
  v_limit int;
  v_count int;
begin
  select e.enabled, e.limit_value into v_enabled, v_limit
  from public.business_entitlements e
  where e.business_id = new.business_id and e.feature = v_feature;

  if not found or not v_enabled then
    raise exception 'Tu plan no incluye esta función (%)', v_feature using errcode = 'P0001';
  end if;

  if v_limit is not null then
    execute format('select count(*) from public.%I where business_id = $1', tg_table_name)
      into v_count using new.business_id;
    if v_count >= v_limit then
      raise exception 'Alcanzaste el límite de tu plan para % (%)', v_feature, v_limit using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger branches_limit before insert on public.branches
  for each row execute function app.enforce_entitlement_limit('branches');
create trigger resources_limit before insert on public.resources
  for each row execute function app.enforce_entitlement_limit('resources');

-- 11.3 Un negocio nunca se queda sin owner
create or replace function app.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.businesses b where b.id = old.business_id)
     and not exists (select 1 from public.memberships m
                     where m.business_id = old.business_id and m.role = 'owner' and m.id <> old.id) then
    raise exception 'El negocio debe tener al menos un dueño' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_protect_owner before update or delete on public.memberships
  for each row execute function app.protect_last_owner();

-- 11.4 Auditoría genérica (valores antes/después)
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_business uuid;
begin
  if tg_table_name = 'businesses' then
    v_business := (v_row ->> 'id')::uuid;
  elsif v_row ? 'business_id' then
    v_business := (v_row ->> 'business_id')::uuid;
  elsif tg_table_name = 'addon_stock' then
    select a.business_id into v_business from public.addons a where a.id = (v_row ->> 'addon_id')::uuid;
  elsif tg_table_name = 'service_resource_requirements' then
    select s.business_id into v_business from public.services s where s.id = (v_row ->> 'service_id')::uuid;
  end if;

  insert into public.audit_log (business_id, table_name, record_id, action, actor_user_id, old_data, new_data)
  values (
    v_business,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'addon_id' || ':' || (v_row ->> 'branch_id')),
    lower(tg_op),
    app.current_user_id(),
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses', 'branches', 'memberships', 'resources', 'services',
    'service_resource_requirements', 'addons', 'addon_stock', 'blocks',
    'business_subscriptions', 'business_entitlements'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()',
      t || '_audit', t
    );
  end loop;
end $$;

-- =============================================================================
-- 12. Alta de negocio (atómica): organización + negocio + dueño + sucursal +
--     plan base + datos de la plantilla del rubro (secciones 6, 7.5 y 17)
-- =============================================================================
create or replace function app.slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(coalesce(p_text, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

create or replace function public.app_create_business(
  p_business_name text,
  p_industry_code text,
  p_branch_name text,
  p_branch_address text default null,
  p_branch_commune text default null,
  p_timezone text default 'America/Santiago'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := app.current_user_id();
  v_template public.industry_templates;
  v_org uuid;
  v_business uuid;
  v_branch uuid;
  v_base_slug text;
  v_slug text;
  v_service jsonb;
  v_service_id uuid;
  v_requirement jsonb;
  v_addon jsonb;
  v_hours jsonb;
  v_n int := 1;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if coalesce(trim(p_business_name), '') = '' or coalesce(trim(p_branch_name), '') = '' then
    raise exception 'El nombre del negocio y de la sucursal son obligatorios' using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Zona horaria no válida: %', p_timezone using errcode = 'P0001';
  end if;

  select * into v_template from public.industry_templates where code = p_industry_code;
  if not found then
    raise exception 'Rubro no válido: %', p_industry_code using errcode = 'P0001';
  end if;

  insert into public.profiles (id) values (v_user) on conflict (id) do nothing;

  -- Una organización por dueño: se reutiliza si ya existe
  select id into v_org from public.organizations where owner_user_id = v_user order by created_at limit 1;
  if v_org is null then
    insert into public.organizations (name, owner_user_id) values (trim(p_business_name), v_user)
    returning id into v_org;
  end if;

  v_base_slug := coalesce(nullif(app.slugify(p_business_name), ''), 'negocio');
  v_slug := v_base_slug;
  while exists (select 1 from public.businesses where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base_slug || '-' || v_n;
  end loop;

  insert into public.businesses (organization_id, name, slug, industry_code, booking_mode, timezone)
  values (v_org, trim(p_business_name), v_slug, v_template.code, v_template.booking_mode, p_timezone)
  returning id into v_business;

  insert into public.memberships (user_id, business_id, role) values (v_user, v_business, 'owner');

  -- Plan base: se copian sus derechos al negocio
  insert into public.business_subscriptions (business_id, plan_code) values (v_business, 'base');
  insert into public.business_entitlements (business_id, feature, enabled, limit_value, source)
  select v_business, pf.feature, pf.enabled, pf.limit_value, 'plan'
  from public.plan_features pf where pf.plan_code = 'base';

  insert into public.branches (business_id, name, address, commune)
  values (v_business, trim(p_branch_name), nullif(trim(p_branch_address), ''), nullif(trim(p_branch_commune), ''))
  returning id into v_branch;

  -- Datos precargados de la plantilla (todo editable después)
  for v_hours in select * from jsonb_array_elements(coalesce(v_template.config -> 'branch_hours', '[]'::jsonb)) loop
    insert into public.branch_hours (branch_id, weekday, opens_at, closes_at)
    values (v_branch, (v_hours ->> 'weekday')::smallint, (v_hours ->> 'opens_at')::time, (v_hours ->> 'closes_at')::time);
  end loop;

  for v_service in select * from jsonb_array_elements(coalesce(v_template.config -> 'services', '[]'::jsonb)) loop
    insert into public.services (business_id, name, description, booking_mode, duration_minutes, price_clp,
                                 buffer_before_minutes, buffer_after_minutes)
    values (
      v_business,
      v_service ->> 'name',
      v_service ->> 'description',
      v_template.booking_mode,
      (v_service ->> 'duration_minutes')::int,
      coalesce((v_service ->> 'price_clp')::int, 0),
      coalesce((v_service ->> 'buffer_before_minutes')::int, 0),
      coalesce((v_service ->> 'buffer_after_minutes')::int, 0)
    )
    returning id into v_service_id;

    for v_requirement in select * from jsonb_array_elements(coalesce(v_service -> 'requirements', '[]'::jsonb)) loop
      insert into public.service_resource_requirements (service_id, resource_type, quantity, required_skill)
      values (
        v_service_id,
        (v_requirement ->> 'resource_type')::public.resource_type,
        coalesce((v_requirement ->> 'quantity')::int, 1),
        v_requirement ->> 'required_skill'
      );
    end loop;
  end loop;

  for v_addon in select * from jsonb_array_elements(coalesce(v_template.config -> 'addons', '[]'::jsonb)) loop
    insert into public.addons (business_id, name, price_clp)
    values (v_business, v_addon ->> 'name', coalesce((v_addon ->> 'price_clp')::int, 0));
  end loop;

  return v_business;
end;
$$;

-- Agregar (o cambiar el rol de) un miembro del equipo por su email.
-- La persona debe tener cuenta: nunca se vincula a alguien sin que se registre.
create or replace function public.app_add_member(
  p_business_id uuid,
  p_email text,
  p_role public.membership_role,
  p_branch_ids uuid[] default '{}'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_membership uuid;
begin
  if not app.can_manage_business(p_business_id) then
    raise exception 'No tienes permiso para gestionar el equipo de este negocio' using errcode = '42501';
  end if;
  if p_role = 'owner' and not app.has_business_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'Solo un dueño puede agregar a otro dueño' using errcode = '42501';
  end if;

  select p.id into v_user from public.profiles p where p.email = lower(trim(p_email));
  if v_user is null then
    raise exception 'No existe una cuenta con ese email. Pídele que se registre primero.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.memberships m
             where m.business_id = p_business_id and m.user_id = v_user and m.role = 'owner')
     and not app.has_business_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'Solo un dueño puede cambiar el rol de otro dueño' using errcode = '42501';
  end if;

  insert into public.memberships (user_id, business_id, role)
  values (v_user, p_business_id, p_role)
  on conflict (user_id, business_id) do update set role = excluded.role
  returning id into v_membership;

  delete from public.membership_branches where membership_id = v_membership;
  insert into public.membership_branches (membership_id, branch_id)
  select v_membership, b.id from public.branches b
  where b.business_id = p_business_id and b.id = any (coalesce(p_branch_ids, '{}'));

  return v_membership;
end;
$$;

-- =============================================================================
-- 13. Permisos de ejecución
-- =============================================================================
revoke all on all functions in schema app from public;
grant execute on function app.current_user_id() to anon, authenticated;
grant execute on function app.has_business_role(uuid, public.membership_role[]) to authenticated;
grant execute on function app.is_business_member(uuid) to authenticated;
grant execute on function app.can_manage_business(uuid) to authenticated;
grant execute on function app.can_manage_branch(uuid) to authenticated;
grant execute on function app.can_manage_resource(uuid) to authenticated;
grant execute on function app.shares_business_with(uuid) to authenticated;

revoke all on function public.app_create_business(text, text, text, text, text, text) from public, anon;
grant execute on function public.app_create_business(text, text, text, text, text, text) to authenticated;
revoke all on function public.app_add_member(uuid, text, public.membership_role, uuid[]) from public, anon;
grant execute on function public.app_add_member(uuid, text, public.membership_role, uuid[]) to authenticated;

-- La auditoría y los derechos solo los escribe el sistema
revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke insert, update, delete on public.business_entitlements, public.business_subscriptions from anon, authenticated;
revoke insert, update, delete on public.industry_templates, public.plans, public.plan_features, public.holidays from anon, authenticated;

-- =============================================================================
-- 14. Datos de referencia
-- =============================================================================

-- Plan base (sección 17). Los precios se definen después.
insert into public.plans (code, name, description) values
  ('base', 'Plan Base', 'Agenda, 1 sucursal, hasta 10 recursos y notificaciones por email');

insert into public.plan_features (plan_code, feature, enabled, limit_value) values
  ('base', 'branches',            true,  1),
  ('base', 'resources',           true,  10),
  ('base', 'email_notifications', true,  null),
  ('base', 'whatsapp_messages',   false, 0),
  ('base', 'rules',               false, null),
  ('base', 'landing',             false, null),
  ('base', 'commissions',         false, null),
  ('base', 'partnerships',        false, null),
  ('base', 'sellers',             false, null);

-- Plantillas por rubro (sección 7.5). Lunes a sábado = 1..6.
insert into public.industry_templates (code, name, booking_mode, sort_order, config) values
(
  'hair_salon', 'Peluquería', 'appointment', 1,
  $json${
    "branch_hours": [
      {"weekday": 1, "opens_at": "10:00", "closes_at": "20:00"},
      {"weekday": 2, "opens_at": "10:00", "closes_at": "20:00"},
      {"weekday": 3, "opens_at": "10:00", "closes_at": "20:00"},
      {"weekday": 4, "opens_at": "10:00", "closes_at": "20:00"},
      {"weekday": 5, "opens_at": "10:00", "closes_at": "20:00"},
      {"weekday": 6, "opens_at": "10:00", "closes_at": "18:00"}
    ],
    "services": [
      {"name": "Corte de pelo", "duration_minutes": 30, "price_clp": 12000,
       "requirements": [{"resource_type": "person"}]},
      {"name": "Corte + lavado", "duration_minutes": 45, "price_clp": 15000,
       "requirements": [{"resource_type": "person"}]},
      {"name": "Tinte", "duration_minutes": 90, "price_clp": 35000,
       "requirements": [{"resource_type": "person", "required_skill": "colorimetria"}]},
      {"name": "Brushing", "duration_minutes": 40, "price_clp": 14000,
       "requirements": [{"resource_type": "person"}]}
    ],
    "addons": [
      {"name": "Tratamiento de hidratación", "price_clp": 8000}
    ]
  }$json$::jsonb
),
(
  'barbershop', 'Barbería', 'appointment', 2,
  $json${
    "branch_hours": [
      {"weekday": 1, "opens_at": "10:00", "closes_at": "20:00"},
      {"weekday": 2, "opens_at": "10:00", "closes_at": "20:00"},
      {"weekday": 3, "opens_at": "10:00", "closes_at": "20:00"},
      {"weekday": 4, "opens_at": "10:00", "closes_at": "20:00"},
      {"weekday": 5, "opens_at": "10:00", "closes_at": "20:00"},
      {"weekday": 6, "opens_at": "10:00", "closes_at": "18:00"}
    ],
    "services": [
      {"name": "Corte de pelo", "duration_minutes": 30, "price_clp": 10000,
       "requirements": [{"resource_type": "person"}]},
      {"name": "Corte + barba", "duration_minutes": 45, "price_clp": 15000,
       "requirements": [{"resource_type": "person", "required_skill": "barberia"}]},
      {"name": "Arreglo de barba", "duration_minutes": 20, "price_clp": 7000,
       "requirements": [{"resource_type": "person", "required_skill": "barberia"}]}
    ],
    "addons": []
  }$json$::jsonb
),
(
  'inflatables', 'Juegos inflables', 'rental', 3,
  $json${
    "branch_hours": [
      {"weekday": 0, "opens_at": "09:00", "closes_at": "21:00"},
      {"weekday": 1, "opens_at": "09:00", "closes_at": "21:00"},
      {"weekday": 2, "opens_at": "09:00", "closes_at": "21:00"},
      {"weekday": 3, "opens_at": "09:00", "closes_at": "21:00"},
      {"weekday": 4, "opens_at": "09:00", "closes_at": "21:00"},
      {"weekday": 5, "opens_at": "09:00", "closes_at": "21:00"},
      {"weekday": 6, "opens_at": "09:00", "closes_at": "21:00"}
    ],
    "services": [
      {"name": "Arriendo de juego inflable (medio día)", "duration_minutes": 240, "price_clp": 45000,
       "buffer_before_minutes": 60, "buffer_after_minutes": 60,
       "requirements": [{"resource_type": "equipment"}]},
      {"name": "Arriendo de juego inflable (día completo)", "duration_minutes": 480, "price_clp": 70000,
       "buffer_before_minutes": 60, "buffer_after_minutes": 60,
       "requirements": [{"resource_type": "equipment"}]}
    ],
    "addons": [
      {"name": "Máquina de humo", "price_clp": 15000},
      {"name": "Máquina de algodón de azúcar", "price_clp": 20000}
    ]
  }$json$::jsonb
),
(
  'other', 'Otro rubro', 'appointment', 99,
  $json${"branch_hours": [], "services": [], "addons": []}$json$::jsonb
);

-- Feriados de Chile 2026–2027.
-- IMPORTANTE: verificar contra la fuente oficial (feriados.cl / Diario Oficial) y
-- agregar los años siguientes con una nueva migración.
insert into public.holidays (date, name) values
  ('2026-01-01', 'Año Nuevo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-04-04', 'Sábado Santo'),
  ('2026-05-01', 'Día Nacional del Trabajo'),
  ('2026-05-21', 'Día de las Glorias Navales'),
  ('2026-06-21', 'Día Nacional de los Pueblos Indígenas'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-16', 'Día de la Virgen del Carmen'),
  ('2026-08-15', 'Asunción de la Virgen'),
  ('2026-09-18', 'Independencia Nacional'),
  ('2026-09-19', 'Día de las Glorias del Ejército'),
  ('2026-10-12', 'Encuentro de Dos Mundos'),
  ('2026-10-31', 'Día de las Iglesias Evangélicas y Protestantes'),
  ('2026-11-01', 'Día de Todos los Santos'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'),
  ('2027-03-26', 'Viernes Santo'),
  ('2027-03-27', 'Sábado Santo'),
  ('2027-05-01', 'Día Nacional del Trabajo'),
  ('2027-05-21', 'Día de las Glorias Navales'),
  ('2027-06-21', 'Día Nacional de los Pueblos Indígenas'),
  ('2027-06-28', 'San Pedro y San Pablo'),
  ('2027-07-16', 'Día de la Virgen del Carmen'),
  ('2027-08-15', 'Asunción de la Virgen'),
  ('2027-09-18', 'Independencia Nacional'),
  ('2027-09-19', 'Día de las Glorias del Ejército'),
  ('2027-10-11', 'Encuentro de Dos Mundos'),
  ('2027-10-31', 'Día de las Iglesias Evangélicas y Protestantes'),
  ('2027-11-01', 'Día de Todos los Santos'),
  ('2027-12-08', 'Inmaculada Concepción'),
  ('2027-12-25', 'Navidad');
