// Gli incarichi continuativi tengono insieme i loro consuntivi, e ogni
// riga dice su quale attività sono le ore.
//
// Due difetti visti dall'utente il 13 ottobre.
//
// 1. «Lo carico come incarico continuativo ma non salva nulla.» I
//    consuntivi si salvavano, ma senza il codice dell'incarico
//    (tm_batch_id): la colonna non era in nessuna migrazione, e dove il
//    database non l'aveva l'app la toglieva in silenzio. La pagina
//    «Incarichi continuativi» diceva «nessuno», l'etichetta T&M non
//    c'era, e il periodo non si poteva eliminare in un colpo. Adesso,
//    senza la colonna, non si salva niente e l'app dice quale
//    migrazione lanciare.
//
// 2. «Mi sta inserendo consuntivi senza il tag dell'attività.» Una WBS
//    senza attività collegata salva le ore senza activity_id; il modulo
//    mostrava la WBS, l'elenco solo «· Remoto». Adesso l'elenco mostra
//    la WBS quando l'attività del catalogo non c'è.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

const apri=async(semi='')=>{
  const pg=await b.newPage({viewport:{width:1280,height:1400}});
  pg.on('dialog',d=>d.accept());
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.errs=errs;
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  if(semi){await pg.evaluate(semi);await pg.evaluate(()=>window.reload());await pg.waitForTimeout(600);}
  return pg;
};
const toast=pg=>pg.evaluate(()=>(document.querySelector('#app .toast')?.innerText||'').replace(/\s+/g,' ').trim());

// ─── 1. L'etichetta dell'attività ───
const SEMI_TAG=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2 Partnering',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'nc',client_id:'k2',name:'NewCom',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.wbs_items=[{id:'w20',code:'20',name:'Onboarding',activity_id:null,status:'active'}];
  const e=(id,d,extra)=>Object.assign({id,entry_date:d,client_id:'k2',project_id:'nc',hours:8,work_site:'Remoto',
    daily_rate_snapshot:500,standard_hours_snapshot:8},extra);
  S.timesheet_entries=[e('t1','2026-10-07',{wbs_id:'w20',activity_id:null}),
    e('t2','2026-10-06',{activity_id:'a1'}),
    e('t3','2026-10-05',{activity_id:null})];
