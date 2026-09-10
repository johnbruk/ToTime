// La cascata delle anagrafiche: Cliente > Progetto (cliente finale) >
// Commessa > Attivita'. Il punto non e' che le pagine esistano, ma che
// si scenda senza uscire dal percorso e che non resti una scorciatoia
// per creare un progetto saltando la commessa: era quella a produrre
// progetti orfani, fuori dalle attivita' e fuori dalla fatturazione.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const EXTRA=`
  engagements:[{id:'e1',user_id:'u1',client_id:'c1',project_id:'p1',code:'SO-EQU-2026-001',year:2026,seq:1,name:'Contratto 2026',status:'active'},
               {id:'e2',user_id:'u1',client_id:'c1',project_id:'p1',code:'SO-EQU-2027-001',year:2027,seq:1,name:'Contratto 2027',status:'active'}],
  engagement_references:[],
  wbs_items:[
    {id:'w10',user_id:'u1',engagement_id:'e1',activity_code:'10',code:'SO-EQU-2026-001-10',name:'Project Management',kind:'project_management',billable:true,status:'active',sort_order:10}],
  billing_lines:[],invoice_line_allocations:[],`;
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    if(p.endsWith('mock.html')){let h=b.toString();
      h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
      h=h.replace("{id:'c1',name:'Equans',daily_rate:480","{id:'c1',name:'Equans',code:'SO',daily_rate:480");
      h=h.replace("{id:'p1',client_id:'c1',name:'Beta',active:true}","{id:'p1',client_id:'c1',short_code:'EQU',code:'SO-EQU',name:'EQUANS',status:'active',active:true}");
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
const testo=()=>pg.evaluate(()=>document.getElementById('app').textContent.replace(/\s+/g,' '));
const vista=()=>pg.evaluate(()=>document.documentElement.getAttribute('data-view'));

console.log('\n=== A. Si scende dal cliente senza uscire dal percorso ===');
await pg.evaluate(()=>window.go('clients'));await pg.waitForTimeout(300);
// cliccare il cliente apre la sua SCHEDA, non la maschera di modifica
await pg.evaluate(()=>document.querySelector('#app .list .row').click());await pg.waitForTimeout(350);
ok(await vista()==='clientDetail','dal cliente si apre la sua scheda, non il modulo di modifica',await vista());
let t=await testo();
ok(/Progetti \/ clienti finali/i.test(t),'la scheda cliente elenca i suoi progetti');
ok(/EQUANS/.test(t)&&/SO-EQU/.test(t),'con nome e codice del progetto');
// va letta LA riga di EQUANS: nel mock c'e' anche un altro progetto
// senza commesse, e una regex sul testo intero prenderebbe la sua
const rigaEquans=await pg.evaluate(()=>{
  const r=[...document.querySelectorAll('#app .list .row')].find(x=>/EQUANS/.test(x.textContent));
  return r?r.textContent.replace(/\s+/g,' ').trim():'';});
ok(/2 commesse/.test(rigaEquans),'e dice quante commesse ci sono sotto',rigaEquans);
ok(/\+ Nuovo progetto/i.test(t),'da qui si crea il progetto');

await pg.evaluate(()=>[...document.querySelectorAll('#app .list .row')].find(r=>/EQUANS/.test(r.textContent)).click());
await pg.waitForTimeout(350);
ok(await vista()==='projectDetail','dal progetto si apre la sua scheda',await vista());
t=await testo();
ok(/Commesse/.test(t),'la scheda progetto elenca le sue commesse');
ok(/SO-EQU-2026-001/.test(t)&&/SO-EQU-2027-001/.test(t),'tutte e due, anni diversi sotto lo stesso cliente finale');
ok(/\+ Nuova commessa/i.test(t),'da qui si apre la commessa nuova');

await pg.evaluate(()=>[...document.querySelectorAll('#app .list .row')].find(r=>/2026/.test(r.textContent)).click());
await pg.waitForTimeout(350);
ok(await vista()==='engagementDetail','dalla commessa si apre la sua scheda',await vista());
t=await testo();
ok(/Attività/.test(t),'la scheda commessa elenca le sue attività');
ok(/Project Management/.test(t)&&/SO-EQU-2026-001-10/.test(t),'con descrizione e codice completo');
ok(/\+ Nuova attività/i.test(t),'e da qui si aggiunge un\'attività');

console.log('\n=== B. Le attività restano un elenco unico, slegato dalla commessa ===');
await pg.evaluate(()=>{const d=document.querySelector('#app details.moreFields');if(d)d.open=true});
await pg.waitForTimeout(250);
const daAnagrafica=await pg.evaluate(()=>{
  const s=document.querySelector('#app form.form [name="activity_id"]');
  return s?[...s.options].map(o=>o.textContent.trim()).filter(Boolean):null;});
ok(daAnagrafica&&daAnagrafica.length>0,'l\'attività si può pescare dall\'anagrafica attività',
  daAnagrafica?daAnagrafica.join(', '):'menu assente');
await pg.evaluate(()=>window.go('activities'));await pg.waitForTimeout(300);
ok(/Attività/.test(await testo())&&await vista()==='activities',
  'e l\'anagrafica attività resta una lista sua, non appesa alla commessa');

console.log('\n=== C. Non esiste piu\' la scorciatoia che salta la commessa ===');
await pg.evaluate(()=>window.go('projects'));await pg.waitForTimeout(300);
const formProgetti=await pg.evaluate(()=>document.querySelectorAll('#app form.form').length);
ok(formProgetti===0,'l\'elenco progetti non ha piu\' un modulo per crearne uno',formProgetti+' moduli');
t=await testo();
ok(/dal cliente/i.test(t),'e spiega che si passa dal cliente');
await pg.evaluate(()=>document.querySelector('#app .list .row').click());await pg.waitForTimeout(350);
ok(await vista()==='projectDetail','da li\' si entra comunque nella scheda del progetto',await vista());

console.log('\n=== D. Il percorso completo, dal cliente all\'attività ===');
await pg.evaluate(()=>window.go('settings'));await pg.waitForTimeout(300);
t=await testo();
ok(/Cliente › Progetto \/ cliente finale › Commessa › Attività/.test(t),
  'le Impostazioni dichiarano la cascata, invece di elencare anagrafiche parallele');
ok(/Commesse/.test(t),'e le commesse compaiono fra le anagrafiche');

ok(errs.length===0,'nessun errore JS in tutta la discesa',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();

// --- Il database ancora nel verso vecchio ---
// Se l'app viene rilasciata prima della migrazione, le tabelle ci sono
// ma i collegamenti no: la gerarchia risulterebbe vuota senza dire
// perche'. Deve accorgersene e dirlo, non mostrare pagine vuote.
console.log('\n=== E. Se la migrazione non e\' ancora stata lanciata ===');
const pg2=await b.newPage({viewport:{width:1280,height:1000}});
const errs2=[];pg2.on('pageerror',e=>errs2.push(e.message));
await pg2.goto(`http://127.0.0.1:${srv.address().port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg2.waitForTimeout(900);
// si riporta il magazzino al verso vecchio: commesse senza project_id
await pg2.evaluate(()=>{window.__stores.engagements.forEach(e=>{delete e.project_id});
  if(window.reload)return window.reload();});
await pg2.waitForTimeout(600);
await pg2.evaluate(()=>window.go('engagements'));await pg2.waitForTimeout(400);
// va letto il RIQUADRO, non tutta la pagina: il menu laterale
// contiene parole che farebbero passare il controllo per sbaglio
const avviso=await pg2.evaluate(()=>{
  const c=document.querySelector('#app .card');
  return c?c.textContent.replace(/\s+/g,' ').trim():'(nessun riquadro)';});
ok(/verso vecchio/i.test(avviso),'l\'app si accorge che il database e\' ancora nel verso vecchio',
  avviso.slice(0,110));
ok(/inversione-progetto-commessa\.sql/.test(avviso),'e dice quale script lanciare');
ok(errs2.length===0,'senza andare in errore',errs2.slice(0,2).join(' | ')||'nessuno');
await pg2.close();

await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
