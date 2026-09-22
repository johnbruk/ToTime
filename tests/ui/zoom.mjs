// Lo zoom di iPhone che non torna più indietro.
//
// Safari ingrandisce la pagina da solo quando tocchi un campo il cui
// testo sta sotto i 16px, e a fine scrittura non la rimpicciolisce: la
// pagina resta larga e va stretta a mano, ogni volta.
//
// È una regola del browser, non un guasto dell'app: l'unico modo di
// disinnescarla senza togliere anche il pinch-to-zoom è che nessun campo
// scritto stia sotto i 16px sui dispositivi che si toccano.
//
// Qui si verifica su tutte le viste della mappa, campo per campo, con un
// iPhone emulato — e si verifica anche il contrario: che sul desktop la
// grafica disegnata resti quella, perché la correzione vale solo dove si
// tocca con il dito.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>server.listen(0,r));
const port=server.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

// Le viste si leggono dalla mappa vera: se se ne aggiunge una con dei
// campi dentro, questo test la prende da solo.
const src=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
const i0=src.indexOf('const map={home');
const VISTE=src.slice(i0+11,src.indexOf('};',i0)).split(',').map(x=>x.split(':')[0].trim()).filter(Boolean);

// Raccoglie ogni campo scrivibile visibile e la misura con cui il
// browser lo disegna davvero (non quella scritta nel foglio: quella
// che vince dopo cascata e media query).
const campi=pg=>pg.evaluate(()=>{
  const out=[];
  document.querySelectorAll('input,select,textarea').forEach(el=>{
    const r=el.getBoundingClientRect();
    if(!r.width||!r.height)return;              // non renderizzato
    if(el.type==='checkbox'||el.type==='radio'||el.type==='file')return; // non fanno zoom
    out.push({sel:(el.name||el.id||el.className||el.tagName).toString().slice(0,34),
              px:parseFloat(getComputedStyle(el).fontSize),
              tag:el.tagName.toLowerCase(),
              tronco:el.scrollWidth>el.clientWidth+1,
              h:Math.round(r.height)});
  });
  return out;
});

console.log(`\n=== A. iPhone: nessun campo sotto i 16px, su ${VISTE.length} viste ===`);
// hasTouch basta a farsi riconoscere «a puntatore grosso»; isMobile no,
// perché senza un meta viewport nel banco di prova Chromium disegnerebbe
// la pagina a 980px e non sarebbe più un telefono.
const pg=await b.newPage({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:3});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(700);

// Presupposto del rimedio: il browser si dichiara "a puntatore grosso".
// Se così non fosse la regola non scatterebbe e tutto il resto del test
// sarebbe verde per il motivo sbagliato.
const coarse=await pg.evaluate(()=>matchMedia('(pointer: coarse)').matches);
ok(coarse,'il dispositivo emulato è riconosciuto come touch',coarse?'(pointer: coarse)':'NO — il test non proverebbe niente');

const sotto=[],troncati=[];let visti=0,conCampi=0;
for(const v of VISTE){
  await pg.evaluate(x=>{try{window.go(x)}catch(e){}},v);
  await pg.waitForTimeout(60);
  const lista=await campi(pg);
  if(lista.length)conCampi++;
  for(const c of lista){
    visti++;
    if(c.px<16)sotto.push(`${v}/${c.tag} ${c.sel} = ${c.px}px`);
    if(c.tronco)troncati.push(`${v}/${c.tag} ${c.sel}`);
  }
}
ok(visti>0,'sono stati trovati campi da controllare',visti+' campi su '+conCampi+' viste');
ok(sotto.length===0,'nessun campo scrivibile sta sotto i 16px',sotto.slice(0,4).join(' | ')||visti+' campi tutti ≥16px');
ok(troncati.length===0,'e nessuno tronca il proprio contenuto alla nuova misura',troncati.slice(0,4).join(' | ')||'nessuno');

console.log('\n=== B. La griglia regge la misura più grande ===');
// La griglia ha righe solo nel mese in cui ci sono dati: su un mese
// vuoto non ci sarebbe niente da misurare e il test passerebbe a vuoto.
await pg.evaluate(()=>window.go('griglia'));await pg.waitForTimeout(300);
await pg.evaluate(()=>{for(let i=0;i<36;i++){
  if(document.querySelector('.month strong')?.textContent.startsWith('Luglio 2026'))break;
  window.changeMonth(-1)}});
