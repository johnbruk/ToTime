-- =====================================================================
-- Timesheet — schema iniziale (multi-studio, ruoli, economia separata)
-- Da eseguire nel SQL Editor di un progetto Supabase NUOVO e vuoto.
-- Sicuro da rilanciare.
--
-- Principio: le policy di Postgres proteggono le RIGHE, non le colonne.
-- Tutto ciò che è economico vive quindi in tabelle proprie, che i ruoli
-- senza permesso non possono interrogare affatto.
-- =====================================================================

create extension if not exists pgcrypto;
create schema if not exists app;

-- ---------------------------------------------------------------------
-- Utility
-- ---------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. Studi, ruoli, permessi, iscrizioni
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  brand       jsonb not null default '{}'::jsonb,   -- {name, accent, accent2, logo}
  plan        text not null default 'free',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.roles (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  code       text not null,
  name       text not null,
  is_system  boolean not null default false,
  sort_order int not null default 0,
  unique (org_id, code)
);

create table if not exists public.role_permissions (
  role_id    uuid not null references public.roles(id) on delete cascade,
  permission text not null,
  primary key (role_id, permission)
);

create table if not exists public.memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid,                     -- null finché l'invito non è accettato
  email      text not null,
  full_name  text not null default '',
  role_id    uuid not null references public.roles(id),
  status     text not null default 'invited'
             check (status in ('invited','active','disabled')),
  invited_at timestamptz not null default now(),
  joined_at  timestamptz,
  unique (org_id, email)
);
create unique index if not exists memberships_org_user_uidx
  on public.memberships (org_id, user_id) where user_id is not null;
create index if not exists memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------
-- 2. Le due funzioni cardine
--    SECURITY DEFINER: girano fuori dal controllo delle policy, ed è
--    quello che spezza la ricorsione (la policy su memberships avrebbe
--    altrimenti bisogno di leggere memberships per decidere di sé).
-- ---------------------------------------------------------------------
create or replace function app.my_orgs() returns setof uuid
language sql security definer stable set search_path = public, pg_temp as $$
  select m.org_id from public.memberships m
  where m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function app.has_perm(p_permission text, p_org uuid) returns boolean
language sql security definer stable set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.user_id = auth.uid()
      and m.status  = 'active'
      and m.org_id  = p_org
      and rp.permission = p_permission
  )
$$;

-- ---------------------------------------------------------------------
-- 3. Anagrafiche (nessun dato economico qui dentro)
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  name           text not null,
  city           text,
  standard_hours numeric not null default 8 check (standard_hours > 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Chi segue quale progetto: serve al ruolo Responsabile
create table if not exists public.project_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null,
  primary key (project_id, user_id)
);

-- ---------------------------------------------------------------------
-- 4. Ore — quantità e contesto, nessun euro
-- ---------------------------------------------------------------------
create table if not exists public.timesheet_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null,                       -- autore delle ore
  entry_date  date not null,
  client_id   uuid references public.clients(id) on delete set null,
  project_id  uuid references public.projects(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  hours       numeric not null check (hours > 0 and hours <= 24),
  description text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists entries_org_date_idx on public.timesheet_entries (org_id, entry_date);
create index if not exists entries_user_idx     on public.timesheet_entries (user_id);

-- ---------------------------------------------------------------------
-- 5. Economia — tabelle separate, storicizzate
-- ---------------------------------------------------------------------
create table if not exists public.client_rates (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  daily_rate numeric not null check (daily_rate >= 0),
  valid_from date not null default date '2000-01-01',
  unique (client_id, valid_from)
);

create table if not exists public.member_costs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null,
  cost_daily_rate numeric not null check (cost_daily_rate >= 0),
  valid_from      date not null default date '2000-01-01',
  unique (org_id, user_id, valid_from)
);

