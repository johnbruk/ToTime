# Migrazione commesse e WBS — istruzioni per la produzione

Non c'è un ambiente di staging, quindi la migrazione va fatta
direttamente in produzione. Queste istruzioni sono scritte perché ogni
passo sia verificabile e reversibile.

**Regola d'oro: dopo ogni passo si guarda l'esito prima di andare
avanti.** Se qualcosa non torna, ci si ferma e si lancia il rollback.

## Prima di cominciare

1. **Backup.** Supabase → Database → Backups. Se il piano lo prevede,
   verifica che il Point-in-Time Recovery sia attivo. Annota data e ora.
2. Nessuno deve usare l'app mentre si migra.

## Passo 0 — la fotografia di partenza

Nel SQL Editor:

```
migrations/2026-09-09_verifica-prima-e-dopo.sql
```

**Salva il risultato**: è la fotografia di com'erano i dati. Serve
per il confronto finale. Le righe della sezione B diranno `n/d`, ed è
giusto: quelle tabelle non esistono ancora.

## Passo 1 — lo schema

```
migrations/2026-09-09_commesse-progetti-wbs.sql
```

Crea tabelle, vincoli, trigger e policy. **Non tocca un solo dato.**
È idempotente: rilanciarla non fa danni.

A questo punto l'app continua a funzionare come prima, e in
Impostazioni → Commesse compare la nuova sezione, ancora vuota.

## Passo 2 — l'anteprima (non modifica niente)

```
migrations/2026-09-09_backfill-0-anteprima.sql
```

Mostra cosa farebbero i passi successivi: che codice verrebbe proposto
a ogni cliente, quante commesse e WBS nascerebbero, e soprattutto
**cosa non si riuscirà a classificare**. Leggilo con calma.

## Passo 3 — i codici cliente

```
migrations/2026-09-09_backfill-a-codici-cliente.sql
```

Propone un codice per ogni cliente e li stampa.

**Fermati qui e rivedili**, in Impostazioni → Clienti oppure con una
UPDATE. Il codice proposto è ricavato dal nome e può non piacerti:
per esempio due clienti che iniziano allo stesso modo si contendono
lo stesso codice e uno dei due prende una cifra in coda.

Dal passo successivo il codice entra in ogni codice di commessa e
**non si cambia più**.

## Passo 4 — commesse, progetti e WBS

```
migrations/2026-09-09_backfill-b-commesse-wbs.sql
```

Si rifiuta di partire se qualche cliente è ancora senza codice.

Alla fine stampa l'elenco di quello che è rimasto fuori. **Salvalo**:
è la lista da bonificare a mano.

## Passo 5 — il confronto

Rilancia la stessa verifica del passo 0:

```
migrations/2026-09-09_verifica-prima-e-dopo.sql
```

Confronta le due fotografie:

- **la sezione A deve essere IDENTICA**, comprese le impronte. Se una
  sola riga differisce, il backfill ha toccato dati che non doveva:
  ferma tutto e lancia il rollback;
- la sezione B deve essere passata da `n/d` a dei numeri;
- la sezione C dice quanto resta da sistemare a mano.

## Passo 6 — il completamento

```
migrations/2026-09-10_completamento.sql
```

Un solo script che chiude quello che resta. Ogni passo controlla prima
se serve, quindi si può rilanciare quante volte si vuole e non c'è da
ricordarsi cosa era già stato eseguito. Fa tre cose:

1. **le policy segnalate dal Performance Advisor** — `auth.uid()`
   valutato una volta per query invece che una volta per riga, sulle
   sei tabelle nuove;
2. **la bonifica delle spese** — per ogni progetto che ha spese ancora
   scollegate crea una WBS `90 · Trasferte e spese`, non fatturabile, e
   ci aggancia le spese. Nessun altro campo delle spese viene toccato;
3. **l'obbligo della WBS** sulle nuove registrazioni.

