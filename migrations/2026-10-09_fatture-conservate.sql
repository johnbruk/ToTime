-- ============================================================
-- Migrazione TOTIME — 2026-10-09 (b)
-- Le fatture caricate si conservano, con la loro natura IVA
--
-- Perche' serve: registrando una fattura l'app scrive i suoi numeri
-- sulle schede dei mesi, ma il file XML resta solo nel browser e la
-- natura IVA (N2.2, N2.1...) si perde. Il file e' la fattura vera; la
-- natura dice se il bollo ci va, e servira' a calcolarlo giusto anche
-- sulle fatture estere.
--
-- Cosa fa: crea la tabella invoice_documents. NON tocca una riga dei
-- dati esistenti: le schede di fatturazione restano come sono, e
-- finche' questa tabella non c'e' l'app registra le fatture come
-- prima, senza conservare il file.
--
-- Una riga per fattura, riconosciuta da numero e data: registrarla di
-- nuovo aggiorna la stessa riga, non ne crea un'altra.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

begin;

create table if not exists public.invoice_documents(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  client_id uuid references public.clients(id) on delete set null,
  invoice_number text not null,
  invoice_date date not null,
  -- i mesi di competenza che la fattura copre, es. {2026-02,2026-03}
  months text[] not null default '{}',
  total_amount numeric(12,2),
  -- le nature IVA del riepilogo, es. {N2.2}
  natures text[] not null default '{}',
  -- gli importi su cui si misura la soglia del bollo, secondo le nature
  stamp_base numeric(12,2),
  -- il bollo dichiarato nel file (DatiBollo/ImportoBollo)
  stamp_amount numeric(12,2),
  file_name text,
  xml text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Una fattura e' una sola: stesso numero e stessa data per lo stesso
-- utente. Il numero e' quello scritto nel file, cosi' com'e'.
create unique index if not exists invoice_documents_user_number_date_key
  on public.invoice_documents(user_id, invoice_number, invoice_date);
create index if not exists invoice_documents_user_date_idx
  on public.invoice_documents(user_id, invoice_date desc);

-- RLS, lo stesso schema delle altre tabelle: ognuno vede solo le sue
alter table public.invoice_documents enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_documents' and policyname='invoice_documents_select_own') then
    create policy invoice_documents_select_own on public.invoice_documents for select using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_documents' and policyname='invoice_documents_insert_own') then
    create policy invoice_documents_insert_own on public.invoice_documents for insert with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_documents' and policyname='invoice_documents_update_own') then
    create policy invoice_documents_update_own on public.invoice_documents for update using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_documents' and policyname='invoice_documents_delete_own') then
    create policy invoice_documents_delete_own on public.invoice_documents for delete using ((select auth.uid()) = user_id);
  end if;
end $$;

commit;

-- ============================================================
-- Verifica: deve dire «esiste» e «attiva», e 4 policy
-- ============================================================
select 'tabella invoice_documents' as cosa,
       case when exists (select 1 from information_schema.tables
                         where table_schema='public' and table_name='invoice_documents')
            then 'esiste' else 'MANCA' end as esito
union all
select 'RLS',
       case when (select relrowsecurity from pg_class where oid='public.invoice_documents'::regclass)
            then 'attiva' else 'SPENTA — da sistemare' end
union all
select 'policy', count(*)::text
  from pg_policies where schemaname='public' and tablename='invoice_documents'
union all
select 'fatture conservate', count(*)::text from public.invoice_documents;
