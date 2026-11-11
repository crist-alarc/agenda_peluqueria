-- =============================================================================
-- Fase 2D · Comisiones del equipo y liquidaciones (sección 16, ADR 0005)
--
-- - Reglas por persona y/o servicio: porcentaje o monto fijo; opcionalmente
--   incluyen adicionales. Gana la más específica (lógica en @agenda/core).
-- - Servicio con varios profesionales: "receta" del servicio (ej. corte 70% /
--   secado 30%) o reparto manual por reserva (por % o minutos). Suma 100%.
-- - Cada reserva completada genera movimientos de comisión (los calcula el
--   servidor con @agenda/core y los guarda con la clave de servicio).
-- - Liquidación por período: borrador → cerrada → pagada. Una liquidación
--   cerrada no se modifica: las correcciones son ajustes (movimientos nuevos).
-- - Plan "completo" con todas las funciones para negocios piloto y de prueba.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plan completo (decisión del dueño: los negocios existentes tienen todo)
-- -----------------------------------------------------------------------------
insert into public.plans (code, name, description, is_public) values
  ('completo', 'Plan Completo', 'Todas las funciones, sin límites (negocios piloto y de prueba)', false);
insert into public.plan_features (plan_code, feature, enabled, limit_value)
  select 'completo', feature, true, null from public.plan_features where plan_code = 'base';

update public.business_subscriptions set plan_code = 'completo';
insert into public.business_entitlements (business_id, feature, enabled, limit_value, source)
  select s.business_id, pf.feature, true, null, 'plan'
  from public.business_subscriptions s
  join public.plan_features pf on pf.plan_code = 'completo'
  on conflict (business_id, feature) do update set enabled = true, limit_value = null, source = 'plan';

-- ¿El negocio tiene habilitada una función de su plan?
create or replace function app.has_feature(p_business_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select e.enabled from public.business_entitlements e
                   where e.business_id = p_business_id and e.feature = p_feature), false);
$$;

-- Frecuencia habitual de liquidación (regla del dueño: los plazos son configurables)
alter table public.businesses
  add column settlement_period text not null default 'monthly'
    check (settlement_period in ('weekly', 'biweekly', 'monthly'));

-- ¿La persona trabaja en el negocio? (tiene un recurso ahí)
create or replace function app.professional_in_business(p_professional_id uuid, p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.resources r where r.professional_id = p_professional_id and r.business_id = p_business_id);
$$;

-- -----------------------------------------------------------------------------
-- 2. Reglas de comisión
-- -----------------------------------------------------------------------------
create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  professional_id uuid references public.professionals (id) on delete cascade,
  service_id uuid references public.services (id) on delete cascade,
  kind text not null check (kind in ('percent', 'fixed')),
  -- percent: puntos básicos (40% = 4000); fixed: pesos enteros por servicio
  value int not null check (value >= 0 and (kind = 'fixed' or value <= 10000)),
  include_addons boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index commission_rules_business_idx on public.commission_rules (business_id);
-- Una sola regla activa por combinación persona/servicio
create unique index commission_rules_unique_active on public.commission_rules (
  business_id,
  coalesce(professional_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(service_id, '00000000-0000-0000-0000-000000000000')
) where active;

create trigger commission_rules_entitlement before insert on public.commission_rules
  for each row execute function app.enforce_entitlement_limit('commissions');

alter table public.commission_rules enable row level security;
create policy commission_rules_read on public.commission_rules for select to authenticated
  using (
    app.can_manage_business(business_id)
    or exists (select 1 from public.professionals p where p.id = professional_id and p.user_id = app.current_user_id())
  );
create policy commission_rules_write on public.commission_rules for all to authenticated
  using (app.can_manage_business(business_id))
  with check (
    app.can_manage_business(business_id)
    and (professional_id is null or app.professional_in_business(professional_id, business_id))
    and (service_id is null or exists (select 1 from public.services s where s.id = service_id and s.business_id = commission_rules.business_id))
  );
revoke all on public.commission_rules from anon;

-- -----------------------------------------------------------------------------
-- 3. Receta del servicio y reparto por reserva
-- -----------------------------------------------------------------------------
create table public.service_commission_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  position int not null default 0,
  label text not null check (length(trim(label)) > 0),
  share_bp int not null check (share_bp between 1 and 10000),
  required_skill text
);
create index service_commission_roles_service_idx on public.service_commission_roles (service_id);
alter table public.service_commission_roles enable row level security;
create policy service_commission_roles_read on public.service_commission_roles for select to authenticated
  using (app.is_business_member(business_id));
