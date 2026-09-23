// La misura dei bersagli da toccare.
//
// Apple indica 44px come minimo per un comando che si tocca col dito:
// sotto quella soglia il dito manca il bersaglio, o ne prende un altro.
// Nell'app stavano a 40-42px le frecce del mese, le icone della barra,
// la ✕ del menu, i pulsanti di spostamento e le linguette dei periodi.
// Si toccavano, ma sotto la linea.
//
// Il rimedio vale solo dove si tocca, quindi qui si verificano due cose
// opposte: che sotto il dito nessun comando scenda sotto i 44, e che sul
// desktop — dove il puntatore e' preciso — la grafica resti quella
// disegnata. Un controllo solo direbbe meta' della verita'.
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

const src=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
const i0=src.indexOf("let html='';const map={");
let d=0,k=src.indexOf('{',i0+14); const st=k;
for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--;if(!d)break} }
const VISTE=src.slice(st+1,k).split(',').map(x=>x.split(':')[0].trim()).filter(Boolean);

// Le celle della griglia del mese e i giorni del calendario sono
// esclusi: sono caselle di una tabella fitta, non comandi a se', e
// hanno gia' i loro 44px di altezza verificati altrove.
const misura=pg=>pg.evaluate(()=>{
  const out=[];
  document.querySelectorAll('#app button,#app [onclick],#app a[href],.topMenu button').forEach(e=>{
    const r=e.getBoundingClientRect();
    if(!r.width||!r.height)return;
    if(e.closest('table.griglia')||e.closest('.calGrid'))return;
    if(r.height<44)out.push((e.className||e.tagName).toString().split(' ')[0]+' '+Math.round(r.height)+'px');
  });
  return {out,ovf:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};
});

console.log(`\n=== A. Sotto il dito, su ${VISTE.length} viste e quattro iPhone ===`);
// Le larghezze sono quelle vere: SE di prima generazione, SE/8, la
// famiglia 13-15, e i Pro Max.
for(const [w,h,nome] of [[320,568,'iPhone SE 1ª gen'],[375,667,'iPhone SE / 8'],
                         [390,844,'iPhone 13/14/15'],[430,932,'iPhone Pro Max']]){
  const pg=await b.newPage({viewport:{width:w,height:h},hasTouch:true,deviceScaleFactor:3});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);
  if(w===390)ok(await pg.evaluate(()=>matchMedia('(pointer: coarse)').matches),
    'il dispositivo emulato e\' riconosciuto come touch','altrimenti il resto non proverebbe niente');
  const piccoli=new Map(); const scorrono=[];
  for(const v of VISTE){
    await pg.evaluate(x=>{try{window.go(x)}catch(e){}},v);await pg.waitForTimeout(40);
    const r=await misura(pg);
    r.out.forEach(x=>piccoli.set(x,(piccoli.get(x)||0)+1));
    if(r.ovf)scorrono.push(v);
  }
  ok(piccoli.size===0,`${nome} (${w}px): ogni comando arriva a 44px`,
     piccoli.size?[...piccoli.keys()].slice(0,4).join(' | '):VISTE.length+' viste');
  ok(scorrono.length===0,`  e nessuna vista scorre di lato`,scorrono.slice(0,3).join(', ')||'nessuna');
  ok(errs.length===0,`  senza errori JS`,errs.slice(0,1).join('')||'nessuno');
  await pg.close();
}

console.log('\n=== B. Sul desktop la grafica disegnata non cambia ===');
// Se un domani la regola venisse tolta dal media query e applicata a
// tutti, le icone della barra crescerebbero sul desktop senza che
// nessuno l'abbia deciso. Questi due controlli lo fanno notare.
const pc=await b.newPage({viewport:{width:1440,height:900}});
await pc.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pc.waitForTimeout(700);
ok(!await pc.evaluate(()=>matchMedia('(pointer: coarse)').matches),'il desktop non e\' touch','(pointer: fine)');
await pc.evaluate(()=>window.go('home'));await pc.waitForTimeout(250);
const des=await pc.evaluate(()=>{
  const q=s=>{const e=[...document.querySelectorAll(s)].filter(x=>x.offsetParent!==null)[0];
    return e?Math.round(e.getBoundingClientRect().height):null};
  return {mese:q('.month button'),barra:q('.headerIcon'),menu:q('.sidebarNav button')};});
// Misurati, non supposti: sopra i 960px la barra in alto e' nascosta e
// al suo posto c'e' il menu laterale, quindi le sue icone sul desktop
// non esistono proprio; e le frecce del mese li' stanno a 40px.
ok(des.mese===40,'le frecce del mese restano a 40px sul desktop',des.mese+'px');
ok(des.barra===null,'e le icone della barra sul desktop non ci sono, c\'e\' il menu laterale',
   des.barra===null?'barra nascosta sopra i 960px':des.barra+'px');
ok(des.menu>=44,'il menu laterale era gia\' a misura',des.menu+'px');
await pc.close();

await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
