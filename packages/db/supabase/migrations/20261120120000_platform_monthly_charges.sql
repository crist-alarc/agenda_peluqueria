-- =============================================================================
-- Consola de la plataforma · A3b (ADR 0011): cobros mensuales a los clientes
--
-- 1. Cada versión de plan define sucursales incluidas, precio por sucursal adicional y días de prueba.
-- 2. branch_activity: desde y hasta qué día estuvo activa cada sucursal (se cobra por días de uso).
-- 3. Período de prueba al crear el negocio (tramo 'trial', no se cobra); cualquier cambio lo termina.
-- 4. Plazos y formas de pago configurables; cada negocio tiene los suyos (o los por defecto).
-- 5. Cobros a mes vencido: por facturar → facturado (folio SII) → pagado, o anulado. Un cobro
--    facturado no se modifica (lo impide la base). Alertas de no pago.
-- =============================================================================

create or replace function pg_temp.patch_function(p_fn regprocedure, p_old text, p_new text)
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

-- 1. Condiciones de cada versión de plan ---------------------------------------------------
alter table public.plan_versions
  add column included_branches int not null default 1 check (included_branches between 1 and 1000),
  -- Precio neto mensual por sucursal adicional, por moneda: {"CLP": 9300}
  add column extra_branch_prices jsonb not null default '{}'::jsonb check (jsonb_typeof(extra_branch_prices) = 'object'),
  add column trial_days int not null default 0 check (trial_days between 0 and 365);

drop function public.app_admin_save_plan(text, text, text, boolean, boolean, text[], jsonb, jsonb, text, boolean);
create function public.app_admin_save_plan(
  p_code text, p_name text, p_description text, p_is_public boolean, p_active boolean,
  p_offered_countries text[], p_features jsonb, p_prices jsonb, p_note text default null, p_is_free boolean default false,
  p_included_branches int default 1, p_extra_branch_prices jsonb default '{}'::jsonb, p_trial_days int default 0
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
  v_extra jsonb := case when p_is_free then '{}'::jsonb else coalesce(p_extra_branch_prices, '{}'::jsonb) end;
  v_trial int := case when p_is_free then 0 else coalesce(p_trial_days, 0) end;
  v_included int := coalesce(p_included_branches, 1);
begin
  perform app.require_platform_manager();
  v_owner := app.platform_role() = 'owner';
  if p_code !~ '^[a-z][a-z0-9_]{1,30}$' then
    raise exception 'El código del plan debe tener letras minúsculas, números o guion bajo' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Indica el nombre del plan' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_features) <> 'array' or jsonb_typeof(p_prices) <> 'object' or jsonb_typeof(v_extra) <> 'object' then
    raise exception 'Funciones o precios no válidos' using errcode = 'P0001';
  end if;
  if exists (select 1 from (select * from jsonb_each(v_prices) union all select * from jsonb_each(v_extra)) e
             where e.key not in ('CLP', 'USD') or jsonb_typeof(e.value) <> 'number' or (e.value)::numeric < 0
               or (e.value)::numeric <> floor((e.value)::numeric)) then
    raise exception 'Los precios deben ser montos enteros no negativos en CLP o USD' using errcode = 'P0001';
  end if;
  if v_included not between 1 and 1000 or v_trial not between 0 and 365 then
    raise exception 'Sucursales incluidas (desde 1) o días de prueba (0 a 365) no válidos' using errcode = 'P0001';
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
  if found and v_current.features = p_features and v_current.prices = v_prices and v_current.extra_branch_prices = v_extra
     and v_current.included_branches = v_included and v_current.trial_days = v_trial then
    if v_owner then
      update public.plan_versions set status = 'rejected', decided_by = app.current_user_id(), decided_at = now(),
        decision_note = 'Reemplazada por el dueño'
      where plan_code = p_code and status = 'pending';
    end if;
    return v_current.id;
  end if;

  select * into v_pending from public.plan_versions where plan_code = p_code and status = 'pending' for update;
  if found and not v_owner then
    update public.plan_versions set features = p_features, prices = v_prices, extra_branch_prices = v_extra,
      included_branches = v_included, trial_days = v_trial, note = nullif(trim(p_note), ''),
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
  insert into public.plan_versions (plan_code, version, features, prices, extra_branch_prices, included_branches, trial_days,
                                    note, created_by, status, decided_by, decided_at)
  values (p_code, v_next, p_features, v_prices, v_extra, v_included, v_trial, nullif(trim(p_note), ''), app.current_user_id(),
          case when v_owner then 'approved' else 'pending' end,
          case when v_owner then app.current_user_id() end, case when v_owner then now() end)
  returning id into v_version_id;
  if v_owner then
    perform app.publish_plan_version(v_version_id);
  end if;
  return v_version_id;
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
          'includedBranches', v.included_branches, 'extraBranchPrices', v.extra_branch_prices, 'trialDays', v.trial_days,
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
        'includedBranches', v.included_branches, 'extraBranchPrices', v.extra_branch_prices, 'trialDays', v.trial_days,
        'createdBy', (select full_name from public.profiles where id = v.created_by),
        'currentFeatures', cv.features, 'currentPrices', cv.prices, 'currentIncludedBranches', cv.included_branches,
        'currentExtraBranchPrices', cv.extra_branch_prices, 'currentTrialDays', cv.trial_days
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
        'features', v.features, 'monthlyNet', (v.prices ->> t.currency)::int,
        'includedBranches', v.included_branches, 'extraBranchNet', (v.extra_branch_prices ->> t.currency)::int,
        'trialDays', v.trial_days
      ) order by p.sort_order, p.name)
      from public.plans p join public.plan_versions v on v.id = p.current_version_id
      where p.active and p.is_public and not p.is_free
        and (cardinality(p.offered_countries) = 0 or p_country = any (p.offered_countries))), '[]'::jsonb)
  )
  from (select * from app.billing_terms(p_country)) t;
