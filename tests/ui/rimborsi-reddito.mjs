// I rimborsi analitici e il reddito.
//
// Oggi «Rimborso in fattura» finisce dritto nei ricavi e quindi nella
// stima delle imposte. E' una scelta implicita, mai dichiarata.
//
// Dal 1° gennaio 2025 i rimborsi ANALITICI di vitto, alloggio, viaggio
// e trasporto, pagati con strumenti TRACCIABILI e addebitati voce per
// voce, non concorrono al reddito. Quelli forfettari — e il rimborso
// chilometrico è forfettario — restano compensi.
//
// Ma sull'applicazione al forfettario la dottrina è divisa. Quindi la
// cosa più importante che questo file verifica è che l'app NON decida
// da sola: default invariato, e la stima si muove solo se la scelta
// viene cambiata a mano.
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
const calc=pg=>pg.evaluate(()=>{const c=window.annualTaxCalc(2026);
  return {revenue:c.revenue,incassato:c.incassato,fuori:c.rimborsiFuori,
    forfait:c.forfaitIncome,imposta:c.substituteTax};});
const scomp=pg=>pg.evaluate(()=>window.scomposizioneRimborsi(2026));

// 10.000 € di compenso incassato, piu' tre rimborsi in fattura:
//   600 € volo pagato con carta, ricevuta, mese incassato   -> analitico
//   189 € chilometrica, carta, ricevuta, mese incassato     -> forfettario
//   120 € cena pagata in CONTANTI, mese incassato           -> non regge
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'omni',client_id:'k2',name:'Omnichannel',active:true}];
  S.expense_categories=[
    {id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false},
    {id:'km',name:'Rimborso KM',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'km',default_unit_rate:0.45,is_mileage:true},
    {id:'cena',name:'Cena',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false}];
  S.timesheet_entries=[];
  S.travel_expenses=[
    {id:'r1',expense_date:'2026-03-10',client_id:'k2',project_id:'omni',expense_category_id:'volo',
     amount:600,reimbursement_type:'invoice',payment_method:'carta',receipt_kept:true},
    {id:'r2',expense_date:'2026-03-12',client_id:'k2',project_id:'omni',expense_category_id:'km',
     amount:189,quantity:420,unit_rate:0.45,reimbursement_type:'invoice',payment_method:'carta',receipt_kept:true},
    {id:'r3',expense_date:'2026-03-14',client_id:'k2',project_id:'omni',expense_category_id:'cena',
     amount:120,reimbursement_type:'invoice',payment_method:'contanti',receipt_kept:true}];
  S.billing_headers=[{id:'bh3',client_id:'k2',year:2026,month:3,status:'collected',
    invoice_number:'#3',invoice_date:'2026-03-31',collection_date:'2026-04-10',
    collected_amount:10909,invoice_total_amount:10909,total_amount:10909}];
  S.tax_settings=[{id:'t1',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,
    substitute_tax_rate:5,inps_gs_rate:26.07,stamp_duty_amount:2,annual_revenue_limit:85000}];
  S.app_settings=[];
