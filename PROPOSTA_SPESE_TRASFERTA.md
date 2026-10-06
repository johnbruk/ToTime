# Spese di trasferta — proposta di riordino

Scritto il 6 ottobre 2026. È una proposta: **non ho toccato una riga di codice.**
Prima voglio il tuo sì su cosa costruire e in che ordine.

---

## 1. Cosa non funziona oggi

Ho letto il codice delle spese (`expenseForm`, `expenseEdit`, `expenses`,
`expenseCategories`, `clientPolicyEditor`) e guardato la schermata che mi hai
mandato. Nove problemi concreti, in ordine di quanto pesano.

### 1.1 La trasferta non esiste come oggetto
Nella tua schermata di ottobre si legge:

| data | cliente · città | voce | importo |
|---|---|---|---|
| 29/10 | K2 · Catania | Rimborso KM | 94,50 |
| 25/10 | K2 · Catania | Volo | 428,00 |
| 25/10 | K2 · Catania | Rimborso KM | 94,50 |
| 06/10 | K2 · Geneva | Pranzo/Cena | 60,00 |

Sono quattro righe slegate. Da nessuna parte è scritto «**trasferta a Catania,
25–29 ottobre, 617,00 €**». Il volo di andata e il rimborso km del ritorno sono
la stessa trasferta e l'app non lo sa. Quindi non può rispondere a nessuna delle
domande che uno si fa davvero:

- quanto mi è costata la trasferta a Catania?
- quali trasferte non ho ancora riaddebitato?
- quante trasferte ho fatto per K2 quest'anno?

Tutti i gestionali di nota spese — Concur, ZTravel di Zucchetti, Expensify,
Factorial — partono da un contenitore: Concur lo chiama *expense report* con
*itinerary*, Zucchetti lo chiama *missione*. La singola ricevuta ci sta dentro,
non da sola. Noi abbiamo solo le ricevute.

### 1.2 Il modulo è un elenco piatto di undici campi
Data, Cliente, Progetto, Voce, Tipo rimborso, Città, Descrizione, Quantità,
Costo unitario, Totale, Note. Tutti con lo stesso peso visivo.
Quelli che cambi ogni volta (data, voce, importo) stanno accanto a quelli che
non tocchi mai (costo unitario a quattro decimali).

E c'è un difetto vero: il modulo chiede **sia** Quantità × Costo unitario
**sia** il Totale, in tre caselle scrivibili, senza dire quale vince. Se
correggi il totale a mano, quantità e tariffa restano lì a raccontare un'altra
cifra. Due fonti di verità per lo stesso numero.

### 1.3 Niente ricevuta. Proprio niente.
Non c'è un campo allegato, non c'è una foto, non c'è nemmeno una spunta
«ricevuta sì/no». Una nota spese senza giustificativi non è una nota spese: è
un appunto. E dal 2025 la questione non è più solo di ordine — vedi 1.6.

### 1.4 Niente metodo di pagamento
Non si può dire se una spesa è stata pagata con carta, bonifico o contanti.
È esattamente il dato che decide il trattamento fiscale del riaddebito.

### 1.5 Il rimborso chilometrico è trattato come un pasto
«Rimborso KM» è una voce di spesa normale, con una tariffa battuta a mano.
Manca tutto quello che serve: il veicolo, la tariffa ACI di quel veicolo, il
da → a, i km, l'andata e ritorno. Le tabelle ACI cambiano ogni anno (le 2026
sono già pubblicate, si consultano su `costikm.aci.it`): la tariffa deve stare
sul veicolo e cambiare in un posto solo, non essere ridigitata su ogni riga.

Nei tuoi dati vedo due righe «Rimborso KM 94,50 €» identiche. Non so se sono lo
stesso tragitto fatto due volte o un errore, e **nemmeno tu puoi saperlo**
guardando l'app: non c'è scritto quanti km né da dove a dove.

### 1.6 Il trattamento fiscale è deciso dall'app, non da te
Oggi «Rimborso in fattura» finisce dritto nei ricavi (`totals().amount`) e
quindi dentro la proiezione delle tasse. È una scelta implicita.

