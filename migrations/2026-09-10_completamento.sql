-- ============================================================
-- Migrazione TOTIME — 2026-09-10 (completamento)
--
-- Chiude quello che resta, in un colpo solo e senza doversi ricordare
-- cosa e' gia' stato lanciato: ogni passo controlla prima se serve.
-- Sicura da rilanciare quante volte si vuole.
--
-- 1. correzione delle policy segnalate dal Performance Advisor
-- 2. bonifica delle spese ancora senza WBS
-- 3. obbligo della WBS sulle nuove registrazioni
-- ============================================================

-- ------------------------------------------------------------
-- 1. Policy: auth.uid() valutato una volta per query, non per riga
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['engagements','engagement_references','wbs_items',
                           'engagement_counters','billing_lines','invoice_line_allocations']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t||'_select_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_insert_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t||'_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_update_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t||'_update_own', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t||'_delete_own', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Spese ancora senza WBS: una WBS "Trasferte e spese" per
--    progetto, non fatturabile. Le spese non vengono toccate in
--    nessun altro campo.
-- ------------------------------------------------------------
do $$
declare r record; v_code text;
begin
  for r in
    select distinct p.id as project_id, p.user_id
    from public.travel_expenses x
    join public.projects p on p.id = x.project_id
    where x.wbs_id is null and p.engagement_id is not null
  loop
    if exists(select 1 from public.wbs_items w where w.project_id = r.project_id and w.kind = 'travel') then
      continue;
    end if;
    v_code := '90';
    while exists(select 1 from public.wbs_items where project_id = r.project_id and activity_code = v_code) loop
      v_code := (v_code::int + 10)::text;
    end loop;
    insert into public.wbs_items(user_id, project_id, activity_code, name, kind, billable, status, sort_order, notes)
    values (r.user_id, r.project_id, v_code, 'Trasferte e spese', 'travel', false, 'active', v_code::int, 'bonifica-spese');
  end loop;
end $$;

-- Il collegamento va fatto con il controllo di coerenza disattivato:
-- il trigger rifiuta gli aggiornamenti massivi anche quando la WBS e'
-- quella giusta. Se il trigger non c'e' (migrazione principale non
-- ancora lanciata) il blocco si limita a saltare la disattivazione,
-- invece di interrompere tutto lo script.
do $$
declare v_trg boolean := exists(
  select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relname = 'travel_expenses' and t.tgname = 'travel_expenses_wbs_trg');
begin
  if v_trg then alter table public.travel_expenses disable trigger travel_expenses_wbs_trg; end if;
  update public.travel_expenses x set wbs_id = w.id
  from public.wbs_items w
  where x.wbs_id is null and w.project_id = x.project_id and w.kind = 'travel';
  if v_trg then alter table public.travel_expenses enable trigger travel_expenses_wbs_trg; end if;
end $$;

-- ------------------------------------------------------------
-- 3. La WBS diventa obbligatoria — ma non con un NOT NULL.
--
--    Un NOT NULL sulla colonna sembrerebbe la scelta ovvia ed e'
--    invece sbagliata: renderebbe impossibile registrare per un
--    cliente che non ha ancora commesse, e l'applicazione smetterebbe
--    di funzionare il giorno che si aggiunge un cliente nuovo prima
--    di avergli aperto la commessa.
--
--    La regola giusta e' piu' precisa: se il cliente HA delle
--    commesse, la WBS e' obbligatoria. Se non ne ha, si registra
--    come si e' sempre fatto. E' l'eccezione prevista, ed e' qui
--    documentata.
-- ------------------------------------------------------------
create or replace function public.totime_richiedi_wbs()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.wbs_id is not null then return new; end if;
  if new.client_id is not null
     and exists(select 1 from public.engagements e
                where e.client_id = new.client_id
                  and e.status in ('draft','active')) then
    raise exception 'Questo cliente ha delle commesse: la registrazione va collegata a una WBS';
  end if;
  return new;
end $$;

drop trigger if exists timesheet_entries_richiedi_wbs on public.timesheet_entries;
create trigger timesheet_entries_richiedi_wbs before insert on public.timesheet_entries
for each row execute function public.totime_richiedi_wbs();
drop trigger if exists manual_entries_richiedi_wbs on public.manual_entries;
create trigger manual_entries_richiedi_wbs before insert on public.manual_entries
for each row execute function public.totime_richiedi_wbs();

-- Le spese restano fuori dall'obbligo: la WBS li' serve all'analisi,
-- non alla fatturazione, e una spesa puo' nascere prima di sapere su
-- che attivita' va imputata.

-- ------------------------------------------------------------
-- Esito
-- ------------------------------------------------------------
select 'policy che rivalutano auth.uid() per riga' as controllo, count(*)::text as valore, 'deve essere 0' as atteso
from pg_policies where schemaname='public'
  and tablename in ('engagements','engagement_references','wbs_items','engagement_counters','billing_lines','invoice_line_allocations')
  and ((coalesce(qual,'') ~* 'auth\.uid\(\)' and coalesce(qual,'') !~* 'select auth\.uid\(\)')
    or (coalesce(with_check,'') ~* 'auth\.uid\(\)' and coalesce(with_check,'') !~* 'select auth\.uid\(\)'))
union all
select 'spese ancora senza WBS', count(*)::text, '0 se tutte hanno un progetto'
from public.travel_expenses where wbs_id is null
union all
select 'consuntivi ancora senza WBS', count(*)::text, 'quelli senza progetto restano da sistemare a mano'
from public.timesheet_entries where wbs_id is null
union all
select 'obbligo WBS attivo', count(*)::text, 'deve essere 2'
from pg_trigger where tgname in ('timesheet_entries_richiedi_wbs','manual_entries_richiedi_wbs');
