-- =============================================================================
-- Fase 2A · Reservas (docs/DIRECTRICES.md, secciones 9, 10, 12 y 21)
--
-- Clientes por negocio, reservas con varias líneas, adicionales y ocupaciones
-- (allocations). La doble reserva la impiden restricciones de exclusión por
-- recurso y por profesional (principio 5). Todas las tablas con RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Configuración de reservas por negocio
-- -----------------------------------------------------------------------------
alter table public.businesses
  add column slot_interval_minutes int not null default 15 check (slot_interval_minutes between 5 and 120),
  add column min_advance_minutes int not null default 60 check (min_advance_minutes between 0 and 10080),
  add column max_advance_days int not null default 60 check (max_advance_days between 1 and 365),
  add column cancellation_hours int not null default 4 check (cancellation_hours between 0 and 168),
  add column public_booking_enabled boolean not null default true;

-- -----------------------------------------------------------------------------
-- 2. Tipos
-- -----------------------------------------------------------------------------
create type public.booking_status as enum
  ('pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show');
create type public.booking_channel as enum ('public_link', 'reception', 'seller', 'partner', 'reseller');
create type public.booking_modality as enum ('own', 'full_service', 'equipment_loan');

-- Rol de la petición (anon / authenticated / service_role). Igual que
-- app.current_user_id(), es el único punto que conoce al proveedor de auth.
create or replace function app.current_request_role()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'anon'
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Clientes (ficha del cliente dentro de un negocio, sección 12)
-- -----------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  phone text,
  email text,
  -- Vinculación con una cuenta: solo tras verificar (fase 2B)
  user_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);
create unique index customers_business_phone_uidx on public.customers (business_id, phone) where phone is not null;
create index customers_business_name_idx on public.customers (business_id, full_name);

-- -----------------------------------------------------------------------------
-- 4. Reservas (sección 9)
-- -----------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  -- Negocio vendedor
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  status public.booking_status not null default 'confirmed',
  -- Campos obligatorios desde la primera versión (sección 9.2)
  channel public.booking_channel not null,
  sold_by_user_id uuid references public.profiles (id) on delete set null,
  created_by_user_id uuid references public.profiles (id) on delete set null,
  visible_brand_business_id uuid not null references public.businesses (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  total_clp int not null check (total_clp >= 0),
  notes text,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index bookings_business_starts_idx on public.bookings (business_id, starts_at);
create index bookings_branch_starts_idx on public.bookings (branch_id, starts_at);
create index bookings_customer_idx on public.bookings (customer_id);

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  position smallint not null,
  service_id uuid not null references public.services (id) on delete restrict,
  service_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes int not null check (duration_minutes > 0),
  price_clp int not null check (price_clp >= 0),
  -- Campos obligatorios por línea (sección 9.2). En la fase 2 siempre 'own'.
  owner_business_id uuid not null references public.businesses (id),
  partnership_id uuid,
  modality public.booking_modality not null default 'own',
  logistics_business_id uuid references public.businesses (id),
  check (ends_at > starts_at),
  unique (booking_id, position)
);
create index booking_items_booking_idx on public.booking_items (booking_id);

create table public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete restrict,
  addon_id uuid not null references public.addons (id) on delete restrict,
  addon_name text not null,
  quantity int not null check (quantity between 1 and 1000),
  unit_price_clp int not null check (unit_price_clp >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- false cuando la reserva se cancela: libera el stock
  active boolean not null default true,
  check (ends_at > starts_at)
);
create index booking_addons_stock_idx on public.booking_addons (addon_id, branch_id, starts_at) where active;

