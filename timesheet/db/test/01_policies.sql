-- =====================================================================
-- Prove sulle policy. Girano su un Postgres locale con lo shim caricato.
-- Ogni prova impersona un utente reale: nessuna gira come superutente,
-- che scavalcherebbe le policy e renderebbe il test inutile.
-- =====================================================================
\set ON_ERROR_STOP on

\set TIT_A  '11111111-1111-1111-1111-111111111111'
\set COL_A  '22222222-2222-2222-2222-222222222222'
\set AMM_A  '33333333-3333-3333-3333-333333333333'
\set RES_A  '44444444-4444-4444-4444-444444444444'
\set TIT_B  '55555555-5555-5555-5555-555555555555'
\set COL2_A '66666666-6666-6666-6666-666666666666'

-- ---------------------------------------------------------------------
-- Fixture: due studi distinti, creati dai rispettivi titolari
-- ---------------------------------------------------------------------
select public.login(:'TIT_A');
set role authenticated;
select public.create_org('Studio Alfa', 'alfa', 'tit@alfa.it') as org_a \gset
reset role;

select public.login(:'TIT_B');
set role authenticated;
select public.create_org('Studio Beta', 'beta', 'tit@beta.it') as org_b \gset
reset role;

select set_config('t.org_a',  :'org_a', false);
select set_config('t.org_b',  :'org_b', false);
select set_config('t.col_a',  :'COL_A', false);
select set_config('t.col2_a', :'COL2_A', false);
select set_config('t.res_a',  :'RES_A', false);

-- Anagrafiche, tariffe, costi e inviti: li predispone il titolare di Alfa
select public.login(:'TIT_A');
set role authenticated;

insert into public.clients (org_id, name, city, standard_hours)
values (:'org_a', 'Equans', 'Milano', 8) returning id as client_a \gset
insert into public.projects (org_id, client_id, name)
values (:'org_a', :'client_a', 'Progetto Beta') returning id as proj_b \gset
insert into public.projects (org_id, client_id, name)
values (:'org_a', :'client_a', 'Progetto Gamma') returning id as proj_g \gset
insert into public.activities (org_id, name)
values (:'org_a', 'Analisi') returning id as act_a \gset

-- Tariffa storicizzata: 400 fino a giugno, 500 dal 1º luglio
insert into public.client_rates (org_id, client_id, daily_rate, valid_from)
values (:'org_a', :'client_a', 400, date '2000-01-01'),
       (:'org_a', :'client_a', 500, date '2026-07-01');

insert into public.member_costs (org_id, user_id, cost_daily_rate)
values (:'org_a', :'COL_A', 240), (:'org_a', :'COL2_A', 240);

insert into public.memberships (org_id, email, role_id, status, full_name)
select :'org_a', 'col@alfa.it', id, 'invited', 'Collaboratore Uno'
  from public.roles where org_id = :'org_a' and code = 'collaboratore';
insert into public.memberships (org_id, email, role_id, status, full_name)
select :'org_a', 'col2@alfa.it', id, 'invited', 'Collaboratore Due'
  from public.roles where org_id = :'org_a' and code = 'collaboratore';
insert into public.memberships (org_id, email, role_id, status, full_name)
select :'org_a', 'amm@alfa.it', id, 'invited', 'Amministrazione'
  from public.roles where org_id = :'org_a' and code = 'amministrazione';
insert into public.memberships (org_id, email, role_id, status, full_name)
select :'org_a', 'res@alfa.it', id, 'invited', 'Responsabile'
  from public.roles where org_id = :'org_a' and code = 'responsabile';

-- Il responsabile segue solo il Progetto Beta
insert into public.project_members (org_id, project_id, user_id)
values (:'org_a', :'proj_b', :'RES_A');
reset role;

select set_config('t.client_a', :'client_a', false);
select set_config('t.proj_b',   :'proj_b',   false);
select set_config('t.proj_g',   :'proj_g',   false);
select set_config('t.act_a',    :'act_a',    false);

