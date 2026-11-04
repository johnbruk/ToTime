// Le spese si fatturano SEMPRE a parte (Giovanni, 04/11/2026): per ogni
// cliente e mese ci sono due fatture, quella del lavoro e quella delle
// spese. La rivalsa INPS la sceglie lui e solo sul lavoro: la fattura
// delle spese non la porta mai, nemmeno sui km. Il bollo va su ciascuna
// fattura che supera 77,47 €.
//
// I numeri, fatti a mano (ottobre 2026, cliente K2, rivalsa 4%):
//   lavoro  4 giorni × 500 = 2.000 + rivalsa 80 = 2.080 · bollo sì
//   spese   volo 300 + km 50 = 350, senza rivalsa · bollo sì
//   con solo i km (50) la fattura delle spese sta sotto i 77,47: niente bollo
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
const XML=fs.readFileSync(path.join(ROOT,'tests/ui/fixtures/fattura-esempio.xml'),'utf8');

const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2',vat_number:'22222222222',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'p1',client_id:'k2',name:'Omnichannel',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.user_profiles=[{id:'u1',user_id:'u1',first_name:'G',last_name:'B',vat_number:'11111111111'}];
  S.expense_categories=[
    {id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false},
    {id:'km',name:'Rimborso KM',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'km',default_unit_rate:0.5,is_mileage:true}];
  S.timesheet_entries=['06','07','08','09'].map((d,i)=>({id:'t'+i,entry_date:'2026-10-'+d,client_id:'k2',project_id:'p1',
    activity_id:'a1',hours:8,daily_rate_snapshot:500,standard_hours_snapshot:8}));
  S.travel_expenses=[
    {id:'s1',expense_date:'2026-10-06',client_id:'k2',project_id:'p1',expense_category_id:'volo',amount:300,
     reimbursement_type:'invoice',payment_method:'carta',document_type:'mia',receipt_kept:true,description:'Milano → Roma'},
    {id:'s2',expense_date:'2026-10-07',client_id:'k2',project_id:'p1',expense_category_id:'km',amount:50,quantity:100,unit_rate:0.5,
     reimbursement_type:'invoice',from_place:'Roma',to_place:'Latina',receipt_kept:true}];
  S.monthly_compensations=[];S.manual_entries=[];S.trips=[];S.vehicles=[];S.billing_headers=[];
  S.tax_settings=[{id:'t1',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,
    substitute_tax_rate:5,inps_gs_rate:26.07,inps_recharge_rate:4,inps_recharge_enabled:true,
    stamp_duty_mode:'mine',stamp_duty_amount:2}];
