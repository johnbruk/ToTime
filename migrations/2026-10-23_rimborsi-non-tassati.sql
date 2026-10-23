-- ============================================================
-- Migrazione TOTIME — 2026-10-23
-- Rimborsi spese non tassati: a chi e' intestata la fattura
--
-- Perche' serve: il commercialista ha confermato (22/10/2026) che per
-- il forfettario i rimborsi documentati non sono reddito. Ce ne sono
-- due tipi, e li distingue il documento:
--   fattura intestata a me       -> rimborso analitico
--   fattura intestata al cliente -> rimborso ex art. 15 (anticipazione)
-- Se la spesa si puo' fatturare, lo scontrino non basta: il rimborso
-- resta tassato. Il rimborso chilometrico resta tassato sempre.
--
-- Cosa fa:
--   1. travel_expenses.document_type: 'mia' | 'cliente' | 'scontrino'
--   2. expense_categories.invoiceable: la voce si puo' fatturare?
--      Si' per tutte, tranne taxi, metro/ATM, pedaggio e chilometrica.
--   3. Le spese «piè di lista» diventano «rimborso in fattura»: il pie'
--      di lista non si offre piu'.
--
-- Nessun importo cambia. Le spese gia' inserite restano senza
-- documento, quindi tassate come prima, finche' non si dice a chi e'
-- intestata la fattura.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

begin;

alter table public.travel_expenses
  add column if not exists document_type text;

alter table public.expense_categories
  add column if not exists invoiceable boolean not null default true;

update public.expense_categories
   set invoiceable = false
 where invoiceable = true
   and (is_mileage = true
        or lower(name) ~ '(^|[^a-z])(taxi|atm|metro|pedagg|autobus)');

update public.travel_expenses
   set reimbursement_type = 'invoice', reimbursable = true
 where reimbursement_type = 'expense_report';

commit;

-- ============================================================
-- Verifica
-- ============================================================
select 'colonne aggiunte' as cosa,
       (select count(*)::text from information_schema.columns
         where table_schema='public'
           and ((table_name='travel_expenses' and column_name='document_type')
             or (table_name='expense_categories' and column_name='invoiceable'))) || ' su 2' as esito
union all
select 'voci dove basta la ricevuta',
       coalesce((select string_agg(name, ', ' order by name) from public.expense_categories where invoiceable = false), 'nessuna')
union all
select 'spese a piè di lista rimaste',
       (select count(*)::text from public.travel_expenses where reimbursement_type = 'expense_report')
union all
select 'importi cambiati', '0';
