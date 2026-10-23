-- ============================================================
-- Migrazione TOTIME — 2026-10-23
-- Spese all'estero: dove e' stata spesa
--
-- Perche' serve: per l'Agenzia delle Entrate (art. 54 c. 2-bis TUIR,
-- L. 207/2024 e D.L. 84/2025) carta o bonifico servono solo per vitto,
-- alloggio e taxi/NCC pagati IN ITALIA. All'estero (es. Svizzera) il
-- rimborso resta non tassato anche se pagato in contanti.
--
-- Cosa fa: travel_expenses.expense_country: 'IT' | 'CH' | 'ESTERO'.
-- Vuota = la dice la trasferta, altrimenti Italia. Nessun importo cambia.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

alter table public.travel_expenses
  add column if not exists expense_country text;

-- Verifica
select count(*)::text || ' su 1' as colonna_aggiunta
  from information_schema.columns
 where table_schema='public' and table_name='travel_expenses' and column_name='expense_country';
