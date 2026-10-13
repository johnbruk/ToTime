-- ============================================================
-- Migrazione TOTIME — 2026-10-13
-- Gli incarichi continuativi tengono insieme i loro consuntivi
--
-- Perche' serve: un incarico continuativo genera in un colpo i
-- consuntivi di un periodo, e li tiene insieme con un codice
-- (tm_batch_id). La colonna non era in nessuna migrazione: dove il
-- database non l'aveva, l'app la toglieva in silenzio e salvava i
-- consuntivi lo stesso. Erano consuntivi qualunque: la pagina
-- «Incarichi continuativi» diceva «nessuno», l'etichetta T&M non
-- c'era, e il periodo non si poteva eliminare in un colpo.
--
-- Cosa fa: aggiunge la colonna, vuota. NON tocca una riga dei dati
-- esistenti. Finche' non c'e', l'app non genera piu' incarichi a meta':
-- si ferma e dice di lanciare questa migrazione.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

begin;

alter table public.timesheet_entries add column if not exists tm_batch_id text;

-- l'eliminazione di un periodo cerca le righe per codice
create index if not exists timesheet_entries_tm_batch_idx
  on public.timesheet_entries(user_id, tm_batch_id)
  where tm_batch_id is not null;

commit;

-- ============================================================
-- Verifica: deve dire «esiste»
-- ============================================================
select 'colonna tm_batch_id' as cosa,
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='timesheet_entries'
                           and column_name='tm_batch_id')
            then 'esiste' else 'MANCA' end as esito;