`;
console.log('\n=== OGNI RIGA DICE SU QUALE ATTIVITÀ SONO LE ORE ===');
{
  const pg=await apri(SEMI_TAG);
  await pg.evaluate(()=>{window.openInvoiceDetail('k2',2026,10)});await pg.waitForTimeout(300);
  await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(600);
  const r=await pg.evaluate(()=>Object.fromEntries(['t1','t2','t3'].map(id=>{
    const el=[...document.querySelectorAll('#app [data-id]')].find(x=>x.dataset.id===id)||
      [...document.querySelectorAll('#app .row')].find(x=>(x.getAttribute('onclick')||'').includes("'"+id+"'"));
    const d=el?el.querySelectorAll('.desc')[0]:null;
    return [id,{tag:d?.querySelector('.actTag')?.textContent.trim()||'',testo:(d?.textContent||'').replace(/\s+/g,' ').trim()}];})));
  ok(r.t1.tag==='Onboarding','le ore sulla WBS senza attività del catalogo mostrano il nome della WBS, come un’attività: «Onboarding»',JSON.stringify(r.t1));
  ok(r.t1.testo==='Onboarding','e basta: la sede non sta nell’elenco, si legge aprendo il consuntivo',r.t1.testo);
  ok(!/20 ·|K2-RICH/.test(r.t1.testo),'senza il codice della WBS, che i consuntivi degli altri clienti non hanno',r.t1.testo);
  ok(r.t2.testo==='Analisi','anche con l’attività del catalogo la riga dice l’attività e basta, senza la sede',r.t2.testo);
  ok(r.t2.tag==='Analisi','con un’attività del catalogo resta l’attività',JSON.stringify(r.t2));
  ok(r.t3.testo==='','e senza né attività né WBS la riga resta pulita, senza puntini',JSON.stringify(r.t3.testo));
  ok(pg.errs.length===0,'nessun errore JS',pg.errs.slice(0,2).join(' | ')||'nessuno');
  await pg.close();
}

{
  // sul telefono: la riga con la WBS è alta come quella con l'attività
  // del catalogo — la sede non va a capo
  const pg=await b.newPage({viewport:{width:390,height:900},hasTouch:true});
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});await pg.waitForTimeout(800);
  await pg.evaluate(SEMI_TAG.replace("{id:'w20',code:'20',","{id:'w20',code:'K2-RICH-2026-001-20',"));
  await pg.evaluate(()=>window.reload());await pg.waitForTimeout(600);
  await pg.evaluate(()=>{window.openInvoiceDetail('k2',2026,10)});await pg.waitForTimeout(300);
  await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(600);
  const h=await pg.evaluate(()=>Object.fromEntries(['t1','t2'].map(id=>{
    const el=[...document.querySelectorAll('#app .row')].find(x=>(x.getAttribute('onclick')||'').includes("'"+id+"'"));
    return [id,Math.round(el.querySelectorAll('.desc')[0].getBoundingClientRect().height)]})));
  ok(h.t1===h.t2,'sul telefono la riga con la WBS è alta come quella con un’attività: niente va a capo',`${h.t1} contro ${h.t2} px`);
  await pg.close();
}

{
  // la testata del cliente sul telefono, con le spese del mese: il
  // conteggio era piu' largo dello schermo e il nome finiva in colonna,
  // una lettera per riga
  const pg=await b.newPage({viewport:{width:390,height:900},hasTouch:true});
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});await pg.waitForTimeout(800);
  await pg.evaluate(SEMI_TAG.replace("{id:'w20',code:'20',","{id:'w20',code:'K2-RICH-2026-001-20',")+`
    S.expense_categories=[{id:'tr',name:'Treno',active:true,reimbursable:true}];
    S.travel_expenses=[1,2,3,4,5].map(n=>({id:'x'+n,expense_date:'2026-10-0'+n,client_id:'k2',expense_category_id:'tr',
      amount:n===5?397.96:300,reimbursement_type:'invoice',reimbursable:true}));`);
  await pg.evaluate(()=>window.reload());await pg.waitForTimeout(600);
  await pg.evaluate(()=>{window.openInvoiceDetail('k2',2026,10)});await pg.waitForTimeout(300);
  await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(600);
  const m=await pg.evaluate(()=>{
    const h=[...document.querySelectorAll('#app .cliHead')].find(x=>/K2 Partnering/.test(x.textContent));
    const nome=h.querySelector('.cliToggle>b'),conto=h.querySelector('.cliConto');
    const lh=parseFloat(getComputedStyle(nome).lineHeight)||20;
    return {larghezza:Math.round(nome.getBoundingClientRect().width),righe:Math.round(nome.getBoundingClientRect().height/lh),
      conto:conto.textContent.replace(/\s+/g,' ').trim(),contoDentro:conto.getBoundingClientRect().right<=h.getBoundingClientRect().right+1,
      scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
  ok(m.righe===1&&m.larghezza>=100,'col conteggio delle spese il nome del cliente resta su una riga, leggibile',`${m.larghezza} px, ${m.righe} righe`);
  ok(/5 spese/.test(m.conto)&&m.contoDentro,'e il conteggio intero sta dentro la testata, sotto il nome se serve',m.conto);
  ok(m.scroll<=1,'senza scroll di lato',m.scroll+'px');
  await pg.close();
}

// ─── 2. L'incarico continuativo ───
const SEMI_TM=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2 Partnering',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[];S.timesheet_entries=[];S.wbs_items=[];S.engagements=[];
`;
// genera un incarico dal 5 al 9 ottobre 2026: cinque giorni lavorativi
const genera=async(pg,descrizione='')=>{
  await pg.evaluate(()=>window.go('tmForm'));await pg.waitForTimeout(500);
  await pg.evaluate(d=>{const f=document.querySelector('#app form');
    f.client_id.value='k2';f.start_date.value='2026-10-05';f.end_date.value='2026-10-09';f.hours.value='8';
    f.description.value=d;f.requestSubmit();},descrizione);
  await pg.waitForTimeout(900);
};
console.log('\n=== UN INCARICO SALVATO È UN INCARICO ===');
{
  const pg=await apri(SEMI_TM);
  await genera(pg);
  const st=await pg.evaluate(()=>window.__stores.timesheet_entries.map(e=>({d:e.entry_date,b:e.tm_batch_id||''})));
  ok(st.length===5,'cinque consuntivi, uno per giorno lavorativo',String(st.length));
  ok(st.length&&st.every(x=>x.b&&x.b===st[0].b),'tutti con lo stesso codice dell’incarico',JSON.stringify(st.map(x=>x.b)));
  await pg.evaluate(()=>window.go('tmManage'));await pg.waitForTimeout(500);
  const t=await pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));
  ok(!/Nessun incarico continuativo generato/.test(t)&&/Dal 05\/10\/2026 al 09\/10\/2026 · 5 giorni/.test(t),
     'e la pagina degli incarichi lo mostra, anche con la descrizione vuota',(t.match(/Dal [^·]*· \d+ giorni/)||['nessuno'])[0]);
  ok(pg.errs.length===0,'nessun errore JS',pg.errs.slice(0,2).join(' | ')||'nessuno');
  await pg.close();
}

