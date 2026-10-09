// «Non mi fa piu' inserire i consuntivi: mi chiede l'attivita'
// obbligatoria, informazione che non c'e' nemmeno.»
//
// Il modulo in gerarchia era diventato quattro livelli con due campi
// che si chiamavano tutti e due «attivita'»: quella della commessa (la
// WBS) e il tipo di attivita' dell'anagrafica. Chi consuntiva ne ha
// tre, di dati, e sono sempre gli stessi: CLIENTE, PROGETTO o cliente
// finale, ATTIVITA' svolta.
//
// Quindi il tipo di attivita' e' uscito dal modulo. Non e' sparito:
// lo porta l'attivita' della commessa, dove si imposta una volta sola
// invece che a ogni consuntivo. Qui si verifica che la tripletta sia
// quella, che con l'attivita' sulla commessa il consuntivo si salvi
// anche col database vecchio che la pretende, e che quando non c'e' il
// rifiuto si legga in italiano dicendo dove si mette.
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

console.log('\n=== IL MODULO È LA TRIPLETTA, E BASTA ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
    const primo=[...f.client_id.options].find(o=>o.value);
    if(primo){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}});
  await pg.waitForTimeout(400);
  const etichette=await pg.evaluate(()=>[...document.querySelectorAll('#app form.form .field')]
    .filter(d=>!d.hidden).map(d=>(d.querySelector('label')?.textContent||'').trim()));
  ok(etichette.includes('Cliente'),'c’è il cliente',etichette.join(' | '));
  ok(etichette.includes('Progetto / cliente finale'),'c’è il progetto o cliente finale',etichette.join(' | '));
  ok(etichette.includes('Attività'),'c’è l’attività svolta',etichette.join(' | '));
  ok(etichette.filter(x=>/attivit/i.test(x)).length===1,
     'e di campi che si chiamano «attività» ce n’è UNO solo',etichette.join(' | '));
  ok(!etichette.includes('Commessa'),
     'la commessa non si chiede: ce n’è una sola, e sceglierla sarebbe una scelta finta',etichette.join(' | '));
  const att=await pg.evaluate(()=>!!document.querySelector('#app form.form [name=activity_id]'));
  ok(att===false,'e il tipo di attività non è nel modulo: lo porta la commessa',
     att?'campo ancora presente':'assente, giusto');
  await pg.close();
}

console.log('\n=== DOVE LE COMMESSE SONO DUE, LA COMMESSA COMPARE ===');
{
  // L'alternativa: dove c'e' davvero da scegliere, il menu della
  // commessa c'e', e sceglierla riempie l'attivita' da se'.
  const pg=await apri(`
    S.engagements.push({id:'e2',project_id:'p1',code:'ACM-P1-C2',name:'Commessa 2026',status:'active'});
    S.wbs_items.push({id:'w2',engagement_id:'e2',code:'ACM-P1-C2-01',activity_code:'01',
      name:'Sviluppo',kind:'activity',status:'active',billable:true,activity_id:'a2'});`);
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
    const primo=[...f.client_id.options].find(o=>o.value);
    if(primo){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}});
  await pg.waitForTimeout(400);
  const etichette=await pg.evaluate(()=>[...document.querySelectorAll('#app form.form .field')]
    .filter(d=>!d.hidden).map(d=>(d.querySelector('label')?.textContent||'').trim()));
  ok(etichette.includes('Commessa'),'adesso la commessa si chiede: sono due',etichette.join(' | '));
  // scelta la commessa, l'attivita' si riempie da se'
  await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
    f.engagement_id.value='e2'; window.hierChanged(f,'engagement');});
  await pg.waitForTimeout(400);
  const w=await pg.evaluate(()=>document.querySelector('[name=wbs_id]')?.value||'');
  ok(w==='w2','e scegliendola alimenta l’attività, senza chiedere altro',w||'vuota');
  await pg.close();
}

console.log('\n=== CON L’ATTIVITÀ SULLA COMMESSA, SI SALVA ANCHE COL DATABASE VECCHIO ===');
{
  // Il caso vero: database con activity_id NOT NULL, da prima della
  // migrazione. L'attivita' la porta la commessa, e basta.
  const pg=await apri(`S.wbs_items[0].activity_id='a1';`);
  await pg.evaluate(()=>{window.__nonNulle=['activity_id']});
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  ok(await compila(pg)==='ok','il modulo si compila');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(1300);
  const righe=await pg.evaluate(()=>(window.__stores.timesheet_entries||[]).length);
  ok(righe===1,'il consuntivo si salva: il blocco è sparito',String(righe));
  const salvata=await pg.evaluate(()=>(window.__stores.timesheet_entries||[])[0]?.activity_id);
  ok(salvata==='a1','con l’attività che porta la commessa',String(salvata));
  await pg.close();
}

console.log('\n=== SE LA COMMESSA NON LA PORTA, LO DICE IN ITALIANO ===');
{
  // Commessa senza attivita' + database che la pretende. Il messaggio
  // non deve essere il testo grezzo di Postgres, e deve dire DOVE si
  // mette: sull'attivita' della commessa, non in un campo del modulo
  // che non esiste piu'.
  const pg=await apri();
  await pg.evaluate(()=>{window.__nonNulle=['activity_id']});
  await pg.evaluate(()=>window.go('dailyForm'));
  await pg.waitForTimeout(600);
  await compila(pg);
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(1300);
  const t=await testo(pg);
  const scritte=await pg.evaluate(()=>(window.__stores.timesheet_entries||[]).length);
  ok(scritte===0,'il database rifiuta, e non resta niente a metà',scritte+' righe');
  ok(!/null value in column/.test(t),'niente testo grezzo del database',
     (t.match(/null value[^·]{0,60}/)||[''])[0]||'nessuno');
  ok(/Commesse/.test(t),'dice dove si imposta: sull’attività della commessa',
     (t.match(/il database vuole[^.]{0,140}/)||[''])[0]);
  ok(/2026-10-08_attivita-facoltativa\.sql/.test(t),'e la migrazione che toglie il vincolo');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== consuntivo bloccato: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
