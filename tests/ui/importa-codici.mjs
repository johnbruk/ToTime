// Il caricamento da foglio quando le attività non tornano.
//
// Il caso vero: un foglio di dieci righe, l'anteprima ne promette dieci,
// ne entrano otto, e il messaggio è «duplicate key value violates unique
// constraint "wbs_items_user_code_key"». Le due righe rimaste portavano
// la stessa attività nuova.
//
// Sotto c'erano tre cose diverse. Il codice della voce nuova veniva da
// quante voci ci sono — con un buco fra i codici (una voce chiusa, o
// codici non a decine) punta su uno già occupato, e il database lo
// rifiuta. Due righe con la stessa attività nuova la creavano due volte.
// E l'Excel che l'app esporta scrive nella colonna Attività il nome
// dell'anagrafica, mentre l'import cercava solo fra i nomi delle voci di
// commessa: il file uscito da qui non rientrava da qui.
//
// Qui il mock rifiuta i codici duplicati come fa il database vero:
// senza quel vincolo il test non vedrebbe mai l'errore che vede la
// persona davanti allo schermo.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import os from 'node:os';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
// Codici 10, 20, 40: manca il 30. Tre voci, e «(quante+1)*10» dà 40,
// che è già di «Vecchia gestione». È esattamente il buco del caso vero.
const EXTRA=`
  engagements:[{id:'e1',user_id:'u1',client_id:'c1',project_id:'p1',code:'SOL-EQU-2026-001',year:2026,seq:1,name:'Contratto',status:'active'}],
  engagement_references:[],
  wbs_items:[
    {id:'w10',user_id:'u1',engagement_id:'e1',activity_code:'10',code:'SOL-EQU-2026-001-10',name:'AMS / Incident',activity_id:'a1',billable:true,status:'active',sort_order:10},
    {id:'w20',user_id:'u1',engagement_id:'e1',activity_code:'20',code:'SOL-EQU-2026-001-20',name:'CR Evolutive',billable:true,status:'active',sort_order:20},
    {id:'w40',user_id:'u1',engagement_id:'e1',activity_code:'40',code:'SOL-EQU-2026-001-40',name:'Vecchia gestione',billable:true,status:'closed',sort_order:40}],
  billing_lines:[],invoice_line_allocations:[],`;
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    if(p.endsWith('mock.html')){let h=b.toString();
      h=h.replace("  clients,projects,activities,expense_categories,user_profiles:profiles", EXTRA+"\n  clients,projects,activities,expense_categories,user_profiles:profiles");
      h=h.replace("{id:'c1',name:'Equans',daily_rate:480","{id:'c1',name:'Solution',code:'SOL',daily_rate:480");
      h=h.replace("{id:'p1',client_id:'c1',name:'Beta',active:true}","{id:'p1',client_id:'c1',short_code:'EQU',code:'SOL-EQU',name:'Equans',status:'active',active:true}");
      // a1 è l'attività d'anagrafica collegata alla voce w10, e si
      // chiama diversamente dalla voce: è il caso che rompeva il giro
      h=h.replace("{id:'a1',name:'Alfa',active:true}","{id:'a1',name:'AMS - Incident',active:true}");
      h=h.replace(/timesheet_entries:\[[\s\S]*?\n  \],/,'timesheet_entries:[],');
      b=Buffer.from(h);}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