Sull'obbligo vale la pena spendere due righe, perché la scelta ovvia
sarebbe stata quella sbagliata. Un `not null` sulla colonna `wbs_id`
avrebbe reso impossibile registrare per un cliente che non ha ancora
commesse: il giorno che ne aggiungi uno nuovo, l'app avrebbe smesso di
funzionare finché non gli avessi aperto una commessa. La regola giusta
è più precisa, ed è quella implementata: **se il cliente ha delle
commesse la WBS è obbligatoria; se non ne ha, si registra come si è
sempre fatto.** Le spese restano fuori dall'obbligo, perché lì la WBS
serve all'analisi e una spesa può nascere prima di sapere su che
attività vada imputata.

Alla fine lo script stampa quattro righe di esito:

| controllo | atteso |
| --- | --- |
| policy che rivalutano `auth.uid()` per riga | `0` |
| spese ancora senza WBS | `0`, se tutte hanno un progetto |
| consuntivi ancora senza WBS | quelli senza progetto restano da sistemare a mano |
| obbligo WBS attivo | `2` |

Restano due cose fuori da questo script:

- `2026-09-10_advisor-fix-3-rls-tabelle-storiche.sql` — vedi il passo 7.
- **Leaked password protection**, da attivare a mano in Supabase:
  *Authentication → Providers → Email*. È l'unica segnalazione degli
  advisor che non si chiude da SQL.

## Passo 7 — le prestazioni sulle tabelle storiche

```
migrations/2026-09-10_advisor-fix-3-rls-tabelle-storiche.sql
```

Stessa correzione del passo 6, ma sulle tabelle che c'erano già:
`auth.uid()` valutato una volta per query invece che una volta per
riga. Il guadagno è di prestazioni, non di sicurezza.

Vale la pena spiegare come è fatto, perché è la parte che conta. Le
policy di queste tabelle **non sono mai state scritte in questo
repository**: sono nate a mano in Supabase, e qui non si sa né come si
chiamano né che condizione hanno. Uno script che le riscrivesse «a
modo suo» sarebbe pericoloso: se una policy fosse più stretta di
`user_id = auth.uid()`, riscriverla in forma standard la
allargherebbe, e da quel momento vedresti righe che prima erano
nascoste.

Questo script quindi **non riscrive niente a modo suo**. Legge la
policy che c'è, ci sostituisce dentro il solo `auth.uid()`, e la
ricrea identica in tutto il resto: nome, comando, ruoli, permissiva o
restrittiva, e ogni altro pezzo della condizione. Le policy che non
nominano `auth.uid()` non le guarda nemmeno; quelle già corrette le
salta, quindi rilanciarlo non le annida.

Alla fine restituisce **l'elenco delle policy che ha toccato** — come
risultato, non come messaggio, perché nell'editor SQL di Supabase i
messaggi `NOTICE` non si vedono e uno script che riscrive policy senza
dire quali non è una cosa da lanciare al buio. Sopra l'elenco ci sono
tre righe di controllo:

| controllo | atteso |
| --- | --- |
| policy che rivalutano `auth.uid()` per riga | `0` |
| tabelle con RLS attiva ma senza nemmeno una policy | `0` |
| tabelle con RLS spenta | `nessuna` |

Dopo averlo lanciato, fai un giro nell'app: apri il timesheet, le
spese e le fatture, e controlla di vedere i tuoi dati come prima.

## Passo 8 — l'inversione di progetto e commessa

```
migrations/2026-09-10_inversione-anteprima.sql          (sola lettura)
migrations/2026-09-10_inversione-progetto-commessa.sql
```

Il modello nasceva come **Cliente › Commessa › Progetto › WBS**. Ma un
cliente finale è un'entità che dura, e sotto ci vanno appese le
commesse man mano: il contratto di quest'anno, un ordine aggiuntivo,
quello dell'anno prossimo. Nel verso vecchio non era esprimibile senza
duplicare il cliente finale a ogni contratto.

Adesso è **Cliente › Progetto › Commessa › Attività**, e i codici lo
seguono:

| | prima | dopo |
| --- | --- | --- |
| progetto | `SO-2026-001-EQU` | `SO-EQU` |
| commessa | `SO-2026-001` | `SO-EQU-2026-001` |
| attività | `SO-2026-001-EQU-10` | `SO-EQU-2026-001-10` |

**Lancia prima l'anteprima.** È in sola lettura e mostra sui dati veri
quante commesse verranno sdoppiate, quali codici brevi collidono e che
codice avrà ogni riga dopo. Applica le stesse regole della migrazione,
rinomina dei codici e rinumerazione dei progressivi comprese: se lì
leggi `SO-EQU2`, dopo sarà `SO-EQU2`.

