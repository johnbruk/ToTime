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
- 34 controlli sul modello, compreso l'isolamento fra due utenti;
- venti creazioni di commessa in parallelo: venti codici distinti,
  nessun buco e nessun duplicato.

**Non provato**, perché non ho accesso al progetto Supabase:

- gli advisor `database` e `security` di Supabase;
- il comportamento sui dati veri;
- i tempi di esecuzione sul volume reale.
