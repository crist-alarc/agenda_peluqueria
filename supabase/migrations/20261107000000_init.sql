-- =============================================================
-- Agenda para peluquerías y barberías — esquema inicial
-- =============================================================

create extension if not exists btree_gist;

-- -------------------------------------------------------------
-- Configuración del negocio (una sola fila)
-- -------------------------------------------------------------
create table public.business_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Mi Peluquería',
  timezone text not null default 'America/Santiago',
  currency text not null default 'CLP',
  slot_interval_minutes int not null default 15 check (slot_interval_minutes between 5 and 120),
  booking_window_days int not null default 30 check (booking_window_days between 1 and 365),
  phone text,
  address text
);
insert into public.business_settings (id) values (1);

-- -------------------------------------------------------------
-- Administradores (usuarios de Supabase Auth con acceso al panel)
-- -------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- -------------------------------------------------------------
-- Servicios (corte, barba, tinte, ...)
-- -------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_minutes int not null check (duration_minutes between 5 and 480),
  price numeric(10, 2) not null default 0 check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Profesionales (peluqueros / barberos)
-- -------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Qué servicios realiza cada profesional
create table public.staff_services (
  staff_id uuid not null references public.staff (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (staff_id, service_id)
);

-- Horario semanal de cada profesional (0 = domingo ... 6 = sábado)
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index working_hours_staff_weekday_idx on public.working_hours (staff_id, weekday);

-- Bloqueos / ausencias (vacaciones, almuerzo, trámites, ...)
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  check (ends_at > starts_at)
);
create index time_off_staff_range_idx on public.time_off using gist (staff_id, tstzrange(starts_at, ends_at));

-- -------------------------------------------------------------
-- Citas
-- -------------------------------------------------------------
create type public.appointment_status as enum ('confirmed', 'completed', 'cancelled', 'no_show');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_phone text not null check (length(trim(customer_phone)) > 0),
  customer_email text,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Un profesional no puede tener dos citas activas que se solapen
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);
create index appointments_starts_at_idx on public.appointments (starts_at);

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.business_settings enable row level security;
alter table public.admins            enable row level security;
alter table public.services          enable row level security;
alter table public.staff             enable row level security;
alter table public.staff_services    enable row level security;
alter table public.working_hours     enable row level security;
alter table public.time_off          enable row level security;
alter table public.appointments      enable row level security;

-- Lectura pública del catálogo (lo necesita la página de reservas)
create policy "settings: lectura pública" on public.business_settings for select using (true);
create policy "services: lectura pública" on public.services for select using (active or public.is_admin());
create policy "staff: lectura pública" on public.staff for select using (active or public.is_admin());
create policy "staff_services: lectura pública" on public.staff_services for select using (true);
create policy "working_hours: lectura pública" on public.working_hours for select using (true);

-- Escritura sólo para administradores
create policy "settings: admin" on public.business_settings for update using (public.is_admin()) with check (public.is_admin());
create policy "services: admin" on public.services for all using (public.is_admin()) with check (public.is_admin());
create policy "staff: admin" on public.staff for all using (public.is_admin()) with check (public.is_admin());
create policy "staff_services: admin" on public.staff_services for all using (public.is_admin()) with check (public.is_admin());
create policy "working_hours: admin" on public.working_hours for all using (public.is_admin()) with check (public.is_admin());
create policy "time_off: admin" on public.time_off for all using (public.is_admin()) with check (public.is_admin());
create policy "admins: ver el propio" on public.admins for select using (user_id = auth.uid());

-- Las citas sólo las ven/gestionan administradores.
-- Los clientes reservan a través de la función book_appointment().
create policy "appointments: admin" on public.appointments for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================
-- Funciones (RPC)
-- =============================================================