revoke insert, update, delete on public.service_commission_roles from anon, authenticated;

create table public.booking_item_shares (
  booking_item_id uuid not null references public.booking_items (id) on delete cascade,
  professional_id uuid not null references public.professionals (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  share_bp int not null check (share_bp between 1 and 10000),
  -- Si el reparto se hizo por tiempo trabajado, se guardan los minutos
  minutes int check (minutes is null or minutes > 0),
  primary key (booking_item_id, professional_id)
);
alter table public.booking_item_shares enable row level security;
create policy booking_item_shares_read on public.booking_item_shares for select to authenticated
  using (app.can_manage_business(business_id));
revoke insert, update, delete on public.booking_item_shares from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Liquidaciones y movimientos
-- -----------------------------------------------------------------------------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status text not null default 'draft' check (status in ('draft', 'closed', 'paid')),
  total_clp bigint not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  paid_at timestamptz
);
create index settlements_business_idx on public.settlements (business_id, period_start desc);

create table public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  professional_id uuid not null references public.professionals (id),
  booking_id uuid references public.bookings (id) on delete cascade,
  booking_item_id uuid references public.booking_items (id) on delete cascade,
  kind text not null check (kind in ('service', 'adjustment')),
  -- Fecha de la reserva (servicio) o del ajuste: define en qué período entra
  occurred_at timestamptz not null,
  share_bp int check (share_bp between 1 and 10000),
  base_clp int not null default 0,
  addon_base_clp int not null default 0,
  rule_id uuid references public.commission_rules (id) on delete set null,
  rule_kind text check (rule_kind in ('percent', 'fixed')),
  rule_value int,
  amount_clp int not null,
  note text,
  settlement_id uuid references public.settlements (id),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (kind = 'service' and booking_item_id is not null)
    or (kind = 'adjustment' and booking_item_id is null and length(trim(coalesce(note, ''))) > 0 and amount_clp <> 0)
  )
);
create index commission_entries_business_idx on public.commission_entries (business_id, occurred_at);
create index commission_entries_booking_idx on public.commission_entries (booking_id);
create index commission_entries_settlement_idx on public.commission_entries (settlement_id);
create index commission_entries_professional_idx on public.commission_entries (professional_id);

alter table public.settlements enable row level security;
alter table public.commission_entries enable row level security;
-- El dueño y los administradores ven todo; cada profesional ve lo suyo.
create policy commission_entries_read on public.commission_entries for select to authenticated
  using (
    app.can_manage_business(business_id)
    or exists (select 1 from public.professionals p where p.id = professional_id and p.user_id = app.current_user_id())
  );
create policy settlements_read on public.settlements for select to authenticated
  using (
    app.can_manage_business(business_id)
    or exists (
      select 1 from public.commission_entries e join public.professionals p on p.id = e.professional_id
      where e.settlement_id = settlements.id and p.user_id = app.current_user_id()
    )
  );
-- Nadie escribe directo: solo las funciones de abajo
revoke insert, update, delete on public.settlements, public.commission_entries from anon, authenticated;
revoke all on public.settlements, public.commission_entries from anon;

-- Garantía final: lo que está en una liquidación cerrada o pagada no cambia.
create or replace function app.settlement_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Una liquidación cerrada no se puede borrar' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'closed' and new.status = 'paid'
     and (new.business_id, new.period_start, new.period_end, new.total_clp)
         is not distinct from (old.business_id, old.period_start, old.period_end, old.total_clp) then
    return new;
  end if;
  if old.status <> 'draft' then
    raise exception 'Una liquidación cerrada no se modifica: registra un ajuste' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger settlements_guard before update or delete on public.settlements
  for each row execute function app.settlement_guard();

create or replace function app.commission_entry_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.settlement_id is not null
     and exists (select 1 from public.settlements s where s.id = old.settlement_id and s.status <> 'draft') then
    raise exception 'Este movimiento está en una liquidación cerrada: registra un ajuste' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger commission_entries_guard before update or delete on public.commission_entries
  for each row execute function app.commission_entry_guard();

