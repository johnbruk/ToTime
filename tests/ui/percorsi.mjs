// Quanti tocchi costa fare le cose.
//
// I test di prima dicono che le schermate funzionano. Non dicono se
// usarle sia comodo. Qui si contano i tocchi veri — cliccando gli
// elementi come li clicca una persona, non chiamando go() — per i
// percorsi che si fanno ogni giorno, e si mette un tetto a ciascuno.
//
// Serve a due cose: dire se la pulizia ha davvero accorciato i percorsi,
// e accorgersi se un domani se ne allungasse uno di nascosto.
//
// Con APP_ALT=/percorso/app.js misura una versione diversa dell'app
// tenendo tutto il resto uguale: e' cosi' che si confronta il prima col
// dopo invece di raccontarselo.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const ALT=process.env.APP_ALT||null;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  const f=(ALT&&p==='/app.js')?ALT:path.join(ROOT,p);
  fs.readFile(f,(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

const pg=await b.newPage({viewport:{width:390,height:844},hasTouch:true});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));

let tocchi=0;
// Tocca il primo elemento visibile e cliccabile il cui testo combacia.
// Torna false se non lo trova, cosi' il percorso si ferma dove si
// fermerebbe una persona invece di proseguire su un'illusione.
const tocca=async(re,{dentro=null}={})=>{
  const fatto=await pg.evaluate(({re,dentro})=>{
    const rx=new RegExp(re,'i');
    const amb=dentro?document.querySelector(dentro):document;
    if(!amb)return false;
    const cand=[...amb.querySelectorAll('button,a,[onclick],[role=button]')]
      .filter(e=>e.offsetParent!==null&&rx.test((e.textContent||'').trim()))
      .sort((a,b)=>(a.textContent||'').length-(b.textContent||'').length);
    if(!cand.length)return false;
    cand[0].click();return true;
  },{re:re.source||re,dentro});
  if(fatto)tocchi++;
  await pg.waitForTimeout(320);
  return fatto;
};
const titolo=()=>pg.evaluate(()=>document.querySelector('#app h1')?.textContent.trim()||'');
const daCapo=async()=>{await pg.evaluate(()=>window.go('home'));await pg.waitForTimeout(350);tocchi=0};

await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(800);
console.log(ALT?`\n(misurando ${path.basename(ALT)})`:'\n(misurando la versione corrente)');

// Un percorso: una sequenza di tocchi e un tetto. Il tetto non e' un
// numero tondo scelto a caso — e' quanti tocchi servono davvero se non
// c'e' niente di superfluo in mezzo.
const PERCORSI=[
  {nome:'Nuovo consuntivo dalla dashboard', tetto:1,
   passi:[/^\+?\s*Nuovo consuntivo/], arrivo:/Consuntivo giornaliero/i},
  {nome:'Consuntivo mensile dal menu', tetto:3,
   passi:[/^☰$/,/Consuntivi|Timesheet/,/^Consuntivo mensile$/], arrivo:/Consuntivo mensile/i},
  {nome:'Calendario dal menu', tetto:3,
   passi:[/^☰$/,/Consuntivi|Timesheet/,/^Calendario$/], arrivo:/Calendario/i},
  {nome:'Carica da foglio dal menu', tetto:3,
   passi:[/^☰$/,/Consuntivi|Timesheet/,/^Carica da foglio$/], arrivo:/foglio|Carica/i},
  {nome:'Anagrafica clienti dal menu', tetto:3,
   passi:[/^☰$/,/Impostazioni/,/^Clienti/], arrivo:/Clienti/i},
];

console.log('\n=== I percorsi di ogni giorno ===');
const misure={};
for(const p of PERCORSI){
  await daCapo();
  let persa=null;
  for(const passo of p.passi){ if(!await tocca(passo)){persa=passo;break} }
  const arrivato=p.arrivo.test(await titolo());
  misure[p.nome]=persa?null:tocchi;
  ok(!persa&&arrivato,`${p.nome}: ${persa?'percorso interrotto':tocchi+' tocchi'}`,
     persa?`non ho trovato ${persa}`:`≤${p.tetto} · arrivo «${await titolo()}»`);
  if(!persa)ok(tocchi<=p.tetto,`  e sta nel tetto di ${p.tetto}`,tocchi+' tocchi');
}

console.log('\n=== Dal giorno al consuntivo, senza bivi ===');
await pg.evaluate(()=>window.openDay('2026-05-12'));await pg.waitForTimeout(400);
tocchi=0;
await tocca(/Aggiungi consuntivo/);
const t=await titolo();
ok(/Consuntivo giornaliero/i.test(t),'un tocco solo dal giorno al modulo',tocchi+' tocchi · «'+t+'»');
ok(await pg.evaluate(()=>document.querySelector('[name=entry_date]')?.value)==='2026-05-12',
   'e la data di quel giorno arriva gia\' compilata',
   await pg.evaluate(()=>document.querySelector('[name=entry_date]')?.value)||'vuota');

console.log('\n=== Quanto è lungo il menu ===');
const menu=await pg.evaluate(()=>{
  const n=document.querySelectorAll('.sidebarNav .navParentBtn,.sidebarNav button').length;
  return n});
const sorgente=fs.readFileSync(ALT||path.join(ROOT,'app.js'),'utf8');
const im=sorgente.indexOf('const MENU=[');
let d=0,k=sorgente.indexOf('[',im);
for(;k<sorgente.length;k++){ if(sorgente[k]==='[')d++; else if(sorgente[k]===']'){d--;if(!d)break} }
const foglie=[...sorgente.slice(im,k+1).matchAll(/\{v:'[a-zA-Z]+',l:'([^']+)'/g)].map(m=>m[1]);
console.log('  voci:',foglie.length);
ok(foglie.length<=20,'il menu sta entro venti voci',foglie.length+' voci');

console.log('\n=== Niente si rompe per strada ===');
ok(errs.length===0,'nessun errore JS lungo i percorsi',errs.slice(0,2).join(' | ')||'nessuno');

console.log('\nRIEPILOGO TOCCHI');
for(const [n,v] of Object.entries(misure))console.log(`  ${String(v??'—').padStart(2)}  ${n}`);
console.log(`  ${String(foglie.length).padStart(2)}  voci di menu`);

await pg.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
