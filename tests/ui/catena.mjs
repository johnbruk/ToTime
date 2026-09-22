// Il giro completo, come lo farebbe lui: cliente nuovo senza niente
// sotto, ci si crea il progetto, ci si crea la commessa, e ci si
// registra sopra un consuntivo. Non basta che le pagine si aprano:
// conta cosa finisce scritto, e sotto chi.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const EXTRA=`engagements:[],engagement_references:[],wbs_items:[],billing_lines:[],invoice_line_allocations:[],`;
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    if(p.endsWith('mock.html')){let h=b.toString();
      h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
      // un solo cliente, CON codice, e NESSUN progetto: il punto di partenza vero
      h=h.replace(/const clients=\[[\s\S]*?\];/,"const clients=[{id:'c1',user_id:'u1',name:'Solution',code:'SOL',daily_rate:480,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];");
      h=h.replace(/const projects=\[[\s\S]*?\];/,"const projects=[];");
      h=h.replace(/timesheet_entries:\[[\s\S]*?\n  \],/,'timesheet_entries:[],');
      b=Buffer.from(h);}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
const pg=await b.newPage({viewport:{width:1280,height:1000}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
pg.on('dialog',d=>d.accept());
await pg.goto(`http://127.0.0.1:${srv.address().port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(1000);
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
const V=()=>pg.evaluate(()=>document.documentElement.getAttribute('data-view'));
const store=n=>pg.evaluate(x=>window.__stores[x],n);
const premi=re=>pg.evaluate(r=>{const x=[...document.querySelectorAll('#app button')].find(y=>new RegExp(r).test(y.textContent));if(x){x.click();return true}return false},re);

console.log('\n--- 0. il codice cliente si scrive davvero ---');
// Era il bug alla radice: il campo c'era nel modulo e il salvataggio
// non lo scriveva. Senza codice cliente non si crea nessun progetto,
// perche' il codice del progetto deriva da quello.
await pg.evaluate(()=>window.go('clients'));await pg.waitForTimeout(350);
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  f.name.value='Cliente di prova';f.code.value='prv';f.requestSubmit()});
await pg.waitForTimeout(900);
const cl=await store('clients');
const nuovo=cl.find(c=>c.name==='Cliente di prova');
ok(!!nuovo,'il cliente viene creato',cl.length+' clienti');
ok(nuovo&&nuovo.code==='PRV','E IL CODICE VIENE SCRITTO, normalizzato in maiuscolo',
  nuovo?('code='+(nuovo.code===null?'NULLO':nuovo.code)):'—');

// e si deve poter correggere finche' non ci sono progetti sotto
await pg.evaluate(()=>window.go('clients'));await pg.waitForTimeout(350);
await pg.evaluate(n=>{const r=[...document.querySelectorAll('#app .list .row')].find(x=>new RegExp(n).test(x.textContent));if(r)r.click()},'Cliente di prova');
await pg.waitForTimeout(400);
await premi('Modifica dati del cliente');await pg.waitForTimeout(400);
const campoCod=await pg.evaluate(()=>{const e=document.querySelector('#app form.form [name="code"]');
  return e?{presente:true,bloccato:e.readOnly,valore:e.value}:{presente:false}});
ok(campoCod.presente&&!campoCod.bloccato,'il codice e\' modificabile finche\' non ci sono progetti',JSON.stringify(campoCod));
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');f.code.value='PR2';f.requestSubmit()});
await pg.waitForTimeout(900);
const cl2=await store('clients');
ok((cl2.find(c=>c.name==='Cliente di prova')||{}).code==='PR2','e la correzione viene salvata',
  (cl2.find(c=>c.name==='Cliente di prova')||{}).code||'—');

console.log('\n--- 1. dal cliente, che non ha ancora niente sotto ---');
// va aperto SOLUTION, non la prima riga: la sezione 0 ha aggiunto un
// cliente di prova e l'ordine dell'elenco non e' piu' quello di prima
await pg.evaluate(()=>window.go('clients'));await pg.waitForTimeout(350);
await pg.evaluate(()=>[...document.querySelectorAll('#app .list .row')]
  .find(r=>/Solution/.test(r.textContent)).click());await pg.waitForTimeout(400);
ok(await V()==='clientDetail','si apre la scheda del cliente',await V());
ok(await premi('Nuovo progetto'),'il pulsante per creare il progetto c\'è e risponde');
await pg.waitForTimeout(450);
ok(await V()==='projectNew','si apre il modulo del progetto',await V());

console.log('\n--- 2. si crea il progetto ---');
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  f.short_code.value='EQU';f.name.value='Equans';f.requestSubmit()});
await pg.waitForTimeout(1000);
const prj=await store('projects');
ok(prj.length===1,'il progetto è stato scritto',prj.length+' progetti');
ok(prj[0]&&prj[0].client_id==='c1','ED È LEGATO AL CLIENTE',prj[0]?('client_id='+prj[0].client_id):'—');
ok(prj[0]&&prj[0].short_code==='EQU'&&prj[0].name==='Equans','col codice e il nome dati',
  prj[0]?(prj[0].short_code+' / '+prj[0].name):'—');

console.log('\n--- 3. la commessa nasce da sola, senza un secondo modulo ---');
ok(await V()==='clientDetail','si torna alla scheda del cliente, non a un altro modulo',await V());
const eng=await store('engagements');
ok(eng.length===1,'la commessa è stata creata senza chiedere niente',eng.length+' commesse');
ok(eng[0]&&eng[0].project_id===prj[0].id,'ED È LEGATA AL PROGETTO',eng[0]?('project_id='+(eng[0].project_id===prj[0].id?'giusto':eng[0].project_id)):'—');
ok(eng[0]&&eng[0].client_id==='c1','e porta anche il cliente',eng[0]?eng[0].client_id:'—');
const wbs=await store('wbs_items');
ok(wbs.length===1,'e la voce su cui registrare è nata da sé',wbs.length+' voci');
ok(wbs[0]&&wbs[0].engagement_id===eng[0].id,'agganciata alla commessa giusta');

console.log('\n--- 4. il progetto si vede sotto il cliente ---');
await pg.evaluate(()=>window.go('clients'));await pg.waitForTimeout(350);
await pg.evaluate(()=>[...document.querySelectorAll('#app .list .row')]
  .find(r=>/Solution/.test(r.textContent)).click());await pg.waitForTimeout(450);
const righe=await pg.evaluate(()=>[...document.querySelectorAll('#app .list .row')].map(r=>r.textContent.replace(/\s+/g,' ').trim()));
ok(righe.some(r=>/Equans/.test(r)),'compare nella scheda del cliente',righe.join(' | ')||'nessuna riga');
ok(righe.some(r=>/1 commessa/.test(r)),'con la sua commessa contata',righe.find(r=>/Equans/.test(r))||'');

console.log('\n--- 5. ci si registra sopra un consuntivo ---');
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(500);
// il modulo si apre sul primo cliente dell'elenco: qui serve Solution
await pg.selectOption('#app form.form [name="client_id"]','c1');await pg.waitForTimeout(400);
const vis=await pg.evaluate(()=>{const o={};for(const id of ['prjField','engField','wbsField']){const e=document.getElementById(id);o[id]=e?(e.hidden?'nascosto':'visibile'):'assente'}return o});
ok(vis.prjField==='nascosto'&&vis.engField==='nascosto'&&vis.wbsField==='nascosto',
  'il modulo non chiede niente: ce n\'è uno solo di ogni livello',JSON.stringify(vis));
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');f.hours.value='8';f.requestSubmit()});
await pg.waitForTimeout(1000);
const voci=await store('timesheet_entries');
ok(voci.length===1,'il consuntivo si salva',voci.length+' voci');
ok(voci[0]&&voci[0].wbs_id===wbs[0].id,'sulla voce giusta');
ok(voci[0]&&voci[0].project_id===prj[0].id,'col progetto giusto');
ok(voci[0]&&voci[0].client_id==='c1','e il cliente giusto');

ok(errs.length===0,'nessun errore JS in tutto il giro',errs.slice(0,2).join(' | ')||'nessuno');
await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
