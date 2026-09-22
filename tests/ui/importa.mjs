// Caricare i consuntivi da un foglio.
//
// Il file di prova riproduce il tracciato vero, righe comprese: una
// senza Sede e senza Descrizione, una con le ore a virgola, una con
// un cliente che non esiste, una con un'attivita' nuova, e una
// ripetuta due volte. Conta quello che finisce scritto nel database,
// non quello che si vede a schermo.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import os from 'node:os';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const EXTRA=`
  engagements:[{id:'e1',user_id:'u1',client_id:'c1',project_id:'p1',code:'SOL-EQU-2026-001',year:2026,seq:1,name:'Contratto',status:'active'}],
  engagement_references:[],
  wbs_items:[
    {id:'w10',user_id:'u1',engagement_id:'e1',activity_code:'10',code:'SOL-EQU-2026-001-10',name:'AMS / Incident',billable:true,status:'active',sort_order:10},
    {id:'w20',user_id:'u1',engagement_id:'e1',activity_code:'20',code:'SOL-EQU-2026-001-20',name:'AMS & Progetti',billable:true,status:'active',sort_order:20}],
  billing_lines:[],invoice_line_allocations:[],`;
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    if(p.endsWith('mock.html')){let h=b.toString();
      h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
      h=h.replace("{id:'c1',name:'Equans',daily_rate:480","{id:'c1',name:'Solution',code:'SOL',daily_rate:480");
      h=h.replace("{id:'p1',client_id:'c1',name:'Beta',active:true}","{id:'p1',client_id:'c1',short_code:'EQU',code:'SOL-EQU',name:'Equans',status:'active',active:true}");
      h=h.replace(/timesheet_entries:\[[\s\S]*?\n  \],/,'timesheet_entries:[],');
      b=Buffer.from(h);}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
const pg=await b.newPage({viewport:{width:1280,height:1000}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
pg.on('dialog',d=>d.accept());
await pg.goto(`http://127.0.0.1:${srv.address().port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'totime-'));
const store=()=>pg.evaluate(()=>window.__stores.timesheet_entries);
const carica=async file=>{
  await pg.evaluate(()=>window.go('importaConsuntivi'));await pg.waitForTimeout(400);
  await pg.setInputFiles('#app input[type=file]',file);await pg.waitForTimeout(800);
};

console.log('\n=== A. Il CSV nel tracciato dell\'app ===');
const csv=['Data,Cliente,Progetto,Attività,Sede,Descrizione,Ore',
  '01/09/2026,Solution,Equans,AMS / Incident,,,1',
  '01/09/2026,Solution,Equans,AMS & Progetti,Remoto,SAL settimanale,"1,5"',
  '02/09/2026,Solution,Equans,CR Evolutive,Remoto,CR FI/CO,2',
  '03/09/2026,Ignoto,Equans,AMS / Incident,Remoto,,1',
  '04/09/2026,Solution,Equans,AMS / Incident,Remoto,INC0624163,X',
  'Totale,,,,,,5'].join('\n');
const fCsv=path.join(dir,'consuntivi.csv');fs.writeFileSync(fCsv,csv);
await carica(fCsv);
const testo=await pg.evaluate(()=>document.getElementById('app').textContent.replace(/\s+/g,' '));
ok(/Cosa succederà/.test(testo),'il file viene letto e si vede l\'anteprima');
const kpi=await pg.evaluate(()=>[...document.querySelectorAll('#app .kpiGrid strong')].map(x=>x.textContent.trim()));
ok(kpi[0]==='3','tre righe da caricare: due riconosciute e una con attività nuova',kpi.join(' / '));
ok(kpi[2]==='2','due da sistemare: cliente sconosciuto e ore non valide',kpi.join(' / '));
ok(/attività da creare/i.test(testo),'dice che CR Evolutive va creata');
ok(/non trovato/.test(testo),'e spiega perché le altre no');
ok(!/Totale/.test(await pg.evaluate(()=>document.querySelector('#app table.prospetto tbody').textContent)),
  'la riga Totale del foglio non viene scambiata per un consuntivo');

