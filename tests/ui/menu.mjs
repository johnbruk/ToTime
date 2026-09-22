// Il menu laterale deve restare aperto sulla voce in cui si sta
// lavorando. Una vista che non risulta figlia di nessuna voce fa
// richiudere il gruppo appena la si apre: sembra che il menu si
// chiuda da solo, e si perde l'orientamento a ogni clic.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
const pg=await b.newPage({viewport:{width:1280,height:1000}});
await pg.goto(`http://127.0.0.1:${srv.address().port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(800);
// quale gruppo risulta aperto, e quali sottovoci si vedono
const gruppo=async()=>pg.evaluate(()=>{
  const aperto=[...document.querySelectorAll('.sidebarNav .navParentBtn')].find(b=>/▾/.test(b.textContent));
  // il testo del pulsante contiene anche l'icona: si tiene solo il nome
  return {aperto:aperto?aperto.textContent.replace(/[^A-Za-zÀ-ú ]/g,'').trim():null,
          sottovoci:[...document.querySelectorAll('.sidebarNav .navSubItem')].map(x=>x.textContent.trim())};});

console.log('\n=== Ogni vista tiene aperto il suo gruppo ===');
const ATTESI={
  clients:'Impostazioni', engagements:'Impostazioni', projects:'Impostazioni',
  activities:'Impostazioni', expenseCategories:'Impostazioni', appearance:'Impostazioni',
  griglia:'Timesheet', calendario:'Timesheet', pivot:'Timesheet', reportWbs:'Timesheet',
  billing:'Fatturazione', fatturazioneCommessa:'Fatturazione', reportEconomico:'Fatturazione',
  expenses:'Spese', tasseFuture:'Tassazione'};
const persi=[];
for(const [vista,atteso] of Object.entries(ATTESI)){
  await pg.evaluate(v=>window.go(v),vista);await pg.waitForTimeout(160);
  const g=await gruppo();
  if(g.aperto!==atteso)persi.push(vista+' → '+(g.aperto||'nessun gruppo aperto')+' (atteso '+atteso+')');
}
ok(persi.length===0,'nessuna vista fa richiudere il menu',persi.slice(0,4).join(' | ')||Object.keys(ATTESI).length+' viste controllate');

console.log('\n=== Aprendo Commesse le sottovoci restano ===');
await pg.evaluate(()=>window.go('engagements'));await pg.waitForTimeout(250);
const g=await gruppo();
ok(g.aperto==='Impostazioni','il gruppo Impostazioni resta aperto',g.aperto||'chiuso');
ok(g.sottovoci.includes('Commesse')&&g.sottovoci.includes('Clienti'),
  'e si vedono ancora Clienti, Commesse, Progetti',g.sottovoci.join(', '));
const attiva=await pg.evaluate(()=>{const a=document.querySelector('.sidebarNav .navSubItem.active');return a?a.textContent.trim():null});
ok(attiva==='Commesse','con Commesse evidenziata come voce corrente',attiva||'nessuna');

await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
