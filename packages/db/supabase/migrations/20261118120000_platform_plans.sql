-- =============================================================================
-- Consola de la plataforma · A2: planes, empresas emisoras, impuestos y suscripciones (ADR 0009)
--
-- 1. Empresas que facturan (billing_entities) y reglas de impuesto por país del cliente (tax_rules):
--    documento, moneda del cobro y % de impuesto. Hoy: Chile → Chile en CLP con IVA 19%, y
--    Chile → resto del mundo en USD, exportación de servicios al 0%.
-- 2. Planes con versiones inmutables (features + precios netos por moneda). Editar un plan crea una
--    versión nueva; el administrador decide si pasa a los clientes de la versión anterior.
-- 3. Tramos de suscripción (subscription_periods) para prorratear: un cambio hecho el día D se cobra
--    desde D + 1. Los días suspendidos no se cobran.
-- 4. Funciones puntuales por negocio con fecha de término opcional; una tarea las vence.
-- 5. Suspensión (solo la plataforma): bloquea el link público y las reservas nuevas.
-- 6. El negocio elige su plan al crearse.
-- =============================================================================

-- 1. Empresas emisoras e impuestos ---------------------------------------------------
create table public.billing_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  country text not null check (country ~ '^[A-Z]{2}$'),
  tax_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  billing_entity_id uuid not null references public.billing_entities (id) on delete cascade,
  -- País del cliente; null = cualquier otro país
  client_country text check (client_country ~ '^[A-Z]{2}$'),
  currency text not null check (currency in ('CLP', 'USD')),
  document_type text not null check (document_type in ('boleta_o_factura', 'boleta', 'factura', 'factura_exportacion', 'otro')),
  tax_rate_bp int not null check (tax_rate_bp between 0 and 10000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index tax_rules_country_idx on public.tax_rules (billing_entity_id, coalesce(client_country, '*'));

alter table public.billing_entities enable row level security;
alter table public.tax_rules enable row level security;
revoke insert, update, delete on public.billing_entities, public.tax_rules from anon, authenticated;

-- La emisora inicial: el dueño completa nombre y RUT desde /admin
insert into public.billing_entities (name, country) values ('Mi empresa en Chile', 'CL');
insert into public.tax_rules (billing_entity_id, client_country, currency, document_type, tax_rate_bp)
select id, 'CL', 'CLP', 'boleta_o_factura', 1900 from public.billing_entities
union all
select id, null, 'USD', 'factura_exportacion', 0 from public.billing_entities;

/** Condiciones de cobro para un país: emisora, regla (moneda, documento, impuesto). */
create or replace function app.billing_terms(p_country text)
returns public.tax_rules
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.* from public.tax_rules r
  join public.billing_entities e on e.id = r.billing_entity_id and e.active
  where r.active and (r.client_country = p_country or r.client_country is null)
  order by (r.client_country is null), e.created_at
  limit 1;
$$;
revoke all on function app.billing_terms(text) from public;

-- Fecha de la plataforma (los tramos de cobro se cuentan en días calendario de Chile)
create or replace function app.platform_today()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Santiago')::date $$;

-- 2. Planes y versiones ---------------------------------------------------------------
alter table public.plans
  add column active boolean not null default true,
  add column sort_order int not null default 0,
  -- Países donde se ofrece; vacío = en todos
  add column offered_countries text[] not null default '{}';
comment on column public.plans.is_public is 'Se ofrece a los negocios nuevos al registrarse.';
comment on column public.plans.active is 'false = archivado: no se ofrece ni se asigna, pero lo conservan quienes lo tienen.';

create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null references public.plans (code) on delete cascade,
  version int not null check (version >= 1),
  -- [{feature, enabled, limit}] (limit null = sin límite)
  features jsonb not null check (jsonb_typeof(features) = 'array'),
  -- Precio neto mensual por moneda de cobro, en su unidad mínima: {"CLP": 15000, "USD": 1700}
  prices jsonb not null default '{}'::jsonb check (jsonb_typeof(prices) = 'object'),
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (plan_code, version)
);
alter table public.plan_versions enable row level security;
revoke insert, update, delete on public.plan_versions from anon, authenticated;

