// Gerarchia Cliente > Progetto > Commessa > Attivita' nei moduli di
// consuntivo. Deve comparire dove la gerarchia esiste e sparire dove
// non c'e' ancora, cosi' chi non ha migrato tutto continua a lavorare.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const EXTRA=`
  engagements:[{id:'e1',user_id:'u1',client_id:'c1',project_id:'p1',code:'SO-EQU-2026-001',year:2026,seq:1,name:'Incarico 2026',status:'active',engagement_letter:'LI_202601',invoice_reference:'LI_202601_Nome_Cognome'}],
  engagement_references:[],
  wbs_items:[
    {id:'w10',user_id:'u1',engagement_id:'e1',activity_code:'10',code:'SO-EQU-2026-001-10',name:'Project Management',kind:'project_management',billable:true,status:'active',sort_order:10},
    {id:'w20',user_id:'u1',engagement_id:'e1',activity_code:'20',code:'SO-EQU-2026-001-20',name:'Process Mapping',kind:'analysis',billable:true,status:'active',sort_order:20},
    {id:'w90',user_id:'u1',engagement_id:'e1',activity_code:'90',code:'SO-EQU-2026-001-90',name:'Trasferte',kind:'travel',billable:false,status:'closed',sort_order:90}],
  billing_lines:[],invoice_line_allocations:[],`;
function servi(conGerarchia){
  return http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
    fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
      if(p.endsWith('mock.html')){let h=b.toString();
        if(conGerarchia){
          h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
          h=h.replace("{id:'c1',name:'Equans',daily_rate:480","{id:'c1',name:'Equans',code:'SO',daily_rate:480");
          h=h.replace("{id:'p1',client_id:'c1',name:'Beta',active:true}","{id:'p1',client_id:'c1',short_code:'EQU',code:'SO-EQU',name:'Beta',status:'active',active:true}");
        }
        b=Buffer.from(h);}
      s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
}
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});

// --- A) con la gerarchia ---
let srv=servi(true); await new Promise(r=>srv.listen(0,r));
let pg=await b.newPage({viewport:{width:1280,height:900}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://127.0.0.1:${srv.address().port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
console.log('\n=== A. Dove la gerarchia esiste ===');
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(350);
const campi=await pg.evaluate(()=>[...document.querySelectorAll('#app form.form [name]')].map(e=>e.name));
ok(campi.includes('engagement_id')&&campi.includes('wbs_id'),'il modulo mostra commessa e WBS',campi.join(', '));
ok(!campi.includes('activity_id'),'e non chiede piu\' l\'attivita\' sciolta');
const opts=async n=>pg.evaluate(x=>[...document.querySelectorAll(`[name="${x}"] option`)].map(o=>o.value).filter(Boolean),n);
// la cascata parte dal progetto: e' il progetto a reggere le commesse
ok((await opts('hier_project_id')).includes('p1'),'il progetto e\' selezionabile subito');
ok((await opts('engagement_id')).length===0,'la commessa resta vuota finche\' non si sceglie il progetto');
await pg.selectOption('[name="hier_project_id"]','p1');await pg.waitForTimeout(200);
ok((await opts('engagement_id')).includes('e1'),'scelto il progetto, compaiono le sue commesse');
ok((await opts('wbs_id')).length===0,'l\'attivita\' resta vuota finche\' non si sceglie la commessa');
await pg.selectOption('[name="engagement_id"]','e1');await pg.waitForTimeout(200);
const wbs=await opts('wbs_id');
ok(wbs.includes('w10')&&wbs.includes('w20'),'scelta la commessa, compaiono le sue attivita\'',wbs.join(' '));
ok(!wbs.includes('w90'),'l\'attivita\' chiusa non e\' selezionabile per nuove registrazioni');
await pg.selectOption('[name="wbs_id"]','w10');await pg.waitForTimeout(200);
ok(/SO-EQU-2026-001-10/.test(await pg.evaluate(()=>document.getElementById('wbsHint')?.textContent||'')),'sotto la WBS si legge il codice completo');

console.log('\n=== B. Salvare senza WBS non si puo\' ===');
const prima=await pg.evaluate(()=>window.__stores.timesheet_entries.length);
await pg.evaluate(()=>{const f=document.querySelector('form.form');f.wbs_id.value='';f.requestSubmit()});
await pg.waitForTimeout(500);
ok(await pg.evaluate(()=>window.__stores.timesheet_entries.length)===prima,'senza WBS non salva',prima+' voci, invariate');
ok(/WBS/i.test(await pg.evaluate(()=>document.querySelector('.toast')?.textContent||'')),'e lo dice');

console.log('\n=== C. Salvando, la voce porta la WBS ===');
// dopo il messaggio d'errore il modulo si ricostruisce: la cascata
// va rifatta, altrimenti si assegnerebbe una WBS a un menu vuoto
await pg.selectOption('[name="hier_project_id"]','p1');await pg.waitForTimeout(200);
await pg.selectOption('[name="engagement_id"]','e1');await pg.waitForTimeout(200);
await pg.selectOption('[name="wbs_id"]','w10');await pg.waitForTimeout(200);
await pg.evaluate(()=>{const f=document.querySelector('form.form');f.hours.value='6';f.requestSubmit()});
await pg.waitForTimeout(700);
const ultima=await pg.evaluate(()=>window.__stores.timesheet_entries.slice(-1)[0]);
ok(ultima&&ultima.wbs_id==='w10','la registrazione porta la WBS scelta',ultima&&ultima.wbs_id);
ok(ultima&&ultima.project_id==='p1','e il progetto si ricava dalla WBS, non si scrive a mano',ultima&&ultima.project_id);
ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();srv.close();

// --- B) senza la gerarchia: deve restare tutto come prima ---
console.log('\n=== D. Dove la gerarchia non c\'e\' ancora ===');
srv=servi(false); await new Promise(r=>srv.listen(0,r));
pg=await b.newPage({viewport:{width:1280,height:900}});
const errs2=[];pg.on('pageerror',e=>errs2.push(e.message));
await pg.goto(`http://127.0.0.1:${srv.address().port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(350);
const campi2=await pg.evaluate(()=>[...document.querySelectorAll('#app form.form [name]')].map(e=>e.name));
ok(!campi2.includes('wbs_id'),'niente WBS nel modulo',campi2.join(', '));
ok(campi2.includes('project_id')&&campi2.includes('activity_id'),'restano progetto e attivita\', come prima');
const prima2=await pg.evaluate(()=>window.__stores.timesheet_entries.length);
await pg.evaluate(()=>{const f=document.querySelector('form.form');f.hours.value='4';f.requestSubmit()});
await pg.waitForTimeout(700);
ok(await pg.evaluate(()=>window.__stores.timesheet_entries.length)===prima2+1,'e si salva senza chiedere niente di nuovo');
ok(errs2.length===0,'nessun errore JS',errs2.slice(0,2).join(' | ')||'nessuno');
await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
