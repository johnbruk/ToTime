-- ============================================================
-- Migrazione TOTIME — 2026-09-10
-- Correzioni per gli advisor Supabase
--
-- Due segnalazioni che gli advisor avrebbero fatto sulle strutture
-- introdotte dalla migrazione commesse/WBS:
--
-- 1) "Function search_path mutable" (sicurezza). Una funzione senza
--    search_path fissato risolve i nomi delle tabelle secondo il
--    percorso di chi la chiama. Non e' sfruttabile qui, perche' le
--    funzioni non sono SECURITY DEFINER, ma e' una porta da chiudere
--    comunque: si fissa il percorso e non se ne parla piu'.
--
-- 2) "Unindexed foreign keys" (prestazioni). Una foreign key senza
--    indice rende lente le cancellazioni a cascata e le verifiche di
--    integrita'.
--
-- Sicura da rilanciare. Non tocca dati.
-- ============================================================

-- 1) search_path fissato su tutte le funzioni della migrazione
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'totime%'
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.f);
  end loop;
end $$;

-- 2) Indici sulle foreign key che ne erano prive
create index if not exists billing_lines_client_idx        on public.billing_lines(client_id);
create index if not exists billing_lines_engagement_idx    on public.billing_lines(engagement_id);
create index if not exists billing_lines_user_idx          on public.billing_lines(user_id);
create index if not exists engagement_references_user_idx  on public.engagement_references(user_id);
create index if not exists invoice_line_allocations_user_idx on public.invoice_line_allocations(user_id);
create index if not exists wbs_items_activity_idx          on public.wbs_items(activity_id);
-- il contatore ha la chiave (user_id, client_id, year): la foreign key
-- composta parte da client_id e quindi non la sfrutta
create index if not exists engagement_counters_client_idx  on public.engagement_counters(client_id, user_id);
-- questa e' preesistente, ma la foreign key c'era gia' senza indice
create index if not exists projects_client_idx             on public.projects(client_id);

-- Verifica
select 'funzioni senza search_path' as controllo, count(*)::text as quante
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname like 'totime%'
  and not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')
union all
select 'funzioni SECURITY DEFINER', count(*)::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'totime%' and p.prosecdef
union all
select 'tabelle nuove senza RLS', count(*)::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
  and c.relname in ('engagements','engagement_references','wbs_items','engagement_counters','billing_lines','invoice_line_allocations')
union all
select 'policy UPDATE senza WITH CHECK', count(*)::text
from pg_policies where schemaname='public' and cmd='UPDATE' and with_check is null
  and tablename in ('engagements','engagement_references','wbs_items','engagement_counters','billing_lines','invoice_line_allocations');
