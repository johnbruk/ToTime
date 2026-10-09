# Le migrazioni da lanciare

Nel **SQL Editor di Supabase**, in quest'ordine. Sono tutte sicure da
rilanciare e **nessuna tocca un importo esistente**: ognuna finisce con
un blocco di verifica che stampa cosa è stato fatto.

Finché una migrazione non è stata lanciata, la parte dell'app che la
usa **ricade sul comportamento di prima**. Non si rompe niente.

Su quanto l'app lo dica, va distinto, perché la prima stesura di questo
documento prometteva più di quanto il codice facesse:

- **Quando salvi e il database non ha dove mettere un dato** (il metodo
  di pagamento, la trasferta, il percorso chilometrico), la riga si
  salva lo stesso e **l'app ti dice cosa non è stato scritto e quale
  migrazione lo sistema**. Prima lo scartava in silenzio: scrivevi come
  avevi pagato, la spesa si salvava, e quel dato non c'era.
- **Quando manca una tabella intera** (`trips`, `vehicles`), l'app non
  mostra avvisi: semplicemente non offre quella parte — la pagina Spese
  resta sull'elenco per giorno di sempre, e la pagina Veicoli dice che
  serve la migrazione. È una mancanza che si vede, non un dato perso.

---

## 1. `migrations/2026-10-06_trasferte.sql`

Crea la tabella `trips` e aggiunge `trip_id` alle spese.

Serve per: la pagina Spese «Per trasferta», il raggruppamento con un
tocco delle spese già inserite, la scheda con il totale della trasferta.

Senza di lei: la pagina Spese mostra solo l'elenco per giorno di sempre,
e non offre la vista per trasferta.

La verifica deve dire: `trips esiste` · `trip_id esiste` ·
`spese modificate dalla migrazione 0`.

L'ultima riga dice anche quante spese stanno già in una trasferta: è
solo informativa, e dopo che le avrai raggruppate sarà un numero
positivo. Non è un guasto.

---

## 2. `migrations/2026-10-06_veicoli-e-chilometrica.sql`

Crea `vehicles`, aggiunge veicolo / da / a / andata-e-ritorno alle
spese, e `is_mileage` alle voci di spesa.

Riconosce da sé come chilometriche le voci che hanno «km» come unità o
«chilometric» nel nome — quindi la tua «Rimborso KM» dovrebbe risultare
già marcata. Si corregge dalla voce di spesa, se sbaglia.

Il riconoscimento automatico gira **solo la prima volta**, cioè solo se
la colonna non c'era: rilanciando la migrazione dopo una tua correzione,
quella correzione resta. La migrazione stampa un avviso che dice quale
dei due casi è stato.

Senza di lei: la chilometrica si registra come sempre, km e tariffa a
mano, e la pagina Veicoli lo dice invece di mostrarsi vuota.

La verifica deve dire: `vehicles esiste` · `colonne sulle spese 4 su 4` ·
`voci chilometriche riconosciute 1` (o più).

---

## 3. `migrations/2026-10-06_tracciabilita.sql`

Aggiunge `payment_method` e `receipt_kept` alle spese.

Senza di lei: i due campi si vedono nel modulo ma il database li
scarta; la spesa si salva comunque, col suo importo intatto. È provato
da un test.

La verifica deve dire: `colonne aggiunte 2 su 2`.

---

## 4. `migrations/2026-10-06_ricevute-storage.sql`

**Questa è diversa dalle altre tre**: crea un bucket su Supabase
Storage, che l'app non usava da nessuna parte. È l'unico servizio nuovo
di tutta la serie.

Se preferisci rimandare le foto delle ricevute, **salta solo questa**:
tutto il resto funziona, e la spunta «la ricevuta ce l'ho» resta.

La verifica deve dire: `colonna receipt_path esiste` ·
`bucket ricevute esiste, privato` · `policy sul bucket 4 su 4`.

Se dicesse «ESISTE MA E' PUBBLICO», fermati e dimmelo: un bucket
pubblico renderebbe le ricevute leggibili a chiunque ne indovini il
percorso.

---

## 5. `migrations/2026-10-09_fatture-conservate.sql`

Crea la tabella `invoice_documents`, dove si conservano le fatture
caricate: il file XML, la natura IVA, i mesi che coprono, il bollo
dichiarato.

Serve per: conservare il file quando registri una fattura caricata, e
ritrovarlo nel dettaglio della fattura con «Scarica l'XML».

Senza di lei: la registrazione scrive le schede dei mesi come prima, e
il file non si conserva. L'app lo dice nella schermata della fattura
caricata. Una fattura registrata prima della migrazione si conserva
dopo: ricaricandola, l'app offre «Conserva il file XML» senza
riscrivere le schede.

La verifica deve dire: `tabella invoice_documents esiste` ·
`RLS attiva` · `policy 4` · `fatture conservate 0` (all'inizio).

---

## Dopo

Due cose da fare a mano, una volta sola:

1. **Le tue quattro spese di ottobre** si raggruppano in due trasferte
   con due tocchi: Spese › «Per trasferta» › «Crea la trasferta» su
   Catania e su Geneva.
2. **La tariffa €/km del tuo veicolo**: Impostazioni › Trasferte e
   spese › Veicoli e rimborso km. La trovi su `costikm.aci.it`, e
   cambia a gennaio.

E una da decidere: in Configurazione fiscale, il blocco «Rimborsi spese
e reddito» è su «Li conto come compensi», che è il comportamento di
sempre. L'altra opzione applica la regola 2025.

Due avvertenze su quella seconda opzione, perché è una **stima**, non
una dichiarazione:

- Sul **regime forfettario** la norma non è pacifica: non richiama
  espressamente la legge 190/2014 e manca un chiarimento. La scelta va
  fatta con il commercialista, non con me.
- Il calcolo toglie dalla base solo i rimborsi **analitici, con
  ricevuta, e di un mese già incassato**; i chilometrici restano
  compenso perché forfettari. L'obbligo sul mezzo di pagamento cade per
  le spese sostenute **all'estero**, e l'app lo applica usando il paese
  della trasferta: perché valga su una spesa fuori Italia, quella spesa
  deve stare in una trasferta con il paese compilato (es. `CH` per
  Ginevra).