$$;

-- 2. Días de uso de cada sucursal ---------------------------------------------------------------
create table public.branch_activity (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Si se borra la sucursal, su historial de uso se conserva para el cobro
  branch_id uuid references public.branches (id) on delete set null,
  starts_on date not null,
  ends_on date,
  check (ends_on is null or ends_on >= starts_on)
);
create index branch_activity_business_idx on public.branch_activity (business_id, starts_on);
create unique index branch_activity_open_idx on public.branch_activity (branch_id) where ends_on is null;
alter table public.branch_activity enable row level security;
revoke insert, update, delete on public.branch_activity from anon, authenticated;

insert into public.branch_activity (business_id, branch_id, starts_on)
select business_id, id, (created_at at time zone 'America/Santiago')::date from public.branches where active;

/** Registra la apertura y el cierre de cada sucursal (el día de hoy cuenta en ambos casos). */
create or replace function app.track_branch_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := app.platform_today();
begin
  if tg_op = 'DELETE' then
    update public.branch_activity set ends_on = greatest(starts_on, v_today) where branch_id = old.id and ends_on is null;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.active then
      insert into public.branch_activity (business_id, branch_id, starts_on) values (new.business_id, new.id, v_today);
    end if;
    return new;
  end if;
  if old.active and not new.active then
    update public.branch_activity set ends_on = greatest(starts_on, v_today) where branch_id = new.id and ends_on is null;
  elsif not old.active and new.active then
    -- Reabierta el mismo día en que se cerró: sigue el mismo tramo
    update public.branch_activity set ends_on = null where branch_id = new.id and ends_on = v_today;
    if not found then
      insert into public.branch_activity (business_id, branch_id, starts_on) values (new.business_id, new.id, v_today);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.track_branch_activity() from public;

create trigger branches_activity_insert after insert on public.branches for each row execute function app.track_branch_activity();
create trigger branches_activity_update after update of active on public.branches for each row execute function app.track_branch_activity();
create trigger branches_activity_delete before delete on public.branches for each row execute function app.track_branch_activity();

