-- Verifica del modello Cliente -> Commessa -> Progetto -> WBS.
-- Si esegue su un PostgreSQL vuoto dopo lo schema base e la
-- migrazione. Ogni controllo stampa OK o KO.

create or replace function pg_temp.ok(cond boolean, label text, extra text default '')
returns void language plpgsql as $$
begin
  raise notice '%', (case when cond then '  OK  ' else '  KO  ' end) || label ||
    (case when extra <> '' then '  -> ' || extra else '' end);
  if not cond then
    create table if not exists pg_temp.failures(l text);
    insert into pg_temp.failures values(label);
  end if;
end $$;

-- due utenti distinti, per provare l'isolamento
insert into auth.users(id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222') on conflict do nothing;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  c_so uuid; c_al uuid; e1 uuid; e2 uuid; e3 uuid; e_alt uuid;
  p_equ uuid; w10 uuid; w20 uuid; w15 uuid; w90 uuid;
  t1 uuid; t2 uuid; t3 uuid; bl uuid; hdr uuid;
  v text; n int; err text;
begin
raise notice '';
raise notice '=== A. Codici cliente ===';
insert into public.clients(user_id,name,code,daily_rate,standard_hours) values (u1,'Solution S.r.l.','so',480,8) returning id into c_so;
select code into v from public.clients where id=c_so;
perform pg_temp.ok(v='SO','il codice cliente viene normalizzato in maiuscolo',v);

begin
  insert into public.clients(user_id,name,code) values (u1,'Altro','S O!');
  perform pg_temp.ok(false,'un codice con spazi o simboli viene rifiutato');
exception when others then
  perform pg_temp.ok(true,'un codice con spazi o simboli viene rifiutato','normalizzato o respinto');
end;

begin
  insert into public.clients(user_id,name,code) values (u1,'Doppione','SO');
  perform pg_temp.ok(false,'due clienti non possono avere lo stesso codice');
exception when unique_violation then
  perform pg_temp.ok(true,'due clienti non possono avere lo stesso codice');
end;

insert into public.clients(user_id,name,code,daily_rate,standard_hours) values (u1,'Alfa S.p.A.','AL',400,8) returning id into c_al;

raise notice '';
raise notice '=== B. Progressivo di commessa ===';
insert into public.engagements(user_id,client_id,year,name) values (u1,c_so,2026,'Incarico 2026') returning id,code into e1,v;
perform pg_temp.ok(v='SO-2026-001','la prima commessa Solution del 2026 e'' SO-2026-001',v);
insert into public.engagements(user_id,client_id,year,name) values (u1,c_so,2026,'Secondo incarico') returning id,code into e2,v;
perform pg_temp.ok(v='SO-2026-002','la seconda e'' SO-2026-002',v);
insert into public.engagements(user_id,client_id,year,name) values (u1,c_so,2027,'Incarico 2027') returning id,code into e3,v;
perform pg_temp.ok(v='SO-2027-001','il 2027 riparte da 001',v);
insert into public.engagements(user_id,client_id,year,name) values (u1,c_al,2026,'Incarico Alfa') returning id,code into e_alt,v;
perform pg_temp.ok(v='AL-2026-001','un altro cliente ha il progressivo indipendente',v);

raise notice '';
raise notice '=== C. Progetto e WBS ===';
insert into public.projects(user_id,client_id,engagement_id,short_code,name,end_client_name,billing_unit,sell_rate)
  values (u1,c_so,e1,'equ','EQUANS','EQUANS','day',480) returning id,code into p_equ,v;
perform pg_temp.ok(v='SO-2026-001-EQU','il progetto diventa SO-2026-001-EQU',v);

insert into public.wbs_items(user_id,project_id,activity_code,name,kind) values (u1,p_equ,'10','Project Management','project_management') returning id,code into w10,v;
perform pg_temp.ok(v='SO-2026-001-EQU-10','la WBS diventa SO-2026-001-EQU-10',v);
insert into public.wbs_items(user_id,project_id,activity_code,name) values (u1,p_equ,'20','Process Mapping') returning id into w20;
insert into public.wbs_items(user_id,project_id,activity_code,name) values (u1,p_equ,'15','Analisi intermedia') returning id,code into w15,v;
perform pg_temp.ok(v='SO-2026-001-EQU-15','si puo'' inserire una WBS 15 fra la 10 e la 20 senza rinumerare',v);
insert into public.wbs_items(user_id,project_id,activity_code,name,kind,billable) values (u1,p_equ,'90','Trasferte e spese','travel',false) returning id into w90;

begin
  insert into public.wbs_items(user_id,project_id,activity_code,name) values (u1,p_equ,'10','Doppione');
  perform pg_temp.ok(false,'due WBS non possono avere lo stesso codice nel progetto');
exception when unique_violation then
  perform pg_temp.ok(true,'due WBS non possono avere lo stesso codice nel progetto');
end;

raise notice '';
raise notice '=== D. Consuntivi sulla WBS ===';
insert into public.timesheet_entries(user_id,entry_date,wbs_id,hours,daily_rate_snapshot,standard_hours_snapshot)
  values (u1,'2026-03-02',w10,32,480,8) returning id into t1;
select client_id, project_id into c_so, p_equ from public.timesheet_entries where id=t1;
perform pg_temp.ok(c_so is not null and p_equ is not null,'cliente e progetto si ricavano dalla WBS, non si scrivono a mano');
select count(*) into n from public.timesheet_entries e join public.wbs_items w on w.id=e.wbs_id
  join public.projects p on p.id=w.project_id where e.id=t1 and p.code='SO-2026-001-EQU';
perform pg_temp.ok(n=1,'la registrazione risale a progetto e commessa per relazione');

insert into public.timesheet_entries(user_id,entry_date,wbs_id,hours,daily_rate_snapshot,standard_hours_snapshot)
  values (u1,'2026-03-03',w20,24,480,8) returning id into t2;
insert into public.timesheet_entries(user_id,entry_date,wbs_id,hours,daily_rate_snapshot,standard_hours_snapshot)
  values (u1,'2026-03-04',w90,16,480,8) returning id into t3;

update public.wbs_items set status='closed' where id=w15;
begin
  insert into public.timesheet_entries(user_id,entry_date,wbs_id,hours) values (u1,'2026-03-05',w15,8);
  perform pg_temp.ok(false,'una WBS chiusa non accetta nuove registrazioni');
exception when others then
  perform pg_temp.ok(true,'una WBS chiusa non accetta nuove registrazioni');
end;
select count(*) into n from public.wbs_items where id=w15;
perform pg_temp.ok(n=1,'ma la WBS chiusa resta visibile nello storico');

raise notice '';
raise notice '=== E. Immutabilita'' dei codici usati ===';
begin
  update public.wbs_items set activity_code='11' where id=w10;
  perform pg_temp.ok(false,'il codice di una WBS gia'' usata non si puo'' cambiare');
exception when others then
  perform pg_temp.ok(true,'il codice di una WBS gia'' usata non si puo'' cambiare');
end;
update public.wbs_items set name='PM e coordinamento' where id=w10;
select name into v from public.wbs_items where id=w10;
perform pg_temp.ok(v='PM e coordinamento','ma la descrizione si aggiorna',v);
begin
  update public.clients set code='SX' where id in (select client_id from public.engagements where id=e1);
  perform pg_temp.ok(false,'il codice di un cliente con commesse non si puo'' cambiare');
exception when others then
  perform pg_temp.ok(true,'il codice di un cliente con commesse non si puo'' cambiare');
end;

raise notice '';
raise notice '=== F. Fatturazione aggregata per progetto ===';
insert into public.billing_headers(user_id,year,month,client_id,status)
  select u1,2026,3,client_id,'draft' from public.engagements where id=e1 returning id into hdr;
select p.id into p_equ from public.projects p where p.code='SO-2026-001-EQU';
insert into public.billing_lines(user_id,billing_header_id,client_id,engagement_id,project_id,line_type,
   description,period_from,period_to,quantity,unit,unit_rate,amount,
   snapshot_project_code,snapshot_engagement_code,snapshot_invoice_reference)
  select u1,hdr,e.client_id,e1,p_equ,'daily_rate_8h','Attivita'' EQUANS marzo 2026','2026-03-01','2026-03-31',
         7,'day',480,3360,'SO-2026-001-EQU','SO-2026-001','LI_202601_Giovanni_Brucculeri'
  from public.engagements e where e.id=e1 returning id into bl;
-- le tre WBS confluiscono in UNA riga di progetto
insert into public.invoice_line_allocations(user_id,billing_line_id,source_table,source_id,wbs_id,quantity,amount)
 values (u1,bl,'timesheet_entries',t1,w10,32,1920),
        (u1,bl,'timesheet_entries',t2,w20,24,1440);
select count(*) into n from public.billing_lines where billing_header_id=hdr;
perform pg_temp.ok(n=1,'piu'' WBS producono una sola riga di fattura di progetto',n||' riga');
select count(*) into n from public.billing_lines where billing_header_id=hdr and project_id is null;
perform pg_temp.ok(n=0,'ogni riga di fattura punta a un progetto');
select count(distinct wbs_id) into n from public.invoice_line_allocations where billing_line_id=bl;
perform pg_temp.ok(n=2,'ma resta tracciato da quali WBS arriva la quantita''',n||' WBS');

begin
  insert into public.invoice_line_allocations(user_id,billing_line_id,source_table,source_id,wbs_id,quantity,amount)
    values (u1,bl,'timesheet_entries',t1,w10,1,60);
  perform pg_temp.ok(false,'la stessa registrazione non si puo'' fatturare due volte');
exception when others then
  perform pg_temp.ok(true,'la stessa registrazione non si puo'' fatturare due volte');
end;

-- fatturazione parziale: 8 delle 16 ore della WBS 90
insert into public.billing_lines(user_id,billing_header_id,client_id,engagement_id,project_id,line_type,description,quantity,unit,unit_rate,amount)
  select u1,hdr,e.client_id,e1,p_equ,'daily_rate_8h','Residuo',1,'day',480,480 from public.engagements e where e.id=e1 returning id into bl;
insert into public.invoice_line_allocations(user_id,billing_line_id,source_table,source_id,wbs_id,quantity,amount)
  values (u1,bl,'timesheet_entries',t3,w90,8,480);
perform pg_temp.ok(public.totime_allocated_qty('timesheet_entries',t3)=8,'si puo'' fatturare parzialmente una registrazione',
  public.totime_allocated_qty('timesheet_entries',t3)||' di 16 ore');
begin
  insert into public.invoice_line_allocations(user_id,billing_line_id,source_table,source_id,wbs_id,quantity,amount)
    values (u1,bl,'timesheet_entries',t3,w90,9,540);
  perform pg_temp.ok(false,'ma non oltre la quantita'' registrata');
exception when others then
  perform pg_temp.ok(true,'ma non oltre la quantita'' registrata');
end;

raise notice '';
raise notice '=== G. Snapshot: lo storico non cambia ===';
update public.projects set sell_rate=600, name='EQUANS rinominato' where id=p_equ;
update public.engagements set invoice_reference='LI_NUOVO' where id=e1;
select snapshot_project_code||' / '||snapshot_invoice_reference into v
  from public.billing_lines where billing_header_id=hdr and snapshot_project_code is not null limit 1;
perform pg_temp.ok(v='SO-2026-001-EQU / LI_202601_Giovanni_Brucculeri',
  'cambiare tariffa, nome e riferimento non tocca la fattura gia'' emessa',v);
end $$;