Dal 1° gennaio 2025 la riforma (D.Lgs. 192/2024, art. 54 TUIR, con la
tracciabilità introdotta dalla L. 207/2024) stabilisce che i rimborsi
**analitici** di vitto, alloggio, viaggio e trasporto, **pagati con strumenti
tracciabili** e addebitati voce per voce al committente, non concorrono al
reddito e non toccano la soglia degli 85.000 €. I rimborsi **forfettari** — e il
rimborso chilometrico è forfettario — restano compensi imponibili.

Sulla **applicazione al forfettario** la dottrina è divisa: la norma non
richiama espressamente la L. 190/2014 e manca un chiarimento. Fatture in Cloud e
Fiscozen la danno per applicabile, altri consigliano prudenza.
**Per questo non la metto in automatico**: diventa un'impostazione, con il
comportamento di oggi come default, e la decisione la prendi tu con il tuo
commercialista.

Ma l'app deve almeno *mostrarti* la differenza, che oggi non vede: su 617 € di
trasferta a Catania, 428 € di volo sono analitici e 189 € di chilometrica sono
compenso. Due nature diverse nella stessa trasferta.

### 1.7 La policy per cliente è finta
`clientPolicyEditor` oggi fa una cosa sola: per ogni voce di spesa, una tendina
con i tre tipi di rimborso. Non c'è nessun **limite**: niente «pasto max 35 €»,
niente «hotel max 150 €/notte». I limiti sono la sostanza di qualsiasi travel
policy — i regolamenti trasferte pubblici (per dirne uno, quello del Ministero
della Cultura) sono fatti quasi solo di quelli. E l'editor sta in fondo al
modulo di modifica cliente, senza una riga che spieghi cosa stai impostando.

### 1.8 Le spese nuove nascono scollegate dalla commessa
A settembre abbiamo fatto una bonifica (`2026-09-10_bonifica-spese-wbs.sql`) che
crea una WBS «Trasferte e spese» per progetto e ci riattacca le spese orfane.
La colonna `wbs_id` c'è sul database. **Ma il modulo di inserimento non la
chiede.** Quindi ogni spesa che inserisci oggi nasce con `wbs_id` vuoto e
l'analisi per commessa torna a bucarsi. La bonifica va rilanciata a mano in
eterno.

### 1.9 Il riepilogo non dice la cosa che serve
Due riquadri: «A mio carico 0,00 €» e «Rimborsi 677,00 €». Non dicono mai
l'unico numero che conta di mattina: **quanto devo ancora riaddebitare**.
677 € sono già in fattura o aspettano? L'app lo sa (c'è lo stato della
fatturazione) e non lo scrive.

### 1.10 E il menu di configurazione
«Voci di costo / spesa» sta sotto **Anagrafiche**, tra «Attività» e «Template
fattura». Ma non è un'anagrafica della gerarchia Cliente › Progetto › Commessa:
è la configurazione delle spese, e sta nel posto sbagliato. Di trasferte, nel
menu, non si parla: niente veicoli, niente limiti, niente sedi.

---

## 2. Come sono fatti i portali veri

In sintesi, quello che ho trovato guardando come sono strutturati:

| | Come fanno |
|---|---|
| **Contenitore** | Concur: *expense report* con header (tipo viaggio, nome, date, destinazione, motivo) + *itinerary* per tratta. Zucchetti ZTravel: *missione*. Sempre un livello sopra la ricevuta. |
| **Voce di spesa** | Tipo + sottotipo (Concur usa codici, es. RE01/RE02). Non una lista piatta. |
| **Itemizzazione** | Una ricevuta d'albergo si spacca in pernottamento + colazione + city tax, perché hanno trattamenti diversi. |
| **Ricevuta** | Foto da telefono, OCR che estrae importo, data, valuta, fornitore, tipo documento **e il metodo di pagamento** per verificare la tracciabilità (è proprio quello che fa ZTravel). |
| **Policy** | Limiti per voce e per cliente/paese. Chi sfora lo vede mentre inserisce, non dopo. |
| **Chilometrica** | Veicolo registrato una volta, tariffa ACI per quel veicolo, percorso da → a, km. |
| **Diaria** | Concur calcola l'indennità giornaliera dall'itinerario e la riduce per i pasti offerti. |
| **Stato** | Bozza → inviata → approvata → rimborsata. Nel tuo caso: bozza → da riaddebitare → in fattura → incassata. |

