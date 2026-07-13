# TOTIME — Refactoring status

## Completato

- Fase 0 — Baseline documentale.
- Fase 1 — Calcoli puri e test.
- Fase 2A — Repository layer Supabase.
- Fase 2B — Repository smoke test incluso in `npm test`.
- Fase 2C — Test `repository.loadAll()`.
- Fase 2D — App data loader adapter.
- Fase 3A — Piano separazione viste.
- Fase 3B — View map helper.
- Fase 4A — Piano componenti UI.
- Fase 4B — Note componenti UI.
- Fase 5A — Piano caricamento dati.
- Fase 5B — Note load state.
- Fase 6A — Piano PWA/cache.
- Fase 6B — Note versione/cache.
- Fase 2E — Test suite completa nel comando `npm test`.

## In corso

- Nessuna fase attiva nel branch corrente.

## Ancora da fare

### Fase 2F — Wiring fetchAll

Collegare `fetchAll()` in `app.js` al repository layer.

Regole:

- modificare solo il caricamento dati;
- non toccare salvataggi;
- non toccare UI;
- rollback semplice.

### Fase 2G — Repository per salvataggi

Spostare gradualmente insert/update/delete verso repository.

### Fase 3C — Prima vista estratta

Estrarre una vista semplice, ad esempio Appearance o Settings.

### Fase 3D — Viste operative

Estrarre Timesheet, Riepilogo, Fatture e Fiscalità.

### Fase 4C — Componenti UI semplici

Creare e usare helper UI a basso rischio.

### Fase 5C — Caricamento dati robusto

Gestire errori di caricamento in modo più chiaro.

### Fase 6C — Versione/cache runtime

Centralizzare versione app e cache PWA.

## Regola operativa

Ogni PR deve restare piccola, con un solo obiettivo e testabile con:

```bash
npm test
```
