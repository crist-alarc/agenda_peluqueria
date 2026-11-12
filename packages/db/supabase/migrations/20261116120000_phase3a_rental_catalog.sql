-- =============================================================================
-- Fase 3 · 3A: catálogo de arriendo (ADR 0007)
--
-- 1. Servicios de día completo y ficha del servicio (datos definidos por la plantilla del rubro).
-- 2. Fotos del catálogo (tabla service_photos + bucket público "catalogo" de Supabase Storage).
-- 3. Zonas de despacho libres por sucursal y modo de cobro del despacho
--    (reemplazan a branches.coverage_communes, que nunca se usó).
-- 4. Tope de eventos por día de cada recurso de logística (la app avisa, no bloquea).
-- 5. Precios visibles u ocultos en el link público.
-- 6. Reservas de arriendo: servicios en paralelo (mismo evento) y día completo.
-- 7. Plantilla "Juegos inflables" con los datos de la entrevista.
-- =============================================================================

-- 1. Servicios: día completo y ficha ---------------------------------------------
alter table public.services
  add column full_day boolean not null default false,
  add column details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object');

comment on column public.services.full_day is
  'Arriendo por día completo (modo rental): ocupa el recurso todo el día local del evento.';
comment on column public.services.details is
  'Ficha del servicio (capacidad, dimensiones, etc.). Los campos los define industry_templates.config.service_fields.';

-- 2. Fotos del catálogo ---------------------------------------------------------
create table public.service_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  -- Ruta dentro del bucket "catalogo": <business_id>/<service_id>/<archivo>
  path text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (path)
);
create index service_photos_service_idx on public.service_photos (service_id, position);

create or replace function app.service_photo_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.services s where s.id = new.service_id and s.business_id = new.business_id) then
    raise exception 'El servicio no es de este negocio' using errcode = 'P0001';
  end if;
  if split_part(new.path, '/', 1) <> new.business_id::text or split_part(new.path, '/', 2) <> new.service_id::text then
    raise exception 'La ruta de la foto no corresponde al servicio' using errcode = 'P0001';
  end if;
  if (select count(*) from public.service_photos p where p.service_id = new.service_id) >= 6 then
    raise exception 'Cada servicio puede tener hasta 6 fotos' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger service_photos_guard before insert on public.service_photos
  for each row execute function app.service_photo_guard();

alter table public.service_photos enable row level security;
create policy service_photos_read on public.service_photos for select to authenticated
  using (app.is_business_member(business_id));
create policy service_photos_insert on public.service_photos for insert to authenticated
  with check (app.can_manage_business(business_id));
create policy service_photos_update on public.service_photos for update to authenticated
  using (app.can_manage_business(business_id)) with check (app.can_manage_business(business_id));
create policy service_photos_delete on public.service_photos for delete to authenticated
  using (app.can_manage_business(business_id));

