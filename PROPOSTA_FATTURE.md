# Caricare la fattura emessa, e allineare i dati a lei

## Cosa cambia, in una riga

Oggi l'app **propone** i dati per la fattura. Da qui in avanti, una volta
che la fattura è emessa, **la fattura è la verità**: si carica, l'app ci
allinea i propri dati, e dice dove non tornavano.

È un rovesciamento, non un'aggiunta. Prima il consuntivo generava la
fattura; adesso la fattura emessa corregge il consuntivo.

## Quello che ho già verificato, non ipotizzato

La fattura di esempio (`Fattura 1/2026 — SOLUTION SRL`) **non è una
scansione**: ha un livello di testo, e `pdf.js` — la stessa libreria che
girerebbe nel browser — l'ha estratta pulita, 26 righe.

```
Fattura 1/2026   08/04/2026
SOLUTION SRL · P.IVA: 11695380961
Consulenza - Febbraio 2026 | Giorni: 1,0   460,00 €   1      460,00 €
Consulenza - Marzo 2026    | Giorni: 5,5   460,00 €   5,50  2.530,00 €
Totale prestazioni: 2.990,00 €
Rivalsa 4% GS INPS su 2.990,00 €  119,60 €
Totale: 3.109,60 €
Imposta di bollo assolta in modo virtuale
Da saldare entro il 31/05/2026
```

Primo errore mio, per onestà: al primo controllo avevo concluso che
fosse una scansione, perché cercavo i font nei byte grezzi e lì erano
compressi. Sbagliato: aprendo gli stream, i font ci sono.

## La sorgente: XML, non PDF

Hai l'XML della fattura elettronica. È **nettamente** meglio:

- i campi sono già separati e certificati, non interpretati da un testo;
- non si rompe se il fornitore di fatturazione cambia il layout;
- i numeri sono quelli trasmessi allo SdI, cioè quelli che fanno fede.

Il PDF resta come ripiego, per le fatture di cui l'XML non c'è.

## Il modello: la fattura diventa un oggetto

Oggi `billing_headers` è una riga per *(anno, mese, cliente)*: una
fattura = un mese. La tua `#1/2026` copre **febbraio e marzo**, quindi
il modello attuale non la regge.

Nuovo impianto:

- **`invoices`** — la fattura: numero, data, cliente, imponibile,
  rivalsa, bollo, totale, scadenza, stato, il file originale.
- **`invoice_lines`** — le righe: descrizione, quantità, prezzo
  unitario, importo, **e il mese che fatturano**.

Così una fattura può coprire quanti mesi vuole, e ogni mese sa quanto
gli è stato fatturato davvero.

## Gli incroci — che sono il punto

Caricata la fattura, l'app confronta e **segnala**:

| dalla fattura | contro cosa | se non torna |
|---|---|---|
| P.IVA | il cliente | non lo indovina: chiede |
| `Giorni: 5,5` marzo | i giorni consuntivati a marzo | **fatturato ≠ lavorato** |
| totale prestazioni | servizi + manuali + spese attesi | manca o avanza qualcosa |
| rivalsa 4% | la rivalsa calcolata | aliquota o base diversa |
| totale documento | la somma delle sue parti | la fattura non torna con sé stessa |
| spese riaddebitate | i rimborsi che l'app si aspettava | una spesa non fatturata |
| scadenza | — | campo nuovo |

Nessun allineamento avviene in silenzio: prima si vede cosa cambia, poi
si conferma.

## Cosa serve da te

**Un XML vero**, uno qualsiasi. Costruire il riconoscitore su uno schema
a memoria e scoprire dopo che il tuo file è diverso è esattamente
l'errore che ho già fatto altre volte in questo lavoro. Con un file vero
davanti, il riconoscitore nasce misurato su quello.

## Come lo rilascio

Uno strato alla volta, ognuno verificato e rilasciato da solo.

1. Il modello: `invoices` + `invoice_lines`, e la migrazione.
2. Il caricamento del file e la sua conservazione.
3. Il riconoscitore XML (con un tuo file davanti).
4. Gli incroci e il riepilogo delle incongruenze.
5. L'allineamento, con conferma.
6. Il ripiego PDF, già dimostrato funzionante.
