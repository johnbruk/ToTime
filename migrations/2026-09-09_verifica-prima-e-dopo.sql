-- ============================================================
-- Migrazione TOTIME — 2026-09-09 (verifica)
--
-- NON MODIFICA NIENTE. Fotografa lo stato dei dati.
--
-- Si esegue DUE volte: una PRIMA di tutto e una DOPO il backfill.
-- Funziona in entrambi i momenti: le tabelle che ancora non esistono
-- rispondono "n/d" invece di far fallire tutto.
--
-- Poi si confrontano le due fotografie. I numeri della sezione A
-- devono essere IDENTICI: il backfill non deve toccare un solo
-- consuntivo, una sola spesa, una sola fattura. La sezione B invece
-- deve cambiare, ed e' quello che vogliamo.
-- ============================================================

-- Legge un valore anche se la tabella non esiste ancora.
create or replace function pg_temp.v(q text) returns text
language plpgsql as $$
declare r text;
begin
  execute q into r;
  return coalesce(r, '0');
exception
  when undefined_table or undefined_column then return 'n/d';
end $$;

select * from (values
  -- A) Quello che NON deve cambiare. Non solo i conteggi: anche le
  --    somme e un'impronta del contenuto, perche' un conteggio uguale
  --    non esclude che i valori siano stati riscritti.
  ('A. INTOCCABILE','consuntivi: quanti',            pg_temp.v('select count(*) from public.timesheet_entries')),
  ('A. INTOCCABILE','consuntivi: ore totali',        pg_temp.v('select coalesce(sum(hours),0) from public.timesheet_entries')),
  ('A. INTOCCABILE','consuntivi: impronta',          pg_temp.v('select coalesce(md5(string_agg(id::text||''~''||entry_date::text||''~''||coalesce(hours,0)::text, ''|'' order by id::text)),''vuoto'') from public.timesheet_entries')),
  ('A. INTOCCABILE','compensi manuali: quanti',      pg_temp.v('select count(*) from public.manual_entries')),
  ('A. INTOCCABILE','compensi manuali: importo',     pg_temp.v('select coalesce(sum(amount),0) from public.manual_entries')),
  ('A. INTOCCABILE','compensi mensili: quanti',      pg_temp.v('select count(*) from public.monthly_compensations')),
  ('A. INTOCCABILE','compensi mensili: importo',     pg_temp.v('select coalesce(sum(amount),0) from public.monthly_compensations')),
  ('A. INTOCCABILE','spese: quante',                 pg_temp.v('select count(*) from public.travel_expenses')),
  ('A. INTOCCABILE','spese: importo',                pg_temp.v('select coalesce(sum(amount),0) from public.travel_expenses')),
  ('A. INTOCCABILE','spese: impronta',               pg_temp.v('select coalesce(md5(string_agg(id::text||''~''||coalesce(amount,0)::text, ''|'' order by id::text)),''vuoto'') from public.travel_expenses')),
  ('A. INTOCCABILE','fatture: quante',               pg_temp.v('select count(*) from public.billing_headers')),
  ('A. INTOCCABILE','clienti: quanti',               pg_temp.v('select count(*) from public.clients')),
  ('A. INTOCCABILE','clienti: nomi',                 pg_temp.v('select coalesce(md5(string_agg(name,''|'' order by id::text)),''vuoto'') from public.clients')),
  ('A. INTOCCABILE','progetti: quanti',              pg_temp.v('select count(*) from public.projects')),
  ('A. INTOCCABILE','progetti: nomi',                pg_temp.v('select coalesce(md5(string_agg(name,''|'' order by id::text)),''vuoto'') from public.projects')),
  ('A. INTOCCABILE','attivita: quante',              pg_temp.v('select count(*) from public.activities')),

  -- B) Quello che DEVE cambiare: prima n/d o zero, dopo popolato.
  ('B. NUOVO','clienti con codice',                  pg_temp.v('select count(*) from public.clients where code is not null')),
  ('B. NUOVO','commesse',                            pg_temp.v('select count(*) from public.engagements')),
  ('B. NUOVO','progetti in una commessa',            pg_temp.v('select count(*) from public.projects where engagement_id is not null')),
  ('B. NUOVO','WBS',                                 pg_temp.v('select count(*) from public.wbs_items')),
  ('B. NUOVO','consuntivi collegati a una WBS',      pg_temp.v('select count(*) from public.timesheet_entries where wbs_id is not null')),
  ('B. NUOVO','spese collegate a una WBS',           pg_temp.v('select count(*) from public.travel_expenses where wbs_id is not null')),

  -- C) Quello che resta da bonificare a mano.
  ('C. DA BONIFICARE','consuntivi senza WBS',        pg_temp.v('select count(*) from public.timesheet_entries where wbs_id is null')),
  ('C. DA BONIFICARE','di cui senza progetto',       pg_temp.v('select count(*) from public.timesheet_entries where project_id is null')),
  ('C. DA BONIFICARE','compensi manuali senza WBS',  pg_temp.v('select count(*) from public.manual_entries where wbs_id is null')),
  ('C. DA BONIFICARE','spese senza WBS',             pg_temp.v('select count(*) from public.travel_expenses where wbs_id is null'))
) as t(sezione, misura, valore)
order by 1,2;
