-- ============================================================
-- Migrazione TOTIME — 2026-07-02
-- Aggiunge: gestione costi/spese rimborsabili + campo telefono profilo
-- Da eseguire nel SQL Editor di Supabase (una volta sola).
-- Sicura da rilanciare: usa IF NOT EXISTS.
-- ============================================================

-- 1) Flag "rimborsabile" sulla voce di spesa (configurazione)
ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS reimbursable boolean NOT NULL DEFAULT true;

-- 2) Flag "rimborsabile" sulla singola spesa (default ereditato dalla voce,
--    ma modificabile per la singola riga)
ALTER TABLE public.travel_expenses
  ADD COLUMN IF NOT EXISTS reimbursable boolean NOT NULL DEFAULT true;

-- 3) Telefono nel profilo utente (sezione Account)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS phone text;

-- 4) Cliente opzionale sulle spese: i costi puri (software, abbonamenti...)
--    non hanno un cliente. Rende client_id nullable se non lo e' gia'.
ALTER TABLE public.travel_expenses
  ALTER COLUMN client_id DROP NOT NULL;

-- Nota: le spese esistenti restano "rimborsabili" (default true).
-- I costi NON rimborsabili (software, abbonamenti, ecc.) andranno
-- marcati con reimbursable = false, dalla app o via import massivo.
