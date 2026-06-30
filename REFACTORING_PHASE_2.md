# TOTIME — Refactoring Phase 2

## Obiettivo

Completare l'isolamento progressivo di Supabase dietro un repository layer.

## Strategia

La Fase 2 deve rimanere in una singola PR, ma con approccio controllato:

1. introdurre `src/supabaseClient.js`;
2. introdurre `src/dataRepository.js`;
3. aggiungere test repository;
4. collegare progressivamente `app.js` al repository;
5. aggiornare test e documentazione;
6. aggiornare service worker/cache solo se `app.js` importa nuovi moduli in runtime.

## Moduli introdotti

```text
src/supabaseClient.js
src/dataRepository.js
```

## Test introdotti

```text
tests/repository-smoke.mjs
```

## Regole

- Nessuna modifica al data model.
- Nessuna modifica alle policy RLS.
- Nessuna modifica alle chiavi Supabase.
- Nessuna modifica funzionale intenzionale.
- La UI deve restare invariata.

## Prossimo completamento della PR

Prima del merge finale della Fase 2, collegare `app.js` al repository layer e verificare:

- login;
- caricamento dati;
- reload database;
- tema salvato;
- vista timesheet;
- vista fatturazione;
- vista fiscalità.
