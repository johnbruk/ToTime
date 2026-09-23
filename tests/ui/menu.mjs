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
  // il gruppo dei consuntivi, che e' quello che si apre ogni giorno
  dailyForm:'Consuntivi', griglia:'Consuntivi', calendario:'Consuntivi',
  importaConsuntivi:'Consuntivi', tmManage:'Consuntivi', pivot:'Consuntivi',
  // le anagrafiche stanno tutte sotto Impostazioni, anche quelle che non
  // hanno piu' una voce propria: ci si arriva da dentro il cliente, ma il
  // menu deve comunque restare aperto sul gruppo giusto
  clients:'Impostazioni', engagements:'Impostazioni', projects:'Impostazioni',
  activities:'Impostazioni', expenseCategories:'Impostazioni', appearance:'Impostazioni',
  billing:'Fatturazione', reportEconomico:'Fatturazione',
  fatturazioneCommessa:'Fatturazione', reportWbs:'Consuntivi',
  expenses:'Spese', tasseFuture:'Tassazione'};
const persi=[];
for(const [vista,atteso] of Object.entries(ATTESI)){
  await pg.evaluate(v=>window.go(v),vista);await pg.waitForTimeout(160);
  const g=await gruppo();
  if(g.aperto!==atteso)persi.push(vista+' → '+(g.aperto||'nessun gruppo aperto')+' (atteso '+atteso+')');
}
ok(persi.length===0,'nessuna vista fa richiudere il menu',persi.slice(0,4).join(' | ')||Object.keys(ATTESI).length+' viste controllate');

console.log('\n=== Le anagrafiche hanno una porta sola ===');
// Clienti, progetti e commesse sono una gerarchia: il progetto si crea
// dentro il cliente e la commessa dentro il progetto. Nel menu c'e' una
// voce sola, «Clienti e progetti», ma aprendo una commessa il gruppo
// giusto deve restare aperto lo stesso.
await pg.evaluate(()=>window.go('engagements'));await pg.waitForTimeout(250);
const g=await gruppo();
ok(g.aperto==='Impostazioni','aprendo una commessa resta aperto Impostazioni',g.aperto||'chiuso');
ok(g.sottovoci.includes('Clienti e progetti'),'e la porta alle anagrafiche e\' una sola',g.sottovoci.join(', '));
ok(!g.sottovoci.includes('Commesse')&&!g.sottovoci.includes('Progetti'),
   'senza piu\' tre voci separate per la stessa gerarchia',g.sottovoci.join(', '));

console.log('\n=== Il menu non elenca piu\' quello che non si usa ===');
// Le voci si leggono dalla definizione, non dal DOM: cliccare i gruppi
// ne apre uno e ne chiude un altro, e una lista raccolta cosi' sarebbe
// incompleta — un controllo che passerebbe perche' non ha guardato.
const fsMod=await import('node:fs');
const sorgente=fsMod.readFileSync(new URL('../../app.js',import.meta.url).pathname,'utf8');
const im=sorgente.indexOf('const MENU=[');
let d=0,k=sorgente.indexOf('[',im);
for(;k<sorgente.length;k++){ if(sorgente[k]==='[')d++; else if(sorgente[k]===']'){d--;if(!d)break} }
const bloccoMenu=sorgente.slice(im,k+1);
const etichette=[...bloccoMenu.matchAll(/\{v:'([a-zA-Z]+)',l:'([^']+)'/g)].map(m=>m[2]);
const viste=[...bloccoMenu.matchAll(/\{v:'([a-zA-Z]+)'/g)].map(m=>m[1]);
console.log('  voci di menu:',etichette.length,'→',etichette.join(', '));
ok(etichette.length<=20,'il menu resta sotto le venti voci',etichette.length+' voci');
for(const [vista,nome] of [['fatturazioneCommessa','Per commessa'],['reportWbs','Report analitico WBS'],
                           ['engagements','Commesse'],['projects','Progetti'],['newChoice','la scheda di scelta']])
  ok(!viste.includes(vista),`«${nome}» non e\' piu\' una voce di menu`);
// ...ma il menu deve puntare al modulo, non a un bivio prima del modulo
ok(viste.includes('dailyForm'),'e «Nuovo consuntivo» punta diritto al modulo',viste.slice(0,4).join(', '));

await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