Due cose non ci servono: l'approvazione (sei tu il capo) e il multi-valuta
spinto (hai Geneva, quindi i franchi servono — ma una conversione semplice
basta). Tutto il resto sì.

---

## 3. La proposta

Sette strati. Sono ordinati: ognuno sta in piedi da solo e si può rilasciare da
solo. Puoi dirmi «fino al 3» e il resto resta qui scritto.

### Strato 1 — La trasferta diventa un oggetto *(il cuore)*

Tabella nuova `trips`:

| campo | cosa contiene |
|---|---|
| `client_id`, `project_id`, `wbs_id` | a chi la riaddebito |
| `destination_city`, `destination_country` | Catania, IT · Geneva, CH |
| `start_date`, `end_date` | 25/10 → 29/10 |
| `purpose` | «Go-live Omnichannel» |
| `status` | bozza · da riaddebitare · in fattura · chiusa |
| `notes` | |

Sulle spese: `trip_id` **opzionale**. Le spese che non sono trasferte (software,
abbonamenti, costi puri) restano come sono, senza trasferta. Niente si rompe:
tutte le spese esistenti partono con `trip_id` vuoto e continuano a comparire
dove compaiono oggi.

La pagina Spese diventa due viste, con lo stesso meccanismo di scelta che
abbiamo già messo sulle tasse:

- **Trasferte** — una scheda per trasferta: destinazione, date, totale, stato,
  e dentro le spese. Comprimibile, come i gruppi cliente del timesheet.
- **Tutte le spese** — l'elenco per giorno di oggi, identico. Chi vuole la
  lista piatta la trova dov'è sempre stata.

E un'azione che oggi manca del tutto: **«Raggruppa in una trasferta»**, che
prende le righe già inserite e le attacca a una trasferta nuova. Senza quella,
i tuoi dati di ottobre resterebbero slegati per sempre.

### Strato 2 — Il modulo in tre blocchi

Invece di undici campi in fila:

**Quando e dove** — data · trasferta (o «spesa singola») · città
**Cosa** — voce di spesa a pulsanti colorati (riuso la tavolozza a 12 tinte
delle attività) · importo · descrizione
**Come la tratto** — tipo rimborso · metodo di pagamento · ricevuta

Se scegli una trasferta, cliente, progetto, commessa e città li prende da lei:
quattro campi che spariscono. Quantità × tariffa compare **solo** per le voci
che sono `quantity_rate`, e il totale diventa calcolato e non scrivibile — via
le due fonti di verità del punto 1.2.

E il campo **Commessa / WBS**, che oggi manca (punto 1.8).

### Strato 3 — La chilometrica fatta bene

Tabella nuova `vehicles`: nome o targa, alimentazione (benzina · diesel ·
ibrida · plug-in · elettrica), **tariffa €/km**, anno della tabella ACI da cui
viene, attivo sì/no.

Sulla spesa chilometrica: veicolo · da → a · km · andata e ritorno.
Importo = km × tariffa, calcolato, non scrivibile.

In configurazione, una pagina «Veicoli e rimborso km» che ti ricorda che la
tabella ACI cambia a gennaio e ti manda a `costikm.aci.it`.

Risultato: «Rimborso KM 94,50 €» diventa
**«Catania → Modica e ritorno · 210 km × 0,45 €/km · Panda»**.

### Strato 4 — Policy con i limiti

Le righe di `expense_policy` passano da `{category_id, type}` a
`{category_id, type, cap, cap_unit}`: pasto max 35 €, hotel max 150 €/notte,
volo max 400 €.

Mentre inserisci, se sfori: **«Oltre il limite K2 — pasto max 35 €. 25 €
eccedenti.»** con due pulsanti: *tengo tutto a mio carico* oppure *spezza in
due righe* (35 € in fattura + 25 € a mio carico). Quello che fanno i portali:
te lo dicono prima, non a fattura emessa.

