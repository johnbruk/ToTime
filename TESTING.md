# TOTIME — Technical testing guide

Questa guida raccoglie i test tecnici disponibili per accompagnare il refactoring.

## Requisiti

Serve Node.js installato localmente o nell'ambiente di sviluppo.

## Comando principale

```bash
npm test
```

Il comando esegue:

```bash
node tests/module-startup-smoke.mjs
node tests/navigation-regression.mjs
node tests/calculations-smoke.mjs
node tests/phase0-pure-functions.mjs
node tests/repository-smoke.mjs
node tests/app-data-loader-smoke.mjs
node tests/view-map-smoke.mjs
node tests/app-data-shape-smoke.mjs
```

## Test disponibili

### Startup smoke test

```bash
npm run test:startup
```

Verifica che:

- `app.js` sia importabile come modulo ES;
- la vista di login venga renderizzata in ambiente DOM simulato;
- il tema di default sia applicato;
- gli handler principali restino esposti su `window`.

### Calculation smoke test

```bash
npm run test:calculations
```

Verifica le funzioni pure estratte in `src/calculations`:

- importo giornaliero;
- giorni/uomo;
- calcolo fattura;
- rivalsa INPS;
- bollo;
- stima tasse regime forfettario;
- parsing mesi esclusi;
- proiezione annuale.

### Phase 0 pure-function regression

```bash
npm run test:phase0
```

Verifica la baseline funzionale senza usare un Supabase reale:

- importo giornaliero e giorni/uomo;
- raggruppamento riepilogo;
- calcolo fattura con servizi, righe manuali, spese, rivalsa INPS e bollo;
- stima fiscale annuale;
- proiezione annuale;
- parsing CSV, importi e date.

### Navigation regression test

```bash
npm run test:navigation
```

Verifica che la navigazione principale resti stabile:

- apertura menu;
- cambio vista;
- ritorno alla vista precedente;
- accesso a configurazione e fatturazione.

### Repository smoke test

```bash
npm run test:repository
```

Verifica il repository layer Supabase introdotto in Fase 2:

- struttura base del repository;
- API di lettura tabelle;
- ordinamento standard per clienti/anagrafiche;
- ordinamento specifico per timesheet;
- `repository.loadAll()`;
- comportamento controllato se una tabella secondaria va in errore.

### App data loader smoke test

```bash
npm run test:loader
```

Verifica l'adapter `src/appDataLoader.js`:

- chiamata al profilo utente prima del load;
- lettura dati da repository;
- propagazione errori tabella;
- validazione minima degli argomenti.

### View map smoke test

```bash
npm run test:views
```

Verifica l'helper `src/views/viewMap.js`:

- registrazione viste;
- fallback verso vista alternativa;
- elenco nomi viste;
- rendering tramite funzione associata.

### App data shape smoke test

```bash
npm run test:data-shape
```

Verifica che la forma normalizzata dei dati applicativi resti compatibile con le viste principali.

## Quando eseguirli

Eseguire `npm test` prima di:

- fare merge di PR di refactoring;
- modificare calcoli fattura/fiscalità/proiezioni;
- toccare `app.js`;
- modificare service worker o caricamento moduli;
- collegare `app.js` al repository layer.

## Limiti

Questi test non sostituiscono la checklist manuale `MANUAL_TESTING.md`.

Non coprono:

- connessione reale Supabase;
- login reale;
- salvataggio dati reali;
- rendering completo in browser reale;
- comportamento PWA su iPhone.

Per release funzionali, usare sempre anche il test manuale minimo o completo.