`;
const apri=async(extra='')=>{
  const pg=await b.newPage({viewport:{width:1280,height:2000}});
  pg.errs=[];pg.on('pageerror',e=>pg.errs.push(e.message));
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.go('billing'));
  await pg.waitForTimeout(350);
  await pg.evaluate(()=>{for(let i=0;i<48;i++){
    const m=document.querySelector('.month strong')?.textContent||'';
    if(m.startsWith('Ottobre 2026'))break;
    window.changeMonth(m.endsWith('2027')||/Novembre 2026|Dicembre 2026/.test(m)?-1:1)}});
  await pg.waitForTimeout(450);
  return pg;
};
const gruppi=pg=>pg.evaluate(()=>window.billingGroupsByClient().filter(g=>g.client_id==='k2')
  .map(g=>({kind:g.kind,base:g.calc.taxableBase,inps:g.calc.inpsAmount,total:g.calc.total,services:g.calc.services,expenses:g.calc.expenses})));

console.log('\n=== DUE FATTURE: IL LAVORO E LE SPESE ===');
{
  const pg=await apri();
  const g=await gruppi(pg);
  const w=g.find(x=>x.kind==='work'),e=g.find(x=>x.kind==='expenses');
  ok(g.length===2&&g[0].kind==='work','due fatture per K2 a ottobre, prima il lavoro',JSON.stringify(g.map(x=>x.kind)));
  ok(w&&Math.abs(w.services-2000)<0.01&&Math.abs(w.expenses)<0.01,'nel lavoro solo i 2.000 di giornate',JSON.stringify(w));
  ok(w&&Math.abs(w.inps-80)<0.01&&Math.abs(w.total-2080)<0.01,'con la rivalsa del 4%: 2.080',JSON.stringify(w));
  ok(e&&Math.abs(e.expenses-350)<0.01&&Math.abs(e.services)<0.01,'nelle spese volo e km: 350',JSON.stringify(e));
  ok(e&&Math.abs(e.inps)<0.01&&Math.abs(e.total-350)<0.01,'senza rivalsa, nemmeno sui km: 350',JSON.stringify(e));
  const t=await testo(pg);
  ok(/Lavoro/.test(t)&&/Spese/.test(t),'l’elenco del mese le mostra tutte e due, con l’etichetta');
  ok(pg.errs.length===0,'nessun errore JS',pg.errs.join(' | ')||'nessuno');
  await pg.close();
}

console.log('\n=== LA FATTURA DELLE SPESE NON HA LA RIVALSA ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.openBillingClient('k2','expenses'));await pg.waitForTimeout(500);
  const t=await testo(pg);
  ok(/Fattura delle spese/.test(t),'il dettaglio dice che è la fattura delle spese',t.slice(0,160));
  ok(/senza rivalsa/.test(t),'e che è senza rivalsa');
  ok(!/Consulenza/.test(t),'e il lavoro non c’è');
  const sceltaRivalsa=await pg.evaluate(()=>{const x=document.querySelector('#app [name=inps_recharge_enabled]');return x?x.type:'nessuna'});
  ok(sceltaRivalsa==='hidden'||sceltaRivalsa==='nessuna','e non si può accendere la rivalsa',sceltaRivalsa);
  ok(/fattura del lavoro/i.test(t),'c’è il rimando alla fattura del lavoro');
  // si registra come emessa: una scheda sua, distinta da quella del lavoro
  await pg.evaluate(()=>{const s=document.querySelector('#app form [name=status]');s.value='invoice_issued';
    document.querySelector('#app form').requestSubmit()});
  await pg.waitForTimeout(900);
  const hs=await pg.evaluate(()=>window.__stores.billing_headers.map(h=>({...h})));
  ok(hs.length===1&&hs[0].invoice_kind==='expenses','si salva una scheda «spese»',JSON.stringify(hs.map(h=>h.invoice_kind)));
  ok(hs[0]&&Number(hs[0].inps_recharge_amount||0)===0&&Math.abs(Number(hs[0].invoice_total_amount)-350)<0.01,
     'senza rivalsa e con 350 di totale',hs[0]&&`${hs[0].inps_recharge_amount} · ${hs[0].invoice_total_amount}`);
  // la fattura del lavoro resta da fare, coi suoi numeri
  await pg.evaluate(()=>window.go('billing'));await pg.waitForTimeout(400);
  const g=await gruppi(pg);
  const w=g.find(x=>x.kind==='work');
  ok(w&&Math.abs(w.total-2080)<0.01,'la fattura del lavoro non si è mossa: 2.080',JSON.stringify(w));
  ok(pg.errs.length===0,'nessun errore JS',pg.errs.join(' | ')||'nessuno');
  await pg.close();
}

console.log('\n=== UN BOLLO PER CIASCUNA FATTURA ===');
{
  const pg=await apri();
  const due=await pg.evaluate(()=>window.bolliDaEmettere(2026));
  ok(due.n===2&&due.perTrim[3]===4,'lavoro 2.080 e spese 350: due bolli nel quarto trimestre',JSON.stringify(due));
  await pg.close();
  const pg2=await apri(`S.travel_expenses=S.travel_expenses.filter(e=>e.id==='s2');`);
  const uno=await pg2.evaluate(()=>window.bolliDaEmettere(2026));
  ok(uno.n===1,'con solo 50 di km la fattura delle spese sta sotto i 77,47: un bollo solo',JSON.stringify(uno));
  await pg2.close();
}

console.log('\n=== I MESI FATTURATI PRIMA, CON LE SPESE DENTRO ===');
{
  // Prima del 04/11/2026 le spese andavano nella fattura del lavoro:
  // quei mesi restano chiusi come sono, senza una fattura delle spese
  // fantasma da emettere.
  const pg=await apri(`S.billing_headers=[{id:'h10',client_id:'k2',year:2026,month:10,status:'invoice_issued',
    services_amount:2000,expenses_amount:350,inps_recharge_enabled:true,inps_recharge_rate:4,inps_recharge_amount:94,
    total_amount:2350,invoice_total_amount:2446,invoice_date:'2026-10-31'}];`);
  const g=await gruppi(pg);
  ok(!g.some(x=>x.kind==='expenses'),'nessuna fattura delle spese da fare: erano già in quella del lavoro',JSON.stringify(g.map(x=>x.kind)));
  const f=await pg.evaluate(()=>window.speseFatturate?window.speseFatturate('k2',2026,10):null);
  ok(f===true,'e le spese di ottobre risultano fatturate',String(f));
  const bolli=await pg.evaluate(()=>window.bolliDaEmettere(2026));
  ok(bolli.n===0,'e non chiedono un altro bollo',JSON.stringify(bolli));
  await pg.close();
}

console.log('\n=== LA FATTURA DELLE SPESE CARICATA SI RICONOSCE ===');
{
  const pg=await apri();
  const spese=XML
    .replace('Consulenza - Febbraio 2026 | Giorni: 1,0','Rimborso spese di trasferta · Volo · 06/10/2026 · Milano → Roma · 300,00 €')
    .replace('Consulenza - Marzo 2026 | Giorni: 5,5','Rimborso spese di trasferta · Rimborso KM · 07/10/2026 · Roma → Latina · 100 km · 50,00 €');
  const r=await pg.evaluate(x=>{const c=window.confrontaFattura(window.leggiFatturaXML(x));
    return {tipo:c.tipo,esiti:(c.esiti||[]).map(e=>e.titolo)}},spese);
  ok(r.tipo==='expenses','tutte righe di spesa: è la fattura delle spese',JSON.stringify(r));
  ok(r.esiti.some(t=>/Rivalsa sulla fattura delle spese/.test(t)),'e la rivalsa che porta si segnala',r.esiti.join(' | '));
  const lav=await pg.evaluate(x=>window.confrontaFattura(window.leggiFatturaXML(x)).tipo,XML);
  ok(lav==='work','una fattura di giornate resta quella del lavoro',String(lav));
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== fattura delle spese: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
