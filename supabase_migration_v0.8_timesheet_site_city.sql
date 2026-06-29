-- TOTIME v0.8 - Separazione Sede e Luogo/Città nel Timesheet

alter table public.timesheet_entries
add column if not exists work_site text;

alter table public.timesheet_entries
add column if not exists work_city text;
