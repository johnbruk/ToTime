# TOTIME — Refactoring Phase 5

## Obiettivo

Rendere il caricamento dati più robusto e leggibile.

## Sequenza proposta

### Fase 5A

Piano e criteri.

### Fase 5B

Stato di caricamento più esplicito:

```text
loading
loadErrors
lastLoadedAt
```

### Fase 5C

Collegare il caricamento dati al repository layer.

### Fase 5D

Messaggi errore più chiari.

## Regole

- Non cambiare data model.
- Non cambiare salvataggi nella stessa PR del caricamento.
- Non cambiare UI in modo invasivo.
- Ogni PR deve essere piccola e testabile.

## Test minimi

```bash
npm test
```

Verifica manuale:

- login;
- home;
- ricarica dati;
- timesheet;
- riepilogo;
- fatture;
- fiscalità.
