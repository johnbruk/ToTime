-- TOTIME v0.7.1 - User profile registration data
-- Eseguire in Supabase SQL Editor prima di pubblicare la v0.7.1.

create table if not exists public.user_profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() unique,
    first_name text not null default '',
    last_name text not null default '',
    company_name text not null default '',
    vat_number text not null default '',
    email text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create index if not exists idx_user_profiles_user_id on public.user_profiles(user_id);

-- Policies: ogni utente vede e modifica solo il proprio profilo.
drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles
for select using (auth.uid() = user_id);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles
for insert with check (auth.uid() = user_id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles
for update using (auth.uid() = user_id);

drop policy if exists "user_profiles_delete_own" on public.user_profiles;
create policy "user_profiles_delete_own" on public.user_profiles
for delete using (auth.uid() = user_id);
