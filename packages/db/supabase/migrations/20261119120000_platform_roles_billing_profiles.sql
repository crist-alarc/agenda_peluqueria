-- =============================================================================
-- Consola de la plataforma · A3a (ADR 0010): roles, aprobaciones, planes free y datos de facturación
--
-- 1. Roles de la plataforma: dueño (aprueba planes), administrador (autoriza planes free y gestiona) y
--    agente de soporte (pide accesos y solicita planes free, sin autorizarlos).
-- 2. Planes nuevos y versiones creados por alguien que no es el dueño quedan pendientes de su aprobación.
-- 3. Planes free: solo con autorización de un administrador; pueden tener fecha de término y plan siguiente.
-- 4. Datos de facturación por negocio, obligatorios. Días de gracia hasta el último día hábil del mes del
--    alta (mínimo configurable, 15 días); después, el panel y el link público se bloquean.
-- =============================================================================

-- Ayuda local: reemplaza un trozo del cuerpo de una función existente (falla si el trozo no está).
create function pg_temp.patch_function(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_fn);
begin
  if position(p_old in v_def) = 0 then
    raise exception 'patch_function: no se encontró el texto en %', p_fn;
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- 1. Roles de la plataforma ----------------------------------------------------------------
alter table public.platform_admins
  add column role text not null default 'agent' check (role in ('owner', 'admin', 'agent')),
  add column added_by uuid references public.profiles (id);
comment on column public.platform_admins.role is
  'owner: dueño de la plataforma (aprueba planes). admin: autoriza planes free y gestiona. agent: soporte.';
-- Quien ya administraba la plataforma era el dueño
update public.platform_admins set role = 'owner';

create or replace function app.platform_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select role from public.platform_admins where user_id = app.current_user_id() $$;
revoke all on function app.platform_role() from public;

/** Dueño o administrador de la plataforma (no agentes). */
create or replace function app.require_platform_manager()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(app.platform_role(), '') not in ('owner', 'admin') then
    raise exception 'Solo un administrador de la plataforma puede hacer esto' using errcode = '42501';
  end if;
end;
$$;
revoke all on function app.require_platform_manager() from public;

create or replace function app.require_platform_owner()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(app.platform_role(), '') <> 'owner' then
    raise exception 'Solo el dueño de la plataforma puede hacer esto' using errcode = '42501';
  end if;
end;
$$;
revoke all on function app.require_platform_owner() from public;

-- Las acciones que cambian planes, cobros o el estado de un negocio pasan a ser solo de administradores
select pg_temp.patch_function(f::regprocedure, 'perform app.require_platform_admin();', 'perform app.require_platform_manager();')
from unnest(array[
  'public.app_admin_add_override(uuid, text, boolean, int, timestamptz, text)',
  'public.app_admin_end_override(uuid)',
  'public.app_admin_suspend(uuid, text)',
  'public.app_admin_reactivate(uuid, text)',
  'public.app_admin_save_billing_entity(uuid, text, text, boolean)',
  'public.app_admin_save_tax_rule(uuid, text, text, int, boolean)',
  'public.app_admin_migrate_plan_version(uuid, text)'
]) f;

/** Equipo de la plataforma. */
create or replace function public.app_admin_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('userId', a.user_id, 'name', p.full_name, 'email', p.email, 'role', a.role,
                                        'createdAt', a.created_at, 'isMe', a.user_id = app.current_user_id())
                     order by case a.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.full_name)
    from public.platform_admins a join public.profiles p on p.id = a.user_id), '[]'::jsonb);
end;
$$;

