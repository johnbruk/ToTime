-- ============================================================
-- Migrazione TOTIME — 2026-09-10 (inversione progetto/commessa)
--
-- Gira il verso della gerarchia.
--
--   prima   Cliente > Commessa > Progetto > WBS
--           SO-2026-001 > SO-2026-001-EQU > SO-2026-001-EQU-10
--
--   dopo    Cliente > Progetto > Commessa > Attivita'
--           SO-EQU > SO-EQU-2026-001 > SO-EQU-2026-001-10
--
-- Il progetto (o cliente finale) diventa l'entita' durevole sotto il
-- cliente, e le commesse le si appendono sotto man mano: contratto
-- 2026, contratto 2027, ordini distinti. Prima era il contrario, e un
-- cliente finale non poteva avere piu' di una commessa senza essere
-- duplicato.
--
-- COSA SUCCEDE AI DATI
--   * i progetti restano quelli che sono e passano sotto il cliente;
--   * una commessa che copriva PIU' progetti viene sdoppiata, una per
--     progetto, perche' nel verso nuovo non puo' stare sotto due;
--   * una commessa senza progetti riceve un progetto omonimo, perche'
--     nel verso nuovo deve stare sotto uno;
--   * le WBS passano dal progetto alla commessa, conservando codice
--     attivita', nome, stato e budget;
--   * consuntivi, spese e fatture NON vengono toccati nei dati: si
--     aggiornano solo i collegamenti derivati.
--
-- I CODICI VENGONO RICALCOLATI TUTTI. Da lanciare solo se i codici
-- attuali non sono ancora usciti dall'app (fatture, contratti,
-- comunicazioni). In caso contrario fermarsi e conservarli prima.
--
-- Non idempotente per costruzione: la seconda esecuzione si accorge
-- che l'inversione c'e' gia' e non fa niente.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Si puo' partire?
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.engagements') is null or to_regclass('public.wbs_items') is null then
    raise exception 'Manca la migrazione principale: lancia prima 2026-09-09_commesse-progetti-wbs.sql';
  end if;
end $$;

alter table public.engagements add column if not exists project_id uuid references public.projects(id) on delete restrict;
alter table public.wbs_items   add column if not exists engagement_id uuid references public.engagements(id) on delete restrict;

-- Gli indici del verso vecchio vanno tolti PRIMA di spostare i dati,
-- non dopo. Sdoppiare una commessa significa scrivere due righe con
-- lo stesso (cliente, anno, progressivo), e finche' quell'indice
-- unico esiste la seconda viene rifiutata: lo spostamento si ferma a
-- meta' e non parte niente. Stessa cosa per i codici brevi di
-- progetto, che qui vengono deduplicati.
drop index if exists public.projects_engagement_short_code_key;
drop index if exists public.projects_engagement_idx;
drop index if exists public.engagements_client_year_seq_key;
drop index if exists public.wbs_items_project_activity_code_key;
drop index if exists public.wbs_items_project_idx;

-- ------------------------------------------------------------
-- 1. Lo spostamento dei dati
--    Tutto dentro un blocco solo: o riesce, o non e' successo niente.
-- ------------------------------------------------------------
do $$
declare
  r record;
  v_new uuid;
  v_code text;
  v_n int;