-- Bucket público de imágenes del catálogo (solo existe en Supabase; las pruebas locales no tienen Storage).
-- Las fotos las sube el servidor con la clave de servicio, después de validar el permiso.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('catalogo', 'catalogo', true, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- 3. Zonas de despacho ----------------------------------------------------------
alter table public.branches drop column coverage_communes;
alter table public.branches
  add column delivery_mode text not null default 'included' check (delivery_mode in ('included', 'fixed', 'by_zone')),
  add column delivery_fee int not null default 0 check (delivery_fee >= 0);

comment on column public.branches.delivery_mode is
  'Cobro del despacho: included (incluido), fixed (delivery_fee) o by_zone (delivery_zones.fee).';

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  fee int not null default 0 check (fee >= 0),
  active boolean not null default true,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create unique index delivery_zones_name_idx on public.delivery_zones (branch_id, lower(trim(name)));
create index delivery_zones_branch_idx on public.delivery_zones (branch_id, position);

alter table public.delivery_zones enable row level security;
create policy delivery_zones_read on public.delivery_zones for select to authenticated
  using (app.is_business_member(business_id));
create policy delivery_zones_write on public.delivery_zones for all to authenticated
  using (app.can_manage_branch(branch_id))
  with check (
    app.can_manage_branch(branch_id)
    and exists (select 1 from public.branches b where b.id = branch_id and b.business_id = delivery_zones.business_id)
  );

-- 4. Tope de eventos por día de los recursos de logística -------------------------
alter table public.resources
  add column max_events_per_day int check (max_events_per_day between 1 and 100);
comment on column public.resources.max_events_per_day is
  'Recursos de logística (camiones): eventos que alcanza a atender en un día. Al superarlo la app avisa (ADR 0006).';

-- 5. Precios en el link público ---------------------------------------------------
alter table public.businesses add column show_public_prices boolean not null default true;

-- Auditoría de las tablas nuevas
create trigger service_photos_audit after insert or update or delete on public.service_photos
  for each row execute function app.audit_row();
create trigger delivery_zones_audit after insert or update or delete on public.delivery_zones
  for each row execute function app.audit_row();

-- 6. Plantilla "Juegos inflables" (datos de la entrevista, docs/proceso-inflables.md)
update public.industry_templates
set config = jsonb_set(jsonb_set(jsonb_set(config,
  '{services}', $json$[
    {"name": "Castillo inflable", "description": "Arriendo por el día. Se entrega en la tarde y se retira en la noche.",
     "duration_minutes": 1440, "price": 45000, "full_day": true,
     "requirements": [{"resource_type": "equipment", "required_skill": "castillo"}],
     "details": {"capacity_kids": 10, "dimensions": "4 x 4 x 3 m", "setup_minutes": 30, "teardown_minutes": 20, "needs_power": true}},
    {"name": "Toro mecánico (3 horas)", "description": "Con operador. Bloques de 3 horas.",
     "duration_minutes": 180, "price": 120000, "buffer_before_minutes": 60, "buffer_after_minutes": 60,
     "requirements": [{"resource_type": "equipment", "required_skill": "toro"}, {"resource_type": "person", "required_skill": "operador"}],
     "details": {"capacity_kids": 1, "setup_minutes": 30, "teardown_minutes": 30, "needs_power": true}}
  ]$json$::jsonb),
  '{addons}', '[]'::jsonb),
  '{service_fields}', $json$[
    {"key": "capacity_kids", "label": "Capacidad", "type": "number", "unit": "niños"},
    {"key": "dimensions", "label": "Dimensiones", "type": "text"},
    {"key": "setup_minutes", "label": "Armado estimado", "type": "number", "unit": "min"},
    {"key": "teardown_minutes", "label": "Desarme estimado", "type": "number", "unit": "min"},
    {"key": "needs_power", "label": "Necesita electricidad", "type": "boolean"},
    {"key": "age_range", "label": "Edades recomendadas", "type": "text"}
  ]$json$::jsonb)
where code = 'inflatables';

-- 7. Funciones -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_create_booking(p_business_id uuid, p_branch_id uuid, p_customer jsonb, p_items jsonb, p_addons jsonb DEFAULT '[]'::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Arriendo (fase 3A): servicios en paralelo y día completo
  v_rental boolean;
  v_end_max timestamptz;
  v_alloc_from timestamptz;
  v_alloc_to timestamptz;
  v_local_day timestamp;
begin
  select * into v_business from public.businesses where id = p_business_id;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  v_rental := v_business.booking_mode = 'rental';
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
                               created_by_user_id, visible_brand_business_id, starts_at, ends_at, total, notes)
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
    if v_rental then
      -- Arriendo: todos los servicios son parte del mismo evento y empiezan a la misma hora
      if v_start <> v_first_start then
        raise exception 'En un arriendo todos los servicios empiezan a la hora del evento' using errcode = 'P0001';
      end if;
    elsif v_prev_end is not null and v_start <> v_prev_end then
      raise exception 'Los servicios deben ser consecutivos' using errcode = 'P0001';
    end if;
    if v_rental and v_service.full_day then
      -- Día completo: el recurso queda ocupado todo el día local del evento
      v_local_day := date_trunc('day', v_start at time zone v_business.timezone);
      v_alloc_from := v_local_day at time zone v_business.timezone;
      v_alloc_to := (v_local_day + interval '1 day') at time zone v_business.timezone;
      v_end := v_alloc_to;
    else
      v_end := v_start + make_interval(mins => v_service.duration_minutes);
      v_alloc_from := v_start - make_interval(mins => v_service.buffer_before_minutes);
      v_alloc_to := v_end + make_interval(mins => v_service.buffer_after_minutes);
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
                                      duration_minutes, price, owner_business_id, modality)
    values (v_booking_id, p_business_id, v_position, v_service.id, v_service.name, v_start, v_end,
            v_service.duration_minutes, v_service.price, p_business_id, 'own')
    returning id into v_item_id;

    foreach v_resource_id in array v_resource_ids loop
      select * into v_resource from public.resources
      where id = v_resource_id and branch_id = p_branch_id and business_id = p_business_id and active;
      if not found then
        raise exception 'Recurso no disponible en esta sucursal' using errcode = 'P0001';
      end if;
      insert into public.allocations (booking_id, booking_item_id, business_id, resource_id, professional_id, starts_at, ends_at)
      values (v_booking_id, v_item_id, p_business_id, v_resource.id, v_resource.professional_id,
              v_alloc_from, v_alloc_to);
    end loop;

    v_total := v_total + v_service.price;
    v_prev_end := v_end;
    v_end_max := greatest(v_end_max, v_end);
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
      and tstzrange(starts_at, ends_at) && tstzrange(v_first_start, v_end_max);
    if coalesce(v_stock, 0) < v_used + v_qty then
      raise exception 'No queda stock de % para ese horario', v_addon_row.name using errcode = 'P0001';
    end if;
    insert into public.booking_addons (booking_id, business_id, branch_id, addon_id, addon_name, quantity, unit_price, starts_at, ends_at)
    values (v_booking_id, p_business_id, p_branch_id, v_addon_row.id, v_addon_row.name, v_qty, v_addon_row.price,
            v_first_start, v_end_max);
    v_total := v_total + v_addon_row.price * v_qty;
  end loop;

  update public.bookings set ends_at = v_end_max, total = v_total where id = v_booking_id;
  return v_booking_id;