/** Agrega o cambia el rol de alguien del equipo (solo el dueño). La persona debe tener cuenta. */
create or replace function public.app_admin_set_team_member(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  perform app.require_platform_owner();
  if p_role not in ('owner', 'admin', 'agent') then
    raise exception 'Rol no válido' using errcode = 'P0001';
  end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No hay una cuenta con ese email. La persona debe registrarse primero.' using errcode = 'P0001';
  end if;
  if v_user = app.current_user_id() then
    raise exception 'No puedes cambiar tu propio rol' using errcode = 'P0001';
  end if;
  insert into public.platform_admins (user_id, role, added_by) values (v_user, p_role, app.current_user_id())
  on conflict (user_id) do update set role = excluded.role;
end;
$$;

create or replace function public.app_admin_remove_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_owner();
  if p_user_id = app.current_user_id() then
    raise exception 'No puedes quitarte a ti mismo' using errcode = 'P0001';
  end if;
  delete from public.platform_admins where user_id = p_user_id;
end;
$$;

create trigger platform_admins_audit after insert or update or delete on public.platform_admins
  for each row execute function app.audit_row();

-- 2. Planes que requieren aprobación del dueño ---------------------------------------------------
alter table public.plans add column is_free boolean not null default false;
comment on column public.plans.is_free is 'Plan sin cobro. Solo se asigna con la autorización de un administrador.';

alter table public.plan_versions
  add column status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column decided_by uuid references public.profiles (id),
  add column decided_at timestamptz,
  add column decision_note text;
-- Una sola versión pendiente por plan
create unique index plan_versions_pending_idx on public.plan_versions (plan_code) where status = 'pending';

/** Refleja una versión aprobada como vigente (y en plan_features, por compatibilidad). */
create or replace function app.publish_plan_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.plan_versions;
begin
  select * into v from public.plan_versions where id = p_version_id;
  update public.plans set current_version_id = v.id where code = v.plan_code;
  delete from public.plan_features where plan_code = v.plan_code;
  insert into public.plan_features (plan_code, feature, enabled, limit_value)
  select v.plan_code, f ->> 'feature', coalesce((f ->> 'enabled')::boolean, false), (f ->> 'limit')::int
  from jsonb_array_elements(v.features) f;
end;
$$;
revoke all on function app.publish_plan_version(uuid) from public;

/**
 * Crea o edita un plan.
 * - El dueño de la plataforma: los cambios quedan aprobados de inmediato.
 * - Un administrador: puede proponer un plan nuevo o una versión nueva de funciones y precios, que quedan
 *   pendientes de la aprobación del dueño. Nombre, visibilidad, archivo y "free" de un plan existente solo
 *   los cambia el dueño.
 */
drop function public.app_admin_save_plan(text, text, text, boolean, boolean, text[], jsonb, jsonb, text);
create function public.app_admin_save_plan(
  p_code text, p_name text, p_description text, p_is_public boolean, p_active boolean,
  p_offered_countries text[], p_features jsonb, p_prices jsonb, p_note text default null, p_is_free boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean;
  v_plan public.plans;
  v_current public.plan_versions;
  v_pending public.plan_versions;
  v_version_id uuid;
  v_next int;
  v_prices jsonb := case when p_is_free then '{}'::jsonb else p_prices end;
begin
  perform app.require_platform_manager();
  v_owner := app.platform_role() = 'owner';
  if p_code !~ '^[a-z][a-z0-9_]{1,30}$' then
    raise exception 'El código del plan debe tener letras minúsculas, números o guion bajo' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Indica el nombre del plan' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_features) <> 'array' or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'Funciones o precios no válidos' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_each(v_prices) e where e.key not in ('CLP', 'USD') or jsonb_typeof(e.value) <> 'number' or (e.value)::numeric < 0
             or (e.value)::numeric <> floor((e.value)::numeric)) then
    raise exception 'Los precios deben ser montos enteros no negativos en CLP o USD' using errcode = 'P0001';
  end if;

  select * into v_plan from public.plans where code = p_code for update;
  if not found then
    insert into public.plans (code, name, description, is_public, active, offered_countries, sort_order, is_free)
    values (p_code, trim(p_name), nullif(trim(p_description), ''), p_is_public and not p_is_free, p_active,
            coalesce(p_offered_countries, '{}'), (select coalesce(max(sort_order), 0) + 1 from public.plans), p_is_free)
    returning * into v_plan;
  elsif v_owner then
    update public.plans set name = trim(p_name), description = nullif(trim(p_description), ''),
      is_public = p_is_public and not p_is_free, active = p_active, offered_countries = coalesce(p_offered_countries, '{}'),
      is_free = p_is_free
    where code = p_code
    returning * into v_plan;
  elsif v_plan.name is distinct from trim(p_name) or v_plan.description is distinct from nullif(trim(p_description), '')
        or v_plan.is_public is distinct from (p_is_public and not p_is_free) or v_plan.active is distinct from p_active
        or v_plan.offered_countries is distinct from coalesce(p_offered_countries, '{}') or v_plan.is_free is distinct from p_is_free then
    raise exception 'Solo el dueño de la plataforma cambia el nombre, la visibilidad, el archivo o el tipo free de un plan' using errcode = '42501';
  end if;

  select * into v_current from public.plan_versions where id = v_plan.current_version_id;
  if found and v_current.features = p_features and v_current.prices = v_prices then
    -- Sin cambios: si había una propuesta pendiente, se descarta
    if v_owner then
      update public.plan_versions set status = 'rejected', decided_by = app.current_user_id(), decided_at = now(),
        decision_note = 'Reemplazada por el dueño'
      where plan_code = p_code and status = 'pending';
    end if;
    return v_current.id;
  end if;

  select * into v_pending from public.plan_versions where plan_code = p_code and status = 'pending' for update;
  if found and not v_owner then
    -- El administrador corrige su propuesta pendiente en vez de crear otra
    update public.plan_versions set features = p_features, prices = v_prices, note = nullif(trim(p_note), ''),
      created_by = app.current_user_id(), created_at = now()
    where id = v_pending.id;
    return v_pending.id;
  end if;
  if found then
    update public.plan_versions set status = 'rejected', decided_by = app.current_user_id(), decided_at = now(),
      decision_note = 'Reemplazada por el dueño'
    where id = v_pending.id;
  end if;

  select coalesce(max(version), 0) + 1 into v_next from public.plan_versions where plan_code = p_code;
  insert into public.plan_versions (plan_code, version, features, prices, note, created_by, status, decided_by, decided_at)
  values (p_code, v_next, p_features, v_prices, nullif(trim(p_note), ''), app.current_user_id(),
          case when v_owner then 'approved' else 'pending' end,
          case when v_owner then app.current_user_id() end, case when v_owner then now() end)
  returning id into v_version_id;
  if v_owner then
    perform app.publish_plan_version(v_version_id);
  end if;
  return v_version_id;
end;
$$;

/** El dueño aprueba o rechaza una versión propuesta por un administrador. */
create or replace function public.app_admin_decide_plan_version(p_version_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.plan_versions;
begin
  perform app.require_platform_owner();
  select * into v from public.plan_versions where id = p_version_id for update;
  if not found or v.status <> 'pending' then
    raise exception 'Esa propuesta ya no está pendiente' using errcode = 'P0001';
  end if;
  update public.plan_versions
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = app.current_user_id(), decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = p_version_id;
  if p_approve then
    perform app.publish_plan_version(p_version_id);
  end if;
end;
$$;

create or replace function public.app_admin_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', p.code, 'name', p.name, 'description', p.description, 'isPublic', p.is_public, 'active', p.active,
      'isFree', p.is_free, 'sortOrder', p.sort_order, 'offeredCountries', to_jsonb(p.offered_countries),
      'currentVersionId', p.current_version_id,
      'versions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id, 'version', v.version, 'features', v.features, 'prices', v.prices, 'note', v.note, 'createdAt', v.created_at,
          'status', v.status, 'createdBy', (select full_name from public.profiles where id = v.created_by),
          'decidedAt', v.decided_at, 'decisionNote', v.decision_note,
          'businesses', (select count(*) from public.business_subscriptions s where s.plan_version_id = v.id)
        ) order by v.version desc)
        from public.plan_versions v where v.plan_code = p.code), '[]'::jsonb)
    ) order by p.active desc, p.sort_order, p.name)
    from public.plans p
  ), '[]'::jsonb);