-- Ocupaciones: bloque de tiempo de un recurso (y su profesional) con holguras.
create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  booking_item_id uuid not null references public.booking_items (id) on delete cascade,
  -- Negocio dueño del recurso
  business_id uuid not null references public.businesses (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete restrict,
  professional_id uuid references public.professionals (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  check (ends_at > starts_at),
  -- Garantía final contra la doble reserva (principio 5, sección 9.4)
  constraint allocations_resource_no_overlap exclude using gist (
    resource_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (active),
  constraint allocations_professional_no_overlap exclude using gist (
    professional_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (active and professional_id is not null)
);
create index allocations_booking_idx on public.allocations (booking_id);
create index allocations_professional_idx on public.allocations (professional_id, starts_at) where active;

-- =============================================================================
-- 5. Permisos
-- =============================================================================

-- Recepción de una sucursal: owner/admin, o branch_admin/receptionist asignados
-- a esa sucursal (sin sucursales asignadas = todas).
create or replace function app.can_handle_branch_bookings(p_branch_id uuid)
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
        or (m.role in ('branch_admin', 'receptionist')
            and (not exists (select 1 from public.membership_branches mb where mb.membership_id = m.id)
                 or exists (select 1 from public.membership_branches mb
                            where mb.membership_id = m.id and mb.branch_id = b.id)))
      )
  );
$$;

-- ¿Puede ver esta reserva? Recepción de la sucursal, quien la vendió, o el
-- profesional que la atiende (staff: "solo su propia agenda", sección 5.2).
create or replace function app.can_view_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and (
        app.can_handle_branch_bookings(b.branch_id)
        or b.sold_by_user_id = app.current_user_id()
        or exists (
          select 1 from public.allocations a
          join public.professionals p on p.id = a.professional_id
          where a.booking_id = b.id and p.user_id = app.current_user_id()
        )
      )
  );
$$;

alter table public.customers      enable row level security;
alter table public.bookings       enable row level security;
alter table public.booking_items  enable row level security;
alter table public.booking_addons enable row level security;
alter table public.allocations    enable row level security;

-- Clientes: los ve y gestiona recepción del negocio; el resto, solo los de reservas que puede ver
create policy customers_read on public.customers for select to authenticated
  using (
    app.has_business_role(business_id, array['owner', 'admin', 'branch_admin', 'receptionist']::public.membership_role[])
    or exists (select 1 from public.bookings b where b.customer_id = customers.id and app.can_view_booking(b.id))
  );
create policy customers_insert on public.customers for insert to authenticated
  with check (app.has_business_role(business_id, array['owner', 'admin', 'branch_admin', 'receptionist']::public.membership_role[]));
create policy customers_update on public.customers for update to authenticated
  using (app.has_business_role(business_id, array['owner', 'admin', 'branch_admin', 'receptionist']::public.membership_role[]))
  with check (app.has_business_role(business_id, array['owner', 'admin', 'branch_admin', 'receptionist']::public.membership_role[]));

-- Reservas: se crean solo con app_create_booking(); recepción cambia estado y notas
create policy bookings_read on public.bookings for select to authenticated
  using (app.can_view_booking(id));
create policy bookings_update on public.bookings for update to authenticated
  using (app.can_handle_branch_bookings(branch_id))
  with check (app.can_handle_branch_bookings(branch_id));

create policy booking_items_read on public.booking_items for select to authenticated
  using (app.can_view_booking(booking_id));
create policy booking_addons_read on public.booking_addons for select to authenticated
  using (app.can_view_booking(booking_id));
create policy allocations_read on public.allocations for select to authenticated
  using (app.can_view_booking(booking_id));