-- -----------------------------------------------------------------------------
-- 5. Funciones
-- -----------------------------------------------------------------------------
-- No se puede recalcular una reserva que ya está en una liquidación cerrada.
create or replace function app.booking_commissions_locked(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.commission_entries e join public.settlements s on s.id = e.settlement_id
    where e.booking_id = p_booking_id and s.status <> 'draft'
  );
$$;

-- Datos para calcular las comisiones de una reserva (solo el servidor).
create or replace function public.app_booking_commission_data(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if app.current_request_role() <> 'service_role' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'bookingId', b.id, 'businessId', b.business_id, 'status', b.status, 'startsAt', b.starts_at,
      'enabled', app.has_feature(b.business_id, 'commissions'),
      'locked', app.booking_commissions_locked(b.id),
      'addonsTotalClp', coalesce((select sum(a.unit_price_clp * a.quantity) from public.booking_addons a where a.booking_id = b.id), 0),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'bookingItemId', i.id, 'serviceId', i.service_id, 'serviceName', i.service_name, 'priceClp', i.price_clp,
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
$$;

-- Guarda (o reemplaza) las comisiones calculadas de una reserva completada.
create or replace function public.app_replace_booking_commissions(p_booking_id uuid, p_lines jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
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
    base_clp, addon_base_clp, rule_id, rule_kind, rule_value, amount_clp, settlement_id
  )
  select v_booking.business_id, (l ->> 'professionalId')::uuid, p_booking_id, i.id, 'service', v_booking.starts_at,
         (l ->> 'shareBp')::int, (l ->> 'baseClp')::int, (l ->> 'addonBaseClp')::int,
         (l ->> 'ruleId')::uuid, l ->> 'ruleKind', (l ->> 'ruleValue')::int, (l ->> 'amountClp')::int, v_draft
  from jsonb_array_elements(p_lines) l
  join public.booking_items i on i.id = (l ->> 'bookingItemId')::uuid and i.booking_id = p_booking_id;
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_lines) then
    raise exception 'Hay líneas que no son de esta reserva' using errcode = 'P0001';
  end if;
  if v_draft is not null then
    update public.settlements set total_clp = (select coalesce(sum(amount_clp), 0) from public.commission_entries where settlement_id = v_draft)
    where id = v_draft;
  end if;
  return v_count;
end;
$$;

-- Reservas completadas del período que aún no tienen comisiones (solo el servidor).
create or replace function public.app_bookings_missing_commissions(p_business_id uuid, p_to timestamptz)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if app.current_request_role() <> 'service_role' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return coalesce((
    select array_agg(b.id) from public.bookings b
    where b.business_id = p_business_id and b.status = 'completed' and b.starts_at < p_to
      and not exists (select 1 from public.commission_entries e where e.booking_id = b.id)
  ), '{}');
end;
$$;