console.log('\n=== SENZA LA COLONNA NON SI SALVANO CONSUNTIVI ORFANI: SI DICE ===');
{
  const pg=await apri(SEMI_TM+`window.__colonneMancanti=['tm_batch_id'];`);
  await genera(pg);
  const n=await pg.evaluate(()=>window.__stores.timesheet_entries.length);
  ok(n===0,'il database non ha tm_batch_id: non si salva nessun consuntivo',String(n));
  const m=await toast(pg);
  ok(/Non è stato salvato niente/.test(m)&&/2026-10-13_incarichi-continuativi\.sql/.test(m),
     'e l’app dice quale migrazione lanciare',m||'nessun messaggio');
  await pg.close();
}

console.log('\n=== GLI ALTRI SALVATAGGI RESTANO RESILIENTI ===');
{
  // la colonna obbligatoria vale solo per l'incarico: un consuntivo
  // normale, con una colonna nuova mancante, si salva come prima
  const pg=await apri(SEMI_TM+`window.__colonneMancanti=['work_city'];`);
  await genera(pg,'Time & Material');
  const n=await pg.evaluate(()=>window.__stores.timesheet_entries.length);
  ok(n===5,'una colonna facoltativa mancante si toglie e l’incarico si salva',String(n));
  await pg.close();
}

console.log('\n=== INCARICHI VECCHI SU DUE WBS RESTANO DUE ===');
{
  // incarichi di prima del codice: si riconoscono dalla descrizione
  // «Time & Material» e si raggruppano per cliente, progetto, attività,
  // ore e descrizione. Senza la WBS nella chiave, due incarichi uguali su
  // WBS diverse diventavano uno: con l'etichetta della prima, e
  // «Elimina intero periodo» li cancellava tutti e due.
  const pg=await apri(`
    const S=window.__stores;
    S.clients=[{id:'k2',name:'K2 Partnering',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
    S.projects=[{id:'nc',client_id:'k2',name:'NewCom',active:true}];
    S.wbs_items=[{id:'w20',code:'20',name:'Onboarding',activity_id:null,status:'active'},
                 {id:'w30',code:'30',name:'Sviluppo',activity_id:null,status:'active'}];
    const e=(id,d,w)=>({id,entry_date:d,client_id:'k2',project_id:'nc',wbs_id:w,activity_id:null,hours:8,
      description:'Time & Material',daily_rate_snapshot:500,standard_hours_snapshot:8});
    S.timesheet_entries=[e('a1','2026-09-01','w20'),e('a2','2026-09-02','w20'),e('b1','2026-09-03','w30'),e('b2','2026-09-04','w30')];`);
  await pg.evaluate(()=>window.go('tmManage'));await pg.waitForTimeout(500);
  const r=await pg.evaluate(()=>[...document.querySelectorAll('#app .list .row')].map(x=>x.innerText.replace(/\s+/g,' ')));
  ok(r.length===2,'due incarichi, uno per WBS',String(r.length));
  ok(r.some(x=>/Onboarding/.test(x)&&/2 giorni/.test(x))&&r.some(x=>/Sviluppo/.test(x)&&/2 giorni/.test(x)),
     'ognuno con la sua WBS e i suoi due giorni',r.join(' | '));
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== incarichi continuativi: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
