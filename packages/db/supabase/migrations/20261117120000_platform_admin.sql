-- =============================================================================
-- Consola de la plataforma · A1 (ADR 0008)
--
-- 1. platform_admins: quienes administran la plataforma (no es un rol de negocio).
-- 2. Acceso de soporte con aprobación del cliente:
--    - el agente pide acceso a un negocio, con motivo;
--    - lo aprueba el dueño o quien él designe (memberships.can_approve_support);
--    - el acceso dura lo que elige quien aprueba y se puede revocar;
--    - cada vista queda registrada y el negocio la puede ver.
-- 3. Funciones app_admin_*: la consola nunca lee las tablas de los negocios directamente.
--    Sin acceso aprobado solo ve datos de la cuenta (plan, estado y totales).
-- =============================================================================

-- 1. Administradores de la plataforma -------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- Cada persona puede saber si ella misma es administradora (para mostrar el acceso a /admin)
create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = app.current_user_id());
revoke insert, update, delete on public.platform_admins from anon, authenticated;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.platform_admins where user_id = app.current_user_id());
$$;
revoke all on function app.is_platform_admin() from public;
grant execute on function app.is_platform_admin() to authenticated;

-- 2. Quién puede aprobar el soporte en cada negocio --------------------------------
alter table public.memberships add column can_approve_support boolean not null default false;
comment on column public.memberships.can_approve_support is
  'El dueño designa quién más puede aprobar el acceso de soporte de la plataforma. El dueño siempre puede.';

create or replace function app.can_approve_support(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id and m.user_id = app.current_user_id()
      and (m.role = 'owner' or m.can_approve_support)
  );
$$;
revoke all on function app.can_approve_support(uuid) from public;
grant execute on function app.can_approve_support(uuid) to authenticated;

-- 3. Solicitudes de acceso de soporte -------------------------------------------------
create table public.support_access_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  -- Copia del nombre y email del agente: el negocio lo ve sin acceder a perfiles ajenos
  requester_name text not null,
  requester_email text not null,
  reason text not null check (length(trim(reason)) between 5 and 500),
  requested_hours int not null check (requested_hours between 1 and 168),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked', 'cancelled')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  -- Aprobado o revocado: conserva hasta cuándo valía (al revocar, el momento de la revocación)
  check ((status in ('approved', 'revoked')) = (expires_at is not null))
);
create index support_requests_business_idx on public.support_access_requests (business_id, created_at desc);
-- Una sola solicitud pendiente por negocio
create unique index support_requests_one_pending on public.support_access_requests (business_id) where status = 'pending';

alter table public.support_access_requests enable row level security;
create policy support_requests_read on public.support_access_requests for select to authenticated
  using (app.can_approve_support(business_id));
revoke insert, update, delete on public.support_access_requests from anon, authenticated;

