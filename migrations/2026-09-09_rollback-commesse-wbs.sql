-- ============================================================
-- Migrazione TOTIME — 2026-09-09 (rollback)
--
-- Riporta il database com'era prima di commesse e WBS.
-- I dati originali NON vengono toccati: consuntivi, spese, clienti,
-- progetti e fatture restano tutti. Si sganciano soltanto i
-- collegamenti nuovi e si eliminano le entita' nuove.
--
-- Da usare solo se qualcosa e' andato storto. Sicuro da rilanciare.
-- ============================================================

begin;

-- 0) Si spengono i blocchi di immutabilita': servono a proteggere i
--    codici durante l'uso normale, ma qui stiamo proprio smontando.
alter table public.projects    disable trigger projects_code_lock_trg;
alter table public.engagements disable trigger engagements_code_lock_trg;
alter table public.wbs_items   disable trigger wbs_items_code_lock_trg;
alter table public.clients     disable trigger clients_code_lock_trg;

-- 1) Sgancia le registrazioni dalle WBS (le registrazioni restano)
alter table public.timesheet_entries disable trigger timesheet_entries_wbs_trg;
alter table public.manual_entries    disable trigger manual_entries_wbs_trg;
alter table public.travel_expenses   disable trigger travel_expenses_wbs_trg;
update public.timesheet_entries set wbs_id = null where wbs_id is not null;
update public.manual_entries    set wbs_id = null where wbs_id is not null;
update public.travel_expenses   set wbs_id = null where wbs_id is not null;

-- 2) Sgancia i progetti dalle commesse (i progetti restano)
update public.projects set engagement_id = null, short_code = null, code = null
where engagement_id is not null;

-- 3) Elimina soltanto quello che ha creato la migrazione
delete from public.invoice_line_allocations;
delete from public.billing_lines where project_id is not null or engagement_id is not null;
delete from public.wbs_items;
delete from public.engagement_references;
delete from public.engagements;
delete from public.engagement_counters;

-- 4) Toglie i codici cliente assegnati dal backfill
--    (se ne avevi assegnati a mano prima, li perdi: annotali)
update public.clients set code = null where code is not null;

-- Si riaccendono i blocchi
alter table public.projects    enable trigger projects_code_lock_trg;
alter table public.engagements enable trigger engagements_code_lock_trg;
alter table public.wbs_items   enable trigger wbs_items_code_lock_trg;
alter table public.clients     enable trigger clients_code_lock_trg;

commit;

-- 5) Facoltativo: rimuove anche le strutture.
--    Lasciato commentato di proposito: le tabelle vuote non danno
--    fastidio, e tenerle permette di riprovare senza rifare tutto.
--
-- drop trigger if exists timesheet_entries_wbs_trg on public.timesheet_entries;
-- drop trigger if exists manual_entries_wbs_trg on public.manual_entries;
-- drop trigger if exists travel_expenses_wbs_trg on public.travel_expenses;
-- drop table if exists public.invoice_line_allocations;
-- drop table if exists public.wbs_items;
-- drop table if exists public.engagement_references;
-- drop table if exists public.engagements;
-- drop table if exists public.engagement_counters;
-- alter table public.timesheet_entries drop column if exists wbs_id;
-- alter table public.manual_entries   drop column if exists wbs_id;
-- alter table public.travel_expenses  drop column if exists wbs_id;

select 'stato dopo il rollback' as sezione,
       (select count(*) from public.timesheet_entries) as consuntivi_intatti,
       (select count(*) from public.projects) as progetti_intatti,
       (select count(*) from public.clients) as clienti_intatti,
       (select count(*) from public.engagements) as commesse_rimaste,
       (select count(*) from public.wbs_items) as wbs_rimaste;
