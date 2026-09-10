-- Controllo dopo la migrazione — NON MODIFICA NIENTE.
-- Mostra la gerarchia che e' venuta fuori, per vedere se rispecchia
-- la realta' o se qualcosa va risistemato a mano.

-- 1) La gerarchia completa, con quanto lavoro c'e' sotto ogni WBS
select
  c.code   as cliente,
  e.code   as commessa,
  e.name   as nome_commessa,
  p.code   as progetto,
  p.name   as nome_progetto,
  w.code   as wbs,
  w.name   as descrizione_wbs,
  (select count(*) from public.timesheet_entries t where t.wbs_id = w.id) as consuntivi,
  (select coalesce(sum(t.hours),0) from public.timesheet_entries t where t.wbs_id = w.id) as ore,
  (select count(*) from public.travel_expenses x where x.wbs_id = w.id) as spese
from public.wbs_items w
join public.projects p    on p.id = w.project_id
join public.engagements e on e.id = p.engagement_id
join public.clients c     on c.id = e.client_id
order by c.code, e.code, p.code, w.activity_code;

-- 2) Le WBS senza nessuna registrazione: create dal backfill ma mai
--    usate. Si possono chiudere o eliminare senza perdere niente.
select w.code as wbs_mai_usata, w.name
from public.wbs_items w
where not exists(select 1 from public.timesheet_entries t where t.wbs_id = w.id)
  and not exists(select 1 from public.travel_expenses x where x.wbs_id = w.id)
  and not exists(select 1 from public.manual_entries m where m.wbs_id = w.id)
order by w.code;

-- 3) Riepilogo per progetto: e' il livello a cui si fattura
select p.code as progetto, p.name,
       count(distinct w.id) as wbs,
       coalesce(sum((select sum(t.hours) from public.timesheet_entries t where t.wbs_id = w.id)),0) as ore_totali
from public.projects p
left join public.wbs_items w on w.project_id = p.id
where p.engagement_id is not null
group by p.code, p.name order by p.code;