-- 3. Período de prueba ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.subscription_periods'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'
  loop
    execute format('alter table public.subscription_periods drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.subscription_periods
  add constraint subscription_periods_kind_check check (kind in ('plan', 'suspended', 'trial')),
  add constraint subscription_periods_version_check check ((kind in ('plan', 'trial')) = (plan_version_id is not null));

-- Al crear el negocio: si el plan tiene prueba, primero el tramo de prueba y luego el plan
select pg_temp.patch_function(
  'public.app_create_business(text, text, text, text, text, text, text)'::regprocedure,
  E'  insert into public.subscription_periods (business_id, kind, plan_version_id, currency, monthly_net, starts_on, note, created_by)\n'
  || E'  select v_business, ''plan'', v.id, v_terms.currency, (v.prices ->> v_terms.currency)::int, app.platform_today(), ''Alta'', v_user\n'
  || E'  from public.plan_versions v where v.id = v_plan.current_version_id;',
  E'  insert into public.subscription_periods (business_id, kind, plan_version_id, currency, monthly_net, starts_on, ends_on, note, created_by)\n'
  || E'  select v_business, ''trial'', v.id, v_terms.currency, 0, app.platform_today(), app.platform_today() + v.trial_days - 1,\n'
  || E'         ''Prueba de '' || v.trial_days || '' días'', v_user\n'
  || E'  from public.plan_versions v where v.id = v_plan.current_version_id and v.trial_days > 0;\n'
  || E'  insert into public.subscription_periods (business_id, kind, plan_version_id, currency, monthly_net, starts_on, note, created_by)\n'
  || E'  select v_business, ''plan'', v.id, v_terms.currency, (v.prices ->> v_terms.currency)::int, app.platform_today() + v.trial_days, ''Alta'', v_user\n'
  || E'  from public.plan_versions v where v.id = v_plan.current_version_id;');

/**
 * Cierra el tramo vigente (hoy incluido) y abre otro desde mañana. Si queda prueba por delante, se
 * termina hoy: cualquier cambio de plan, suspensión o versión termina la prueba (ADR 0011).
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
    select case when p.is_free then 0 else (v.prices ->> p_currency)::int end into v_price
    from public.plan_versions v join public.plans p on p.code = v.plan_code where v.id = p_plan_version_id;
  end if;
  update public.subscription_periods set ends_on = v_today
  where business_id = p_business_id and kind = 'trial' and starts_on <= v_today and ends_on > v_today;
  delete from public.subscription_periods where business_id = p_business_id and kind = 'trial' and starts_on > v_today;

  select * into v_open from public.subscription_periods where business_id = p_business_id and ends_on is null for update;
  if found and v_open.starts_on > v_today then
    update public.subscription_periods
    set kind = p_kind, plan_version_id = p_plan_version_id, currency = p_currency, starts_on = v_today + 1,
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

-- 4. Plazos y formas de pago -----------------------------------------------------------------------
create table public.payment_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 60),
  days int not null check (days between 0 and 365),
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index payment_terms_default_idx on public.payment_terms (is_default) where is_default;
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 60),
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index payment_methods_default_idx on public.payment_methods (is_default) where is_default;
alter table public.payment_terms enable row level security;
alter table public.payment_methods enable row level security;
revoke insert, update, delete on public.payment_terms, public.payment_methods from anon, authenticated;

insert into public.payment_terms (name, days, is_default) values ('Al contado', 0, false), ('10 días', 10, true), ('30 días', 30, false);
insert into public.payment_methods (name, is_default) values
  ('Transferencia', true), ('Tarjeta', false), ('Efectivo', false), ('Pago automático (PAC)', false);

alter table public.business_subscriptions
  add column payment_term_id uuid references public.payment_terms (id),
  add column payment_method_id uuid references public.payment_methods (id);

/** Plazo y forma de pago de un negocio: los acordados o, si no hay, los por defecto. */
create or replace function app.business_payment(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'termId', t.id, 'termName', t.name, 'termDays', t.days, 'termIsDefault', s.payment_term_id is null,
    'methodId', m.id, 'methodName', m.name, 'methodIsDefault', s.payment_method_id is null)
  from public.business_subscriptions s
  left join public.payment_terms t on t.id = coalesce(s.payment_term_id, (select id from public.payment_terms where is_default))
  left join public.payment_methods m on m.id = coalesce(s.payment_method_id, (select id from public.payment_methods where is_default))
  where s.business_id = p_business_id;
$$;
revoke all on function app.business_payment(uuid) from public;

create or replace function public.app_admin_payment_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_admin();
  return jsonb_build_object(
    'terms', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'days', days, 'isDefault', is_default, 'active', active)
                                        order by days, name) from public.payment_terms), '[]'::jsonb),
    'methods', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'isDefault', is_default, 'active', active)
                                          order by is_default desc, name) from public.payment_methods), '[]'::jsonb));
end;
$$;

