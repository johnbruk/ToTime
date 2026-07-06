-- ============================================================
-- Migrazione TOTIME — 2026-07-03
-- Modello spese avanzato: tipo di rimborso + policy per cliente
-- Da eseguire nel SQL Editor di Supabase (una volta sola). Sicura da rilanciare.
-- ============================================================

-- 1) Tipo di rimborso sulla singola spesa:
--    'own'            = a mio carico (costo)
--    'invoice'        = rimborso in fattura (ricavo, riaddebitato al cliente)
--    'expense_report' = piè di lista (partita di giro, rimborsato a parte)
ALTER TABLE public.travel_expenses
  ADD COLUMN IF NOT EXISTS reimbursement_type text NOT NULL DEFAULT 'own';

-- 2) Policy rimborsi per cliente (definita nell'anagrafica cliente):
--    - base_city: sede operativa di riferimento per le trasferte
--    - expense_policy: mappa voce di spesa -> tipo rimborso (JSON)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS base_city text;
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS expense_policy jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Nota: le spese esistenti restano 'own' (a mio carico). Il campo booleano
-- "reimbursable" della migrazione precedente resta per compatibilita';
-- reimbursable = (reimbursement_type <> 'own').