end;
$$;

-- Los planes free y los que aún no tienen versión aprobada no se ofrecen al registrarse
create or replace function public.app_public_plans(p_country text default 'CL')
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'currency', t.currency, 'taxRateBp', t.tax_rate_bp, 'documentType', t.document_type,
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'description', p.description,
        'features', v.features, 'monthlyNet', (v.prices ->> t.currency)::int
      ) order by p.sort_order, p.name)
      from public.plans p join public.plan_versions v on v.id = p.current_version_id
      where p.active and p.is_public and not p.is_free
        and (cardinality(p.offered_countries) = 0 or p_country = any (p.offered_countries))), '[]'::jsonb)
  )
  from (select * from app.billing_terms(p_country)) t;
$$;

select pg_temp.patch_function(
  'public.app_create_business(text, text, text, text, text, text, text)'::regprocedure,
  'where code = coalesce(p_plan_code, ''base'') and active and is_public',
  'where code = coalesce(p_plan_code, ''base'') and active and is_public and not is_free and current_version_id is not null');

-- 3. Planes free con autorización ---------------------------------------------------------------
create table public.free_plan_grants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_code text not null references public.plans (code),
  -- Último día con el plan free (incluido); null = indefinido
  ends_on date,
  -- Plan al que pasa después de ends_on
  next_plan_code text references public.plans (code),
  reason text not null check (length(trim(reason)) between 3 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check ((ends_on is null) = (next_plan_code is null))
);
create index free_plan_grants_business_idx on public.free_plan_grants (business_id, created_at desc);
create unique index free_plan_grants_pending_idx on public.free_plan_grants (business_id) where status = 'pending';
alter table public.free_plan_grants enable row level security;
revoke insert, update, delete on public.free_plan_grants from anon, authenticated;
create trigger free_plan_grants_audit after insert or update or delete on public.free_plan_grants
  for each row execute function app.audit_row();

alter table public.business_subscriptions
  add column free_grant_id uuid references public.free_plan_grants (id),
  add column free_until date,
  add column next_plan_code text references public.plans (code);