create or replace function public.app_admin_save_payment_term(p_id uuid, p_name text, p_days int, p_is_default boolean, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_id;
begin
  perform app.require_platform_manager();
  if p_is_default and not p_active then
    raise exception 'El plazo por defecto debe estar activo' using errcode = 'P0001';
  end if;
  if p_is_default then
    update public.payment_terms set is_default = false where is_default and id is distinct from p_id;
  end if;
  if v_id is null then
    insert into public.payment_terms (name, days, is_default, active) values (trim(p_name), p_days, p_is_default, p_active) returning id into v_id;
  else
    update public.payment_terms set name = trim(p_name), days = p_days, is_default = p_is_default, active = p_active where id = v_id;
    if not found then
      raise exception 'Plazo no encontrado' using errcode = 'P0001';
    end if;
  end if;
  if not exists (select 1 from public.payment_terms where is_default) then
    raise exception 'Debe haber un plazo por defecto' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

create or replace function public.app_admin_save_payment_method(p_id uuid, p_name text, p_is_default boolean, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_id;
begin
  perform app.require_platform_manager();
  if p_is_default and not p_active then
    raise exception 'La forma de pago por defecto debe estar activa' using errcode = 'P0001';
  end if;
  if p_is_default then
    update public.payment_methods set is_default = false where is_default and id is distinct from p_id;
  end if;
  if v_id is null then
    insert into public.payment_methods (name, is_default, active) values (trim(p_name), p_is_default, p_active) returning id into v_id;
  else
    update public.payment_methods set name = trim(p_name), is_default = p_is_default, active = p_active where id = v_id;
    if not found then
      raise exception 'Forma de pago no encontrada' using errcode = 'P0001';
    end if;
  end if;
  if not exists (select 1 from public.payment_methods where is_default) then
    raise exception 'Debe haber una forma de pago por defecto' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

/** Plazo y forma de pago acordados con un negocio (null = los por defecto). */
create or replace function public.app_admin_set_business_payment(p_business_id uuid, p_term_id uuid, p_method_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_manager();
  if p_term_id is not null and not exists (select 1 from public.payment_terms where id = p_term_id and active) then
    raise exception 'Plazo no disponible' using errcode = 'P0001';
  end if;
  if p_method_id is not null and not exists (select 1 from public.payment_methods where id = p_method_id and active) then
    raise exception 'Forma de pago no disponible' using errcode = 'P0001';
  end if;
  update public.business_subscriptions set payment_term_id = p_term_id, payment_method_id = p_method_id where business_id = p_business_id;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
end;
$$;

-- 5. Cobros ------------------------------------------------------------------------------------------
create table public.billing_charges (
  id uuid primary key default gen_random_uuid(),
  billing_entity_id uuid references public.billing_entities (id),
  business_id uuid not null references public.businesses (id) on delete restrict,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'pending' check (status in ('pending', 'invoiced', 'paid', 'void')),
  currency text not null check (currency in ('CLP', 'USD')),
  net int not null default 0 check (net >= 0),
  tax_rate_bp int not null check (tax_rate_bp between 0 and 10000),
  tax int not null default 0 check (tax >= 0),
  gross int not null default 0 check (gross >= 0),
  -- Al facturar: copia de los datos de facturación y de las condiciones de pago
  document_type text,
  bill_to jsonb,
  payment_term_name text,
  payment_term_days int,
  payment_method_name text,
  folio text,
  issued_on date,
  due_on date,
  paid_on date,
  paid_method text,
  payment_note text,
  void_reason text,
  credit_note_folio text,
  voided_at timestamptz,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'pending' or status = 'void' or (folio is not null and issued_on is not null and due_on is not null and bill_to is not null)),
  check (status <> 'paid' or paid_on is not null)
);
create unique index billing_charges_month_idx on public.billing_charges (business_id, month) where status <> 'void';
create unique index billing_charges_folio_idx on public.billing_charges (billing_entity_id, document_type, folio) where folio is not null;
create index billing_charges_month_status_idx on public.billing_charges (month, status);

create table public.billing_charge_lines (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.billing_charges (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete restrict,
  position int not null default 0,
  kind text not null check (kind in ('plan', 'trial', 'suspended', 'extra_branches', 'adjustment')),
  label text not null check (length(trim(label)) between 1 and 200),
  from_date date,
  to_date date,
  days int,
  quantity int,
  net int not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (kind = 'adjustment' or net >= 0)
);
create index billing_charge_lines_charge_idx on public.billing_charge_lines (charge_id, position);

alter table public.billing_charges enable row level security;
alter table public.billing_charge_lines enable row level security;
-- El dueño del negocio ve sus cobros ya emitidos (no los que están en preparación)
create policy billing_charges_owner_read on public.billing_charges for select to authenticated
  using (status <> 'pending' and app.has_business_role(business_id, array['owner']::public.membership_role[]));
create policy billing_charge_lines_owner_read on public.billing_charge_lines for select to authenticated
  using (exists (select 1 from public.billing_charges c where c.id = charge_id and c.status <> 'pending')
         and app.has_business_role(business_id, array['owner']::public.membership_role[]));
revoke insert, update, delete on public.billing_charges, public.billing_charge_lines from anon, authenticated;

create trigger billing_charges_audit after insert or update or delete on public.billing_charges
  for each row execute function app.audit_row();

/** Un cobro emitido no cambia de monto ni de documento; solo avanza de estado. */
create or replace function app.protect_billing_charge()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception 'Un cobro emitido no se borra; se anula' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'void' then
    raise exception 'Un cobro anulado no se modifica' using errcode = 'P0001';
  end if;
  if old.status <> 'pending' and (
       new.net, new.tax, new.gross, new.tax_rate_bp, new.currency, new.business_id, new.month, new.folio, new.issued_on,
       new.due_on, new.bill_to, new.document_type, new.payment_term_days
     ) is distinct from (
       old.net, old.tax, old.gross, old.tax_rate_bp, old.currency, old.business_id, old.month, old.folio, old.issued_on,
       old.due_on, old.bill_to, old.document_type, old.payment_term_days
     ) then
    raise exception 'Un cobro facturado no se modifica: anúlalo con una nota de crédito' using errcode = 'P0001';
  end if;
  if old.status = 'paid' and new.status not in ('paid', 'void') then
    raise exception 'Un cobro pagado solo puede anularse' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger billing_charges_protect before update or delete on public.billing_charges
  for each row execute function app.protect_billing_charge();

create or replace function app.protect_billing_charge_line()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.billing_charges where id = coalesce(new.charge_id, old.charge_id) and status <> 'pending') then
    raise exception 'Un cobro facturado no se modifica' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger billing_charge_lines_protect before insert or update or delete on public.billing_charge_lines
  for each row execute function app.protect_billing_charge_line();

/** Recalcula neto, impuesto (redondeo a la unidad, mitades hacia arriba) y total de un cobro por facturar. */
create or replace function app.recompute_charge(p_charge_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_net bigint;
  v_rate int;
begin
  select coalesce(sum(net), 0) into v_net from public.billing_charge_lines where charge_id = p_charge_id;
  if v_net < 0 then
    raise exception 'El total del cobro no puede quedar negativo' using errcode = 'P0001';
  end if;
  select tax_rate_bp into v_rate from public.billing_charges where id = p_charge_id;
  update public.billing_charges
  set net = v_net, tax = (v_net * v_rate + 5000) / 10000, gross = v_net + (v_net * v_rate + 5000) / 10000
  where id = p_charge_id;
end;
$$;
revoke all on function app.recompute_charge(uuid) from public;

/**
 * Lo necesario para calcular el cobro de un mes, negocio por negocio: tramos del mes con el precio
 * congelado y las condiciones de su versión, días de uso de las sucursales y el cobro que ya exista.
 */
create or replace function public.app_admin_charge_inputs(p_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_first date;
  v_last date;
begin
  perform app.require_platform_admin();
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Mes no válido' using errcode = 'P0001';
  end if;
  v_first := (p_month || '-01')::date;
  v_last := (v_first + interval '1 month - 1 day')::date;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'businessId', b.id, 'businessName', b.name, 'currency', s.currency,
      'ownerName', (select coalesce(p.full_name, p.email) from public.organizations o join public.profiles p on p.id = o.owner_user_id
                    where o.id = b.organization_id),
      'hasProfile', exists (select 1 from public.business_billing_profiles f where f.business_id = b.id),
      'periods', (
        select jsonb_agg(jsonb_build_object(
          'kind', sp.kind, 'startsOn', sp.starts_on, 'endsOn', sp.ends_on, 'monthlyNet', sp.monthly_net,
          'label', case sp.kind when 'suspended' then 'Suspendido' when 'trial' then 'Prueba ' || pl.name
                                else pl.name || ' v' || v.version end,
          'includedBranches', coalesce(v.included_branches, 1),
          'extraBranchNet', case when pl.is_free then 0 else coalesce((v.extra_branch_prices ->> sp.currency)::int, 0) end
        ) order by sp.starts_on, sp.created_at)
        from public.subscription_periods sp
        left join public.plan_versions v on v.id = sp.plan_version_id
        left join public.plans pl on pl.code = v.plan_code
        where sp.business_id = b.id and sp.starts_on <= v_last and (sp.ends_on is null or sp.ends_on >= v_first)),
      'branches', coalesce((
        select jsonb_agg(jsonb_build_object('startsOn', a.starts_on, 'endsOn', a.ends_on))
        from public.branch_activity a
        where a.business_id = b.id and a.starts_on <= v_last and (a.ends_on is null or a.ends_on >= v_first)), '[]'::jsonb),
      'charge', (select jsonb_build_object('id', c.id, 'status', c.status, 'gross', c.gross)
                 from public.billing_charges c where c.business_id = b.id and c.month = p_month and c.status <> 'void')
    ) order by b.name)
    from public.businesses b
    join public.business_subscriptions s on s.business_id = b.id
    where exists (select 1 from public.subscription_periods sp
                  where sp.business_id = b.id and sp.starts_on <= v_last and (sp.ends_on is null or sp.ends_on >= v_first))
  ), '[]'::jsonb);
