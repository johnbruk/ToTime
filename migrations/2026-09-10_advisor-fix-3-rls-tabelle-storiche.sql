-- ============================================================
-- Migrazione TOTIME — 2026-09-10 (correzione advisor, parte 3)
--
-- Prestazioni delle policy RLS sulle tabelle PREESISTENTI.
--
-- Il Performance Advisor segnala che dentro le policy auth.uid()
-- viene rivalutato una volta PER RIGA. Scritto come (select auth.uid())
-- viene valutato una volta per query. Stessa condizione, stesso
-- risultato, solo eseguito una volta invece che diecimila.
--
-- ATTENZIONE a come e' fatto questo script, perche' e' la parte che
-- conta. Le policy delle tabelle storiche non sono mai state scritte
-- in questo repository: sono nate a mano in Supabase, e qui non
-- sappiamo ne' come si chiamano ne' che condizione hanno. Quindi lo
-- script NON le riscrive a modo suo: LEGGE quella che c'e', ci
-- sostituisce dentro il solo auth.uid(), e la ricrea IDENTICA in
-- tutto il resto — nome, comando, ruoli, permissiva o restrittiva,
-- e ogni altro pezzo della condizione.
--
-- Conseguenze pratiche:
--   * se una policy ha una condizione piu' stretta di user_id =
--     auth.uid(), quella condizione resta stretta;
--   * se si chiama in un modo inatteso, viene trovata lo stesso;
--   * le policy che non nominano auth.uid() non vengono toccate;
--   * quelle gia' corrette vengono saltate, quindi rilanciarlo non
--     le gonfia di (select (select ...)).
--
-- Non tocca dati. Sicura da rilanciare.
-- ============================================================

-- L'elenco di cosa e' stato toccato viene restituito come risultato,
-- non come NOTICE: nell'editor SQL di Supabase i NOTICE non si vedono,
-- e uno script che riscrive policy senza dire quali non e' una cosa da
-- lanciare al buio.
drop table if exists pg_temp.riscritte;
create temp table riscritte(tabella text, policy text);

do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_sql text;
  v_fatte int := 0;
begin
  for r in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      -- nomina auth.uid() ma non nella forma gia' corretta
      and ( (coalesce(qual,'')       ~* 'auth\.uid\(\)' and coalesce(qual,'')       !~* 'select\s+auth\.uid\(\)')
         or (coalesce(with_check,'') ~* 'auth\.uid\(\)' and coalesce(with_check,'') !~* 'select\s+auth\.uid\(\)') )
    order by tablename, policyname
  loop
    v_qual  := regexp_replace(r.qual,       'auth\.uid\(\)', '(select auth.uid())', 'gi');
    v_check := regexp_replace(r.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'gi');

    v_sql := format('create policy %I on %I.%I as %s for %s to %s',
                    r.policyname, r.schemaname, r.tablename,
                    case when r.permissive = 'RESTRICTIVE' then 'restrictive' else 'permissive' end,
                    r.cmd,
                    array_to_string(r.roles, ', '));
    if v_qual  is not null then v_sql := v_sql || format(' using (%s)', v_qual); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;

    -- drop e create nella stessa transazione: non esiste un istante in
    -- cui la tabella resta senza la sua policy
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    execute v_sql;
    v_fatte := v_fatte + 1;
    insert into pg_temp.riscritte values (r.tablename, r.policyname);
  end loop;
  raise notice 'policy riscritte: %', v_fatte;
end $$;

-- ------------------------------------------------------------
-- Esito
-- ------------------------------------------------------------
select 1 as ord, 'policy che rivalutano auth.uid() per riga' as controllo,
       count(*)::text as valore, 'deve essere 0' as atteso
from pg_policies
where schemaname='public'
  and ( (coalesce(qual,'')       ~* 'auth\.uid\(\)' and coalesce(qual,'')       !~* 'select\s+auth\.uid\(\)')
     or (coalesce(with_check,'') ~* 'auth\.uid\(\)' and coalesce(with_check,'') !~* 'select\s+auth\.uid\(\)') )
union all
select 2, 'tabelle con RLS attiva ma senza nemmeno una policy',
       count(*)::text, 'deve essere 0'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname)
union all
select 3, 'tabelle con RLS spenta',
       coalesce(string_agg(c.relname, ', '), 'nessuna'), 'deve essere nessuna'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 4, 'policy riscritte in questa esecuzione', count(*)::text,
       '0 se era gia' || chr(39) || ' stato lanciato'
from pg_temp.riscritte
union all
select 5, '  · ' || tabella, policy, ''
from pg_temp.riscritte
order by ord, controllo;
