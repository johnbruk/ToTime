// Salvare e passare al giorno dopo.
//
// Compilare una settimana vuol dire ripetere lo stesso consuntivo su
// cinque giorni. Il punto non e' che il pulsante esista, ma che dopo
// il salto il modulo sia gia' compilato: se cliente, progetto e
// commessa vanno riscelti ogni volta, il salto non fa risparmiare
// niente. E che due passaggi sullo stesso giorno non producano due
// voci uguali.
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

console.log('\n=== A. Dal modulo nuovo si prosegue al giorno dopo ===');
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(450);
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  const primo=[...f.client_id.options].find(o=>o.value);
  if(primo&&!f.client_id.value){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}});
await pg.waitForTimeout(400);
ok(await pg.$('button:has-text("Salva e vai al giorno dopo")')!==null,'il pulsante c\'è');
await pg.evaluate(d=>{const f=document.querySelector('#app form.form');f.entry_date.value=d;},g(2));
// Il cliente non si propone piu', e la cascata si disegna dopo averlo
// scelto: prima non si sa di chi siano i progetti da mostrare.
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  const primo=[...f.client_id.options].find(o=>o.value);
  if(primo){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}});
await pg.waitForTimeout(400);
// Dei due progetti del cliente uno solo porta a una commessa aperta,
// quindi si prende da se'. Ma il menu RESTA A SCHERMO: il progetto e'
// uno dei tre dati da indicare, e vederlo scelto non e' rumore, e'
// l'informazione. (p2 «Alfa» non ha nessuna commessa e non si offre.)
ok(await campo('hier_project_id')==='p1',
   'il progetto si prende da se\': e\' l\'unico che porta a una commessa',await campo('hier_project_id'));
ok(await pg.evaluate(()=>{const e=document.getElementById('prjField');return !!e&&!e.hidden}),
   'ma si vede lo stesso: e\' uno dei tre dati da indicare');
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');f.hours.value='6';f.work_city.value='Milano'});
const prima=await conta();
await pg.evaluate(()=>[...document.querySelectorAll('#app button')].find(x=>/Salva e vai al giorno dopo/.test(x.textContent)).click());
await pg.waitForTimeout(900);
ok(await conta()===prima+1,'il consuntivo è stato salvato',(await conta())+' voci');
ok(await vista()==='dailyForm','e si è aperto il modulo del giorno dopo',await vista());
ok(await campo('entry_date')===g(3),'con la data avanzata di un giorno',await campo('entry_date'));
ok(await campo('client_id')==='c1','il cliente è già quello di prima',await campo('client_id'));
ok(await campo('hier_project_id')==='p1','e il progetto pure',await campo('hier_project_id'));
ok(await campo('engagement_id')==='e1','e la commessa',await campo('engagement_id'));
ok(await campo('hours')==='6','anche le ore, che di solito si ripetono',await campo('hours'));
ok(await campo('work_city')==='Milano','e il luogo',await campo('work_city'));

console.log('\n=== B. Tre giorni di fila senza riscegliere niente ===');
for(const giorno of [4,5]){
  await pg.evaluate(()=>[...document.querySelectorAll('#app button')].find(x=>/Salva e vai al giorno dopo/.test(x.textContent)).click());
  await pg.waitForTimeout(900);
  ok(await campo('entry_date')===g(giorno),'si arriva al '+g(giorno),await campo('entry_date'));
}
const voci=await pg.evaluate(()=>window.__stores.timesheet_entries.map(e=>e.entry_date).sort());
ok(voci.filter(d=>[g(2),g(3),g(4)].includes(d)).length===3,'e i tre giorni sono tutti registrati',voci.join(' '));

console.log('\n=== C. Se il giorno accanto e\' gia\' consuntivato, lo si apre ===');
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(450);
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  const primo=[...f.client_id.options].find(o=>o.value);
  if(primo&&!f.client_id.value){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}});
await pg.waitForTimeout(400);
await pg.evaluate(d=>{document.querySelector('#app form.form').entry_date.value=d},g(8));
// anche qui il progetto si prende da se'
ok(await campo('hier_project_id')==='p1','il progetto si prende da se\' anche al secondo giro',await campo('hier_project_id'));
const prima2=await conta();
await pg.evaluate(()=>[...document.querySelectorAll('#app button')].find(x=>/Salva e vai al giorno dopo/.test(x.textContent)).click());
await pg.waitForTimeout(900);
ok(await vista()==='dailyEdit','il 9 era già consuntivato: si apre in modifica invece di duplicare',await vista());
ok(await campo('hours')==='3','con le ore che c\'erano già',await campo('hours'));
ok(await conta()===prima2+1,'e non è nata una seconda voce sullo stesso giorno',(await conta())+' voci');

console.log('\n=== D. Si torna anche indietro ===');
ok(await pg.$('button:has-text("Salva e vai al giorno prima")')!==null,'dal modulo di modifica si va anche al giorno prima');
await pg.evaluate(()=>[...document.querySelectorAll('#app button')].find(x=>/giorno prima/.test(x.textContent)).click());
await pg.waitForTimeout(900);
ok(await campo('entry_date')===g(8),'e si arriva al giorno prima',await campo('entry_date'));

console.log('\n=== La riga si porta dietro se stessa, cliente compreso ===');
// Il difetto segnalato: scegliendo un cliente diverso dal primo e
// premendo «Salva e vai al giorno dopo», il modulo nuovo tornava sul
// primo cliente dell'elenco. Il cliente giusto veniva calcolato — il
// blocco delle commesse sotto era il suo — ma le <option> uscivano
// senza «selected», e il browser sceglie da se': la prima.
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(500);
const opz=await pg.evaluate(()=>{const s=document.querySelector('#app [name=client_id]');
  return s?[...s.options].map(o=>o.value):[]});
// La prima voce adesso e' il segnaposto «scegli il cliente»: i clienti
// veri cominciano dopo, e qui ne serve uno DIVERSO da quello che si
// sceglierebbe per primo.
const reali=opz.filter(Boolean);
ok(reali.length>1,'nel banco di prova ci sono piu\' clienti',reali.join(', '));
const altro=reali[1];
await pg.evaluate(v=>{const s=document.querySelector('#app [name=client_id]');
  s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}))},altro);
await pg.waitForTimeout(400);
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  f.querySelector('[name=entry_date]').value='2026-07-20';
  f.querySelector('[name=hours]').value='6';
  const d=f.querySelector('[name=description]');if(d)d.value='riga di prova';
});
await pg.evaluate(()=>{const b=[...document.querySelectorAll('#app button')]
  .find(x=>/giorno dopo/.test(x.textContent));b&&b.click()});
await pg.waitForTimeout(1500);
ok(await campo('entry_date')==='2026-07-21','si passa al giorno dopo',await campo('entry_date'));
const cli=await pg.evaluate(()=>document.querySelector('#app [name=client_id]')?.value);
ok(cli===altro,'e il cliente resta quello scelto, non il primo dell\'elenco',
   `atteso ${altro}, trovato ${cli}`);
ok(await campo('hours')==='6','le ore si riportano',await campo('hours'));
ok(await campo('description')==='riga di prova','e la descrizione pure',await campo('description'));
// e quello salvato e' il cliente giusto, non quello mostrato per sbaglio
const salvato=await pg.evaluate(()=>(window.__ins||[])
  .filter(x=>x.__table==='timesheet_entries'&&x.entry_date==='2026-07-20').map(x=>x.client_id));
ok(salvato.includes(altro),'e sul database era finito il cliente giusto fin dall\'inizio',
   JSON.stringify(salvato));

ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
