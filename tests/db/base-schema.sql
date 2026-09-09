-- Riproduce lo schema TOTIME attuale piu il minimo ambiente Supabase
-- (auth.users, auth.uid, ruoli) per poter provare RLS in locale.
-- Non e una migrazione: serve solo ai test.
-- Ricostruisce l'essenziale dello schema TOTIME attuale, piu' il
-- minimo di ambiente Supabase (auth.users, auth.uid) per provare RLS.
create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated, anon;

create table public.clients(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  name text not null, compensation_type text, daily_rate numeric, standard_hours numeric,
  active boolean default true, base_city text, expense_policy jsonb default '[]'::jsonb);
create table public.projects(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  client_id uuid references public.clients(id), name text not null, active boolean default true);
create table public.activities(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  name text not null, active boolean default true);
create table public.timesheet_entries(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  entry_date date not null, client_id uuid references public.clients(id),
  project_id uuid references public.projects(id), activity_id uuid references public.activities(id),
  description text, hours numeric, notes text, status text,
  daily_rate_snapshot numeric, standard_hours_snapshot numeric);
create table public.manual_entries(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  entry_date date, client_id uuid references public.clients(id),
  project_id uuid references public.projects(id), activity_id uuid references public.activities(id),
  description text, amount numeric, notes text, status text);
create table public.monthly_compensations(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  year int, month int, client_id uuid references public.clients(id),
  project_id uuid references public.projects(id), description text, amount numeric);
create table public.expense_categories(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  name text, active boolean default true);
create table public.travel_expenses(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  expense_date date, client_id uuid references public.clients(id),
  project_id uuid references public.projects(id), expense_category_id uuid references public.expense_categories(id),
  description text, quantity numeric, unit_rate numeric, amount numeric,
  reimbursement_type text default 'own');
create table public.billing_headers(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  year int, month int, client_id uuid references public.clients(id), status text);

-- RLS come sta oggi in produzione: quattro policy per tabella, con
-- la UPDATE che ha solo USING e non WITH CHECK (e' il pattern usato
-- dalle migrazioni esistenti, es. user_profiles).
do $$
declare t text;
begin
  foreach t in array array['clients','projects','activities','timesheet_entries','manual_entries',
                           'monthly_compensations','expense_categories','travel_expenses','billing_headers']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = user_id)', t||'_select_own', t);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = user_id)', t||'_insert_own', t);
    execute format('create policy %I on public.%I for update using (auth.uid() = user_id)', t||'_update_own', t);
    execute format('create policy %I on public.%I for delete using (auth.uid() = user_id)', t||'_delete_own', t);
  end loop;
end $$;
