// Oltre le 1000 righe non si perde niente.
//
// Supabase consegna al massimo 1000 righe per richiesta (l'impostazione
// «Max rows» dell'API). L'app scaricava ogni tabella con una richiesta
// sola: oltre le 1000 righe le altre non arrivavano, e nessuno lo
// diceva. Con i consuntivi in ordine di data, sparivano gli anni più
// vecchi — e i loro totali risultavano sbagliati in silenzio.
//
// Adesso si scarica a pagine finché non arrivano tutte. Il finto
// database ha lo stesso tetto del vero, così il difetto si vede.
//
// 2.345 consuntivi da 8 ore a 400 €: 800 nel 2024, 800 nel 2025, 745
// nel 2026 (fino a settembre). Totali: 320.000 · 320.000 · 298.000.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

// i consuntivi in ordine di data: le prime 1000 righe sono tutto il
// 2024 e un pezzo del 2025, come nel database vero
const SEMI=(opzioni={})=>`
  const S=window.__stores;
  Object.assign(window,${JSON.stringify(opzioni)});
  S.clients=[{id:'c1',name:'Cliente',daily_rate:400,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  const righe=[];
  const metti=(anno,quante,mesi)=>{for(let n=0;n<quante;n++){
    const m=1+Math.floor(n/Math.ceil(quante/mesi)),g=1+(n%28);
    righe.push({id:anno+'-'+String(n).padStart(4,'0'),entry_date:anno+'-'+String(m).padStart(2,'0')+'-'+String(g).padStart(2,'0'),
      client_id:'c1',project_id:null,activity_id:'a1',hours:8,daily_rate_snapshot:400,standard_hours_snapshot:8});}};
  metti(2024,800,12);metti(2025,800,12);metti(2026,745,9);
  S.timesheet_entries=righe;
  window.__richieste={};
`;
const apri=async(opzioni)=>{
  const pg=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.errs=errs;
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI(opzioni));await pg.evaluate(()=>window.reload());await pg.waitForTimeout(800);
  return pg;
};
const totali=pg=>pg.evaluate(()=>[2024,2025,2026].map(y=>Math.round(window.annualTotals(y).consuntivato)));
const ATTESI=[320000,320000,298000];

console.log('\n=== OLTRE LE 1000 RIGHE ARRIVANO TUTTE ===');
{
  const pg=await apri();
  const t=await totali(pg);
  ok(t[0]===ATTESI[0],'il 2024, che sta tutto nelle prime 1000 righe: 320.000',String(t[0]));
  ok(t[1]===ATTESI[1],'il 2025, a cavallo della prima pagina: 320.000',String(t[1]));
  ok(t[2]===ATTESI[2],'e il 2026, che oltre le 1000 righe spariva: 298.000',String(t[2]));
  const r=await pg.evaluate(()=>window.__richieste);
  ok(r.timesheet_entries===3,'i consuntivi in tre richieste: 2.345 righe a pagine da 1000',String(r.timesheet_entries));
  ok(r.clients===1,'e una tabella piccola in una richiesta sola, come prima',String(r.clients));
  ok(pg.errs.length===0,'nessun errore JS',pg.errs.slice(0,2).join(' | ')||'nessuno');
  await pg.close();
}

console.log('\n=== ANCHE SE IL TETTO DEL DATABASE È PIÙ BASSO DELLA PAGINA ===');
{
  // chi ha abbassato «Max rows» a 400: una pagina chiesta da 1000 ne
  // porta 400, e non vuol dire che sono finite
  const pg=await apri({__maxRighe:400});
  const t=await totali(pg);
  ok(t.join(',')===ATTESI.join(','),'col tetto a 400 arrivano tutte lo stesso',t.join(' · '));
  await pg.close();
}

console.log('\n=== ANCHE SE IL DATABASE NON DICE QUANTE SONO ===');
{
  const pg=await apri({__senzaConteggio:true});
  const t=await totali(pg);
  ok(t.join(',')===ATTESI.join(','),'senza il conteggio si va avanti finché una pagina non è piena',t.join(' · '));
  await pg.close();
}

console.log('\n=== SE LE PAGINE NON SI POSSONO CHIEDERE, SI TORNA A COM’ERA ===');
{
  // un client che non conosce range, o una tabella che rifiuta
  // l'ordinamento per id: l'app non si deve rompere, e mostra al
  // peggio quello che mostrava prima
  const pg=await apri({__senzaRange:true});
  const t=await totali(pg);
  ok(t[0]===ATTESI[0],'l’app parte e il 2024 c’è, come prima',String(t[0]));
  ok(pg.errs.length===0,'senza errori JS',pg.errs.slice(0,2).join(' | ')||'nessuno');
  const h=await pg.evaluate(()=>document.getElementById('app').innerText.length);
  ok(h>50,'e la pagina si disegna',String(h));
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== mille righe: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
