-- ============================================================
-- Migrazione TOTIME — 2026-09-10 (correzione advisor, parte 2)
--
-- "Auth RLS Initialization Plan": quando una policy scrive
-- auth.uid() = user_id, PostgreSQL rivaluta auth.uid() UNA VOLTA PER
-- RIGA. Scrivendo (select auth.uid()) = user_id la valuta una volta
-- sola per query e riusa il risultato.
--
-- Il comportamento non cambia di una virgola: cambia quante volte
-- viene chiamata la funzione. Su tabelle con molte righe la
-- differenza si sente.
--
-- Qui si correggono SOLO le tabelle introdotte dalla migrazione
-- commesse/WBS. Le tabelle preesistenti sono in un file a parte,
-- perche' toccare policy gia' in uso e' una decisione a se'.
--
-- Sicura da rilanciare. Non tocca dati.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['engagements','engagement_references','wbs_items',
                           'engagement_counters','billing_lines','invoice_line_allocations']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t||'_select_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t||'_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_update_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t||'_update_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t||'_delete_own', t);
  end loop;
end $$;

select 'policy delle tabelle nuove che rivalutano auth.uid() per riga' as controllo,
       count(*)::text as quante
from pg_policies
where schemaname='public'
  and tablename in ('engagements','engagement_references','wbs_items','engagement_counters','billing_lines','invoice_line_allocations')
  and (coalesce(qual,'') ~ 'auth\.uid\(\)' and coalesce(qual,'') !~ 'select auth\.uid\(\)'
       or coalesce(with_check,'') ~ 'auth\.uid\(\)' and coalesce(with_check,'') !~ 'select auth\.uid\(\)');