exception
  when exclusion_violation then
    raise exception 'Ese horario ya no está disponible. Elige otro.' using errcode = 'P0001';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_create_business(p_business_name text, p_industry_code text, p_branch_name text, p_branch_address text DEFAULT NULL::text, p_branch_commune text DEFAULT NULL::text, p_timezone text DEFAULT 'America/Santiago'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    insert into public.services (business_id, name, description, booking_mode, duration_minutes, price,
                                 buffer_before_minutes, buffer_after_minutes, full_day, details)
    values (
      v_business,
      v_service ->> 'name',
      v_service ->> 'description',
      v_template.booking_mode,
      (v_service ->> 'duration_minutes')::int,
      coalesce((v_service ->> 'price')::int, 0),
      coalesce((v_service ->> 'buffer_before_minutes')::int, 0),
      coalesce((v_service ->> 'buffer_after_minutes')::int, 0),
      coalesce((v_service ->> 'full_day')::boolean, false),
      coalesce(v_service -> 'details', '{}'::jsonb)
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
    insert into public.addons (business_id, name, price)
    values (v_business, v_addon ->> 'name', coalesce((v_addon ->> 'price')::int, 0));
  end loop;

  return v_business;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_booking_context(p_business_id uuid, p_branch_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      'id', v_business.id, 'name', v_business.name, 'timezone', v_business.timezone, 'currency', v_business.currency,
      'booking_mode', v_business.booking_mode,
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
        'id', s.id, 'name', s.name, 'description', s.description, 'price', s.price,
        'durationMinutes', s.duration_minutes,
        'bufferBeforeMinutes', s.buffer_before_minutes, 'bufferAfterMinutes', s.buffer_after_minutes,
        'fullDay', s.full_day,
        'requirements', coalesce((
          select jsonb_agg(jsonb_build_object('resourceType', q.resource_type, 'quantity', q.quantity, 'requiredSkill', q.required_skill))
          from public.service_resource_requirements q where q.service_id = s.id), '[]'::jsonb)
      ) order by s.name)
      from public.services s where s.business_id = p_business_id and s.active), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ad.id, 'name', ad.name, 'price', ad.price,
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
$function$
;

