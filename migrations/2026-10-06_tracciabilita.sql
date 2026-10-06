-- ============================================================
-- Migrazione TOTIME — 2026-10-06 (c)
-- Metodo di pagamento e ricevuta: la tracciabilita'
--
-- Perche' serve: oggi non si puo' dire se una spesa e' stata pagata con
-- carta, bonifico o contanti, e non c'e' nemmeno una spunta per dire
-- «la ricevuta ce l'ho». E' esattamente il dato che decide il
-- trattamento fiscale del riaddebito.
--
-- Dal 1 gennaio 2025 (D.Lgs. 192/2024 sull'art. 54 TUIR, con la
-- tracciabilita' introdotta dalla L. 207/2024) i rimborsi ANALITICI di
-- vitto, alloggio, viaggio e trasporto, pagati con strumenti
-- TRACCIABILI e addebitati voce per voce al committente, non
-- concorrono al reddito. I rimborsi forfettari - e il rimborso
-- chilometrico e' forfettario - restano compensi imponibili. Le spese
-- sostenute all'estero sono fuori dall'obbligo di tracciabilita'.
--
-- Questa migrazione NON cambia nessun calcolo: aggiunge i due dati e
-- basta. La scelta fiscale e' un passo a parte (Strato 6), con il
-- comportamento di oggi come default.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

begin;

-- carta | bonifico | contanti | cliente | altro
--   'cliente' = pagata direttamente dal cliente, non da me
alter table public.travel_expenses
  add column if not exists payment_method text;

-- La ricevuta ce l'ho e la conservo. Non e' il file: quello e' un
-- passo successivo (serve Supabase Storage). Questa e' la lista di
-- controllo, che e' il 90% dell'utilita'.
alter table public.travel_expenses
  add column if not exists receipt_kept boolean not null default false;

commit;

-- ============================================================
-- Verifica
-- ============================================================
select 'colonne aggiunte' as cosa,
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='travel_expenses'
           and column_name in ('payment_method','receipt_kept')) || ' su 2' as esito
union all
select 'spese con metodo di pagamento',
       (select count(*)::text from public.travel_expenses where payment_method is not null)
union all
select 'calcoli cambiati', '0 — questa migrazione non tocca importi ne'' tipi di rimborso';
