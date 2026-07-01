# TOTIME — Refactoring Phase 2F

## Obiettivo

Collegare il caricamento dati dell'app al repository layer.

## Scopo della prossima modifica operativa

La prossima PR operativa dovrà intervenire solo sulla funzione di caricamento dati.

## Regole

- Modificare solo il caricamento dati.
- Non modificare salvataggi, update e delete.
- Non modificare il database.
- Non modificare la UI.
- Non modificare il service worker nella stessa PR.

## Passaggi previsti

1. Importare il repository layer in `app.js`.
2. Creare una istanza repository sopra il client Supabase esistente.
3. Sostituire il ciclo diretto sulle tabelle con il metodo centralizzato `loadAll`.
4. Mantenere i messaggi di errore già presenti.
5. Mantenere `loadThemeFromSettings` dopo il caricamento dati.
6. Mantenere `state.dirty = false` e `state.loading = false`.

## Test tecnico

```bash
npm test
```

## Test manuale minimo dopo il merge

- login;
- home;
- timesheet;
- riepilogo;
- fatture;
- fiscalità;
- cambio tema;
- reload dati.

## Rollback

Se il caricamento dati reale da Supabase non funziona, fare revert della sola PR operativa di Fase 2F.
