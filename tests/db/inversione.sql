-- L'inversione del verso: da Cliente > Commessa > Progetto > WBS
-- a Cliente > Progetto > Commessa > Attivita'.
--
-- Non basta che la gerarchia risulti girata: quello che conta e' che
-- i consuntivi gia' registrati continuino a puntare allo stesso
-- cliente e allo stesso progetto di prima. Un'inversione che perde
-- l'aggancio dei dati storici non e' una migrazione, e' una perdita.
--
-- I casi scomodi sono messi apposta: una commessa che copre DUE
-- progetti (nel verso nuovo non ci sta, va sdoppiata), una commessa
-- SENZA progetti (nel verso nuovo deve averne uno), e due progetti di
-- commesse diverse con lo STESSO codice breve (nel verso nuovo il
-- codice breve e' unico per cliente, quindi collidono).
create or replace function pg_temp.ok(cond boolean, label text, extra text default '')
returns void language plpgsql as $$
begin
  raise notice '%', (case when cond then '  OK  ' else '  KO  ' end) || label ||
    (case when extra <> '' then '  -> ' || extra else '' end);
end $$;

insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;

do $$
declare
  u uuid := '11111111-1111-1111-1111-111111111111';
  c uuid; e1 uuid; e2 uuid; e3 uuid;
  p1 uuid; p2 uuid; p3 uuid;
  w1 uuid; w2 uuid; w3 uuid;
begin
  insert into public.clients(user_id,name,code,daily_rate,standard_hours)
    values (u,'Solution','SO',480,8) returning id into c;

  -- commessa 1: copre DUE progetti (il caso da sdoppiare)
  insert into public.engagements(user_id,client_id,year,name)
    values (u,c,2026,'Incarico quadro') returning id into e1;
  insert into public.projects(user_id,client_id,engagement_id,short_code,name)
    values (u,c,e1,'EQU','EQUANS') returning id into p1;
  insert into public.projects(user_id,client_id,engagement_id,short_code,name)
    values (u,c,e1,'ACM','ACME') returning id into p2;

  -- commessa 2: un solo progetto, ma con lo STESSO codice breve di p1
  insert into public.engagements(user_id,client_id,year,name)
    values (u,c,2026,'Secondo incarico') returning id into e2;
  insert into public.projects(user_id,client_id,engagement_id,short_code,name)
    values (u,c,e2,'EQU','EQUANS estensione') returning id into p3;

  -- commessa 3: nessun progetto
  insert into public.engagements(user_id,client_id,year,name)
    values (u,c,2026,'Incarico senza progetti') returning id into e3;

  insert into public.wbs_items(user_id,project_id,activity_code,name) values (u,p1,'10','PM') returning id into w1;
  insert into public.wbs_items(user_id,project_id,activity_code,name) values (u,p2,'10','PM') returning id into w2;
  insert into public.wbs_items(user_id,project_id,activity_code,name) values (u,p3,'20','AMS') returning id into w3;

  insert into public.timesheet_entries(user_id,entry_date,wbs_id,hours) values (u,'2026-03-02',w1,8);
  insert into public.timesheet_entries(user_id,entry_date,wbs_id,hours) values (u,'2026-03-03',w2,4);
  insert into public.travel_expenses(user_id,expense_date,wbs_id,amount) values (u,'2026-03-02',w1,50);
end $$;

-- fotografia PRIMA: per ogni consuntivo, a che cliente e progetto punta
create temp table prima as
  select t.entry_date, t.hours, c.name as cliente, p.name as progetto, w.activity_code
  from public.timesheet_entries t
  join public.wbs_items w on w.id = t.wbs_id
  join public.projects p on p.id = w.project_id
  join public.clients c on c.id = p.client_id;

\i /home/user/To-Time/migrations/2026-09-10_inversione-progetto-commessa.sql

create temp table dopo as
  select t.entry_date, t.hours, c.name as cliente, p.name as progetto, w.activity_code
  from public.timesheet_entries t
  join public.wbs_items w on w.id = t.wbs_id
  join public.engagements e on e.id = w.engagement_id
  join public.projects p on p.id = e.project_id
  join public.clients c on c.id = p.client_id;

do $$
declare n int; s text; u uuid := '11111111-1111-1111-1111-111111111111'; v_p uuid; v_e uuid;
begin
raise notice '';
raise notice '=== N. Inversione del verso progetto/commessa ===';

-- LA prova: i consuntivi puntano dove puntavano
select count(*) into n from (
  (select * from prima except all select * from dopo)
  union all
  (select * from dopo except all select * from prima)) d;
perform pg_temp.ok(n=0,'ogni consuntivo punta allo stesso cliente e progetto di prima',n||' differenze');

select count(*) into n from public.timesheet_entries;
perform pg_temp.ok(n=2,'nessun consuntivo perso per strada',n||' su 2');

-- il verso e' girato
perform pg_temp.ok(
  not exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='engagement_id'),
  'il progetto non dipende piu'' dalla commessa');