L'editor esce dal fondo del modulo cliente e diventa una pagina sua, con una
tabella leggibile e due righe che spiegano cosa stai decidendo.

### Strato 5 — Ricevute e tracciabilità

`payment_method` sulla spesa: carta · bonifico · contanti · pagata dal cliente.
E un distintivo **tracciabile / non tracciabile** sulla riga, perché è
l'interruttore fiscale del punto 1.6.

Per la foto della ricevuta serve Supabase Storage, che oggi **non usiamo da
nessuna parte** nell'app: è infrastruttura nuova (bucket privato, policy RLS per
utente, upload, anteprima). Due strade:

- **5a, piccolo** — solo `payment_method` + spunta «ricevuta conservata».
  Nessuna infrastruttura nuova, e già ti dà la lista di controllo.
- **5b, completo** — bucket `ricevute`, foto dal telefono, miniatura sulla
  riga.

Consiglio di fare **5a subito e 5b dopo**, separati: 5b è l'unico pezzo di
questa proposta che aggiunge un servizio nuovo, e voglio testarlo da solo.

### Strato 6 — Onestà fiscale

In Configurazione fiscale, una scelta sola:

> **I rimborsi analitici li conto come compensi?**
> **Sì, prudente** — come fa l'app oggi: tutto nei ricavi e nella proiezione.
> **No, regola 2025** — i rimborsi analitici tracciabili restano fuori dal
> reddito e fuori dalla soglia 85.000 €.

Default **Sì**, cioè nessun numero si muove senza che tu lo decida.
E sotto, la nota che la chilometrica è forfettaria e resta compenso in entrambi
i casi, e che la norma sul forfettario non è pacifica.

Sulla scheda della trasferta, in chiaro:
**«Da riaddebitare 617,00 € — di cui 428,00 € analitici · 189,00 € chilometrici
(compenso)»**.

### Strato 7 — Il menu di configurazione

Oggi:

```
Account · Anagrafiche (Clienti, Progetti, Commesse, Attività,
Voci di costo/spesa) · Fatturazione e fisco · Analisi e dati · App
```

Proposta: una sezione nuova e «Voci di costo / spesa» che se ne va da
Anagrafiche, dove non c'entra:

```
Account
Anagrafiche            Clienti · Progetti · Commesse · Attività
Trasferte e spese      Voci di spesa
                       Veicoli e rimborso km          ← nuova
                       Policy rimborsi per cliente    ← nuova (oggi nascosta)
Fatturazione e fisco   Template fattura · Configurazione fiscale · Pagamenti
Analisi e dati         Export · Import
App                    Aspetto · Database
```

---

## 4. Cosa cambia nei numeri (niente, se non vuoi)

Da verificare riga per riga prima di rilasciare, e lo metto nei test:

- `totals()` — i rimborsi continuano a entrare nei ricavi come oggi, a meno che
  tu non giri l'impostazione dello strato 6.
- `costsForYear`, `costsByCategoryData`, Bilancio — invariati.
- `billingDetailView` — la fattura prende le spese come sempre; la trasferta è
  un raggruppamento in più, non un percorso nuovo.
- `expenseFiscoText` — con la trasferta può scrivere descrizioni **analitiche**
  («Volo Catania 25/10 · 428,00 €») invece del generico «Rimborso spese di
  trasferta - Ottobre 2026». È proprio il requisito dell'addebito analitico, e
  oggi la descrizione generica non lo soddisfa.
- Import CSV spese — continua a funzionare; `trip_id` resta vuoto.

---

## 5. Da dove partirei

**Strati 1 + 2 + 3** in un rilascio solo: la trasferta, il modulo riorganizzato,
la chilometrica. Sono quelli che rispondono a *«le informazioni non sono
organizzate bene»*, e il terzo sistema la voce che nei tuoi dati è più fragile.

Poi **4 + 7** (limiti e menu), poi **6** (fiscale, da decidere con il
commercialista), poi **5b** (le foto) da solo.

