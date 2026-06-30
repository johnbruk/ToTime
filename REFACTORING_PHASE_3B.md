# TOTIME — Refactoring Phase 3B

## Obiettivo

Preparare la separazione delle viste introducendo un helper indipendente per mappare nomi vista e funzioni di rendering.

## Moduli aggiunti

```text
src/views/viewMap.js
tests/view-map-smoke.mjs
```

## Scelta prudenziale

`app.js` non viene modificato in questa PR. Il modulo sarà collegato solo dopo test manuali.

## Prossima fase

Separare una vista semplice, ad esempio Appearance o Settings, mantenendo invariata la navigazione attuale.

## Test consigliato

```bash
node tests/view-map-smoke.mjs
```
