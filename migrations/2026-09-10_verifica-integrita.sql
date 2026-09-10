-- ============================================================
-- Verifica di integrita' — 2026-09-10
-- NON MODIFICA NIENTE.
--
-- Serve quando manca la fotografia di partenza: non puo' dimostrare
-- che i dati non siano cambiati, ma puo' dimostrare che oggi sono
-- COERENTI. Se il backfill avesse collegato male qualcosa, o avesse
-- toccato quello che non doveva, qui verrebbe fuori.
--
-- Ogni riga che riporta un numero diverso da zero e' un problema,
-- tranne dove indicato.
-- ============================================================

-- A) I collegamenti sono giusti?
--    Durante il backfill il trigger che riallinea cliente e progetto
--    era spento, di proposito. Quindi se una registrazione fosse
--    finita sulla WBS sbagliata, adesso il suo progetto non
--    corrisponderebbe a quello della WBS. Questo controllo o passa o
--    no: non ci sono vie di mezzo.
select 'A. COLLEGAMENTI' as sezione,
  'consuntivi la cui WBS appartiene a un ALTRO progetto' as controllo,
  count(*)::text as quanti, 'deve essere 0' as atteso
from public.timesheet_entries t join public.wbs_items w on w.id = t.wbs_id
where t.project_id is distinct from w.project_id
union all
select 'A. COLLEGAMENTI','consuntivi la cui WBS appartiene a un ALTRO cliente', count(*)::text,'deve essere 0'
from public.timesheet_entries t
  join public.wbs_items w on w.id = t.wbs_id
  join public.projects p on p.id = w.project_id
where t.client_id is distinct from p.client_id
union all
select 'A. COLLEGAMENTI','spese collegate a una WBS di un altro progetto', count(*)::text,'deve essere 0'
from public.travel_expenses x join public.wbs_items w on w.id = x.wbs_id
where x.project_id is distinct from w.project_id
union all
select 'A. COLLEGAMENTI','WBS orfane (senza progetto valido)', count(*)::text,'deve essere 0'
from public.wbs_items w where not exists(select 1 from public.projects p where p.id = w.project_id)
union all
select 'A. COLLEGAMENTI','progetti agganciati alla commessa di un altro cliente', count(*)::text,'deve essere 0'
from public.projects p join public.engagements e on e.id = p.engagement_id
where p.client_id is distinct from e.client_id

-- B) Quello che il backfill NON doveva toccare e' ancora li'?
--    Non posso confrontarlo con prima, ma posso verificare che non
--    ci siano valori persi o azzerati, che e' il danno tipico.
union all
select 'B. NIENTE PERSO','consuntivi senza data', count(*)::text,'deve essere 0' from public.timesheet_entries where entry_date is null
union all
select 'B. NIENTE PERSO','consuntivi senza ore', count(*)::text,'deve essere 0' from public.timesheet_entries where hours is null
union all
select 'B. NIENTE PERSO','consuntivi con ore a zero', count(*)::text,'sospetto se molti' from public.timesheet_entries where hours = 0
union all
select 'B. NIENTE PERSO','consuntivi senza cliente', count(*)::text,'deve essere 0' from public.timesheet_entries where client_id is null
union all
select 'B. NIENTE PERSO','spese senza importo', count(*)::text,'deve essere 0' from public.travel_expenses where amount is null
union all
select 'B. NIENTE PERSO','spese con importo a zero', count(*)::text,'sospetto se molti' from public.travel_expenses where amount = 0
union all
select 'B. NIENTE PERSO','clienti senza nome', count(*)::text,'deve essere 0' from public.clients where name is null or name = ''
union all
select 'B. NIENTE PERSO','progetti senza nome', count(*)::text,'deve essere 0' from public.projects where name is null or name = ''
union all
select 'B. NIENTE PERSO','fatture senza cliente', count(*)::text,'deve essere 0' from public.billing_headers where client_id is null;

-- C) I numeri da confrontare a occhio con quello che vedi nell'app.
--    Questi li conosci: se le ore di un mese non tornano con quello
--    che ricordi o con quello che hai fatturato, si vede subito.
select 'C. DA GUARDARE' as sezione,
       to_char(t.entry_date,'YYYY-MM') as mese,
       c.name as cliente,
       p.name as progetto,
       count(*) as consuntivi,
       sum(t.hours) as ore
from public.timesheet_entries t
left join public.clients c on c.id = t.client_id
left join public.projects p on p.id = t.project_id
group by 2,3,4 order by 2 desc, 3, 4;

-- D) Le fatture gia' emesse: gli importi devono essere quelli che hai
--    davvero fatturato. Questo lo puoi confrontare con Fiscozen.
select 'D. FATTURE' as sezione, b.year, b.month, c.name as cliente, b.status
from public.billing_headers b left join public.clients c on c.id = b.client_id
order by b.year desc, b.month desc;
