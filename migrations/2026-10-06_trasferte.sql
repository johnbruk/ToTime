-- ============================================================
-- Migrazione TOTIME — 2026-10-06
-- Le trasferte: un contenitore per le spese di un viaggio
--
-- Perche' serve: oggi ogni spesa e' sola al mondo. Il volo del 25/10 e
-- il rimborso km del 29/10 sono la stessa trasferta a Catania, e l'app
-- non lo sa: non puo' dire quanto e' costata una trasferta ne' quali
-- non sono ancora state riaddebitate.
--
-- Cosa fa: crea la tabella trips e aggiunge trip_id alle spese.
-- NON tocca una riga dei dati esistenti: tutte le spese partono con
-- trip_id vuoto e continuano a comparire esattamente dove compaiono
-- oggi, nell'elenco per giorno.
--
-- Da eseguire nel SQL Editor di Supabase (una volta sola).
-- Sicura da rilanciare: usa IF NOT EXISTS su tutto.
-- ============================================================

begin;

-- 1) La trasferta
create table if not exists public.trips(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  client_id uuid references public.clients(id),
  project_id uuid references public.projects(id),
  destination_city text,
  destination_country text,
  start_date date,
  end_date date,
  purpose text,
  -- draft | to_recharge | invoiced | closed
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now()
);

-- 2) La spesa puo' appartenere a una trasferta. Puo': i costi puri
--    (software, abbonamenti) non sono trasferte e restano senza.
--    ON DELETE SET NULL perche' eliminare una trasferta non deve mai
--    portarsi via le spese: si sganciano e tornano libere.
alter table public.travel_expenses
  add column if not exists trip_id uuid references public.trips(id) on delete set null;

-- 3) La commessa, se la migrazione WBS e' stata applicata. Condizionale
--    perche' chi non ha wbs_items non deve vedere un errore.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='wbs_items') then
    execute 'alter table public.trips add column if not exists wbs_id uuid references public.wbs_items(id)';
  else
    execute 'alter table public.trips add column if not exists wbs_id uuid';
  end if;
end $$;

-- 4) Indici per le letture che fa l'app
create index if not exists trips_user_start_idx on public.trips(user_id, start_date desc);
create index if not exists travel_expenses_trip_idx on public.travel_expenses(trip_id);

-- 5) RLS, lo stesso schema delle altre tabelle
alter table public.trips enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trips' and policyname='trips_select_own') then
    create policy trips_select_own on public.trips for select using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trips' and policyname='trips_insert_own') then
    create policy trips_insert_own on public.trips for insert with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trips' and policyname='trips_update_own') then
    create policy trips_update_own on public.trips for update using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trips' and policyname='trips_delete_own') then
    create policy trips_delete_own on public.trips for delete using ((select auth.uid()) = user_id);
  end if;
end $$;

commit;

-- ============================================================
-- Verifica: dopo il commit queste tre righe devono dare
--   trips            esiste
--   trip_id          esiste
--   spese toccate    0
-- ============================================================
select 'trips' as cosa,
       case when exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='trips')
            then 'esiste' else 'MANCA' end as esito
union all
select 'trip_id',
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='travel_expenses'
                           and column_name='trip_id')
            then 'esiste' else 'MANCA' end
union all
select 'spese toccate', count(*)::text
  from public.travel_expenses where trip_id is not null;
