-- Aviso del Security Advisor: fijar el search_path de la función del candado de liquidaciones.
alter function app.settlement_guard() set search_path = public, pg_temp;
