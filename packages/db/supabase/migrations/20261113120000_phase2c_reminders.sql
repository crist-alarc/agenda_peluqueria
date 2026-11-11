-- =============================================================================
-- Fase 2C · Emails y recordatorios (sección 18, ADR 0004)
--
-- - Email al reservar (con .ics) y recordatorio antes de la cita con los botones
--   "Confirmo asistencia" / "Cancelar o cambiar".
-- - Todo lo que tiene que ver con tiempo es configurable por negocio (regla del
--   dueño, ADR 0004): horas de anticipación del recordatorio y hora de corte.
-- - "Sin confirmar" no se guarda: se calcula en @agenda/core con estos datos.
-- - Registro de cada envío (canal, tipo, estado, clic) para medir cuántos
--   clientes confirman por email.
-- - Tarea programada cada 15 minutos (Supabase Cron) que llama a la Edge Function.
-- =============================================================================

alter table public.businesses
  add column reminder_enabled boolean not null default true,
  add column reminder_hours_before int not null default 24 check (reminder_hours_before between 1 and 168),
  add column confirmation_cutoff_hours int not null default 4 check (confirmation_cutoff_hours between 0 and 72),
  add constraint businesses_cutoff_before_reminder check (confirmation_cutoff_hours < reminder_hours_before);

alter table public.bookings
  add column reminder_sent_at timestamptz,
  add column attendance_confirmed_at timestamptz;

-- Recepción puede marcar la asistencia confirmada (por ejemplo, tras llamar al cliente)
grant update (attendance_confirmed_at) on public.bookings to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Registro de envíos
-- -----------------------------------------------------------------------------
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  kind text not null check (kind in ('booking_pending', 'booking_created', 'reminder')),
  recipient text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  clicked_at timestamptz,
  -- Primer botón presionado: confirm | attend | cancel
  clicked_action text check (clicked_action in ('confirm', 'attend', 'cancel')),
  created_at timestamptz not null default now()
);
create index notification_log_business_idx on public.notification_log (business_id, created_at desc);
create index notification_log_booking_idx on public.notification_log (booking_id);

-- Solo lo ven quienes atienden el negocio; solo el servidor lo escribe.
alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;
grant select on public.notification_log to authenticated;
create policy notification_log_read on public.notification_log for select to authenticated
  using (app.has_business_role(business_id, array['owner', 'admin', 'branch_admin', 'receptionist']::public.membership_role[]));

-- Enlaces: nuevo propósito "confirmo asistencia" y vínculo al envío (para medir el clic)
alter table public.booking_tokens drop constraint booking_tokens_purpose_check;
alter table public.booking_tokens
  add constraint booking_tokens_purpose_check check (purpose in ('confirm', 'cancel', 'attend')),
  add column notification_id uuid references public.notification_log (id) on delete set null;