await pg.waitForTimeout(400);
const g=await pg.evaluate(()=>{
  const celle=[...document.querySelectorAll('table.griglia td.gg input')].filter(c=>c.offsetParent!==null);
  const alt=new Set(celle.map(c=>Math.round(c.getBoundingClientRect().height)));
  const larg=new Set(celle.map(c=>Math.round(c.getBoundingClientRect().width)));
  const px=new Set(celle.map(c=>parseFloat(getComputedStyle(c).fontSize)));
  // una cella deve contenere "7,5" senza tagliarlo alla misura nuova
  let stretta=null;
  if(celle[0]){const c=celle[0],old=c.value;c.value='7,5';stretta=c.scrollWidth>c.clientWidth+1;c.value=old;}
  return {n:celle.length,alt:[...alt],larg:[...larg],px:[...px],stretta,
          pagina:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};
});
ok(g.n>0,'la griglia di luglio ha celle da compilare',g.n+' celle');
ok(g.px.length===1&&g.px[0]===16,'le celle della griglia sono a 16px sotto il dito',g.px.join('/')+'px');
ok(g.alt.length>0&&g.alt.every(h=>h>=44),'e restano alte almeno 44px',g.alt.join('/')+'px');
ok(g.stretta===false,'una cella contiene «7,5» senza tagliarlo',g.larg.join('/')+'px di colonna');
// In vista mensile la griglia è larga per costruzione e scorre dentro il
// suo contenitore: quello che non deve succedere è che trascini di lato
// la pagina intera. Misurato: la tabella è larga 1556px tanto a 13,5
// quanto a 16, la misura del testo non c'entra con la sua larghezza.
ok(g.pagina===false,'e la pagina non si trascina di lato',g.larg.join('/')+'px di colonna');

console.log('\n=== B2. Sono cresciuti i campi, non i pulsanti ===');
// Il rimedio riguarda solo ciò che si compila: se avesse preso dentro
// anche i pulsanti piccoli, la grafica del mobile cambierebbe senza che
// nessuno l'abbia chiesto. .miniBtn sta su entrambi, quindi è il caso in
// cui la distinzione si vede — ma va cercata dove quei campi ci sono
// davvero, non su una vista che non ne ha e direbbe di sì a vuoto.
const mis={bottoni:new Set(),campi:new Set()};
for(const v of VISTE){
  await pg.evaluate(x=>{try{window.go(x)}catch(e){}},v);
  await pg.waitForTimeout(40);
  const r=await pg.evaluate(()=>{
    const q=t=>[...document.querySelectorAll(t)].filter(e=>e.offsetParent!==null)
                .map(e=>parseFloat(getComputedStyle(e).fontSize));
    return {b:q('button.miniBtn'),c:q('select.miniBtn,input.miniBtn,textarea.miniBtn')};});
  r.b.forEach(x=>mis.bottoni.add(x));r.c.forEach(x=>mis.campi.add(x));
}
const bottoni=[...mis.bottoni],campiMini=[...mis.campi];
ok(bottoni.length>0&&bottoni.every(x=>x<16),'i pulsanti piccoli restano della misura di prima',bottoni.join('/')+'px');
ok(campiMini.length>0,'esistono campi che portano la stessa classe dei pulsanti',campiMini.length+' misure trovate');
ok(campiMini.every(x=>x>=16),'e sono loro, non i pulsanti, a salire a 16px',campiMini.join('/')+'px');

console.log('\n=== C. Il pinch-to-zoom resta possibile ===');
// La scorciatoia sbagliata a questo problema è maximum-scale/user-scalable=no:
// toglie lo zoom automatico togliendo anche quello volontario, e su un'app
// piena di numeri è un danno. Qui si verifica che non sia stata presa.
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const vp=(html.match(/<meta name="viewport"[^>]*>/)||[''])[0];
ok(/width=device-width/.test(vp),'il viewport si adatta alla larghezza dello schermo',vp.slice(0,80));
ok(!/user-scalable\s*=\s*no/.test(vp),'lo zoom manuale non è disattivato','user-scalable assente');
ok(!/maximum-scale/.test(vp),'e non c\'è un ingrandimento massimo imposto','maximum-scale assente');
const vero=await pg.evaluate(()=>{const m=document.querySelector('meta[name=viewport]');return m?m.content:''});
ok(vero===''||!/user-scalable\s*=\s*no|maximum-scale/.test(vero),'nemmeno aggiunto a runtime da app.js',vero||'nessun meta nel mock');
ok(errs.length===0,'nessun errore JS attraversando le viste su iPhone',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();

console.log('\n=== D. Sul desktop la grafica disegnata non cambia ===');
// Il rimedio è volutamente limitato al touch. Se un domani venisse
// applicato a tutti, i moduli del desktop crescerebbero senza che
// nessuno l'abbia deciso: questi due controlli lo fanno notare.
const pc=await b.newPage({viewport:{width:1440,height:900}});
await pc.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pc.waitForTimeout(700);
ok(!await pc.evaluate(()=>matchMedia('(pointer: coarse)').matches),'il desktop non è touch','(pointer: fine)');
await pc.evaluate(()=>window.go('dailyForm'));await pc.waitForTimeout(250);
const d=await pc.evaluate(()=>{const e=document.querySelector('.field input,.field select');
  return e?parseFloat(getComputedStyle(e).fontSize):0});
ok(d===15,'i campi dei moduli restano a 15px come da progetto',d+'px');
await pc.evaluate(()=>window.go('griglia'));await pc.waitForTimeout(300);
await pc.evaluate(()=>{for(let i=0;i<36;i++){
  if(document.querySelector('.month strong')?.textContent.startsWith('Luglio 2026'))break;
  window.changeMonth(-1)}});
await pc.waitForTimeout(400);
const dg=await pc.evaluate(()=>{const e=[...document.querySelectorAll('table.griglia td.gg input')]
  .filter(x=>x.offsetParent!==null)[0];
  return e?parseFloat(getComputedStyle(e).fontSize):0});
ok(dg===13.5,'e le celle della griglia a 13,5px',dg+'px');
await pc.close();

await b.close();server.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
