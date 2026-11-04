-- ============================================================
-- Migrazione TOTIME — 2026-11-04
-- Le spese si fatturano a parte
--
-- Perche' serve: le spese non vanno nella fattura dei consuntivi. Ogni
-- cliente ha, per ogni mese, una fattura del lavoro e una delle spese,
-- e ognuna ha la sua scheda di fatturazione.
--
-- Cosa fa: billing_headers.invoice_kind: 'work' | 'expenses', di
-- partenza 'work'. Le schede che ci sono restano del lavoro, e i mesi
-- gia' fatturati con le spese dentro restano come sono.
-- Nessun importo cambia.
--
-- Da eseguire nel SQL Editor di Supabase. Sicura da rilanciare.
-- ============================================================

alter table public.billing_headers
  add column if not exists invoice_kind text not null default 'work';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='billing_headers_invoice_kind_check') then
    alter table public.billing_headers
      add constraint billing_headers_invoice_kind_check check (invoice_kind in ('work','expenses'));
  end if;
end $$;

-- Se la tabella ha un vincolo «una scheda per cliente e mese», la
-- fattura delle spese non si potrebbe salvare accanto a quella del
-- lavoro: il vincolo si rifà con dentro anche il tipo di fattura.
do $$
declare r record; cols text[];
begin
  for r in
    select c.conname, c.conkey from pg_constraint c
     where c.conrelid='public.billing_headers'::regclass and c.contype='u'
  loop
    select array_agg(a.attname::text order by a.attname) into cols
      from pg_attribute a where a.attrelid='public.billing_headers'::regclass and a.attnum = any(r.conkey);
    if cols @> array['client_id','month','year'] and not cols @> array['invoice_kind'] then
      execute format('alter table public.billing_headers drop constraint %I', r.conname);
      execute format('alter table public.billing_headers add constraint %I unique (%s)',
        r.conname, (select string_agg(quote_ident(x), ', ') from unnest(cols || array['invoice_kind']) x));
    end if;
  end loop;
  for r in
    select i.indexrelid::regclass::text as nome, i.indkey::int2[] as k from pg_index i
     where i.indrelid='public.billing_headers'::regclass and i.indisunique and not i.indisprimary
       and not exists (select 1 from pg_constraint c where c.conindid=i.indexrelid)
  loop
    select array_agg(a.attname::text order by a.attname) into cols
      from pg_attribute a where a.attrelid='public.billing_headers'::regclass and a.attnum = any(r.k);
    if cols @> array['client_id','month','year'] and not cols @> array['invoice_kind'] then
      execute format('drop index %s', r.nome);
      execute format('create unique index %I on public.billing_headers (%s)',
        regexp_replace(r.nome,'^.*\.',''),
        (select string_agg(quote_ident(x), ', ') from unnest(cols || array['invoice_kind']) x));
    end if;
  end loop;
end $$;

-- Verifica
select count(*)::text || ' su 1' as colonna_aggiunta
  from information_schema.columns
 where table_schema='public' and table_name='billing_headers' and column_name='invoice_kind';
select count(*)::text as schede_del_lavoro from public.billing_headers where invoice_kind='work';