begin
  -- gia' invertito? allora non c'e' niente da fare
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='projects' and column_name='engagement_id') then
    raise notice 'inversione gia'' applicata: nessuna modifica';
    return;
  end if;

  -- i trigger di codice e di immutabilita' vanno tolti di mezzo:
  -- durante lo spostamento i codici sono per forza incoerenti
  alter table public.engagements disable trigger user;
  alter table public.projects    disable trigger user;
  alter table public.wbs_items   disable trigger user;

  -- 1a. ogni progetto prende il cliente dalla sua commessa
  update public.projects p
     set client_id = e.client_id
    from public.engagements e
   where p.engagement_id = e.id and p.client_id is distinct from e.client_id;

  -- 1b. una commessa senza progetti ne riceve uno omonimo: nel verso
  --     nuovo una commessa deve stare sotto un progetto
  for r in select e.* from public.engagements e
           where not exists (select 1 from public.projects p where p.engagement_id = e.id)
  loop
    insert into public.projects(user_id, client_id, engagement_id, name, short_code, active, status)
    values (r.user_id, r.client_id, r.id, coalesce(r.name,'Progetto'), 'GEN', true, 'active');
  end loop;

  -- 1c. una commessa che copriva piu' progetti viene sdoppiata:
  --     il primo progetto tiene la commessa originale, gli altri ne
  --     ricevono una copia con gli stessi dati contrattuali
  for r in
    -- Chi si tiene la commessa originale non puo' dipendere dal caso:
    -- created_at e' identico (stessa transazione) e l'id e' un uuid
    -- casuale. Tiene l'originale il progetto su cui c'e' gia' del
    -- lavoro registrato, perche' e' quello il cui codice puo' essere
    -- gia' uscito; a parita', l'ordine alfabetico del nome.
    select p.id as project_id, p.engagement_id, p.user_id,
           row_number() over (partition by p.engagement_id
                              order by public.totime_project_in_use(p.id) desc,
                                       p.name, p.short_code, p.id) as rn
    from public.projects p where p.engagement_id is not null
  loop
    if r.rn = 1 then
      update public.engagements set project_id = r.project_id where id = r.engagement_id;
    else
      insert into public.engagements(user_id, client_id, project_id, year, seq, name, status,
                                     engagement_letter, purchase_order, invoice_reference,
                                     start_date, end_date, notes, code)
      select user_id, client_id, r.project_id, year, seq, name, status,
             engagement_letter, purchase_order, invoice_reference,
             start_date, end_date, notes, code || '-' || r.rn
      from public.engagements where id = r.engagement_id
      returning id into v_new;
      -- i riferimenti contrattuali valgono anche per la copia
      insert into public.engagement_references(user_id, engagement_id, reference_type, engagement_letter,
                                               purchase_order, invoice_reference, valid_from, valid_to, status, notes)
      select user_id, v_new, reference_type, engagement_letter, purchase_order,
             invoice_reference, valid_from, valid_to, status, notes
      from public.engagement_references where engagement_id = r.engagement_id;
      -- le WBS di quel progetto seguiranno la copia
      update public.wbs_items set engagement_id = v_new where project_id = r.project_id;
    end if;
  end loop;

  -- 1d. le WBS rimaste passano alla commessa del loro progetto
  update public.wbs_items w
     set engagement_id = e.id
    from public.engagements e
   where w.engagement_id is null and e.project_id = w.project_id;

  -- 1e. le righe di fattura seguono la commessa del loro progetto
  update public.billing_lines b
     set engagement_id = e.id
    from public.engagements e
   where b.project_id is not null and e.project_id = b.project_id
     and b.engagement_id is distinct from e.id;

  select count(*) into v_n from public.wbs_items where engagement_id is null;
  if v_n > 0 then
    raise exception 'Ci sono % WBS che non hanno trovato una commessa: mi fermo senza cambiare niente', v_n;
  end if;
  select count(*) into v_n from public.engagements where project_id is null;
  if v_n > 0 then
    raise exception 'Ci sono % commesse che non hanno trovato un progetto: mi fermo senza cambiare niente', v_n;
  end if;

  -- 1f. i codici brevi di progetto diventano unici per CLIENTE, non
  --     piu' per commessa: due progetti di commesse diverse dello
  --     stesso cliente potevano chiamarsi uguale
  for r in
    -- Stessa regola: fra due progetti che si chiamavano uguale sotto
    -- commesse diverse, tiene il codice quello gia' usato nei
    -- consuntivi. Ordinare per created_at non basta: nella stessa
    -- transazione e' identico, e si finirebbe a decidere per uuid.
    select p.id, p.short_code,
           row_number() over (partition by p.user_id, p.client_id, p.short_code
                              order by public.totime_project_in_use(p.id) desc,
                                       p.name, p.id) as rn
    from public.projects p where p.short_code is not null
  loop
    if r.rn > 1 then
      v_code := left(r.short_code, 4) || r.rn::text;
      update public.projects set short_code = v_code where id = r.id;
    end if;
  end loop;
  update public.projects set short_code = 'GEN'
   where short_code is null and client_id is not null;

  -- 1g. il progressivo riparte da 1 per ogni progetto e anno
  with ord as (
    select e.id, row_number() over (partition by e.user_id, e.project_id, e.year
                                    order by e.year, e.seq, e.created_at, e.id) as rn
    from public.engagements e)
  update public.engagements e set seq = ord.rn from ord where ord.id = e.id;

  -- 1h. i codici, dall'alto verso il basso
  update public.projects p set code = c.code || '-' || p.short_code
    from public.clients c where c.id = p.client_id and c.code is not null and p.short_code is not null;
  update public.engagements e set code = p.code || '-' || e.year::text || '-' || lpad(e.seq::text,3,'0')
    from public.projects p where p.id = e.project_id and p.code is not null;
  update public.wbs_items w set code = e.code || '-' || w.activity_code
    from public.engagements e where e.id = w.engagement_id and e.code is not null;

  alter table public.engagements enable trigger user;
  alter table public.projects    enable trigger user;
  alter table public.wbs_items   enable trigger user;
