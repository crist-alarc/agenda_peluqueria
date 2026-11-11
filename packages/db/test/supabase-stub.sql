-- Los roles son de todo el servidor (no de cada base): los archivos de test corren en paralelo y
-- pueden intentar crearlos a la vez, así que se ignora el error si otro ya lo creó.
do $$
declare r record;
begin
  for r in select * from (values
    ('anon', 'nologin noinherit'),
    ('authenticated', 'nologin noinherit'),
    ('service_role', 'nologin noinherit bypassrls')
  ) as t(name, opts) loop
    if not exists (select from pg_roles where rolname = r.name) then
      begin
        execute format('create role %I %s', r.name, r.opts);
      exception when duplicate_object or unique_violation then null;
      end;
    end if;
  end loop;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz default now(),
  created_at timestamptz not null default now()
);

-- Igual que en Supabase: el usuario sale de los claims del JWT de la petición
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Privilegios por defecto de Supabase sobre el esquema public
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