Migrazione SQL: una sola, `trips` + `vehicles` + `trip_id` + `payment_method` +
`receipt_kept`, tutta `IF NOT EXISTS`, che non tocca una riga dei tuoi dati.
Te la mando da lanciare nel SQL Editor come le altre.

Come sempre: batteria completa prima, percorso in `tests/ui/uso.mjs` che parte
dalla Dashboard per ogni cosa nuova, e **il rilascio lo autorizzi tu**.

---

# Stato dei lavori — aggiornato il 6 ottobre 2026

Tutti gli strati proposti qui sopra sono stati costruiti, testati e
rilasciati, uno alla volta. Ogni riga è stata verificata sul sito vivo
scaricando i file e confrontandoli byte per byte con quelli testati.

| Versione | Cosa | Migrazione |
|---|---|---|
| v1.29.0 | **Strato 1** — la trasferta come oggetto, due viste, raggruppamento con un tocco | `2026-10-06_trasferte.sql` |
| v1.29.1 | **Strato 2** — modulo in tre blocchi, e il campo Commessa che mancava | — |
| v1.29.2 | **Strato 3** — chilometrica: veicolo, percorso, km | `2026-10-06_veicoli-e-chilometrica.sql` |
| v1.29.3 | **Strato 4** — limiti di policy, avviso mentre inserisci, spezza in due righe | — |
| v1.29.4 | **Strato 5a** — metodo di pagamento e tracciabilità | `2026-10-06_tracciabilita.sql` |
| v1.30.0 | **Le spese in fattura** — il piè di lista non sparisce, descrizioni analitiche | — |
| v1.30.1 | **Strato 6** — la scelta su rimborsi e reddito, default invariato | — |
| v1.30.2 | **Strato 7** — sezione «Trasferte e spese» nel menu | — |
| v1.31.0 | **Strato 5b** — le foto delle ricevute su Supabase Storage | `2026-10-06_ricevute-storage.sql` |
| v1.31.1 | La ricevuta non cancella più il modulo mezzo compilato (P1 Codex) | — |
| v1.31.2 | Il conto del rimborso km si vede: «210 km × 0,45 €/km = 94,50 €» | — |
| v1.31.3 | Le righe vecchie coi km non vengono più azzerate scegliendo il veicolo (P1 Codex) | — |
| v1.31.4 | Stessa protezione per le righe importate senza tariffa (P1 Codex) | — |
| v1.31.5 | Il ripiego «importo a mano» si spegne quando la riga si completa (Codex) | — |
| v1.31.6 | L'app non riscrive un importo che una persona vede (2 P1 Codex) | — |

## Le quattro migrazioni da lanciare

Nel SQL Editor di Supabase, **in quest'ordine**. Sono tutte sicure da
rilanciare e nessuna tocca un importo esistente.

1. `migrations/2026-10-06_trasferte.sql`
2. `migrations/2026-10-06_veicoli-e-chilometrica.sql`
3. `migrations/2026-10-06_tracciabilita.sql`
4. `migrations/2026-10-06_ricevute-storage.sql` — questa aggiunge
   Supabase Storage, che prima non era usato: se preferisci rimandare le
   foto delle ricevute, salta solo questa. Il resto funziona comunque, e
   la spunta «la ricevuta ce l'ho» resta.

Finché una migrazione non è stata lanciata, la parte corrispondente
ricade sul comportamento di prima e lo dice: non si rompe niente, e
l'app non resta zitta.

## I bug veri trovati dai test, non dal codice

Vale la pena elencarli, perché sono il motivo per cui i test si
scrivono prima e si sabotano dopo.

1. **Il totale corretto a mano veniva sovrascritto in silenzio.**
   `updateExpenseCalc` lo riscriveva a ogni tocco su quantità o
   tariffa.
2. **Il campo «Importo totale» non aveva nessun gestore**, quindi
   l'avviso sui limiti di policy non si attivava mai sulle voci a
   importo secco — cioè quasi tutte.
3. **Una spesa senza trasferta e senza città era invisibile** nella
   vista che si apre per prima: il blocco delle spese da raggruppare
   elencava i gruppi ma non le righe.
