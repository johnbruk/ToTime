-- L'attivita' e' facoltativa, e il database deve saperlo.
--
-- In tutta l'app l'attivita' e' un di piu': serve ai report e ai colori,
-- e dove manca si legge «Senza attivita'». Ma nel database la colonna
-- activity_id puo' essere ancora NOT NULL, da prima che la gerarchia
-- progetto / commessa / WBS prendesse il suo posto.
--
-- Il risultato, per chi registra le ore su una commessa che non porta
-- con se' un'attivita': l'inserimento viene rifiutato, e il messaggio
-- nomina un campo che nel modulo non c'era nemmeno. Il lavoro non si
-- riesce piu' a registrare.
--
-- Questa migrazione toglie il vincolo dove c'e'. Se non c'e', non fa
-- niente: «drop not null» su una colonna gia' facoltativa va a buon
-- fine senza effetti.

alter table public.timesheet_entries alter column activity_id drop not null;
alter table public.manual_entries    alter column activity_id drop not null;

-- Verifica: devono risultare tutte e due 'YES'.
select table_name, column_name, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('timesheet_entries','manual_entries')
   and column_name = 'activity_id'
 order by table_name;
