# Timesheet

Gestionale ore multi-studio con ruoli. Prodotto separato da TOTIME: stessa
struttura tecnica, database proprio, brand proprio.

Vive per ora in una cartella di questo repository, su un ramo dedicato.
È autonomo: nessun file fuori da `timesheet/` viene toccato, quindi il
giorno che serve si sposta in un repository suo senza modifiche.

## Le tre scelte che guidano il disegno

| | |
|---|---|
| **Ambito** | Prodotto multi-studio: ogni studio è isolato, con i propri utenti e dati |
| **Controllo ore** | Blocco mensile, non approvazione riga per riga |
| **Economia** | Costi e ricavi, per calcolare il margine |

## Il principio da non perdere di vista

Le policy di Postgres proteggono le **righe**, non le colonne. Finché la
tariffa è una colonna di `clients`, chiunque possa leggere i clienti legge
anche la tariffa — nascondere il dato nell'interfaccia non serve a niente,
perché la risposta del server si legge dagli strumenti sviluppatore.

Quindi tutto ciò che è economico vive in tabelle proprie:

- `client_rates` — tariffe verso il cliente, storicizzate
- `member_costs` — costo di ciascun collaboratore, storicizzato
- `entry_revenue` — il ricavo di ogni ora
- `entry_cost` — il costo di ogni ora, in una tabella **diversa** dal
  ricavo, perché l'Amministrazione deve vedere quanto si fattura senza
  vedere quanto costano i colleghi

Le ore, in `timesheet_entries`, contengono solo quantità e contesto: chi,
quando, quale cliente, quale attività. Nessun euro. La valorizzazione la
fa il database con un trigger, usando la tariffa **in vigore alla data
della prestazione**, così chi inserisce le ore non ha mai bisogno di
leggere le tariffe.

## I ruoli

Vivono nel database come dati (`roles` + `role_permissions`), non nel
codice: se ne aggiunge uno o si sposta un permesso senza rilasciare l'app.

| Può… | Collaboratore | Responsabile | Amministrazione | Titolare |
|---|:--:|:--:|:--:|:--:|
| Inserire le proprie ore | sì | sì | — | sì |
| Vedere le ore altrui | — | suoi progetti | tutte | tutte |
| Anagrafiche | lettura | lettura | gestione | gestione |
| Tariffe cliente | — | — | sì | sì |
| Costi dei collaboratori | — | — | — | sì |
| Chiudere il mese | — | — | sì | sì |
| Invitare e dare ruoli | — | — | — | sì |

## Il tranello della ricorsione

La tabella delle iscrizioni serve a stabilire i permessi, ma è essa stessa
protetta dai permessi: scritta in modo ingenuo, la policy chiama sé stessa
e il database si blocca. È l'errore più comune su Supabase.

Si risolve con `app.my_orgs()` e `app.has_perm()`, due funzioni
`security definer` che rispondono fuori dal controllo delle policy. Sono
il cardine di tutta la sicurezza: si toccano con estrema cautela.

## Brand

Ripreso da Solution Consulthink:

| | |
|---|---|
| Accento | `#EF3E00` |
| Accento secondario | `#F0764A` |

Ogni studio può poi avere il proprio, tramite il campo `brand` della
tabella `organizations`.

## File

```
timesheet/
  db/
    0001_schema.sql        lo schema completo, da eseguire su Supabase
    test/
      00_shim.sql          riproduce auth.uid() e i ruoli di Supabase (solo locale)
      01_policies.sql      le prove sulle policy
      run.sh               avvia un Postgres usa-e-getta e lancia tutto
```

## Provare le policy

```sh
sh timesheet/db/test/run.sh
```

Avvia un PostgreSQL locale usa-e-getta, applica lo schema e impersona sei
utenti diversi verificando che ciascuno veda esattamente quello che deve.
Nessuna prova gira come superutente, che scavalcherebbe le policy e
renderebbe il test inutile.

Esito atteso: **36 prove superate, 0 fallite**.

Le prove coprono l'isolamento fra studi, l'inaccessibilità dei dati
economici al collaboratore, la visibilità delle ore per ruolo, la
valorizzazione con tariffa storicizzata, il blocco del mese applicato dal
database e l'impossibilità per un collaboratore di promuoversi da solo.

## Stato

- [x] Fase 1 — schema, policy, ruoli, valorizzazione, blocco mese
- [ ] Fase 2 — registrazione, creazione studio, inviti, gestione persone
- [ ] Fase 3 — timesheet del collaboratore
- [ ] Fase 4 — vista consolidata del titolare
- [ ] Fase 5 — costi, ricavi e margine
- [ ] Fase 6 — chiusura del mese nell'interfaccia
- [ ] Fase 7 — brand, dominio, messa online

## Da fare prima della fase 2

Serve un progetto Supabase nuovo e vuoto su cui eseguire `0001_schema.sql`.
Lo schema non è mai stato eseguito su Supabase: è stato provato solo su
PostgreSQL 16 locale, che è lo stesso motore ma senza il contorno di
Supabase (schema `auth`, ruoli, PostgREST). La prima esecuzione va
verificata.
