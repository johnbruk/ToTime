# TOTIME — Refactoring Phase 2G

## Obiettivo

Preparare lo spostamento progressivo dei salvataggi verso il repository layer.

## Ambito

Dopo il collegamento del caricamento dati, la fase successiva dovrà riguardare insert, update e delete.

## Regole

- Procedere per area funzionale.
- Non modificare tutte le form in una sola PR.
- Non cambiare payload o data model.
- Non cambiare messaggi utente se non necessario.
- Dopo ogni salvataggio continuare a chiamare reload e render come oggi.

## Sequenza consigliata

1. Clienti.
2. Progetti.
3. Attività.
4. Voci spesa.
5. Template fattura.
6. Timesheet giornalieri.
7. Compensi mensili.
8. Consuntivi manuali.
9. Spese trasferta.
10. Fatture e fiscalità.

## Test minimo per ogni area

- creare record;
- modificare record;
- eliminare record quando consentito;
- verificare reload;
- verificare riepilogo se l'area impatta importi.

## Rollback

Ogni area deve stare in una PR separata, così il rollback non impatta le altre funzioni.
