// I rimborsi spese e il reddito: la regola, non piu' una scelta.
//
// Il 22/10/2026 il commercialista ha confermato che per il forfettario
// i rimborsi documentati non sono reddito. Due tipi, distinti dal
// documento:
//   fattura intestata a me       -> rimborso analitico
//   fattura intestata al cliente -> rimborso ex art. 15 (anticipazione)
// Non pagano imposta ne' INPS, non contano per gli 85.000 €, e non
// portano la rivalsa del 4%. Il rimborso km resta compenso. Una spesa
// che si puo' fatturare con il solo scontrino non vale, e nemmeno una
// pagata in contanti in Italia: restano tassate.
//
// Qui si verifica la natura di ogni spesa, i conti che ne seguono in
// ogni pagina, e che non ci sia piu' un interruttore da accendere.
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

// 10.000 € di compenso incassato a marzo, piu' cinque rimborsi in fattura:
//   600 volo, carta, fattura intestata a me           -> analitico
//   300 hotel, carta, fattura intestata al cliente    -> art. 15
//   189 chilometrica                                  -> tassato (km)
//   120 cena, carta, solo scontrino                   -> da sistemare
//    30 taxi, carta, solo scontrino (non fatturabile) -> analitico
// La fattura di marzo: 10.000 + 1.239 di rimborsi + 4% su 10.189
// (lavoro, km e cena) = 407,56 -> 11.646,56, incassata ad aprile.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'omni',client_id:'k2',name:'Omnichannel',active:true}];
  S.expense_categories=[
    {id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false,invoiceable:true},
    {id:'hotel',name:'Hotel',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false,invoiceable:true},
    {id:'km',name:'Rimborso KM',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'km',default_unit_rate:0.45,is_mileage:true,invoiceable:false},
    {id:'cena',name:'Cena',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false,invoiceable:true},
    {id:'taxi',name:'Taxi',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false,invoiceable:false}];
  S.timesheet_entries=[];
  S.monthly_compensations=[{id:'m3',year:2026,month:3,client_id:'k2',amount:10000}];
  const sp=(id,cat,amount,doc,pm,extra)=>Object.assign({id,expense_date:'2026-03-1'+id.slice(1),client_id:'k2',project_id:'omni',
    expense_category_id:cat,amount,reimbursement_type:'invoice',payment_method:pm,document_type:doc},extra||{});
  S.travel_expenses=[sp('r1','volo',600,'mia','carta'),sp('r2','hotel',300,'cliente','carta'),
    sp('r3','km',189,null,null,{quantity:420,unit_rate:0.45}),sp('r4','cena',120,'scontrino','carta'),sp('r5','taxi',30,'scontrino','carta')];
  S.billing_headers=[{id:'bh3',client_id:'k2',year:2026,month:3,status:'collected',
    invoice_number:'#3',invoice_date:'2026-03-31',collection_date:'2026-04-10',
    total_amount:11239,inps_recharge_amount:407.56,expenses_amount:1239,
    collected_amount:11646.56,invoice_total_amount:11646.56}];
  S.tax_settings=[{id:'t1',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,
    substitute_tax_rate:5,inps_gs_rate:26.07,inps_recharge_enabled:true,inps_recharge_rate:4,stamp_duty_amount:2,annual_revenue_limit:85000}];
  S.app_settings=[];
