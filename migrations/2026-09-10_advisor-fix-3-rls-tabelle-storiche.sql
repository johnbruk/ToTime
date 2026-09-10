-- ============================================================
-- Migrazione TOTIME — 2026-09-10 (correzione advisor, parte 3)
--
-- FACOLTATIVA, e da leggere prima di lanciare.
--
-- Stessa correzione della parte 2, ma sulle tabelle PREESISTENTI.
-- Riscrive le loro policy RLS: il comportamento resta identico
-- (stessa condizione, stessa proprieta' verificata), cambia solo
-- quante volte viene valutato auth.uid().
--
-- Perche' e' in un file a parte: sono le policy che proteggono i dati
-- di sempre. Riscriverle e' sicuro ma non e' una cosa da fare di
-- straforo insieme ad altro. Se qualcosa andasse storto, le policy
-- vengono ricreate identiche a quelle attuali salvo il (select).
--
-- Sicura da rilanciare. Non tocca dati.
-- ============================================================

do $$
declare t text; n int;
begin
  foreach t in array array['clients','projects','activities','timesheet_entries',
                           'manual_entries','monthly_compensations','expense_categories',
                           'travel_expenses','billing_headers','invoice_templates',
                           'app_settings','tax_settings','tax_payments','user_profiles']
  loop
    -- si salta quello che non esiste, invece di fermare tutto
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', t||'_select_own', t);
    execute format('create policy %I on public.%I for select using ((select auth.uid()) = user_id)', t||'_select_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert_own', t);
    execute format('create policy %I on public.%I for insert with check ((select auth.uid()) = user_id)', t||'_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_update_own', t);
    execute format('create policy %I on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t||'_update_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete_own', t);
    execute format('create policy %I on public.%I for delete using ((select auth.uid()) = user_id)', t||'_delete_own', t);
  end loop;
end $$;

-- Verifica: nessuna tabella deve essere rimasta senza policy
select c.relname as tabella,
       count(p.policyname)::text as policy,
       case when c.relrowsecurity then 'attiva' else 'SPENTA' end as rls
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_policies p on p.schemaname='public' and p.tablename=c.relname
where n.nspname='public' and c.relkind='r'
group by c.relname, c.relrowsecurity
order by c.relname;
