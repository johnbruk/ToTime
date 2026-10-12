// «Escluso» vuol dire: questo mese, a questo cliente, non si fattura.
//
// Prima era solo un'etichetta. Il Bilancio contava come ricavo il
// lavoro di un mese escluso, «Da fatturare» lo dava come residuo da
// mettere in fattura, il totale del mese lo sommava, e le spese «in
// fattura» di quel mese risultavano rimborsate quando in fattura non ci
// vanno.
//
// Adesso il lavoro resta CONSUNTIVATO — è stato fatto — ma non è
// fatturabile né ricavo; e le sue spese «in fattura» sono spese a
// proprio carico.
//
// Settembre 2026: Solution, 5 giorni a 460 = 2.300 e 100 di km, mese
// ESCLUSO; K2, 2 giorni a 400 = 800, da fatturare; 20 di spese mie.
//   consuntivato          3.100 (2.300 + 800): il lavoro fatto
//   fatturabile             800: solo K2
//   spese a mio carico      120: 20 mie + i 100 di km che non rientrano
//   margine operativo       680: 800 − 120
//   da fatturare nel mese   832: 800 + 4% di rivalsa, Solution fuori
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
const eur=t=>Number(String(t||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'));
const quasi=(a,b)=>Math.abs(a-b)<0.005;

const SEMI=(stato='excluded')=>`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Solution',daily_rate:460,standard_hours:8,compensation_type:'daily_rate_8h',active:true},
             {id:'k2',name:'K2',daily_rate:400,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.expense_categories=[{id:'km',name:'Rimborso km',active:true,reimbursable:true,is_mileage:true},
                        {id:'cs',name:'Cancelleria',active:true,reimbursable:false}];
  S.tax_settings=[{id:'t26',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,substitute_tax_rate:5,
    inps_gs_rate:26.07,inps_recharge_enabled:true,inps_recharge_rate:4,stamp_duty_mode:'none',stamp_duty_amount:2}];
  S.app_settings=[{id:'d',setting_key:'dash_full',setting_value:'1'},{id:'b',setting_key:'bal_full',setting_value:'1'}];
  const g=(id,d,c)=>({id,entry_date:d,client_id:c,project_id:null,activity_id:'a1',hours:8,
    daily_rate_snapshot:c==='sol'?460:400,standard_hours_snapshot:8});
  S.timesheet_entries=[g('s1','2026-09-01','sol'),g('s2','2026-09-02','sol'),g('s3','2026-09-03','sol'),g('s4','2026-09-04','sol'),g('s5','2026-09-07','sol'),
    g('k1','2026-09-08','k2'),g('k2','2026-09-09','k2')];
  S.travel_expenses=[
    {id:'r1',expense_date:'2026-09-02',client_id:'sol',expense_category_id:'km',amount:100,reimbursement_type:'invoice',reimbursable:true},
    {id:'c1',expense_date:'2026-09-10',client_id:null,expense_category_id:'cs',amount:20,reimbursement_type:'own',reimbursable:false}];
  S.billing_headers=${stato?`[{id:'hs',client_id:'sol',year:2026,month:9,status:'${stato}'}]`:'[]'};
`;
const apri=async(semi,dove)=>{
  const pg=await b.newPage({viewport:{width:1280,height:1400}});
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.errs=errs;
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(semi);await pg.evaluate(()=>window.reload());await pg.waitForTimeout(600);
  // l'anno e il mese sono quelli che l'app ha davanti
  await pg.evaluate(()=>window.openInvoiceDetail('k2',2026,9));await pg.waitForTimeout(300);
  if(dove){await pg.evaluate(v=>window.go(v),dove);await pg.waitForTimeout(500);}
  return pg;
};
const testo=pg=>pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));
const valore=(pg,titolo)=>pg.evaluate(t=>{const r=[...document.querySelectorAll('#app .row')].find(r=>(r.querySelector('.title')?.textContent||'').trim()===t);
  return r?{v:r.querySelector('.value')?.textContent.trim(),d:r.querySelector('.desc')?.textContent.trim()}:null},titolo);
const importo=(pg,titolo)=>pg.evaluate(t=>{const c=[...document.querySelectorAll('#app .card')].find(c=>c.querySelector('b')?.textContent.startsWith(t));
  return c?c.querySelector('.amount')?.textContent.trim():null},titolo);

