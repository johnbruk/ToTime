# TOTIME — Refactoring Phase 1

## Obiettivo

Avviare l'estrazione dei calcoli puri in moduli separati, senza modificare il comportamento dell'app pubblicata e senza cambiare data model.

## Moduli aggiunti

```text
src/calculations/daily.js
src/calculations/billing.js
src/calculations/tax.js
src/calculations/projection.js
```

## Test aggiunto

```text
tests/calculations-smoke.mjs
```

Il test verifica:

- calcolo importo giornaliero;
- calcolo giorni/uomo;
- calcolo fattura con servizi, consuntivo manuale, spese, rivalsa INPS e bollo;
- stima fiscale forfettario base;
- parsing mesi esclusi dalla proiezione;
- calcolo proiezione annuale.

## Scelta prudenziale

In questa fase i moduli sono introdotti e testati, ma il wiring completo dentro `app.js` viene rimandato alla fase successiva. Questo riduce il rischio di regressioni mentre fissiamo le formule in modo testabile.

## Prossimo step

Fase 1B:

- sostituire progressivamente le funzioni locali in `app.js` con import dai moduli;
- mantenere gli handler globali esistenti;
- aggiornare lo smoke test di startup;
- verificare la checklist manuale minima.
