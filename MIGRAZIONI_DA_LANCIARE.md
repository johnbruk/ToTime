# Le quattro migrazioni da lanciare

Nel **SQL Editor di Supabase**, in quest'ordine. Sono tutte sicure da
rilanciare e **nessuna tocca un importo esistente**: ognuna finisce con
un blocco di verifica che stampa cosa è stato fatto.

Finché una migrazione non è stata lanciata, la parte dell'app che la
usa **ricade sul comportamento di prima e lo dice**. Non si rompe
niente, e l'app non resta zitta.

---

## 1. `migrations/2026-10-06_trasferte.sql`

Crea la tabella `trips` e aggiunge `trip_id` alle spese.

Serve per: la pagina Spese «Per trasferta», il raggruppamento con un
tocco delle spese già inserite, la scheda con il totale della trasferta.

Senza di lei: la pagina Spese mostra solo l'elenco per giorno di sempre,
e non offre la vista per trasferta.

La verifica deve dire: `trips esiste` · `trip_id esiste` ·
`spese toccate 0`.

---

## 2. `migrations/2026-10-06_veicoli-e-chilometrica.sql`

Crea `vehicles`, aggiunge veicolo / da / a / andata-e-ritorno alle
spese, e `is_mileage` alle voci di spesa.

Riconosce da sé come chilometriche le voci che hanno «km» come unità o
«chilometric» nel nome — quindi la tua «Rimborso KM» dovrebbe risultare
già marcata. Si corregge dalla voce di spesa, se sbaglia.

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
sempre. L'altra opzione applica la regola 2025 — ma sul forfettario la
norma non è pacifica, quindi quella scelta va fatta con il
commercialista, non con me.
