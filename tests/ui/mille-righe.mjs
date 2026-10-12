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
for(const tetto of [1000,400]){
  // senza conteggio una pagina corta non vuol dire «finite»: puo' essere
  // il tetto. Si va avanti fino alla prima pagina vuota.
  const pg=await apri({__senzaConteggio:true,__maxRighe:tetto});
  const t=await totali(pg);
  ok(t.join(',')===ATTESI.join(','),`senza conteggio e col tetto a ${tetto} arrivano tutte`,t.join(' · '));
  await pg.close();
}

// Quello che l'utente vede quando qualcosa non torna: il messaggio di
// errore del caricamento, non dei totali fatti su mezza tabella.
const messaggio=pg=>pg.evaluate(()=>(document.querySelector('#app .toast')?.innerText||'').replace(/\s+/g,' ').trim());

console.log('\n=== UNA PAGINA CHE CADE A METÀ ===');
{
  // la seconda pagina dei consuntivi fallisce una volta: si riprova da
  // capo, e i totali sono quelli veri
  const pg=await apri({__falliscePagina:{table:'timesheet_entries',da:1000,volte:1}});
  const t=await totali(pg);
  ok(t.join(',')===ATTESI.join(','),'una pagina caduta una volta: si riprova e arrivano tutte',t.join(' · '));
  ok(!(await messaggio(pg)),'senza nessun messaggio di errore');
  await pg.close();
}
{
  // fallisce sempre: niente totali fatti sulle prime 1000 righe come se
  // fossero tutte. Si dice.
  const pg=await apri({__falliscePagina:{table:'timesheet_entries',da:1000,volte:9}});
  const t=await totali(pg);
  ok(t[0]!==ATTESI[0]||t[1]!==80000,'una pagina che cade sempre non lascia i totali sulle prime 1000 righe',t.join(' · '));
  const m=await messaggio(pg);
  ok(/Errore caricamento timesheet_entries.*ricarica la pagina/.test(m),'e l’app lo dice',m||'nessun messaggio');
  ok(pg.errs.length===0,'senza errori JS',pg.errs.slice(0,2).join(' | ')||'nessuno');
  await pg.close();
}

console.log('\n=== UN ALTRO DISPOSITIVO AGGIUNGE UNA RIGA MENTRE SI SCARICA ===');
{
  // la riga nuova arriva dopo la prima pagina e sposta le altre: una
  // si ripeterebbe e la piu' vecchia salterebbe. Si vede dal doppione,
  // si riprova da capo, e la seconda lettura e' quella giusta
  const nuova={id:'nuova',entry_date:'2026-09-30',client_id:'c1',project_id:null,activity_id:'a1',hours:8,daily_rate_snapshot:400,standard_hours_snapshot:8};
  const pg=await apri({__aggiungeDopoPrimaPagina:{table:'timesheet_entries',riga:nuova}});
  const t=await totali(pg);
  ok(t.join(',')===[320000,320000,298400].join(','),'nessuna riga ripetuta né saltata, e c’è anche quella nuova',t.join(' · '));
  ok(!(await messaggio(pg)),'senza nessun messaggio di errore');
  await pg.close();
}

console.log('\n=== SE LE PAGINE NON SI POSSONO CHIEDERE, SI TORNA A COM’ERA: MA SOLO SE CI STA ===');
{
  // un client che non conosce range: le tabelle piccole si leggono con
  // la richiesta unica di prima, come prima
  const pg=await apri({__senzaRange:true});
  const clienti=await pg.evaluate(()=>window.__stores.clients.length);
  const sta=await pg.evaluate(()=>typeof window.clientName==='function'?window.clientName('c1'):'');
  ok(sta==='Cliente','le tabelle piccole si leggono lo stesso',sta);
  // la tabella grande no: una risposta piena e' tagliata, e lo si dice
  const m=await messaggio(pg);
  ok(/Errore caricamento timesheet_entries.*ricarica la pagina/.test(m),'quella da 2.345 righe non si mostra tagliata a 1000: si dice',m||'nessun messaggio');
  const t=await totali(pg);
  ok(t[1]!==80000,'e il 2025 non risulta 80.000',t.join(' · '));
  ok(pg.errs.length===0,'senza errori JS',pg.errs.slice(0,2).join(' | ')||'nessuno');
  const h=await pg.evaluate(()=>document.getElementById('app').innerText.length);
  ok(h>50,'e la pagina si disegna',String(h));
  await pg.close();
}

console.log('\n=== TROPPE PAGINE: SI DICE, NON SI TAGLIA ===');
{
  // con un tetto di 2 righe servirebbero 1.173 pagine, oltre il limite
  // di 500: la tabella non si mostra a metà
  const pg=await apri({__maxRighe:2});
  const m=await messaggio(pg);
  ok(/Errore caricamento timesheet_entries.*500 pagine/.test(m),'oltre le 500 pagine l’app lo dice',m||'nessun messaggio');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== mille righe: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
