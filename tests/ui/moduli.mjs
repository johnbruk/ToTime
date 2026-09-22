// Ogni modulo che scrive ore o compensi deve saper agganciare la voce.
//
// Il consuntivo giornaliero e la griglia erano stati convertiti alla
// gerarchia; l'impegno continuativo e il compenso una tantum no. Su un
// cliente che ha commesse il database pretende la voce, quindi quei
// due rifiutavano con "la registrazione va collegata a una WBS" — un
// messaggio giusto, davanti a un modulo che la voce non la chiedeva
// nemmeno. Qui si prova che ogni modulo la chieda e la porti.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const EXTRA=`
  engagements:[{id:'e1',user_id:'u1',client_id:'c1',project_id:'p1',code:'K2-RICH-2026-001',year:2026,seq:1,name:'Contratto',status:'active'}],
  engagement_references:[],
  wbs_items:[{id:'w10',user_id:'u1',engagement_id:'e1',activity_code:'10',code:'K2-RICH-2026-001-10',name:'Omnichannel',billable:true,status:'active',sort_order:10}],
  billing_lines:[],invoice_line_allocations:[],`;
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    if(p.endsWith('mock.html')){let h=b.toString();
      h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
      h=h.replace(/const clients=\[[\s\S]*?\];/,"const clients=[{id:'c1',user_id:'u1',name:'K2',code:'K2',daily_rate:480,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];");
      h=h.replace(/const projects=\[[\s\S]*?\];/,"const projects=[{id:'p1',client_id:'c1',short_code:'RICH',code:'K2-RICH',name:'Omnichannel',status:'active',active:true}];");
      h=h.replace(/timesheet_entries:\[[\s\S]*?\n  \],/,'timesheet_entries:[],');
      b=Buffer.from(h);}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
const pg=await b.newPage({viewport:{width:1280,height:1100}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
pg.on('dialog',d=>d.accept());
await pg.goto(`http://127.0.0.1:${srv.address().port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
const campi=()=>pg.evaluate(()=>[...document.querySelectorAll('#app form.form [name]')].map(e=>e.name));
const store=n=>pg.evaluate(x=>window.__stores[x],n);

console.log('\n=== A. Impegno continuativo ===');
await pg.evaluate(()=>window.go('tmForm'));await pg.waitForTimeout(600);
let c=await campi();
ok(c.includes('wbs_id'),'il modulo chiede su cosa registrare',c.join(', '));
ok(!c.includes('activity_id'),'e non l\'attività sciolta di prima');
const scelto=await pg.evaluate(()=>document.querySelector('#app [name="wbs_id"]')?.value||'');
ok(scelto==='w10','con la voce già scelta: ce n\'è una sola',scelto||'vuota');
const primaTm=(await store('timesheet_entries')).length;
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  f.start_date.value='2026-09-21';f.end_date.value='2026-09-22';f.hours.value='4';f.requestSubmit()});
await pg.waitForTimeout(1400);
const voci=await store('timesheet_entries');
ok(voci.length>primaTm,'genera i consuntivi',voci.length+' voci');
ok(voci.length>0&&voci.every(v=>v.wbs_id==='w10'),'TUTTI CON LA VOCE AGGANCIATA: era questo a farlo fallire',
  voci.length?String(voci[0].wbs_id):'—');
ok(voci.length>0&&voci.every(v=>v.project_id==='p1'),'e col progetto ricavato da lei');

console.log('\n=== B. Compenso una tantum ===');
await pg.evaluate(()=>window.go('manualForm'));await pg.waitForTimeout(600);
c=await campi();
ok(c.includes('wbs_id'),'anche qui si registra sulla voce',c.join(', '));
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  f.entry_date.value='2026-09-21';f.amount.value='500';f.requestSubmit()});
await pg.waitForTimeout(1200);
const man=await store('manual_entries');
ok(man.length===1,'il compenso si salva',man.length+' voci');
ok(man[0]&&man[0].wbs_id==='w10','con la voce agganciata',man[0]&&String(man[0].wbs_id));
ok(man[0]&&man[0].project_id==='p1','e il progetto giusto',man[0]&&String(man[0].project_id));

console.log('\n=== C. Dove la gerarchia non c\'è, resta il modulo di prima ===');
await pg.evaluate(()=>{window.__stores.engagements.length=0;window.__stores.wbs_items.length=0});
await pg.evaluate(()=>window.reload&&window.reload());await pg.waitForTimeout(700);
await pg.evaluate(()=>window.go('tmForm'));await pg.waitForTimeout(500);
c=await campi();
ok(c.includes('project_id')&&c.includes('activity_id'),'tornano progetto e attività sciolti',c.join(', '));
ok(!c.includes('wbs_id'),'e la voce non viene chiesta');

console.log('\n=== D. Nessun modulo resta indietro ===');
// il controllo che mancava: ogni maschera che scrive ore o compensi
// deve chiedere la voce dove la gerarchia c'e'. Averlo fatto per due
// moduli su quattro e' esattamente come siamo arrivati fin qui.
await pg.evaluate(()=>{window.location.reload()});
await pg.waitForTimeout(2500);
const indietro=[];
for(const v of ['dailyForm','tmForm','manualForm']){
  await pg.evaluate(x=>window.go(x),v);await pg.waitForTimeout(450);
  const n=await pg.evaluate(()=>[...document.querySelectorAll('#app form.form [name]')].map(e=>e.name));
  if(!n.includes('wbs_id'))indietro.push(v+' → '+n.join(', '));
}
ok(indietro.length===0,'ogni modulo che scrive ore o compensi chiede la voce',
  indietro.join(' | ')||'dailyForm, tmForm, manualForm');

ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
