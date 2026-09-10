-- La correzione delle policy RLS sulle tabelle storiche.
--
-- Il punto delicato: le policy vere non sono mai state scritte in
-- questo repository, sono nate a mano in Supabase. Lo script quindi
-- non puo' fare finta di sapere come si chiamano ne' che condizione
-- hanno. Qui gliene mettiamo davanti apposta di scomode — un nome
-- fuori convenzione, una condizione piu' stretta del solito, una
-- restrittiva, una gia' corretta, una che auth.uid() non lo nomina
-- proprio — e verifichiamo due cose ben distinte:
--   1. che dopo non resti niente da correggere;
--   2. che CHI VEDE COSA non sia cambiato di una riga.
-- La seconda e' quella che conta: un'ottimizzazione che cambia la
-- visibilita' dei dati non e' un'ottimizzazione, e' una falla.
create or replace function pg_temp.ok(cond boolean, label text, extra text default '')
returns void language plpgsql as $$
begin
  raise notice '%', (case when cond then '  OK  ' else '  KO  ' end) || label ||
    (case when extra <> '' then '  -> ' || extra else '' end);
end $$;

create table public.note_riservate(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  testo text,
  archiviata boolean not null default false);
alter table public.note_riservate enable row level security;
grant all on public.note_riservate to authenticated;

-- nome fuori convenzione + condizione PIU' STRETTA del solito: oltre
-- al proprietario esclude le archiviate. Se lo script "normalizzasse"
-- le policy a modo suo, questa stretta sparirebbe e l'utente
-- comincerebbe a vedere righe che prima non vedeva.
create policy "leggi solo le mie non archiviate" on public.note_riservate
  for select to authenticated using (auth.uid() = user_id and archiviata = false);
-- auth.uid() nominato due volte nella stessa condizione
create policy scrivi_mie on public.note_riservate
  for insert to authenticated with check (auth.uid() = user_id and auth.uid() is not null);
-- restrittiva: si somma alle altre invece di sostituirle
create policy mai_testo_vuoto on public.note_riservate
  as restrictive for insert to authenticated with check (coalesce(testo,'') <> '');
-- gia' corretta: non va toccata
create policy gia_veloce on public.note_riservate
  for delete to authenticated using ((select auth.uid()) = user_id);
-- non nomina auth.uid(): non va nemmeno guardata
create policy niente_auth on public.note_riservate
  for update to authenticated using (archiviata = false);

