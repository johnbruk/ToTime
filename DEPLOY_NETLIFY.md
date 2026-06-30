# TOTIME — Deploy Netlify

Guida operativa per pubblicare TOTIME tramite GitHub e Netlify.

## Architettura deploy

```text
GitHub main
↓
Netlify continuous deployment
↓
Sito TOTIME pubblico
↓
Supabase/PostgreSQL
```

## Flusso consigliato

1. Creare o ricevere una Pull Request su GitHub.
2. Verificare diff e check.
3. Fare `Squash and merge` verso `main`.
4. Netlify avvia automaticamente il deploy.
5. Verificare sito e PWA.

## Impostazioni Netlify

Per TOTIME, sito statico:

```text
Branch produzione: main
Build command: vuoto
Publish directory: /
```

Se Netlify richiede il percorso come punto corrente:

```text
Publish directory: .
```

## Dopo il merge

Andare in Netlify:

```text
Site → Deploys
```

Controllare che l’ultimo deploy sia:

```text
Published
```

oppure:

```text
Deploy succeeded
```

## Cache e PWA

TOTIME usa service worker. Dopo una nuova release può capitare che il browser mostri una versione precedente.

Soluzioni:

1. Aprire il sito con query string versione:

```text
https://nome-sito.netlify.app/?v=112
```

2. Su iPhone:

- rimuovere TOTIME dalla Home;
- aprire il sito da Safari;
- ricaricare;
- aggiungere nuovamente alla schermata Home.

3. Se necessario cancellare dati sito/cache Safari.

## Versioning service worker

Ogni release che modifica file pubblicati deve aggiornare:

- `APP_VERSION`;
- cache name in `sw.js`;
- assets cache se vengono aggiunti file nuovi.

Esempio:

```js
const CACHE = 'totime-v112';
```

## Controlli post deploy

- [ ] Login funziona.
- [ ] Supabase risponde.
- [ ] Home mostra versione/stile aggiornato.
- [ ] Timesheet carica dati reali.
- [ ] Riepilogo e Fatturazione leggono dati.
- [ ] Fiscalità si apre correttamente.
- [ ] PWA installabile.

## Cosa non mettere mai nel repository

- Secret key Supabase.
- Password database.
- Token Netlify.
- Token GitHub personali.
- Password personali.

Nel frontend è ammessa solo la publishable/anon key Supabase prevista per il browser.
