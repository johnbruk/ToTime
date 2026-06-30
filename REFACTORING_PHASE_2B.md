# TOTIME — Refactoring Phase 2B

## Obiettivo

Integrare il repository smoke test nel comando standard `npm test`, prima di collegare `app.js` al repository layer.

## Modifiche

- `package.json` esegue anche `tests/repository-smoke.mjs` dentro `npm test`.
- Aggiunto script dedicato `npm run test:repository`.
- `TESTING.md` documenta il nuovo test.

## Perché questa fase è separata

Il prossimo passaggio toccherà `app.js` e il caricamento dati Supabase. Prima di farlo, il repository layer deve essere verificabile con un comando unico.

## Cosa non cambia

- Nessuna modifica a `app.js`.
- Nessuna modifica alla UI.
- Nessuna modifica al database.
- Nessuna modifica al service worker.

## Prossima fase

Fase 2C:

- collegare il solo `fetchAll()` a `repository.loadAll()`;
- lasciare invariati salvataggi, update e delete;
- mantenere messaggi errore e comportamento attuale;
- testare login, reload e caricamento dati reali.