console.log('\n=== B. Caricando, finisce scritto quello che era promesso ===');
// il pulsante sta nel riquadro, non nel menu laterale: la voce
// "Carica da foglio" del menu ha un testo che comincia uguale
await pg.evaluate(()=>[...document.querySelectorAll('#app .card .actions button')]
  .find(y=>/^Carica \d+/.test(y.textContent)).click());
await pg.waitForTimeout(2200);
const voci=await store();
ok(voci.length===3,'tre consuntivi scritti',voci.length+' voci');
const v1=voci.find(v=>v.entry_date==='2026-09-01'&&v.wbs_id==='w10');
ok(!!v1,'la riga senza sede né descrizione passa lo stesso');
const v2=voci.find(v=>v.wbs_id==='w20');
ok(v2&&Number(v2.hours)===1.5,'le ore a virgola diventano 1,5',v2&&String(v2.hours));
ok(v2&&v2.work_site==='Remoto'&&v2.description==='SAL settimanale','sede e descrizione arrivano',v2&&(v2.work_site+' / '+v2.description));
const nuove=await pg.evaluate(()=>window.__stores.wbs_items.filter(w=>w.name==='CR Evolutive'));
ok(nuove.length===1,'l\'attività nuova viene creata una volta sola',nuove.length+'');
const v3=voci.find(v=>v.entry_date==='2026-09-02');
ok(v3&&v3.wbs_id===nuove[0].id,'e il consuntivo ci si aggancia');
ok(voci.every(v=>v.client_id==='c1'&&v.project_id==='p1'),'tutti col cliente e il progetto giusti');

console.log('\n=== C. Ricaricare lo stesso foglio non duplica ===');
await carica(fCsv);
const kpi2=await pg.evaluate(()=>[...document.querySelectorAll('#app .kpiGrid strong')].map(x=>x.textContent.trim()));
ok(kpi2[1]==='3','le tre righe risultano già presenti',kpi2.join(' / '));
ok(kpi2[0]==='0','e non c\'è niente da caricare',kpi2.join(' / '));

console.log('\n=== D. Un file che non c\'entra lo dice, non esplode ===');
const fAltro=path.join(dir,'altro.csv');fs.writeFileSync(fAltro,'Pippo,Pluto\n1,2');
await carica(fAltro);
const t2=await pg.evaluate(()=>document.getElementById('app').textContent.replace(/\s+/g,' '));
ok(/Data, Cliente, Progetto/.test(t2),'spiega quali colonne servono',(t2.match(/Nella prima riga[^<]{0,80}/)||[''])[0]);
ok(!/Cosa succederà/.test(t2),'e non mostra un\'anteprima finta');

console.log('\n=== E. Il .xlsx viene riconosciuto e spiegato ===');
const fZip=path.join(dir,'finto.xlsx');fs.writeFileSync(fZip,'PK\x03\x04finto');
await carica(fZip);
const t3=await pg.evaluate(()=>document.getElementById('app').textContent.replace(/\s+/g,' '));
ok(/Salva con nome/.test(t3),'dice cosa fare invece di fallire in silenzio');

console.log('\n=== F. La sede parte da Remoto ===');
// quasi tutto il lavoro si fa da remoto: e' il valore di partenza, e
// la trasferta la si segna quando capita
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(500);
ok(await pg.evaluate(()=>document.querySelector('#app form.form [name="work_site"]')?.value)==='Remoto',
  'il consuntivo nuovo nasce con sede Remoto',
  await pg.evaluate(()=>document.querySelector('#app form.form [name="work_site"]')?.value||'vuota'));
const senzaSede=(await store()).find(v=>v.entry_date==='2026-09-01'&&v.wbs_id==='w10');
ok(senzaSede&&senzaSede.work_site==='Remoto','e la riga del foglio senza Sede diventa Remoto',
  senzaSede?(senzaSede.work_site||'vuota'):'non trovata');

ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
