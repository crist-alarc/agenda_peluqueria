-- =============================================================================
-- Fase 3 · 3·0: país y moneda por negocio (ADR 0006)
--
-- 1. businesses.country (ISO 3166-1, ej. 'CL') y businesses.currency (ISO 4217, ej. 'CLP').
--    Por ahora solo se acepta CLP; agregar una moneda = ampliar el check y el mapa de
--    @agenda/core (money.ts).
-- 2. Los montos dejan de llamarse *_clp. Siguen siendo enteros (nunca float), expresados en la
--    unidad mínima de la moneda del negocio: pesos para CLP, centavos para una moneda con
--    decimales.
-- 3. La moneda no se puede cambiar cuando el negocio ya tiene reservas (los montos guardados
--    quedarían mal interpretados).
-- 4. Se recrean las funciones que usaban los nombres antiguos, y las que entregan la zona
--    horaria del negocio ahora también entregan su moneda.
-- =============================================================================

-- 1. País y moneda -------------------------------------------------------------
alter table public.businesses
  add column country text not null default 'CL' check (country ~ '^[A-Z]{2}$'),
  add column currency text not null default 'CLP' check (currency in ('CLP'));

create or replace function app.business_currency_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from public.bookings where business_id = new.id) then
    raise exception 'No se puede cambiar la moneda de un negocio que ya tiene reservas'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger businesses_currency_guard
  before update of currency on public.businesses
  for each row execute function app.business_currency_guard();

-- 2. Montos sin sufijo de moneda ----------------------------------------------
alter table public.services rename column price_clp to price;
alter table public.services rename constraint services_price_clp_check to services_price_check;
alter table public.addons rename column price_clp to price;
alter table public.addons rename constraint addons_price_clp_check to addons_price_check;
alter table public.bookings rename column total_clp to total;
alter table public.bookings rename constraint bookings_total_clp_check to bookings_total_check;
alter table public.booking_items rename column price_clp to price;
alter table public.booking_items rename constraint booking_items_price_clp_check to booking_items_price_check;
alter table public.booking_addons rename column unit_price_clp to unit_price;
alter table public.booking_addons rename constraint booking_addons_unit_price_clp_check to booking_addons_unit_price_check;
alter table public.commission_entries rename column base_clp to base_amount;
alter table public.commission_entries rename column addon_base_clp to addon_base_amount;
alter table public.commission_entries rename column amount_clp to amount;
alter table public.settlements rename column total_clp to total;

-- Plantillas por rubro: la clave de precio de servicios y adicionales
update public.industry_templates t
set config = jsonb_set(
  jsonb_set(t.config, '{services}', coalesce((
    select jsonb_agg((s - 'price_clp') || jsonb_build_object('price', coalesce(s -> 'price_clp', '0'::jsonb)))
    from jsonb_array_elements(t.config -> 'services') s), '[]'::jsonb)),
  '{addons}', coalesce((
    select jsonb_agg((a - 'price_clp') || jsonb_build_object('price', coalesce(a -> 'price_clp', '0'::jsonb)))
    from jsonb_array_elements(t.config -> 'addons') a), '[]'::jsonb));

-- 3. Funciones que usaban los nombres antiguos ---------------------------------
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
    'brand', brand.name, 'businessSlug', brand.slug, 'timezone', brand.timezone, 'currency', brand.currency,
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

CREATE OR REPLACE FUNCTION app.booking_public_summary(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'status', b.status, 'startsAt', b.starts_at, 'endsAt', b.ends_at,
    'businessName', bz.name, 'businessSlug', bz.slug, 'timezone', bz.timezone, 'currency', bz.currency, 'total', b.total,
    'services', (select jsonb_agg(i.service_name order by i.position) from public.booking_items i where i.booking_id = b.id)
  )
  from public.bookings b join public.businesses bz on bz.id = b.visible_brand_business_id
  where b.id = p_booking_id;
$function$
;

CREATE OR REPLACE FUNCTION app.settlement_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Una liquidación cerrada no se puede borrar' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'closed' and new.status = 'paid'
     and (new.business_id, new.period_start, new.period_end, new.total)
         is not distinct from (old.business_id, old.period_start, old.period_end, old.total) then
    return new;
  end if;
  if old.status <> 'draft' then
    raise exception 'Una liquidación cerrada no se modifica: registra un ajuste' using errcode = 'P0001';
  end if;
  return new;
end;
$function$
;

