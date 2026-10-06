-- ============================================================
-- Migrazione TOTIME — 2026-10-06 (d)
-- Le foto delle ricevute: bucket privato su Supabase Storage
--
-- ATTENZIONE: questa e' la SOLA migrazione della serie che aggiunge un
-- servizio nuovo. Supabase Storage non era usato da nessuna parte
-- nell'app. Per questo e' l'ultimo passo e sta da sola: se qualcosa non
-- va, si disattiva senza toccare il resto.
--
-- Cosa fa:
--   1) il bucket 'ricevute', PRIVATO (non pubblico: le ricevute sono
--      documenti fiscali, non immagini da mettere in giro)
--   2) le quattro policy RLS sugli oggetti, una per utente: ognuno vede
--      e scrive solo nella sua cartella
--   3) travel_expenses.receipt_path, il percorso del file nel bucket
--
-- La convenzione del percorso: <user_id>/<expense_id>/<nome file>
-- La prima cartella e' l'id dell'utente, ed e' su quella che le policy
-- decidono: senza questo, chiunque potrebbe leggere le ricevute altrui.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

begin;

-- 1) Il percorso del file sulla spesa
alter table public.travel_expenses
  add column if not exists receipt_path text;

-- 2) Il bucket, privato. 10 MB per file: una foto di uno scontrino
--    sta in meno di 2, e il limite evita di caricare un video per
--    sbaglio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ricevute','ricevute',false,10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update
   set public=false,
       file_size_limit=10485760,
       allowed_mime_types=array['image/jpeg','image/png','image/webp','image/heic','application/pdf'];

commit;

-- 3) Le policy sugli oggetti. La prima cartella del percorso deve
--    essere l'id di chi scrive o legge.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='ricevute_select_own') then
    create policy ricevute_select_own on storage.objects for select
      using (bucket_id='ricevute' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='ricevute_insert_own') then
    create policy ricevute_insert_own on storage.objects for insert
      with check (bucket_id='ricevute' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='ricevute_update_own') then
    create policy ricevute_update_own on storage.objects for update
      using (bucket_id='ricevute' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='ricevute_delete_own') then
    create policy ricevute_delete_own on storage.objects for delete
      using (bucket_id='ricevute' and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end $$;

-- ============================================================
-- Verifica
-- ============================================================
select 'colonna receipt_path' as cosa,
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='travel_expenses'
                           and column_name='receipt_path')
            then 'esiste' else 'MANCA' end as esito
union all
select 'bucket ricevute',
       coalesce((select case when public then 'ESISTE MA E'' PUBBLICO — da sistemare'
                             else 'esiste, privato' end
                   from storage.buckets where id='ricevute'),'MANCA')
union all
select 'policy sul bucket',
       (select count(*)::text from pg_policies
         where schemaname='storage' and tablename='objects'
           and policyname like 'ricevute_%') || ' su 4';
