# TOTIME — Refactoring Phase 3

## Obiettivo

Separare progressivamente le viste principali oggi concentrate in `app.js`, senza cambiare comportamento utente.

## Sequenza proposta

### Fase 3A — Piano e criteri

Documentare cosa verrà separato e quali regole seguire.

### Fase 3B — View helpers non invasivi

Estrarre helper di rendering generici, mantenendo gli handler globali esistenti.

### Fase 3C — Viste a basso rischio

Separare viste semplici e meno legate ai dati:

- `appearance`
- `settings`
- schermate anagrafiche semplici

### Fase 3D — Viste operative

Separare con molta cautela:

- `timesheet`
- `summary`
- `billing`
- `tax`

## Regole

- Nessuna modifica al data model.
- Nessuna modifica funzionale intenzionale.
- Non introdurre framework.
- Non cambiare routing/navigazione.
- Mantenere compatibilità con gli handler esposti su `window`.
- Ogni PR deve essere piccola e testabile.

## Test minimi

Prima di ogni merge:

```bash
npm test
```

Poi verifica manuale minima:

- login;
- home;
- menu rapido;
- navigazione indietro;
- cambio tema;
- apertura timesheet;
- apertura riepilogo;
- apertura fatturazione;
- apertura fiscalità.

## Output atteso finale

Struttura indicativa:

```text
src/views/home.js
src/views/settings.js
src/views/appearance.js
src/views/timesheet.js
src/views/summary.js
src/views/billing.js
src/views/tax.js
```

Il completamento operativo della fase deve avvenire in PR successive e controllate.
