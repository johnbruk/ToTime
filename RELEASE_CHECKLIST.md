# TOTIME — Release checklist

Checklist da usare prima di fare merge o pubblicare una nuova versione.

## 1. Prima della PR

- [ ] Obiettivo della modifica chiaro.
- [ ] Nessuna modifica non richiesta inclusa.
- [ ] Se cambia il database, esiste script SQL separato.
- [ ] Se cambia il comportamento, è aggiornata la documentazione.
- [ ] Se cambia la PWA, è aggiornato `sw.js`.
- [ ] Se cambia la versione, è aggiornata la nota README.

## 2. Sicurezza

- [ ] Nessuna secret key Supabase nel codice.
- [ ] Nessun token Netlify/GitHub nel codice.
- [ ] Nessuna password nel codice.
- [ ] Le chiavi pubbliche sono solo quelle previste per frontend.

## 3. Test tecnico

Eseguire quando disponibile:

```bash
node tests/module-startup-smoke.mjs
```

Controllare che:

- [ ] il test passi;
- [ ] `app.js` sia importabile;
- [ ] gli handler critici siano esposti su `window` finché esistono inline handler.

## 4. Test manuale minimo

Prima del merge:

- [ ] Login.
- [ ] Home.
- [ ] Cambio tema.
- [ ] Timesheet.
- [ ] Nuovo consuntivo giornaliero.
- [ ] Riepilogo mensile.
- [ ] Fatturazione.
- [ ] Fiscalità.
- [ ] Export Timesheet.

Per modifiche più grandi usare `MANUAL_TESTING.md` completo.

## 5. GitHub

- [ ] PR aperta verso `main`.
- [ ] Titolo PR chiaro.
- [ ] Descrizione PR con riepilogo e test.
- [ ] Nessun conflitto.
- [ ] Check verdi o motivazione esplicita.
- [ ] Merge consigliato: `Squash and merge`.

## 6. Netlify

Dopo merge:

- [ ] Deploy partito automaticamente.
- [ ] Deploy terminato correttamente.
- [ ] Link produzione aggiornato.
- [ ] Se serve, test con query string versione.

## 7. Post deploy

- [ ] Verificare versione corretta in app.
- [ ] Verificare login.
- [ ] Verificare caricamento dati da Supabase.
- [ ] Verificare almeno una vista dati reale.
- [ ] Verificare PWA su iPhone se la release impatta UI/cache.

## 8. Rollback

In caso di problema grave:

- ripristinare commit precedente da GitHub/Netlify;
- oppure revertire PR;
- non modificare manualmente il database senza valutare impatto sui dati reali.
