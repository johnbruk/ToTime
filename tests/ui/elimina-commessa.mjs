// «Come faccio a eliminare eventuali commesse o progetti?»
//
// L'attività della commessa si eliminava, il progetto pure ma solo se
// non aveva nessuna commessa, e la commessa non si eliminava da
// nessuna parte. Siccome l'app la commessa la crea DA SÉ quando nasce
// un progetto, il progetto nato per sbaglio restava lì per sempre:
// aveva una commessa, e quella commessa non si poteva togliere.
//
// Adesso si eliminano tutte e due, con la regola che il database già
// impone e che qui si dice in italiano: finché non ci ha lavorato
// nessuno si eliminano, dopo si chiudono — così lo storico resta.
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
const testo=pg=>pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));

// Due progetti: uno pulito, nato per sbaglio con la sua commessa
// automatica; uno su cui si è già lavorato.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Solution',code:'SOL',daily_rate:500,standard_hours:8,
    compensation_type:'daily_rate_8h',active:true}];
  S.projects=[
    {id:'equ',client_id:'sol',code:'SOL-EQU',name:'Equans',active:true,status:'active'},
    {id:'err',client_id:'sol',code:'SOL-ERR',name:'Nato per sbaglio',active:true,status:'active'}];
  S.engagements=[
    {id:'e1',project_id:'equ',client_id:'sol',code:'SOL-EQU-2026-001',year:2026,seq:1,name:'Incarico',status:'active'},
    {id:'e2',project_id:'err',client_id:'sol',code:'SOL-ERR-2026-001',year:2026,seq:1,name:'Sbaglio',status:'active'}];
  S.wbs_items=[
    {id:'w1',engagement_id:'e1',activity_code:'10',code:'SOL-EQU-2026-001-10',name:'AMS',kind:'activity',status:'active',billable:true},
    {id:'w2',engagement_id:'e2',activity_code:'10',code:'SOL-ERR-2026-001-10',name:'Sbaglio',kind:'activity',status:'active',billable:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.timesheet_entries=[{id:'v1',entry_date:'2026-09-10',client_id:'sol',project_id:'equ',wbs_id:'w1',
    hours:8,daily_rate_snapshot:500,standard_hours_snapshot:8}];
  S.manual_entries=[];S.monthly_compensations=[];S.travel_expenses=[];S.trips=[];
  S.billing_headers=[];S.expense_categories=[];
`;
const apri=async(extra='')=>{
  const pg=await b.newPage({viewport:{width:390,height:1800},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};
const stato=pg=>pg.evaluate(()=>({
  prj:(window.__stores.projects||[]).map(p=>p.id).join(','),
  eng:(window.__stores.engagements||[]).map(e=>e.id).join(','),
  wbs:(window.__stores.wbs_items||[]).map(w=>w.id).join(','),
  ore:(window.__stores.timesheet_entries||[]).length}));
const bottone=(pg,testo)=>pg.evaluate(t=>{
  const b=[...document.querySelectorAll('#app button')].find(x=>x.textContent.trim()===t);
  return b?b.textContent.trim():'';},testo);
const clicca=(pg,testo)=>pg.evaluate(t=>{
  const b=[...document.querySelectorAll('#app button')].find(x=>x.textContent.trim()===t);
  if(b)b.click();},testo);

console.log('\n=== UNA COMMESSA MAI USATA SI ELIMINA ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.navigateTo('engagementEdit',{edit:'e2'}));
  await pg.waitForTimeout(700);
  ok(await bottone(pg,'Elimina commessa')==='Elimina commessa','il pulsante c’è');
  const prima=await stato(pg);
  await clicca(pg,'Elimina commessa');
  await pg.waitForTimeout(1300);
  const dopo=await stato(pg);
  ok(dopo.eng==='e1','la commessa non c’è più',dopo.eng);
  ok(dopo.wbs==='w1','e con lei se ne va la sua attività',dopo.wbs);
  ok(dopo.ore===prima.ore,'le ore dell’altra commessa non si toccano',`${prima.ore} → ${dopo.ore}`);
  ok(dopo.prj==='equ,err','e il progetto resta: si elimina a parte',dopo.prj);
  await pg.close();
}

console.log('\n=== UNA COMMESSA CON DELLE ORE NON SI ELIMINA: SI CHIUDE ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.navigateTo('engagementEdit',{edit:'e1'}));
  await pg.waitForTimeout(700);
  ok(await bottone(pg,'Elimina commessa')==='',
     'il pulsante non c’è nemmeno: su questa si è lavorato',await bottone(pg,'Elimina commessa')||'assente');
  // e chiamandola lo stesso, dice perché e dice cosa fare
  await pg.evaluate(()=>window.eliminaCommessa('e1'));
  await pg.waitForTimeout(1000);
  const dopo=await stato(pg);
  ok(dopo.eng==='e1,e2','non viene eliminata',dopo.eng);
  const t=await testo(pg);
  ok(/si può chiudere, non eliminare/.test(t),'e lo dice, con la via giusta',
     (t.match(/La commessa[^.]{0,120}/)||[''])[0]);
  ok(/1 registrazione/.test(t),'dicendo anche quante registrazioni pendono',
     (t.match(/ha 1 registrazione/)||[''])[0]);
  ok(/storico/.test(t),'e che chiudendola lo storico resta');
  await pg.close();
}

console.log('\n=== IL PROGETTO NATO PER SBAGLIO SE NE VA CON LA SUA COMMESSA ===');
{
  // È la forma che l'app genera da sé: progetto + commessa + attività,
  // tutto vuoto. Prima era un vicolo cieco, perché il pulsante compariva
  // solo sui progetti senza commesse e la commessa non si toglieva.
  const pg=await apri();
  await pg.evaluate(()=>window.navigateTo('projectEdit',{edit:'err'}));
  await pg.waitForTimeout(700);
  ok(await bottone(pg,'Elimina progetto')==='Elimina progetto',
     'il pulsante c’è anche se il progetto ha la sua commessa');
  await clicca(pg,'Elimina progetto');
  await pg.waitForTimeout(1500);
  const dopo=await stato(pg);
  ok(dopo.prj==='equ','il progetto non c’è più',dopo.prj);
  ok(dopo.eng==='e1','e con lui la sua commessa',dopo.eng);
  ok(dopo.wbs==='w1','e la sua attività',dopo.wbs);
  ok(dopo.ore===1,'mentre il lavoro dell’altro progetto resta intatto',String(dopo.ore));
  await pg.close();
}

console.log('\n=== UN PROGETTO SU CUI SI È LAVORATO NON SI ELIMINA ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.navigateTo('projectEdit',{edit:'equ'}));
  await pg.waitForTimeout(700);
  ok(await bottone(pg,'Elimina progetto')==='','il pulsante non c’è');
  await pg.evaluate(()=>window.eliminaProgetto('equ'));
  await pg.waitForTimeout(1000);
  const dopo=await stato(pg);
  ok(dopo.prj==='equ,err','non viene eliminato',dopo.prj);
  const t=await testo(pg);
  ok(/si può chiudere, non eliminare/.test(t),'e lo dice, con la via giusta',
     (t.match(/Il progetto[^.]{0,130}/)||[''])[0]);
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== elimina commessa: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
