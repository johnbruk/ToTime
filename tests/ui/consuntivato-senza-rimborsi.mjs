// Il consuntivato e' il LAVORO. I rimborsi delle spese di trasferta
// sono soldi anticipati e riaddebitati: una partita a parte, non
// compenso. Sommarli gonfiava il consuntivato — in dashboard, nel
// timesheet, nel grafico dell'anno — di cifre che non sono ricavo del
// proprio lavoro.
//
// Ma restano dentro la fattura: la base imponibile (servizi + manuali +
// spese) li comprende. Quindi serve un secondo totale, il fatturabile,
// ed e' QUELLO che si confronta con le fatture emesse e su cui si
// stimano le tasse. Confondere i due significa dire «da fatturare» meno
// di quanto si deve davvero fatturare — cioe' fatturare meno di quanto
// si e' speso per il cliente.
//
// Qui si verifica che le due cose restino separate dappertutto, e che
// nessuna delle due sparisca dalla vista.
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
const testo=pg=>pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));

// Numeri scelti perche' si riconoscano a occhio e non si confondano:
//   lavoro      1.000,00  (un giorno a 1000)
//   rimborsi      250,00  (spesa riaddebitata in fattura)
//   a mio carico   40,00  (non riaddebitata: non c'entra con nessuno dei due)
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2',daily_rate:1000,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'omni',client_id:'k2',name:'Omnichannel',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.expense_categories=[{id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount'}];
  S.timesheet_entries=[{id:'e1',entry_date:'2026-10-05',client_id:'k2',project_id:'omni',activity_id:'a1',hours:8}];
  S.travel_expenses=[
    {id:'s1',expense_date:'2026-10-06',client_id:'k2',project_id:'omni',expense_category_id:'volo',
     work_city:'Catania',amount:250,reimbursement_type:'invoice'},
    {id:'s2',expense_date:'2026-10-07',client_id:'k2',project_id:'omni',expense_category_id:'volo',
     work_city:'Catania',amount:40,reimbursement_type:'own'}];
  S.monthly_compensations=[];S.manual_entries=[];S.trips=[];S.vehicles=[];S.billing_headers=[];
`;
const apri=async(w=390)=>{
  const pg=await b.newPage({viewport:{width:w,height:1800},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(800);
  // ci si porta su Ottobre 2026 come farebbe un dito: con le frecce
  await pg.evaluate(()=>{for(let i=0;i<60;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith('Ottobre 2026'))break;
    window.changeMonth(-1)}});
  await pg.waitForTimeout(500);
  return pg;
};

console.log('\n=== IL CONSUNTIVATO DEL MESE E’ SOLO LAVORO ===');
{
  const pg=await apri();
  const t=await testo(pg);
  ok(/1\.000,00/.test(t),'la dashboard mostra i 1.000,00 di lavoro',t.slice(0,120));
  ok(!/1\.250,00\s*€?\s*consuntivato/.test(t),
     'e NON 1.250,00: i 250 del volo non sono consuntivato');
  ok(/250,00/.test(t)&&/A parte/.test(t),
     'i 250 si vedono lo stesso, marcati «A parte»');
  ok(/rimborsi spese/i.test(t),'e detti per quello che sono: rimborsi spese');
  ok(!/40,00/.test(t)||!/A parte.*40,00/.test(t),
     'la spesa a mio carico non finisce fra i rimborsi riaddebitati');
  await pg.close();
}

console.log('\n=== E NEMMENO IL CONSUNTIVATO DELL’ANNO ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.openAnnualMonths());
  await pg.waitForTimeout(500);
  const t=await testo(pg);
  ok(/Consuntivato\s*1\.000,00/.test(t.replace(/\s+/g,' ')),
     'la pagina dell’anno dice 1.000,00 di consuntivato',
     (t.match(/Consuntivato[^·]{0,24}/)||[''])[0]);
  ok(/Fatturabile\s*1\.250,00/.test(t),
     'e 1.250,00 di fatturabile: lavoro + rimborsi, detto a parte',
     (t.match(/Fatturabile[^<·]{0,22}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== MA «DA FATTURARE» DEVE CONTARLI, O SI FATTURA DI MENO ===');
{
  // E' il punto che rende la separazione rischiosa: la base delle
  // fatture emesse comprende i rimborsi. Togliendoli da una parte sola,
  // «da fatturare» direbbe 1.000 invece di 1.250 e quei 250 anticipati
  // al cliente non verrebbero mai chiesti indietro.
  const pg=await apri();
  await pg.evaluate(()=>window.go('fatturatoDetail'));
  await pg.waitForTimeout(500);
  const t=await testo(pg);
  ok(/Consuntivato anno/.test(t)&&/1\.000,00/.test(t),'la pagina parte dal consuntivato: 1.000,00');
  ok(/Rimborsi spese in fattura/.test(t)&&/250,00/.test(t),'ci somma i 250,00 di rimborsi');
  ok(/Fatturabile/.test(t)&&/1\.250,00/.test(t),'arrivando a 1.250,00 di fatturabile');
  ok(/Da fatturare/.test(t),'e da lì calcola il da fatturare');
  // senza fatture emesse, da fatturare = tutto il fatturabile
  const df=await pg.evaluate(()=>window.annualTotals?window.annualTotals().daFatturare:null);
  ok(df===null||Math.abs(df-1250)<0.005,
     'che vale 1.250,00, non 1.000,00: i 250 anticipati si fatturano',String(df));
  await pg.close();
}

console.log('\n=== LA SPESA A MIO CARICO NON ENTRA NÉ NELL’UNO NÉ NELL’ALTRO ===');
{
  // I 40 pagati di tasca e non riaddebitati non sono ne' consuntivato
  // ne' fatturabile: sono un costo. Se finissero in uno dei due, si
  // fatturerebbe al cliente una spesa che si era deciso di tenersi.
  const pg=await apri();
  const n=await pg.evaluate(()=>{
    const t=window.annualTotals?window.annualTotals():null;
    return t?{cons:t.consuntivato,fatt:t.fatturabile,costi:t.costi,spese:t.spese}:null;
  });
  if(n){
    ok(Math.abs(n.cons-1000)<0.005,'consuntivato 1.000,00',String(n.cons));
    ok(Math.abs(n.fatt-1250)<0.005,'fatturabile 1.250,00',String(n.fatt));
    ok(Math.abs(n.costi-40)<0.005,'i 40 stanno fra i costi',String(n.costi));
    ok(Math.abs(n.spese-290)<0.005,'e lo speso totale e’ 290,00',String(n.spese));
  } else {
    ok(false,'annualTotals non è raggiungibile dal test');
  }
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== consuntivato senza rimborsi: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
