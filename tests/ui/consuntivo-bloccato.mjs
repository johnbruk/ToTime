// «Non mi fa piu' inserire i consuntivi: mi chiede l'attivita'
// obbligatoria, informazione che non c'e' nemmeno.»
//
// In modalita' gerarchia il modulo mostra «Attivita' della commessa»,
// che e' la WBS: un'altra cosa con quasi lo stesso nome. L'attivita'
// vera — quella dell'anagrafica, che serve a report e colori — non si
// poteva scegliere da nessuna parte. Se la commessa non ne portava una,
// il salvataggio partiva con activity_id vuota; e un database che la
// pretende rifiutava, mostrando il testo grezzo di Postgres che nomina
// un campo invisibile a schermo.
//
// Qui si riproduce ESATTAMENTE quella condizione: commessa senza
// attivita' + database che non accetta il campo vuoto.
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

// Un cliente CON la gerarchia, e una commessa che NON porta attivita'.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'ac',name:'Acme',code:'ACM',daily_rate:500,standard_hours:8,
    compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'p1',client_id:'ac',code:'ACM-P1',name:'Progetto',active:true,status:'active'}];
  S.engagements=[{id:'e1',project_id:'p1',code:'ACM-P1-C1',name:'Commessa',status:'active'}];
  S.wbs_items=[{id:'w1',engagement_id:'e1',code:'ACM-P1-C1-01',activity_code:'01',
    name:'Analisi',kind:'activity',status:'active',billable:true,activity_id:null}];
  S.activities=[{id:'a1',name:'Analisi',active:true},{id:'a2',name:'Sviluppo',active:true}];
  S.timesheet_entries=[];S.manual_entries=[];S.monthly_compensations=[];
  S.travel_expenses=[];S.trips=[];S.vehicles=[];S.billing_headers=[];
  S.expense_categories=[];
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
const compila=async(pg)=>{
  const r=await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    if(!f)return 'nessun modulo';
    f.entry_date.value='2026-10-07';
    if(f.hours)f.hours.value='8';
    // il cliente non si propone piu': si sceglie
    const primo=[...f.client_id.options].find(o=>o.value);
    if(primo&&!f.client_id.value){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}
    return 'ok';
  });
  await pg.waitForTimeout(400);
  return r;
};

console.log('\n=== IL CAMPO C’È, QUANDO LA COMMESSA NON PORTA L’ATTIVITÀ ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  // la gerarchia si disegna dopo aver scelto il cliente: prima non c’è
  // niente da disegnare, perché non si sa di chi
  await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
    const primo=[...f.client_id.options].find(o=>o.value);
    if(primo){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}});
  await pg.waitForTimeout(400);
  const campo=await pg.evaluate(()=>{
    const s=document.querySelector('#app form.form [name=activity_id]');
    if(!s)return 'assente';
    return s.closest('.field')?.hasAttribute('hidden')?'nascosto':'visibile';
  });
  ok(campo==='visibile','si può scegliere il tipo di attività',campo);
  const t=await testo(pg);
  ok(/Tipo di attività/.test(t),'e si chiama «Tipo di attività», non come la commessa',
     (t.match(/Tipo di attivit[^·]{0,40}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== CON LA COMMESSA CHE PORTA L’ATTIVITÀ, NON SI CHIEDE DUE VOLTE ===');
{
  const pg=await apri(`S.wbs_items[0].activity_id='a1';`);
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  // la gerarchia si disegna dopo aver scelto il cliente: prima non c’è
  // niente da disegnare, perché non si sa di chi
  await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
    const primo=[...f.client_id.options].find(o=>o.value);
    if(primo){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}});
  await pg.waitForTimeout(400);
  const campo=await pg.evaluate(()=>{
    const s=document.querySelector('#app form.form [name=activity_id]');
    if(!s)return 'assente';
    return s.closest('.field')?.hasAttribute('hidden')?'nascosto':'visibile';
  });
  ok(campo==='nascosto','il campo resta fuori strada: l’attività la dà la commessa',campo);
  await pg.close();
}

console.log('\n=== IL CONSUNTIVO SI SALVA, COL DATABASE CHE PRETENDE L’ATTIVITÀ ===');
{
  // E' il caso vero: database vecchio con activity_id NOT NULL.
  const pg=await apri();
  await pg.evaluate(()=>{window.__nonNulle=['activity_id']});
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  // la gerarchia si disegna dopo aver scelto il cliente: prima non c’è
  // niente da disegnare, perché non si sa di chi
  await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
    const primo=[...f.client_id.options].find(o=>o.value);
    if(primo){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}});
  await pg.waitForTimeout(400);
  ok(await compila(pg)==='ok','il modulo si compila');
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.activity_id.value='a2';
    f.requestSubmit();
  });
  await pg.waitForTimeout(1200);
  const righe=await pg.evaluate(()=>(window.__stores.timesheet_entries||[]).length);
  ok(righe===1,'il consuntivo si salva: il blocco è sparito',String(righe));
  const salvata=await pg.evaluate(()=>(window.__stores.timesheet_entries||[])[0]?.activity_id);
  ok(salvata==='a2','con l’attività che hai scelto',String(salvata));
  await pg.close();
}

console.log('\n=== E SE IL DATABASE RIFIUTA LO STESSO, LO DICE IN ITALIANO ===');
{
  // Scegliere di non scegliere: il campo resta vuoto e il database
  // rifiuta. Il messaggio non deve essere il testo grezzo di Postgres.
  const pg=await apri();
  await pg.evaluate(()=>{window.__nonNulle=['activity_id']});
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  // la gerarchia si disegna dopo aver scelto il cliente: prima non c’è
  // niente da disegnare, perché non si sa di chi
  await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
    const primo=[...f.client_id.options].find(o=>o.value);
    if(primo){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}});
  await pg.waitForTimeout(400);
  await compila(pg);
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.activity_id.value='';
    f.requestSubmit();
  });
  await pg.waitForTimeout(1200);
  const t=await testo(pg);
  ok(!/null value in column/.test(t),'niente testo grezzo del database',
     (t.match(/null value[^·]{0,60}/)||[''])[0]||'nessuno');
  ok(/tipo di attività/i.test(t),'dice qual è il campo, col nome che ha a schermo',
     (t.match(/il database vuole[^.]{0,120}/)||[''])[0]);
  ok(/2026-10-08_attivita-facoltativa\.sql/.test(t),'e la migrazione che toglie il vincolo');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== consuntivo bloccato: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
