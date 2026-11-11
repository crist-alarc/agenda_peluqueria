-- =============================================================================
-- Fase 2B · Confirmación por email y portal del cliente (secciones 5.3, 9.3, 12)
--
-- - Cada negocio elige cómo se confirman las reservas del link público:
--   'auto' (confirmada al instante) o 'email' (queda pendiente y apartada hasta
--   que el cliente presiona "Confirmar" en el email; si no, se libera sola).
-- - Enlaces de un solo uso (solo se guarda el hash del token).
-- - "Mis reservas": una cuenta ve y cancela sus reservas en todos los negocios;
--   se vinculan solo por email VERIFICADO de la cuenta (nunca sin verificar).
-- =============================================================================

alter table public.businesses
  add column public_confirmation_mode text not null default 'auto'
    check (public_confirmation_mode in ('auto', 'email')),
  add column pending_hold_minutes int not null default 30 check (pending_hold_minutes between 5 and 1440);

alter table public.bookings
  add column hold_expires_at timestamptz,
  add column customer_confirmed_at timestamptz;

-- Email verificado de la cuenta actual (único punto que lee auth.users).
create or replace function app.current_user_email()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lower(u.email) from auth.users u
  where u.id = app.current_user_id() and u.email_confirmed_at is not null;
$$;

-- -----------------------------------------------------------------------------
-- 1. Reservas pendientes del link público
-- -----------------------------------------------------------------------------
-- Libera las reservas pendientes cuyo plazo venció (pending → cancelled).
create or replace function app.expire_pending_bookings()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  update public.bookings
  set status = 'cancelled', cancel_reason = 'No se confirmó a tiempo'
  where status = 'pending' and hold_expires_at is not null and hold_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Al crear una reserva: primero se liberan las pendientes vencidas, y si viene
-- del link público de un negocio en modo 'email', queda pendiente con plazo.
create or replace function app.booking_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business public.businesses;
begin
  perform app.expire_pending_bookings();
  if new.channel = 'public_link' then
    select * into v_business from public.businesses where id = new.business_id;
    if v_business.public_confirmation_mode = 'email' then
      if not exists (select 1 from public.customers c where c.id = new.customer_id and c.email is not null) then
        raise exception 'Ingresa tu email para confirmar la reserva' using errcode = 'P0001';
      end if;
      new.status := 'pending';
      new.hold_expires_at := now() + make_interval(mins => v_business.pending_hold_minutes);
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_before_insert before insert on public.bookings
  for each row execute function app.booking_before_insert();

-- Confirmar (por el negocio o el cliente) limpia el plazo
create or replace function app.booking_clear_hold()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'pending' then
    new.hold_expires_at := null;
  end if;
  return new;
end;
$$;

create trigger bookings_clear_hold before update on public.bookings
  for each row execute function app.booking_clear_hold();