-- Desde la app solo se pueden cambiar estas columnas de una reserva
revoke insert, update, delete on public.bookings from anon, authenticated;
grant update (status, notes, cancel_reason) on public.bookings to authenticated;
revoke insert, update, delete on public.booking_items, public.booking_addons, public.allocations from anon, authenticated;
revoke delete on public.customers from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5.1 Corrección de la Fase 1: un recurso solo puede vincular un profesional
-- registrado por su mismo negocio (o la propia persona). Antes, conociendo el
-- identificador, se podía vincular el profesional de otro negocio.
-- La colaboración entre negocios llega en la fase 4, con acuerdo explícito.
-- -----------------------------------------------------------------------------
create or replace function app.can_link_professional(p_professional_id uuid, p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_professional_id is null or exists (
    select 1 from public.professionals p
    where p.id = p_professional_id
      and (p.created_by_business_id = p_business_id or p.user_id = app.current_user_id())
  );
$$;

drop policy resources_insert on public.resources;
drop policy resources_update on public.resources;
create policy resources_insert on public.resources for insert to authenticated
  with check (
    app.can_manage_branch(branch_id)
    and exists (select 1 from public.branches b where b.id = branch_id and b.business_id = resources.business_id)
    and app.can_link_professional(professional_id, business_id)
  );
create policy resources_update on public.resources for update to authenticated
  using (app.can_manage_branch(branch_id))
  with check (
    app.can_manage_branch(branch_id)
    and exists (select 1 from public.branches b where b.id = branch_id and b.business_id = resources.business_id)
    and app.can_link_professional(professional_id, business_id)
  );

-- Vincular un profesional a una cuenta: solo a alguien del equipo del negocio
-- (para que vea su propia agenda). La persona puede desvincularse sola.
drop policy professionals_update on public.professionals;
create policy professionals_update on public.professionals for update to authenticated
  using (user_id = app.current_user_id() or app.can_manage_business(created_by_business_id))
  with check (
    (user_id is null and (app.can_manage_business(created_by_business_id)))
    or user_id = app.current_user_id()
    or (app.can_manage_business(created_by_business_id)
        and exists (select 1 from public.memberships m
                    where m.business_id = created_by_business_id and m.user_id = professionals.user_id))
  );

-- =============================================================================
-- 6. Triggers
-- =============================================================================

-- Transiciones de estado válidas (mismas reglas que @agenda/core) y efectos:
-- al cancelar o marcar no asistió se liberan los recursos y el stock.
create or replace function app.booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed public.booking_status[];
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    v_allowed := case old.status
      when 'pending' then array['confirmed', 'cancelled']::public.booking_status[]
      when 'confirmed' then array['checked_in', 'in_progress', 'completed', 'cancelled', 'no_show']::public.booking_status[]
      when 'checked_in' then array['in_progress', 'completed', 'cancelled', 'no_show']::public.booking_status[]
      when 'in_progress' then array['completed']::public.booking_status[]
      else array[]::public.booking_status[]
    end;
    if not (new.status = any (v_allowed)) then
      raise exception 'No se puede pasar una reserva de % a %', old.status, new.status using errcode = 'P0001';
    end if;
    if new.status in ('cancelled', 'no_show') then
      update public.allocations set active = false where booking_id = new.id;
      update public.booking_addons set active = false where booking_id = new.id;
      if new.status = 'cancelled' then
        new.cancelled_at := now();
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_status_change before update on public.bookings
  for each row execute function app.booking_status_change();

create trigger customers_touch before update on public.customers
  for each row execute function app.touch_updated_at();

create trigger bookings_audit after insert or update or delete on public.bookings
  for each row execute function app.audit_row();
create trigger customers_audit after insert or update or delete on public.customers
  for each row execute function app.audit_row();

-- =============================================================================
-- 7. Datos para el motor de disponibilidad
--    Devuelve todo lo que necesita @agenda/core para calcular horarios.
--    Las ocupaciones de profesionales en OTROS negocios llegan solo como
--    horario ocupado, sin recurso ni detalle (sección 10.3, principio 7).
-- =============================================================================
create or replace function public.app_booking_context(
  p_business_id uuid,
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_business public.businesses;
begin
  select * into v_business from public.businesses where id = p_business_id;
  if not found
     or not (v_business.public_booking_enabled or app.is_business_member(p_business_id)
             or app.current_request_role() = 'service_role') then
    raise exception 'Negocio no disponible para reservas' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and business_id = p_business_id and active) then
    raise exception 'Sucursal no disponible' using errcode = 'P0001';
  end if;
  if p_to <= p_from or p_to - p_from > interval '8 days' then
    raise exception 'Rango de fechas no válido' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'business', jsonb_build_object(
      'id', v_business.id, 'name', v_business.name, 'timezone', v_business.timezone,
      'slot_interval_minutes', v_business.slot_interval_minutes,
      'min_advance_minutes', v_business.min_advance_minutes,
      'max_advance_days', v_business.max_advance_days,
      'cancellation_hours', v_business.cancellation_hours
    ),
    'branch_hours', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'start', h.opens_at, 'end', h.closes_at))
      from public.branch_hours h where h.branch_id = p_branch_id), '[]'::jsonb),
    'branch_blocks', coalesce((
      select jsonb_agg(jsonb_build_object('startsAt', bl.starts_at, 'endsAt', bl.ends_at))
      from public.blocks bl
      where bl.branch_id = p_branch_id and bl.ends_at > p_from and bl.starts_at < p_to), '[]'::jsonb),
    'holidays', coalesce((
      select jsonb_agg(hd.date)
      from public.holidays hd
      where hd.date between (p_from at time zone v_business.timezone)::date - 1
                        and (p_to at time zone v_business.timezone)::date + 1), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'type', r.type, 'name', r.name, 'skills', r.skills, 'professionalId', r.professional_id,
        'hours', coalesce((
          select jsonb_agg(jsonb_build_object('weekday', rh.weekday, 'start', rh.starts_at, 'end', rh.ends_at))
          from public.resource_hours rh where rh.resource_id = r.id), '[]'::jsonb)
      ) order by r.name)
      from public.resources r where r.branch_id = p_branch_id and r.active), '[]'::jsonb),
    'resource_blocks', coalesce((
      select jsonb_agg(jsonb_build_object('resourceId', bl.resource_id, 'startsAt', bl.starts_at, 'endsAt', bl.ends_at))
      from public.blocks bl
      join public.resources r on r.id = bl.resource_id
      where r.branch_id = p_branch_id and bl.ends_at > p_from and bl.starts_at < p_to), '[]'::jsonb),
    'busy', coalesce((
      select jsonb_agg(jsonb_build_object(
        -- De otros negocios no se revela el recurso: solo que el profesional está ocupado
        'resourceId', case when a.business_id = p_business_id then a.resource_id end,
        'professionalId', a.professional_id,
        'startsAt', a.starts_at, 'endsAt', a.ends_at))
      from public.allocations a
      where a.active and a.ends_at > p_from and a.starts_at < p_to
        and (a.resource_id in (select r.id from public.resources r where r.branch_id = p_branch_id)
             or a.professional_id in (select r.professional_id from public.resources r
                                      where r.branch_id = p_branch_id and r.professional_id is not null))), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description, 'priceClp', s.price_clp,
        'durationMinutes', s.duration_minutes,
        'bufferBeforeMinutes', s.buffer_before_minutes, 'bufferAfterMinutes', s.buffer_after_minutes,
        'requirements', coalesce((
          select jsonb_agg(jsonb_build_object('resourceType', q.resource_type, 'quantity', q.quantity, 'requiredSkill', q.required_skill))
          from public.service_resource_requirements q where q.service_id = s.id), '[]'::jsonb)
      ) order by s.name)
      from public.services s where s.business_id = p_business_id and s.active), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ad.id, 'name', ad.name, 'priceClp', ad.price_clp,
        'stock', coalesce(st.quantity, 0),
        'usage', coalesce((
          select jsonb_agg(jsonb_build_object('startsAt', ba.starts_at, 'endsAt', ba.ends_at, 'quantity', ba.quantity))
          from public.booking_addons ba
          where ba.addon_id = ad.id and ba.branch_id = p_branch_id and ba.active
            and ba.ends_at > p_from and ba.starts_at < p_to), '[]'::jsonb)
      ) order by ad.name)
      from public.addons ad
      left join public.addon_stock st on st.addon_id = ad.id and st.branch_id = p_branch_id
      where ad.business_id = p_business_id and ad.active), '[]'::jsonb)
  );
