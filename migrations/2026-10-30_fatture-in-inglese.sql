-- ============================================================
-- Migrazione TOTIME — 2026-10-30
-- Fatture in inglese per i clienti esteri
--
-- Perche' serve: a un cliente straniero la fattura si scrive in
-- inglese. La lingua e' del cliente: la si sceglie nella sua scheda e
-- l'app propone in inglese le descrizioni da incollare su Fiscozen.
--
-- Cosa fa: clients.invoice_language: 'it' | 'en', di partenza 'it'.
-- Nessun importo cambia.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

alter table public.clients
  add column if not exists invoice_language text not null default 'it';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='clients_invoice_language_check') then
    alter table public.clients
      add constraint clients_invoice_language_check check (invoice_language in ('it','en'));
  end if;
end $$;

-- Verifica
select count(*)::text || ' su 1' as colonna_aggiunta
  from information_schema.columns
 where table_schema='public' and table_name='clients' and column_name='invoice_language';