perform pg_temp.ok(
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='engagements' and column_name='project_id'),
  'la commessa dipende dal progetto');
perform pg_temp.ok(
  not exists(select 1 from information_schema.columns where table_schema='public' and table_name='wbs_items' and column_name='project_id'),
  'la WBS non dipende piu'' dal progetto');

-- la commessa che copriva due progetti e' stata sdoppiata
select count(*) into n from public.engagements;
perform pg_temp.ok(n=4,'la commessa su due progetti e'' stata sdoppiata',n||' commesse (erano 3, una copriva 2 progetti)');

-- la commessa senza progetti ne ha ricevuto uno
select count(*) into n from public.engagements e where not exists(select 1 from public.projects p where p.id=e.project_id);
perform pg_temp.ok(n=0,'nessuna commessa e'' rimasta senza progetto',n||' orfane');
select count(*) into n from public.projects;
perform pg_temp.ok(n=4,'la commessa senza progetti ne ha ricevuto uno',n||' progetti (erano 3)');

-- i codici brevi che collidevano sono stati distinti
select count(*) into n from (
  select client_id, short_code from public.projects group by 1,2 having count(*)>1) d;
perform pg_temp.ok(n=0,'nessun codice breve duplicato sotto lo stesso cliente',n||' collisioni');

-- la forma dei codici
select p.code into s from public.projects p where p.name='EQUANS';
perform pg_temp.ok(s='SO-EQU','il progetto si codifica sotto il cliente',coalesce(s,'nullo'));
select e.code into s from public.engagements e join public.projects p on p.id=e.project_id where p.name='EQUANS';
perform pg_temp.ok(s='SO-EQU-2026-001','la commessa si codifica sotto il progetto',coalesce(s,'nullo'));
select w.code into s from public.wbs_items w join public.engagements e on e.id=w.engagement_id
  join public.projects p on p.id=e.project_id where p.name='EQUANS';
perform pg_temp.ok(s='SO-EQU-2026-001-10','l''attivita'' si codifica sotto la commessa',coalesce(s,'nullo'));

-- quello per cui e' stata fatta: piu' commesse sotto lo stesso cliente finale
select id into v_p from public.projects where name='EQUANS';
insert into public.engagements(user_id,client_id,project_id,year,name)
  values (u,(select client_id from public.projects where id=v_p),v_p,2027,'Contratto 2027') returning id into v_e;
select code into s from public.engagements where id=v_e;
perform pg_temp.ok(s='SO-EQU-2027-001','sotto lo stesso cliente finale si apre la commessa dell''anno dopo',coalesce(s,'nullo'));
insert into public.engagements(user_id,client_id,project_id,year,name)
  values (u,(select client_id from public.projects where id=v_p),v_p,2027,'Ordine aggiuntivo 2027') returning id into v_e;
select code into s from public.engagements where id=v_e;
perform pg_temp.ok(s='SO-EQU-2027-002','e il progressivo riparte per progetto e anno',coalesce(s,'nullo'));

-- l'immutabilita' funziona nel verso nuovo
begin
  update public.wbs_items set activity_code='99'
   where id=(select w.id from public.wbs_items w join public.engagements e on e.id=w.engagement_id
             join public.projects p on p.id=e.project_id where p.name='EQUANS');
  perform pg_temp.ok(false,'un codice attivita'' gia'' usato resta bloccato');
exception when others then perform pg_temp.ok(true,'un codice attivita'' gia'' usato resta bloccato');
end;

-- la spesa ha seguito la stessa catena
select count(*) into n from public.travel_expenses x
  join public.wbs_items w on w.id=x.wbs_id
  join public.engagements e on e.id=w.engagement_id
  join public.projects p on p.id=e.project_id where p.name='EQUANS';
perform pg_temp.ok(n=1,'anche la spesa risale la catena nel verso nuovo',n||' spesa');
end $$;

-- rilanciarla non deve rifare niente
\i /home/user/To-Time/migrations/2026-09-10_inversione-progetto-commessa.sql
do $$
declare n int;
begin
  select count(*) into n from public.engagements;
  perform pg_temp.ok(n=6,'rilanciarla non sdoppia niente una seconda volta',n||' commesse');
  select count(*) into n from public.projects;
  perform pg_temp.ok(n=4,'e non crea progetti nuovi',n||' progetti');
end $$;