end;
$$;

/**
 * Crea o rehace el cobro por facturar de un negocio y un mes con las líneas calculadas (los ajustes
 * se conservan). Si el total queda en 0 sin ajustes, no hay cobro. Devuelve el id o null.
 */
create or replace function public.app_admin_save_charge(p_business_id uuid, p_month text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_charge public.billing_charges;
  v_sub public.business_subscriptions;
  v_country text;
  v_line jsonb;
  v_pos int := 0;
  v_total bigint;
begin
  perform app.require_platform_manager();
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Datos del cobro no válidos' using errcode = 'P0001';
  end if;
  if (p_month || '-01')::date >= date_trunc('month', app.platform_today()) then
    raise exception 'Se cobra a mes vencido: el mes aún no termina' using errcode = 'P0001';
  end if;
  select * into v_sub from public.business_subscriptions where business_id = p_business_id;
  if not found then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  select * into v_charge from public.billing_charges where business_id = p_business_id and month = p_month and status <> 'void' for update;
  if v_charge.id is not null and v_charge.status <> 'pending' then
    raise exception 'El cobro de ese mes ya está facturado' using errcode = 'P0001';
  end if;
  select coalesce(sum((l ->> 'net')::bigint), 0) into v_total from jsonb_array_elements(p_lines) l;
  if v_charge.id is null then
    if v_total <= 0 then
      return null;
    end if;
    select country into v_country from public.businesses where id = p_business_id;
    insert into public.billing_charges (billing_entity_id, business_id, month, currency, tax_rate_bp, created_by)
    values (v_sub.billing_entity_id, p_business_id, p_month, v_sub.currency,
            coalesce((app.billing_terms(v_country)).tax_rate_bp, 0), app.current_user_id())
    returning * into v_charge;
  else
    delete from public.billing_charge_lines where charge_id = v_charge.id and kind <> 'adjustment';
    if v_total <= 0 and not exists (select 1 from public.billing_charge_lines where charge_id = v_charge.id) then
      delete from public.billing_charges where id = v_charge.id;
      return null;
    end if;
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if v_line ->> 'kind' not in ('plan', 'trial', 'suspended', 'extra_branches') then
      raise exception 'Tipo de línea no válido' using errcode = 'P0001';
    end if;
    insert into public.billing_charge_lines (charge_id, business_id, position, kind, label, from_date, to_date, days, quantity, net, created_by)
    values (v_charge.id, p_business_id, v_pos, v_line ->> 'kind', v_line ->> 'label', (v_line ->> 'from')::date, (v_line ->> 'to')::date,
            (v_line ->> 'days')::int, (v_line ->> 'quantity')::int, (v_line ->> 'net')::int, app.current_user_id());
    v_pos := v_pos + 1;
  end loop;
  perform app.recompute_charge(v_charge.id);
  return v_charge.id;
end;
$$;

create or replace function public.app_admin_add_charge_adjustment(p_charge_id uuid, p_label text, p_net int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
begin
  perform app.require_platform_manager();
  if coalesce(length(trim(p_label)), 0) < 3 or p_net is null or p_net = 0 then
    raise exception 'Indica el motivo y un monto distinto de cero' using errcode = 'P0001';
  end if;
  select business_id into v_business from public.billing_charges where id = p_charge_id and status = 'pending';
  if v_business is null then
    raise exception 'Solo se ajustan cobros por facturar' using errcode = 'P0001';
  end if;
  insert into public.billing_charge_lines (charge_id, business_id, position, kind, label, net, created_by)
  values (p_charge_id, v_business, 100 + (select count(*) from public.billing_charge_lines where charge_id = p_charge_id),
          'adjustment', trim(p_label), p_net, app.current_user_id());
  perform app.recompute_charge(p_charge_id);
end;
$$;

create or replace function public.app_admin_remove_charge_adjustment(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_charge uuid;
begin
  perform app.require_platform_manager();
  delete from public.billing_charge_lines where id = p_line_id and kind = 'adjustment' returning charge_id into v_charge;
  if v_charge is null then
    raise exception 'Ajuste no encontrado' using errcode = 'P0001';
  end if;
  perform app.recompute_charge(v_charge);
end;
$$;

/** Facturado: se anota el folio del SII. Se copian los datos de facturación y el plazo y forma de pago acordados. */
create or replace function public.app_admin_invoice_charge(p_charge_id uuid, p_folio text, p_issued_on date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.billing_charges;
  v_profile public.business_billing_profiles;
  v_pay jsonb;
begin
  perform app.require_platform_manager();
  select * into v from public.billing_charges where id = p_charge_id for update;
  if not found or v.status <> 'pending' then
    raise exception 'Solo se factura un cobro por facturar' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_folio), '') = '' or p_issued_on is null then
    raise exception 'Indica el folio y la fecha de emisión' using errcode = 'P0001';
  end if;
  if p_issued_on > app.platform_today() then
    raise exception 'La fecha de emisión no puede ser futura' using errcode = 'P0001';
  end if;
  select * into v_profile from public.business_billing_profiles where business_id = v.business_id;
  if not found then
    raise exception 'El negocio no tiene datos de facturación' using errcode = 'P0001';
  end if;
  v_pay := app.business_payment(v.business_id);
  update public.billing_charges set
    status = 'invoiced', folio = trim(p_folio), issued_on = p_issued_on,
    document_type = v_profile.document_type,
    bill_to = jsonb_build_object('businessName', (select name from public.businesses where id = v.business_id),
                                 'legalName', v_profile.legal_name, 'taxId', v_profile.tax_id, 'activity', v_profile.activity,
                                 'address', v_profile.address, 'commune', v_profile.commune, 'city', v_profile.city,
                                 'country', v_profile.country, 'email', v_profile.email),
    payment_term_name = v_pay ->> 'termName', payment_term_days = coalesce((v_pay ->> 'termDays')::int, 0),
    payment_method_name = v_pay ->> 'methodName',
    due_on = p_issued_on + coalesce((v_pay ->> 'termDays')::int, 0)
  where id = p_charge_id;
exception
  when unique_violation then
    raise exception 'Ese folio ya está usado en otro cobro' using errcode = 'P0001';
end;
$$;

create or replace function public.app_admin_pay_charge(p_charge_id uuid, p_paid_on date, p_method text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_manager();
  if p_paid_on is null or p_paid_on > app.platform_today() then
    raise exception 'Indica la fecha de pago (no futura)' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.payment_methods where name = p_method) then
    raise exception 'Elige una forma de pago' using errcode = 'P0001';
  end if;
  update public.billing_charges set status = 'paid', paid_on = p_paid_on, paid_method = p_method, payment_note = nullif(trim(p_note), '')
  where id = p_charge_id and status = 'invoiced';
  if not found then
    raise exception 'Solo se marca como pagado un cobro facturado' using errcode = 'P0001';
  end if;
end;
$$;

/** Anular: uno por facturar se anula sin más; uno facturado o pagado necesita el folio de la nota de crédito. */
create or replace function public.app_admin_void_charge(p_charge_id uuid, p_reason text, p_credit_note_folio text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.billing_charges;
begin
  perform app.require_platform_manager();
  select * into v from public.billing_charges where id = p_charge_id for update;
  if not found or v.status = 'void' then
    raise exception 'Ese cobro ya está anulado' using errcode = 'P0001';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Indica el motivo' using errcode = 'P0001';
  end if;
  if v.status <> 'pending' and coalesce(trim(p_credit_note_folio), '') = '' then
    raise exception 'Indica el folio de la nota de crédito emitida en el SII' using errcode = 'P0001';
  end if;
  update public.billing_charges set status = 'void', void_reason = trim(p_reason),
    credit_note_folio = nullif(trim(p_credit_note_folio), ''), voided_at = now()
  where id = p_charge_id;
end;
$$;

create or replace function public.app_admin_charges(p_month text)
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
      'id', c.id, 'businessId', c.business_id, 'businessName', b.name, 'month', c.month, 'status', c.status,
      'currency', c.currency, 'net', c.net, 'tax', c.tax, 'gross', c.gross, 'taxRateBp', c.tax_rate_bp,
      'documentType', c.document_type, 'billTo', c.bill_to, 'folio', c.folio, 'issuedOn', c.issued_on, 'dueOn', c.due_on,
      'paidOn', c.paid_on, 'paidMethod', c.paid_method, 'paymentTermName', c.payment_term_name,
      'paymentMethodName', c.payment_method_name, 'voidReason', c.void_reason, 'creditNoteFolio', c.credit_note_folio,
      'profile', (select jsonb_build_object('documentType', f.document_type, 'legalName', f.legal_name, 'taxId', f.tax_id,
                                            'email', f.email, 'country', f.country)
                  from public.business_billing_profiles f where f.business_id = c.business_id)
    ) order by b.name, c.created_at)
    from public.billing_charges c join public.businesses b on b.id = c.business_id
    where c.month = p_month
  ), '[]'::jsonb);