/** Tramo de cobro: los planes free tienen precio 0. */
create or replace function app.open_subscription_period(
  p_business_id uuid, p_kind text, p_plan_version_id uuid, p_currency text, p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := app.platform_today();
  v_open public.subscription_periods;
  v_price int;
begin
  if p_plan_version_id is not null then
    select case when p.is_free then 0 else (v.prices ->> p_currency)::int end into v_price
    from public.plan_versions v join public.plans p on p.code = v.plan_code where v.id = p_plan_version_id;
  end if;
  select * into v_open from public.subscription_periods where business_id = p_business_id and ends_on is null for update;
  if found and v_open.starts_on > v_today then
    update public.subscription_periods
    set kind = p_kind, plan_version_id = p_plan_version_id, currency = p_currency,
        monthly_net = case when p_kind = 'plan' then v_price end, note = p_note, created_by = app.current_user_id()
    where id = v_open.id;
    return;
  end if;
  if found then
    update public.subscription_periods set ends_on = v_today where id = v_open.id;
  end if;
  insert into public.subscription_periods (business_id, kind, plan_version_id, currency, monthly_net, starts_on, note, created_by)
  values (p_business_id, p_kind, p_plan_version_id, p_currency, case when p_kind = 'plan' then v_price end,
          v_today + 1, p_note, app.current_user_id());
end;
$$;
revoke all on function app.open_subscription_period(uuid, text, uuid, text, text) from public;

/** Aplica un cambio de plan (funciones ya, cobro desde mañana). Lo usan la consola y la tarea programada. */
create or replace function app.apply_plan_change(p_business_id uuid, p_plan_code text, p_note text, p_grant_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan public.plans;
  v_sub public.business_subscriptions;
  v_grant public.free_plan_grants;
begin
  select * into v_plan from public.plans where code = p_plan_code and active and current_version_id is not null;
  if not found then
    raise exception 'Plan no disponible' using errcode = 'P0001';
  end if;
  select * into v_sub from public.business_subscriptions where business_id = p_business_id for update;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  if p_grant_id is not null then
    select * into v_grant from public.free_plan_grants where id = p_grant_id;
  end if;
  update public.business_subscriptions
  set plan_code = p_plan_code, plan_version_id = v_plan.current_version_id,
      free_grant_id = p_grant_id, free_until = v_grant.ends_on, next_plan_code = v_grant.next_plan_code
  where business_id = p_business_id;
  if not app.business_is_suspended(p_business_id) then
    perform app.open_subscription_period(p_business_id, 'plan', v_plan.current_version_id, v_sub.currency,
      coalesce(nullif(trim(p_note), ''), 'Cambio a ' || v_plan.name));
  end if;
  perform app.refresh_entitlements(p_business_id);
end;
$$;
revoke all on function app.apply_plan_change(uuid, text, text, uuid) from public;

/** Cambia el plan de un negocio a un plan con cobro. Los planes free van por app_admin_request_free_plan. */
create or replace function public.app_admin_change_plan(p_business_id uuid, p_plan_code text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan public.plans;
  v_sub public.business_subscriptions;
begin
  perform app.require_platform_manager();
  select * into v_plan from public.plans where code = p_plan_code and active and current_version_id is not null;
  if not found then
    raise exception 'Plan no disponible' using errcode = 'P0001';
  end if;
  if v_plan.is_free then
    raise exception 'Un plan free se asigna con autorización (Plan free)' using errcode = 'P0001';
  end if;
  select * into v_sub from public.business_subscriptions where business_id = p_business_id;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  if v_sub.plan_version_id = v_plan.current_version_id then
    raise exception 'El negocio ya tiene ese plan' using errcode = 'P0001';
  end if;
  perform app.apply_plan_change(p_business_id, p_plan_code, p_note);
end;
$$;

/**
 * Pide un plan free para un negocio. Si lo pide un administrador o el dueño, queda autorizado y se aplica;
 * si lo pide un agente, queda pendiente hasta que un administrador lo autorice.
 */
create or replace function public.app_admin_request_free_plan(
  p_business_id uuid, p_plan_code text, p_ends_on date, p_next_plan_code text, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_manager boolean;
begin
  perform app.require_platform_admin();
  v_manager := app.platform_role() in ('owner', 'admin');
  if not exists (select 1 from public.plans where code = p_plan_code and is_free and active and current_version_id is not null) then
    raise exception 'Ese plan no es un plan free disponible' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  if p_ends_on is not null then
    if p_ends_on < app.platform_today() then
      raise exception 'La fecha de término no puede ser pasada' using errcode = 'P0001';
    end if;
    if p_next_plan_code is null or not exists (select 1 from public.plans where code = p_next_plan_code and active and not is_free
                                                                          and current_version_id is not null) then
      raise exception 'Elige a qué plan con cobro pasa al terminar' using errcode = 'P0001';
    end if;
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Indica el motivo' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.free_plan_grants where business_id = p_business_id and status = 'pending') then
    raise exception 'Ya hay una solicitud pendiente para este negocio' using errcode = 'P0001';
  end if;
  insert into public.free_plan_grants (business_id, plan_code, ends_on, next_plan_code, reason, status, requested_by, decided_by, decided_at)
  values (p_business_id, p_plan_code, p_ends_on, case when p_ends_on is not null then p_next_plan_code end, trim(p_reason),
          case when v_manager then 'approved' else 'pending' end, app.current_user_id(),
          case when v_manager then app.current_user_id() end, case when v_manager then now() end)
  returning id into v_id;
  if v_manager then
    perform app.apply_plan_change(p_business_id, p_plan_code, 'Plan free: ' || trim(p_reason), v_id);
  end if;
  return v_id;
end;
$$;

/** Un administrador (que no la pidió) autoriza o rechaza una solicitud de plan free. */
create or replace function public.app_admin_decide_free_plan(p_grant_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.free_plan_grants;
begin
  perform app.require_platform_manager();
  select * into v from public.free_plan_grants where id = p_grant_id for update;
  if not found or v.status <> 'pending' then
    raise exception 'Esa solicitud ya no está pendiente' using errcode = 'P0001';
  end if;
  if v.requested_by = app.current_user_id() then
    raise exception 'Otra persona debe autorizar tu solicitud' using errcode = '42501';
  end if;
  update public.free_plan_grants
  set status = case when p_approve then 'approved' else 'rejected' end, decided_by = app.current_user_id(), decided_at = now()
  where id = p_grant_id;
  if p_approve then
    if v.ends_on is not null and v.ends_on < app.platform_today() then
      raise exception 'La fecha de término ya pasó: pide de nuevo el plan free' using errcode = 'P0001';
    end if;
    perform app.apply_plan_change(v.business_id, v.plan_code, 'Plan free: ' || v.reason, v.id);
  end if;
end;
$$;

/** Al terminar un plan free con fecha, pasa al plan elegido (lo llama la tarea programada). */
create or replace function app.expire_free_plans()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.business_subscriptions;
  v_count int := 0;
begin
  for v in select * from public.business_subscriptions
           where free_until is not null and free_until <= app.platform_today() and next_plan_code is not null
           for update skip locked loop
    perform app.apply_plan_change(v.business_id, v.next_plan_code, 'Terminó el plan free');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function app.expire_free_plans() from public;

/** Pendientes de aprobación: versiones de planes (las decide el dueño) y planes free (un administrador). */
create or replace function public.app_admin_approvals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_admin();
  return jsonb_build_object(
    'planVersions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'planCode', v.plan_code, 'planName', p.name, 'isNewPlan', p.current_version_id is null,
        'version', v.version, 'features', v.features, 'prices', v.prices, 'note', v.note, 'createdAt', v.created_at,
        'createdBy', (select full_name from public.profiles where id = v.created_by),
        'currentFeatures', cv.features, 'currentPrices', cv.prices
      ) order by v.created_at)
      from public.plan_versions v
      join public.plans p on p.code = v.plan_code
      left join public.plan_versions cv on cv.id = p.current_version_id
      where v.status = 'pending'), '[]'::jsonb),
    'freePlans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'businessId', g.business_id, 'businessName', b.name, 'planName', p.name, 'endsOn', g.ends_on,
        'nextPlanName', np.name, 'reason', g.reason, 'createdAt', g.created_at,
        'requestedBy', (select full_name from public.profiles where id = g.requested_by),
        'isMine', g.requested_by = app.current_user_id()
      ) order by g.created_at)
      from public.free_plan_grants g
      join public.businesses b on b.id = g.business_id
      join public.plans p on p.code = g.plan_code
      left join public.plans np on np.code = g.next_plan_code
      where g.status = 'pending'), '[]'::jsonb)
  );