drop function public.app_add_commission_adjustment(uuid, uuid, integer, text);
CREATE FUNCTION public.app_add_commission_adjustment(p_business_id uuid, p_professional_id uuid, p_amount integer, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
  if not app.can_manage_business(p_business_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not app.has_feature(p_business_id, 'commissions') then
    raise exception 'Tu plan no incluye esta función (commissions)' using errcode = 'P0001';
  end if;
  if not app.professional_in_business(p_professional_id, p_business_id) then
    raise exception 'Esa persona no trabaja en este negocio' using errcode = 'P0001';
  end if;
  insert into public.commission_entries (business_id, professional_id, kind, occurred_at, amount, note, created_by)
  values (p_business_id, p_professional_id, 'adjustment', now(), p_amount, trim(p_note), app.current_user_id())
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_booking_commission_data(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if app.current_request_role() <> 'service_role' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'bookingId', b.id, 'businessId', b.business_id, 'status', b.status, 'startsAt', b.starts_at,
      'enabled', app.has_feature(b.business_id, 'commissions'),
      'locked', app.booking_commissions_locked(b.id),
      'addonsTotal', coalesce((select sum(a.unit_price * a.quantity) from public.booking_addons a where a.booking_id = b.id), 0),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'bookingItemId', i.id, 'serviceId', i.service_id, 'serviceName', i.service_name, 'price', i.price,
          'participants', coalesce((
            select jsonb_agg(distinct jsonb_build_object('professionalId', al.professional_id, 'skills', r.skills))
            from public.allocations al join public.resources r on r.id = al.resource_id
            where al.booking_item_id = i.id and al.professional_id is not null
          ), '[]'::jsonb),
          'manualShares', coalesce((
            select jsonb_agg(jsonb_build_object('professionalId', s.professional_id, 'shareBp', s.share_bp))
            from public.booking_item_shares s where s.booking_item_id = i.id
          ), '[]'::jsonb),
          'recipe', coalesce((
            select jsonb_agg(jsonb_build_object('label', ro.label, 'shareBp', ro.share_bp, 'requiredSkill', ro.required_skill) order by ro.position)
            from public.service_commission_roles ro where ro.service_id = i.service_id
          ), '[]'::jsonb)
        ) order by i.position)
        from public.booking_items i where i.booking_id = b.id
      ), '[]'::jsonb),
      'rules', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'professionalId', r.professional_id, 'serviceId', r.service_id, 'kind', r.kind,
          'value', r.value, 'includeAddons', r.include_addons, 'active', r.active))
        from public.commission_rules r where r.business_id = b.business_id and r.active
      ), '[]'::jsonb)
    )
    from public.bookings b where b.id = p_booking_id
  );
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
              v_start - make_interval(mins => v_service.buffer_before_minutes),
              v_end + make_interval(mins => v_service.buffer_after_minutes));
    end loop;

    v_total := v_total + v_service.price;
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
    insert into public.booking_addons (booking_id, business_id, branch_id, addon_id, addon_name, quantity, unit_price, starts_at, ends_at)
    values (v_booking_id, p_business_id, p_branch_id, v_addon_row.id, v_addon_row.name, v_qty, v_addon_row.price,
            v_first_start, v_prev_end);
    v_total := v_total + v_addon_row.price * v_qty;
  end loop;

  update public.bookings set ends_at = v_prev_end, total = v_total where id = v_booking_id;
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
                                 buffer_before_minutes, buffer_after_minutes)
    values (
      v_business,
      v_service ->> 'name',
      v_service ->> 'description',
      v_template.booking_mode,
      (v_service ->> 'duration_minutes')::int,
      coalesce((v_service ->> 'price')::int, 0),
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
    insert into public.addons (business_id, name, price)
    values (v_business, v_addon ->> 'name', coalesce((v_addon ->> 'price')::int, 0));
  end loop;

  return v_business;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_create_settlement(p_business_id uuid, p_start date, p_end date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_tz text;
begin
  if not app.can_manage_business(p_business_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not app.has_feature(p_business_id, 'commissions') then
    raise exception 'Tu plan no incluye esta función (commissions)' using errcode = 'P0001';
  end if;
  if p_end < p_start then
    raise exception 'La fecha de inicio debe ser antes del término' using errcode = 'P0001';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;
  insert into public.settlements (business_id, period_start, period_end, created_by)
  values (p_business_id, p_start, p_end, app.current_user_id())
  returning id into v_id;
  update public.commission_entries set settlement_id = v_id
  where business_id = p_business_id and settlement_id is null
    and occurred_at < ((p_end + 1)::timestamp at time zone v_tz);
  update public.settlements set total = (select coalesce(sum(amount), 0) from public.commission_entries where settlement_id = v_id)
  where id = v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_my_bookings()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'status', b.status, 'startsAt', b.starts_at, 'endsAt', b.ends_at, 'total', b.total,
    'businessName', bz.name, 'businessSlug', bz.slug, 'timezone', bz.timezone, 'currency', bz.currency,
    'cancellationHours', bz.cancellation_hours,
    'services', (select jsonb_agg(i.service_name order by i.position) from public.booking_items i where i.booking_id = b.id)
  ) order by b.starts_at desc), '[]'::jsonb)
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  join public.businesses bz on bz.id = b.visible_brand_business_id
  where c.user_id = app.current_user_id() and app.current_user_id() is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.app_public_business(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'slug', b.slug, 'timezone', b.timezone, 'currency', b.currency, 'phone', b.phone,
    'bookingMode', b.booking_mode, 'maxAdvanceDays', b.max_advance_days, 'cancellationHours', b.cancellation_hours,
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', br.id, 'name', br.name, 'address', br.address, 'commune', br.commune) order by br.created_at)
      from public.branches br where br.business_id = b.id and br.active), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'durationMinutes', s.duration_minutes, 'price', s.price,
        'needsPerson', exists (select 1 from public.service_resource_requirements q
                               where q.service_id = s.id and q.resource_type = 'person')) order by s.name)
      from public.services s where s.business_id = b.id and s.active), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'branchId', r.branch_id) order by r.name)
      from public.resources r where r.business_id = b.id and r.active and r.type = 'person'), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object('id', ad.id, 'name', ad.name, 'description', ad.description, 'price', ad.price) order by ad.name)
      from public.addons ad where ad.business_id = b.id and ad.active), '[]'::jsonb)
  )
  from public.businesses b
  where b.slug = p_slug and b.public_booking_enabled;