-- Ricavo e costo stanno in due tabelle DIVERSE: l'Amministrazione deve
-- poter vedere quanto si fattura senza vedere quanto costano i colleghi.
create table if not exists public.entry_revenue (
  entry_id    uuid primary key references public.timesheet_entries(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  amount      numeric not null default 0,
  computed_at timestamptz not null default now()
);

create table if not exists public.entry_cost (
  entry_id    uuid primary key references public.timesheet_entries(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  amount      numeric not null default 0,
  computed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Chiusura del mese
-- ---------------------------------------------------------------------
create table if not exists public.period_locks (
  org_id    uuid not null references public.organizations(id) on delete cascade,
  year      int  not null,
  month     int  not null check (month between 1 and 12),
  locked_by uuid not null,
  locked_at timestamptz not null default now(),
  primary key (org_id, year, month)
);

-- ---------------------------------------------------------------------
-- 7. Valorizzazione automatica delle ore
--    Il collaboratore inserisce le ore; il database le valorizza da solo
--    usando la tariffa in vigore ALLA DATA della prestazione. Così chi
--    inserisce non ha mai bisogno di leggere le tariffe.
-- ---------------------------------------------------------------------
create or replace function app.value_entry() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_std  numeric := 8;
  v_rate numeric := 0;
  v_cost numeric := 0;
begin
  select coalesce(c.standard_hours, 8) into v_std
    from public.clients c where c.id = new.client_id;
  v_std := coalesce(v_std, 8);

  select cr.daily_rate into v_rate
    from public.client_rates cr
   where cr.client_id = new.client_id and cr.valid_from <= new.entry_date
   order by cr.valid_from desc limit 1;

  select mc.cost_daily_rate into v_cost
    from public.member_costs mc
   where mc.org_id = new.org_id and mc.user_id = new.user_id
     and mc.valid_from <= new.entry_date
   order by mc.valid_from desc limit 1;

  insert into public.entry_revenue (entry_id, org_id, amount)
  values (new.id, new.org_id, coalesce(v_rate,0) / v_std * new.hours)
  on conflict (entry_id) do update
    set amount = excluded.amount, computed_at = now();

  insert into public.entry_cost (entry_id, org_id, amount)
  values (new.id, new.org_id, coalesce(v_cost,0) / v_std * new.hours)
  on conflict (entry_id) do update
    set amount = excluded.amount, computed_at = now();

  return new;
end $$;

drop trigger if exists trg_value_entry on public.timesheet_entries;
create trigger trg_value_entry
after insert or update of hours, entry_date, client_id, user_id
on public.timesheet_entries
for each row execute function app.value_entry();

-- Se cambia una tariffa, si rivalorizzano le ore interessate
create or replace function app.revalue_client() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in select * from public.timesheet_entries e
            where e.client_id = coalesce(new.client_id, old.client_id) loop
    update public.timesheet_entries set updated_at = now() where id = r.id;
  end loop;
  return null;
end $$;

drop trigger if exists trg_revalue_client on public.client_rates;
create trigger trg_revalue_client
after insert or update or delete on public.client_rates
for each row execute function app.revalue_client();

-- ---------------------------------------------------------------------
-- 8. Il blocco del mese è applicato dal database, non dall'interfaccia
-- ---------------------------------------------------------------------
create or replace function app.enforce_period_lock() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid;
  v_dates date[];
  d date;
begin
  if tg_op = 'DELETE' then
    v_org := old.org_id; v_dates := array[old.entry_date];
  elsif tg_op = 'UPDATE' then
    v_org := new.org_id; v_dates := array[old.entry_date, new.entry_date];
  else
    v_org := new.org_id; v_dates := array[new.entry_date];
  end if;

  foreach d in array v_dates loop
    if exists (
      select 1 from public.period_locks pl
       where pl.org_id = v_org
         and pl.year   = extract(year  from d)::int
         and pl.month  = extract(month from d)::int
    ) and not app.has_perm('periods.lock', v_org) then
      raise exception 'Il mese %/% è chiuso e non è più modificabile.',
        lpad(extract(month from d)::text, 2, '0'), extract(year from d)::int
        using errcode = 'check_violation';
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

drop trigger if exists trg_period_lock on public.timesheet_entries;
create trigger trg_period_lock
before insert or update or delete on public.timesheet_entries
for each row execute function app.enforce_period_lock();

-- ---------------------------------------------------------------------
-- 9. Row Level Security
-- ---------------------------------------------------------------------
alter table public.organizations   enable row level security;
alter table public.roles           enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships     enable row level security;
alter table public.clients         enable row level security;
alter table public.projects        enable row level security;
alter table public.activities      enable row level security;
alter table public.project_members enable row level security;
alter table public.timesheet_entries enable row level security;
alter table public.client_rates    enable row level security;
alter table public.member_costs    enable row level security;
alter table public.entry_revenue   enable row level security;
alter table public.entry_cost      enable row level security;
alter table public.period_locks    enable row level security;

-- Studi: vedo solo quelli a cui appartengo
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select
  using (id in (select app.my_orgs()));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update
  using (app.has_perm('org.manage', id)) with check (app.has_perm('org.manage', id));

-- Ruoli e permessi: leggibili dai membri, modificabili da chi gestisce le persone
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select
  using (org_id in (select app.my_orgs()));
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all
  using (app.has_perm('members.manage', org_id))
  with check (app.has_perm('members.manage', org_id));

drop policy if exists rperm_select on public.role_permissions;
create policy rperm_select on public.role_permissions for select
  using (exists (select 1 from public.roles r
                  where r.id = role_id and r.org_id in (select app.my_orgs())));
drop policy if exists rperm_write on public.role_permissions;
create policy rperm_write on public.role_permissions for all
  using (exists (select 1 from public.roles r
                  where r.id = role_id and app.has_perm('members.manage', r.org_id)))
  with check (exists (select 1 from public.roles r
                  where r.id = role_id and app.has_perm('members.manage', r.org_id)));

-- Iscrizioni: le vedo se sono dello studio; le gestisce chi ne ha il permesso
drop policy if exists memb_select on public.memberships;
create policy memb_select on public.memberships for select
  using (org_id in (select app.my_orgs()));
drop policy if exists memb_write on public.memberships;
create policy memb_write on public.memberships for all
  using (app.has_perm('members.manage', org_id))
  with check (app.has_perm('members.manage', org_id));

-- Anagrafiche: tutti i membri leggono, solo chi ha il permesso scrive
do $$
declare t text;
begin
  foreach t in array array['clients','projects','activities'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format('create policy %I on public.%I for select using (org_id in (select app.my_orgs()))', t||'_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format('create policy %I on public.%I for all using (app.has_perm(''registry.manage'', org_id)) with check (app.has_perm(''registry.manage'', org_id))', t||'_write', t);
  end loop;
end $$;

drop policy if exists pmem_select on public.project_members;
create policy pmem_select on public.project_members for select
  using (org_id in (select app.my_orgs()));
drop policy if exists pmem_write on public.project_members;
create policy pmem_write on public.project_members for all
  using (app.has_perm('registry.manage', org_id))
  with check (app.has_perm('registry.manage', org_id));

-- Ore: le mie sempre; quelle altrui solo con il permesso giusto
drop policy if exists entries_select on public.timesheet_entries;
create policy entries_select on public.timesheet_entries for select
  using (
    org_id in (select app.my_orgs())
    and (
      user_id = auth.uid()
      or app.has_perm('hours.read.all', org_id)
      or (
        app.has_perm('hours.read.team', org_id)
        and exists (select 1 from public.project_members pm
                     where pm.project_id = timesheet_entries.project_id
                       and pm.user_id = auth.uid())
      )
    )
  );

drop policy if exists entries_insert on public.timesheet_entries;
create policy entries_insert on public.timesheet_entries for insert
  with check (
    org_id in (select app.my_orgs())
    and user_id = auth.uid()
    and app.has_perm('hours.write.own', org_id)
  );

drop policy if exists entries_update on public.timesheet_entries;
create policy entries_update on public.timesheet_entries for update
  using (org_id in (select app.my_orgs())
         and (user_id = auth.uid() or app.has_perm('hours.manage.all', org_id)))
  with check (org_id in (select app.my_orgs())
         and (user_id = auth.uid() or app.has_perm('hours.manage.all', org_id)));

drop policy if exists entries_delete on public.timesheet_entries;
create policy entries_delete on public.timesheet_entries for delete
  using (org_id in (select app.my_orgs())
         and (user_id = auth.uid() or app.has_perm('hours.manage.all', org_id)));

-- Economia: si legge solo con il permesso, si scrive solo con quello di gestione
drop policy if exists rates_select on public.client_rates;
create policy rates_select on public.client_rates for select
  using (app.has_perm('rates.read', org_id));
drop policy if exists rates_write on public.client_rates;
create policy rates_write on public.client_rates for all
  using (app.has_perm('rates.manage', org_id))
  with check (app.has_perm('rates.manage', org_id));

drop policy if exists costs_select on public.member_costs;
create policy costs_select on public.member_costs for select
  using (app.has_perm('costs.read', org_id));
drop policy if exists costs_write on public.member_costs;
create policy costs_write on public.member_costs for all
  using (app.has_perm('costs.manage', org_id))
  with check (app.has_perm('costs.manage', org_id));

drop policy if exists revenue_select on public.entry_revenue;
create policy revenue_select on public.entry_revenue for select
  using (app.has_perm('revenue.read', org_id));

drop policy if exists cost_select on public.entry_cost;
create policy cost_select on public.entry_cost for select
  using (app.has_perm('costs.read', org_id));

-- Mesi chiusi: li vedono tutti (serve a disabilitare i pulsanti), li chiude chi può
drop policy if exists locks_select on public.period_locks;
create policy locks_select on public.period_locks for select
  using (org_id in (select app.my_orgs()));
drop policy if exists locks_write on public.period_locks;
create policy locks_write on public.period_locks for all
  using (app.has_perm('periods.lock', org_id))
  with check (app.has_perm('periods.lock', org_id));

-- ---------------------------------------------------------------------
-- 10. Creazione di uno studio: ruoli predefiniti + primo titolare
-- ---------------------------------------------------------------------
create or replace function app.seed_roles(p_org uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role uuid;
  v_defs jsonb := jsonb_build_array(
    jsonb_build_object('code','collaboratore','name','Collaboratore','sort',10,
      'perms', jsonb_build_array('hours.write.own','registry.read')),
    jsonb_build_object('code','responsabile','name','Responsabile','sort',20,
      'perms', jsonb_build_array('hours.write.own','registry.read','hours.read.team')),
    jsonb_build_object('code','amministrazione','name','Amministrazione','sort',30,
      'perms', jsonb_build_array('registry.read','registry.manage','hours.read.all',
                                 'hours.manage.all','rates.read','rates.manage',
                                 'revenue.read','periods.lock')),
    jsonb_build_object('code','titolare','name','Titolare','sort',40,
      'perms', jsonb_build_array('hours.write.own','registry.read','registry.manage',
                                 'hours.read.all','hours.manage.all','rates.read','rates.manage',
                                 'costs.read','costs.manage','revenue.read','margin.read',
                                 'periods.lock','members.manage','org.manage'))
  );
  d jsonb;
  p text;
begin
  for d in select * from jsonb_array_elements(v_defs) loop
    insert into public.roles (org_id, code, name, is_system, sort_order)
    values (p_org, d->>'code', d->>'name', true, (d->>'sort')::int)
    on conflict (org_id, code) do update set name = excluded.name
    returning id into v_role;

    for p in select jsonb_array_elements_text(d->'perms') loop
      insert into public.role_permissions (role_id, permission)
      values (v_role, p) on conflict do nothing;
    end loop;
  end loop;
end $$;

create or replace function public.create_org(p_name text, p_slug text, p_email text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_role uuid;
begin
  if auth.uid() is null then
    raise exception 'Serve essere autenticati per creare uno studio.';
  end if;

  insert into public.organizations (name, slug) values (p_name, p_slug)
  returning id into v_org;

  perform app.seed_roles(v_org);

  select id into v_role from public.roles
   where org_id = v_org and code = 'titolare';

  insert into public.memberships (org_id, user_id, email, role_id, status, joined_at)
  values (v_org, auth.uid(), p_email, v_role, 'active', now());

  return v_org;
end $$;

-- Accettazione invito: collega l'utente appena registrato alla riga
-- creata dal titolare con la sua email.
create or replace function public.accept_invite(p_email text)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update public.memberships
     set user_id = auth.uid(), status = 'active', joined_at = now()
   where lower(email) = lower(p_email)
     and user_id is null
     and status = 'invited';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 11. Trigger di aggiornamento
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['organizations','clients','timesheet_entries'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$s
                    for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 12. Permessi di base (come li imposta Supabase)
-- ---------------------------------------------------------------------
grant usage on schema public, app to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema app, public to authenticated;