end;
$$;

-- 4. Datos de facturación y días de gracia ------------------------------------------------------
create table public.platform_settings (
  id boolean primary key default true check (id),
  -- Días mínimos de gracia para completar los datos de facturación
  billing_grace_min_days int not null default 15 check (billing_grace_min_days between 0 and 90),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings default values;
alter table public.platform_settings enable row level security;
revoke insert, update, delete on public.platform_settings from anon, authenticated;

/** ¿Es día hábil? (lunes a viernes que no sea feriado). */
create or replace function app.is_business_day(p_date date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select extract(isodow from p_date) < 6 and not exists (select 1 from public.holidays h where h.date = p_date);
$$;
revoke all on function app.is_business_day(date) from public;

/** Último día hábil del mes de una fecha. */
create or replace function app.last_business_day(p_date date)
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(d)::date
  from generate_series(date_trunc('month', p_date), date_trunc('month', p_date) + interval '1 month - 1 day', interval '1 day') d
  where app.is_business_day(d::date);
$$;
revoke all on function app.last_business_day(date) from public;

/**
 * Plazo para completar los datos de facturación: último día hábil del mes del alta. Si quedan menos días
 * que el mínimo configurado, el último día hábil del mes siguiente.
 */
create or replace function app.billing_grace_deadline(p_from date)
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_min int := coalesce((select billing_grace_min_days from public.platform_settings), 15);
  v_deadline date := app.last_business_day(p_from);
begin
  if v_deadline - p_from < v_min then
    v_deadline := app.last_business_day((date_trunc('month', p_from) + interval '1 month')::date);
  end if;
  return v_deadline;
end;
$$;
revoke all on function app.billing_grace_deadline(date) from public;

alter table public.businesses
  add column billing_grace_until date not null default app.billing_grace_deadline(app.platform_today());
comment on column public.businesses.billing_grace_until is
  'Hasta este día (incluido) el negocio funciona sin datos de facturación. Después, panel y link público se bloquean.';

create table public.business_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  -- boleta o factura (Chile); exportacion (clientes de otros países)
  document_type text not null check (document_type in ('boleta', 'factura', 'exportacion')),
  country text not null default 'CL' check (country ~ '^[A-Z]{2}$'),
  tax_id text,
  legal_name text not null check (length(trim(legal_name)) between 2 and 150),
  activity text,
  address text,
  commune text,
  city text,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.business_billing_profiles enable row level security;
-- Solo el dueño del negocio ve sus datos de facturación (el rol admin no ve la facturación de la suscripción)
create policy billing_profiles_owner_read on public.business_billing_profiles for select to authenticated
  using (app.has_business_role(business_id, array['owner']::public.membership_role[]));
revoke insert, update, delete on public.business_billing_profiles from anon, authenticated;
create trigger billing_profiles_audit after insert or update or delete on public.business_billing_profiles
  for each row execute function app.audit_row();

/** RUT chileno válido (módulo 11). Acepta puntos y guion. */
create or replace function app.valid_rut(p_rut text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v text := upper(regexp_replace(coalesce(p_rut, ''), '[.\s-]', '', 'g'));
  v_body text;
  v_dv text;
  v_sum int := 0;
  v_mul int := 2;
  v_res int;
  i int;
begin
  if v !~ '^[0-9]{7,8}[0-9K]$' then
    return false;
  end if;
  v_body := left(v, length(v) - 1);
  v_dv := right(v, 1);
  for i in reverse length(v_body)..1 loop
    v_sum := v_sum + substr(v_body, i, 1)::int * v_mul;
    v_mul := case when v_mul = 7 then 2 else v_mul + 1 end;
  end loop;
  v_res := 11 - (v_sum % 11);
  return v_dv = case v_res when 11 then '0' when 10 then 'K' else v_res::text end;
end;
$$;

/** Guarda los datos de facturación validando lo que exige cada documento. Uso interno. */
create or replace function app.save_billing_profile(p_business_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_country text := upper(coalesce(nullif(trim(p ->> 'country'), ''), 'CL'));
  v_doc text := p ->> 'documentType';
  v_rut text := nullif(upper(regexp_replace(coalesce(p ->> 'taxId', ''), '[.\s]', '', 'g')), '');
begin
  if v_country = 'CL' and v_doc not in ('boleta', 'factura') then
    raise exception 'Elige boleta o factura' using errcode = 'P0001';
  end if;
  if v_country <> 'CL' then
    v_doc := 'exportacion';
    v_rut := nullif(trim(p ->> 'taxId'), '');
  elsif v_rut is not null and not app.valid_rut(v_rut) then
    raise exception 'El RUT no es válido' using errcode = 'P0001';
  end if;
  if coalesce(length(trim(p ->> 'legalName')), 0) < 2 then
    raise exception 'Indica el nombre o razón social' using errcode = 'P0001';
  end if;
  if coalesce(trim(p ->> 'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Indica un email válido para recibir los documentos' using errcode = 'P0001';
  end if;
  if v_doc = 'factura' and (v_rut is null or coalesce(trim(p ->> 'activity'), '') = '' or coalesce(trim(p ->> 'address'), '') = ''
                            or coalesce(trim(p ->> 'commune'), '') = '') then
    raise exception 'Para factura se necesitan RUT, razón social, giro, dirección y comuna' using errcode = 'P0001';
  end if;
  if v_doc = 'exportacion' and coalesce(trim(p ->> 'address'), '') = '' then
    raise exception 'Indica la dirección' using errcode = 'P0001';
  end if;
  -- RUT con guion antes del dígito verificador (12345678-5)
  if v_country = 'CL' and v_rut is not null then
    v_rut := regexp_replace(replace(v_rut, '-', ''), '^(.*)(.)$', '\1-\2');
  end if;
  insert into public.business_billing_profiles (business_id, document_type, country, tax_id, legal_name, activity, address,
                                                commune, city, email, updated_by)
  values (p_business_id, v_doc, v_country, v_rut, trim(p ->> 'legalName'), nullif(trim(p ->> 'activity'), ''),
          nullif(trim(p ->> 'address'), ''), nullif(trim(p ->> 'commune'), ''), nullif(trim(p ->> 'city'), ''),
          lower(trim(p ->> 'email')), app.current_user_id())
  on conflict (business_id) do update set
    document_type = excluded.document_type, country = excluded.country, tax_id = excluded.tax_id,
    legal_name = excluded.legal_name, activity = excluded.activity, address = excluded.address,
    commune = excluded.commune, city = excluded.city, email = excluded.email,
    updated_by = excluded.updated_by, updated_at = now();
end;
$$;
revoke all on function app.save_billing_profile(uuid, jsonb) from public;

/** El dueño del negocio guarda sus datos de facturación. */
create or replace function public.app_save_billing_profile(p_business_id uuid, p_profile jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.has_business_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'Solo el dueño del negocio puede cambiar los datos de facturación' using errcode = '42501';
  end if;
  perform app.save_billing_profile(p_business_id, p_profile);
end;
$$;

/** La plataforma también puede completarlos (a pedido del cliente). */
create or replace function public.app_admin_save_billing_profile(p_business_id uuid, p_profile jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_manager();
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  perform app.save_billing_profile(p_business_id, p_profile);
end;
$$;

/** 'ok' (con datos), 'grace' (sin datos, dentro del plazo) o 'blocked' (sin datos, plazo vencido). */
create or replace function app.billing_status(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from public.business_billing_profiles where business_id = b.id) then 'ok'
    when app.platform_today() <= b.billing_grace_until then 'grace'
    else 'blocked'
  end
  from public.businesses b where b.id = p_business_id;
$$;
revoke all on function app.billing_status(uuid) from public;

/** Puede recibir reservas: no está suspendido ni bloqueado por falta de datos de facturación. */
create or replace function app.business_can_operate(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not app.business_is_suspended(p_business_id) and coalesce(app.billing_status(p_business_id), 'ok') <> 'blocked';
$$;
revoke all on function app.business_can_operate(uuid) from public;

/** Estado de facturación para el panel (cualquier miembro ve el aviso; solo el dueño ve los datos). */
create or replace function public.app_business_billing(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean := app.has_business_role(p_business_id, array['owner']::public.membership_role[]);
begin
  if not app.is_business_member(p_business_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'status', app.billing_status(b.id), 'graceUntil', b.billing_grace_until, 'isOwner', v_owner,
      'profile', case when v_owner then (
        select jsonb_build_object('documentType', f.document_type, 'country', f.country, 'taxId', f.tax_id,
                                  'legalName', f.legal_name, 'activity', f.activity, 'address', f.address,
                                  'commune', f.commune, 'city', f.city, 'email', f.email, 'updatedAt', f.updated_at)
        from public.business_billing_profiles f where f.business_id = b.id) end,
      -- Para completar más rápido: datos ya ingresados en otro negocio del mismo dueño
      'suggestion', case when v_owner then (
        select jsonb_build_object('documentType', f.document_type, 'country', f.country, 'taxId', f.tax_id,
                                  'legalName', f.legal_name, 'activity', f.activity, 'address', f.address,
                                  'commune', f.commune, 'city', f.city, 'email', f.email, 'fromBusiness', ob.name)
        from public.business_billing_profiles f
        join public.businesses ob on ob.id = f.business_id
        join public.memberships m on m.business_id = ob.id and m.user_id = app.current_user_id() and m.role = 'owner'
        where ob.id <> b.id
        order by f.updated_at desc limit 1) end
    )
    from public.businesses b where b.id = p_business_id
  );
end;
$$;

/** Datos de facturación y estado de un negocio, para la consola. */
create or replace function public.app_admin_business_billing(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_admin();
  return (
    select jsonb_build_object(
      'status', app.billing_status(b.id), 'graceUntil', b.billing_grace_until,
      'profile', (select jsonb_build_object('documentType', f.document_type, 'country', f.country, 'taxId', f.tax_id,
                                            'legalName', f.legal_name, 'activity', f.activity, 'address', f.address,
                                            'commune', f.commune, 'city', f.city, 'email', f.email, 'updatedAt', f.updated_at)
                  from public.business_billing_profiles f where f.business_id = b.id),
      'freePlan', (select jsonb_build_object('endsOn', s.free_until, 'nextPlanCode', s.next_plan_code,
                                             'reason', g.reason, 'approvedAt', g.decided_at,
                                             'approvedBy', (select full_name from public.profiles where id = g.decided_by))
                   from public.business_subscriptions s join public.free_plan_grants g on g.id = s.free_grant_id
                   where s.business_id = b.id),
      'freeRequests', coalesce((
        select jsonb_agg(jsonb_build_object('id', g.id, 'planCode', g.plan_code, 'endsOn', g.ends_on, 'status', g.status,
                                            'reason', g.reason, 'createdAt', g.created_at,
                                            'requestedBy', (select full_name from public.profiles where id = g.requested_by))
                         order by g.created_at desc)
        from public.free_plan_grants g where g.business_id = b.id), '[]'::jsonb)
    )
    from public.businesses b where b.id = p_business_id
  );
end;
$$;

create or replace function public.app_admin_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_admin();
  return (select jsonb_build_object('billingGraceMinDays', billing_grace_min_days) from public.platform_settings);
end;
$$;

create or replace function public.app_admin_save_settings(p_billing_grace_min_days int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_owner();
  if p_billing_grace_min_days is null or p_billing_grace_min_days not between 0 and 90 then
    raise exception 'Los días de gracia deben estar entre 0 y 90' using errcode = 'P0001';
  end if;
  update public.platform_settings set billing_grace_min_days = p_billing_grace_min_days, updated_at = now();
end;
$$;

/** La consola puede dar más plazo a un negocio (por ejemplo, si el cliente lo pidió). */
create or replace function public.app_admin_extend_billing_grace(p_business_id uuid, p_until date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_manager();
  if p_until < app.platform_today() then
    raise exception 'La fecha no puede ser pasada' using errcode = 'P0001';
  end if;
  update public.businesses set billing_grace_until = p_until where id = p_business_id;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
end;
$$;

-- Sin datos de facturación y con el plazo vencido, el negocio no recibe reservas (las tomadas siguen)
select pg_temp.patch_function('public.app_public_business(text)'::regprocedure,
  'b.public_booking_enabled and b.suspended_at is null',
  'b.public_booking_enabled and b.suspended_at is null and app.business_can_operate(b.id)');
select pg_temp.patch_function('public.app_booking_context(uuid, uuid, timestamptz, timestamptz)'::regprocedure,
  E'  if not exists (select 1 from public.branches where id = p_branch_id and business_id = p_business_id and active) then',
  E'  if app.billing_status(p_business_id) = ''blocked'' then\n'
  || E'    raise exception ''Este negocio no está recibiendo reservas por ahora'' using errcode = ''P0001'';\n'
  || E'  end if;\n'
  || E'  if not exists (select 1 from public.branches where id = p_branch_id and business_id = p_business_id and active) then');
select pg_temp.patch_function('public.app_create_booking(uuid, uuid, jsonb, jsonb, jsonb, text)'::regprocedure,
  E'  v_rental := v_business.booking_mode = ''rental'';',
  E'  if app.billing_status(p_business_id) = ''blocked'' then\n'
  || E'    raise exception ''Este negocio no está recibiendo reservas por ahora'' using errcode = ''P0001'';\n'
  || E'  end if;\n'
  || E'  v_rental := v_business.booking_mode = ''rental'';');

-- La tarea programada también termina los planes free con fecha
CREATE OR REPLACE FUNCTION app.run_scheduled_tasks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_url text;
begin
  perform app.expire_pending_bookings();
  perform app.expire_feature_overrides();
  perform app.expire_free_plans();
  select value into v_url from app.settings where key = 'reminders_function_url';
  if v_url is not null and exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'select net.http_post(url := $1, body := ''{}''::jsonb, timeout_milliseconds := 30000)' using v_url;
  end if;
end;
$function$
;

-- Permisos ----------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.app_admin_team()',
    'public.app_admin_set_team_member(text, text)',
    'public.app_admin_remove_team_member(uuid)',
    'public.app_admin_save_plan(text, text, text, boolean, boolean, text[], jsonb, jsonb, text, boolean)',
    'public.app_admin_decide_plan_version(uuid, boolean, text)',
    'public.app_admin_request_free_plan(uuid, text, date, text, text)',
    'public.app_admin_decide_free_plan(uuid, boolean)',
    'public.app_admin_approvals()',
    'public.app_save_billing_profile(uuid, jsonb)',
    'public.app_admin_save_billing_profile(uuid, jsonb)',
    'public.app_business_billing(uuid)',
    'public.app_admin_business_billing(uuid)',
    'public.app_admin_settings()',
    'public.app_admin_save_settings(int)',
    'public.app_admin_extend_billing_grace(uuid, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function app.valid_rut(text) from public;