alter table public.plans add column current_version_id uuid references public.plan_versions (id);

-- Versión 1 de los planes existentes (sin precio: se carga desde /admin)
insert into public.plan_versions (plan_code, version, features)
select p.code, 1, coalesce((
  select jsonb_agg(jsonb_build_object('feature', pf.feature, 'enabled', pf.enabled, 'limit', pf.limit_value) order by pf.feature)
  from public.plan_features pf where pf.plan_code = p.code), '[]'::jsonb)
from public.plans p;
update public.plans p set current_version_id = v.id from public.plan_versions v where v.plan_code = p.code and v.version = 1;
update public.plans set sort_order = case code when 'base' then 1 when 'completo' then 99 else 50 end;

-- 3. Suscripciones y tramos -----------------------------------------------------------
alter table public.business_subscriptions
  add column plan_version_id uuid references public.plan_versions (id),
  add column billing_entity_id uuid references public.billing_entities (id),
  add column currency text check (currency in ('CLP', 'USD'));

update public.business_subscriptions s
set plan_version_id = p.current_version_id,
    billing_entity_id = (app.billing_terms(b.country)).billing_entity_id,
    currency = (app.billing_terms(b.country)).currency
from public.plans p, public.businesses b
where p.code = s.plan_code and b.id = s.business_id;

alter table public.business_subscriptions
  alter column plan_version_id set not null,
  alter column currency set not null;

create table public.subscription_periods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('plan', 'suspended')),
  plan_version_id uuid references public.plan_versions (id),
  currency text not null check (currency in ('CLP', 'USD')),
  -- Precio neto mensual al abrir el tramo; null = el plan aún no tiene precio en esa moneda
  monthly_net int check (monthly_net >= 0),
  starts_on date not null,
  ends_on date,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check ((kind = 'plan') = (plan_version_id is not null))
);
create index subscription_periods_business_idx on public.subscription_periods (business_id, starts_on);
-- Un solo tramo abierto por negocio
create unique index subscription_periods_open_idx on public.subscription_periods (business_id) where ends_on is null;

insert into public.subscription_periods (business_id, kind, plan_version_id, currency, monthly_net, starts_on, note)
select s.business_id, 'plan', s.plan_version_id, s.currency,
       (v.prices ->> s.currency)::int, (s.started_at at time zone 'America/Santiago')::date, 'Alta'
from public.business_subscriptions s join public.plan_versions v on v.id = s.plan_version_id;

alter table public.subscription_periods enable row level security;
create policy subscription_periods_read on public.subscription_periods for select to authenticated
  using (app.can_manage_business(business_id));
revoke insert, update, delete on public.subscription_periods from anon, authenticated;

-- 4. Funciones puntuales por negocio -----------------------------------------------------
create table public.business_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  feature text not null,
  enabled boolean not null,
  limit_value int check (limit_value is null or limit_value >= 0),
  expires_at timestamptz,
  ended_at timestamptz,
  note text not null check (length(trim(note)) between 3 and 300),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index feature_overrides_business_idx on public.business_feature_overrides (business_id) where ended_at is null;
alter table public.business_feature_overrides enable row level security;
create policy feature_overrides_read on public.business_feature_overrides for select to authenticated
  using (app.is_business_member(business_id));
revoke insert, update, delete on public.business_feature_overrides from anon, authenticated;

-- 5. Suspensión ----------------------------------------------------------------------------
alter table public.businesses
  add column suspended_at timestamptz,
  add column suspension_reason text;