end $$;

-- ------------------------------------------------------------
-- 2. Vincoli e indici nel verso nuovo
-- ------------------------------------------------------------

alter table public.projects    drop column if exists engagement_id;
alter table public.wbs_items   drop column if exists project_id;

alter table public.engagements alter column project_id set not null;
alter table public.wbs_items   alter column engagement_id set not null;

create unique index if not exists projects_client_short_code_key
  on public.projects(user_id, client_id, short_code) where short_code is not null;
create index if not exists projects_client_idx on public.projects(client_id);
create unique index if not exists engagements_project_year_seq_key
  on public.engagements(user_id, project_id, year, seq);
create index if not exists engagements_project_idx on public.engagements(project_id);
create unique index if not exists wbs_items_engagement_activity_code_key
  on public.wbs_items(engagement_id, activity_code);
create index if not exists wbs_items_engagement_idx on public.wbs_items(engagement_id);

-- proprietario coerente anche nel verso nuovo
do $$ begin
  alter table public.engagements add constraint engagements_project_same_owner
    foreign key (project_id, user_id) references public.projects(id, user_id) on delete restrict;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wbs_items add constraint wbs_items_engagement_same_owner
    foreign key (engagement_id, user_id) references public.engagements(id, user_id) on delete restrict;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 3. Il contatore del progressivo passa al progetto
-- ------------------------------------------------------------
drop table if exists public.engagement_counters;
create table public.engagement_counters (
  user_id    uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  year       integer not null check (year between 2000 and 2999),
  next_seq   integer not null default 0 check (next_seq >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id, year)
);
alter table public.engagement_counters enable row level security;
create policy engagement_counters_select_own on public.engagement_counters for select to authenticated using ((select auth.uid()) = user_id);
create policy engagement_counters_insert_own on public.engagement_counters for insert to authenticated with check ((select auth.uid()) = user_id);
create policy engagement_counters_update_own on public.engagement_counters for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy engagement_counters_delete_own on public.engagement_counters for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.engagement_counters to authenticated;

insert into public.engagement_counters(user_id, project_id, year, next_seq)
select user_id, project_id, year, max(seq) from public.engagements group by 1,2,3;

drop function if exists public.totime_next_engagement_seq(uuid, uuid, integer);
create or replace function public.totime_next_engagement_seq(p_user_id uuid, p_project_id uuid, p_year integer)
returns integer language plpgsql set search_path = public, pg_temp as $$
declare v_seq integer;
begin
  insert into public.engagement_counters as c (user_id, project_id, year, next_seq, updated_at)
  values (p_user_id, p_project_id, p_year, 1, now())
  on conflict (user_id, project_id, year)
  do update set next_seq = c.next_seq + 1, updated_at = now()
  returning c.next_seq into v_seq;
  return v_seq;
end $$;

-- ------------------------------------------------------------
-- 4. I codici si compongono nel verso nuovo
-- ------------------------------------------------------------
create or replace function public.totime_project_code()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_client_code text;
begin
  new.short_code := public.totime_norm_code(new.short_code);
  if new.client_id is not null then
    select code into v_client_code from public.clients where id = new.client_id;
    if v_client_code is not null then
      if new.short_code is null then
        raise exception 'Il progetto richiede un codice breve';
      end if;
      new.code := v_client_code || '-' || new.short_code;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.totime_engagement_code()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_prj_code text; v_client uuid;
begin
  if tg_op = 'INSERT' then
    select code, client_id into v_prj_code, v_client from public.projects where id = new.project_id;
    if v_prj_code is null then
      raise exception 'Il progetto non ha un codice: dagli un codice breve, e al cliente il suo, prima di aprire la commessa';
    end if;
    new.client_id := coalesce(new.client_id, v_client);
    if new.year is null then new.year := extract(year from coalesce(new.start_date, current_date))::int; end if;
    if new.seq is null then new.seq := public.totime_next_engagement_seq(new.user_id, new.project_id, new.year); end if;
    new.code := v_prj_code || '-' || new.year::text || '-' || lpad(new.seq::text, 3, '0');
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.totime_wbs_code()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_eng_code text;
begin
  new.activity_code := public.totime_norm_code(new.activity_code);
  select code into v_eng_code from public.engagements where id = new.engagement_id;
  if v_eng_code is null then
    raise exception 'La commessa non ha un codice completo';
  end if;
  new.code := v_eng_code || '-' || new.activity_code;
  new.updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------------
