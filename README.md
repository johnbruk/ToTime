# TOTIME Web App / PWA v1.1.3

Release di navigazione assistita e menu rapido senza modifiche al data model.

## Novità rispetto alla v1.1.2
- Il pulsante in alto a sinistra apre un menu rapido con le stesse sezioni della barra inferiore.
- Aggiunta freccia di ritorno contestuale verso la schermata precedente.
- Blocco della navigazione se un form contiene modifiche non salvate.
- Cache/service worker aggiornato a `totime-v113`.

## Verifica tecnica
- Smoke test avvio modulo: `node tests/module-startup-smoke.mjs`.
- Regression test navigazione: `node tests/navigation-regression.mjs`.

## Nota deploy
Caricare su GitHub i file estratti, non lo ZIP. Se la PWA mostra una vecchia versione, aprire il link con `?v=113` o reinstallare la PWA dalla Home.