end;
$$;

create or replace function public.app_admin_charge(p_charge_id uuid)
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
      'id', c.id, 'businessId', c.business_id, 'businessName', b.name, 'month', c.month, 'status', c.status,
      'currency', c.currency, 'net', c.net, 'tax', c.tax, 'gross', c.gross, 'taxRateBp', c.tax_rate_bp,
      'documentType', c.document_type, 'billTo', c.bill_to, 'folio', c.folio, 'issuedOn', c.issued_on, 'dueOn', c.due_on,
      'paidOn', c.paid_on, 'paidMethod', c.paid_method, 'paymentNote', c.payment_note,
      'paymentTermName', c.payment_term_name, 'paymentMethodName', c.payment_method_name,
      'voidReason', c.void_reason, 'creditNoteFolio', c.credit_note_folio, 'voidedAt', c.voided_at,
      'createdAt', c.created_at, 'hasProfile', exists (select 1 from public.business_billing_profiles f where f.business_id = c.business_id),
      'payment', app.business_payment(c.business_id),
      'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'label', l.label, 'from', l.from_date,
                                                             'to', l.to_date, 'days', l.days, 'quantity', l.quantity, 'net', l.net)
                                          order by l.position, l.created_at)
                         from public.billing_charge_lines l where l.charge_id = c.id), '[]'::jsonb)
    )
    from public.billing_charges c join public.businesses b on b.id = c.business_id
    where c.id = p_charge_id
  );
