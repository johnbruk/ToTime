// Gerarchia Cliente > Progetto > Commessa > Attivita' nei moduli di
// consuntivo. Deve comparire dove la gerarchia esiste e sparire dove
// non c'e' ancora, cosi' chi non ha migrato tutto continua a lavorare.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const EXTRA=`
  engagements:[{id:'e1',user_id:'u1',client_id:'c1',project_id:'p1',code:'SO-EQU-2026-001',year:2026,seq:1,name:'Incarico 2026',status:'active',engagement_letter:'LI_202601',invoice_reference:'LI_202601_Nome_Cognome'},
    {id:'e2',user_id:'u1',client_id:'c1',project_id:'p2',code:'SO-ALF-2026-001',year:2026,seq:1,name:'Incarico Alfa',status:'active'}],
  engagement_references:[],
  wbs_items:[
    {id:'w10',user_id:'u1',engagement_id:'e1',activity_code:'10',code:'SO-EQU-2026-001-10',name:'Project Management',kind:'project_management',billable:true,status:'active',sort_order:10},
    {id:'w20',user_id:'u1',engagement_id:'e1',activity_code:'20',code:'SO-EQU-2026-001-20',name:'Process Mapping',kind:'analysis',billable:true,status:'active',sort_order:20},
    {id:'w90',user_id:'u1',engagement_id:'e1',activity_code:'90',code:'SO-EQU-2026-001-90',name:'Trasferte',kind:'travel',billable:false,status:'closed',sort_order:90},
    {id:'w21',user_id:'u1',engagement_id:'e2',activity_code:'10',code:'SO-ALF-2026-001-10',name:'Analisi',kind:'activity',billable:true,status:'active',sort_order:10}],
  billing_lines:[],invoice_line_allocations:[],`;
function servi(conGerarchia){
  return http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
    fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
      if(p.endsWith('mock.html')){let h=b.toString();
        if(conGerarchia){
          h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
          h=h.replace("{id:'c1',name:'Equans',daily_rate:480","{id:'c1',name:'Equans',code:'SO',daily_rate:480");
          h=h.replace("{id:'p1',client_id:'c1',name:'Beta',active:true}","{id:'p1',client_id:'c1',short_code:'EQU',code:'SO-EQU',name:'Beta',status:'active',active:true}");
          h=h.replace("{id:'p2',client_id:'c1',name:'Alfa',active:true}];","{id:'p2',client_id:'c1',short_code:'ALF',code:'SO-ALF',name:'Alfa',status:'active',active:true},{id:'p3',client_id:'c1',short_code:'CIE',code:'SO-CIE',name:'Senza commesse',status:'active',active:true}];");
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
// Il cliente non si propone piu': con un default preselezionato bastava
// non guardare quel campo per consuntivare su quello sbagliato. La
// gerarchia si disegna dopo averlo scelto, come fa una persona.
await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
  const primo=[...f.client_id.options].find(o=>o.value);
  if(primo){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}});
await pg.waitForTimeout(400);
const campi=await pg.evaluate(()=>[...document.querySelectorAll('#app form.form [name]')].map(e=>e.name));
ok(campi.includes('engagement_id')&&campi.includes('wbs_id'),'il modulo mostra commessa e WBS',campi.join(', '));
// La regola era «in gerarchia non si chiede l'attivita' sciolta», e
// valeva finche' ogni commessa ne portava una. Qui NESSUNA delle tre
// commesse ha un'attivita' collegata: il salvataggio partiva col campo
// vuoto, e un database che lo pretende rifiutava nominando un campo che
// a schermo non c'era. Non si riusciva piu' a registrare il lavoro.
// Quindi quel che conta non e' che il campo manchi, ma che compaia
// ESATTAMENTE quando la commessa non decide da se'.
const wbsSenzaAttivita=await pg.evaluate(()=>{
  const w=(window.__stores.wbs_items||[]).find(x=>x.id===document.querySelector('[name=wbs_id]')?.value);
  return !w||!w.activity_id;
});
ok(wbsSenzaAttivita,'questa commessa non porta un\'attivita\' con se\'');
// Il «tipo di attivita'» non si chiede piu' nel consuntivo: lo porta
// l'attivita' della commessa, dove si imposta una volta sola. Chiederlo
// qui voleva dire due campi omonimi nello stesso modulo.
const attNelModulo=await pg.evaluate(()=>!!document.querySelector('#app form.form [name=activity_id]'));
ok(attNelModulo===false,'e il tipo di attivita\' non si chiede qui: lo porta la commessa',
   attNelModulo?'campo ancora presente':'assente, giusto');
const etichette=await pg.evaluate(()=>[...document.querySelectorAll('#app form.form .field')]
  .filter(d=>!d.hidden).map(d=>(d.querySelector('label')?.textContent||'').trim()));
ok(etichette.filter(x=>/attivit/i.test(x)).length===1,
   'un solo campo si chiama «Attivita\'», non due',etichette.join(' | '));
const opts=async n=>pg.evaluate(x=>[...document.querySelectorAll(`[name="${x}"] option`)].map(o=>o.value).filter(Boolean),n);
// Un livello con una scelta sola si sceglie da se' e non compare: qui
// c'e' un progetto solo e una commessa sola, quindi il modulo non deve
// chiedere niente oltre al cliente.
const visibile=async id=>pg.evaluate(x=>{const e=document.getElementById(x);return e?!e.hidden:null},id);
const valore=async n=>pg.evaluate(x=>document.querySelector(`[name="${x}"]`)?.value||'',n);
// Questo cliente ha TRE progetti, ma solo due portano a una commessa
// aperta: la scelta si chiede fra quei due. Prima qui si contavano i
// progetti e bastava; il terzo veniva offerto, e sceglierlo portava a
// «scegli la commessa» con il menu delle commesse vuoto e nascosto.
const prjOpts=await opts('hier_project_id');
ok(prjOpts.includes('p1')&&prjOpts.includes('p2'),'i progetti che portano a una commessa sono fra le scelte',prjOpts.join(' '));
ok(!prjOpts.includes('p3'),'quello senza commesse no: sceglierlo poteva solo bloccare',prjOpts.join(' '));
ok(await visibile('prjField')===true,'e la scelta viene chiesta, perche\' di percorribili ce ne sono due');
const notaCieca=await pg.evaluate(()=>document.getElementById('hierNota')?.textContent||'');
ok(/SO-CIE/.test(notaCieca)&&/commessa/.test(notaCieca),
   'ma non sparisce in silenzio: si legge quale manca e perche\'',notaCieca||'nessuna nota');
await pg.selectOption('[name="hier_project_id"]','p1');await pg.waitForTimeout(250);
// ma sotto quel progetto la commessa e' una sola: non si chiede
ok(await visibile('engField')===false,'la commessa invece non viene chiesta: ce n\'e\' una sola');
ok(await valore('engagement_id')==='e1','ed e\' gia\' scelta',await valore('engagement_id'));
const wbs=await opts('wbs_id');
ok(wbs.includes('w10')&&wbs.includes('w20'),'le attivita\' della commessa ci sono tutte',wbs.join(' '));
ok(await visibile('wbsField')===true,'e questa volta la scelta si chiede, perche\' sono due');
ok(!wbs.includes('w90'),'l\'attivita\' chiusa non e\' selezionabile per nuove registrazioni');
await pg.selectOption('[name="wbs_id"]','w10');await pg.waitForTimeout(200);
ok(/SO-EQU-2026-001-10/.test(await pg.evaluate(()=>document.getElementById('wbsHint')?.textContent||'')),'sotto la WBS si legge il codice completo');

console.log('\n=== B. Salvare senza WBS non si puo\' ===');
const prima=await pg.evaluate(()=>window.__stores.timesheet_entries.length);
await pg.evaluate(()=>{const f=document.querySelector('form.form');f.wbs_id.value='';f.requestSubmit()});
await pg.waitForTimeout(500);
ok(await pg.evaluate(()=>window.__stores.timesheet_entries.length)===prima,'senza WBS non salva',prima+' voci, invariate');
const avviso=await pg.evaluate(()=>document.querySelector('.toast')?.textContent||'');
ok(/Scegli l’attività/.test(avviso),'e dice cosa scegliere, col nome del campo che vedi',avviso||'nessun messaggio');
ok(!/\bWBS\b/.test(avviso),'senza tirare in ballo la sigla WBS',avviso||'—');

console.log('\n=== C. Salvando, la voce porta la WBS ===');
// dopo il messaggio d'errore il modulo si ricostruisce: il progetto
// va riscelto (sono due), e da li' in giu' si sistema da solo
await pg.selectOption('[name="hier_project_id"]','p1');await pg.waitForTimeout(300);
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
await pg.evaluate(()=>{const f=document.querySelector('form.form');
  const primo=[...f.client_id.options].find(o=>o.value);
  if(primo){f.client_id.value=primo.value;window.refreshProjectsForForm(f)}
  f.hours.value='4';f.requestSubmit()});
await pg.waitForTimeout(700);
ok(await pg.evaluate(()=>window.__stores.timesheet_entries.length)===prima2+1,'e si salva senza chiedere niente di nuovo');
ok(errs2.length===0,'nessun errore JS',errs2.slice(0,2).join(' | ')||'nessuno');
await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
