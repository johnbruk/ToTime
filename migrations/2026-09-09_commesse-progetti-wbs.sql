-- ============================================================
-- Migrazione TOTIME — 2026-09-09
-- Gerarchia Cliente -> Commessa -> Progetto -> WBS -> registrazioni
--
-- Principio: registro e controllo il lavoro sulla WBS, ma fatturo
-- sempre a livello di commessa/progetto. La WBS non diventa mai una
-- riga di fattura.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- NON rende obbligatorio nulla: il backfill e' in una migrazione a
-- parte, da lanciare dopo aver verificato i dati.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Funzioni di normalizzazione dei codici
-- ------------------------------------------------------------

-- Maiuscolo, senza spazi ne' caratteri speciali. Usata sia dai
-- trigger sia dai check, cosi' frontend e database non possono
-- divergere sulla regola.
create or replace function public.totime_norm_code(v text)
returns text
language sql
immutable
as $$ select nullif(upper(regexp_replace(coalesce(v,''), '[^A-Za-z0-9]', '', 'g')), '') $$;

-- ------------------------------------------------------------
-- 1. Cliente contrattuale: codice breve
-- ------------------------------------------------------------

alter table public.clients
  add column if not exists code text;

update public.clients set code = public.totime_norm_code(code) where code is not null;

do $$ begin
  alter table public.clients
    add constraint clients_code_format
    check (code is null or code = public.totime_norm_code(code) and length(code) between 2 and 5);
exception when duplicate_object then null; end $$;

create unique index if not exists clients_user_code_key
  on public.clients(user_id, code) where code is not null;

-- Il codice si normalizza da solo: chi scrive "so" ottiene "SO". Il
-- check qui sopra resta come garanzia, non come ostacolo.
create or replace function public.totime_norm_client_code()
returns trigger language plpgsql as $$
begin
  new.code := public.totime_norm_code(new.code);
  return new;
end $$;

drop trigger if exists clients_norm_code_trg on public.clients;
create trigger clients_norm_code_trg before insert or update on public.clients
for each row execute function public.totime_norm_client_code();

-- ------------------------------------------------------------
-- 2. Contatore dei progressivi di commessa
--    Una riga per (utente, cliente, anno). L'incremento avviene in
--    una sola istruzione, quindi e' atomico anche con inserimenti
--    contemporanei: niente "max+1" letto e riscritto.
-- ------------------------------------------------------------

create table if not exists public.engagement_counters (
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  year       integer not null check (year between 2000 and 2999),
  next_seq   integer not null default 0 check (next_seq >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, client_id, year)
);

-- ------------------------------------------------------------
-- 3. Commesse
-- ------------------------------------------------------------

create table if not exists public.engagements (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  client_id           uuid not null references public.clients(id) on delete restrict,
  code                text not null,
  year                integer not null check (year between 2000 and 2999),
  seq                 integer not null check (seq > 0),
  name                text not null,
  description         text,
  -- riferimenti amministrativi correnti (lo storico sta in
  -- engagement_references)
  engagement_letter   text,
  invoice_reference   text,
  purchase_order      text,
  start_date          date,
  end_date            date,
  currency            text not null default 'EUR',
  budget_amount       numeric(14,2),
  status              text not null default 'draft',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint engagements_status_check
    check (status in ('draft','active','suspended','closed','cancelled')),
  constraint engagements_dates_check
    check (start_date is null or end_date is null or end_date >= start_date)
);

create unique index if not exists engagements_user_code_key on public.engagements(user_id, code);
create unique index if not exists engagements_client_year_seq_key on public.engagements(user_id, client_id, year, seq);
create index if not exists engagements_client_idx on public.engagements(client_id);
create index if not exists engagements_user_status_idx on public.engagements(user_id, status);

-- ------------------------------------------------------------
-- 4. Storico dei riferimenti contrattuali
--    Una proroga non cambia la commessa: aggiunge un riferimento.
--    Le fatture gia' emesse non cambiano, perche' conservano il
--    riferimento usato al momento (snapshot su billing_lines).
-- ------------------------------------------------------------

create table if not exists public.engagement_references (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  engagement_id     uuid not null references public.engagements(id) on delete cascade,
  reference_type    text not null default 'engagement_letter',
  engagement_letter text,
  purchase_order    text,
  invoice_reference text,
  valid_from        date,
  valid_to          date,
  status            text not null default 'active',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint engagement_references_type_check
    check (reference_type in ('engagement_letter','purchase_order','extension','other')),
  constraint engagement_references_status_check
    check (status in ('active','expired','superseded','cancelled')),
  constraint engagement_references_dates_check
    check (valid_from is null or valid_to is null or valid_to >= valid_from)
);