const pg=await b.newPage({viewport:{width:1280,height:1200}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
pg.on('dialog',d=>d.accept());
await pg.goto(`http://127.0.0.1:${srv.address().port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'totime-cod-'));
const voci=()=>pg.evaluate(()=>window.__stores.timesheet_entries);
const wbs=()=>pg.evaluate(()=>window.__stores.wbs_items);
const testo=()=>pg.evaluate(()=>document.getElementById('app').textContent.replace(/\s+/g,' '));
const carica=async file=>{
  await pg.evaluate(()=>window.go('importaConsuntivi'));await pg.waitForTimeout(400);
  await pg.setInputFiles('#app input[type=file]',file);await pg.waitForTimeout(900);
};
const premi=async()=>{
  await pg.evaluate(()=>[...document.querySelectorAll('#app .card .actions button')]
    .find(y=>/^(Carica|Riprova)/.test(y.textContent)).click());
  await pg.waitForTimeout(2600);
};

// Il foglio del caso vero, in piccolo: due righe che si agganciano,
// una che usa il nome dell'anagrafica invece di quello della voce, e
// due che portano la stessa attività nuova.
const csv=['Data,Cliente,Progetto,Attività,Sede,Descrizione,Ore',
  '03/08/2026,Solution,Equans,AMS / Incident,Remoto,INC1,2',
  '03/08/2026,Solution,Equans,CR Evolutive,Remoto,CR1,1',
  '04/08/2026,Solution,Equans,AMS - Incident,Remoto,INC2,2',
  '07/08/2026,Solution,Equans,AMS & Progetti,Remoto,SAL,2',
  '2026-08-27,Solution,Equans,AMS & Progetti,Remoto,SAL,2'].join('\n');
const f=path.join(dir,'agosto.csv');fs.writeFileSync(f,csv);

console.log('\n=== A. L\'anteprima dice il vero ===');
await carica(f);
const t0=await testo();
ok(/Cosa succederà/.test(t0),'il foglio viene letto');
const kpi=await pg.evaluate(()=>[...document.querySelectorAll('#app .kpiGrid strong')].map(x=>x.textContent.trim()));
ok(kpi[0]==='5','cinque righe da caricare',kpi.join(' / '));
ok(kpi[2]==='0','nessuna da sistemare',kpi.join(' / '));
// due righe portano la STESSA attività nuova: è una da creare, non due
ok(/Attività nuove 1 da creare/.test(t0),
   'le due righe con la stessa attività nuova contano per una sola',
   (t0.match(/Attività nuove[^·]{0,40}/)||['—'])[0]);

console.log('\n=== B. Il nome dell\'anagrafica aggancia la voce ===');
// «AMS - Incident» è il nome dell'anagrafica; la voce si chiama
// «AMS / Incident». È quello che l'app scrive nell'Excel che esporta.
const esiti=await pg.evaluate(()=>[...document.querySelectorAll('#app table.prospetto tbody tr')]
  .map(r=>[...r.querySelectorAll('td')].map(c=>c.textContent.trim())));
const rigaAnag=esiti.find(r=>r[3]==='AMS - Incident');
ok(!!rigaAnag&&rigaAnag[5]==='si carica',
   'la riga col nome dell\'anagrafica si aggancia, non risulta nuova',
   rigaAnag?rigaAnag[5]:'riga non trovata');

console.log('\n=== C. Le date si leggono come in tutto il resto dell\'app ===');
// l'ultima riga del foglio porta la data in ISO, come la restituisce
// il lettore .xlsx: e' quella che nel prospetto si leggeva 2026-08-27
ok(esiti.length>0&&esiti.every(r=>/^\d{2}\/\d{2}\/\d{4}$/.test(r[1])),
   'gg/mm/aaaa nel prospetto anche per le date che arrivano in ISO',
   esiti.map(r=>r[1]).join(' '));

console.log('\n=== D. La colonna del numero di riga non sfonda ===');
const largh=await pg.evaluate(()=>{
  const c=document.querySelector('#app table.prospetto tbody td.riga');
  return c?Math.round(c.getBoundingClientRect().width):0});
ok(largh>0&&largh<140,'sta in meno di 140px, non nei 230 della griglia mensile',largh+'px');

console.log('\n=== E. Si carica tutto quello che era stato promesso ===');
await premi();
const v=await voci();
ok(v.length===5,'cinque consuntivi scritti, non tre',v.length+' voci');
const w=await wbs();
const create=w.filter(x=>String(x.name).trim()==='AMS & Progetti');
ok(create.length===1,'l\'attività nuova è creata una volta sola',create.length+' voci create');
ok(create.length===1&&create[0].activity_code==='50',
   'col primo codice libero (50), non col 40 che era già occupato',
   create.length?create[0].activity_code:'—');
ok(w.filter(x=>x.activity_code==='40').length===1,
   'e la voce che aveva il 40 è rimasta una sola');
const suNuova=v.filter(x=>create.length&&x.wbs_id===create[0].id);
ok(suNuova.length===2,'tutt\'e due le righe finiscono sulla stessa voce',suNuova.length+'');
const suAnag=v.find(x=>x.description==='INC2');
ok(!!suAnag&&suAnag.wbs_id==='w10',
   'e la riga col nome dell\'anagrafica finisce sulla voce giusta',
   suAnag?String(suAnag.wbs_id):'non trovata');

console.log('\n=== F. Ricaricare lo stesso foglio non duplica ===');
await carica(f);
const kpi2=await pg.evaluate(()=>[...document.querySelectorAll('#app .kpiGrid strong')].map(x=>x.textContent.trim()));
ok(kpi2[1]==='5','il secondo giro le riconosce tutte come già presenti',kpi2.join(' / '));
ok((await voci()).length===5,'e non scrive niente in più',(await voci()).length+' voci');

console.log('\n=== G. Quando una riga non passa, si vede quale e perche\' ===');
// Si vieta al finto database di creare voci nuove, come fa quello vero
// quando il codice e' occupato: la riga che porta un'attivita' nuova
// non passa, l'altra si'.
await pg.evaluate(()=>{window.__stores.timesheet_entries.length=0;window.__vietaWbs=true});
await pg.evaluate(()=>window.reload());
await pg.waitForTimeout(500);
const csv2=['Data,Cliente,Progetto,Attività,Sede,Descrizione,Ore',
  '03/09/2026,Solution,Equans,AMS / Incident,Remoto,INC9,2',
  '04/09/2026,Solution,Equans,Attività che non esiste,Remoto,X,2'].join('\n');
const f2=path.join(dir,'settembre.csv');fs.writeFileSync(f2,csv2);
await carica(f2);
await premi();
const t2=await testo();
ok(/Carica consuntivi da foglio/.test(t2),
   'si resta sul prospetto invece di finire sul timesheet senza spiegazioni');
ok(/Queste righe non sono passate/.test(t2),'con l\'elenco di quelle rimaste');
ok(/riga 3/.test(t2),'che dice quale riga e\'',(t2.match(/riga \d+/g)||['nessuna']).join(' '));
ok(!/duplicate key value|violates|row-level security|policy for table/i.test(t2),
   'e non compare mai il linguaggio del database',
   (t2.match(/(duplicate|violates|row-level)[^.]{0,50}/i)||['nessun gergo'])[0]);
ok(/database ha rifiutato la scrittura|codice dell.attivit/i.test(t2),
   'ma una frase in italiano che dice cosa fare',
   (t2.match(/(database ha rifiutato[^.]{0,60}|codice dell[^.]{0,60})/i)||['—'])[0]);
// la riga buona e' passata lo stesso: un fallimento non ferma le altre
const v2=await voci();
ok(v2.length===1&&v2[0].description==='INC9',
   'e la riga buona e\' entrata lo stesso',v2.length+' voci');
// e adesso si puo\' riprovare solo quella rimasta
// si legge il pulsante, non il testo della pagina: la frase
// «Riprovare non duplica niente» lo avrebbe fatto passare da sola
const etichetta=await pg.evaluate(()=>{
  const b=[...document.querySelectorAll('#app .card .actions button')]
    .find(y=>/^(Carica|Riprova)/.test(y.textContent));
  return b?b.textContent.trim():''});
ok(/^Riprova la riga rimasta$/.test(etichetta),
   'il pulsante propone di riprovare solo quella rimasta',etichetta||'nessun pulsante');
await pg.evaluate(()=>{window.__vietaWbs=false});
await premi();
ok((await voci()).length===2,'e riprovando entra anche lei, senza duplicare la prima',
   (await voci()).length+' voci');

ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