-- Accettazione degli inviti
select public.login(:'COL_A');  set role authenticated; select public.accept_invite('col@alfa.it')  as a \gset
reset role;
select public.login(:'COL2_A'); set role authenticated; select public.accept_invite('col2@alfa.it') as b \gset
reset role;
select public.login(:'AMM_A');  set role authenticated; select public.accept_invite('amm@alfa.it')  as c \gset
reset role;
select public.login(:'RES_A');  set role authenticated; select public.accept_invite('res@alfa.it')  as d \gset
reset role;

select public.chk('0. Inviti', :'a'::int = 1, 'il collaboratore accetta l''invito e diventa attivo');
select public.chk('0. Inviti', :'c'::int = 1, 'l''amministrazione accetta l''invito');

-- ---------------------------------------------------------------------
-- A. Inserimento ore da parte dei collaboratori
-- ---------------------------------------------------------------------
select public.login(:'COL_A');
set role authenticated;
do $$
begin
  insert into public.timesheet_entries (org_id, user_id, entry_date, client_id, project_id, activity_id, hours)
  values (current_setting('t.org_a')::uuid, auth.uid(), date '2026-06-10',
          current_setting('t.client_a')::uuid, current_setting('t.proj_b')::uuid,
          current_setting('t.act_a')::uuid, 8);
  insert into public.timesheet_entries (org_id, user_id, entry_date, client_id, project_id, hours)
  values (current_setting('t.org_a')::uuid, auth.uid(), date '2026-07-10',
          current_setting('t.client_a')::uuid, current_setting('t.proj_b')::uuid, 8);
  insert into public.timesheet_entries (org_id, user_id, entry_date, client_id, project_id, hours)
  values (current_setting('t.org_a')::uuid, auth.uid(), date '2026-07-11',
          current_setting('t.client_a')::uuid, current_setting('t.proj_g')::uuid, 4);
  perform public.chk('A. Ore', true, 'il collaboratore inserisce le proprie ore');

  begin
    insert into public.timesheet_entries (org_id, user_id, entry_date, client_id, hours)
    values (current_setting('t.org_a')::uuid, '99999999-9999-9999-9999-999999999999',
            date '2026-07-12', current_setting('t.client_a')::uuid, 3);
    perform public.chk('A. Ore', false, 'non può registrare ore a nome di un altro');
  exception when others then
    perform public.chk('A. Ore', true, 'non può registrare ore a nome di un altro');
  end;

  begin
    insert into public.timesheet_entries (org_id, user_id, entry_date, client_id, hours)
    values (current_setting('t.org_b')::uuid, auth.uid(), date '2026-07-12', null, 3);
    perform public.chk('A. Ore', false, 'non può scrivere ore in un altro studio');
  exception when others then
    perform public.chk('A. Ore', true, 'non può scrivere ore in un altro studio');
  end;
end $$;
reset role;

select public.login(:'COL2_A');
set role authenticated;
do $$
begin
  insert into public.timesheet_entries (org_id, user_id, entry_date, client_id, project_id, hours)
  values (current_setting('t.org_a')::uuid, auth.uid(), date '2026-07-10',
          current_setting('t.client_a')::uuid, current_setting('t.proj_b')::uuid, 6);
end $$;
reset role;

-- ---------------------------------------------------------------------
-- B. Il collaboratore e i soldi: non deve arrivarci nemmeno provandoci
-- ---------------------------------------------------------------------
select public.login(:'COL_A');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.client_rates;
  perform public.chk('B. Soldi', n = 0, 'non legge le tariffe cliente', 'righe viste: '||n);

  select count(*) into n from public.member_costs;
  perform public.chk('B. Soldi', n = 0, 'non legge i costi dei collaboratori', 'righe viste: '||n);

  select count(*) into n from public.entry_revenue;
  perform public.chk('B. Soldi', n = 0, 'non legge il ricavo delle proprie ore', 'righe viste: '||n);

  select count(*) into n from public.entry_cost;
  perform public.chk('B. Soldi', n = 0, 'non legge il costo delle proprie ore', 'righe viste: '||n);

  begin
    insert into public.client_rates (org_id, client_id, daily_rate)
    values (current_setting('t.org_a')::uuid, current_setting('t.client_a')::uuid, 999);
    perform public.chk('B. Soldi', false, 'non può crearsi una tariffa');
  exception when others then
    perform public.chk('B. Soldi', true, 'non può crearsi una tariffa');
  end;

  select count(*) into n from public.clients;
  perform public.chk('B. Soldi', n = 1, 'vede però l''anagrafica del cliente', 'righe viste: '||n);