-- Horarios disponibles para un servicio en una fecha (fecha local del negocio).
-- Si p_staff_id es null, devuelve los huecos de todos los profesionales que hacen el servicio.
create or replace function public.get_available_slots(
  p_service_id uuid,
  p_date date,
  p_staff_id uuid default null
)
returns table (slot_start timestamptz, staff_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select timezone as tz, slot_interval_minutes as step, booking_window_days as window_days
    from business_settings where id = 1
  ),
  svc as (
    select make_interval(mins => duration_minutes) as dur
    from services where id = p_service_id and active
  ),
  candidates as (
    select s.id as sid, wh.start_time, wh.end_time
    from staff s
    join staff_services ss on ss.staff_id = s.id and ss.service_id = p_service_id
    join working_hours wh on wh.staff_id = s.id and wh.weekday = extract(dow from p_date)::int
    where s.active and (p_staff_id is null or s.id = p_staff_id)
  ),
  slots as (
    select
      c.sid,
      (gs at time zone cfg.tz) as s_start,
      ((gs + svc.dur) at time zone cfg.tz) as s_end
    from candidates c
    cross join cfg
    cross join svc
    cross join lateral generate_series(
      p_date + c.start_time,
      p_date + c.end_time - svc.dur,
      make_interval(mins => cfg.step)
    ) as gs
  )
  select sl.s_start, sl.sid
  from slots sl, cfg
  where sl.s_start > now()
    and sl.s_start < now() + make_interval(days => cfg.window_days)
    and not exists (
      select 1 from appointments a
      where a.staff_id = sl.sid
        and a.status <> 'cancelled'
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(sl.s_start, sl.s_end)
    )
    and not exists (
      select 1 from time_off t
      where t.staff_id = sl.sid
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(sl.s_start, sl.s_end)
    )
  order by sl.s_start, sl.sid;
$$;

-- Reserva de una cita (la usan los clientes, sin necesidad de iniciar sesión).
create or replace function public.book_appointment(
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_notes text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_duration int;
  v_tz text;
  v_id uuid;
begin
  if coalesce(trim(p_customer_name), '') = '' or coalesce(trim(p_customer_phone), '') = '' then
    raise exception 'El nombre y el teléfono son obligatorios';
  end if;

  select duration_minutes into v_duration from services where id = p_service_id and active;
  if v_duration is null then
    raise exception 'El servicio seleccionado no está disponible';
  end if;

  select timezone into v_tz from business_settings where id = 1;

  if not exists (
    select 1
    from get_available_slots(p_service_id, (p_starts_at at time zone v_tz)::date, p_staff_id) s
    where s.slot_start = p_starts_at and s.staff_id = p_staff_id
  ) then
    raise exception 'El horario seleccionado ya no está disponible';
  end if;

  insert into appointments (staff_id, service_id, customer_name, customer_phone, customer_email, notes, starts_at, ends_at)
  values (
    p_staff_id,
    p_service_id,
    trim(p_customer_name),
    trim(p_customer_phone),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_starts_at,
    p_starts_at + make_interval(mins => v_duration)
  )
  returning id into v_id;

  return v_id;
exception
  when exclusion_violation then
    raise exception 'El horario seleccionado ya no está disponible';
end;
$$;

-- Agenda de un día (fecha local del negocio). Respeta RLS: sólo administradores.
create or replace function public.get_agenda(p_date date)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.appointment_status,
  customer_name text,
  customer_phone text,
  customer_email text,
  notes text,
  staff_id uuid,
  staff_name text,
  service_id uuid,
  service_name text,
  price numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.starts_at, a.ends_at, a.status, a.customer_name, a.customer_phone,
         a.customer_email, a.notes, a.staff_id, st.name, a.service_id, sv.name, sv.price
  from appointments a
  join staff st on st.id = a.staff_id
  join services sv on sv.id = a.service_id
  where (a.starts_at at time zone (select timezone from business_settings where id = 1))::date = p_date
  order by a.starts_at, st.name;
$$;

revoke all on function public.get_available_slots(uuid, date, uuid) from public;
revoke all on function public.book_appointment(uuid, uuid, timestamptz, text, text, text, text) from public;
revoke all on function public.get_agenda(date) from public;
grant execute on function public.get_available_slots(uuid, date, uuid) to anon, authenticated;
grant execute on function public.book_appointment(uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;
grant execute on function public.get_agenda(date) to authenticated;

-- Actualizaciones en tiempo real de la agenda (Supabase Realtime)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments;
  end if;
end $$;
