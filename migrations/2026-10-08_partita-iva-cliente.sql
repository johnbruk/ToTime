-- ============================================================
-- Migrazione TOTIME — 2026-10-08
-- La partita IVA del cliente
--
-- Perche' serve: caricando una fattura emessa, l'unico modo certo di
-- capire a chi appartiene e' la partita IVA del cessionario, che nella
-- fattura elettronica c'e' sempre. L'anagrafica clienti non ce
-- l'aveva: senza questo campo ogni fattura caricata risponderebbe
-- «cliente non riconosciuto» e tutti i confronti resterebbero fermi.
--
-- Finche' questa migrazione non viene lanciata l'app non si rompe:
-- ripiega sull'abbinamento per NOME e lo dice a schermo, perche' due
-- clienti possono chiamarsi uguale e un ripiego va dichiarato. Il
-- campo nel modulo cliente c'e' comunque, e la scrittura regge anche
-- senza la colonna (le scritture tolgono le colonne che il database
-- non ha e lo segnalano).
--
-- Non tocca nessun dato esistente: aggiunge una colonna e basta.
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

alter table public.clients add column if not exists vat_number text;

-- ---------- Verifica ----------
-- Deve stampare: colonna presente = 1
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='clients' and column_name='vat_number')
    as "colonna presente",
  (select count(*) from public.clients) as "clienti in tutto",
  (select count(*) from public.clients where coalesce(vat_number,'')<>'')
    as "clienti con la partita IVA";