end $$;
reset role;

-- ---------------------------------------------------------------------
-- C. Chi vede le ore di chi
-- ---------------------------------------------------------------------
select public.login(:'COL_A');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.timesheet_entries;
  perform public.chk('C. Visibilità', n = 3, 'il collaboratore vede solo le proprie 3 righe', 'viste: '||n);
end $$;
reset role;

select public.login(:'TIT_A');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.timesheet_entries;
  perform public.chk('C. Visibilità', n = 4, 'il titolare vede tutte e 4 le righe dello studio', 'viste: '||n);
end $$;
reset role;

select public.login(:'RES_A');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.timesheet_entries;
  perform public.chk('C. Visibilità', n = 3, 'il responsabile vede solo le ore del progetto che segue', 'viste: '||n);
  select count(*) into n from public.client_rates;
  perform public.chk('C. Visibilità', n = 0, 'il responsabile non vede le tariffe', 'viste: '||n);
end $$;
reset role;

-- ---------------------------------------------------------------------
-- D. L'amministrazione vede i ricavi ma non i costi
-- ---------------------------------------------------------------------
select public.login(:'AMM_A');
set role authenticated;
do $$
declare n int; v numeric;
begin
  select count(*) into n from public.entry_revenue;
  perform public.chk('D. Amministrazione', n = 4, 'vede il ricavo di tutte le ore', 'viste: '||n);

  select count(*) into n from public.entry_cost;
  perform public.chk('D. Amministrazione', n = 0, 'NON vede il costo dei collaboratori', 'viste: '||n);

  select count(*) into n from public.member_costs;
  perform public.chk('D. Amministrazione', n = 0, 'NON vede la tabella dei costi', 'viste: '||n);

  select count(*) into n from public.client_rates;
  perform public.chk('D. Amministrazione', n = 2, 'vede invece le tariffe cliente', 'viste: '||n);
end $$;
reset role;

-- ---------------------------------------------------------------------
-- E. Valorizzazione automatica con tariffa storicizzata
-- ---------------------------------------------------------------------
select public.login(:'TIT_A');
set role authenticated;
do $$
declare v_giu numeric; v_lug numeric; v_cost numeric;
begin
  select r.amount into v_giu from public.entry_revenue r
    join public.timesheet_entries e on e.id = r.entry_id
   where e.entry_date = date '2026-06-10';
  perform public.chk('E. Valorizzazione', v_giu = 400,
    'le ore di giugno usano la tariffa vecchia (400)', 'calcolato: '||coalesce(v_giu::text,'null'));

  select r.amount into v_lug from public.entry_revenue r
    join public.timesheet_entries e on e.id = r.entry_id
   where e.entry_date = date '2026-07-10' and e.hours = 8;
  perform public.chk('E. Valorizzazione', v_lug = 500,
    'le ore di luglio usano la tariffa nuova (500)', 'calcolato: '||coalesce(v_lug::text,'null'));

  select c.amount into v_cost from public.entry_cost c
    join public.timesheet_entries e on e.id = c.entry_id
   where e.entry_date = date '2026-06-10';
  perform public.chk('E. Valorizzazione', v_cost = 240,
    'il costo segue il costo del collaboratore (240)', 'calcolato: '||coalesce(v_cost::text,'null'));

  perform public.chk('E. Valorizzazione', (v_lug - v_cost) = 260,
    'il margine della giornata di luglio è 260', 'calcolato: '||coalesce((v_lug-v_cost)::text,'null'));
end $$;
reset role;

-- ---------------------------------------------------------------------
-- F. Isolamento fra studi diversi
-- ---------------------------------------------------------------------
select public.login(:'TIT_B');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.timesheet_entries;
  perform public.chk('F. Isolamento', n = 0, 'il titolare di un altro studio non vede nessuna ora', 'viste: '||n);
  select count(*) into n from public.clients;
  perform public.chk('F. Isolamento', n = 0, 'né i clienti', 'visti: '||n);
  select count(*) into n from public.client_rates;
  perform public.chk('F. Isolamento', n = 0, 'né le tariffe', 'viste: '||n);
  select count(*) into n from public.memberships;
  perform public.chk('F. Isolamento', n = 1, 'vede solo la propria iscrizione', 'viste: '||n);
  select count(*) into n from public.organizations;
  perform public.chk('F. Isolamento', n = 1, 'e solo il proprio studio', 'visti: '||n);
