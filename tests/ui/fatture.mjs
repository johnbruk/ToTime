// L'elenco delle fatture si legge per numero.
//
// Prima il numero stava in mezzo a una riga di testo — «Fattura Fattura
// #4/2026 · Fattura emessa · 26/06» — insieme allo stato e alla data,
// mentre nella colonna di sinistra c'era il mese di competenza. Tre
// date e un numero mescolati, e il prefisso «Fattura» scritto nel
// codice che si sommava a quello gia' digitato nel numero.
//
// Adesso sono colonne: numero, mese, data, cliente e stato, importo.
// Su schermo stretto si impilano e ogni dato porta la sua etichetta,
// cosi' non si scambia un mese per una data.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

// Le fatture del caso vero: una senza numero, una col numero scritto
// «Fattura 5», una «Fattura #4/2026», una incassata.
const apri=async w=>{
  const pg=await b.newPage({viewport:{width:w,height:1200},hasTouch:w<900});
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);
  await pg.evaluate(()=>{window.__stores.billing_headers=[
    {id:'h1',client_id:'c1',year:2026,month:9,status:'invoice_issued',invoice_number:'',invoice_date:'2026-09-30',invoice_total_amount:4784},
    {id:'h2',client_id:'c1',year:2026,month:7,status:'invoice_issued',invoice_number:'Fattura 5',invoice_date:'2026-07-31',invoice_total_amount:3348.8},
    {id:'h3',client_id:'c1',year:2026,month:6,status:'invoice_issued',invoice_number:'Fattura #4/2026',invoice_date:'2026-06-26',invoice_total_amount:5907.2},
    {id:'h4',client_id:'c1',year:2026,month:5,status:'collected',invoice_number:'#3/2026',invoice_date:'2026-05-31',collected_amount:4903.6,invoice_total_amount:4903.6}];
  });
  await pg.evaluate(()=>window.reload().then(()=>window.openAnnualInvoices('issued')));
  await pg.waitForTimeout(700);
  return pg;
};
const righe=pg=>pg.evaluate(()=>[...document.querySelectorAll('#app .rowFattura')].map(r=>({
  numero:r.querySelector('.fatNum')?.textContent.trim(),
  mese:r.querySelector('.fatMese')?.textContent.trim(),
  data:r.querySelector('.fatData')?.textContent.trim(),
  cliente:r.querySelector('.fatCli .title')?.textContent.trim(),
  stato:r.querySelector('.fatCli .tag')?.textContent.trim(),
  importo:r.querySelector('.value')?.textContent.trim(),
  primo:r.firstElementChild?.className
})));

console.log('\n=== A. Il numero è la prima colonna ===');
const pg=await apri(1280);
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
const rr=await righe(pg);
const vuota={numero:'',mese:'',data:'',cliente:'',stato:'',importo:'',primo:''};
const r=[0,1,2,3].map(i=>rr[i]||vuota);
r.length=4;
ok(rr.length===4,'le quattro fatture ci sono tutte',rr.length+' righe');
ok(r.every(x=>/fatNum/.test(x.primo||'')),
   'e in ogni riga la prima cella è il numero',JSON.stringify(r.map(x=>x.primo)));
ok(r.map(x=>x.numero).join(' | ')==='senza numero | 5 | #4/2026 | #3/2026',
   'coi numeri al posto loro',r.map(x=>x.numero).join(' | '));

console.log('\n=== B. «Fattura Fattura 5» non succede più ===');
// il prefisso lo toglieva l'app e lo rimetteva la persona nel campo:
// uscivano due «Fattura» di fila
ok(!r.some(x=>/Fattura\s+Fattura/i.test(x.numero||'')),
   'nessun numero porta il prefisso due volte',JSON.stringify(r.map(x=>x.numero)));
ok(r[1].numero==='5','«Fattura 5» si legge «5»',r[1].numero);
ok(r[2].numero==='#4/2026','e «Fattura #4/2026» si legge «#4/2026»',r[2].numero);
ok(r[0].numero==='senza numero','e chi non ha numero lo dice, invece di lasciare un buco',r[0].numero);

console.log('\n=== C. Mese e data stanno in colonne diverse ===');
ok(r.every(x=>/^\d{2}\/\d{4}$/.test((x.mese||'').replace(/^MESE\s*/i,''))),
   'il mese di competenza ha la sua colonna',r.map(x=>x.mese).join(' '));
ok(r.every(x=>/^\d{2}\/\d{2}\/\d{4}$/.test((x.data||'').replace(/^DATA\s*/i,''))),
   'e la data della fattura un\'altra, con l\'anno per esteso',r.map(x=>x.data).join(' '));
ok(r[2].mese.replace(/^MESE\s*/i,'')==='06/2026'&&r[2].data.replace(/^DATA\s*/i,'')==='26/06/2026',
   'e non si confondono fra loro',r[2].mese+' / '+r[2].data);

console.log('\n=== D. Le colonne sono incolonnate per davvero ===');
const geo=await pg.evaluate(()=>{
  const t=document.querySelector('#app .fatTestata');
  const intest=t?[...t.children].map(c=>Math.round(c.getBoundingClientRect().left)):[];
  const prima=document.querySelector('#app .rowFattura');
  const celle=prima?[...prima.children].map(c=>Math.round(c.getBoundingClientRect().left)):[];
  return {intest,celle,testataVisibile:!!t&&getComputedStyle(t).display!=='none'}});
ok(geo.testataVisibile,'su schermo largo c\'è l\'intestazione delle colonne');
ok(geo.intest.length===5&&geo.celle.length===5,'cinque colonne sopra e cinque sotto',
   geo.intest.length+' / '+geo.celle.length);
ok(geo.intest.every((x,i)=>Math.abs(x-geo.celle[i])<=1),
   'e ogni colonna comincia dove comincia la sua intestazione',
   JSON.stringify(geo.intest)+' vs '+JSON.stringify(geo.celle));

console.log('\n=== E. Su telefono si impila, ma il numero resta primo ===');
const pm=await apri(390);
const rm=await righe(pm);
ok(rm.length===4,'le righe ci sono anche qui',rm.length+'');
ok(rm.every(x=>/fatNum/.test(x.primo||'')),'il numero resta la prima cosa che si legge');
const etic=await pm.evaluate(()=>({
  testata:getComputedStyle(document.querySelector('#app .fatTestata')).display,
  etichette:[...document.querySelectorAll('#app .rowFattura .fatEtic')]
    .filter(e=>getComputedStyle(e).display!=='none').map(e=>e.textContent.trim())}));
ok(etic.testata==='none','l\'intestazione a colonne sparisce, che non ci starebbe',etic.testata);
ok(etic.etichette.length>0&&etic.etichette.includes('Mese')&&etic.etichette.includes('Data'),
   'e ogni dato si porta dietro la sua etichetta',JSON.stringify(etic.etichette.slice(0,4)));
// niente scroll orizzontale: e' la regola di tutta l'app
const scroll=await pm.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
ok(scroll<=1,'senza scroll orizzontale di pagina',scroll+'px');

const errs2=[];pm.on('pageerror',e=>errs2.push(e.message));
ok(errs.length===0&&errs2.length===0,'nessun errore JS',
   errs.concat(errs2).slice(0,2).join(' | ')||'nessuno');
await pg.close();await pm.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
