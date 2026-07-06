-- ============================================================
-- Migrazione TOTIME — 2026-07-06
-- Colonne avanzate di tax_settings: aliquota INPS Gestione Separata
-- e parametri di proiezione annua / soglie di rischio.
-- Da eseguire nel SQL Editor di Supabase (una volta sola). Sicura da rilanciare.
--
-- NOTA: NON e' obbligatoria. L'app salva la configurazione fiscale anche
-- senza queste colonne (scrittura resiliente: le colonne mancanti vengono
-- semplicemente ignorate). Eseguendola, questi valori vengono PERSISTITI
-- invece di usare i default (INPS GS 26,07%, soglie 70/90/100, ecc.).
-- ============================================================

-- Rivalsa / contributo INPS Gestione Separata
ALTER TABLE public.tax_settings
  ADD COLUMN IF NOT EXISTS inps_management text;
ALTER TABLE public.tax_settings
  ADD COLUMN IF NOT EXISTS inps_gs_rate numeric NOT NULL DEFAULT 26.07;

-- Parametri proiezione annua "Prudente / Base / Ottimistico"
ALTER TABLE public.tax_settings
  ADD COLUMN IF NOT EXISTS projection_method text NOT NULL DEFAULT 'weighted_average';
ALTER TABLE public.tax_settings
  ADD COLUMN IF NOT EXISTS projection_include_current_month boolean NOT NULL DEFAULT true;
ALTER TABLE public.tax_settings
  ADD COLUMN IF NOT EXISTS projection_excluded_months jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.tax_settings
  ADD COLUMN IF NOT EXISTS projection_prudent_factor numeric NOT NULL DEFAULT 0.85;
ALTER TABLE public.tax_settings
  ADD COLUMN IF NOT EXISTS projection_optimistic_factor numeric NOT NULL DEFAULT 1.10;

-- Soglie percentuali di rischio sul limite forfettario
ALTER TABLE public.tax_settings
  ADD COLUMN IF NOT EXISTS risk_low_threshold numeric NOT NULL DEFAULT 70;
ALTER TABLE public.tax_settings
  ADD COLUMN IF NOT EXISTS risk_medium_threshold numeric NOT NULL DEFAULT 90;
ALTER TABLE public.tax_settings
  ADD COLUMN IF NOT EXISTS risk_high_threshold numeric NOT NULL DEFAULT 100;