console.log('\n=== IL LAVORO RESTA CONSUNTIVATO, MA NON È FATTURABILE ===');
{
  const pg=await apri(SEMI());
  const t=await pg.evaluate(()=>window.annualTotals(2026));
  ok(quasi(t.consuntivato,3100),'il consuntivato è il lavoro fatto: 2.300 + 800 = 3.100',String(t.consuntivato));
  ok(quasi(t.compensiEsclusi,2300),'di cui 2.300 di un mese escluso',String(t.compensiEsclusi));
  ok(quasi(t.fatturabile,800),'fatturabile solo quello di K2: 800',String(t.fatturabile));
  ok(quasi(t.rimborsiFattura,0),'i 100 di km del mese escluso non sono rimborsi in fattura',String(t.rimborsiFattura));
  ok(quasi(t.costi,120),'sono spese mie: 20 + 100 = 120',String(t.costi));
  ok(quasi(t.daFatturare,800),'e da fatturare restano 800, non 3.200',String(t.daFatturare));
  ok(pg.errs.length===0,'nessun errore JS',pg.errs.slice(0,2).join(' | ')||'nessuno');
  await pg.close();
}
{
  // la controprova: senza «Escluso» tutto torna come prima
  const pg=await apri(SEMI(''));
  const t=await pg.evaluate(()=>window.annualTotals(2026));
  ok(quasi(t.fatturabile,3200)&&quasi(t.rimborsiFattura,100)&&quasi(t.costi,20),
     'senza «Escluso» il mese si fattura tutto: 3.200, coi 100 di km in fattura e 20 di spese mie',
     `${t.fatturabile} · ${t.rimborsiFattura} · ${t.costi}`);
  await pg.close();
}
{
  // e una scheda «Da fatturare» non esclude niente
  const pg=await apri(SEMI('to_invoice'));
  const t=await pg.evaluate(()=>window.annualTotals(2026));
  ok(quasi(t.fatturabile,3200),'una scheda «Da fatturare» non toglie niente',String(t.fatturabile));
  await pg.close();
}

console.log('\n=== IL MESE: IL CLIENTE ESCLUSO NON È NEL «DA FATTURARE» ===');
{
  const pg=await apri(SEMI(),'billing');
  const amt=await importo(pg,'Da fatturare');
  ok(quasi(eur(amt),832),'da fatturare a settembre: 832,00, cioè K2 con la rivalsa',amt);
  const t=await testo(pg);
  ok(/Escluso Solution 2\.?496,00\s?€: non si fattura, e non è nel totale/.test(t),
     'e sotto si legge chi è escluso, e per quanto',(t.match(/Escluso Solution[^.]*\./)||[''])[0]||'nessuna riga');
  await pg.close();
}

console.log('\n=== IL BILANCIO ===');
{
  const pg=await apri(SEMI(),'balance');
  const comp=await valore(pg,'Compensi professionali');
  ok(comp&&quasi(eur(comp.v),800),'i compensi sono 800: il lavoro escluso non è ricavo',comp?.v);
  ok(comp&&/senza 2\.?300,00\s?€ dei mesi esclusi dalla fatturazione/.test(comp.d),'e lo dice',comp?.d);
  const sp=await valore(pg,'− Spese a mio carico');
  ok(sp&&quasi(eur(sp.v),120),'le spese a mio carico sono 120: i 100 di km non rientrano',sp?.v);
  const mo=await importo(pg,'Margine operativo');
  ok(quasi(eur(mo),680),'margine operativo: 800 − 120 = 680',mo);
  const t=await testo(pg);
  ok(/Compensi 3\.?100,00\s?€ · di cui esclusi dalla fatturazione 2\.?300,00\s?€/.test(t),
     'nel mese per mese settembre dice quanto è escluso',(t.match(/Compensi 3[^·]*·[^·]*·/)||[''])[0]);
  ok(/Rimborso km/.test(t),'e i 100 di km stanno fra i costi per voce');
  const set=await pg.evaluate(()=>{const r=[...document.querySelectorAll('#app .row')].find(r=>r.getAttribute('onclick')==='openMonthExpenses(2026,9)');
    return r?r.querySelector('.value').textContent.trim():null});
  ok(quasi(eur(set),680),'e il margine di settembre è 680: 3.100 − 2.300 esclusi − 120 di spese',set);
  await pg.close();
}

console.log('\n=== «DA FATTURARE»: LA RIGA DEGLI ESCLUSI ===');
{
  const pg=await apri(SEMI(),'fatturatoDetail');
  const es=await valore(pg,'− Esclusi dalla fatturazione');
  ok(es&&quasi(eur(es.v),2300),'fra consuntivato e fatturabile c’è «− Esclusi dalla fatturazione»: 2.300',es?.v);
  const fa=await valore(pg,'= Fatturabile');
  ok(fa&&quasi(eur(fa.v),800),'e il fatturabile torna: 3.100 − 2.300 + 0 = 800',fa?.v);
  await pg.close();
  const pc=await apri(SEMI(''),'fatturatoDetail');
  ok(!(await valore(pc,'− Esclusi dalla fatturazione')),'senza mesi esclusi la riga non c’è');
  await pc.close();
}

console.log('\n=== IL MARGINE IN DASHBOARD ===');
{
  // settembre: si fattura solo K2, 832 con la rivalsa; le spese sono 120
  // base 832 · reddito 648,96 · INPS 169,18 · imposta 23,99 · netto 518,83
  const pg=await apri(SEMI(),'home');
  const set=await pg.evaluate(()=>{const r=document.querySelector('#app .margineRiga[data-mese="9"]');
    return r?{sotto:r.querySelector('.margineNome span').textContent.replace(/\s+/g,' ').trim(),netto:r.querySelector('.margineNetto b').textContent.replace(/\s+/g,' ').trim()}:null});
  ok(set&&set.sotto==='832,00 € da fatturare','settembre: 832,00 € da fatturare, senza Solution',set?.sotto);
  ok(set&&set.netto==='518,83 €','e netto 518,83 €, con le spese a carico dei 100 di km',set?.netto);
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== mesi esclusi: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
