-- Datos de ejemplo (opcional). Ejecutar después de la migración.
insert into public.services (id, name, description, duration_minutes, price) values
  ('00000000-0000-0000-0000-000000000101', 'Corte de pelo', 'Corte clásico o moderno con lavado', 30, 12000),
  ('00000000-0000-0000-0000-000000000102', 'Corte + Barba', 'Corte de pelo y perfilado de barba', 45, 18000),
  ('00000000-0000-0000-0000-000000000103', 'Arreglo de barba', 'Perfilado con navaja y toalla caliente', 20, 8000),
  ('00000000-0000-0000-0000-000000000104', 'Tinte', 'Coloración completa', 90, 35000);

insert into public.staff (id, name, role) values
  ('00000000-0000-0000-0000-000000000201', 'Carlos', 'Barbero'),
  ('00000000-0000-0000-0000-000000000202', 'Valentina', 'Estilista');

insert into public.staff_services (staff_id, service_id) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000103'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000104');

-- Lunes a sábado, 10:00–14:00 y 15:00–19:00
insert into public.working_hours (staff_id, weekday, start_time, end_time)
select s.id, d, t.start_time, t.end_time
from public.staff s
cross join generate_series(1, 6) as d
cross join (values ('10:00'::time, '14:00'::time), ('15:00'::time, '19:00'::time)) as t(start_time, end_time);
