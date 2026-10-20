// Le tasse del forfettario, per cassa e coi versamenti al posto giusto.
//
// Quattro cose non tornavano:
// - l'incasso stava nell'anno del LAVORO: un dicembre pagato a gennaio
//   finiva nelle tasse dell'anno prima;
// - i contributi INPS si deducevano nell'anno di riferimento, non in
//   quello in cui si versano: segnando pagato a giugno il saldo
//   dell'anno prima, si abbassava l'imposta dell'anno sbagliato;
// - il saldo dell'imposta era l'imposta intera, con gli acconti gia'
//   versati contati due volte;
// - la «Previsione imposte e contributi» dimenticava la rivalsa INPS,
//   che e' compenso, e il primo anno deduceva contributi non ancora
//   versati.
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
const vicino=(a,b)=>Math.abs(a-b)<0.01;

const pg=await b.newPage({viewport:{width:1280,height:1400}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
const carica=async(headers,payments=[])=>{
  await pg.evaluate(([h,p])=>{const S=window.__stores;S.billing_headers=h;S.tax_payments=p;
    S.tax_settings=[{id:'t1',fiscal_year:2026,regime:'forfettario',profitability_coefficient:67,
      substitute_tax_rate:5,inps_gs_rate:26.07,inps_recharge_enabled:true,inps_recharge_rate:4,stamp_duty_mode:'mine'}];
  },[headers,payments]);
  await pg.evaluate(()=>window.reload());await pg.waitForTimeout(300);
};
const scheda=(m,importo,stato,incasso,anno=2026)=>({id:'bh'+anno+m,client_id:'c1',year:anno,month:m,status:stato,
  total_amount:importo/1.04,invoice_total_amount:importo,collected_amount:stato==='collected'?importo:null,
  collection_date:incasso||null,stamp_duty_amount:0});

console.log('\n=== A. Conta la data d\'incasso, non il mese del lavoro ===');
await carica([scheda(11,1040,'collected','2026-12-10'),scheda(12,2080,'collected','2027-01-15')]);
let c=await pg.evaluate(()=>({a26:window.annualTaxCalc(2026).revenue,a27:window.annualTaxCalc(2027).revenue,
  f26:window.taxDueFor(2026,'cassa').base,f27:window.taxDueFor(2027,'cassa').base}));
ok(vicino(c.a26,1040),'Fiscalità 2026: solo il novembre incassato a dicembre',c.a26);
ok(vicino(c.a27,2080),'Fiscalità 2027: il dicembre incassato a gennaio',c.a27);
ok(vicino(c.f26,1040)&&vicino(c.f27,2080),'Tasse future dicono lo stesso',c.f26+' / '+c.f27);
await carica([scheda(5,1040,'collected',null)]);
c=await pg.evaluate(()=>window.annualTaxCalc(2026).revenue);
ok(vicino(c,1040),'Senza data d\'incasso vale l\'anno della scheda',c);

console.log('\n=== B. I contributi si deducono nell\'anno in cui si versano ===');
const ricavi=[scheda(3,10400,'collected','2026-04-10')];
await carica(ricavi,[{id:'p1',fiscal_year:2026,payment_type:'inps',payment_date:'2027-06-30',amount:1816.56,status:'paid',notes:'saldo'}]);
c=await pg.evaluate(()=>({t26:window.annualTaxCalc(2026),t27:window.annualTaxCalc(2027),d26:window.taxDueFor(2026,'cassa')}));
ok(vicino(c.t26.paidContrib,0),'Il saldo 2026 versato nel 2027 non tocca il 2026',c.t26.paidContrib);
ok(vicino(c.t27.paidContrib,1816.56),'…e si deduce nel 2027',c.t27.paidContrib);
ok(vicino(c.d26.imposta,10400*0.67*0.05),'Imposta 2026 senza deduzioni il primo anno',c.d26.imposta);
const sal=await pg.evaluate(()=>window.taxScheduleItems(2026,'cassa').items.find(i=>i.kind==='inps'&&i.ref===2026));
ok(sal&&sal.coperta,'Il saldo INPS registrato a mano risulta pagato, e resta in elenco',JSON.stringify(sal));

console.log('\n=== C. Il saldo dell\'imposta toglie gli acconti versati ===');
await carica(ricavi,[{id:'p2',fiscal_year:2026,payment_type:'imposta_sostitutiva',payment_date:'2026-06-30',amount:100,status:'paid'},
  {id:'p3',fiscal_year:2026,payment_type:'imposta_sostitutiva',payment_date:'2026-11-30',amount:150,status:'paid'}]);
c=await pg.evaluate(()=>{const s=window.taxScheduleItems(2026,'cassa');return {imp:s.due.imposta,
  saldo:s.items.find(i=>i.kind==='imposta'&&/Saldo/.test(i.label))?.amount,
  acc:s.items.filter(i=>i.kind==='imposta'&&/acconto/i.test(i.label)).reduce((t,i)=>t+i.amount,0)}});
ok(vicino(c.saldo,c.imp-250),'Saldo = imposta − 250 di acconti',c.saldo+' su '+c.imp);
ok(vicino(c.acc,c.imp),'Gli acconti dell\'anno dopo restano sul 100% dell\'imposta',c.acc);

console.log('\n=== D. La previsione conta la rivalsa e non deduce contributi mai versati ===');
await pg.evaluate(()=>{const S=window.__stores;S.billing_headers=[];S.tax_payments=[];
  S.manual_entries=[{id:'m1',client_id:'c1',entry_date:'2026-03-15',amount:10000}];});
await pg.evaluate(()=>window.reload());await pg.waitForTimeout(300);
c=await pg.evaluate(()=>window.forecastCalc(2026));
ok(c.fatturabile>=10000&&vicino(c.rivalsa,(c.fatturabile+c.pianificato)*0.04),'Rivalsa 4% sulla base',c.rivalsa);
ok(vicino(c.baseImponibile,c.fatturabile+c.pianificato+c.rivalsa),'Base imponibile con la rivalsa',c.baseImponibile);
ok(vicino(c.contribDedotti,0)&&vicino(c.imposta,c.forfait*0.05),'Imposta senza dedurre l\'INPS non ancora versato',c.imposta);
await pg.evaluate(()=>window.go('tax'));await pg.waitForTimeout(400);
const t=await pg.evaluate(()=>document.getElementById('app').innerText);
ok(/Rivalsa INPS 4%/.test(t),'La rivalsa si vede nella previsione');

console.log('\n=== E. Il simulatore dell\'anno dopo ===');
await carica([scheda(3,20800,'collected','2026-04-10')]);
let sim=await pg.evaluate(()=>{const b=window.taxScheduleItems(2026,'previsione');const s=window.taxScheduleItems(2026,'simulato');return {b:b.items,s}});
const sommaB=(k,ref)=>sim.b.filter(i=>i.kind===k&&i.ref===ref).reduce((t,i)=>t+i.amount,0);
ok(sim.s.items.every(i=>i.date.startsWith('2028-')),'Le scadenze simulate sono tutte nel 2028');
ok(vicino(sim.s.due.paidContrib,sommaB('inps',2026)+sommaB('inps',2027)),'Si deduce l\'INPS che si versa nel 2027',sim.s.due.paidContrib);
const v=sim.s.due.base;
ok(vicino(sim.s.due.imposta,Math.max(0,v*0.67-sim.s.due.paidContrib)*0.05),'Imposta 2027 al netto dei contributi',sim.s.due.imposta);
const saldoImp=sim.s.items.find(i=>i.kind==='imposta'&&/Saldo/.test(i.label));
ok(!saldoImp||vicino(saldoImp.amount,Math.max(0,sim.s.due.imposta-sommaB('imposta',2027))),'Il saldo imposta toglie gli acconti 2027',saldoImp&&saldoImp.amount);
await pg.evaluate(()=>window.cambiaRicaviSimulati(2026,'50000'));await pg.waitForTimeout(400);
sim=await pg.evaluate(()=>window.taxScheduleItems(2026,'simulato'));
ok(sim.simulato.scelto&&vicino(sim.due.base,50000),'La cifra scritta a mano comanda',sim.due.base);
ok(vicino(sim.due.inps,50000*0.67*0.2607),'INPS 2027 sulla cifra scritta',sim.due.inps);
await pg.evaluate(()=>window.go('tasseFuture'));await pg.waitForTimeout(500);
const tt=await pg.evaluate(()=>document.getElementById('app').innerText);
ok(/Simulatore · tasse 2027, da pagare nel 2028/.test(tt),'Il simulatore si vede in Tasse future');
// Acconti 2027 piu' alti del dovuto: non un saldo zero ma un credito.
await pg.evaluate(()=>window.cambiaRicaviSimulati(2026,'5000'));await pg.waitForTimeout(400);
sim=await pg.evaluate(()=>window.taxScheduleItems(2026,'simulato'));
const cred=sim.items.filter(i=>i.kind==='credito');
ok(cred.length&&cred.every(i=>i.amount<0&&i.date==='2028-06-30'),'Gli acconti versati in più diventano un credito a giugno 2028',JSON.stringify(cred.map(i=>i.amount)));
ok(vicino(sim.total,sim.items.reduce((t,i)=>t+i.amount,0)),'Il totale lo scala');
await pg.evaluate(()=>window.cambiaRicaviSimulati(2026,''));await pg.waitForTimeout(400);
sim=await pg.evaluate(()=>window.taxScheduleItems(2026,'simulato'));
ok(!sim.simulato.scelto,'Svuotando il campo torna la proposta dell\'app');

ok(!errs.length,'Nessun errore in pagina',errs.join(' | '));
await b.close();srv.close();
console.log(`\n${pass} OK, ${fail} KO`);
process.exit(fail?1:0);
