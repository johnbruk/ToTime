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
node tests/calculations-smoke.mjs
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

## Quando eseguirli

Eseguire `npm test` prima di:

- fare merge di PR di refactoring;
- modificare calcoli fattura/fiscalità/proiezioni;
- toccare `app.js`;
- modificare service worker o caricamento moduli.

## Limiti

Questi test non sostituiscono la checklist manuale `MANUAL_TESTING.md`.

Non coprono:

- connessione reale Supabase;
- login reale;
- salvataggio dati reali;
- rendering completo in browser reale;
- comportamento PWA su iPhone.

Per release funzionali, usare sempre anche il test manuale minimo o completo.
