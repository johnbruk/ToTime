// Duplicare un consuntivo.
//
// Prima scriveva dritto nel database una copia datata oggi, senza
// portarsi dietro la voce su cui erano registrate le ore. Col vincolo
// che la pretende, il database rifiutava: "duplica" sembrava
// semplicemente non fare niente. Qui si prova che la copia arrivi
// intera, e che la data NON sia gia' riempita — deve sceglierla chi
// duplica, altrimenti ci si ritrova doppioni su oggi senza volerlo.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const M=new Date().toISOString().slice(0,7);
const g=n=>`${M}-${String(n).padStart(2,'0')}`;
const EXTRA=`
  engagements:[{id:'e1',user_id:'u1',client_id:'c1',project_id:'p1',code:'SOL-EQU-2026-001',year:2026,seq:1,name:'Contratto',status:'active'}],
  engagement_references:[],
  wbs_items:[{id:'w10',user_id:'u1',engagement_id:'e1',activity_code:'10',code:'SOL-EQU-2026-001-10',name:'Equans',billable:true,status:'active',sort_order:10}],
  billing_lines:[],invoice_line_allocations:[],`;
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    if(p.endsWith('mock.html')){let h=b.toString();
      h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
      h=h.replace("{id:'c1',name:'Equans',daily_rate:480","{id:'c1',name:'Solution',code:'SOL',daily_rate:480");
      h=h.replace("{id:'p1',client_id:'c1',name:'Beta',active:true}","{id:'p1',client_id:'c1',short_code:'EQU',code:'SOL-EQU',name:'Equans',status:'active',active:true}");
      h=h.replace(/timesheet_entries:\[[\s\S]*?\n  \],/,`timesheet_entries:[{id:'v1',entry_date:'${g(3)}',client_id:'c1',project_id:'p1',wbs_id:'w10',hours:6,work_city:'Milano',description:'SAL settimanale',daily_rate_snapshot:480,standard_hours_snapshot:8}],`);
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
const campo=n=>pg.evaluate(x=>{const e=document.querySelector(`#app form.form [name="${x}"]`);return e?e.value:null},n);
const vista=()=>pg.evaluate(()=>document.documentElement.getAttribute('data-view'));
const conta=()=>pg.evaluate(()=>window.__stores.timesheet_entries.length);

console.log('\n=== A. Duplica apre la copia, non la scrive di nascosto ===');
await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(600);
// le righe dell'elenco aprono la voce con editEntry: l'id sta li'
await pg.evaluate(()=>window.editEntry(window.__stores.timesheet_entries[0].id,'daily'));
await pg.waitForTimeout(500);
ok(await vista()==='dailyEdit','si apre il consuntivo',await vista());
const prima=await conta();
await pg.evaluate(()=>[...document.querySelectorAll('#app button')].find(x=>/^Duplica/.test(x.textContent.trim())).click());
await pg.waitForTimeout(700);
ok(await vista()==='dailyForm','duplica porta al modulo di una voce nuova',await vista());
ok(await conta()===prima,'e non ha ancora scritto niente',(await conta())+' voci, erano '+prima);

console.log('\n=== B. La copia e\' intera, ma la data no ===');
ok(await campo('entry_date')==='','LA DATA E\' VUOTA: la si deve scegliere',JSON.stringify(await campo('entry_date')));
ok(await pg.evaluate(()=>document.querySelector('#app form.form [name="entry_date"]').required),
  'ed e\' obbligatoria, quindi non si salva per sbaglio senza');
ok(await campo('client_id')==='c1','il cliente e\' quello di partenza',await campo('client_id'));
ok(await campo('wbs_id')==='w10','e la voce su cui erano registrate le ore',await campo('wbs_id'));
ok(await campo('hours')==='6','le ore',await campo('hours'));
ok(await campo('work_city')==='Milano','il luogo',await campo('work_city'));
ok(await campo('description')==='SAL settimanale','e la descrizione',await campo('description'));

console.log('\n=== C. Scelta la data, la copia si salva ===');
await pg.evaluate(d=>{const f=document.querySelector('#app form.form');f.entry_date.value=d;f.requestSubmit()},g(4));
await pg.waitForTimeout(900);
ok(await conta()===prima+1,'la copia viene scritta',(await conta())+' voci');
const ultima=await pg.evaluate(()=>window.__stores.timesheet_entries.slice(-1)[0]);
ok(ultima&&ultima.entry_date===g(4),'sulla data scelta',ultima&&ultima.entry_date);
ok(ultima&&ultima.wbs_id==='w10','PORTANDOSI DIETRO LA VOCE: era questo a farla fallire',ultima&&ultima.wbs_id);
ok(ultima&&Number(ultima.hours)===6,'con le ore giuste',ultima&&String(ultima.hours));

ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
