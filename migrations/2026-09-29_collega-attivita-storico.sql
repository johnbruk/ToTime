-- ============================================================
-- Migrazione TOTIME — 2026-09-29
--
-- I consuntivi gia' registrati non prendono il collegamento
-- all'anagrafica attivita' che aggiungi oggi alle voci di commessa.
--
-- Il motivo: il collegamento viene copiato DENTRO la riga del
-- consuntivo quando la salvi (trigger totime_sync_wbs_lineage, che fa
-- «activity_id := coalesce(activity_id, quello della voce)»). Chi era
-- gia' scritto con activity_id NULL resta NULL, perche' nessuno lo
-- tocca piu'. A schermo si vede cosi': la riga non ha il tag colorato
-- dell'attivita', mentre le righe registrate dopo ce l'hanno.
--
-- Questo script ricopia il collegamento sulle righe gia' scritte,
-- prendendolo dalla voce di commessa su cui sono registrate.
--
-- DA LANCIARE DOPO aver collegato le voci all'anagrafica, non prima:
-- legge il collegamento che c'e' in quel momento.
--
-- Non cambia ne' ore, ne' importi, ne' date, ne' su quale voce di
-- commessa sta una riga: tocca solo activity_id, e solo dove e' vuoto.
-- Non sovrascrive mai un collegamento gia' presente.
-- Sicura da rilanciare: la seconda volta non trova piu' niente da fare.
--
-- Nota: non fa scattare il controllo sullo stato della voce. Quel
-- controllo scatta solo quando una riga cambia voce di commessa, e qui
-- la voce non si tocca: quindi passano anche le righe che stanno su
-- voci chiuse o sospese.
-- ============================================================

do $$
declare n_ts integer; n_man integer;
begin

  update public.timesheet_entries e
     set activity_id = w.activity_id
    from public.wbs_items w
   where e.wbs_id = w.id
     and e.activity_id is null
     and w.activity_id is not null;
  get diagnostics n_ts = row_count;

  if to_regclass('public.manual_entries') is not null then
    update public.manual_entries m
       set activity_id = w.activity_id
      from public.wbs_items w
     where m.wbs_id = w.id
       and m.activity_id is null
       and w.activity_id is not null;
    get diagnostics n_man = row_count;
  else
    n_man := 0;
  end if;

  raise notice 'Consuntivi collegati: %', n_ts;
  raise notice 'Compensi forfettari collegati: %', n_man;

end $$;

-- Cosa e' rimasto scollegato, e perche'. Se qui esce qualcosa, quelle
-- voci di commessa non hanno ancora il collegamento all'anagrafica:
-- mettilo e rilancia lo script.
select e2.commessa, e2.voce, count(*) as righe_senza_attivita
from (
  select en.code as commessa, w.name as voce
    from public.timesheet_entries t
    join public.wbs_items w on w.id = t.wbs_id
    join public.engagements en on en.id = w.engagement_id
   where t.activity_id is null
) e2
group by e2.commessa, e2.voce
order by righe_senza_attivita desc;
