-- Security Advisor (A2): app.platform_today sin search_path fijo.
alter function app.platform_today() set search_path = pg_catalog, pg_temp;