create or replace function app.business_is_suspended(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce((select suspended_at is not null from public.businesses where id = p_business_id), false) $$;
revoke all on function app.business_is_suspended(uuid) from public;

-- Auditoría
create trigger subscription_periods_audit after insert or update or delete on public.subscription_periods
  for each row execute function app.audit_row();
create trigger feature_overrides_audit after insert or update or delete on public.business_feature_overrides
  for each row execute function app.audit_row();

-- 6. Derechos efectivos: versión del plan + funciones puntuales vigentes -----------------------
create or replace function app.refresh_entitlements(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.business_entitlements where business_id = p_business_id;
  insert into public.business_entitlements (business_id, feature, enabled, limit_value, source)
  select p_business_id, f ->> 'feature', coalesce((f ->> 'enabled')::boolean, false), (f ->> 'limit')::int, 'plan'
  from public.business_subscriptions s
  join public.plan_versions v on v.id = s.plan_version_id
  cross join jsonb_array_elements(v.features) f
  where s.business_id = p_business_id;
  -- La función puntual más reciente de cada tipo reemplaza a la del plan
  insert into public.business_entitlements (business_id, feature, enabled, limit_value, source)
  select distinct on (o.feature) p_business_id, o.feature, o.enabled, o.limit_value, 'manual'
  from public.business_feature_overrides o
  where o.business_id = p_business_id and o.ended_at is null and (o.expires_at is null or o.expires_at > now())
  order by o.feature, o.created_at desc
  on conflict (business_id, feature) do update
    set enabled = excluded.enabled, limit_value = excluded.limit_value, source = 'manual';
end;
$$;
revoke all on function app.refresh_entitlements(uuid) from public;

/** Vence las funciones puntuales cuya fecha pasó (lo llama la tarea programada). */
create or replace function app.expire_feature_overrides()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
  v_count int := 0;
begin
  for v_business in
    update public.business_feature_overrides set ended_at = expires_at
    where ended_at is null and expires_at is not null and expires_at <= now()
    returning business_id
  loop
    perform app.refresh_entitlements(v_business);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function app.expire_feature_overrides() from public;

/**
 * Cierra el tramo abierto (hoy incluido) y abre otro desde mañana. Si ya hay un tramo que empieza
 * mañana (otro cambio hecho hoy), se reemplaza en vez de crear uno vacío.
 */
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
    select (prices ->> p_currency)::int into v_price from public.plan_versions where id = p_plan_version_id;
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

-- 7. Funciones de la consola (solo administradores de la plataforma) ----------------------------
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
      'sortOrder', p.sort_order, 'offeredCountries', to_jsonb(p.offered_countries), 'currentVersionId', p.current_version_id,
      'versions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id, 'version', v.version, 'features', v.features, 'prices', v.prices, 'note', v.note, 'createdAt', v.created_at,
          'businesses', (select count(*) from public.business_subscriptions s where s.plan_version_id = v.id)
        ) order by v.version desc)
        from public.plan_versions v where v.plan_code = p.code), '[]'::jsonb)
    ) order by p.active desc, p.sort_order, p.name)
    from public.plans p
  ), '[]'::jsonb);
end;
$$;

/**
 * Crea o edita un plan. Si cambian las funciones o los precios se crea una versión nueva, que se
 * aplica a los negocios que lo contraten desde ahora. Quienes tienen la anterior no cambian hasta
 * que el administrador decida pasarlos (app_admin_migrate_plan_version).
 */
