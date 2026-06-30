# TOTIME — Architecture baseline

Questo documento fotografa lo stato architetturale corrente prima delle fasi successive di refactoring. La Fase 0 non modifica comportamento, UI, Supabase o data model.

## Scopo applicazione

TOTIME è una Web App / PWA per gestione personale di:

- consuntivi a ore/giorni uomo;
- consuntivi manuali a importo;
- compensi mensili una tantum;
- spese di trasferta;
- riepilogo mensile e annuale;
- fatturazione e righe Fiscozen copiabili;
- fiscalità regime forfettario;
- proiezione annuale e rischio rispetto al limite configurato;
- export timesheet Excel.

## Stack corrente

- Frontend statico HTML/CSS/JavaScript.
- Moduli ES lato browser.
- Supabase JavaScript client v2 via CDN.
- Supabase/PostgreSQL come database principale.
- Netlify come hosting/deploy.
- PWA con service worker e manifest.
- GitHub come repository sorgente.

## File principali

- `index.html`: entry point HTML e caricamento script.
- `styles.css`: tema, layout, componenti UI.
- `app.js`: logica applicativa principale, viste, Supabase, rendering e handler globali.
- `src/app-utils.js`: costanti e utility frontend estratte nella prima fase di refactoring modulare.
- `sw.js`: service worker/cache PWA.
- `manifest.webmanifest`: configurazione installabile PWA.
- `assets/`: loghi e icone TOTIME.
- `tests/module-startup-smoke.mjs`: smoke test tecnico di avvio modulo.

## Stato refactoring corrente

Il progetto è ancora prevalentemente concentrato in `app.js`, ma è già iniziata una separazione minima:

- costanti e utility comuni sono in `src/app-utils.js`;
- `app.js` è caricato come modulo ES;
- gli handler restano esposti su `window` per compatibilità con gli inline handler esistenti.

## Aree funzionali principali

### Auth

- Login Supabase.
- Registrazione con profilo utente.
- Tabella profilo `user_profiles`.

### Configurazione

- Clienti.
- Progetti/clienti finali.
- Attività.
- Voci spesa.
- Template fattura/Fiscozen.
- Aspetto tema chiaro/scuro.
- Fiscalità.

### Timesheet

- Consuntivo giornaliero a ore.
- Compenso mensile una tantum.
- Consuntivo manuale.
- Spesa di trasferta.
- Import CSV.
- Export timesheet Excel.

### Riepilogo

- Riepilogo mensile per cliente/progetto.
- Riepilogo annuale.
- Grafico annuale reale fino al mese corrente.
- Grafico mensile dal giorno 1 a fine mese nella vista mensile.

### Fatturazione

- Una fattura mensile per cliente.
- Sottorighe per progetto/cliente finale.
- Spese di trasferta come macro voce.
- Rivalsa INPS configurabile.
- Marca da bollo configurabile.
- Stati fattura/incasso.
- Descrizioni Fiscozen da template.

### Fiscalità

- Regime forfettario configurabile.
- Codice ATECO configurabile.
- Coefficiente di redditività.
- Aliquota imposta sostitutiva.
- Proiezione annuale con scenari e rischio.

## Regole di refactoring

1. Non cambiare data model senza migrazione SQL esplicita e approvata.
2. Non cambiare chiavi Supabase o secret.
3. Non rimuovere funzioni esistenti.
4. Fare PR piccole e testabili.
5. Prima dei refactor strutturali eseguire sempre la checklist manuale.
6. Aggiornare cache/service worker solo quando cambia il codice pubblicato.

## Roadmap tecnica consigliata

1. Baseline documentale e checklist.
2. Estrazione calcoli puri.
3. Repository layer per Supabase.
4. Separazione viste.
5. Componenti UI riutilizzabili e escape HTML sistematico.
6. Caricamento dati più robusto.
7. PWA/cache/versioning centralizzato.
