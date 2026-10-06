// Le spese devono andare in fattura come si deve.
//
// Due guasti, trovati leggendo il codice:
//
// 1) groupSummary() prende solo le spese con «Rimborso in fattura».
//    Quelle a PIÈ DI LISTA non arrivano in fattura affatto: non
//    compaiono da nessuna parte nel flusso di fatturazione, quindi non
//    si sa nemmeno cosa chiedere al cliente. Soldi anticipati e
//    dimenticati.
//
// 2) La descrizione da copiare su Fiscozen diceva «Rimborso spese di
//    trasferta - Ottobre 2026 - Omnichannel - Volo»: manca la DATA e
//    manca l'IMPORTO, cioè proprio ciò che rende l'addebito ANALITICO.
//    Dal 2025 l'addebito analitico è la condizione perché il rimborso
//    resti fuori dal reddito: una descrizione generica non la soddisfa.
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
const testo=pg=>pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));
// le descrizioni da copiare stanno nelle .copybox
const copybox=pg=>pg.evaluate(()=>[...document.querySelectorAll('#app .copybox')].map(x=>x.textContent.replace(/\s+/g,' ').trim()));

const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'omni',client_id:'k2',name:'Omnichannel',active:true}];
  S.expense_categories=[
    {id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false},
    {id:'km',name:'Rimborso KM',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'km',default_unit_rate:0.45,is_mileage:true},
    {id:'taxi',name:'Taxi',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false}];
  S.vehicles=[{id:'v1',name:'Panda',rate_per_km:0.45,aci_year:2026,active:true}];
  S.trips=[{id:'tr1',client_id:'k2',project_id:'omni',destination_city:'Catania',destination_country:'IT',
    start_date:'2026-10-25',end_date:'2026-10-29',purpose:'Go-live',status:'to_recharge'}];
  S.timesheet_entries=[{id:'ore',entry_date:'2026-10-20',client_id:'k2',project_id:'omni',hours:8,
    daily_rate_snapshot:500,standard_hours_snapshot:8}];
  S.travel_expenses=[
    {id:'s1',expense_date:'2026-10-25',client_id:'k2',project_id:'omni',expense_category_id:'volo',
     work_city:'Catania',amount:428,reimbursement_type:'invoice',trip_id:'tr1',
     payment_method:'carta',receipt_kept:true,description:'Milano Linate → Catania'},
    {id:'s2',expense_date:'2026-10-29',client_id:'k2',project_id:'omni',expense_category_id:'km',
     work_city:'Catania',amount:94.5,quantity:210,unit_rate:0.45,vehicle_id:'v1',
     from_place:'Catania',to_place:'Modica',round_trip:true,
     reimbursement_type:'invoice',trip_id:'tr1',payment_method:'carta',receipt_kept:true},
    {id:'s3',expense_date:'2026-10-26',client_id:'k2',project_id:'omni',expense_category_id:'taxi',
     work_city:'Catania',amount:38,reimbursement_type:'expense_report',trip_id:'tr1',
     payment_method:'contanti',receipt_kept:true,description:'Aeroporto → hotel'}];
  S.billing_headers=[];
