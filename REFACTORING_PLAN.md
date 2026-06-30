# TOTIME — Refactoring plan

Piano operativo per rendere TOTIME più manutenibile senza perdere stabilità.

## Principi

- Refactoring graduale.
- PR piccole.
- Nessun cambio data model senza migrazione SQL approvata.
- Nessuna modifica funzionale nascosta.
- Ogni fase deve lasciare l’app utilizzabile.

## Fase 0 — Baseline e protezione funzionale

Obiettivo: documentare lo stato attuale e creare checklist di regressione.

Output:

- `ARCHITECTURE.md`
- `DATA_MODEL.md`
- `MANUAL_TESTING.md`
- `IMPORT_CSV.md`
- `DEPLOY_NETLIFY.md`
- `RELEASE_CHECKLIST.md`

Nessuna modifica codice prevista.

## Fase 1 — Calcoli puri

Obiettivo: isolare le funzioni di calcolo dalla UI.

Prime funzioni candidate:

- `dailyAmount`
- `dailyDays`
- `billingCalc`
- `annualTaxCalc`
- `projectionCalc`
- `annualMonthData`
- `annualTotals`
- parsing importi/date CSV

Output atteso:

```text
src/calculations/billing.js
src/calculations/tax.js
src/calculations/projection.js
src/calculations/totals.js
src/importExport/csvImport.js
```

Regola:

- stesso comportamento;
- test semplici sulle funzioni pure;
- app ancora funzionante.

## Fase 2 — Repository Supabase

Obiettivo: evitare chiamate Supabase sparse nella UI.

Output atteso:

```text
src/supabaseClient.js
src/dataRepository.js
```

Esempi API interna:

```js
repository.clients.list()
repository.clients.create(payload)
repository.timesheet.createDaily(payload)
repository.billing.saveHeader(payload)
repository.taxSettings.save(payload)
```

Vantaggi:

- meno duplicazione;
- errori gestiti in modo coerente;
- refactor futuro più sicuro.

## Fase 3 — Separazione viste

Obiettivo: spezzare `app.js` per aree funzionali.

Output atteso:

```text
src/views/auth.js
src/views/home.js
src/views/timesheet.js
src/views/summary.js
src/views/billing.js
src/views/tax.js
src/views/settings.js
```

Regola:

- mantenere compatibilità con navigazione attuale;
- non introdurre framework in questa fase.

## Fase 4 — Componenti UI e sicurezza HTML

Obiettivo: rendere rendering più coerente e ridurre rischio XSS.

Output atteso:

```text
src/ui/components.js
src/ui/shell.js
```

Componenti candidati:

- `card()`
- `button()`
- `field()`
- `badge()`
- `monthSelector()`
- `appShell()`

Regole:

- usare sempre escape HTML per contenuti utente;
- evitare concatenazioni non protette.

## Fase 5 — Caricamento dati

Obiettivo: rendere `fetchAll()` più robusto.

Interventi:

- caricare tabelle indipendenti in parallelo;
- distinguere errori bloccanti da errori secondari;
- evitare render multipli;
- mostrare errori più leggibili.

## Fase 6 — PWA e deploy

Obiettivo: ridurre problemi cache.

Interventi:

- centralizzare versione app;
- centralizzare cache name;
- aggiornare asset cache in modo esplicito;
- valutare network-first per file principali;
- non cacheare Supabase o CDN esterni in modo aggressivo.

## Fase 7 — Documentazione continua

Ogni fase deve aggiornare:

- README;
- manual testing se cambia comportamento;
- data model se cambia database;
- release checklist se cambia processo.

## Cosa evitare per ora

- Riscrittura completa.
- Introduzione immediata di framework.
- Introduzione immediata di Vite se non necessaria.
- Modifiche DB insieme a refactor UI.
- Cambiamenti funzionali non richiesti.
