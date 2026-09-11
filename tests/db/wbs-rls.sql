-- Isolamento fra due utenti diversi. Si esegue con il ruolo
-- authenticated, non come superutente: il superutente scavalca RLS.
create or replace function pg_temp.ok(cond boolean, label text, extra text default '')
returns void language plpgsql as $$
begin
  raise notice '%', (case when cond then '  OK  ' else '  KO  ' end) || label ||
    (case when extra <> '' then '  -> ' || extra else '' end);
end $$;

grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage on schema public, auth to authenticated;

insert into auth.users(id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222') on conflict do nothing;

-- Utente 1 crea la propria gerarchia
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare u1 uuid := '11111111-1111-1111-1111-111111111111'; c uuid; e uuid; p uuid; w uuid;
begin
  insert into public.clients(user_id,name,code) values (u1,'Solution','SO') returning id into c;
  insert into public.projects(user_id,client_id,short_code,name) values (u1,c,'EQU','EQUANS') returning id into p;
  insert into public.engagements(user_id,client_id,project_id,year,name) values (u1,c,p,2026,'Incarico') returning id into e;
  insert into public.wbs_items(user_id,engagement_id,activity_code,name) values (u1,e,'10','PM') returning id into w;
  raise notice '  (utente 1 ha creato cliente, commessa, progetto e WBS)';
end $$;

-- Utente 2: cosa vede e cosa riesce a fare
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare u2 uuid := '22222222-2222-2222-2222-222222222222'; n int; altrui uuid; c2 uuid;
begin
  raise notice '';
  raise notice '=== H. Isolamento fra utenti ===';
  select count(*) into n from public.engagements; perform pg_temp.ok(n=0,'l''utente 2 non vede le commesse dell''utente 1',n||' visibili');
  select count(*) into n from public.wbs_items;   perform pg_temp.ok(n=0,'ne'' le sue WBS',n||' visibili');
  select count(*) into n from public.projects;    perform pg_temp.ok(n=0,'ne'' i suoi progetti',n||' visibili');

  -- prova a scrivere una riga intestata all'altro
  begin
    insert into public.clients(user_id,name,code) values ('11111111-1111-1111-1111-111111111111','Furto','XX');
    perform pg_temp.ok(false,'non puo'' creare record intestati a un altro utente');
  exception when others then perform pg_temp.ok(true,'non puo'' creare record intestati a un altro utente'); end;

  -- prova ad agganciarsi a una commessa altrui di cui conosce l'id
  insert into public.clients(user_id,name,code) values (u2,'Suo cliente','ZZ') returning id into c2;
  select id into altrui from public.engagements limit 1;
  perform pg_temp.ok(altrui is null,'non riesce nemmeno a leggere l''id di una commessa altrui');

  raise notice '';
  raise notice '=== I. Aggiornamenti e cancellazioni ===';
  update public.clients set name='cambiato' where name='Solution';
  get diagnostics n = row_count; perform pg_temp.ok(n=0,'non puo'' modificare i dati di un altro utente',n||' righe toccate');
  delete from public.engagements; get diagnostics n = row_count;
  perform pg_temp.ok(n=0,'non puo'' cancellarli',n||' righe toccate');
  -- non puo' cedere una propria riga a un altro utente (WITH CHECK)
  begin
    update public.clients set user_id='11111111-1111-1111-1111-111111111111' where id=c2;
    perform pg_temp.ok(false,'non puo'' regalare una propria riga a un altro utente');
  exception when others then perform pg_temp.ok(true,'non puo'' regalare una propria riga a un altro utente'); end;
end $$;
reset role;

-- L'utente 1 rivede i suoi
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare n int;
begin
  select count(*) into n from public.engagements;
  perform pg_temp.ok(n=1,'l''utente 1 continua a vedere i propri dati',n||' commessa');
end $$;
reset role;