Cosa fa la migrazione ai dati:

- i progetti passano sotto il cliente;
- una commessa che copriva **più progetti viene sdoppiata**, una per
  progetto: nel verso nuovo non può stare sotto due;
- una commessa **senza progetti** ne riceve uno omonimo: nel verso
  nuovo deve averne uno;
- le attività passano dal progetto alla commessa;
- consuntivi, spese e fatture **non vengono toccati**: si aggiornano
  solo i collegamenti derivati.

Quando due progetti si contendono lo stesso codice breve, **lo tiene
quello su cui c'è già lavoro registrato** — è quello il cui codice può
essere già uscito — e a parità vince l'ordine alfabetico del nome. Non
è un dettaglio: prima quella scelta la decideva un UUID casuale, e su
un identificativo di business non va bene.

**I codici vengono ricalcolati tutti.** Lanciala solo se i codici
attuali non sono ancora usciti dall'app — fatture, contratti,
comunicazioni. Se lo fossero, fermati e conservali prima.

### L'ordine conta

L'app della v1.14.0 lavora nel verso nuovo. Se la rilasci prima di
lanciare la migrazione, non si rompe e non resta muta: si accorge che
il database è ancora nel verso vecchio e te lo dice, indicando lo
script da lanciare. Ma la sezione di commesse e attività resta
inagibile finché non l'hai lanciata. **Prima la migrazione, poi il
rilascio.**

## Se qualcosa va storto

```
migrations/2026-09-09_rollback-commesse-wbs.sql
```

Sgancia i collegamenti nuovi ed elimina le entità nuove. **Consuntivi,
spese, clienti, progetti e fatture non vengono toccati.** Poi rilancia
la verifica: la sezione A deve tornare uguale alla fotografia di
partenza e la sezione B a zero.

Attenzione: il rollback azzera anche i codici cliente. Se li avevi
sistemati a mano, annotali prima.

Dopo un rollback si può ricominciare dal passo 3.

## Cosa è stato provato, e cosa no

Provato su PostgreSQL 16 in locale, ricostruendo lo schema di TOTIME:

- migrazione applicata due volte di fila: idempotente;
- ciclo completo migrazione → backfill → rollback → backfill, con i
  dati originali verificati identici a ogni giro tramite impronte del
  contenuto, non solo conteggi;
- 69 controlli sul modello, compreso l'isolamento fra due utenti, i
  cinque sull'obbligo della WBS — che provano tanto il divieto quanto
  l'eccezione — dieci sulla riscrittura delle policy storiche e
  diciotto sull'inversione, di cui il principale verifica che **ogni
  consuntivo punti allo stesso cliente e progetto di prima**: una
  migrazione che perde l'aggancio dei dati storici non è una
  migrazione;
- venti creazioni di commessa in parallelo: venti codici distinti,
  nessun buco e nessun duplicato;
- `completamento.sql` rilanciato su un database dove il trigger di
  coerenza delle spese era stato tolto: arriva in fondo lo stesso;
- la riscrittura delle policy storiche messa alla prova su policy
  scomode apposta — nome fuori convenzione, condizione più stretta del
  solito, una restrittiva, una già corretta, una che `auth.uid()` non
  lo nomina — verificando non solo che l'advisor si zittisca, ma che
  **chi vede cosa non cambi di una riga**. La verifica non è di
  facciata: rilanciata contro una versione precedente dello script, che
  le policy le normalizzava a modo suo, va in rosso perché quella
  versione rendeva visibile una riga che prima era nascosta.

Lato applicazione, 283 controlli di interfaccia su Chromium: griglia,
grafico, assenze, funzionamento offline, regressione, WBS,
fatturazione per commessa e la cascata delle anagrafiche — compreso il
caso in cui l'app venga aperta su un database non ancora invertito.

**Non provato**, perché non ho accesso al progetto Supabase:

- il comportamento sui dati veri;
- i tempi di esecuzione sul volume reale.

Gli advisor `database` e `security` li hai lanciati tu: le correzioni
di questo pacchetto nascono da quei risultati, non da una mia ipotesi.
