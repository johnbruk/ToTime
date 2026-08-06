// Verifica la grafica: la scala tipografica, la gerarchia dei numeri,
// l'assenza di scorrimento laterale e le dimensioni minime dei bersagli
// da toccare. Sono le quattro cose che si erano rotte da sole, rilascio
// dopo rilascio, senza che nessun test se ne accorgesse.
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

const VISTE=['home','timesheet','billing','tax','balance','pivot','giorno','calendario','griglia','expenses','settings','clients','projects','invoices','menu'];

// Raccoglie, per ogni vista, quello che serve alle verifiche.
async function scan(pg){
  return pg.evaluate(()=>{
    const app=document.getElementById('app');
    const sizes=new Set(),weights=new Set();
    const troncate=[],piccoli=[],sfondati=[];
    const W=document.documentElement.clientWidth;
    app.querySelectorAll('*').forEach(el=>{
      const t=(el.textContent||'').trim();
      const cs=getComputedStyle(el);
      // solo elementi che portano testo proprio, non contenitori
      const propri=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      if(propri&&t){sizes.add(cs.fontSize);weights.add(cs.fontWeight)}
      const r=el.getBoundingClientRect();
      // dentro un contenitore che scorre da solo, sforare è previsto:
      // la griglia del mese è larga per costruzione
      const scorre=el.closest('[style*="overflow"],.grigliaWrap,.grigliaCard,table.griglia');
      if(r.width&&r.right>W+1&&!scorre)sfondati.push((el.className||el.tagName)+' → '+Math.round(r.right));
    });
    app.querySelectorAll('.kpiGrid span,.statLbl').forEach(el=>{
      if(el.scrollWidth>el.clientWidth+1)troncate.push(el.textContent.trim());
    });
    app.querySelectorAll('button,a[href],[onclick],input,select').forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.width>0&&r.height>0&&r.height<40&&!el.closest('table.griglia')&&!el.closest('.calGrid'))
        piccoli.push((el.className||el.tagName)+' '+Math.round(r.height)+'px');
    });
    // i numeri di uno stesso blocco devono partire dalla stessa quota
    const sfasati=[];
    app.querySelectorAll('.kpiGrid').forEach(g=>{
      const cols=getComputedStyle(g).gridTemplateColumns.split(' ').length;
      const tops=[...g.children].map(d=>d.querySelector('strong')?.getBoundingClientRect().top).filter(x=>x!=null);
      for(let i=0;i<tops.length;i+=cols){
        const banda=tops.slice(i,i+cols);
        if(banda.length>1&&Math.max(...banda)-Math.min(...banda)>1)sfasati.push(banda.map(Math.round).join('/'));
      }
    });
    return {sizes:[...sizes],weights:[...weights],troncate,piccoli,sfondati,sfasati,
      overflow:document.documentElement.scrollWidth>W+1};
  });
}

for(const [larghezza,etichetta] of [[360,'telefono stretto (360px)'],[1440,'desktop (1440px)']]){
  console.log(`\n=== ${etichetta} ===`);
  const pg=await b.newPage({viewport:{width:larghezza,height:larghezza<500?740:900}});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(700);
  const tutteSizes=new Set(),tutteWeights=new Set();
  let overflow=[],troncate=[],sfasati=[],sfondati=[],piccoli=[];
  for(const v of VISTE){
    await pg.evaluate(x=>window.go(x),v).catch(()=>{});
    await pg.waitForTimeout(250);
    const r=await scan(pg);
    r.sizes.forEach(x=>tutteSizes.add(x));r.weights.forEach(x=>tutteWeights.add(x));
    if(r.overflow)overflow.push(v);
    r.troncate.forEach(x=>troncate.push(v+': '+x));
    r.sfasati.forEach(x=>sfasati.push(v+': '+x));
    r.sfondati.forEach(x=>sfondati.push(v+': '+x));
    r.piccoli.forEach(x=>piccoli.push(v+': '+x));
  }
  ok(overflow.length===0,'nessuna vista scorre lateralmente',overflow.join(', ')||VISTE.length+' viste controllate');
  ok(sfondati.length===0,'nessun elemento esce dallo schermo',sfondati.slice(0,3).join(' | ')||'nessuno');
  ok(troncate.length===0,'nessuna etichetta di riepilogo viene troncata',troncate.slice(0,3).join(' | ')||'nessuna');
  ok(sfasati.length===0,'i numeri di uno stesso riepilogo sono allineati',sfasati.slice(0,3).join(' | ')||'allineati');
  ok(tutteSizes.size<=6,'la scala tipografica resta a sei passi',tutteSizes.size+' misure: '+[...tutteSizes].sort((a,b)=>parseFloat(a)-parseFloat(b)).join(' '));
  ok(tutteWeights.size<=3,'i pesi del carattere restano tre',tutteWeights.size+' pesi: '+[...tutteWeights].sort().join(' '));
  if(larghezza===360)
    ok(piccoli.length===0,'ogni comando è alto almeno 40px sotto il dito',piccoli.slice(0,3).join(' | ')||'nessuno sotto misura');
  ok(errs.length===0,'nessun errore JS attraversando tutte le viste',errs.slice(0,2).join(' | ')||'nessuno');
  await pg.close();
}

console.log('\n=== Il foglio di stile ===');
const css=fs.readFileSync(path.join(ROOT,'styles.css'),'utf8');
ok(/--t-xs:.*--w-reg|--t-xs:/s.test(css),'esiste la scala di dimensioni dichiarata una volta sola');
ok(/--w-reg:\s*400/.test(css)&&/--w-med:\s*600/.test(css)&&/--w-bold:\s*750/.test(css),'e i tre pesi del carattere');
const js=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
const inline=(js.match(/style="[^"]*font-size:/g)||[]).length;
ok(inline===0,'nessuna dimensione di carattere scritta a mano nel markup',inline+' occorrenze');
const icone=(js.match(/MENU=\[[\s\S]*?\];/)||[''])[0].match(/'([^'a-zA-Z0-9 ]{1,2})'/g)||[];
ok(new Set(icone).size===icone.length,'nessuna icona di menu ripetuta',icone.join(' ')||'—');

await b.close();server.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