create index if not exists engagement_references_engagement_idx on public.engagement_references(engagement_id);

-- ------------------------------------------------------------
-- 5. Progetti: diventano figli della commessa
--    Si riusa la tabella esistente invece di crearne una nuova.
-- ------------------------------------------------------------

alter table public.projects add column if not exists engagement_id uuid references public.engagements(id) on delete restrict;
alter table public.projects add column if not exists short_code text;
alter table public.projects add column if not exists code text;
alter table public.projects add column if not exists end_client_name text;
alter table public.projects add column if not exists description text;
alter table public.projects add column if not exists start_date date;
alter table public.projects add column if not exists end_date date;
alter table public.projects add column if not exists status text not null default 'active';
alter table public.projects add column if not exists billing_unit text not null default 'day';
alter table public.projects add column if not exists sell_rate numeric(14,2);
alter table public.projects add column if not exists currency text not null default 'EUR';
alter table public.projects add column if not exists invoice_line_description text;
alter table public.projects add column if not exists billing_notes text;
alter table public.projects add column if not exists budget_amount numeric(14,2);
alter table public.projects add column if not exists notes text;
alter table public.projects add column if not exists created_at timestamptz not null default now();
alter table public.projects add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.projects add constraint projects_status_check
    check (status in ('draft','active','suspended','closed','cancelled'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.projects add constraint projects_billing_unit_check
    check (billing_unit in ('hour','day'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.projects add constraint projects_dates_check
    check (start_date is null or end_date is null or end_date >= start_date);
exception when duplicate_object then null; end $$;

create unique index if not exists projects_user_code_key on public.projects(user_id, code) where code is not null;
create unique index if not exists projects_engagement_short_code_key on public.projects(engagement_id, short_code) where engagement_id is not null and short_code is not null;
create index if not exists projects_engagement_idx on public.projects(engagement_id);

-- ------------------------------------------------------------
-- 6. WBS / attivita'
--    Il livello analitico su cui si registrano i consuntivi.
--    activity_id resta un collegamento facoltativo al catalogo
--    attivita' gia' esistente: non si duplica quell'anagrafica.
-- ------------------------------------------------------------

create table if not exists public.wbs_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete restrict,
  activity_code  text not null,
  code           text not null,
  name           text not null,
  description    text,
  activity_id    uuid references public.activities(id) on delete set null,
  kind           text not null default 'activity',
  billable       boolean not null default true,
  budget_hours   numeric(10,2),
  start_date     date,
  end_date       date,
  status         text not null default 'active',
  sort_order     integer not null default 0,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint wbs_items_kind_check
    check (kind in ('activity','project_management','analysis','development','travel','internal','expense','other')),
  constraint wbs_items_status_check
    check (status in ('draft','active','suspended','closed','cancelled')),
  constraint wbs_items_activity_code_format
    check (activity_code = public.totime_norm_code(activity_code) and length(activity_code) between 1 and 6),
  constraint wbs_items_dates_check
    check (start_date is null or end_date is null or end_date >= start_date)
);

create unique index if not exists wbs_items_user_code_key on public.wbs_items(user_id, code);
create unique index if not exists wbs_items_project_activity_code_key on public.wbs_items(project_id, activity_code);
create index if not exists wbs_items_project_idx on public.wbs_items(project_id);
create index if not exists wbs_items_user_status_idx on public.wbs_items(user_id, status);

-- ------------------------------------------------------------
-- 7. Le registrazioni puntano alla WBS
--    Nullable adesso: diventeranno obbligatorie solo dopo il
--    backfill verificato (migrazione separata).
-- ------------------------------------------------------------

alter table public.timesheet_entries add column if not exists wbs_id uuid references public.wbs_items(id) on delete restrict;
alter table public.manual_entries   add column if not exists wbs_id uuid references public.wbs_items(id) on delete restrict;
alter table public.travel_expenses  add column if not exists wbs_id uuid references public.wbs_items(id) on delete restrict;

create index if not exists timesheet_entries_wbs_idx on public.timesheet_entries(wbs_id);
create index if not exists manual_entries_wbs_idx    on public.manual_entries(wbs_id);
create index if not exists travel_expenses_wbs_idx   on public.travel_expenses(wbs_id);

-- ------------------------------------------------------------
-- 8. Appartenenza incrociata garantita dallo schema
--    Le foreign key composite impediscono strutturalmente di
--    agganciare un proprio record al cliente/commessa/progetto di
--    un altro utente: non si dipende dalle sole policy RLS.
-- ------------------------------------------------------------

create unique index if not exists clients_id_user_key     on public.clients(id, user_id);
create unique index if not exists engagements_id_user_key on public.engagements(id, user_id);
create unique index if not exists projects_id_user_key    on public.projects(id, user_id);
create unique index if not exists wbs_items_id_user_key   on public.wbs_items(id, user_id);

do $$ begin
  alter table public.engagements add constraint engagements_client_same_owner
    foreign key (client_id, user_id) references public.clients(id, user_id) on delete restrict;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.engagement_references add constraint engagement_references_same_owner
    foreign key (engagement_id, user_id) references public.engagements(id, user_id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.projects add constraint projects_engagement_same_owner
    foreign key (engagement_id, user_id) references public.engagements(id, user_id) on delete restrict;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wbs_items add constraint wbs_items_project_same_owner
    foreign key (project_id, user_id) references public.projects(id, user_id) on delete restrict;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.engagement_counters add constraint engagement_counters_client_same_owner
    foreign key (client_id, user_id) references public.clients(id, user_id) on delete cascade;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 9. Progressivo atomico
--    L'incremento sta in una sola istruzione: due inserimenti
--    contemporanei si serializzano sulla riga del contatore e
--    ottengono due numeri diversi. L'unique index su (user_id,
--    code) resta come rete di sicurezza.
-- ------------------------------------------------------------

-- L'utente arriva dalla riga in inserimento, non da auth.uid(): cosi'
-- la funzione vale anche per la migrazione di backfill, che gira
-- senza sessione. La protezione resta la RLS su engagement_counters,
-- che accetta solo righe intestate a chi scrive.
drop function if exists public.totime_next_engagement_seq(uuid, integer);
create or replace function public.totime_next_engagement_seq(p_user_id uuid, p_client_id uuid, p_year integer)
returns integer
language plpgsql
as $$
declare v_seq integer;
begin
  insert into public.engagement_counters as c (user_id, client_id, year, next_seq, updated_at)
  values (p_user_id, p_client_id, p_year, 1, now())
  on conflict (user_id, client_id, year)
  do update set next_seq = c.next_seq + 1, updated_at = now()
  returning c.next_seq into v_seq;
  return v_seq;
end $$;

-- ------------------------------------------------------------
-- 10. Generazione dei codici
--     Il codice si compone nel database, non nel frontend:
--     l'anteprima in interfaccia e' solo un aiuto visivo.
-- ------------------------------------------------------------

create or replace function public.totime_engagement_code()
returns trigger
language plpgsql
as $$
declare v_client_code text;
begin
  if tg_op = 'INSERT' then
    select code into v_client_code from public.clients where id = new.client_id;
    if v_client_code is null then
      raise exception 'Il cliente non ha un codice: assegnalo prima di creare la commessa';
    end if;
    if new.year is null then new.year := extract(year from coalesce(new.start_date, current_date))::int; end if;
    if new.seq is null then new.seq := public.totime_next_engagement_seq(new.user_id, new.client_id, new.year); end if;
    new.code := v_client_code || '-' || new.year::text || '-' || lpad(new.seq::text, 3, '0');
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists engagements_code_trg on public.engagements;
create trigger engagements_code_trg before insert or update on public.engagements
for each row execute function public.totime_engagement_code();

create or replace function public.totime_project_code()
returns trigger
language plpgsql
as $$
declare v_eng_code text;
begin
  new.short_code := public.totime_norm_code(new.short_code);
  if new.engagement_id is not null then
    if new.short_code is null then
      raise exception 'Il progetto di una commessa richiede un codice breve';
    end if;
    select code into v_eng_code from public.engagements where id = new.engagement_id;
    new.code := v_eng_code || '-' || new.short_code;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists projects_code_trg on public.projects;
create trigger projects_code_trg before insert or update on public.projects
for each row execute function public.totime_project_code();

create or replace function public.totime_wbs_code()
returns trigger
language plpgsql
as $$
declare v_prj_code text;
begin
  new.activity_code := public.totime_norm_code(new.activity_code);
  select code into v_prj_code from public.projects where id = new.project_id;
  if v_prj_code is null then
    raise exception 'Il progetto non ha un codice completo: collegalo a una commessa';
  end if;
  new.code := v_prj_code || '-' || new.activity_code;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists wbs_items_code_trg on public.wbs_items;
create trigger wbs_items_code_trg before insert or update on public.wbs_items
for each row execute function public.totime_wbs_code();

-- ------------------------------------------------------------
-- 11. Immutabilita' dei codici gia' usati
--     Il codice e' un identificativo di business: una volta che ci
--     sono sopra consuntivi, spese o fatture non cambia piu'. La
--     descrizione invece resta modificabile.
-- ------------------------------------------------------------

create or replace function public.totime_wbs_in_use(p_wbs uuid)
returns boolean language sql stable as $$
  select exists(select 1 from public.timesheet_entries where wbs_id = p_wbs)
      or exists(select 1 from public.manual_entries   where wbs_id = p_wbs)
      or exists(select 1 from public.travel_expenses  where wbs_id = p_wbs)
$$;

create or replace function public.totime_project_in_use(p_project uuid)
returns boolean language sql stable as $$
  select exists(select 1 from public.timesheet_entries where project_id = p_project)
      or exists(select 1 from public.manual_entries   where project_id = p_project)
      or exists(select 1 from public.travel_expenses  where project_id = p_project)
      or exists(select 1 from public.wbs_items w where w.project_id = p_project and public.totime_wbs_in_use(w.id))
$$;

create or replace function public.totime_block_code_change()
returns trigger
language plpgsql
as $$
begin
  -- Si confrontano i campi DI PARTENZA, non il codice derivato: i
  -- trigger scattano in ordine alfabetico e il codice potrebbe non
  -- essere ancora stato ricalcolato quando questo controllo gira.
  -- Assegnare un codice che mancava non e' un cambio: e' quello che
  -- fa il backfill. Si blocca solo la modifica di un codice esistente.
  if tg_table_name = 'wbs_items' then
    if old.code is not null and (new.activity_code is distinct from old.activity_code
       or new.project_id is distinct from old.project_id) then
      if public.totime_wbs_in_use(old.id) then
        raise exception 'Il codice WBS % e'' gia'' usato in consuntivi o spese: non si puo'' cambiare', old.code;
      end if;
    end if;
  elsif tg_table_name = 'projects' then
    if old.code is not null and (new.short_code is distinct from old.short_code
       or new.engagement_id is distinct from old.engagement_id) then
      if public.totime_project_in_use(old.id) then
        raise exception 'Il codice progetto % e'' gia'' usato: non si puo'' cambiare', old.code;
      end if;
    end if;
  elsif tg_table_name = 'engagements' then
    if old.code is not null and (new.client_id is distinct from old.client_id
       or new.year is distinct from old.year
       or new.seq is distinct from old.seq) then
      if exists(select 1 from public.projects p where p.engagement_id = old.id and public.totime_project_in_use(p.id)) then
        raise exception 'Il codice commessa % e'' gia'' usato: non si puo'' cambiare', old.code;
      end if;
    end if;
  elsif tg_table_name = 'clients' then
    if old.code is not null and new.code is distinct from old.code
       and exists(select 1 from public.engagements e where e.client_id = old.id) then
      raise exception 'Il codice cliente % ha gia'' delle commesse: non si puo'' cambiare', old.code;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists wbs_items_code_lock_trg on public.wbs_items;
create trigger wbs_items_code_lock_trg before update on public.wbs_items
for each row execute function public.totime_block_code_change();
drop trigger if exists projects_code_lock_trg on public.projects;
create trigger projects_code_lock_trg before update on public.projects
for each row execute function public.totime_block_code_change();
drop trigger if exists engagements_code_lock_trg on public.engagements;
create trigger engagements_code_lock_trg before update on public.engagements
for each row execute function public.totime_block_code_change();
drop trigger if exists clients_code_lock_trg on public.clients;
create trigger clients_code_lock_trg before update on public.clients
for each row execute function public.totime_block_code_change();

-- ------------------------------------------------------------
-- 12. Coerenza fra registrazione e genealogia della WBS
--     Le registrazioni conservano client_id e project_id perche' li
--     legge tutta l'applicazione. Quando c'e' una WBS, questi due
--     campi vengono riallineati alla sua genealogia: cosi' il dato
--     denormalizzato non puo' divergere da quello di riferimento.
--     Si blocca anche l'uso di una WBS non attiva.
-- ------------------------------------------------------------

create or replace function public.totime_sync_wbs_lineage()
returns trigger
language plpgsql
as $$
declare v_project uuid; v_client uuid; v_status text; v_activity uuid;
begin
  if new.wbs_id is null then return new; end if;
  select w.project_id, w.status, w.activity_id, p.client_id
    into v_project, v_status, v_activity, v_client
  from public.wbs_items w join public.projects p on p.id = w.project_id
  where w.id = new.wbs_id;
  if v_project is null then
    raise exception 'WBS inesistente';
  end if;
  -- una WBS chiusa o annullata non accetta registrazioni nuove, ma
  -- quelle gia' registrate restano intatte
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

drop trigger if exists timesheet_entries_wbs_trg on public.timesheet_entries;
create trigger timesheet_entries_wbs_trg before insert or update on public.timesheet_entries
for each row execute function public.totime_sync_wbs_lineage();
drop trigger if exists manual_entries_wbs_trg on public.manual_entries;
create trigger manual_entries_wbs_trg before insert or update on public.manual_entries
for each row execute function public.totime_sync_wbs_lineage();
drop trigger if exists travel_expenses_wbs_trg on public.travel_expenses;
create trigger travel_expenses_wbs_trg before insert or update on public.travel_expenses
for each row execute function public.totime_sync_wbs_lineage();

-- ------------------------------------------------------------
-- 13. Righe di fattura a livello di progetto
--     Si riusa billing_lines, gia' a schema ma non utilizzata
--     dall'applicazione. La riga punta al PROGETTO, mai alla WBS.
--     I campi snapshot congelano il valore al momento
--     dell'emissione: modificare poi tariffa o riferimenti non
--     cambia una fattura gia' emessa.
-- ------------------------------------------------------------

create table if not exists public.billing_lines (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now()
);

alter table public.billing_lines add column if not exists billing_header_id uuid references public.billing_headers(id) on delete cascade;
alter table public.billing_lines add column if not exists project_id uuid references public.projects(id) on delete restrict;
alter table public.billing_lines add column if not exists engagement_id uuid references public.engagements(id) on delete restrict;
alter table public.billing_lines add column if not exists client_id uuid references public.clients(id) on delete restrict;
alter table public.billing_lines add column if not exists line_type text not null default 'daily_rate_8h';
alter table public.billing_lines add column if not exists description text;
alter table public.billing_lines add column if not exists period_from date;
alter table public.billing_lines add column if not exists period_to date;
alter table public.billing_lines add column if not exists quantity numeric(14,2);
alter table public.billing_lines add column if not exists unit text;
alter table public.billing_lines add column if not exists unit_rate numeric(14,2);
alter table public.billing_lines add column if not exists currency text default 'EUR';
alter table public.billing_lines add column if not exists amount numeric(14,2);
alter table public.billing_lines add column if not exists sort_order integer not null default 0;
alter table public.billing_lines add column if not exists updated_at timestamptz not null default now();
-- snapshot: valori congelati al momento dell'emissione
alter table public.billing_lines add column if not exists snapshot_client_name text;
alter table public.billing_lines add column if not exists snapshot_client_code text;
alter table public.billing_lines add column if not exists snapshot_engagement_code text;
alter table public.billing_lines add column if not exists snapshot_project_code text;
alter table public.billing_lines add column if not exists snapshot_project_name text;
alter table public.billing_lines add column if not exists snapshot_end_client text;
alter table public.billing_lines add column if not exists snapshot_engagement_letter text;
alter table public.billing_lines add column if not exists snapshot_purchase_order text;
alter table public.billing_lines add column if not exists snapshot_invoice_reference text;

create index if not exists billing_lines_header_idx  on public.billing_lines(billing_header_id);
create index if not exists billing_lines_project_idx on public.billing_lines(project_id);

-- ------------------------------------------------------------
-- 14. Allocazioni: quali registrazioni compongono una riga
--     Serve a tre cose: risalire dalla fattura ai consuntivi,
--     impedire di fatturare due volte la stessa registrazione, e
--     permettere fatturazioni parziali.
-- ------------------------------------------------------------

create table if not exists public.invoice_line_allocations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  billing_line_id uuid not null references public.billing_lines(id) on delete cascade,
  source_table    text not null,
  source_id       uuid not null,
  wbs_id          uuid references public.wbs_items(id) on delete restrict,
  quantity        numeric(14,2) not null default 0,
  amount          numeric(14,2) not null default 0,
  created_at      timestamptz not null default now(),
  constraint invoice_line_allocations_source_check
    check (source_table in ('timesheet_entries','manual_entries','monthly_compensations','travel_expenses')),
  constraint invoice_line_allocations_qty_check check (quantity >= 0 and amount >= 0)
);

create unique index if not exists invoice_line_allocations_unique
  on public.invoice_line_allocations(billing_line_id, source_table, source_id);
create index if not exists invoice_line_allocations_source_idx
  on public.invoice_line_allocations(source_table, source_id);
create index if not exists invoice_line_allocations_wbs_idx
  on public.invoice_line_allocations(wbs_id);

-- Quanto di una registrazione risulta gia' fatturato
create or replace function public.totime_allocated_qty(p_table text, p_id uuid, p_exclude uuid default null)
returns numeric language sql stable as $$
  select coalesce(sum(quantity),0) from public.invoice_line_allocations
  where source_table = p_table and source_id = p_id and (p_exclude is null or id <> p_exclude)
$$;

-- La somma delle allocazioni non puo' superare la quantita' della
-- registrazione: e' cosi' che si impedisce la doppia fatturazione,
-- lasciando pero' possibili le fatturazioni parziali.
create or replace function public.totime_check_allocation()
returns trigger
language plpgsql
as $$
declare v_total numeric; v_already numeric;
begin
  if new.source_table = 'timesheet_entries' then
    select hours into v_total from public.timesheet_entries where id = new.source_id;
  elsif new.source_table = 'manual_entries' then
    select amount into v_total from public.manual_entries where id = new.source_id;
  elsif new.source_table = 'monthly_compensations' then
    select amount into v_total from public.monthly_compensations where id = new.source_id;
  else
    select amount into v_total from public.travel_expenses where id = new.source_id;
  end if;
  if v_total is null then
    raise exception 'Registrazione % non trovata in %', new.source_id, new.source_table;
  end if;
  v_already := public.totime_allocated_qty(new.source_table, new.source_id, case when tg_op='UPDATE' then new.id end);
  if v_already + new.quantity > v_total + 0.001 then
    raise exception 'La registrazione % e'' gia'' fatturata per %/% : non si puo'' fatturare due volte',
      new.source_id, v_already, v_total;
  end if;
  return new;
end $$;

drop trigger if exists invoice_line_allocations_check_trg on public.invoice_line_allocations;
create trigger invoice_line_allocations_check_trg before insert or update on public.invoice_line_allocations
for each row execute function public.totime_check_allocation();

-- ------------------------------------------------------------
-- 15. Row Level Security
--     Ogni policy verifica concretamente la proprieta'. Le UPDATE
--     hanno sia USING sia WITH CHECK, cosi' non si puo' aggiornare
--     una riga propria facendola diventare di un altro. Non si usa
--     auth.role() ne' user_metadata per decidere, e nessuna
--     funzione e' SECURITY DEFINER.
-- ------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['engagements','engagement_references','wbs_items',
                           'engagement_counters','billing_lines','invoice_line_allocations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)', t||'_select_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)', t||'_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_update_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t||'_update_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)', t||'_delete_own', t);
  end loop;
end $$;

-- I permessi di tabella, non solo le policy: senza grant la Data
-- API non espone comunque nulla.
grant select, insert, update, delete on
  public.engagements, public.engagement_references, public.wbs_items,
  public.engagement_counters, public.billing_lines, public.invoice_line_allocations
  to authenticated;
revoke all on
  public.engagements, public.engagement_references, public.wbs_items,
  public.engagement_counters, public.billing_lines, public.invoice_line_allocations
  from anon;

-- ------------------------------------------------------------
-- 16. updated_at
-- ------------------------------------------------------------

create or replace function public.totime_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists engagement_references_touch_trg on public.engagement_references;
create trigger engagement_references_touch_trg before update on public.engagement_references
for each row execute function public.totime_touch_updated_at();
drop trigger if exists billing_lines_touch_trg on public.billing_lines;
create trigger billing_lines_touch_trg before update on public.billing_lines
for each row execute function public.totime_touch_updated_at();

-- ------------------------------------------------------------
-- Fine. Il backfill dei dati esistenti e' in una migrazione a
-- parte: qui non si tocca un solo record.
-- ------------------------------------------------------------