end;
$$;

/** Avisos de la consola: cobros vencidos sin pagar y el mes vencido que falta generar. */
create or replace function public.app_admin_billing_alerts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := app.platform_today();
  v_prev text := to_char(date_trunc('month', v_today) - interval '1 month', 'YYYY-MM');
begin
  perform app.require_platform_admin();
  return jsonb_build_object(
    'today', v_today,
    'overdue', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'businessId', c.business_id, 'businessName', b.name, 'month', c.month,
                                          'gross', c.gross, 'currency', c.currency, 'dueOn', c.due_on, 'days', v_today - c.due_on)
                       order by c.due_on)
      from public.billing_charges c join public.businesses b on b.id = c.business_id
      where c.status = 'invoiced' and c.due_on < v_today), '[]'::jsonb),
    'monthToGenerate', case
      when not exists (select 1 from public.billing_charges where month = v_prev)
       and exists (select 1 from public.subscription_periods where starts_on < date_trunc('month', v_today)) then v_prev
    end
  );
end;
$$;

/** Cobros emitidos de un negocio, para su dueño (página Plan). */
create or replace function public.app_my_charges(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.has_business_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', app.platform_today(),
    'payment', app.business_payment(p_business_id),
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'month', c.month, 'status', c.status, 'currency', c.currency,
                                          'net', c.net, 'tax', c.tax, 'gross', c.gross, 'folio', c.folio,
                                          'documentType', c.document_type, 'issuedOn', c.issued_on, 'dueOn', c.due_on,
                                          'paidOn', c.paid_on, 'creditNoteFolio', c.credit_note_folio)
                       order by c.month desc, c.created_at desc)
      from public.billing_charges c where c.business_id = p_business_id and c.status <> 'pending'), '[]'::jsonb)
  );