end $$;
reset role;

-- ---------------------------------------------------------------------
-- G. Chiusura del mese
-- ---------------------------------------------------------------------
select public.login(:'TIT_A');
set role authenticated;
do $$
begin
  insert into public.period_locks (org_id, year, month, locked_by)
  values (current_setting('t.org_a')::uuid, 2026, 7, auth.uid());
  perform public.chk('G. Blocco mese', true, 'il titolare chiude luglio 2026');
end $$;
reset role;

select public.login(:'COL_A');
set role authenticated;
do $$
declare n int;
begin
  begin
    insert into public.timesheet_entries (org_id, user_id, entry_date, client_id, hours)
    values (current_setting('t.org_a')::uuid, auth.uid(), date '2026-07-20',
            current_setting('t.client_a')::uuid, 4);
    perform public.chk('G. Blocco mese', false, 'il collaboratore non può più inserire ore a luglio');
  exception when others then
    perform public.chk('G. Blocco mese', true, 'il collaboratore non può più inserire ore a luglio', sqlerrm);
  end;

  begin
    delete from public.timesheet_entries where entry_date = date '2026-07-10' and user_id = auth.uid();
    perform public.chk('G. Blocco mese', false, 'né cancellare quelle già inserite');
  exception when others then
    perform public.chk('G. Blocco mese', true, 'né cancellare quelle già inserite');
  end;

  begin
    insert into public.timesheet_entries (org_id, user_id, entry_date, client_id, hours)
    values (current_setting('t.org_a')::uuid, auth.uid(), date '2026-08-03',
            current_setting('t.client_a')::uuid, 4);
    perform public.chk('G. Blocco mese', true, 'ma agosto resta aperto');
  exception when others then
    perform public.chk('G. Blocco mese', false, 'ma agosto resta aperto', sqlerrm);
  end;

  select count(*) into n from public.period_locks;
  perform public.chk('G. Blocco mese', n = 1, 'il collaboratore vede che il mese è chiuso', 'viste: '||n);
end $$;
reset role;

select public.login(:'TIT_A');
set role authenticated;
do $$
begin
  begin
    insert into public.timesheet_entries (org_id, user_id, entry_date, client_id, hours)
    values (current_setting('t.org_a')::uuid, auth.uid(), date '2026-07-21',
            current_setting('t.client_a')::uuid, 2);
    perform public.chk('G. Blocco mese', true, 'il titolare può ancora correggere un mese chiuso');
  exception when others then
    perform public.chk('G. Blocco mese', false, 'il titolare può ancora correggere un mese chiuso', sqlerrm);
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- H. Gestione delle persone
-- ---------------------------------------------------------------------
select public.login(:'COL_A');
set role authenticated;
do $$
declare n int;
begin
  begin
    update public.memberships set role_id = (select id from public.roles
      where org_id = current_setting('t.org_a')::uuid and code = 'titolare')
     where user_id = auth.uid();
    get diagnostics n = row_count;
    perform public.chk('H. Persone', n = 0, 'il collaboratore non può promuoversi da solo', 'righe toccate: '||n);
  exception when others then
    perform public.chk('H. Persone', true, 'il collaboratore non può promuoversi da solo');
  end;

  select count(*) into n from public.memberships;
  perform public.chk('H. Persone', n = 5, 'vede i colleghi dello studio', 'visti: '||n);
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Esito
-- ---------------------------------------------------------------------
\echo ''
select section,
       case when passed then '  OK  ' else '  KO  ' end as esito,
       label,
       coalesce(nullif(detail,''), '') as dettaglio
  from public.test_results order by id;

\echo ''
select count(*) filter (where passed)       as superate,
       count(*) filter (where not passed)   as fallite,
       count(*)                             as totali
  from public.test_results;

select case when count(*) = 0 then 'TUTTE LE PROVE SUPERATE'
            else count(*)||' PROVE FALLITE' end as esito_finale
  from public.test_results where not passed;
