-- =============================================================================
-- Correcciones del Security Advisor de Supabase (directrices, sección 21)
-- =============================================================================

-- search_path fijo en todas las funciones del esquema app
alter function app.current_user_id() set search_path = public, pg_temp;
alter function app.touch_updated_at() set search_path = public, pg_temp;
alter function app.slugify(text) set search_path = pg_catalog, pg_temp;

-- rls_auto_enable es el event trigger de Supabase que activa RLS en tablas nuevas.
-- Se mantiene, pero nadie necesita llamarlo por la API.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- app_create_business y app_add_member son SECURITY DEFINER a propósito: validan
-- permisos dentro de la función (sesión iniciada / owner-admin del negocio) y solo
-- usuarios con sesión pueden ejecutarlas (anon ya no tiene permiso).