end;
$$;

-- El aviso de pago vencido (solo para el dueño) va con el estado de facturación del panel
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
      'suggestion', case when v_owner then (
        select jsonb_build_object('documentType', f.document_type, 'country', f.country, 'taxId', f.tax_id,
                                  'legalName', f.legal_name, 'activity', f.activity, 'address', f.address,
                                  'commune', f.commune, 'city', f.city, 'email', f.email, 'fromBusiness', ob.name)
        from public.business_billing_profiles f
        join public.businesses ob on ob.id = f.business_id
        join public.memberships m on m.business_id = ob.id and m.user_id = app.current_user_id() and m.role = 'owner'
        where ob.id <> b.id
        order by f.updated_at desc limit 1) end,
      'overdue', case when v_owner then (
        select jsonb_build_object('count', count(*), 'oldestDueOn', min(c.due_on))
        from public.billing_charges c
        where c.business_id = b.id and c.status = 'invoiced' and c.due_on < app.platform_today()
        having count(*) > 0) end
    )
    from public.businesses b where b.id = p_business_id
  );
end;
$$;

-- La ficha del negocio en la consola también muestra plazo, forma de pago y sus cobros
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
        from public.free_plan_grants g where g.business_id = b.id), '[]'::jsonb),
      'payment', app.business_payment(b.id),
      'charges', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'month', c.month, 'status', c.status, 'currency', c.currency,
                                            'gross', c.gross, 'folio', c.folio, 'dueOn', c.due_on, 'paidOn', c.paid_on)
                         order by c.month desc, c.created_at desc)
        from public.billing_charges c where c.business_id = b.id), '[]'::jsonb)
    )
    from public.businesses b where b.id = p_business_id
  );
end;
$$;

-- Permisos ----------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.app_admin_save_plan(text, text, text, boolean, boolean, text[], jsonb, jsonb, text, boolean, int, jsonb, int)',
    'public.app_admin_payment_options()',
    'public.app_admin_save_payment_term(uuid, text, int, boolean, boolean)',
    'public.app_admin_save_payment_method(uuid, text, boolean, boolean)',
    'public.app_admin_set_business_payment(uuid, uuid, uuid)',
    'public.app_admin_charge_inputs(text)',
    'public.app_admin_save_charge(uuid, text, jsonb)',
    'public.app_admin_add_charge_adjustment(uuid, text, int)',
    'public.app_admin_remove_charge_adjustment(uuid)',
    'public.app_admin_invoice_charge(uuid, text, date)',
    'public.app_admin_pay_charge(uuid, date, text, text)',
    'public.app_admin_void_charge(uuid, text, text)',
    'public.app_admin_charges(text)',
    'public.app_admin_charge(uuid)',
    'public.app_admin_billing_alerts()',
    'public.app_my_charges(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function app.protect_billing_charge() from public;
revoke all on function app.protect_billing_charge_line() from public;