`;
const apri=async(w=390,semi=SEMI)=>{
  const pg=await b.newPage({viewport:{width:w,height:2000},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.errs=errs;
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(semi);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};
const alMese=async(pg,m)=>{await pg.evaluate(m=>{for(let i=0;i<60;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith(m))break;
    window.changeMonth(-1)}},m);await pg.waitForTimeout(400)};
const nature=pg=>pg.evaluate(()=>Object.fromEntries(window.__stores.travel_expenses.map(e=>[e.id,window.naturaRimborso(e)])));

console.log('\n=== OGNI SPESA HA LA SUA NATURA ===');
{
  const pg=await apri();
  const n=await nature(pg);
  ok(n.r1==='analitico','volo, fattura intestata a me, carta: analitico',n.r1);
  ok(n.r2==='art15','hotel, fattura intestata al cliente: ex art. 15',n.r2);
  ok(n.r3==='generico','rimborso km: forfettario, resta compenso',n.r3);
  ok(n.r4==='da_sistemare','cena con il solo scontrino: non vale, da sistemare',n.r4);
  ok(n.r5==='analitico','taxi con lo scontrino: la voce non si fattura, la ricevuta basta',n.r5);
  const sc=await pg.evaluate(()=>window.scomposizioneRimborsi(2026));
  ok(Math.abs(sc.nonTassati-930)<0.01,'non tassati 930: 600 + 300 + 30',String(sc.nonTassati));
  ok(Math.abs(sc.chilometrici-189)<0.01&&Math.abs(sc.daSistemare-120)<0.01,'tassati 189 di km e 120 da sistemare',`${sc.chilometrici} · ${sc.daSistemare}`);
  ok(Math.abs(sc.totale-1239)<0.01,'e il totale torna: 1.239',String(sc.totale));
  ok(pg.errs.length===0,'nessun errore JS',pg.errs.join(' | ')||'nessuno');
  await pg.close();
}

console.log('\n=== I CASI CHE NON REGGONO, E LE ECCEZIONI ===');
{
  const pg=await apri();
  const n=await pg.evaluate(()=>{
    const S=window.__stores;
    S.trips=[{id:'ch',client_id:'k2',destination_city:'Geneva',destination_country:'CH',start_date:'2026-03-14',end_date:'2026-03-14'},
             {id:'it',client_id:'k2',destination_city:'Catania',destination_country:'IT',start_date:'2026-03-10',end_date:'2026-03-10'}];
    const x=(o)=>Object.assign({id:'x',expense_date:'2026-03-14',client_id:'k2',expense_category_id:'cena',amount:50,reimbursement_type:'invoice'},o);
    return window.reload().then(()=>({
      contanti:window.naturaRimborso(x({document_type:'mia',payment_method:'contanti',trip_id:'it'})),
      estero:window.naturaRimborso(x({document_type:'mia',payment_method:'contanti',trip_id:'ch'})),
      senzaDoc:window.naturaRimborso(x({payment_method:'carta'})),
      senzaMetodo:window.naturaRimborso(x({document_type:'mia'})),
      art15Contanti:window.naturaRimborso(x({document_type:'cliente',payment_method:'contanti'})),
      del2024:window.naturaRimborso(x({expense_date:'2024-03-14',document_type:'mia',payment_method:'carta'})),
      mio:window.naturaRimborso(x({reimbursement_type:'own',document_type:'mia',payment_method:'carta'}))}));
  });
  ok(n.contanti==='da_sistemare','fattura a me ma contanti, in Italia: da sistemare',n.contanti);
  ok(n.estero==='analitico','la stessa a Ginevra: all’estero il mezzo di pagamento non vincola',n.estero);
  ok(n.senzaDoc==='da_sistemare','senza dire a chi è intestata: da sistemare',n.senzaDoc);
  ok(n.senzaMetodo==='da_sistemare','senza dire come è pagata: da sistemare',n.senzaMetodo);
  ok(n.art15Contanti==='art15','l’anticipazione per il cliente non dipende dal mezzo: ex art. 15',n.art15Contanti);
  ok(n.del2024==='generico','nel 2024 la regola non c’era: tassato',n.del2024);
  ok(n.mio==='own','una spesa a mio carico non è un rimborso',n.mio);
  await pg.close();
}

console.log('\n=== LA TASSAZIONE TOGLIE I NON TASSATI DALL’INCASSATO ===');
{
  const pg=await apri();
  const c=await pg.evaluate(()=>{const c=window.annualTaxCalc(2026);return {revenue:c.revenue,fuori:c.rimborsiFuori,forfait:c.forfaitIncome}});
  ok(Math.abs(c.fuori-930)<0.01,'dall’incassato escono i 930 non tassati',String(c.fuori));
  ok(Math.abs(c.revenue-(11646.56-930))<0.01,'la base è 10.716,56: lavoro, km, cena e la loro rivalsa',String(c.revenue));
  ok(Math.abs(c.forfait-(11646.56-930)*0.78)<0.02,'e il reddito forfettario con lei',String(c.forfait));
  // Prospetto A delle Tasse future: la stessa base
  const a=await pg.evaluate(()=>window.taxDueFor(2026,'cassa').base);
  ok(Math.abs(a-(11646.56-930))<0.01,'e Tasse future, prospetto A, parte dalla stessa base',String(a));
  // Prospetto B: una fattura emessa e non incassata toglie anche lei i suoi non tassati
  await pg.evaluate(()=>{const h=window.__stores.billing_headers[0];h.status='invoice_issued';return window.reload()});
  await pg.waitForTimeout(600);
  const bb=await pg.evaluate(()=>window.taxDueFor(2026,'previsione').parts.find(p=>p[0]==='Da incassare')[1]);
  ok(Math.abs(bb-(11646.56-930))<0.01,'nel prospetto B «da incassare» è senza i 930 non tassati',String(bb));
  await pg.evaluate(()=>{const h=window.__stores.billing_headers[0];h.status='collected';return window.reload()});
  await pg.waitForTimeout(600);
  // Nessun interruttore: la regola vale da sola
  await pg.evaluate(()=>window.go('taxSettings'));
  await pg.waitForTimeout(500);
  const t=await testo(pg);
  ok(/non sono tassati/i.test(t),'Configurazione fiscale spiega la regola',t.slice(0,200));
  ok(!/li conto come compensi|dottrina/i.test(t),'senza più la scelta né il dubbio sulla dottrina');
  ok(/Rimborso spese analitico/.test(t)&&/Rimborso ex art\. 15/.test(t),'con i nomi delle due voci di Fiscozen');
  ok(/930,00/.test(t)&&/189,00/.test(t)&&/120,00/.test(t),'e la scomposizione dell’anno: 930 non tassati, 189 km, 120 da sistemare');
  await pg.close();
}

console.log('\n=== IL RIMBORSO SEGUE L’ANNO DELL’INCASSO ===');
{
  // Trasferta di dicembre 2026, fattura incassata a gennaio 2027: i 600
  // escono dal 2027, che e' l'anno in cui sono entrati sul conto.
  const semi=SEMI+`
    S.monthly_compensations=[{id:'m12',year:2026,month:12,client_id:'k2',amount:1000}];
    S.travel_expenses=[{id:'d1',expense_date:'2026-12-15',client_id:'k2',expense_category_id:'volo',amount:600,
      reimbursement_type:'invoice',payment_method:'carta',document_type:'mia'}];
    S.billing_headers=[{id:'b12',client_id:'k2',year:2026,month:12,status:'collected',collection_date:'2027-01-12',
      total_amount:1600,inps_recharge_amount:40,collected_amount:1640,invoice_total_amount:1640}];
    S.tax_settings.push({id:'t2',fiscal_year:2027,regime:'forfettario',profitability_coefficient:78,substitute_tax_rate:5,inps_gs_rate:26.07,stamp_duty_amount:2});`;
  const pg=await apri(390,semi);
  const r=await pg.evaluate(()=>({a26:window.annualTaxCalc(2026),a27:window.annualTaxCalc(2027)}));
  ok(Math.abs(r.a26.revenue-0)<0.01&&Math.abs(r.a26.rimborsiFuori-0)<0.01,'nel 2026 non è entrato niente, e niente si toglie',`${r.a26.revenue} · ${r.a26.rimborsiFuori}`);
  ok(Math.abs(r.a27.rimborsiFuori-600)<0.01,'nel 2027 escono i 600',String(r.a27.rimborsiFuori));
  ok(Math.abs(r.a27.revenue-1040)<0.01,'e la base 2027 è 1.040: lavoro e rivalsa',String(r.a27.revenue));
  await pg.close();
}

console.log('\n=== LA RIVALSA DEL 4% NON VA SUI RIMBORSI NON TASSATI ===');
{
  // Ottobre, niente fattura: 1.000 di lavoro, 600 di volo con fattura a
  // me, 100 di km. Rivalsa 4% su 1.100 = 44, non su 1.700.
  const semi=SEMI+`
    S.monthly_compensations=[{id:'m10',year:2026,month:10,client_id:'k2',amount:1000}];
    S.travel_expenses=[
      {id:'o1',expense_date:'2026-10-05',client_id:'k2',expense_category_id:'volo',amount:600,reimbursement_type:'invoice',payment_method:'carta',document_type:'mia'},
      {id:'o2',expense_date:'2026-10-06',client_id:'k2',expense_category_id:'km',amount:100,reimbursement_type:'invoice'}];
    S.billing_headers=[];`;
  const pg=await apri(1280,semi);
  await pg.evaluate(()=>window.go('billing'));await pg.waitForTimeout(300);
  await alMese(pg,'Ottobre 2026');
  const g=await pg.evaluate(()=>{const g=window.billingGroupsByClient().find(x=>x.client_id==='k2');return g&&g.calc});
  ok(g&&Math.abs(g.inpsAmount-44)<0.01,'in fattura la rivalsa è 44: il 4% di lavoro e km',String(g&&g.inpsAmount));
  ok(g&&Math.abs(g.total-1744)<0.01,'il totale è 1.744: 1.700 + 44',String(g&&g.total));
  const t=await testo(pg);
  ok(/Spese da riaddebitare/.test(t),'la pagina del mese dice quanto riaddebitare',t.slice(0,300));
  ok(/Rimborso spese analitico/i.test(t)&&/600,00/.test(t),'con il nome della voce Fiscozen e l’importo: 600',t.slice(0,500));
  ok(/Tassati \(km e da sistemare\)/i.test(t)&&/100,00/.test(t),'e a parte i 100 tassati');
  ok(/Scarica le ricevute del mese/.test(t),'e il link per scaricare le ricevute');
  // Il dettaglio del cliente: la riga del volo dice di non spuntare il 4%
  await pg.evaluate(()=>window.openBillingClient('k2'));await pg.waitForTimeout(400);
  const d=await testo(pg);
  ok(/Su Fiscozen: Rimborso spese analitico/.test(d),'nel dettaglio la riga del volo dice la voce Fiscozen',d.slice(0,400));
  ok(/non spuntare «Applica contributo GS INPS 4,00%»/.test(d),'e di non spuntare la rivalsa su quella riga');
  // Bilancio: da fatturare 1.000×1,04 + 100×1,04 + 600 = 1.744
  const cd=await pg.evaluate(()=>window.ricaviCompetenza?window.ricaviCompetenza(2026,false):null);
  const mm=await pg.evaluate(()=>window.margineMesi(2026)[9]);
  ok(Math.abs(mm.daFatturare-1744)<0.01,'la dashboard aspetta da fatturare 1.744 a ottobre',String(mm.daFatturare));
  ok(cd&&Math.abs(cd.daFatturare-1744)<0.01,'e il Bilancio aspetta da fatturare gli stessi 1.744',String(cd&&cd.daFatturare));
  ok(cd&&Math.abs(cd.rivalsa-44)<0.01,'con la stessa rivalsa di 44',String(cd&&cd.rivalsa));
  // Il limite degli 85.000: il volo non conta
  const at=await pg.evaluate(()=>window.annualTotals(2026));
  ok(Math.abs(at.imponibile-1100)<0.01,'per il limite degli 85.000 contano 1.100, non 1.700',String(at.imponibile));
  ok(pg.errs.length===0,'nessun errore JS',pg.errs.join(' | ')||'nessuno');
  await pg.close();
}

console.log('\n=== LE SPESE RIMASTE FUORI DALLA FATTURA TORNANO ===');
{
  // Settembre fatturato con 200 di spese; poi se ne aggiunge un'altra da
  // 80. Quella non e' in nessuna fattura e la pagina di ottobre la ricorda.
  const semi=SEMI+`
    S.travel_expenses=[
      {id:'s1',expense_date:'2026-09-05',client_id:'k2',expense_category_id:'volo',amount:200,reimbursement_type:'invoice',payment_method:'carta',document_type:'mia'},
      {id:'s2',expense_date:'2026-09-20',client_id:'k2',expense_category_id:'taxi',amount:80,reimbursement_type:'invoice',payment_method:'carta',document_type:'scontrino'}];
    S.billing_headers=[{id:'h9',client_id:'k2',year:2026,month:9,status:'invoice_issued',total_amount:1200,expenses_amount:200,invoice_total_amount:1240}];`;
  const pg=await apri(1280,semi);
  await pg.evaluate(()=>window.go('billing'));await pg.waitForTimeout(300);
  await alMese(pg,'Ottobre 2026');
  const f=await pg.evaluate(()=>window.speseRimasteFuori());
  ok(f.length===1&&Math.abs(f[0].totale-80)<0.01,'una spesa rimasta fuori: gli 80 aggiunti dopo',JSON.stringify(f));
  const t=await testo(pg);
  ok(/Spese di mesi passati non ancora in fattura/.test(t)&&/Settembre 2026/.test(t),'la pagina di ottobre la ricorda, con il mese',t.slice(0,400));
  await pg.close();
}

console.log('\n=== LA TRASFERTA DICE COSA È TASSATO ===');
{
  const pg=await apri();
  await pg.evaluate(()=>{
    const S=window.__stores;
    S.trips=[{id:'tr1',client_id:'k2',project_id:'omni',destination_city:'Catania',
      start_date:'2026-03-10',end_date:'2026-03-15',status:'to_recharge'}];
    S.travel_expenses.forEach(e=>e.trip_id='tr1');
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.go('expenses'));
  await pg.waitForTimeout(350);
  await alMese(pg,'Marzo 2026');
  const t=await testo(pg);
  ok(/di cui/i.test(t)&&/930,00/.test(t)&&/309,00/.test(t),'930 non tassati e 309 tassati (km e cena)',t.slice(0,400));
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== rimborsi e reddito: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
