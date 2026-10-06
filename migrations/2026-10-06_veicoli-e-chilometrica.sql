-- ============================================================
-- Migrazione TOTIME — 2026-10-06 (b)
-- Il rimborso chilometrico fatto bene: il veicolo, il percorso, i km
--
-- Perche' serve: oggi «Rimborso KM» e' una voce di spesa come un pasto,
-- con una tariffa battuta a mano su ogni riga. Nei dati di ottobre
-- compaiono due righe «Rimborso KM 94,50 €» identiche e non c'e' modo
-- di sapere se sono lo stesso tragitto fatto due volte o un errore:
-- non e' scritto ne' quanti km ne' da dove a dove.
--
-- Cosa fa:
--   1) tabella vehicles — il veicolo, con la sua tariffa €/km
--   2) travel_expenses: veicolo, da, a, andata e ritorno
--   3) expense_categories.is_mileage — quali voci sono chilometriche
--
-- La tariffa si INSERISCE A MANO (le tabelle ACI si consultano su
-- costikm.aci.it e cambiano a gennaio). Quella del veicolo e' solo il
-- valore PROPOSTO: sulla singola spesa si corregge, e una chilometrica
-- si puo' registrare anche senza veicolo, mettendo km e tariffa a mano.
--
-- NON tocca una riga dei dati esistenti. Le spese chilometriche gia'
-- inserite restano come sono: hanno importo e data, e continuano a
-- comparire dove compaiono oggi.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

begin;

-- 1) Il veicolo
create table if not exists public.vehicles(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  plate text,
  -- benzina | diesel | ibrida | plugin | elettrica | altro
  fuel_type text,
  -- €/km, inserita a mano. E' il valore proposto, non un obbligo.
  rate_per_km numeric,
  -- da quale tabella ACI viene la tariffa, per sapere quando aggiornarla
  aci_year int,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) Il percorso, sulla spesa. I km stanno in quantity e la tariffa in
--    unit_rate, che ci sono gia': non serve una colonna nuova per
--    l'importo, che resta amount come per tutte le altre spese.
alter table public.travel_expenses
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
alter table public.travel_expenses
  add column if not exists from_place text;
alter table public.travel_expenses
  add column if not exists to_place text;
alter table public.travel_expenses
  add column if not exists round_trip boolean not null default false;

-- 3) Quali voci di spesa sono chilometriche. Senza questo l'app
--    dovrebbe indovinarlo dall'unita' di misura, che e' fragile.
--
--    Il riconoscimento automatico gira SOLO la prima volta, cioe' solo
--    se la colonna non c'era. Rilanciando la migrazione dopo aver
--    corretto a mano una voce da «chilometrica» a «no», un UPDATE
--    incondizionato gliela rimetterebbe su «si'»: la correzione
--    dell'utente verrebbe sovrascritta da una supposizione.
do $$
declare c_esisteva boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='expense_categories'
       and column_name='is_mileage'
  ) into c_esisteva;

  if not c_esisteva then
    alter table public.expense_categories
      add column is_mileage boolean not null default false;

    -- Le voci che hanno «km» come unita' lo sono quasi certamente:
    -- si parte da li', e in configurazione si corregge. Una volta sola.
    update public.expense_categories
       set is_mileage = true
     where lower(coalesce(unit_label,'')) in ('km','chilometri','kilometri')
        or lower(name) like '%chilometric%'
        or lower(name) like '%rimborso km%';

    raise notice 'is_mileage creata e compilata dal riconoscimento automatico.';
  else
    raise notice 'is_mileage c''era gia'': il riconoscimento automatico NON gira, le correzioni a mano restano.';
  end if;
end $$;

-- 4) Indici
create index if not exists vehicles_user_idx on public.vehicles(user_id, active);
create index if not exists travel_expenses_vehicle_idx on public.travel_expenses(vehicle_id);

-- 5) RLS, lo stesso schema delle altre tabelle
alter table public.vehicles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicles' and policyname='vehicles_select_own') then
    create policy vehicles_select_own on public.vehicles for select using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicles' and policyname='vehicles_insert_own') then
    create policy vehicles_insert_own on public.vehicles for insert with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicles' and policyname='vehicles_update_own') then
    create policy vehicles_update_own on public.vehicles for update using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='vehicles' and policyname='vehicles_delete_own') then
    create policy vehicles_delete_own on public.vehicles for delete using ((select auth.uid()) = user_id);
  end if;
end $$;

commit;

-- ============================================================
-- Verifica
-- ============================================================
select 'vehicles' as cosa,
       case when exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='vehicles')
            then 'esiste' else 'MANCA' end as esito
union all
select 'colonne sulle spese',
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='travel_expenses'
           and column_name in ('vehicle_id','from_place','to_place','round_trip'))
       || ' su 4'
union all
select 'voci chilometriche riconosciute',
       (select count(*)::text from public.expense_categories where is_mileage)
union all
select 'importi delle spese toccati', '0 — la migrazione non scrive su amount';
