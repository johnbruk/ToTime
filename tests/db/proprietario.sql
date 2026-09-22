-- Creare una commessa DALL'APP, cioe' come utente autenticato con RLS
-- attiva e senza nominare il proprietario.
--
-- E' il punto in cui il modello nuovo si rompeva: l'app non scrive
-- user_id perche' sulle tabelle storiche lo mette il database, ma
-- sulle tabelle nuove quel default non c'era. Il NULL arrivava al
-- contatore del progressivo e la policy lo rifiutava, con un errore
-- che parlava di tutt'altra tabella.
create or replace function pg_temp.ok(cond boolean, label text, extra text default '')
returns void language plpgsql as $$
begin
  raise notice '%', (case when cond then '  OK  ' else '  KO  ' end) || label ||
    (case when extra <> '' then '  -> ' || extra else '' end);
end $$;

insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;
do $$ declare u uuid:='11111111-1111-1111-1111-111111111111'; c uuid; p uuid;
begin
  insert into public.clients(user_id,name,code,daily_rate,standard_hours) values (u,'Solution','SOL',480,8) returning id into c;
  insert into public.projects(user_id,client_id,short_code,name) values (u,c,'EQU','Equans') returning id into p;
end $$;

\echo ''
\echo '=== O. Il proprietario se lo mette il database ==='

-- nel banco di prova i permessi di tabella non sono quelli di
-- Supabase: si danno qui, cosi' il controllo che conta resta la RLS
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare p uuid; e uuid; w uuid; n int; v text;
begin
  select id into p from public.projects where short_code='EQU';

  -- come fa l'app: nessun user_id nel payload
  begin
    insert into public.engagements(client_id,project_id,year,name)
      select client_id,id,2026,'Contratto 2026' from public.projects where id=p
      returning id into e;
    perform pg_temp.ok(true,'una commessa si crea senza nominare il proprietario');
  exception when others then
    perform pg_temp.ok(false,'una commessa si crea senza nominare il proprietario',sqlerrm);
  end;

  if e is not null then
    select user_id::text into v from public.engagements where id=e;
    perform pg_temp.ok(v='11111111-1111-1111-1111-111111111111','e il proprietario e'' quello giusto',v);
    select code into v from public.engagements where id=e;
    perform pg_temp.ok(v='SOL-EQU-2026-001','col codice composto come si deve',coalesce(v,'nullo'));

    -- il contatore: e' li' che esplodeva
    select count(*) into n from public.engagement_counters;
    perform pg_temp.ok(n=1,'il contatore del progressivo si e'' scritto',n||' righe');
    select user_id::text into v from public.engagement_counters limit 1;
    perform pg_temp.ok(v='11111111-1111-1111-1111-111111111111','anche lui intestato all''utente giusto',coalesce(v,'NULLO'));

    -- e l'attivita', che l'app crea allo stesso modo
    begin
      insert into public.wbs_items(engagement_id,activity_code,name) values (e,'10','Equans') returning id into w;
      perform pg_temp.ok(true,'e un''attivita'' pure');
    exception when others then
      perform pg_temp.ok(false,'e un''attivita'' pure',sqlerrm);
    end;

    -- la seconda commessa deve prendere il 002
    insert into public.engagements(client_id,project_id,year,name)
      select client_id,id,2026,'Ordine aggiuntivo' from public.projects where id=p returning id into e;
    select code into v from public.engagements where id=e;
    perform pg_temp.ok(v='SOL-EQU-2026-002','e il progressivo avanza',coalesce(v,'nullo'));
  end if;
end $$;

reset role; reset request.jwt.claim.sub;
