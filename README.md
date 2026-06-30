# TOTIME Web App / PWA v1.1.2

Release di refactoring modulare iniziale senza modifiche al data model.

## Novità rispetto alla v1.1.1
- Avvio della separazione modulare: utility, costanti e configurazione frontend estratte in `src/app-utils.js`.
- `app.js` caricato come modulo ES mantenendo compatibilità con gli handler inline esistenti.
- Cache/service worker aggiornato a `totime-v112` e include il nuovo modulo utility.

## Verifica tecnica
- Smoke test avvio modulo: `node tests/module-startup-smoke.mjs`.

## Nota deploy
Caricare su GitHub i file estratti, non lo ZIP. Se la PWA mostra una vecchia versione, aprire il link con `?v=112` o reinstallare la PWA dalla Home.