$function$
;

CREATE OR REPLACE FUNCTION public.app_replace_booking_commissions(p_booking_id uuid, p_lines jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_booking public.bookings;
  v_draft uuid;
  v_count int;
begin
  if app.current_request_role() <> 'service_role' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.status <> 'completed' then
    raise exception 'Solo las reservas completadas generan comisiones' using errcode = 'P0001';
  end if;
  if app.booking_commissions_locked(p_booking_id) then
    raise exception 'La reserva ya está en una liquidación cerrada: registra un ajuste' using errcode = 'P0001';
  end if;
  -- Si estaba en una liquidación borrador, sigue en ella
  select settlement_id into v_draft from public.commission_entries
  where booking_id = p_booking_id and kind = 'service' and settlement_id is not null limit 1;
  delete from public.commission_entries where booking_id = p_booking_id and kind = 'service';

  insert into public.commission_entries (
    business_id, professional_id, booking_id, booking_item_id, kind, occurred_at, share_bp,
    base_amount, addon_base_amount, rule_id, rule_kind, rule_value, amount, settlement_id
  )
  select v_booking.business_id, (l ->> 'professionalId')::uuid, p_booking_id, i.id, 'service', v_booking.starts_at,
         (l ->> 'shareBp')::int, (l ->> 'baseAmount')::int, (l ->> 'addonBaseAmount')::int,
         (l ->> 'ruleId')::uuid, l ->> 'ruleKind', (l ->> 'ruleValue')::int, (l ->> 'amount')::int, v_draft
  from jsonb_array_elements(p_lines) l
  join public.booking_items i on i.id = (l ->> 'bookingItemId')::uuid and i.booking_id = p_booking_id;
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_lines) then
    raise exception 'Hay líneas que no son de esta reserva' using errcode = 'P0001';
  end if;
  if v_draft is not null then
    update public.settlements set total = (select coalesce(sum(amount), 0) from public.commission_entries where settlement_id = v_draft)
    where id = v_draft;
  end if;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.app_set_settlement_status(p_settlement_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_s public.settlements;
begin
  select * into v_s from public.settlements where id = p_settlement_id for update;
  if not found or not app.can_manage_business(v_s.business_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_status = 'closed' and v_s.status = 'draft' then
    update public.settlements set status = 'closed', closed_at = now(),
      total = (select coalesce(sum(amount), 0) from public.commission_entries where settlement_id = v_s.id)
    where id = v_s.id;
  elsif p_status = 'paid' and v_s.status = 'closed' then
    update public.settlements set status = 'paid', paid_at = now() where id = v_s.id;
  elsif p_status = 'deleted' and v_s.status = 'draft' then
    update public.commission_entries set settlement_id = null where settlement_id = v_s.id;
    delete from public.settlements where id = v_s.id;
  else
    raise exception 'No se puede pasar una liquidación de % a %', v_s.status, p_status using errcode = 'P0001';
  end if;
end;
$function$
;


revoke all on function public.app_add_commission_adjustment(uuid, uuid, int, text) from public, anon;
grant execute on function public.app_add_commission_adjustment(uuid, uuid, int, text) to authenticated, service_role;
