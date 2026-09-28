// Il pianificato: in fattura, e ben visibile.
//
// Chi prepara la fattura prima della fine del mese vuole fatturare
// anche i giorni gia' in calendario. Prima la fatturazione li saltava
// del tutto — due righe di codice che dicevano «se e' pianificato,
// lascia perdere» — e in dashboard il totale del mese non li contava.
//
// Qui si verifica quello che serve davvero: che i conti cambino, che
// l'interruttore comandi, e che le giornate si leggano a colpo d'occhio
// anche su uno schermo stretto.
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
const eur=t=>Number(String(t).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'))||0;

const apri=async w=>{
  const pg=await b.newPage({viewport:{width:w,height:1000},hasTouch:w<900});
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(750);
  // il mock ha i dati a luglio 2026, con una riga pianificata il 30
  await pg.evaluate(()=>{for(let i=0;i<36;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith('Luglio 2026'))break;
    window.changeMonth(-1)}});
  await pg.waitForTimeout(350);
  return pg;
};

console.log('\n=== A. In dashboard le giornate si leggono tutte e tre ===');
const pg=await apri(1280);
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
const dash=await pg.evaluate(()=>{
  const c=document.querySelector('#app .card.cardLink');
  const k=[...c.querySelectorAll('.kpiGrid div')].map(d=>({
    et:d.querySelector('span')?.textContent.trim(),
    n:d.querySelector('strong')?.textContent.trim(),
    sotto:d.querySelector('small')?.textContent.trim()}));
  return {k,riga:c.querySelector('.metricLine')?.textContent.replace(/\s+/g,' ').trim()};
});
ok(dash.k.length===3,'sono tre numeri, non due',dash.k.map(x=>x.et).join(' · '));
ok(dash.k[0].et==='Consuntivate'&&dash.k[1].et==='Pianificate'&&dash.k[2].et==='Totale',
   'consuntivate, pianificate e totale',dash.k.map(x=>x.et).join(' · '));
const gg=dash.k.map(x=>Number(String(x.n).replace(',','.').replace(/[^\d.]/g,'')));
ok(Math.abs(gg[0]+gg[1]-gg[2])<0.01,'il totale è davvero la somma dei due',
   `${gg[0]} + ${gg[1]} = ${gg[2]}`);
ok(gg[1]>0,'e nel mese di prova il pianificato c\'è',gg[1]+' gg');
ok(dash.k.every(x=>/gg$/.test(x.n)),'i numeri dicono di che unità sono',dash.k.map(x=>x.n).join(' · '));
ok(dash.k.every(x=>/h$/.test(x.sotto||'')),'con le ore sotto',dash.k.map(x=>x.sotto).join(' · '));
ok(/consuntivato/.test(dash.riga||'')&&/pianificato/.test(dash.riga||'')&&/totale/.test(dash.riga||''),
   'e gli importi divisi allo stesso modo',dash.riga);

console.log('\n=== B. La fattura comprende il pianificato ===');
const totali=async()=>{await pg.evaluate(()=>window.go('billing'));await pg.waitForTimeout(400);
  return await pg.evaluate(()=>({
    acceso:document.querySelector('.rigaPian input')?.checked,
    righe:[...document.querySelectorAll('#app .list .row')]
      .filter(r=>/€/.test(r.innerText))
      .map(r=>({t:r.innerText.split('\n')[0],v:r.innerText}))}));};
const acceso=await totali();
ok(acceso.acceso===true,'l\'interruttore è acceso di partenza','acceso: '+acceso.acceso);
const eq1=acceso.righe.find(r=>/Equans/.test(r.t));
ok(!!eq1,'c\'è il cliente con la riga pianificata',eq1?eq1.t:'—');
const ore1=Number((eq1.v.match(/([\d,]+) h/)||[])[1]?.replace(',','.'));

await pg.evaluate(()=>window.cambiaFatturaPianificato(false));await pg.waitForTimeout(600);
const spento=await totali();
ok(spento.acceso===false,'si può spegnere','acceso: '+spento.acceso);
const eq2=spento.righe.find(r=>/Equans/.test(r.t));
const ore2=Number((eq2.v.match(/([\d,]+) h/)||[])[1]?.replace(',','.'));
ok(ore2<ore1,'spento, la fattura scende',`${ore1} h → ${ore2} h`);
ok(Math.abs((ore1-ore2)-4)<0.01,'e la differenza è esattamente il pianificato del mese',
   `differenza ${(ore1-ore2).toFixed(1)} h, attese 4,0 h`);

await pg.evaluate(()=>window.cambiaFatturaPianificato(true));await pg.waitForTimeout(600);
const riacceso=await totali();
const ore3=Number((riacceso.righe.find(r=>/Equans/.test(r.t)).v.match(/([\d,]+) h/)||[])[1]?.replace(',','.'));
ok(Math.abs(ore3-ore1)<0.01,'riacceso, si torna come prima',`${ore3} h`);
// La scelta va scritta, non tenuta solo a schermo: saveSetting aggiorna
// il database ma non la copia in memoria, e senza quella l'interruttore
// non aveva effetto fino al ricaricamento.
ok(await pg.evaluate(()=>(window.__stores.app_settings||[]).some(s=>s.setting_key==='fattura_pianificato')),
   'e la scelta viene salvata, non solo mostrata');

console.log('\n=== C. La scheda del cliente lo dichiara ===');
await pg.evaluate(()=>{const r=[...document.querySelectorAll('#app .list .row')].find(x=>/Equans/.test(x.innerText));r&&r.click()});
await pg.waitForTimeout(500);
const scheda=await pg.evaluate(()=>{const c=document.querySelector('#app .card');
  return c?c.innerText.replace(/\s+/g,' ').trim():''});
ok(/Pianificato/.test(scheda),'la scheda dice quanto del totale è pianificato',scheda.slice(0,150));
ok(/dei .* di base/.test(scheda),'e lo mette in rapporto alla base',scheda.slice(0,150));
ok(errs.length===0,'nessun errore JS',errs.slice(0,2).join(' | ')||'nessuno');
await pg.close();

console.log('\n=== D. Sul telefono resta leggibile ===');
// La richiesta era esplicita: sobrio, e che regga su uno schermo
// stretto. Tre numeri affiancati sono il punto dove si rompe.
for(const w of [320,390,430]){
  const p2=await apri(w);
  const r=await p2.evaluate(()=>{
    const c=document.querySelector('#app .card.cardLink');
    const et=[...c.querySelectorAll('.kpiGrid span')];
    const num=[...c.querySelectorAll('.kpiGrid strong')];
    return {tronche:et.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent),
            numTronchi:num.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent),
            ovf:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};});
  ok(r.tronche.length===0,`a ${w}px le etichette non vengono tagliate`,r.tronche.join(' | ')||'nessuna');
  ok(r.numTronchi.length===0,`a ${w}px i numeri nemmeno`,r.numTronchi.join(' | ')||'nessuno');
  ok(!r.ovf,`e a ${w}px la pagina non scorre di lato`);
  if(w===390){
    await p2.evaluate(()=>window.go('billing'));await p2.waitForTimeout(400);
    const h=await p2.evaluate(()=>{const l=document.querySelector('.rigaPian label');
      return l?Math.round(l.getBoundingClientRect().height):0});
    ok(h>=44,'e l\'interruttore si tocca comodamente',h+'px');
  }
  await p2.close();
}

await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