insert into auth.users(id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222') on conflict do nothing;
insert into public.note_riservate(user_id, testo, archiviata) values
  ('11111111-1111-1111-1111-111111111111','mia viva',       false),
  ('11111111-1111-1111-1111-111111111111','mia archiviata', true),
  ('22222222-2222-2222-2222-222222222222','altrui viva',    false);

create temp table def_prima as
  select policyname, permissive, roles::text as roles, cmd, qual, with_check
  from pg_policies where schemaname='public' and tablename='note_riservate';

-- fotografia di cosa vede DAVVERO l'utente 1, non di cosa dovrebbe
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
create temp table vista_prima as select testo from public.note_riservate;
reset role; reset request.jwt.claim.sub;

\i /home/user/To-Time/migrations/2026-09-10_advisor-fix-3-rls-tabelle-storiche.sql

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
create temp table vista_dopo as select testo from public.note_riservate;
reset role; reset request.jwt.claim.sub;

create temp table def_dopo as
  select policyname, permissive, roles::text as roles, cmd, qual, with_check
  from pg_policies where schemaname='public' and tablename='note_riservate';

do $$
declare n int; s text;
begin
raise notice '';
raise notice '=== M. Policy storiche: piu'' veloci senza cambiare significato ===';

select count(*) into n from pg_policies where schemaname='public'
  and ((coalesce(qual,'')       ~* 'auth\.uid\(\)' and coalesce(qual,'')       !~* 'select\s+auth\.uid\(\)')
    or (coalesce(with_check,'') ~* 'auth\.uid\(\)' and coalesce(with_check,'') !~* 'select\s+auth\.uid\(\)'));
perform pg_temp.ok(n=0,'non resta nessuna policy che rivaluta auth.uid() per riga',n||' rimaste');

-- la prova che conta davvero
select count(*) into n from (
  (select testo from vista_prima except all select testo from vista_dopo)
  union all
  (select testo from vista_dopo except all select testo from vista_prima)) d;
select string_agg(testo,' + ' order by testo) into s from vista_dopo;
perform pg_temp.ok(n=0,'l''utente vede esattamente le stesse righe di prima',coalesce(s,'nessuna'));

select count(*) into n from vista_dopo;
perform pg_temp.ok(n=1,'la condizione stretta e'' sopravvissuta: l''archiviata resta nascosta',
                   n||' riga visibile sulle 3 esistenti');

select count(*) into n from (
  (select policyname,permissive,roles,cmd from def_prima
   except select policyname,permissive,roles,cmd from def_dopo)
  union all
  (select policyname,permissive,roles,cmd from def_dopo
   except select policyname,permissive,roles,cmd from def_prima)) d;
perform pg_temp.ok(n=0,'nomi, comandi, ruoli e permissiva/restrittiva invariati',n||' differenze');

-- l'unica differenza ammessa fra le condizioni e' il (select ...)
select count(*) into n from def_prima a join def_dopo b using (policyname)
where regexp_replace(coalesce(a.qual,'')||'|'||coalesce(a.with_check,''),'\s|\(|\)|select|as uid','','gi')
   <> regexp_replace(coalesce(b.qual,'')||'|'||coalesce(b.with_check,''),'\s|\(|\)|select|as uid','','gi');
perform pg_temp.ok(n=0,'le condizioni cambiano solo per il (select auth.uid())',n||' differenze di sostanza');

select count(*) into n from def_prima a join def_dopo b using (policyname)
where a.policyname in ('gia_veloce','niente_auth')
  and coalesce(a.qual,'')=coalesce(b.qual,'') and coalesce(a.with_check,'')=coalesce(b.with_check,'');
perform pg_temp.ok(n=2,'la policy gia'' corretta e quella senza auth.uid() sono intatte',n||' su 2');
end $$;

-- Il comportamento in scrittura, provato da utente vero
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare n int;
begin
  begin
    insert into public.note_riservate(user_id,testo) values ('11111111-1111-1111-1111-111111111111','');
    perform pg_temp.ok(false,'la policy restrittiva blocca ancora il testo vuoto');
  exception when others then perform pg_temp.ok(true,'la policy restrittiva blocca ancora il testo vuoto');
  end;
  begin
    insert into public.note_riservate(user_id,testo) values ('22222222-2222-2222-2222-222222222222','intrusa');
    perform pg_temp.ok(false,'scrivere a nome di un altro utente resta vietato');
  exception when others then perform pg_temp.ok(true,'scrivere a nome di un altro utente resta vietato');
  end;
  insert into public.note_riservate(user_id,testo) values ('11111111-1111-1111-1111-111111111111','nuova');
  select count(*) into n from public.note_riservate where testo='nuova';
  perform pg_temp.ok(n=1,'ma l''inserimento legittimo passa',n||' riga');
end $$;
reset role; reset request.jwt.claim.sub;

-- rilanciarlo non deve gonfiare le condizioni
\i /home/user/To-Time/migrations/2026-09-10_advisor-fix-3-rls-tabelle-storiche.sql
do $$
declare n int;
begin
  select count(*) into n from pg_policies where schemaname='public'
    and (coalesce(qual,'')||coalesce(with_check,'')) ~* 'select\s+\(\s*select\s+auth\.uid';
  perform pg_temp.ok(n=0,'rilanciarlo non annida (select (select ...))',n||' annidate');
end $$;