drop function public.app_create_booking_token(uuid, text, text, timestamptz);
create or replace function public.app_create_booking_token(
  p_booking_id uuid,
  p_purpose text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_notification_id uuid default null
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
  insert into public.booking_tokens (booking_id, purpose, token_hash, expires_at, notification_id)
  values (p_booking_id, p_purpose, lower(p_token_hash), p_expires_at, p_notification_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Datos para los emails (solo el servidor)
-- -----------------------------------------------------------------------------
create or replace function app.booking_email_data(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', b.id, 'businessId', b.business_id, 'status', b.status,
    'startsAt', b.starts_at, 'endsAt', b.ends_at, 'createdAt', b.created_at, 'totalClp', b.total_clp,
    'holdExpiresAt', b.hold_expires_at, 'reminderSentAt', b.reminder_sent_at,
    'attendanceConfirmedAt', b.attendance_confirmed_at,
    'customerName', c.full_name, 'customerEmail', c.email,
    'brand', brand.name, 'businessSlug', brand.slug, 'timezone', brand.timezone,
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
$$;

create or replace function public.app_booking_email_data(p_booking_id uuid)
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
  return app.booking_email_data(p_booking_id);
end;
$$;

-- Reservas que podrían necesitar recordatorio ahora. Es un filtro grueso:
-- la decisión final la toma @agenda/core (shouldSendReminder).
create or replace function public.app_reminder_candidates(p_now timestamptz default now(), p_limit int default 200)
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
  return coalesce((
    select jsonb_agg(app.booking_email_data(x.id) order by x.starts_at)
    from (
      select b.id, b.starts_at
      from public.bookings b
      join public.businesses bz on bz.id = b.business_id
      join public.customers c on c.id = b.customer_id
      where b.status = 'confirmed'
        and b.reminder_sent_at is null
        and b.attendance_confirmed_at is null
        and c.email is not null
        and bz.reminder_enabled
        and b.starts_at > p_now
        and b.starts_at - make_interval(hours => bz.reminder_hours_before) <= p_now
      order by b.starts_at
      limit p_limit
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Marca el recordatorio como enviado una sola vez (evita duplicados si la
-- tarea corre dos veces a la vez). Devuelve true si esta llamada lo marcó.
create or replace function public.app_claim_reminder(p_booking_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  if app.current_request_role() <> 'service_role' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.bookings set reminder_sent_at = now()
  where id = p_booking_id and reminder_sent_at is null and status = 'confirmed';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Usar un enlace: agrega "confirmo asistencia" y registra el clic
-- -----------------------------------------------------------------------------
create or replace function app.booking_public_summary(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'status', b.status, 'startsAt', b.starts_at, 'endsAt', b.ends_at,
    'businessName', bz.name, 'businessSlug', bz.slug, 'timezone', bz.timezone, 'totalClp', b.total_clp,
    'services', (select jsonb_agg(i.service_name order by i.position) from public.booking_items i where i.booking_id = b.id)
  )
  from public.bookings b join public.businesses bz on bz.id = b.visible_brand_business_id
  where b.id = p_booking_id;
$$;

-- result: confirmed | already_confirmed | attending | already_attending |
--         cancelled | expired | invalid | too_late
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
  v_in_window boolean;
begin
  perform app.expire_pending_bookings();
  select * into v_token from public.booking_tokens where token_hash = lower(p_token_hash) for update;
  if not found or v_token.expires_at < now() then
    return jsonb_build_object('result', 'invalid');
  end if;
  select * into v_booking from public.bookings where id = v_token.booking_id for update;
  select * into v_business from public.businesses where id = v_booking.business_id;

  -- La confirmación se mide solo por el clic (sección 18.2)
  if v_token.notification_id is not null then
    update public.notification_log set clicked_at = now(), clicked_action = v_token.purpose
    where id = v_token.notification_id and clicked_at is null;
  end if;

  -- Si ya estamos dentro del plazo del recordatorio, confirmar la reserva
  -- también cuenta como confirmar la asistencia (no se le pregunta dos veces).
  v_in_window := v_booking.starts_at - make_interval(hours => v_business.reminder_hours_before) <= now();

  if v_token.purpose = 'confirm' then
    if v_booking.status = 'pending' then
      update public.bookings set status = 'confirmed', customer_confirmed_at = now(),
        attendance_confirmed_at = case when v_in_window then now() else attendance_confirmed_at end
      where id = v_booking.id;
      v_result := 'confirmed';
    elsif v_booking.status = 'confirmed' then
      update public.bookings set customer_confirmed_at = coalesce(customer_confirmed_at, now()) where id = v_booking.id;
      v_result := 'already_confirmed';
    elsif v_booking.status = 'cancelled' and v_booking.cancel_reason = 'No se confirmó a tiempo' then
      v_result := 'expired';
    else
      v_result := 'cancelled';
    end if;
  elsif v_token.purpose = 'attend' then
    if v_booking.status in ('confirmed', 'checked_in', 'in_progress', 'completed') then
      if v_booking.attendance_confirmed_at is null then
        update public.bookings set attendance_confirmed_at = now() where id = v_booking.id;
        v_result := 'attending';
      else
        v_result := 'already_attending';
      end if;
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

  if v_result in ('confirmed', 'already_confirmed', 'attending', 'already_attending')
     or (v_token.purpose = 'cancel' and v_result = 'cancelled') then
    update public.booking_tokens set used_at = coalesce(used_at, now()) where id = v_token.id;
  end if;
  return jsonb_build_object('result', v_result, 'booking', app.booking_public_summary(v_booking.id));
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Tarea programada (Supabase Cron)
-- -----------------------------------------------------------------------------
-- Configuración por ambiente (no es secreta y no está expuesta en la API).
-- En producción: reminders_function_url = URL de la Edge Function "recordatorios".
-- Sin ese valor (local, tests) la tarea solo libera reservas pendientes vencidas.
create table app.settings (
  key text primary key,
  value text not null
);
revoke all on app.settings from public, anon, authenticated;

create or replace function app.run_scheduled_tasks()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
begin
  perform app.expire_pending_bookings();
  select value into v_url from app.settings where key = 'reminders_function_url';
  if v_url is not null and exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'select net.http_post(url := $1, body := ''{}''::jsonb, timeout_milliseconds := 30000)' using v_url;
  end if;
end;
$$;
revoke all on function app.run_scheduled_tasks() from public;

-- pg_cron y pg_net existen en Supabase (local y nube); no en el PostgreSQL de los tests.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule('agenda-tareas-programadas', '*/15 * * * *', 'select app.run_scheduled_tasks()');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Permisos
-- -----------------------------------------------------------------------------
revoke all on function app.booking_email_data(uuid) from public;
revoke all on function public.app_create_booking_token(uuid, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.app_create_booking_token(uuid, text, text, timestamptz, uuid) to service_role;
revoke all on function public.app_booking_email_data(uuid) from public, anon, authenticated;
grant execute on function public.app_booking_email_data(uuid) to service_role;
revoke all on function public.app_reminder_candidates(timestamptz, int) from public, anon, authenticated;
grant execute on function public.app_reminder_candidates(timestamptz, int) to service_role;
revoke all on function public.app_claim_reminder(uuid) from public, anon, authenticated;
grant execute on function public.app_claim_reminder(uuid) to service_role;
grant select, insert, update on public.notification_log to service_role;
