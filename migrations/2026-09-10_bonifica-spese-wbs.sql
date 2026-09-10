-- ============================================================
-- Bonifica TOTIME — 2026-09-10
-- Collega le spese a una WBS dedicata "Trasferte e spese"
--
-- Perche' serve: il backfill aggancia una spesa alla WBS solo quando
-- il progetto ne ha una sola, altrimenti sceglierebbe a caso. Con piu'
-- WBS per progetto le spese restano quindi scollegate.
--
-- Cosa fa: crea per ogni progetto interessato una WBS di codice 90
-- "Trasferte e spese", non fatturabile, e ci collega le spese di quel
-- progetto. Le spese NON vengono modificate in nessun altro campo:
-- importo, data, categoria e tipo di rimborso restano identici.
--
-- La fatturazione non cambia: le spese confluiscono in fattura
-- secondo le regole di sempre, a livello di progetto. La WBS serve
-- solo per l'analisi.
--
-- NON MODIFICA le spese gia' collegate a una WBS.
-- Sicura da rilanciare.
-- ============================================================

begin;

-- 1) Una WBS "Trasferte e spese" per ogni progetto che ha spese
--    scollegate. Codice 90, come da convenzione a decine.
do $$
declare r record; v_code text;
begin
  for r in
    select distinct p.id as project_id, p.user_id
    from public.travel_expenses x
    join public.projects p on p.id = x.project_id
    where x.wbs_id is null and p.engagement_id is not null
  loop
    -- se esiste gia' una WBS di tipo trasferta, si usa quella
    if exists(select 1 from public.wbs_items w
              where w.project_id = r.project_id and w.kind = 'travel') then
      continue;
    end if;
    -- codice 90 se libero, altrimenti il primo multiplo di 10 libero
    v_code := '90';
    while exists(select 1 from public.wbs_items where project_id = r.project_id and activity_code = v_code) loop
      v_code := (v_code::int + 10)::text;
    end loop;
    insert into public.wbs_items(user_id, project_id, activity_code, name, kind, billable, status, sort_order, notes)
    values (r.user_id, r.project_id, v_code, 'Trasferte e spese', 'travel', false, 'active', v_code::int, 'bonifica-spese');
  end loop;
end $$;

-- 2) Collega le spese scollegate alla WBS trasferte del loro progetto.
--    Il trigger di allineamento e' spento perche' client_id e
--    project_id sulle spese sono gia' quelli giusti.
alter table public.travel_expenses disable trigger travel_expenses_wbs_trg;

update public.travel_expenses x
set wbs_id = w.id
from public.wbs_items w
where x.wbs_id is null
  and w.project_id = x.project_id
  and w.kind = 'travel';

alter table public.travel_expenses enable trigger travel_expenses_wbs_trg;

commit;

-- 3) Esito
select 'spese collegate a una WBS' as misura, count(*)::text as valore from public.travel_expenses where wbs_id is not null
union all
select 'spese ancora scollegate', count(*)::text from public.travel_expenses where wbs_id is null
union all
select 'di cui senza progetto (non collegabili)', count(*)::text from public.travel_expenses where wbs_id is null and project_id is null
union all
select 'importo totale spese (deve restare invariato)', coalesce(sum(amount),0)::text from public.travel_expenses;
