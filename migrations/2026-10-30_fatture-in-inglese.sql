-- ============================================================
-- Migrazione TOTIME — 2026-10-30
-- Fatture: lingua, oggetto del contratto, cliente finale
--
-- Perche' serve: a un cliente straniero la fattura si scrive in
-- inglese, e la riga del lavoro di ogni fattura dice per quale
-- posizione si fattura, per quale cliente finale, il mese e i giorni.
--
-- Cosa fa: clients.invoice_language: 'it' | 'en', di partenza 'it';
-- e, per la riga del lavoro, l'oggetto del contratto (invoice_subject),
-- il cliente finale (invoice_end_client) e il riferimento del contratto
-- (invoice_reference). Tutti facoltativi.
-- Nessun importo cambia.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

alter table public.clients
  add column if not exists invoice_language text not null default 'it',
  add column if not exists invoice_subject text,
  add column if not exists invoice_end_client text,
  add column if not exists invoice_reference text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='clients_invoice_language_check') then
    alter table public.clients
      add constraint clients_invoice_language_check check (invoice_language in ('it','en'));
  end if;
end $$;

-- Verifica
select count(*)::text || ' su 4' as colonne_aggiunte
  from information_schema.columns
 where table_schema='public' and table_name='clients' and column_name in ('invoice_language','invoice_subject','invoice_end_client','invoice_reference');