-- 5. Le registrazioni risalgono la catena nel verso nuovo
-- ------------------------------------------------------------
create or replace function public.totime_sync_wbs_lineage()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_project uuid; v_client uuid; v_status text; v_activity uuid;
begin
  if new.wbs_id is null then return new; end if;
  select e.project_id, w.status, w.activity_id, p.client_id
    into v_project, v_status, v_activity, v_client
  from public.wbs_items w
  join public.engagements e on e.id = w.engagement_id
  join public.projects p on p.id = e.project_id
  where w.id = new.wbs_id;
  if v_project is null then
    raise exception 'WBS inesistente';
  end if;
  if (tg_op = 'INSERT' or new.wbs_id is distinct from old.wbs_id)
     and v_status not in ('draft','active') then
    raise exception 'La WBS non e'' attiva (stato %): non accetta nuove registrazioni', v_status;
  end if;
  new.project_id := v_project;
  new.client_id  := v_client;
  if to_jsonb(new) ? 'activity_id' and v_activity is not null then
    new.activity_id := coalesce(new.activity_id, v_activity);
  end if;
  return new;
end $$;

-- ------------------------------------------------------------
-- 6. Immutabilita' dei codici, nel verso nuovo
-- ------------------------------------------------------------
create or replace function public.totime_project_in_use(p_project uuid)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists(select 1 from public.timesheet_entries where project_id = p_project)
      or exists(select 1 from public.manual_entries   where project_id = p_project)
      or exists(select 1 from public.travel_expenses  where project_id = p_project)
      or exists(select 1 from public.wbs_items w join public.engagements e on e.id = w.engagement_id
                where e.project_id = p_project and public.totime_wbs_in_use(w.id))
$$;

create or replace function public.totime_block_code_change()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'wbs_items' then
    if old.code is not null and (new.activity_code is distinct from old.activity_code
       or new.engagement_id is distinct from old.engagement_id) then
      if public.totime_wbs_in_use(old.id) then
        raise exception 'Il codice WBS % e'' gia'' usato in consuntivi o spese: non si puo'' cambiare', old.code;
      end if;
    end if;
  elsif tg_table_name = 'engagements' then
    if old.code is not null and (new.project_id is distinct from old.project_id
       or new.year is distinct from old.year
       or new.seq is distinct from old.seq) then
      if exists(select 1 from public.wbs_items w where w.engagement_id = old.id and public.totime_wbs_in_use(w.id)) then
        raise exception 'Il codice commessa % e'' gia'' usato: non si puo'' cambiare', old.code;
      end if;
    end if;
  elsif tg_table_name = 'projects' then
    if old.code is not null and (new.short_code is distinct from old.short_code
       or new.client_id is distinct from old.client_id) then
      if public.totime_project_in_use(old.id) then
        raise exception 'Il codice progetto % e'' gia'' usato: non si puo'' cambiare', old.code;
      end if;
    end if;
  elsif tg_table_name = 'clients' then
    if old.code is not null and new.code is distinct from old.code
       and exists(select 1 from public.projects p where p.client_id = old.id and p.code is not null) then
      raise exception 'Il codice cliente % ha gia'' dei progetti: non si puo'' cambiare', old.code;
    end if;
  end if;
  return new;
end $$;

-- ------------------------------------------------------------
-- Esito
-- ------------------------------------------------------------
select 1 as ord, 'commesse senza progetto' as controllo, count(*)::text as valore, 'deve essere 0' as atteso
from public.engagements where project_id is null
union all
select 2, 'WBS senza commessa', count(*)::text, 'deve essere 0' from public.wbs_items where engagement_id is null
union all
select 3, 'progetti senza cliente', count(*)::text, 'deve essere 0' from public.projects where client_id is null
union all
select 4, 'codici non ricalcolati', count(*)::text, 'deve essere 0'
from public.wbs_items w join public.engagements e on e.id = w.engagement_id
where w.code is distinct from e.code || '-' || w.activity_code
union all
select 5, 'progetti / commesse / WBS',
       (select count(*) from public.projects)::text || ' / ' ||
       (select count(*) from public.engagements)::text || ' / ' ||
       (select count(*) from public.wbs_items)::text, 'quante ce ne sono adesso'
union all
select 6, '  esempio · ' || coalesce(p.code,'?'), coalesce(e.code,'?') || '  →  ' || coalesce(w.code,'?'), ''
from public.projects p
join public.engagements e on e.project_id = p.id
join public.wbs_items w on w.engagement_id = e.id
order by ord, controllo
limit 20;