create or replace function public.app_admin_save_plan(
  p_code text, p_name text, p_description text, p_is_public boolean, p_active boolean,
  p_offered_countries text[], p_features jsonb, p_prices jsonb, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan public.plans;
  v_current public.plan_versions;
  v_version_id uuid;
  v_next int;
begin
  perform app.require_platform_admin();
  if p_code !~ '^[a-z][a-z0-9_]{1,30}$' then
    raise exception 'El código del plan debe tener letras minúsculas, números o guion bajo' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Indica el nombre del plan' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_features) <> 'array' or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'Funciones o precios no válidos' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_each(p_prices) e where e.key not in ('CLP', 'USD') or jsonb_typeof(e.value) <> 'number' or (e.value)::numeric < 0
             or (e.value)::numeric <> floor((e.value)::numeric)) then
    raise exception 'Los precios deben ser montos enteros no negativos en CLP o USD' using errcode = 'P0001';
  end if;

  select * into v_plan from public.plans where code = p_code for update;
  if not found then
    insert into public.plans (code, name, description, is_public, active, offered_countries, sort_order)
    values (p_code, trim(p_name), nullif(trim(p_description), ''), p_is_public, p_active, coalesce(p_offered_countries, '{}'),
            (select coalesce(max(sort_order), 0) + 1 from public.plans))
    returning * into v_plan;
  else
    update public.plans set name = trim(p_name), description = nullif(trim(p_description), ''), is_public = p_is_public,
      active = p_active, offered_countries = coalesce(p_offered_countries, '{}')
    where code = p_code;
  end if;

  select * into v_current from public.plan_versions where id = v_plan.current_version_id;
  if found and v_current.features = p_features and v_current.prices = p_prices then
    return v_current.id;
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.plan_versions where plan_code = p_code;
  insert into public.plan_versions (plan_code, version, features, prices, note, created_by)
  values (p_code, v_next, p_features, p_prices, nullif(trim(p_note), ''), app.current_user_id())
  returning id into v_version_id;
  update public.plans set current_version_id = v_version_id where code = p_code;

  -- Espejo de compatibilidad: plan_features refleja la versión vigente
  delete from public.plan_features where plan_code = p_code;
  insert into public.plan_features (plan_code, feature, enabled, limit_value)
  select p_code, f ->> 'feature', coalesce((f ->> 'enabled')::boolean, false), (f ->> 'limit')::int
  from jsonb_array_elements(p_features) f;
  return v_version_id;
end;
$$;

/** Pasa a la versión vigente a todos los negocios de una versión anterior (decisión del administrador). */
create or replace function public.app_admin_migrate_plan_version(p_from_version_id uuid, p_note text default null)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from public.plan_versions;
  v_target uuid;
  v_sub public.business_subscriptions;
  v_count int := 0;