-- Registro de cada vista del agente (el negocio lo ve: transparencia)
create table public.support_access_log (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.support_access_requests (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  admin_user_id uuid not null references public.profiles (id),
  viewed_at timestamptz not null default now()
);
create index support_log_business_idx on public.support_access_log (business_id, viewed_at desc);
alter table public.support_access_log enable row level security;
create policy support_log_read on public.support_access_log for select to authenticated
  using (app.can_approve_support(business_id));
revoke insert, update, delete on public.support_access_log from anon, authenticated;

create trigger support_access_requests_audit after insert or update or delete on public.support_access_requests
  for each row execute function app.audit_row();

/** Solicitud aprobada y vigente del agente actual para un negocio. */
create or replace function app.active_support_request(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id from public.support_access_requests r
  where r.business_id = p_business_id and r.requested_by = app.current_user_id()
    and r.status = 'approved' and r.expires_at > now()
  order by r.expires_at desc
  limit 1;
$$;
revoke all on function app.active_support_request(uuid) from public;

-- 4. Funciones de la consola ------------------------------------------------------------
create or replace function app.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end;
$$;
revoke all on function app.require_platform_admin() from public;

/**
 * Clientes de la plataforma (dueños / organizaciones) con sus negocios.
 * Solo datos de la cuenta: plan, estado y totales. Nada de clientes finales ni configuración.
 */
create or replace function public.app_admin_clients(p_organization_id uuid default null)
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
      'id', o.id, 'name', o.name, 'createdAt', o.created_at,
      'owner', jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'phone', p.phone),
      'businesses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'name', b.name, 'slug', b.slug, 'createdAt', b.created_at,
          'industry', t.name, 'bookingMode', b.booking_mode,
          'planCode', s.plan_code, 'planName', pl.name, 'subscriptionStatus', s.status,
          'publicBookingEnabled', b.public_booking_enabled,
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
$$;

create or replace function public.app_admin_request_support(p_business_id uuid, p_reason text, p_hours int)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_profile public.profiles;
begin
  perform app.require_platform_admin();
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Negocio no encontrado' using errcode = 'P0001';
  end if;
  if coalesce(p_hours, 0) not between 1 and 168 then
    raise exception 'El acceso puede durar entre 1 hora y 7 días' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.support_access_requests where business_id = p_business_id and status = 'pending') then
    raise exception 'Ya hay una solicitud pendiente para este negocio' using errcode = 'P0001';
  end if;
  select * into v_profile from public.profiles where id = app.current_user_id();
  insert into public.support_access_requests (business_id, requested_by, requester_name, requester_email, reason, requested_hours)
  values (p_business_id, v_profile.id, coalesce(nullif(trim(v_profile.full_name), ''), 'Soporte'),
          coalesce(v_profile.email, ''), trim(p_reason), p_hours)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.app_admin_cancel_support(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_platform_admin();
  update public.support_access_requests
  set status = case when status = 'pending' then 'cancelled' else 'revoked' end,
      expires_at = case when status = 'pending' then null else least(expires_at, now()) end,
      decided_at = coalesce(decided_at, now())
  where id = p_request_id and requested_by = app.current_user_id()
    and (status = 'pending' or (status = 'approved' and expires_at > now()));
  if not found then
    raise exception 'La solicitud ya no está activa' using errcode = 'P0001';
  end if;
end;
$$;

/**
 * Configuración del negocio para dar soporte (solo lectura). Exige un acceso aprobado
 * y vigente del agente; cada lectura queda registrada. No incluye clientes ni reservas.
 */
create or replace function public.app_admin_support_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request uuid;
  v_expires timestamptz;
begin
  perform app.require_platform_admin();
  v_request := app.active_support_request(p_business_id);
  if v_request is null then
    raise exception 'Necesitas un acceso de soporte aprobado por el negocio' using errcode = '42501';
  end if;
  select expires_at into v_expires from public.support_access_requests where id = v_request;
  insert into public.support_access_log (request_id, business_id, admin_user_id)
  values (v_request, p_business_id, app.current_user_id());

  return (
    select jsonb_build_object(
      'accessExpiresAt', v_expires,
      'business', jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'industry', b.industry_code, 'bookingMode', b.booking_mode,
        'timezone', b.timezone, 'country', b.country, 'currency', b.currency,
        'phone', b.phone, 'email', b.email,
        'publicBookingEnabled', b.public_booking_enabled, 'showPublicPrices', b.show_public_prices,
        'slotIntervalMinutes', b.slot_interval_minutes, 'minAdvanceMinutes', b.min_advance_minutes,
        'maxAdvanceDays', b.max_advance_days, 'cancellationHours', b.cancellation_hours,
        'confirmationMode', b.public_confirmation_mode, 'pendingHoldMinutes', b.pending_hold_minutes,
        'reminderEnabled', b.reminder_enabled, 'reminderHoursBefore', b.reminder_hours_before,
        'confirmationCutoffHours', b.confirmation_cutoff_hours, 'settlementPeriod', b.settlement_period
      ),
      'plan', (select jsonb_build_object('code', s.plan_code, 'status', s.status, 'startedAt', s.started_at)
               from public.business_subscriptions s where s.business_id = b.id),
      'entitlements', coalesce((
        select jsonb_agg(jsonb_build_object('feature', e.feature, 'enabled', e.enabled, 'limit', e.limit_value, 'source', e.source) order by e.feature)
        from public.business_entitlements e where e.business_id = b.id), '[]'::jsonb),
      'branches', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', br.id, 'name', br.name, 'address', br.address, 'commune', br.commune, 'active', br.active,
          'deliveryMode', br.delivery_mode, 'deliveryFee', br.delivery_fee,
          'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'start', h.opens_at, 'end', h.closes_at) order by h.weekday, h.opens_at)
                             from public.branch_hours h where h.branch_id = br.id), '[]'::jsonb),
          'zones', coalesce((select jsonb_agg(jsonb_build_object('name', z.name, 'fee', z.fee, 'active', z.active) order by z.position, z.name)
                             from public.delivery_zones z where z.branch_id = br.id), '[]'::jsonb)
        ) order by br.created_at)
        from public.branches br where br.business_id = b.id), '[]'::jsonb),
      'resources', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'name', r.name, 'type', r.type, 'skills', r.skills, 'active', r.active,
          'branchId', r.branch_id, 'isLogistics', r.is_logistics, 'maxEventsPerDay', r.max_events_per_day,
          'linkedAccount', r.professional_id is not null and exists (select 1 from public.professionals pr where pr.id = r.professional_id and pr.user_id is not null),
          'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'start', h.starts_at, 'end', h.ends_at) order by h.weekday, h.starts_at)
                             from public.resource_hours h where h.resource_id = r.id), '[]'::jsonb)
        ) order by r.type, r.name)
        from public.resources r where r.business_id = b.id), '[]'::jsonb),
      'services', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'active', s.active, 'price', s.price, 'durationMinutes', s.duration_minutes,
          'bufferBeforeMinutes', s.buffer_before_minutes, 'bufferAfterMinutes', s.buffer_after_minutes,
          'fullDay', s.full_day, 'details', s.details,
          'photos', (select count(*) from public.service_photos p where p.service_id = s.id),
          'requirements', coalesce((select jsonb_agg(jsonb_build_object('type', q.resource_type, 'quantity', q.quantity, 'skill', q.required_skill))
                                    from public.service_resource_requirements q where q.service_id = s.id), '[]'::jsonb)
        ) order by s.name)
        from public.services s where s.business_id = b.id), '[]'::jsonb),
      'addons', coalesce((
        select jsonb_agg(jsonb_build_object('name', a.name, 'price', a.price, 'active', a.active,
                                            'stock', (select coalesce(sum(st.quantity), 0) from public.addon_stock st where st.addon_id = a.id)) order by a.name)
        from public.addons a where a.business_id = b.id), '[]'::jsonb),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('name', p.full_name, 'email', p.email, 'role', m.role,
                                            'canApproveSupport', m.role = 'owner' or m.can_approve_support) order by m.created_at)
        from public.memberships m join public.profiles p on p.id = m.user_id where m.business_id = b.id), '[]'::jsonb),
      'notifications30d', coalesce((
        select jsonb_object_agg(k.kind || ':' || k.status, k.n)
        from (select n.kind, n.status, count(*) as n from public.notification_log n
              where n.business_id = b.id and n.created_at > now() - interval '30 days'
              group by n.kind, n.status) k), '{}'::jsonb),
      'totals', jsonb_build_object(
        'bookings30d', (select count(*) from public.bookings bk where bk.business_id = b.id and bk.created_at > now() - interval '30 days'),
        'customers', (select count(*) from public.customers c where c.business_id = b.id)
      )
    )
    from public.businesses b where b.id = p_business_id
  );
