-- ============================================================
-- Migrazione TOTIME — 2026-09-22
--
-- Le tabelle nuove non assegnano il proprietario da sole.
--
-- Sulle tabelle storiche user_id ha "default auth.uid()": l'app
-- inserisce senza nominarlo e ci pensa il database. Le tabelle del
-- modello commesse/WBS sono nate senza quel default, e l'app le
-- tratta allo stesso modo. Risultato: user_id arriva NULL.
--
-- Il guasto si vede lontano da dove nasce. Creando una commessa, il
-- trigger che assegna il progressivo chiama il contatore passandogli
-- quel NULL; la policy del contatore pretende auth.uid() = user_id,
-- NULL non la soddisfa, e l'utente legge:
--
--   new row violates row-level security policy
--   for table "engagement_counters"
--
-- che del problema vero non dice niente.
--
-- Sicura da rilanciare. Non tocca dati.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['engagements','engagement_references','wbs_items',
                           'engagement_counters','billing_lines','invoice_line_allocations']
  loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Esito: tutte e sei devono avere il default
-- ------------------------------------------------------------
select c.relname as tabella,
       case when a.atthasdef then 'sì' else 'NO — da sistemare' end as "user_id si compila da solo"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id'
where n.nspname = 'public'
  and c.relname in ('engagements','engagement_references','wbs_items',
                    'engagement_counters','billing_lines','invoice_line_allocations')
order by c.relname;