CREATE OR REPLACE FUNCTION app.booking_email_data(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'id', b.id, 'businessId', b.business_id, 'status', b.status,
    'startsAt', b.starts_at, 'endsAt', b.ends_at, 'createdAt', b.created_at, 'total', b.total,
    'holdExpiresAt', b.hold_expires_at, 'reminderSentAt', b.reminder_sent_at,
    'attendanceConfirmedAt', b.attendance_confirmed_at,
    'customerName', c.full_name, 'customerEmail', c.email,
    'brand', brand.name, 'businessSlug', brand.slug, 'timezone', brand.timezone, 'currency', brand.currency, 'showPrices', brand.show_public_prices,
    'branchName', br.name, 'branchAddress', concat_ws(', ', br.address, br.commune),
    'settings', jsonb_build_object(
      'reminderEnabled', owner_b.reminder_enabled,
      'reminderHoursBefore', owner_b.reminder_hours_before,
      'confirmationCutoffHours', owner_b.confirmation_cutoff_hours,
      'pendingHoldMinutes', owner_b.pending_hold_minutes,
      'cancellationHours', owner_b.cancellation_hours
    ),
    'services', (select jsonb_agg(i.service_name order by i.position) from public.booking_items i where i.booking_id = b.id)
  )
  from public.bookings b
  join public.businesses owner_b on owner_b.id = b.business_id
  join public.businesses brand on brand.id = b.visible_brand_business_id
  join public.branches br on br.id = b.branch_id
  left join public.customers c on c.id = b.customer_id
  where b.id = p_booking_id;
$function$
;

CREATE OR REPLACE FUNCTION public.app_public_business(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Con show_public_prices = false los montos no salen de la base (no solo se ocultan en pantalla).
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'slug', b.slug, 'timezone', b.timezone, 'currency', b.currency, 'phone', b.phone,
    'bookingMode', b.booking_mode, 'maxAdvanceDays', b.max_advance_days, 'cancellationHours', b.cancellation_hours,
    'showPrices', b.show_public_prices,
    'serviceFields', coalesce(t.config -> 'service_fields', '[]'::jsonb),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', br.id, 'name', br.name, 'address', br.address, 'commune', br.commune,
        'deliveryMode', br.delivery_mode,
        'deliveryFee', case when b.show_public_prices then br.delivery_fee end,
        'zones', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', z.id, 'name', z.name, 'fee', case when b.show_public_prices then z.fee end) order by z.position, z.name)
          from public.delivery_zones z where z.branch_id = br.id and z.active), '[]'::jsonb)
      ) order by br.created_at)
      from public.branches br where br.business_id = b.id and br.active), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'durationMinutes', s.duration_minutes,
        'price', case when b.show_public_prices then s.price end,
        'fullDay', s.full_day, 'details', s.details,
        'photos', coalesce((
          select jsonb_agg(p.path order by p.position, p.created_at)
          from public.service_photos p where p.service_id = s.id), '[]'::jsonb),
        'needsPerson', exists (select 1 from public.service_resource_requirements q
                               where q.service_id = s.id and q.resource_type = 'person')) order by s.name)
      from public.services s where s.business_id = b.id and s.active), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'branchId', r.branch_id) order by r.name)
      from public.resources r where r.business_id = b.id and r.active and r.type = 'person'), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object('id', ad.id, 'name', ad.name, 'description', ad.description,
                                          'price', case when b.show_public_prices then ad.price end) order by ad.name)
      from public.addons ad where ad.business_id = b.id and ad.active), '[]'::jsonb)
  )
  from public.businesses b
  join public.industry_templates t on t.code = b.industry_code
  where b.slug = p_slug and b.public_booking_enabled;
$function$
;
