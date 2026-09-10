-- ============================================================
-- Anteprima dell'inversione — NON MODIFICA NIENTE
--
-- Da lanciare PRIMA di 2026-09-10_inversione-progetto-commessa.sql:
-- mostra sui dati veri quante commesse verranno sdoppiate, quali
-- codici brevi collidono, e soprattutto che codice avra' ogni riga
-- DOPO l'inversione.
--
-- L'anteprima applica le stesse regole della migrazione, compresa la
-- rinomina dei codici brevi che collidono: se qui leggi SO-EQU2, dopo
-- l'inversione sara' SO-EQU2. Se le due cose non coincidessero,
-- l'anteprima non servirebbe a niente.
-- ============================================================

with prj as (
  -- la stessa regola della migrazione: fra due progetti con lo stesso
  -- codice breve sotto lo stesso cliente, lo tiene quello gia' usato
  -- nei consuntivi; a parita', l'ordine alfabetico del nome
  select p.id, p.user_id, p.client_id, p.engagement_id, p.name, p.short_code,
         row_number() over (partition by p.user_id, p.client_id, p.short_code
                            order by public.totime_project_in_use(p.id) desc,
                                     p.name, p.id) as rn
  from public.projects p
),
nuovo as (
  select prj.*, case when rn = 1 then short_code
                     else left(short_code,4) || rn::text end as short_code_nuovo
  from prj
)
select 1 as ord,
       'commesse che verranno sdoppiate' as cosa,
       count(*)::text as quante,
       'una commessa che copre piu'' progetti diventa una commessa per progetto' as perche
from (select engagement_id from public.projects
      where engagement_id is not null group by engagement_id having count(*) > 1) d
union all
select 2, 'commesse senza progetti', count(*)::text,
       'ognuna ricevera'' un progetto omonimo, perche'' nel verso nuovo deve averne uno'
from public.engagements e
where not exists (select 1 from public.projects p where p.engagement_id = e.id)
union all
select 3, 'codici brevi che verranno rinominati', count(*)::text,
       'stesso codice sotto lo stesso cliente: il codice lo tiene quello gia'' usato nei consuntivi'
from nuovo where short_code_nuovo is distinct from short_code
union all
select 4, 'clienti senza codice', count(*)::text,
       'ATTENZIONE: senza codice cliente il progetto non si codifica. Assegnalo prima di invertire'
from public.clients c
where coalesce(c.code,'') = ''
  and exists (select 1 from public.projects p where p.client_id = c.id)
union all
select 5, 'progetti dopo / commesse dopo',
       ((select count(*) from public.projects) +
        (select count(*) from public.engagements e
         where not exists (select 1 from public.projects p where p.engagement_id = e.id)))::text
       || ' / ' ||
       ((select count(*) from public.engagements) +
        (select coalesce(sum(n-1),0) from (select count(*) as n from public.projects
         where engagement_id is not null group by engagement_id having count(*) > 1) d))::text,
       'quante ce ne saranno quando avra'' finito'
union all
-- riga per riga: com'e' adesso, come sara'
select 6,
       '  ' || n.name,
       coalesce(w.code, e.code, '(senza codice)') || '   →   ' ||
       c.code || '-' || n.short_code_nuovo || '-' || e.year::text || '-' ||
       -- il progressivo riparte da 1 per ogni progetto e anno, non e'
       -- piu' quello di prima (che contava per cliente)
       lpad(row_number() over (partition by n.id, e.year order by e.seq, e.id)::text,3,'0')
       || coalesce('-' || w.activity_code, ''),
       case when n.short_code_nuovo is distinct from n.short_code
            then 'codice breve rinominato: ' || n.short_code || ' → ' || n.short_code_nuovo
            else 'codice attuale → codice dopo l''inversione' end
from nuovo n
join public.clients c on c.id = n.client_id
join public.engagements e on e.id = n.engagement_id
left join public.wbs_items w on w.project_id = n.id
where coalesce(c.code,'') <> ''
order by ord, cosa
limit 80;
