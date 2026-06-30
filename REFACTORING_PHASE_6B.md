# TOTIME — Refactoring Phase 6B

## Obiettivo

Preparare la centralizzazione di versione app e cache PWA.

## Cosa vogliamo ottenere

- un solo punto dove leggere la versione app;
- cache name coerente con la versione;
- istruzioni post-deploy più semplici;
- meno rischio di vedere vecchie versioni dalla PWA installata.

## Regole

- Non modificare la logica applicativa insieme al service worker.
- Aggiornare cache solo quando cambiano file runtime.
- Testare browser e PWA installata.

## Prossima fase

Aggiornare `sw.js` e documentazione deploy in una PR separata.