`;
const apri=async(w=390)=>{
  const pg=await b.newPage({viewport:{width:w,height:2000},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};

console.log('\n=== IL DEFAULT NON MUOVE NIENTE ===');
{
  const pg=await apri();
  const c=await calc(pg);
  ok(Math.abs(c.revenue-10909)<0.01,
     'la base della stima resta l’incassato pieno: 10.909 €',String(c.revenue));
  ok(Math.abs(c.fuori-0)<0.01,'niente esce dal reddito, finché non lo si chiede',String(c.fuori));
  ok(Math.abs(c.forfait-10909*0.78)<0.02,'e il reddito forfettario è quello di sempre',String(c.forfait));
  await pg.close();
}

console.log('\n=== LA SCELTA C’È, E DICE COME STANNO LE COSE ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.go('taxSettings'));
  await pg.waitForTimeout(500);
  const t=await testo(pg);
  ok(/rimborsi spese e reddito/i.test(t),'in Configurazione fiscale c’è il blocco dei rimborsi');
  ok(/li conto come compensi/i.test(t),'con l’opzione prudente');
  ok(/regola 2025|fuori dal reddito/i.test(t),'e quella nuova');
  // L'onestà che serve: la norma non è pacifica sul forfettario
  ok(/dottrina è (però )?divisa|non richiama/i.test(t),
     'e l’app dice che sul forfettario la norma non è pacifica',t.slice(0,300));
  ok(/commercialista/i.test(t),'e che la decisione va presa col commercialista');
  // La scomposizione dei rimborsi dell'anno
  ok(/909,00/.test(t),'mostra il totale dei rimborsi in fattura: 909 €',t.slice(0,400));
  ok(/600,00/.test(t),'di cui 600 analitici');
  ok(/189,00/.test(t),'189 chilometrici');
  ok(/120,00/.test(t),'e 120 senza i requisiti');
  ok(/contanti/i.test(t),'dicendo perché quei 120 non reggono');
  await pg.close();
}

console.log('\n=== LA SCOMPOSIZIONE È GIUSTA ===');
{
  const pg=await apri();
  const sc=await scomp(pg);
  ok(Math.abs(sc.analitici-600)<0.01,'600 analitici: carta, ricevuta, mese incassato',String(sc.analitici));
  ok(Math.abs(sc.chilometrici-189)<0.01,'189 chilometrici: forfettari, compenso comunque',String(sc.chilometrici));
  ok(Math.abs(sc.senzaRequisiti-120)<0.01,'120 senza requisiti: pagati in contanti',String(sc.senzaRequisiti));
  ok(Math.abs(sc.totale-909)<0.01,'e il totale torna',String(sc.totale));
  await pg.close();
}

console.log('\n=== CAMBIANDO LA SCELTA, LA STIMA SI MUOVE DEL GIUSTO ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.cambiaRimborsiFuoriReddito('si'));
  await pg.waitForTimeout(800);
  const c=await calc(pg);
  // Escono SOLO i 600 analitici. Non i 189 chilometrici, non i 120 in contanti.
  ok(Math.abs(c.fuori-600)<0.01,'escono dal reddito solo i 600 € analitici',String(c.fuori));
  ok(Math.abs(c.revenue-(10909-600))<0.01,'la base scende a 10.309 €',String(c.revenue));
  ok(Math.abs(c.forfait-(10909-600)*0.78)<0.02,'e il reddito forfettario con lei',String(c.forfait));
  // E tornando indietro si torna come prima: la scelta è reversibile
  await pg.evaluate(()=>window.cambiaRimborsiFuoriReddito('no'));
  await pg.waitForTimeout(800);
  const c2=await calc(pg);
  ok(Math.abs(c2.revenue-10909)<0.01,'e la scelta è reversibile: si torna a 10.909',String(c2.revenue));
  await pg.close();
}

console.log('\n=== IL MESE NON INCASSATO NON VALE ===');
{
  // Un rimborso che non è ancora stato incassato non ha attraversato
  // il conto: non si può togliere da ricavi che non ci sono.
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.billing_headers[0].status='invoice_issued';
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.cambiaRimborsiFuoriReddito('si'));
  await pg.waitForTimeout(800);
  const c=await calc(pg);
  ok(Math.abs(c.fuori-0)<0.01,'fattura emessa ma non incassata: niente esce',String(c.fuori));
  const sc=await scomp(pg);
  ok(Math.abs(sc.analitici-0)<0.01,'e i 600 non contano come analitici',String(sc.analitici));
  ok(Math.abs(sc.senzaRequisiti-720)<0.01,'finiscono fra quelli senza requisiti',String(sc.senzaRequisiti));
  await pg.close();
}

console.log('\n=== SENZA METODO DI PAGAMENTO, NESSUNO SCONTO ===');
{
  // Chi non ha lanciato la migrazione della tracciabilita' non ha
  // payment_method: la regola non si applica, e va bene così. Lo
  // sconto si prende solo su quello che si e' documentato.
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.travel_expenses.forEach(e=>{delete e.payment_method;delete e.receipt_kept});
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.cambiaRimborsiFuoriReddito('si'));
  await pg.waitForTimeout(800);
  const c=await calc(pg);
  ok(Math.abs(c.fuori-0)<0.01,
     'senza il metodo di pagamento non esce niente: lo sconto si prende su quello che si è documentato',
     String(c.fuori));
  ok(Math.abs(c.revenue-10909)<0.01,'e la stima resta quella di prima',String(c.revenue));
  await pg.close();
}

console.log('\n=== LA TRASFERTA DICE LE DUE NATURE ===');
{
  const pg=await apri();
  await pg.evaluate(()=>{
    const S=window.__stores;
    S.trips=[{id:'tr1',client_id:'k2',project_id:'omni',destination_city:'Catania',
      start_date:'2026-03-10',end_date:'2026-03-14',status:'to_recharge'}];
    S.travel_expenses.forEach(e=>e.trip_id='tr1');
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.go('expenses'));
  await pg.waitForTimeout(350);
  await pg.evaluate(()=>{for(let i=0;i<60;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith('Marzo 2026'))break;
    window.changeMonth(-1)}});
  await pg.waitForTimeout(500);
  const t=await testo(pg);
  ok(/di cui/i.test(t),'la scheda della trasferta scompone il riaddebito',t.slice(0,300));
  ok(/720,00/.test(t),'720 € analitici (volo + cena)',t.slice(0,300));
  ok(/189,00/.test(t),'e 189 € chilometrici',t.slice(0,300));
  ok(/forfettari/i.test(t),'dicendo che quelli restano compenso');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== rimborsi e reddito: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