end;
$$;

-- 5. Funciones del negocio: aprobar, rechazar, revocar y designar aprobadores -------------
create or replace function public.app_decide_support_request(p_request_id uuid, p_approve boolean, p_hours int default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_access_requests;
  v_hours int;
begin
  select * into v_req from public.support_access_requests where id = p_request_id for update;
  if not found or not app.can_approve_support(v_req.business_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Esta solicitud ya fue respondida' using errcode = 'P0001';
  end if;
  v_hours := coalesce(p_hours, v_req.requested_hours);
  if v_hours not between 1 and 168 then
    raise exception 'El acceso puede durar entre 1 hora y 7 días' using errcode = 'P0001';
  end if;
  update public.support_access_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      expires_at = case when p_approve then now() + make_interval(hours => v_hours) end,
      decided_by = app.current_user_id(), decided_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.app_revoke_support_access(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_access_requests;
begin
  select * into v_req from public.support_access_requests where id = p_request_id for update;
  if not found or not app.can_approve_support(v_req.business_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_req.status <> 'approved' or v_req.expires_at <= now() then
    raise exception 'Este acceso ya no está vigente' using errcode = 'P0001';
  end if;
  update public.support_access_requests set status = 'revoked', expires_at = now() where id = p_request_id;
end;
$$;

/** Solo el dueño designa quién más puede aprobar el soporte. */
create or replace function public.app_set_support_approver(p_membership_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m public.memberships;
begin
  select * into v_m from public.memberships where id = p_membership_id;
  if not found or not app.has_business_role(v_m.business_id, array['owner']::public.membership_role[]) then
    raise exception 'Solo el dueño puede designar quién aprueba el soporte' using errcode = '42501';
  end if;
  if v_m.role = 'owner' then
    raise exception 'El dueño siempre puede aprobar el soporte' using errcode = 'P0001';
  end if;
  update public.memberships set can_approve_support = p_value where id = p_membership_id;
end;
$$;

-- Permisos: ninguna función es para usuarios anónimos
do $$
declare f text;
begin
  foreach f in array array[
    'public.app_admin_clients(uuid)', 'public.app_admin_request_support(uuid, text, int)',
    'public.app_admin_cancel_support(uuid)', 'public.app_admin_support_snapshot(uuid)',
    'public.app_decide_support_request(uuid, boolean, int)', 'public.app_revoke_support_access(uuid)',
    'public.app_set_support_approver(uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