-- -----------------------------------------------------------------------------
-- 2. Enlaces de un solo uso (confirmar / cancelar desde el email)
-- -----------------------------------------------------------------------------
create table public.booking_tokens (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  purpose text not null check (purpose in ('confirm', 'cancel')),
  -- SHA-256 del token: el token en claro solo viaja en el email
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index booking_tokens_booking_idx on public.booking_tokens (booking_id);

-- RLS sin políticas: nadie la lee ni escribe desde la app; solo las funciones de abajo.
alter table public.booking_tokens enable row level security;
revoke all on public.booking_tokens from anon, authenticated;

-- El servidor (clave de servicio) registra el hash de un token nuevo.
create or replace function public.app_create_booking_token(
  p_booking_id uuid,
  p_purpose text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if app.current_request_role() <> 'service_role' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  insert into public.booking_tokens (booking_id, purpose, token_hash, expires_at)
  values (p_booking_id, p_purpose, lower(p_token_hash), p_expires_at);
end;
$$;

-- Datos mínimos de una reserva para mostrar al cliente (sin información interna)
create or replace function app.booking_public_summary(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'status', b.status, 'startsAt', b.starts_at, 'endsAt', b.ends_at,
    'businessName', bz.name, 'timezone', bz.timezone, 'totalClp', b.total_clp,
    'services', (select jsonb_agg(i.service_name order by i.position) from public.booking_items i where i.booking_id = b.id)
  )
  from public.bookings b join public.businesses bz on bz.id = b.visible_brand_business_id
  where b.id = p_booking_id;
$$;

-- Usar un enlace del email. Devuelve { result, booking }.
-- result: confirmed | already_confirmed | cancelled | expired | invalid | too_late
create or replace function public.app_use_booking_token(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_token public.booking_tokens;
  v_booking public.bookings;
  v_business public.businesses;
  v_result text;
begin
  perform app.expire_pending_bookings();
  select * into v_token from public.booking_tokens where token_hash = lower(p_token_hash) for update;
  if not found or v_token.expires_at < now() then
    return jsonb_build_object('result', 'invalid');
  end if;
  select * into v_booking from public.bookings where id = v_token.booking_id for update;
  select * into v_business from public.businesses where id = v_booking.business_id;

  if v_token.purpose = 'confirm' then
    if v_booking.status = 'pending' then
      update public.bookings set status = 'confirmed', customer_confirmed_at = now() where id = v_booking.id;
      v_result := 'confirmed';
    elsif v_booking.status = 'confirmed' then
      update public.bookings set customer_confirmed_at = coalesce(customer_confirmed_at, now()) where id = v_booking.id;
      v_result := 'already_confirmed';
    elsif v_booking.status = 'cancelled' and v_booking.cancel_reason = 'No se confirmó a tiempo' then
      v_result := 'expired';
    else
      v_result := 'cancelled';
    end if;
  else
    if v_booking.status not in ('pending', 'confirmed') then
      v_result := 'cancelled';
    elsif v_booking.starts_at - now() < make_interval(hours => v_business.cancellation_hours) then
      v_result := 'too_late';
    else
      update public.bookings set status = 'cancelled', cancel_reason = 'Cancelada por el cliente' where id = v_booking.id;
      v_result := 'cancelled';
    end if;
  end if;

  if v_result in ('confirmed', 'already_confirmed') or (v_token.purpose = 'cancel' and v_result = 'cancelled') then
    update public.booking_tokens set used_at = coalesce(used_at, now()) where id = v_token.id;
  end if;
  return jsonb_build_object('result', v_result, 'booking', app.booking_public_summary(v_booking.id));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Portal del cliente ("Mis reservas", sección 12)
-- -----------------------------------------------------------------------------
-- Vincula las fichas de cliente con el email VERIFICADO de la cuenta actual.
create or replace function public.app_link_my_customers()
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := app.current_user_email();
  v_count int;
begin
  if v_email is null then
    return 0;
  end if;
  update public.customers set user_id = app.current_user_id()
  where user_id is null and lower(email) = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- El cliente ve sus propias reservas (en todos los negocios)
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
        or exists (
          select 1 from public.customers c
          where c.id = b.customer_id and c.user_id = app.current_user_id()
        )
      )
  );
$$;

drop policy customers_read on public.customers;
create policy customers_read on public.customers for select to authenticated
  using (
    user_id = app.current_user_id()
    or app.has_business_role(business_id, array['owner', 'admin', 'branch_admin', 'receptionist']::public.membership_role[])
    or exists (select 1 from public.bookings b where b.customer_id = customers.id and app.can_view_booking(b.id))
  );

-- Reservas de la cuenta actual, con el nombre del negocio
create or replace function public.app_my_bookings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'status', b.status, 'startsAt', b.starts_at, 'endsAt', b.ends_at, 'totalClp', b.total_clp,
    'businessName', bz.name, 'businessSlug', bz.slug, 'timezone', bz.timezone,
    'cancellationHours', bz.cancellation_hours,
    'services', (select jsonb_agg(i.service_name order by i.position) from public.booking_items i where i.booking_id = b.id)
  ) order by b.starts_at desc), '[]'::jsonb)
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  join public.businesses bz on bz.id = b.visible_brand_business_id
  where c.user_id = app.current_user_id() and app.current_user_id() is not null;
$$;

-- El cliente cancela su reserva respetando la política del negocio
create or replace function public.app_customer_cancel_booking(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
  v_hours int;
begin
  select b.* into v_booking from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.id = p_booking_id and c.user_id = app.current_user_id() and app.current_user_id() is not null
  for update of b;
  if not found then
    raise exception 'Reserva no encontrada' using errcode = 'P0001';
  end if;
  if v_booking.status not in ('pending', 'confirmed') then
    raise exception 'Esta reserva ya no se puede cancelar' using errcode = 'P0001';
  end if;
  select cancellation_hours into v_hours from public.businesses where id = v_booking.business_id;
  if v_booking.starts_at - now() < make_interval(hours => v_hours) then
    raise exception 'Ya no puedes cancelar en línea: avisa con al menos % horas. Contacta al negocio.', v_hours
      using errcode = 'P0001';
  end if;
  update public.bookings set status = 'cancelled', cancel_reason = 'Cancelada por el cliente' where id = p_booking_id;
end;
$$;

-- El motor no debe considerar ocupadas las pendientes ya vencidas.
-- (app_booking_context es STABLE: no puede liberarlas, solo ignorarlas.)
create or replace function public.app_expire_pending()
returns int
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select app.expire_pending_bookings();
$$;

-- -----------------------------------------------------------------------------
-- 4. Permisos
-- -----------------------------------------------------------------------------
revoke all on function app.current_user_email() from public;
grant execute on function app.current_user_email() to authenticated;
revoke all on function app.expire_pending_bookings() from public;
revoke all on function app.booking_before_insert() from public;
revoke all on function app.booking_clear_hold() from public;
revoke all on function app.booking_public_summary(uuid) from public;

revoke all on function public.app_create_booking_token(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.app_create_booking_token(uuid, text, text, timestamptz) to service_role;
revoke all on function public.app_use_booking_token(text) from public;
grant execute on function public.app_use_booking_token(text) to anon, authenticated, service_role;
revoke all on function public.app_link_my_customers() from public, anon;
grant execute on function public.app_link_my_customers() to authenticated;
revoke all on function public.app_my_bookings() from public, anon;
grant execute on function public.app_my_bookings() to authenticated;
revoke all on function public.app_customer_cancel_booking(uuid) from public, anon;
grant execute on function public.app_customer_cancel_booking(uuid) to authenticated;
revoke all on function public.app_expire_pending() from public;
grant execute on function public.app_expire_pending() to anon, authenticated, service_role;
