# TOTIME — Refactoring Phase 2I

## Obiettivo

Rendere operativo l'adapter di caricamento dati usando la normalizzazione della forma dati.

## Modifiche

- `src/appDataLoader.js` importa `normalizeAppData`.
- Il risultato di `repository.loadAll()` viene normalizzato prima di essere restituito.
- Il test `tests/app-data-loader-smoke.mjs` verifica che ogni chiave dati sia sempre un array.

## Cosa non cambia

- `app.js` non viene ancora modificato.
- La UI non cambia.
- Il database non cambia.
- Il service worker non cambia.

## Prossima fase

Collegare `app.js` all'adapter `loadAppData`, così `fetchAll()` userà il repository layer in modo controllato.
