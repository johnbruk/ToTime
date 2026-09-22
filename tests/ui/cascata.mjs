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
    {id:'w10',user_id:'u1',engagement_id:'e1',activity_code:'10',code:'SO-EQU-2026-001-10',name:'Project Management',kind:'project_management',billable:true,status:'active',sort_order:10},
    {id:'w21',user_id:'u1',engagement_id:'e2',activity_code:'10',code:'SO-EQU-2027-001-10',name:'Incident',kind:'activity',billable:true,status:'active',sort_order:10},
    {id:'w22',user_id:'u1',engagement_id:'e2',activity_code:'20',code:'SO-EQU-2027-001-20',name:'Progetti',kind:'activity',billable:true,status:'active',sort_order:20}],
  billing_lines:[],invoice_line_allocations:[],`;
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    if(p.endsWith('mock.html')){let h=b.toString();
      h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
      h=h.replace("{id:'c1',name:'Equans',daily_rate:480","{id:'c1',name:'Equans',code:'SO',daily_rate:480");
      h=h.replace(/timesheet_entries:\[[\s\S]*?\n  \],/, "timesheet_entries:[{id:'v1',entry_date:'"+new Date().toISOString().slice(0,8)+"02',client_id:'c1',project_id:'p1',wbs_id:'w10',hours:8,daily_rate_snapshot:480,standard_hours_snapshot:8}],");
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
ok(/Dividi in più attività/i.test(t),'e spezzarla in più voci resta possibile, ma è facoltativo');
ok(/Su cosa si registra/.test(t),'una commessa con una voce sola non si presenta come un elenco da gestire');

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
ok(formProgetti===0,'l\'elenco progetti non ha piu\' un modulo che salta la commessa',formProgetti+' moduli');
t=await testo();
ok(/sotto il suo cliente/i.test(t),'e spiega che il progetto nasce sotto il cliente');
// ma non deve essere un vicolo cieco: chi arriva qui per creare un
// progetto deve trovare come, non solo l'elenco di quelli che ci sono
ok(/\+ Nuovo progetto/i.test(t),'e da qui ci si arriva comunque a crearne uno');
await pg.evaluate(()=>document.querySelector('#app .list .row').click());await pg.waitForTimeout(350);
ok(await vista()==='projectDetail','da li\' si entra comunque nella scheda del progetto',await vista());

console.log('\n=== D. Il percorso completo, dal cliente all\'attività ===');
await pg.evaluate(()=>window.go('settings'));await pg.waitForTimeout(300);
t=await testo();
ok(/Cliente › Progetto \/ cliente finale › Commessa › Attività/.test(t),
  'le Impostazioni dichiarano la cascata, invece di elencare anagrafiche parallele');
ok(/Commesse/.test(t),'e le commesse compaiono fra le anagrafiche');

console.log('\n=== E. Modificare quello che si e\' creato ===');
// go() azzera state.edit: le viste che ne hanno bisogno vanno
// raggiunte con navigateTo, altrimenti ricadono sull'elenco e il
// modulo non compare. Era il caso di "Modifica progetto".
await pg.evaluate(()=>window.go('projects'));await pg.waitForTimeout(300);
await pg.evaluate(()=>[...document.querySelectorAll('#app .list .row')].find(r=>/EQUANS/.test(r.textContent)).click());
await pg.waitForTimeout(350);
await pg.evaluate(()=>{const x=[...document.querySelectorAll('#app button')].find(y=>/Modifica progetto/.test(y.textContent));if(x)x.click()});
await pg.waitForTimeout(400);
ok(await vista()==='projectEdit','da «Modifica progetto» si arriva al modulo',await vista());
const campiPrj=await pg.evaluate(()=>[...document.querySelectorAll('#app form.form [name]')].map(e=>e.name));
ok(campiPrj.length>0,'e il modulo c\'è davvero',campiPrj.join(', ')||'NESSUN MODULO');
ok(campiPrj.includes('short_code')&&campiPrj.includes('billing_unit')&&campiPrj.includes('end_client_name'),
  'con i campi del progetto, non solo nome e cliente',campiPrj.join(', '));

// il collegamento all'anagrafica attivita' si poteva scegliere solo
// alla creazione: dopo non si cambiava piu'
// va aperta la commessa del 2026: e' quella che ha le attivita'
await pg.evaluate(()=>window.go('engagements'));await pg.waitForTimeout(300);
await pg.evaluate(()=>[...document.querySelectorAll('#app .list .row')]
  .find(r=>/SO-EQU-2026-001/.test(r.textContent)).click());await pg.waitForTimeout(350);
const rigaAtt=await pg.evaluate(()=>{
  const r=[...document.querySelectorAll('#app .list .row')].find(x=>/Project Management/.test(x.textContent));
  if(r){r.click();return true}return false;});
ok(rigaAtt,'l\'attività è nell\'elenco della commessa');
await pg.waitForTimeout(400);
ok(await vista()==='wbsEdit','l\'attività della commessa si apre in modifica',await vista());
const campiW=await pg.evaluate(()=>[...document.querySelectorAll('#app form.form [name]')].map(e=>e.name));
ok(campiW.includes('activity_id'),'e il collegamento all\'anagrafica si può cambiare, non solo impostare',
  campiW.join(', '));

console.log('\n=== F. Nella griglia si leggono i nomi, non i codici ===');
await pg.evaluate(()=>window.go('griglia'));await pg.waitForTimeout(700);
const riga=await pg.evaluate(()=>{const t=document.querySelector('table.griglia tbody td.riga');
  return t?{n:t.querySelector('.n')?.textContent.trim()||'',
            d:t.querySelector('.attivita')?.textContent.trim()||'',
            cod:t.querySelector('.wbsCode')?.textContent.trim()||''}:null;});
ok(riga&&/›/.test(riga.n),'in cima ci sono cliente e progetto, nell\'ordine della gerarchia',
  riga?riga.n:'nessuna riga');
ok(riga&&!riga.d,'dove la voce è una sola non se ne parla: sarebbe rumore uguale per tutte le righe',
  riga?(riga.d||'(assente, giusto)'):'');
ok(riga&&/-\d{4}-\d{3}-/.test(riga.cod),'e il codice resta, ma in fondo e in sordina',riga?riga.cod:'');

console.log('\n=== H. Creare davvero un progetto e una commessa ===');
// navigateTo non portava `parent`: projectNew cercava il cliente li'
// dentro, non lo trovava e ricadeva sull'elenco senza dire niente.
// Il pulsante c'era, il modulo no.
await pg.evaluate(()=>window.go('clients'));await pg.waitForTimeout(300);
await pg.evaluate(()=>document.querySelector('#app .list .row').click());await pg.waitForTimeout(350);
await pg.evaluate(()=>{const x=[...document.querySelectorAll('#app button')].find(y=>/Nuovo progetto/.test(y.textContent));if(x)x.click()});
await pg.waitForTimeout(400);
ok(await vista()==='projectNew','dal cliente si arriva al modulo del progetto nuovo',await vista());
let campiNP=await pg.evaluate(()=>[...document.querySelectorAll('#app form.form [name]')].map(e=>e.name));
ok(campiNP.includes('short_code')&&campiNP.includes('name'),'e il modulo c\'è davvero',campiNP.join(', ')||'NESSUN MODULO');
const prjPrima=await pg.evaluate(()=>window.__stores.projects.length);
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  f.short_code.value='ACM';f.name.value='ACME';f.end_client_name.value='ACME Italia';f.requestSubmit()});
await pg.waitForTimeout(900);
ok(await pg.evaluate(()=>window.__stores.projects.length)===prjPrima+1,'il progetto viene creato',
  (await pg.evaluate(()=>window.__stores.projects.length))+' progetti');
// creare un progetto e' un gesto solo: commessa e voce nascono da se',
// e si torna dove si era, non in un secondo modulo
ok(await vista()==='clientDetail','si torna alla scheda del cliente, non a un altro modulo',await vista());
const conta=await pg.evaluate(()=>({eng:window.__stores.engagements.length,wbs:window.__stores.wbs_items.length}));
ok(conta.eng===3,'la commessa del progetto nuovo e\' nata da se\'',JSON.stringify(conta));
const rigaACME=await pg.evaluate(()=>{const r=[...document.querySelectorAll('#app .list .row')].find(x=>/ACME/.test(x.textContent));
  return r?r.textContent.replace(/\s+/g,' ').trim():''});
ok(/1 commessa/.test(rigaACME),'e il progetto compare gia\' con la sua commessa',rigaACME||'riga non trovata');

// e la commessa si crea anche dal progetto
await pg.evaluate(()=>window.go('projects'));await pg.waitForTimeout(300);
await pg.evaluate(()=>[...document.querySelectorAll('#app .list .row')].find(r=>/EQUANS/.test(r.textContent)).click());
await pg.waitForTimeout(350);
await pg.evaluate(()=>{const x=[...document.querySelectorAll('#app button')].find(y=>/Nuova commessa/.test(y.textContent));if(x)x.click()});
await pg.waitForTimeout(400);
ok(await vista()==='engagementNew','dal progetto si arriva al modulo della commessa nuova',await vista());
const sceltoE=await pg.evaluate(()=>{const s=document.querySelector('[name="project_id"]');
  return s?s.options[s.selectedIndex]?.textContent.trim():''});
ok(/EQUANS/.test(sceltoE),'col progetto di partenza già selezionato',sceltoE||'nessuno');

console.log('\n=== G. La voce si chiede solo dove ce n\'e\' piu\' d\'una ===');
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(400);
const scegli=async(nome,val)=>{await pg.selectOption(`[name="${nome}"]`,val);await pg.waitForTimeout(250)};
await scegli('hier_project_id','p1');
await scegli('engagement_id','e1');          // commessa con UNA voce
let vis=await pg.evaluate(()=>{const f=document.getElementById('wbsField');
  return {nascosto:f?f.hidden:null,valore:document.querySelector('[name="wbs_id"]')?.value||''}});
ok(vis.nascosto===true,'con una voce sola il menu Attività non compare',JSON.stringify(vis));
ok(vis.valore==='w10','e la voce è già scelta, senza chiedere niente',vis.valore||'vuoto');

await scegli('engagement_id','e2');          // commessa con DUE voci
vis=await pg.evaluate(()=>{const f=document.getElementById('wbsField');
  return {nascosto:f?f.hidden:null,opzioni:[...document.querySelectorAll('[name="wbs_id"] option')].map(o=>o.value).filter(Boolean)}});
ok(vis.nascosto===false,'con due voci il menu torna',JSON.stringify(vis));
ok(vis.opzioni.length===2,'e le elenca entrambe',vis.opzioni.join(' '));

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