4. **`dropKeys` non era coperto da nessun test**: togliendolo tutto
   restava verde, perché il ripiego legge il nome della colonna dal
   messaggio d'errore. Ma non tutti i messaggi lo contengono.
5. **Il piè di lista non arrivava in fattura affatto** — trovato
   leggendo `groupSummary()`, non dai test: soldi anticipati e
   dimenticati.
6. **Un test verde per il motivo sbagliato**: quello sul caricamento
   della ricevuta leggeva il toast ancora fermo su «Carico la
   ricevuta…», quindi passava anche con l'app muta sul guasto.

## I bug trovati dopo il rilascio — dall'uso vero e da Codex

Questi non li ha trovati la batteria. Vale la pena dirlo.

1. **Il rimborso km non calcolava l'importo** (trovato usando l'app).
   Due cause distinte: una voce di spesa chilometrica rimasta su
   «importo secco» nascondeva del tutto il campo della tariffa, e con
   tariffa a zero il totale restava 0 senza dire perché. I test non
   l'avevano preso perché la fixture era scritta sul disegno nuovo, non
   sulle voci di spesa già esistenti. Ora la chilometrica porta sempre
   con sé km e tariffa, e se la tariffa manca lo scrive.
2. **Caricare una ricevuta cancellava il modulo mezzo compilato.** La
   causa era più a monte di come era stata segnalata: `setMsg()` rifà
   tutta la pagina, quindi perfino il messaggio «Carico la ricevuta…»
   buttava via quello che stavi scrivendo. Ora i messaggi leggeri non
   rifanno la pagina.
3. **Una mia correzione ha messo a rischio dati veri, per quattro giri
   di seguito.** Il ripiego introdotto al punto 1 azzerava a 0,00 le
   righe vecchie che avevano l'importo ma non i km, appena si scegliesse
   un veicolo — e lasciava il campo in sola lettura, quindi
   irreparabile. Codex l'ha segnalato quattro volte, ogni volta su una
   strada diversa: righe senza km, righe senza tariffa, il ripiego che
   non si spegneva mai, e infine — spegnendosi — il ripiego che
   *riscriveva* l'importo, cancellando una cifra che una persona ha
   davanti agli occhi.
   La regola che mancava era una sola, e vale per tutta l'app:
   **non si riscrive un importo che una persona vede e può modificare.**
   Il conto si riprende una riga solo quando non c'è niente da perdere;
   se i numeri discordano li dice entrambi e lascia decidere. Nessun
   dato è stato perso: tutti i difetti sono stati chiusi prima che tu
   ci lavorassi sopra.

## Cosa resta aperto

- **La policy del cliente da PDF.** L'app è vanilla JS + Supabase,
  senza server e senza modelli: non può capire un PDF da sola. Ora che
  Supabase Storage c'è (Strato 5b), il PDF si *può* allegare al cliente,
  e si può aggiungere un campo «incolla qui il testo della policy» con
  un riconoscitore di schemi («massimo 35 euro per pasto», «fino a 150 €
  a notte») che **propone** i limiti da confermare. Oppure mandi il PDF
  di K2 e i limiti te li imposto io. Da decidere.
- **Il piè di lista in fattura.** Oggi sta in una sezione sua, fuori dal
  totale, perché è una partita di giro: nessun importo di fattura si è
  mosso. Se lo vuoi *dentro* la fattura, si cambia in una riga.
- **La diaria** (indennità giornaliera) non è stata fatta: nei portali
  c'è, ma per un forfettario che riaddebita analiticamente serve meno.
- **Il multi-valuta**: Geneva è in franchi, ma oggi si scrive l'importo
  già in euro. Una conversione semplice si può aggiungere.
- **Le ricevute scaricabili insieme all'Excel della trasferta.** La
  prima stesura di questo documento le prometteva nello strato 5b.
  Non sono state fatte: l'export legge solo i campi della spesa, non
  `receipt_path`, quindi non esiste un modo di tirare giù il fascicolo
  di una trasferta in un colpo solo. La promessa è stata tolta dalla
  descrizione dello strato; la cosa resta da fare, e non è grande.
