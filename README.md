# TOTIME Web App / PWA v0.9

Versione Database Edition con Supabase/PostgreSQL.

## Novità v0.9

- Nuova voce `+ Nuovo consuntivo > Consuntivo manuale` con importo libero.
- Nuova voce `+ Nuovo consuntivo > Spesa di trasferta`.
- Gestione voci spesa configurabili: Rimborso KM, Pranzo, Cena, Hotel, Autostrada, Parcheggio, Volo, Treno, Taxi, Carburante, Altro.
- Configurazione template fattura / Fiscozen separata dai consuntivi.
- Fatturazione con righe generate da template configurabili.
- Le spese di trasferta sono dettagliate internamente ma fatturate come macro voce `Spese di trasferta`.
- I consuntivi puntuali non richiedono selezione della voce fattura.
- Mantenute tutte le funzioni v0.8: login Supabase, Sede e Luogo/Città separati, import CSV, riepiloghi e fatturazione per cliente.

## Prerequisiti database

Prima di usare la v0.9, devono essere già state create su Supabase le tabelle:

- expense_categories
- travel_expenses
- manual_entries
- invoice_templates

E devono essere caricate le configurazioni iniziali per voci spesa e template Fiscozen.
