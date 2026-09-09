-- ============================================================
-- Migrazione TOTIME — 2026-09-09 (backfill, passo A)
-- Assegna un codice ai clienti che non ce l'hanno.
--
-- Il codice cliente e' un identificativo di business e va scelto da
-- chi usa l'applicazione. Qui se ne propone uno ricavato dal nome:
-- SERVE RIVEDERLO in Impostazioni > Clienti PRIMA di lanciare il
-- passo B, perche' da quel momento entra nei codici di commessa e
-- non si puo' piu' cambiare.
--
-- PASSO A. Da eseguire DOPO 2026-09-09_commesse-progetti-wbs.sql. Non cancella e non sovrascrive nulla:
-- riempie solo campi vuoti. Sicura da rilanciare.
--
-- Cosa NON fa, di proposito: non inventa associazioni. Le
-- registrazioni che non si possono classificare con certezza
-- restano senza WBS e finiscono nell'elenco da correggere a mano.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Codice per i clienti che non ce l'hanno
--    Si ricava dal nome: prime lettere, maiuscole, senza simboli.
--    In caso di collisione si aggiunge una cifra progressiva.
-- ------------------------------------------------------------

do $$
declare r record; base text; cand text; n int;
begin
  for r in select id, user_id, name from public.clients where code is null order by name loop
    base := left(public.totime_norm_code(r.name), 3);
    if base is null or length(base) < 2 then base := 'CL'; end if;
    cand := base; n := 1;
    while exists(select 1 from public.clients where user_id = r.user_id and code = cand) loop
      n := n + 1;
      cand := left(base, 4) || n::text;
      exit when n > 99;
    end loop;
    update public.clients set code = cand where id = r.id;
  end loop;
end $$;


commit;

-- Rivedi questi codici prima del passo B: finche' non ci sono
-- commesse si possono ancora correggere dall'anagrafica cliente.
select name as cliente, code as codice_proposto from public.clients order by name;
