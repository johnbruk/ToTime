-- =====================================================================
-- SOLO PER I TEST LOCALI — non va eseguito su Supabase.
-- Riproduce ciò che Supabase fornisce di suo: lo schema auth con la
-- funzione uid() e i ruoli anon/authenticated.
-- =====================================================================
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

grant authenticated to postgres;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;

grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

-- Raccolta dei risultati
drop table if exists public.test_results;
create table public.test_results (
  id      serial primary key,
  section text,
  label   text,
  passed  boolean,
  detail  text
);
grant insert, select on public.test_results to authenticated;
grant usage, select on sequence public.test_results_id_seq to authenticated;

create or replace function public.chk(p_section text, p_cond boolean, p_label text, p_detail text default '')
returns void language plpgsql as $$
begin
  insert into public.test_results (section, label, passed, detail)
  values (p_section, p_label, p_cond, p_detail);
end $$;
grant execute on function public.chk(text, boolean, text, text) to authenticated;

create or replace function public.login(p_uid uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, false);
$$;
grant execute on function public.login(uuid) to authenticated;
