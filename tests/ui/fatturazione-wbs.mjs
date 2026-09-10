// La regola di fondo: si registra sulla WBS, si fattura sul progetto.
// Piu' WBS devono confluire in UNA riga di fattura, mai una riga per
// WBS, e la stessa ora non si deve poter fatturare due volte.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const M=new Date().toISOString().slice(0,7);   // mese in corso
const g=n=>`${M}-${String(n).padStart(2,'0')}`;
// tre WBS: due fatturabili, una no. Quattro giornate + tre + due.
const EXTRA=`
  engagements:[{id:'e1',user_id:'u1',client_id:'c1',code:'SO-2026-001',year:2026,seq:1,name:'Incarico',status:'active',invoice_reference:'LI_202601_Nome_Cognome',engagement_letter:'LI_202601'}],
  engagement_references:[],
  wbs_items:[
    {id:'w10',user_id:'u1',project_id:'p1',activity_code:'10',code:'SO-2026-001-EQU-10',name:'Project Management',kind:'project_management',billable:true,status:'active',sort_order:10},
    {id:'w20',user_id:'u1',project_id:'p1',activity_code:'20',code:'SO-2026-001-EQU-20',name:'Process Mapping',kind:'analysis',billable:true,status:'active',sort_order:20},
    {id:'w30',user_id:'u1',project_id:'p1',activity_code:'30',code:'SO-2026-001-EQU-30',name:'Interne',kind:'internal',billable:false,status:'active',sort_order:30}],
  billing_lines:[],invoice_line_allocations:[],`;
const VOCI=`
    {id:'v1',entry_date:'${g(2)}',client_id:'c1',project_id:'p1',wbs_id:'w10',hours:32,daily_rate_snapshot:480,standard_hours_snapshot:8},
    {id:'v2',entry_date:'${g(3)}',client_id:'c1',project_id:'p1',wbs_id:'w20',hours:24,daily_rate_snapshot:480,standard_hours_snapshot:8},
    {id:'v3',entry_date:'${g(4)}',client_id:'c1',project_id:'p1',wbs_id:'w30',hours:16,daily_rate_snapshot:480,standard_hours_snapshot:8}`;
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    if(p.endsWith('mock.html')){let h=b.toString();
      h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
      h=h.replace("{id:'c1',name:'Equans',daily_rate:480","{id:'c1',name:'Equans',code:'SO',daily_rate:480");
      h=h.replace("{id:'p1',client_id:'c1',name:'Beta',active:true}","{id:'p1',client_id:'c1',engagement_id:'e1',short_code:'EQU',code:'SO-2026-001-EQU',name:'Beta',end_client_name:'EQUANS',billing_unit:'day',status:'active',active:true}");
      h=h.replace(/timesheet_entries:\[[\s\S]*?\n  \],/,'timesheet_entries:['+VOCI+'],');
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
await pg.evaluate(()=>window.go('fatturazioneCommessa'));await pg.waitForTimeout(500);

console.log('\n=== A. Il prospetto di controllo per WBS ===');
ok(await pg.$('table.prospetto')!==null,'il prospetto c\'è');
const righe=await pg.evaluate(()=>[...document.querySelectorAll('table.prospetto tbody tr')]
  .map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent.replace(/\s+/g,' ').trim())));
ok(righe.length===3,'una riga per WBS: il dettaglio si vede tutto',righe.length+' righe');
ok(righe.some(r=>/Project Management/.test(r[0]))&&righe.some(r=>/Process Mapping/.test(r[0])),'con i nomi delle WBS');
const nonFatt=righe.find(r=>/Interne/.test(r[0]));
ok(nonFatt&&nonFatt[2]==='—','la WBS non fatturabile non conta come fatturabile',nonFatt&&nonFatt[2]);
ok(nonFatt&&nonFatt[4]==='—','e non entra nel da fatturare',nonFatt&&nonFatt[4]);
const piede=await pg.evaluate(()=>[...document.querySelectorAll('table.prospetto tfoot td')].map(td=>td.textContent.trim()));
ok(/72,0/.test(piede[1]),'consuntivato totale 32+24+16 = 72 h',piede[1]);
ok(/56,0/.test(piede[4]),'da fatturare 32+24 = 56 h, le 16 non fatturabili restano fuori',piede[4]);

console.log('\n=== B. Una riga sola, non una per WBS ===');
const prima=await pg.evaluate(()=>window.__stores.billing_lines.length);
await pg.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Genera la riga/.test(x.textContent));b&&b.click()});
await pg.waitForTimeout(1200);
const linee=await pg.evaluate(()=>window.__stores.billing_lines);
ok(linee.length===prima+1,'viene creata UNA riga di fattura',linee.length+' righe totali');
const L=linee[linee.length-1];
ok(L&&L.project_id==='p1','la riga punta al progetto',L&&L.project_id);
ok(L&&!('wbs_id' in L),'e non alla WBS');
ok(L&&Math.abs(Number(L.quantity)-7)<0.01,'quantità 56 h / 8 = 7 giornate',L&&L.quantity);
ok(L&&Math.abs(Number(L.amount)-3360)<0.5,'importo 7 × 480 = 3.360 €',L&&L.amount);
ok(L&&L.snapshot_invoice_reference==='LI_202601_Nome_Cognome','porta il riferimento amministrativo della commessa',L&&L.snapshot_invoice_reference);
ok(L&&L.snapshot_project_code==='SO-2026-001-EQU','e lo snapshot del codice progetto',L&&L.snapshot_project_code);

console.log('\n=== C. Si risale dalla fattura ai consuntivi ===');
const alloc=await pg.evaluate(()=>window.__stores.invoice_line_allocations);
ok(alloc.length===2,'una allocazione per ogni registrazione fatturabile',alloc.length);
ok(alloc.every(a=>a.billing_line_id===L.id),'tutte collegate alla stessa riga');
ok(new Set(alloc.map(a=>a.wbs_id)).size===2,'e si sa da quali WBS arrivano',[...new Set(alloc.map(a=>a.wbs_id))].join(' '));
ok(!alloc.some(a=>a.source_id==='v3'),'la registrazione non fatturabile non è allocata');
ok(Math.abs(alloc.reduce((t,a)=>t+Number(a.quantity),0)-56)<0.01,'le ore allocate fanno 56');

console.log('\n=== D. La stessa ora non si fattura due volte ===');
await pg.evaluate(()=>window.go('fatturazioneCommessa'));await pg.waitForTimeout(600);
const piede2=await pg.evaluate(()=>[...document.querySelectorAll('table.prospetto tfoot td')].map(td=>td.textContent.trim()));
ok(/56,0/.test(piede2[3]),'ora risultano 56 h già fatturate',piede2[3]);
ok(/^0,0|—/.test(piede2[4]),'e zero da fatturare',piede2[4]);
const bottone=await pg.evaluate(()=>!![...document.querySelectorAll('button')].find(x=>/Genera la riga/.test(x.textContent)));
ok(!bottone,'il pulsante per generare non c\'è più');
ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