`;
const apri=async(w=390)=>{
  const pg=await b.newPage({viewport:{width:w,height:2200},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.go('billing'));
  await pg.waitForTimeout(350);
  await pg.evaluate(()=>{for(let i=0;i<48;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith('Ottobre 2026'))break;
    window.changeMonth(-1)}});
  await pg.waitForTimeout(450);
  return pg;
};
const alDettaglio=async pg=>{
  await pg.evaluate(()=>window.navigateTo('billingDetail',{edit:'k2'}));
  await pg.waitForTimeout(500);
};

console.log('\n=== IL PIÈ DI LISTA NON SPARISCE PIÙ ===');
{
  const pg=await apri();
  await alDettaglio(pg);
  const t=await testo(pg);
  ok(t.includes('Taxi'),'il taxi a piè di lista compare nel dettaglio fattura',t.slice(0,200));
  ok(/piè di lista/i.test(t),'in una sezione sua, che si chiama col suo nome');
  ok(t.includes('38,00'),'col suo importo');
  // ...ma NON dentro il totale della fattura: è una partita di giro,
  // e nessun importo di fattura si deve muovere di nascosto.
  const tot=await pg.evaluate(()=>document.querySelector('#app .amount')?.textContent||'');
  ok(!tot.includes('38'),'ma fuori dal totale della fattura: 500 + 428 + 94,50 = 1.022,50 di base',tot.trim());
  ok(/1\.022,50|1022,50/.test(t),'il totale di base resta quello di prima',tot.trim());
  // e dice quanto c'è da farsi rimborsare a parte
  ok(/da chiedere|a parte|rimborsare/i.test(t),'e dice che va chiesto a parte');
  await pg.close();
}

console.log('\n=== LE DESCRIZIONI SONO ANALITICHE ===');
{
  const pg=await apri();
  await alDettaglio(pg);
  const box=await copybox(pg);
  const volo=box.find(x=>/volo/i.test(x));
  ok(!!volo,'c’è la riga del volo da copiare',box.join(' || ').slice(0,200));
  // Il requisito dell'addebito analitico: data e importo, voce per voce
  ok(/25\/10\/2026/.test(volo||''),'con la DATA della spesa, non solo il mese',String(volo));
  ok(/428,00/.test(volo||''),'e con l’IMPORTO della singola spesa',String(volo));
  ok(/volo/i.test(volo||''),'e la voce',String(volo));
  // E non deve piu' dire «Fattura Fattura» o ripetere «Rimborso spese»
  ok(!/rimborso spese di trasferta.*rimborso spese di trasferta/i.test(volo||''),
     'senza ripetere due volte la stessa intestazione',String(volo));
  // La chilometrica porta il percorso: e' quello che la rende verificabile
  const km=box.find(x=>/km/i.test(x));
  ok(!!km&&/Catania/.test(km)&&/Modica/.test(km),'la chilometrica porta il percorso in fattura',String(km));
  ok(!!km&&/210 km/.test(km),'coi chilometri',String(km));
  // La trasferta da' la causale
  ok(!!volo&&/Catania/.test(volo),'e si capisce a quale trasferta appartiene',String(volo));
  await pg.close();
}

console.log('\n=== LE RIGHE DELLA FATTURA SONO UNA PER SPESA ===');
{
  const pg=await apri();
  await alDettaglio(pg);
  // Non un totale «Spese di trasferta 522,50»: una riga per spesa,
  // perche' l'addebito analitico vuole il dettaglio.
  const dellaFattura=await pg.evaluate(()=>[...document.querySelectorAll('#app .copybox[id^=copy-]')]
    .map(x=>x.textContent.replace(/\s+/g,' ').trim()).filter(x=>/rimborso spese/i.test(x)));
  ok(dellaFattura.length===2,'due righe di rimborso in fattura, una per spesa',String(dellaFattura.length));
  const aPiede=await pg.evaluate(()=>[...document.querySelectorAll('#app .copybox[id^=pie-]')].length);
  ok(aPiede===1,'e una sola a pi\u00e8 di lista, in una lista a parte',String(aPiede));
  const importi=dellaFattura.map(x=>x.match(/([\d.]+,\d\d)\s*€?$/)?.[1]||'');
  ok(importi.includes('428,00')&&importi.includes('94,50'),
     'coi due importi distinti, non sommati',importi.join(' | '));
  await pg.close();
}

console.log('\n=== NIENTE PIÈ DI LISTA, NIENTE SEZIONE ===');
{
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.travel_expenses=window.__stores.travel_expenses.filter(e=>e.reimbursement_type!=='expense_report');
    return window.reload();
  });
  await pg.waitForTimeout(600);
  await alDettaglio(pg);
  const t=await testo(pg);
  ok(!/piè di lista/i.test(t),'senza spese a piè di lista la sezione non compare');
  ok(t.includes('428,00'),'e il resto della fattura è tutto lì');
  await pg.close();
}

console.log('\n=== LE SPESE A MIO CARICO RESTANO FUORI ===');
{
  // Un costo mio non va in fattura ne' a pie' di lista: non si deve
  // vedere nel dettaglio fattura, o uno lo chiede per sbaglio.
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.travel_expenses.push({id:'s4',expense_date:'2026-10-27',client_id:'k2',
      project_id:'omni',expense_category_id:'taxi',amount:999,reimbursement_type:'own',
      description:'Cena mia',payment_method:'carta',receipt_kept:true});
    return window.reload();
  });
  await pg.waitForTimeout(600);
  await alDettaglio(pg);
  const t=await testo(pg);
  ok(!t.includes('999'),'una spesa a mio carico non compare nel dettaglio fattura',t.slice(0,200));
  ok(!t.includes('Cena mia'),'nemmeno la sua descrizione');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== spese in fattura: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
