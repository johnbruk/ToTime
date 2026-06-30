# TOTIME — Refactoring Phase 2E

## Obiettivo

Includere nel comando standard `npm test` tutti i test tecnici aggiunti nelle ultime fasi.

## Modifiche

- `npm test` esegue anche:
  - `tests/app-data-loader-smoke.mjs`
  - `tests/view-map-smoke.mjs`
- Aggiunti script dedicati:
  - `npm run test:loader`
  - `npm run test:views`
- Aggiornata la guida `TESTING.md`.

## Cosa non cambia

- Nessuna modifica a `app.js`.
- Nessuna modifica UI.
- Nessuna modifica database.
- Nessuna modifica service worker/cache.

## Prossima fase

Collegare il solo caricamento dati di `app.js` al repository layer, mantenendo invariati salvataggi, update e delete.
