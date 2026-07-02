# TOTIME — Data model baseline

Questo documento descrive il data model Supabase/PostgreSQL corrente. Non è una migrazione SQL e non modifica il database.

## Principio generale

Ogni tabella applicativa contiene `user_id` e usa Row Level Security per separare i dati dell’utente autenticato.

## Tabelle anagrafiche

### `clients`

Clienti principali verso cui si emette fattura.

Campi chiave:

- `id`
- `user_id`
- `name`
- `compensation_type`
- `daily_rate`
- `standard_hours`
- `active`

Uso:

- selezione cliente nei consuntivi;
- base tariffaria per calcolo importi;
- raggruppamento fatture mensili.

### `projects`

Progetti o clienti finali collegati a un cliente principale.

Campi chiave:

- `id`
- `user_id`
- `client_id`
- `name`
- `active`

Uso:

- filtro dipendente dal cliente;
- raggruppamento riepiloghi;
- righe fattura per progetto/cliente finale.

### `activities`

Attività operative configurabili.

Campi chiave:

- `id`
- `user_id`
- `name`
- `active`

Uso:

- classificazione timesheet;
- classificazione consuntivi manuali;
- filtro/analisi futura.

## Consuntivi e compensi

### `timesheet_entries`

Righe giornaliere a ore.

Campi chiave:

- `entry_date`
- `client_id`
- `project_id`
- `activity_id`
- `description`
- `hours`
- `work_site`
- `work_city`
- `notes`
- `daily_rate_snapshot`
- `standard_hours_snapshot`

Regola calcolo:

- importo = `hours / standard_hours_snapshot * daily_rate_snapshot`;
- se snapshot assente, usare i dati del cliente come fallback applicativo.

### `monthly_compensations`

Compensi mensili una tantum.

Campi chiave:

- `year`
- `month`
- `client_id`
- `project_id`
- `description`
- `amount`
- `notes`

Uso:

- importo mensile non legato a ore/giorni.

### `manual_entries`

Consuntivi puntuali a importo manuale.

Campi chiave:

- `entry_date`
- `client_id`
- `project_id`
- `activity_id`
- `work_site`
- `work_city`
- `description`
- `amount`
- `notes`

Regola:

- non calcola ore;
- non calcola giorni/uomo;
- entra in riepilogo e fatturazione.

## Spese

### `expense_categories`

> Aggiornato 2026-07-02: campo `reimbursable` (boolean, default true) = voce rimborsabile dal cliente o costo a carico.

Categorie spesa configurabili.

Campi chiave:

- `name`
- `calculation_type`
- `unit_label`
- `default_unit_rate`
- `invoice_macro`
- `active`

Esempi:

- Rimborso KM;
- Pranzo;
- Cena;
- Hotel;
- Autostrada;
- Parcheggio;
- Volo;
- Treno;
- Taxi;
- Carburante;
- Altro.

### `travel_expenses`

> Aggiornato 2026-07-02: campo `reimbursable` (boolean, default true) e `client_id` reso nullable per i costi puri.

Spese di trasferta puntuali.

Campi chiave:

- `expense_date`
- `client_id`
- `project_id`
- `expense_category_id`
- `work_site`
- `work_city`
- `description`
- `quantity`
- `unit_rate`
- `amount`
- `notes`

Regola fattura:

- le voci restano dettagliate in TOTIME;
- in fattura confluiscono nella macro voce “Spese di trasferta”.

## Fatturazione

### `billing_headers`

Testata fattura mensile per cliente.

Campi chiave:

- `year`
- `month`
- `client_id`
- `status`
- `invoice_number`
- `invoice_date`
- `collection_date`
- `collected_amount`
- `services_amount`
- `expenses_amount`
- `manual_amount`
- `taxable_base_amount`
- `inps_recharge_enabled`
- `inps_recharge_rate`
- `inps_recharge_amount`
- `stamp_duty_enabled`
- `stamp_duty_amount`
- `invoice_total_amount`

Regola:

- una fattura per cliente/mese;
- importi calcolati da righe timesheet, manuali, mensili e spese;
- stato fattura/incasso salvato qui.

### `billing_lines`

Righe di dettaglio fattura/Fiscozen.

Tipi riga previsti:

- `daily_rate_8h`
- `monthly_flat`
- `manual_entry`
- `travel_expenses`
- `mileage_reimbursement`
- `inps_recharge`
- `stamp_duty`

### `invoice_templates`

Template configurabili per descrizioni Fiscozen.

Campi chiave:

- `template_code`
- `name`
- `entry_type`
- `template_text`
- `active`
- `sort_order`

Esempi placeholder:

- `[Mese Anno]`
- `[Progetto]`
- `[Giorni]`

## Pagamenti

### `payments`

Pagamenti/incassi associati a testata fattura.

Campi chiave:

- `billing_header_id`
- `payment_date`
- `amount`
- `notes`

## Configurazione utente

### `user_profiles`

> Aggiornato 2026-07-02: campo `phone` (text) per la sezione Account.

Dati registrazione/profilo.

Campi chiave:

- `user_id`
- `first_name`
- `last_name`
- `company_name`
- `vat_number`
- `email`

### `app_settings`

Configurazioni generiche chiave/valore JSON.

### `tax_settings`

Configurazione fiscale annuale.

Campi chiave:

- `fiscal_year`
- `regime`
- `ateco_code`
- `ateco_description`
- `profitability_coefficient`
- `substitute_tax_rate`
- `inps_management`
- `inps_recharge_enabled`
- `inps_recharge_rate`
- `stamp_duty_enabled`
- `stamp_duty_amount`
- `annual_revenue_limit`
- `activity_start_date`
- `projection_method`
- `projection_excluded_months`
- `projection_include_current_month`
- `projection_prudent_factor`
- `projection_optimistic_factor`
- `risk_low_threshold`
- `risk_medium_threshold`
- `risk_high_threshold`

### `tax_payments`

Pagamenti fiscali e contributivi.

Campi chiave:

- `fiscal_year`
- `payment_type`
- `payment_date`
- `amount`
- `status`
- `notes`

## Regole di evoluzione

- Ogni modifica al data model deve avere uno script SQL separato e approvato.
- Le descrizioni dei documenti non sostituiscono le migrazioni.
- Ogni nuova tabella deve avere RLS e policy per `auth.uid() = user_id`.