end;
$$;

-- Datos públicos de un negocio para su link de reservas (sin información interna).
create or replace function public.app_public_business(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'slug', b.slug, 'timezone', b.timezone, 'phone', b.phone,
    'bookingMode', b.booking_mode, 'maxAdvanceDays', b.max_advance_days, 'cancellationHours', b.cancellation_hours,
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', br.id, 'name', br.name, 'address', br.address, 'commune', br.commune) order by br.created_at)
      from public.branches br where br.business_id = b.id and br.active), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'durationMinutes', s.duration_minutes, 'priceClp', s.price_clp,
        'needsPerson', exists (select 1 from public.service_resource_requirements q
                               where q.service_id = s.id and q.resource_type = 'person')) order by s.name)
      from public.services s where s.business_id = b.id and s.active), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'branchId', r.branch_id) order by r.name)
      from public.resources r where r.business_id = b.id and r.active and r.type = 'person'), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object('id', ad.id, 'name', ad.name, 'description', ad.description, 'priceClp', ad.price_clp) order by ad.name)
      from public.addons ad where ad.business_id = b.id and ad.active), '[]'::jsonb)
  )
  from public.businesses b
  where b.slug = p_slug and b.public_booking_enabled;
$$;

-- =============================================================================
-- 8. Crear una reserva (atómica: se guarda completa o no se guarda, sección 9.4)
--
-- El servidor calcula el horario y los recursos con el motor de @agenda/core;
-- esta función vuelve a validar lo esencial y la base garantiza que no haya
-- doble reserva. La pueden llamar:
--  - recepción (rol con acceso a la sucursal): canal 'reception';
--  - el servidor de la app con la clave de servicio, para el link público:
--    canal 'public_link'. Nunca el navegador directamente.
-- =============================================================================
create or replace function public.app_create_booking(
  p_business_id uuid,
  p_branch_id uuid,
  p_customer jsonb,
  p_items jsonb,
  p_addons jsonb default '[]'::jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := app.current_user_id();
  v_is_server boolean := app.current_request_role() = 'service_role';
  v_business public.businesses;
  v_channel public.booking_channel;
  v_customer_id uuid;
  v_booking_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_service public.services;
  v_position int := 0;
  v_start timestamptz;
  v_end timestamptz;
  v_prev_end timestamptz;
  v_first_start timestamptz;
  v_resource_ids uuid[];
  v_resource_id uuid;
  v_resource public.resources;
  v_req record;
  v_total int := 0;
  v_addon jsonb;
  v_addon_row public.addons;
  v_qty int;
  v_stock int;
  v_used int;
begin
  select * into v_business from public.businesses where id = p_business_id;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and business_id = p_business_id and active) then
    raise exception 'Sucursal no disponible' using errcode = 'P0001';
  end if;

  if app.can_handle_branch_bookings(p_branch_id) then
    v_channel := 'reception';
  elsif v_is_server and v_business.public_booking_enabled then
    v_channel := 'public_link';
  else
    raise exception 'No tienes permiso para crear reservas en esta sucursal' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 10 then
    raise exception 'La reserva debe tener entre 1 y 10 servicios' using errcode = 'P0001';
  end if;

  -- Cliente: uno existente del negocio, o se crea/actualiza por teléfono
  if p_customer ? 'id' then
    select id into v_customer_id from public.customers
    where id = (p_customer ->> 'id')::uuid and business_id = p_business_id;
    if v_customer_id is null then
      raise exception 'Cliente no encontrado' using errcode = 'P0001';
    end if;
  else
    if coalesce(trim(p_customer ->> 'full_name'), '') = '' or coalesce(trim(p_customer ->> 'phone'), '') = '' then
      raise exception 'El nombre y el teléfono del cliente son obligatorios' using errcode = 'P0001';
    end if;
    insert into public.customers (business_id, full_name, phone, email)
    values (p_business_id, trim(p_customer ->> 'full_name'), trim(p_customer ->> 'phone'),
            nullif(lower(trim(p_customer ->> 'email')), ''))
    on conflict (business_id, phone) where phone is not null
    do update set email = coalesce(public.customers.email, excluded.email)
    returning id into v_customer_id;
  end if;

  v_first_start := (p_items -> 0 ->> 'starts_at')::timestamptz;
  if v_first_start <= now() then
    raise exception 'El horario elegido ya pasó' using errcode = 'P0001';
  end if;

  insert into public.bookings (business_id, branch_id, customer_id, status, channel, sold_by_user_id,
                               created_by_user_id, visible_brand_business_id, starts_at, ends_at, total_clp, notes)
  values (p_business_id, p_branch_id, v_customer_id, 'confirmed', v_channel,
          case when v_channel = 'reception' then v_user end,
          case when v_channel = 'reception' then v_user end,
          p_business_id, v_first_start, v_first_start + interval '1 minute', 0, nullif(trim(p_notes), ''))
  returning id into v_booking_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_service from public.services
    where id = (v_item ->> 'service_id')::uuid and business_id = p_business_id and active;
    if not found then
      raise exception 'Servicio no disponible' using errcode = 'P0001';
    end if;

    v_start := (v_item ->> 'starts_at')::timestamptz;
    v_end := v_start + make_interval(mins => v_service.duration_minutes);
    if v_prev_end is not null and v_start <> v_prev_end then
      raise exception 'Los servicios deben ser consecutivos' using errcode = 'P0001';
    end if;

    v_resource_ids := array(select (jsonb_array_elements_text(coalesce(v_item -> 'resource_ids', '[]'::jsonb)))::uuid);

    -- Cada requisito del servicio debe quedar cubierto por los recursos asignados
    for v_req in select * from public.service_resource_requirements where service_id = v_service.id loop
      if (select count(*) from public.resources r
          where r.id = any (v_resource_ids) and r.type = v_req.resource_type
            and (v_req.required_skill is null or v_req.required_skill = any (r.skills))) < v_req.quantity then
        raise exception 'Faltan recursos para el servicio %', v_service.name using errcode = 'P0001';
      end if;
    end loop;

    insert into public.booking_items (booking_id, business_id, position, service_id, service_name, starts_at, ends_at,
                                      duration_minutes, price_clp, owner_business_id, modality)
    values (v_booking_id, p_business_id, v_position, v_service.id, v_service.name, v_start, v_end,
            v_service.duration_minutes, v_service.price_clp, p_business_id, 'own')
    returning id into v_item_id;

    foreach v_resource_id in array v_resource_ids loop
      select * into v_resource from public.resources
      where id = v_resource_id and branch_id = p_branch_id and business_id = p_business_id and active;
      if not found then
        raise exception 'Recurso no disponible en esta sucursal' using errcode = 'P0001';
      end if;
      insert into public.allocations (booking_id, booking_item_id, business_id, resource_id, professional_id, starts_at, ends_at)
      values (v_booking_id, v_item_id, p_business_id, v_resource.id, v_resource.professional_id,
              v_start - make_interval(mins => v_service.buffer_before_minutes),
              v_end + make_interval(mins => v_service.buffer_after_minutes));
    end loop;

    v_total := v_total + v_service.price_clp;
    v_prev_end := v_end;
    v_position := v_position + 1;
  end loop;

  -- Adicionales con control de stock (se bloquea la fila de stock para evitar carreras)
  for v_addon in select * from jsonb_array_elements(coalesce(p_addons, '[]'::jsonb)) loop
    v_qty := coalesce((v_addon ->> 'quantity')::int, 1);
    select * into v_addon_row from public.addons
    where id = (v_addon ->> 'addon_id')::uuid and business_id = p_business_id and active;
    if not found then
      raise exception 'Adicional no disponible' using errcode = 'P0001';
    end if;
    select quantity into v_stock from public.addon_stock
    where addon_id = v_addon_row.id and branch_id = p_branch_id for update;
    select coalesce(sum(quantity), 0) into v_used from public.booking_addons
    where addon_id = v_addon_row.id and branch_id = p_branch_id and active
      and tstzrange(starts_at, ends_at) && tstzrange(v_first_start, v_prev_end);
    if coalesce(v_stock, 0) < v_used + v_qty then
      raise exception 'No queda stock de % para ese horario', v_addon_row.name using errcode = 'P0001';
    end if;
    insert into public.booking_addons (booking_id, business_id, branch_id, addon_id, addon_name, quantity, unit_price_clp, starts_at, ends_at)
    values (v_booking_id, p_business_id, p_branch_id, v_addon_row.id, v_addon_row.name, v_qty, v_addon_row.price_clp,
            v_first_start, v_prev_end);
    v_total := v_total + v_addon_row.price_clp * v_qty;
  end loop;

  update public.bookings set ends_at = v_prev_end, total_clp = v_total where id = v_booking_id;
  return v_booking_id;
