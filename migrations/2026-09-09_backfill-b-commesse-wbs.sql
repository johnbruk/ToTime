-- ============================================================
-- Migrazione TOTIME — 2026-09-09 (backfill, passo B)
-- Crea commesse, progetti e WBS dai dati esistenti e collega le
-- registrazioni.
--
-- Da eseguire DOPO il passo A e DOPO aver rivisto i codici cliente:
-- da qui in poi entrano nei codici di commessa e si bloccano.
--
-- Non cancella e non sovrascrive nulla: riempie solo campi vuoti.
-- Sicura da rilanciare. Non inventa associazioni: le registrazioni
-- che non si possono classificare con certezza restano senza WBS e
-- finiscono nell'elenco finale da correggere a mano.
-- ============================================================

begin;

do $$
begin
  if exists(select 1 from public.clients where code is null) then
    raise exception 'Ci sono clienti senza codice: esegui prima il passo A e rivedi i codici';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Una commessa "storico" per cliente
--    Serve come contenitore dei progetti esistenti, che finora non
--    avevano una commessa. L'anno e' quello della prima
--    registrazione del cliente: non e' un dato inventato, e' quello
--    che risulta dai consuntivi.
-- ------------------------------------------------------------

do $$
declare r record; v_year int; v_id uuid;
begin
  for r in select c.id, c.user_id, c.name from public.clients c
           where exists(select 1 from public.projects p where p.client_id = c.id)
              or exists(select 1 from public.timesheet_entries t where t.client_id = c.id)
  loop
    -- salta se ha gia' una commessa da migrazione
    if exists(select 1 from public.engagements e where e.client_id = r.id and e.notes = 'migrazione-storico') then
      continue;
    end if;
    select min(extract(year from entry_date))::int into v_year
      from public.timesheet_entries where client_id = r.id;
    if v_year is null then
      select min(extract(year from entry_date))::int into v_year
        from public.manual_entries where client_id = r.id;
    end if;
    v_year := coalesce(v_year, extract(year from current_date)::int);
    insert into public.engagements(user_id, client_id, year, name, description, status, notes)
    values (r.user_id, r.id, v_year, 'Storico ' || r.name,
            'Commessa creata dalla migrazione per contenere i progetti gia'' esistenti', 'active',
            'migrazione-storico')
    returning id into v_id;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. I progetti esistenti entrano nella commessa storico
-- ------------------------------------------------------------

do $$
declare r record; base text; cand text; n int; v_eng uuid;
begin
  for r in select p.id, p.user_id, p.client_id, p.name from public.projects p
           where p.engagement_id is null and p.client_id is not null order by p.name loop
    select e.id into v_eng from public.engagements e
      where e.client_id = r.client_id and e.notes = 'migrazione-storico' limit 1;
    continue when v_eng is null;
    base := left(public.totime_norm_code(r.name), 3);
    if base is null or length(base) < 1 then base := 'PRJ'; end if;
    cand := base; n := 1;
    while exists(select 1 from public.projects where engagement_id = v_eng and short_code = cand) loop
      n := n + 1; cand := left(base, 4) || n::text;
      exit when n > 99;
    end loop;
    update public.projects set engagement_id = v_eng, short_code = cand where id = r.id;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. Una WBS per ogni coppia progetto/attivita' realmente usata
--    Il codice segue la convenzione a decine: 10, 20, 30...
--    Le attivita' provengono dal catalogo gia' esistente, non si
--    duplica quell'anagrafica.
-- ------------------------------------------------------------

do $$
declare r record; v_code text; v_n int;
begin
  for r in
    select distinct p.id as project_id, p.user_id, t.activity_id,
           coalesce(a.name, 'Attivita'' non specificata') as act_name
    from public.timesheet_entries t
    join public.projects p on p.id = t.project_id
    left join public.activities a on a.id = t.activity_id
    where p.engagement_id is not null
    order by p.id, act_name
  loop
    if exists(select 1 from public.wbs_items w where w.project_id = r.project_id
              and w.activity_id is not distinct from r.activity_id) then
      continue;
    end if;
    select coalesce(max(activity_code::int), 0) + 10 into v_n
      from public.wbs_items where project_id = r.project_id and activity_code ~ '^[0-9]+$';
    v_code := lpad(v_n::text, 2, '0');
    insert into public.wbs_items(user_id, project_id, activity_code, name, activity_id, status, sort_order, notes)
    values (r.user_id, r.project_id, v_code, r.act_name, r.activity_id, 'active', v_n, 'migrazione-storico');
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. Collega le registrazioni alla loro WBS
--    Solo dove la corrispondenza e' certa: stesso progetto e stessa
--    attivita'. Tutto il resto resta senza WBS.
--    Il trigger di allineamento e' disattivato qui perche'
--    riscriverebbe client_id/project_id che sono gia' corretti.
-- ------------------------------------------------------------

alter table public.timesheet_entries disable trigger timesheet_entries_wbs_trg;
alter table public.manual_entries    disable trigger manual_entries_wbs_trg;
alter table public.travel_expenses   disable trigger travel_expenses_wbs_trg;

update public.timesheet_entries t
set wbs_id = w.id
from public.wbs_items w
where t.wbs_id is null and w.project_id = t.project_id
  and w.activity_id is not distinct from t.activity_id;

update public.manual_entries m
set wbs_id = w.id
from public.wbs_items w
where m.wbs_id is null and w.project_id = m.project_id
  and w.activity_id is not distinct from m.activity_id;

-- Le spese vanno sulla WBS del progetto se ce n'e' una sola: con
-- piu' WBS la scelta sarebbe arbitraria e si lascia vuota.
update public.travel_expenses x
set wbs_id = w.id
from public.wbs_items w
where x.wbs_id is null and w.project_id = x.project_id
  and (select count(*) from public.wbs_items w2 where w2.project_id = x.project_id) = 1;

alter table public.timesheet_entries enable trigger timesheet_entries_wbs_trg;
alter table public.manual_entries    enable trigger manual_entries_wbs_trg;
alter table public.travel_expenses   enable trigger travel_expenses_wbs_trg;

commit;

-- ------------------------------------------------------------
-- 6. Rapporto: cosa resta da sistemare a mano
--    Da leggere PRIMA di considerare conclusa la migrazione.
-- ------------------------------------------------------------

select 'clienti senza codice'      as voce, count(*) from public.clients where code is null
union all select 'progetti senza commessa',    count(*) from public.projects where engagement_id is null
union all select 'consuntivi senza WBS',       count(*) from public.timesheet_entries where wbs_id is null
union all select 'consuntivi senza progetto',  count(*) from public.timesheet_entries where project_id is null
union all select 'compensi manuali senza WBS', count(*) from public.manual_entries where wbs_id is null
union all select 'spese senza WBS',            count(*) from public.travel_expenses where wbs_id is null
order by 1;