begin
  perform app.require_platform_admin();
  select * into v_from from public.plan_versions where id = p_from_version_id;
  if not found then
    raise exception 'Versión no encontrada' using errcode = 'P0001';
  end if;
  select current_version_id into v_target from public.plans where code = v_from.plan_code;
  if v_target = p_from_version_id then
    raise exception 'Esa ya es la versión vigente' using errcode = 'P0001';
  end if;
  for v_sub in select * from public.business_subscriptions where plan_version_id = p_from_version_id for update loop
    update public.business_subscriptions set plan_version_id = v_target where business_id = v_sub.business_id;
    if not app.business_is_suspended(v_sub.business_id) then
      perform app.open_subscription_period(v_sub.business_id, 'plan', v_target, v_sub.currency,
        coalesce(nullif(trim(p_note), ''), 'Paso a la versión vigente del plan'));
    end if;
    perform app.refresh_entitlements(v_sub.business_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

/** Cambia el plan de un negocio. Las funciones cambian ya; el cobro, desde mañana. */
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
  perform app.require_platform_admin();
  select * into v_plan from public.plans where code = p_plan_code and active;
  if not found then
    raise exception 'Plan no disponible' using errcode = 'P0001';
  end if;
  select * into v_sub from public.business_subscriptions where business_id = p_business_id for update;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  if v_sub.plan_version_id = v_plan.current_version_id then
    raise exception 'El negocio ya tiene ese plan' using errcode = 'P0001';
  end if;
  update public.business_subscriptions set plan_code = p_plan_code, plan_version_id = v_plan.current_version_id
  where business_id = p_business_id;
  if not app.business_is_suspended(p_business_id) then
    perform app.open_subscription_period(p_business_id, 'plan', v_plan.current_version_id, v_sub.currency,
      coalesce(nullif(trim(p_note), ''), 'Cambio a ' || v_plan.name));
  end if;
  perform app.refresh_entitlements(p_business_id);
end;
$$;

create or replace function public.app_admin_add_override(
  p_business_id uuid, p_feature text, p_enabled boolean, p_limit int, p_expires_at timestamptz, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform app.require_platform_admin();
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'La fecha de término debe ser futura' using errcode = 'P0001';
  end if;
  insert into public.business_feature_overrides (business_id, feature, enabled, limit_value, expires_at, note, created_by)
  values (p_business_id, p_feature, p_enabled, p_limit, p_expires_at, trim(p_note), app.current_user_id())
  returning id into v_id;
  perform app.refresh_entitlements(p_business_id);
  return v_id;
end;
$$;

create or replace function public.app_admin_end_override(p_override_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
begin
  perform app.require_platform_admin();
  update public.business_feature_overrides set ended_at = now()
  where id = p_override_id and ended_at is null
  returning business_id into v_business;
  if v_business is null then
    raise exception 'Esa función puntual ya terminó' using errcode = 'P0001';
  end if;
  perform app.refresh_entitlements(v_business);
end;
$$;

create or replace function public.app_admin_suspend(p_business_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.business_subscriptions;
begin
  perform app.require_platform_admin();
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Indica el motivo de la suspensión' using errcode = 'P0001';
  end if;
  if app.business_is_suspended(p_business_id) then
    raise exception 'El negocio ya está suspendido' using errcode = 'P0001';
  end if;
  update public.businesses set suspended_at = now(), suspension_reason = trim(p_reason) where id = p_business_id;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  select * into v_sub from public.business_subscriptions where business_id = p_business_id;
  perform app.open_subscription_period(p_business_id, 'suspended', null, v_sub.currency, 'Suspendido: ' || trim(p_reason));
end;
$$;

create or replace function public.app_admin_reactivate(p_business_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.business_subscriptions;
begin
  perform app.require_platform_admin();
  if not app.business_is_suspended(p_business_id) then
    raise exception 'El negocio no está suspendido' using errcode = 'P0001';
  end if;
  update public.businesses set suspended_at = null, suspension_reason = null where id = p_business_id;
  select * into v_sub from public.business_subscriptions where business_id = p_business_id;
  perform app.open_subscription_period(p_business_id, 'plan', v_sub.plan_version_id, v_sub.currency,
    coalesce(nullif(trim(p_note), ''), 'Reactivado'));
end;
$$;

/** Plan, cobro y funciones de un negocio, para su ficha en la consola. */
create or replace function public.app_admin_business_plan(p_business_id uuid)
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
      'businessId', b.id, 'country', b.country,
      'suspendedAt', b.suspended_at, 'suspensionReason', b.suspension_reason,
      'subscription', jsonb_build_object(
        'planCode', s.plan_code, 'planName', p.name, 'version', v.version, 'versionId', v.id,
        'currentVersionId', p.current_version_id, 'currency', s.currency, 'startedAt', s.started_at,
        'monthlyNet', (v.prices ->> s.currency)::int, 'features', v.features),
      'billing', (select jsonb_build_object('entityName', e.name, 'documentType', r.document_type, 'taxRateBp', r.tax_rate_bp)
                  from public.billing_entities e
                  left join public.tax_rules r on r.billing_entity_id = e.id and r.active
                    and (r.client_country = b.country or r.client_country is null)
                  where e.id = s.billing_entity_id
                  order by (r.client_country is null) limit 1),
      'periods', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sp.id, 'kind', sp.kind, 'planName', pp.name, 'version', pv.version, 'currency', sp.currency,
          'monthlyNet', sp.monthly_net, 'startsOn', sp.starts_on, 'endsOn', sp.ends_on, 'note', sp.note, 'createdAt', sp.created_at
        ) order by sp.starts_on, sp.created_at)
        from public.subscription_periods sp
        left join public.plan_versions pv on pv.id = sp.plan_version_id
        left join public.plans pp on pp.code = pv.plan_code
        where sp.business_id = b.id), '[]'::jsonb),
      'overrides', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o.id, 'feature', o.feature, 'enabled', o.enabled, 'limit', o.limit_value, 'expiresAt', o.expires_at,
          'endedAt', o.ended_at, 'note', o.note, 'createdAt', o.created_at
        ) order by o.created_at desc)
        from public.business_feature_overrides o where o.business_id = b.id), '[]'::jsonb),
      'entitlements', coalesce((
        select jsonb_agg(jsonb_build_object('feature', e.feature, 'enabled', e.enabled, 'limit', e.limit_value, 'source', e.source) order by e.feature)
        from public.business_entitlements e where e.business_id = b.id), '[]'::jsonb),
      'usage', jsonb_build_object(
        'branches', (select count(*) from public.branches br where br.business_id = b.id),
        'resources', (select count(*) from public.resources r where r.business_id = b.id))
    )
    from public.businesses b
    join public.business_subscriptions s on s.business_id = b.id
    join public.plan_versions v on v.id = s.plan_version_id
    join public.plans p on p.code = s.plan_code
    where b.id = p_business_id
  );