exception
  when exclusion_violation then
    raise exception 'Ese horario ya no está disponible. Elige otro.' using errcode = 'P0001';
end;
$$;

-- =============================================================================
-- 9. Permisos de ejecución
-- =============================================================================
revoke all on function app.current_request_role() from public;
grant execute on function app.current_request_role() to anon, authenticated, service_role;
revoke all on function app.can_handle_branch_bookings(uuid) from public;
grant execute on function app.can_handle_branch_bookings(uuid) to authenticated, service_role;
revoke all on function app.can_view_booking(uuid) from public;
grant execute on function app.can_view_booking(uuid) to authenticated;
revoke all on function app.can_link_professional(uuid, uuid) from public;
grant execute on function app.can_link_professional(uuid, uuid) to authenticated;
revoke all on function app.booking_status_change() from public;

revoke all on function public.app_booking_context(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.app_booking_context(uuid, uuid, timestamptz, timestamptz) to anon, authenticated, service_role;
revoke all on function public.app_public_business(text) from public;
grant execute on function public.app_public_business(text) to anon, authenticated, service_role;
revoke all on function public.app_create_booking(uuid, uuid, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.app_create_booking(uuid, uuid, jsonb, jsonb, jsonb, text) to authenticated, service_role;

-- service_role (solo servidor) usa las funciones del esquema app dentro de las RPC
grant usage on schema app to service_role;
grant execute on function app.current_user_id() to service_role;
grant execute on function app.is_business_member(uuid) to service_role;
