-- L'obbligo della WBS sulle nuove registrazioni.
-- Non un NOT NULL sulla colonna, che renderebbe impossibile
-- registrare per un cliente senza commesse: la regola e' "se il
-- cliente ha delle commesse, la WBS serve". L'eccezione e' prevista
-- e va verificata anche lei.
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
  c_con uuid; c_senza uuid; e uuid; p uuid; w uuid; n int;
begin
raise notice '';
raise notice '=== L. Obbligo della WBS ===';
insert into public.clients(user_id,name,code,daily_rate,standard_hours) values (u,'Con commessa','SO',480,8) returning id into c_con;
insert into public.clients(user_id,name,code,daily_rate,standard_hours) values (u,'Senza commessa','NC',400,8) returning id into c_senza;
insert into public.engagements(user_id,client_id,year,name) values (u,c_con,2026,'Incarico') returning id into e;
insert into public.projects(user_id,client_id,engagement_id,short_code,name) values (u,c_con,e,'EQU','EQUANS') returning id into p;
insert into public.wbs_items(user_id,project_id,activity_code,name) values (u,p,'10','PM') returning id into w;

begin
  insert into public.timesheet_entries(user_id,entry_date,client_id,hours) values (u,'2026-03-10',c_con,8);
  perform pg_temp.ok(false,'un cliente con commesse non accetta registrazioni senza WBS');
exception when others then
  perform pg_temp.ok(true,'un cliente con commesse non accetta registrazioni senza WBS');
end;

insert into public.timesheet_entries(user_id,entry_date,wbs_id,hours) values (u,'2026-03-11',w,8);
select count(*) into n from public.timesheet_entries where entry_date='2026-03-11';
perform pg_temp.ok(n=1,'ma con la WBS la accetta',n||' riga');

-- L'eccezione documentata: chi non ha ancora commesse continua a
-- lavorare come prima. Senza questa, aggiungere un cliente nuovo
-- bloccherebbe l'applicazione finche' non gli si apre una commessa.
insert into public.timesheet_entries(user_id,entry_date,client_id,hours) values (u,'2026-03-12',c_senza,8);
select count(*) into n from public.timesheet_entries where entry_date='2026-03-12';
perform pg_temp.ok(n=1,'un cliente senza commesse registra come si e'' sempre fatto',n||' riga');

-- e la stessa regola vale per i compensi una tantum
begin
  insert into public.manual_entries(user_id,entry_date,client_id,amount) values (u,'2026-03-13',c_con,500);
  perform pg_temp.ok(false,'l''obbligo vale anche per i compensi una tantum');
exception when others then
  perform pg_temp.ok(true,'l''obbligo vale anche per i compensi una tantum');
end;

-- le spese restano fuori dall'obbligo, di proposito
insert into public.expense_categories(user_id,name) values (u,'Hotel');
insert into public.travel_expenses(user_id,expense_date,client_id,expense_category_id,amount)
  select u,'2026-03-14',c_con,id,80 from public.expense_categories limit 1;
select count(*) into n from public.travel_expenses where expense_date='2026-03-14';
perform pg_temp.ok(n=1,'le spese restano fuori dall''obbligo: la WBS li'' serve all''analisi',n||' riga');
end $$;
