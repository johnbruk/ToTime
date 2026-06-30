# TOTIME — Manual regression checklist

Eseguire questa checklist prima di fare merge di refactoring strutturali o modifiche funzionali importanti.

## Preparazione

- Aprire la versione deployata Netlify.
- Se serve forzare cache/PWA, aprire con query string versione, per esempio `?v=xxx`.
- Verificare che Supabase sia raggiungibile.
- Usare un account test o dati reali già noti.

## Auth

- [ ] La pagina di login si apre correttamente.
- [ ] Login con email/password funzionante.
- [ ] Logout funzionante.
- [ ] Registrazione mostra form separato.
- [ ] Registrazione salva profilo utente.
- [ ] Dopo registrazione si torna al login o appare messaggio chiaro.

## Home

- [ ] Mostra logo/TOTIME.
- [ ] Mostra anno corrente.
- [ ] KPI principali leggibili.
- [ ] Grafico annuale mostra mesi Gen-Dic.
- [ ] Linea grafico annuale si ferma al mese corrente.
- [ ] Menu Home apre Timesheet, Riepilogo, Fatturazione, Configurazione/Fiscalità.
- [ ] Tema chiaro/scuro coerente.

## Timesheet

- [ ] Cambio mese funzionante.
- [ ] Lista righe mese corretta.
- [ ] Timesheet non mostra importi economici nel dettaglio operativo.
- [ ] Nuovo consuntivo giornaliero a ore salvabile.
- [ ] Modifica consuntivo giornaliero funzionante.
- [ ] Duplicazione consuntivo giornaliero funzionante.
- [ ] Cancellazione consuntivo giornaliero funzionante.
- [ ] Progetto/cliente finale filtrato in base al cliente selezionato.
- [ ] Sede e Luogo/Città salvati separatamente.

## Compensi mensili

- [ ] Nuovo compenso mensile salvabile.
- [ ] Modifica compenso mensile funzionante.
- [ ] Duplicazione compenso mensile funzionante.
- [ ] Cancellazione compenso mensile funzionante.
- [ ] Importo entra nel riepilogo e nella fatturazione.

## Consuntivi manuali

- [ ] Nuovo consuntivo manuale salvabile.
- [ ] Attività selezionabile.
- [ ] Importo manuale entra nei totali.
- [ ] Non genera ore o giorni/uomo.
- [ ] Modifica/duplicazione/cancellazione funzionanti.

## Spese di trasferta

- [ ] Nuova spesa di trasferta salvabile.
- [ ] Categoria spesa selezionabile.
- [ ] Categoria a importo manuale calcola correttamente.
- [ ] Categoria quantità x tariffa calcola correttamente.
- [ ] Spese non entrano in ore o giorni/uomo.
- [ ] Spese entrano in fatturazione come macro voce “Spese di trasferta”.

## Import CSV

- [ ] Import CSV legge colonne previste.
- [ ] Crea clienti mancanti.
- [ ] Crea progetti mancanti.
- [ ] Crea attività mancanti.
- [ ] Salva righe timesheet su Supabase.
- [ ] Mostra messaggio finale con righe importate e scartate.
- [ ] Non importare due volte lo stesso file senza pulizia dati.

## Export Timesheet Excel

- [ ] Export disponibile da Configurazione/Export Timesheet.
- [ ] Filtro mese funzionante.
- [ ] Filtro cliente funzionante.
- [ ] Filtro progetto opzionale funzionante.
- [ ] File apribile in Excel.
- [ ] Colonne operative corrette.
- [ ] Totali corretti.

## Riepilogo mensile

- [ ] Raggruppamento per Cliente + Progetto/Cliente finale.
- [ ] Ore corrette.
- [ ] Giorni/uomo corretti.
- [ ] Importi corretti.
- [ ] Grafico mensile parte dal giorno 1 e arriva all’ultimo giorno del mese.
- [ ] Il grafico non parte dal primo giorno lavorato.

## Riepilogo annuale

- [ ] Consuntivato annuale corretto.
- [ ] Fatturato annuale corretto.
- [ ] Incassato annuale corretto.
- [ ] Da incassare corretto.
- [ ] Proiezione anno separata dai dati reali.
- [ ] Scenario prudente/base/ottimistico visibili.
- [ ] Rischio limite forfettario calcolato.

## Fatturazione

- [ ] Vista raggruppata per cliente.
- [ ] Una fattura mensile per cliente.
- [ ] Sottorighe progetto/cliente finale visibili.
- [ ] Descrizioni Fiscozen copiabili.
- [ ] Template Fiscozen applicati.
- [ ] Stato fattura salvabile.
- [ ] Numero fattura salvabile.
- [ ] Data fattura salvabile.
- [ ] Data incasso e importo incassato salvabili.
- [ ] Rivalsa INPS calcolata se attiva.
- [ ] Bollo calcolato se attivo.
- [ ] Totale fattura corretto.

## Fiscalità

- [ ] Configurazione fiscale anno selezionabile.
- [ ] Codice ATECO modificabile.
- [ ] Coefficiente redditività modificabile.
- [ ] Aliquota imposta sostitutiva modificabile.
- [ ] Rivalsa INPS modificabile.
- [ ] Limite ricavi modificabile.
- [ ] Stima tasse aggiornata.
- [ ] Data avvio attività letta correttamente.
- [ ] Mesi esclusi dalla proiezione considerati.

## Tema e UI

- [ ] Tema Scuro/Sera applicato a tutte le viste.
- [ ] Tema Chiaro/Giorno applicato a tutte le viste.
- [ ] Font coerenti e leggibili.
- [ ] Nessun testo microscopico.
- [ ] Card, badge e pulsanti coerenti.

## PWA/cache

- [ ] Dopo deploy si vede la versione corretta.
- [ ] Service worker non blocca vecchie versioni.
- [ ] Installazione PWA da Safari/Chrome funzionante.
- [ ] Rimozione e reinstallazione PWA risolve cache obsolete.
