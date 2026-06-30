# TOTIME — Refactoring Phase 2C

## Obiettivo

Rafforzare i test del repository layer prima di collegarlo al caricamento reale di `app.js`.

## Modifiche

- Esteso `tests/repository-smoke.mjs`.
- Verificato `repository.loadAll()` con tutte le tabelle.
- Verificato comportamento in caso di errore su una tabella secondaria.

## Cosa non cambia

- Nessuna modifica a `app.js`.
- Nessuna modifica UI.
- Nessuna modifica al database.
- Nessuna modifica al service worker.

## Prossima fase

Fase 2D:

- importare `createRepository` in `app.js`;
- creare una istanza repository sopra il client Supabase esistente;
- sostituire solo il contenuto di `fetchAll()` con `repository.loadAll()`;
- lasciare invariati salvataggi, update e delete.

## Test consigliato

```bash
npm test
```