end;
$$;

create or replace function public.app_admin_billing_setup()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_admin();
  return jsonb_build_object(
    'entities', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'country', e.country, 'taxId', e.tax_id, 'active', e.active) order by e.created_at)
                          from public.billing_entities e), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'entityId', r.billing_entity_id, 'clientCountry', r.client_country,
                                                          'currency', r.currency, 'documentType', r.document_type, 'taxRateBp', r.tax_rate_bp, 'active', r.active)
                                        order by r.billing_entity_id, r.client_country nulls last)
                       from public.tax_rules r), '[]'::jsonb)
  );
end;
$$;

create or replace function public.app_admin_save_billing_entity(p_id uuid, p_name text, p_tax_id text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_admin();
  update public.billing_entities set name = trim(p_name), tax_id = nullif(trim(p_tax_id), ''), active = p_active where id = p_id;
  if not found then
    raise exception 'Empresa no encontrada' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.app_admin_save_tax_rule(
  p_id uuid, p_currency text, p_document_type text, p_tax_rate_bp int, p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_admin();
  update public.tax_rules set currency = p_currency, document_type = p_document_type, tax_rate_bp = p_tax_rate_bp, active = p_active
  where id = p_id;
  if not found then
    raise exception 'Regla no encontrada' using errcode = 'P0001';
  end if;
end;
$$;

-- 8. Para los negocios: planes que se pueden contratar en un país, con su impuesto ----------------
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
      where p.active and p.is_public
        and (cardinality(p.offered_countries) = 0 or p_country = any (p.offered_countries))), '[]'::jsonb)
  )
  from (select * from app.billing_terms(p_country)) t;
$$;

/** Plan del propio negocio (página Plan del panel). */
create or replace function public.app_my_plan(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_business_member(p_business_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'planName', p.name, 'description', p.description, 'version', v.version, 'currency', s.currency,
      'monthlyNet', (v.prices ->> s.currency)::int, 'status', s.status, 'startedAt', s.started_at,
      'taxRateBp', (app.billing_terms(b.country)).tax_rate_bp,
      'suspendedAt', b.suspended_at, 'suspensionReason', b.suspension_reason,
      'overrides', coalesce((
        select jsonb_agg(jsonb_build_object('feature', o.feature, 'enabled', o.enabled, 'limit', o.limit_value, 'expiresAt', o.expires_at, 'note', o.note))
        from public.business_feature_overrides o
        where o.business_id = b.id and o.ended_at is null and (o.expires_at is null or o.expires_at > now())), '[]'::jsonb)
    )
    from public.businesses b
    join public.business_subscriptions s on s.business_id = b.id
    join public.plan_versions v on v.id = s.plan_version_id
    join public.plans p on p.code = s.plan_code
    where b.id = p_business_id
  );
end;
$$;

