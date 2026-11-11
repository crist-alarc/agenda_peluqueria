-- Security Advisor: search_path fijo también en el trigger de la fase 2B.
-- (booking_tokens sin políticas es intencional: solo la usan funciones del servidor.)
alter function app.booking_clear_hold() set search_path = public, pg_temp;