-- Receta del servicio: reemplaza todos sus roles (vacío = partes iguales).
create or replace function public.app_set_service_recipe(p_service_id uuid, p_roles jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
  v_total int;
begin
  select business_id into v_business from public.services where id = p_service_id;
  if v_business is null or not app.can_manage_business(v_business) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select coalesce(sum((r ->> 'shareBp')::int), 0) into v_total from jsonb_array_elements(p_roles) r;
  if jsonb_array_length(p_roles) > 0 and v_total <> 10000 then
    raise exception 'La receta debe sumar 100%%' using errcode = 'P0001';
  end if;
  delete from public.service_commission_roles where service_id = p_service_id;
  insert into public.service_commission_roles (business_id, service_id, position, label, share_bp, required_skill)
  select v_business, p_service_id, (ord - 1)::int, r ->> 'label', (r ->> 'shareBp')::int, nullif(r ->> 'requiredSkill', '')
  from jsonb_array_elements(p_roles) with ordinality as t(r, ord);
end;
$$;

-- Reparto manual de un servicio de una reserva (vacío = volver al automático).
create or replace function public.app_set_item_shares(p_booking_item_id uuid, p_shares jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.booking_items;
  v_total int;
begin
  select * into v_item from public.booking_items where id = p_booking_item_id;
  if not found or not app.can_manage_business(v_item.business_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if app.booking_commissions_locked(v_item.booking_id) then
    raise exception 'La reserva ya está en una liquidación cerrada: registra un ajuste' using errcode = 'P0001';
  end if;
  select coalesce(sum((s ->> 'shareBp')::int), 0) into v_total from jsonb_array_elements(p_shares) s;
  if jsonb_array_length(p_shares) > 0 and v_total <> 10000 then
    raise exception 'El reparto debe sumar 100%%' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_shares) s
             where not app.professional_in_business((s ->> 'professionalId')::uuid, v_item.business_id)) then
    raise exception 'Esa persona no trabaja en este negocio' using errcode = 'P0001';
  end if;
  delete from public.booking_item_shares where booking_item_id = p_booking_item_id;
  insert into public.booking_item_shares (booking_item_id, professional_id, business_id, share_bp, minutes)
  select p_booking_item_id, (s ->> 'professionalId')::uuid, v_item.business_id, (s ->> 'shareBp')::int, nullif(s ->> 'minutes', '')::int
  from jsonb_array_elements(p_shares) s;
end;
$$;

-- Ajuste (positivo o negativo) con motivo; entra en la próxima liquidación.
create or replace function public.app_add_commission_adjustment(
  p_business_id uuid, p_professional_id uuid, p_amount_clp int, p_note text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
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
  insert into public.commission_entries (business_id, professional_id, kind, occurred_at, amount_clp, note, created_by)
  values (p_business_id, p_professional_id, 'adjustment', now(), p_amount_clp, trim(p_note), app.current_user_id())
  returning id into v_id;
  return v_id;
end;
$$;

-- Crea una liquidación borrador con todos los movimientos pendientes hasta el
-- fin del período (incluye ajustes y pendientes anteriores, para no perder nada).
create or replace function public.app_create_settlement(p_business_id uuid, p_start date, p_end date)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
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
  update public.settlements set total_clp = (select coalesce(sum(amount_clp), 0) from public.commission_entries where settlement_id = v_id)
  where id = v_id;
  return v_id;
end;
$$;

create or replace function public.app_set_settlement_status(p_settlement_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.settlements;
begin
  select * into v_s from public.settlements where id = p_settlement_id for update;
  if not found or not app.can_manage_business(v_s.business_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_status = 'closed' and v_s.status = 'draft' then
    update public.settlements set status = 'closed', closed_at = now(),
      total_clp = (select coalesce(sum(amount_clp), 0) from public.commission_entries where settlement_id = v_s.id)
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
$$;

-- -----------------------------------------------------------------------------
-- 6. Auditoría y permisos
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['commission_rules', 'service_commission_roles', 'booking_item_shares', 'settlements', 'commission_entries'] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()',
      t || '_audit', t
    );
  end loop;
end $$;

revoke all on function app.has_feature(uuid, text) from public;
grant execute on function app.has_feature(uuid, text) to authenticated, service_role;
revoke all on function app.professional_in_business(uuid, uuid) from public;
grant execute on function app.professional_in_business(uuid, uuid) to authenticated, service_role;
revoke all on function app.booking_commissions_locked(uuid) from public;
revoke all on function app.settlement_guard() from public;
revoke all on function app.commission_entry_guard() from public;

revoke all on function public.app_booking_commission_data(uuid) from public, anon, authenticated;
grant execute on function public.app_booking_commission_data(uuid) to service_role;
revoke all on function public.app_replace_booking_commissions(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.app_replace_booking_commissions(uuid, jsonb) to service_role;
revoke all on function public.app_bookings_missing_commissions(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.app_bookings_missing_commissions(uuid, timestamptz) to service_role;
revoke all on function public.app_set_service_recipe(uuid, jsonb) from public, anon;
grant execute on function public.app_set_service_recipe(uuid, jsonb) to authenticated;
revoke all on function public.app_set_item_shares(uuid, jsonb) from public, anon;
grant execute on function public.app_set_item_shares(uuid, jsonb) to authenticated;
revoke all on function public.app_add_commission_adjustment(uuid, uuid, int, text) from public, anon;
grant execute on function public.app_add_commission_adjustment(uuid, uuid, int, text) to authenticated;
revoke all on function public.app_create_settlement(uuid, date, date) from public, anon;
grant execute on function public.app_create_settlement(uuid, date, date) to authenticated;
revoke all on function public.app_set_settlement_status(uuid, text) from public, anon;
grant execute on function public.app_set_settlement_status(uuid, text) to authenticated;
