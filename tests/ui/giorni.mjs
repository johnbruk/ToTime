// Salvare e passare al giorno dopo (o prima).
//
// Il pulsante serve a ripassare i consuntivi gia' inseriti: dopo il
// salvataggio si apre il giorno CONSUNTIVATO successivo, saltando i
// giorni vuoti. Non deve mai creare consuntivi nuovi: prima apriva il
// modulo vuoto del giorno accanto e, salvandolo, nascevano voci che
// nessuno aveva chiesto.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const M=new Date().toISOString().slice(0,7);
const g=n=>`${M}-${String(n).padStart(2,'0')}`;
const EXTRA=`
  engagements:[{id:'e1',user_id:'u1',client_id:'c1',project_id:'p1',code:'SOL-EQU-2026-001',year:2026,seq:1,name:'Contratto',status:'active'}],
  engagement_references:[],
  wbs_items:[{id:'w10',user_id:'u1',engagement_id:'e1',activity_code:'10',code:'SOL-EQU-2026-001-10',name:'Equans',kind:'activity',billable:true,status:'active',sort_order:10}],
  billing_lines:[],invoice_line_allocations:[],`;
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    if(p.endsWith('mock.html')){let h=b.toString();
      h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
      h=h.replace("{id:'c1',name:'Equans',daily_rate:480","{id:'c1',name:'Solution',code:'SOL',daily_rate:480");
      h=h.replace("{id:'p1',client_id:'c1',name:'Beta',active:true}","{id:'p1',client_id:'c1',short_code:'EQU',code:'SOL-EQU',name:'Equans',status:'active',active:true}");
      h=h.replace(/timesheet_entries:\[[\s\S]*?\n  \],/,`timesheet_entries:[{id:'v9',entry_date:'${g(9)}',client_id:'c1',project_id:'p1',wbs_id:'w10',hours:3,daily_rate_snapshot:480,standard_hours_snapshot:8}],`);
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

const voci=()=>pg.evaluate(()=>window.__stores.timesheet_entries.map(e=>String(e.entry_date).slice(0,10)).sort());
const premi=re=>pg.evaluate(r=>[...document.querySelectorAll('#app button')].find(x=>new RegExp(r).test(x.textContent)).click(),re);
const avviso=()=>pg.evaluate(()=>document.body.innerText);

console.log('\n=== A. Dal modulo nuovo si salta al giorno gia\' consuntivato ===');
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(450);
ok(await pg.$('button:has-text("Salva e vai al giorno dopo")')!==null,'il pulsante c\'è');
await pg.evaluate(d=>{const f=document.querySelector('#app form.form');f.entry_date.value=d;
  const primo=[...f.client_id.options].find(o=>o.value);
  if(primo){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}},g(2));
await pg.waitForTimeout(400);
ok(await campo('hier_project_id')==='p1','il progetto si prende da se\'',await campo('hier_project_id'));
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');f.hours.value='6'});
const prima=await conta();
await premi('Salva e vai al giorno dopo');
await pg.waitForTimeout(900);
ok(await conta()===prima+1,'il consuntivo è stato salvato',(await conta())+' voci');
ok(await vista()==='dailyEdit','si apre in modifica il giorno consuntivato dopo',await vista());
ok(await campo('entry_date')===g(9),'saltando i giorni vuoti dal 3 all\'8',await campo('entry_date'));
ok(await campo('hours')==='3','con le ore che c\'erano già',await campo('hours'));
const tutti=await voci();
ok(![3,4,5,6,7,8].some(n=>tutti.includes(g(n))),'e nei giorni saltati non è nato niente',tutti.join(' '));

console.log('\n=== B. Dopo l\'ultimo consuntivo non si crea niente ===');
const prima2=await conta();
await premi('Salva e vai al giorno dopo');
await pg.waitForTimeout(900);
ok(await conta()===prima2,'nessuna voce nuova',(await conta())+' voci');
ok(await vista()==='timesheet','si torna all\'elenco',await vista());
ok(/Non ci sono altri consuntivi dopo il/.test(await avviso()),'e lo si dice');

console.log('\n=== C. Si torna anche indietro, sempre sui giorni consuntivati ===');
const v9=await pg.evaluate(()=>window.__stores.timesheet_entries.find(e=>e.id==='v9').id);
await pg.evaluate(id=>window.navigateTo('dailyEdit',{edit:id}),v9);await pg.waitForTimeout(500);
ok(await pg.$('button:has-text("Salva e vai al giorno prima")')!==null,'dal modulo di modifica si va anche al giorno prima');
const prima3=await conta();
await premi('giorno prima');
await pg.waitForTimeout(900);
ok(await vista()==='dailyEdit','si apre in modifica',await vista());
ok(await campo('entry_date')===g(2),'il giorno consuntivato prima, non l\'8 vuoto',await campo('entry_date'));
ok(await campo('hours')==='6','con le sue ore',await campo('hours'));
ok(await conta()===prima3,'e senza voci nuove',(await conta())+' voci');

console.log('\n=== D. Prima del primo consuntivo ci si ferma ===');
await premi('giorno prima');
await pg.waitForTimeout(900);
ok(await vista()==='timesheet','si torna all\'elenco',await vista());
ok(/Non ci sono altri consuntivi prima del/.test(await avviso()),'e lo si dice');
ok(await conta()===prima3,'sempre senza voci nuove',(await conta())+' voci');

console.log('\n=== E. Il cliente salvato è quello scelto ===');
// Il difetto di allora: scegliendo un cliente diverso dal primo, le
// <option> uscivano senza «selected» e il browser prendeva la prima.
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(500);
const reali=await pg.evaluate(()=>{const s=document.querySelector('#app [name=client_id]');
  return s?[...s.options].map(o=>o.value).filter(Boolean):[]});
ok(reali.length>1,'nel banco di prova ci sono piu\' clienti',reali.join(', '));
const altro=reali[1];
await pg.evaluate(v=>{const s=document.querySelector('#app [name=client_id]');
  s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}))},altro);
await pg.waitForTimeout(400);
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  f.querySelector('[name=entry_date]').value='2026-07-20';
  f.querySelector('[name=hours]').value='6';});
await premi('giorno dopo');
await pg.waitForTimeout(1500);
ok(await campo('entry_date')===g(2),'si salta al primo giorno consuntivato dopo il 20 luglio',await campo('entry_date'));
ok(!(await voci()).includes('2026-07-21'),'e il 21 luglio resta vuoto');
const salvato=await pg.evaluate(()=>(window.__ins||[])
  .filter(x=>x.__table==='timesheet_entries'&&x.entry_date==='2026-07-20').map(x=>x.client_id));
ok(salvato.includes(altro),'sul database è finito il cliente scelto',JSON.stringify(salvato));

ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