-- 9. Funciones existentes que cambian ---------------------------------------------------------
drop function public.app_create_business(text, text, text, text, text, text);
CREATE FUNCTION public.app_create_business(p_business_name text, p_industry_code text, p_branch_name text, p_branch_address text DEFAULT NULL::text, p_branch_commune text DEFAULT NULL::text, p_timezone text DEFAULT 'America/Santiago'::text, p_plan_code text DEFAULT 'base'::text)
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
  v_plan public.plans;
  v_terms public.tax_rules;
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

  -- El negocio elige su plan al crearse (ADR 0009): debe estar a la venta en su país (por ahora, Chile)
  select * into v_plan from public.plans
  where code = coalesce(p_plan_code, 'base') and active and is_public
    and (cardinality(offered_countries) = 0 or 'CL' = any (offered_countries));
  if not found then
    raise exception 'Ese plan no está disponible' using errcode = 'P0001';
  end if;
  v_terms := app.billing_terms('CL');
  if v_terms.id is null then
    raise exception 'No hay condiciones de cobro configuradas para este país' using errcode = 'P0001';
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

  -- Suscripción al plan elegido (versión vigente) y primer tramo de cobro desde hoy
  insert into public.business_subscriptions (business_id, plan_code, plan_version_id, billing_entity_id, currency)
  values (v_business, v_plan.code, v_plan.current_version_id, v_terms.billing_entity_id, v_terms.currency);
  insert into public.subscription_periods (business_id, kind, plan_version_id, currency, monthly_net, starts_on, note, created_by)
  select v_business, 'plan', v.id, v_terms.currency, (v.prices ->> v_terms.currency)::int, app.platform_today(), 'Alta', v_user
  from public.plan_versions v where v.id = v_plan.current_version_id;
  perform app.refresh_entitlements(v_business);

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
revoke all on function public.app_create_business(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.app_create_business(text, text, text, text, text, text, text) to authenticated, service_role;

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
  where b.slug = p_slug and b.public_booking_enabled and b.suspended_at is null;
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
  if v_business.suspended_at is not null then
    raise exception 'Este negocio está suspendido y no recibe reservas por ahora' using errcode = 'P0001';
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
  if v_business.suspended_at is not null then
    raise exception 'Este negocio está suspendido y no recibe reservas por ahora' using errcode = 'P0001';
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
  select value into v_url from app.settings where key = 'reminders_function_url';
  if v_url is not null and exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'select net.http_post(url := $1, body := ''{}''::jsonb, timeout_milliseconds := 30000)' using v_url;
  end if;
end;
$function$
;

-- La lista de clientes muestra si un negocio está suspendido
CREATE OR REPLACE FUNCTION public.app_admin_clients(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform app.require_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'createdAt', o.created_at,
      'owner', jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'phone', p.phone),
      'businesses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'name', b.name, 'slug', b.slug, 'createdAt', b.created_at,
          'industry', t.name, 'bookingMode', b.booking_mode,
          'planCode', s.plan_code, 'planName', pl.name, 'subscriptionStatus', s.status,
          'publicBookingEnabled', b.public_booking_enabled, 'suspendedAt', b.suspended_at,
          'bookings30d', (select count(*) from public.bookings bk
                          where bk.business_id = b.id and bk.created_at > now() - interval '30 days'
                            and bk.status <> 'cancelled'),
          'members', (select count(*) from public.memberships m where m.business_id = b.id),
          'support', (select jsonb_build_object('id', r.id, 'status', r.status, 'expiresAt', r.expires_at, 'createdAt', r.created_at)
                      from public.support_access_requests r
                      where r.business_id = b.id and r.requested_by = app.current_user_id()
                      order by r.created_at desc limit 1)
        ) order by b.created_at)
        from public.businesses b
        join public.industry_templates t on t.code = b.industry_code
        left join public.business_subscriptions s on s.business_id = b.id
        left join public.plans pl on pl.code = s.plan_code
        where b.organization_id = o.id), '[]'::jsonb)
    ) order by o.created_at desc)
    from public.organizations o
    join public.profiles p on p.id = o.owner_user_id
    where p_organization_id is null or o.id = p_organization_id
  ), '[]'::jsonb);
end;
$function$
;

-- Permisos ----------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.app_admin_plans()',
    'public.app_admin_save_plan(text, text, text, boolean, boolean, text[], jsonb, jsonb, text)',
    'public.app_admin_migrate_plan_version(uuid, text)',
    'public.app_admin_change_plan(uuid, text, text)',
    'public.app_admin_add_override(uuid, text, boolean, int, timestamptz, text)',
    'public.app_admin_end_override(uuid)',
    'public.app_admin_suspend(uuid, text)',
    'public.app_admin_reactivate(uuid, text)',
    'public.app_admin_business_plan(uuid)',
    'public.app_admin_billing_setup()',
    'public.app_admin_save_billing_entity(uuid, text, text, boolean)',
    'public.app_admin_save_tax_rule(uuid, text, text, int, boolean)',
    'public.app_public_plans(text)',
    'public.app_my_plan(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
