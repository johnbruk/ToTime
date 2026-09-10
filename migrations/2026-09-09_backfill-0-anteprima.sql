-- ============================================================
-- Migrazione TOTIME — 2026-09-09 (backfill, anteprima)
--
-- NON MODIFICA NIENTE. Si esegue prima del passo A per vedere cosa
-- farebbero i passi successivi sui dati veri.
--
-- Da lanciare dopo 2026-09-09_commesse-progetti-wbs.sql.
-- ============================================================

-- 1) Che codice verrebbe proposto a ogni cliente
with proposti as (
  select c.id, c.name, c.code as codice_attuale,
         coalesce(c.code, left(public.totime_norm_code(c.name),3)) as codice_proposto,
         row_number() over (partition by coalesce(c.code, left(public.totime_norm_code(c.name),3)) order by c.name) as collisione
  from public.clients c
)
select '1. CODICI CLIENTE' as sezione, name as cliente, codice_attuale, codice_proposto,
       case when collisione > 1 then 'ATTENZIONE: collide con un altro cliente, verra'' aggiunta una cifra' else '' end as nota
from proposti order by codice_proposto, cliente;

-- 2) Quante commesse "storico" verrebbero create, e di che anno
select '2. COMMESSE CHE VERREBBERO CREATE' as sezione,
       c.name as cliente,
       coalesce(
         (select min(extract(year from t.entry_date))::int from public.timesheet_entries t where t.client_id = c.id),
         (select min(extract(year from m.entry_date))::int from public.manual_entries m where m.client_id = c.id),
         extract(year from current_date)::int) as anno,
       (select count(*) from public.projects p where p.client_id = c.id) as progetti_da_agganciare
from public.clients c
where exists(select 1 from public.projects p where p.client_id = c.id)
   or exists(select 1 from public.timesheet_entries t where t.client_id = c.id)
order by c.name;

-- 3) Quante WBS verrebbero create, per progetto
select '3. WBS CHE VERREBBERO CREATE' as sezione,
       c.name as cliente, p.name as progetto,
       count(distinct t.activity_id) filter (where t.activity_id is not null)
         + (case when exists(select 1 from public.timesheet_entries t2 where t2.project_id = p.id and t2.activity_id is null) then 1 else 0 end) as wbs_previste,
       count(*) as consuntivi_coinvolti
from public.projects p
join public.clients c on c.id = p.client_id
left join public.timesheet_entries t on t.project_id = p.id
group by c.name, p.name, p.id order by c.name, p.name;

-- 4) Quello che NON si riuscira' a classificare: da sistemare a mano
select '4. DA SISTEMARE A MANO' as sezione, 'consuntivi senza progetto' as tipo, count(*) as quanti
from public.timesheet_entries where project_id is null
union all
select '4. DA SISTEMARE A MANO', 'compensi manuali senza progetto', count(*)
from public.manual_entries where project_id is null
union all
select '4. DA SISTEMARE A MANO', 'spese senza progetto', count(*)
from public.travel_expenses where project_id is null
union all
select '4. DA SISTEMARE A MANO', 'spese su progetti con piu'' WBS (scelta ambigua)', count(*)
from public.travel_expenses x where x.project_id is not null
  and (select count(distinct t.activity_id) from public.timesheet_entries t where t.project_id = x.project_id) > 1;

-- 5) Il dettaglio dei consuntivi che resteranno senza WBS
select '5. DETTAGLIO CONSUNTIVI SENZA PROGETTO' as sezione,
       t.entry_date, c.name as cliente, t.hours, t.description
from public.timesheet_entries t left join public.clients c on c.id = t.client_id
where t.project_id is null order by t.entry_date desc limit 100;
