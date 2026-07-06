-- ============================================================
-- Migrazione TOTIME — 2026-07-06 (dedup import)
-- Chiave di importazione per evitare doppioni al ri-caricamento dei CSV.
-- Da eseguire nel SQL Editor di Supabase (una volta sola). Sicura da rilanciare.
--
-- L'import usa questa colonna per capire se una riga esiste gia':
--   - se esiste (stessa import_key) -> UPDATE della riga
--   - se non esiste                 -> INSERT
-- Cosi' ricaricare lo stesso file non crea duplicati; se modifichi una riga
-- (mantenendo la sua colonna ID) l'import la aggiorna.
--
-- NOTA: senza questa migrazione l'import funziona comunque (come prima), ma
-- NON deduplica: ricaricare due volte crea doppioni. Eseguila per attivare
-- la protezione anti-duplicati.
-- ============================================================

ALTER TABLE public.timesheet_entries    ADD COLUMN IF NOT EXISTS import_key text;
ALTER TABLE public.monthly_compensations ADD COLUMN IF NOT EXISTS import_key text;
ALTER TABLE public.manual_entries        ADD COLUMN IF NOT EXISTS import_key text;
ALTER TABLE public.travel_expenses       ADD COLUMN IF NOT EXISTS import_key text;

CREATE INDEX IF NOT EXISTS idx_timesheet_import_key    ON public.timesheet_entries(import_key);
CREATE INDEX IF NOT EXISTS idx_monthly_import_key      ON public.monthly_compensations(import_key);
CREATE INDEX IF NOT EXISTS idx_manual_import_key       ON public.manual_entries(import_key);
CREATE INDEX IF NOT EXISTS idx_travel_import_key       ON public.travel_expenses(import_key);
