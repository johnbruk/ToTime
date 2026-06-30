# TOTIME — Import CSV

Guida al formato CSV per importare consuntivi storici in TOTIME.

## Quando usare l’import

L’import CSV serve per caricare righe timesheet a ore già consuntivate in Excel.

Per evitare duplicati:

- importare ogni file una sola volta;
- non rilanciare lo stesso CSV se l’import è già riuscito;
- prima di reimportare dati test, pulire le righe dal database o usare un ambiente test.

## Formato consigliato

Colonne consigliate:

```text
Data
Cliente
Cliente/Progetto
Attività
Descrizione
Ore
Sede
Luogo/Città
Note
```

## Significato colonne

### Data

Data del consuntivo.

Formati accettati consigliati:

```text
26/02/2026
2026-02-26
```

### Cliente

Cliente principale, cioè il soggetto a cui verrà emessa fattura.

Esempio:

```text
Solution
```

Se il cliente non esiste, TOTIME può crearlo automaticamente.

### Cliente/Progetto

Progetto o cliente finale collegato al cliente principale.

Esempio:

```text
Equans
Bouygues
```

Se il progetto non esiste per quel cliente, TOTIME può crearlo automaticamente.

### Attività

Attività svolta.

Esempi:

```text
PM
AMS
Mapping Processi
Dama Integration
```

Se l’attività non esiste, TOTIME può crearla automaticamente.

### Descrizione

Descrizione libera dell’attività svolta.

### Ore

Solo ore lavorate.

Esempi validi:

```text
2
4
8
9,5
```

Non inserire chilometri o spese in questa colonna.

### Sede

Tipo/modalità sede.

Esempi:

```text
Cliente
Ufficio
Remoto
Casa
Onsite cliente
```

### Luogo/Città

Città o luogo fisico.

Esempi:

```text
Milano
Verona
Canicattì
Palermo
Remoto
```

### Note

Campo libero opzionale.

## Cosa non importare come timesheet ore

Non importare come righe timesheet:

- Rimborso KM;
- Pranzo;
- Cena;
- Hotel;
- Autostrada;
- Parcheggio;
- Volo;
- Treno;
- Taxi;
- Carburante.

Queste voci vanno gestite come `Spese di trasferta`, non come ore.

## Esempio CSV

```csv
Data;Cliente;Cliente/Progetto;Attività;Descrizione;Ore;Sede;Luogo/Città;Note
26/02/2026;Solution;Bouygues;Dama Integration;Presentazione Piano;8,00;Cliente;Milano;
09/04/2026;Solution;Equans;Mapping Processi;Meeting;4,00;Cliente;Milano;
23/04/2026;Solution;Equans;AMS;Coordinamento;2,00;Cliente;Verona;
```

## Controlli prima dell’import

- [ ] Non ci sono righe completamente vuote.
- [ ] Non ci sono righe con sola data senza cliente/ore.
- [ ] La colonna Ore contiene solo ore.
- [ ] Non ci sono righe rimborso/spesa.
- [ ] Cliente e Cliente/Progetto sono coerenti.
- [ ] Il CSV è salvato come CSV UTF-8 o comunque leggibile da Excel/browser.

## Controlli dopo l’import

Verificare in Supabase:

- `clients`
- `projects`
- `activities`
- `timesheet_entries`

Verificare in TOTIME:

- Timesheet mese per mese;
- Riepilogo mensile;
- Fatturazione;
- importi calcolati con tariffa giornaliera.

## Problema noto: importi a zero

Se dopo l’import gli importi risultano a zero, controllare che il cliente abbia:

- `compensation_type = daily_rate_8h`
- `daily_rate` valorizzato
- `standard_hours = 8`

Per righe già importate può servire aggiornare gli snapshot tariffari da Supabase.
