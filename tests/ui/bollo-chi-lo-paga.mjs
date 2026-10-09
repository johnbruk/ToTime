// «Io la marca da bollo non la addebito al cliente, la pago io
// direttamente sul sito dell'Agenzia delle Entrate.»
//
// Un interruttore solo — «Marca da bollo: Sì/No» — diceva due cose
// insieme: che il bollo E' DOVUTO e che lo si ADDEBITA. Chi lo mette in
// fattura ma lo paga di tasca sua non aveva modo di dirlo: spegnendolo
// il totale tornava giusto, ma il lettore segnalava uno scostamento
// falso a ogni fattura e smetteva di controllare il caso che conta —
// sopra i 77,47 € il bollo ci vuole, chiunque lo paghi.
//
// Qui si verifica che le due domande siano separate, e che dalla
// configurazione si LEGGA cosa succede.
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
const M=new Date().toISOString().slice(0,7);
const ANNO=Number(M.slice(0,4));

// Un mese di lavoro ben sopra la soglia del bollo, e uno sotto.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'ac',name:'Acme',code:'ACM',daily_rate:500,standard_hours:8,
    compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'p1',client_id:'ac',name:'Progetto',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.timesheet_entries=[{id:'v1',entry_date:'${M}-03',client_id:'ac',project_id:'p1',activity_id:'a1',
    hours:8,daily_rate_snapshot:500,standard_hours_snapshot:8}];
  S.manual_entries=[];S.monthly_compensations=[];S.travel_expenses=[];S.trips=[];
  S.billing_headers=[];S.expense_categories=[];S.billing_lines=[];S.invoice_line_allocations=[];
`;
const apri=async(modo,extra='')=>{
  const pg=await b.newPage({viewport:{width:390,height:1800},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(({m,anno})=>{
    window.__stores.tax_settings=[{id:'t1',fiscal_year:anno,regime:'forfettario',
      profitability_coefficient:78,substitute_tax_rate:5,inps_gs_rate:26.07,
      inps_recharge_enabled:false,inps_recharge_rate:4,
      stamp_duty_mode:m,stamp_duty_amount:2}];
  },{m:modo,anno:ANNO});
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};
console.log('\n=== DALLA CONFIGURAZIONE SI LEGGE CHE IN FATTURA CI VA, E CHI LA PAGA ===');
{
  const pg=await apri('mine');
  await pg.evaluate(()=>window.go('taxSettings'));
  await pg.waitForTimeout(700);
  const voci=await pg.evaluate(()=>[...document.querySelectorAll('[name=stamp_duty_mode] option')]
    .map(o=>o.textContent.trim()));
  ok(voci.some(v=>/addebitata al cliente/.test(v)),'c’è la scelta «la addebito al cliente»',voci.join(' | '));
  ok(voci.some(v=>/la pago io/.test(v)),'e la scelta «la pago io»',voci.join(' | '));
  ok(voci.some(v=>/Non si applica/.test(v)),'e «non si applica»',voci.join(' | '));
  ok(voci.filter(v=>/In fattura/.test(v)).length===2,
     'e tutte e due le prime dicono «In fattura»: il bollo ci va comunque',voci.join(' | '));
  const scelto=await pg.evaluate(()=>document.querySelector('[name=stamp_duty_mode]')?.value||'');
  ok(scelto==='mine','la scelta salvata è quella che si legge',scelto||'nessuna');
  const t=await testo(pg);
  ok(/è dovuto/.test(t)&&/chi lo paga/.test(t),
     'e la spiegazione separa le due cose: è dovuto, e chi lo paga',
     (t.match(/Sopra[^.]{0,120}/)||[''])[0]);
  ok(/non lo comprende/.test(t)&&/tuo costo/.test(t),
     'dicendo che pagandolo tu il totale non lo comprende e resta un tuo costo',
     (t.match(/Pagandolo tu[^.]{0,140}/)||[''])[0]);
  ok(/trimestrali/.test(t),'e dove si versa');
  await pg.close();
}

console.log('\n=== PAGANDOLO TU, IN FATTURA C’È MA NON NEL TOTALE ===');
{
  const pg=await apri('mine');
  await pg.evaluate(()=>window.openBillingClient('ac'));
  await pg.waitForTimeout(800);
  const t=await testo(pg);
  ok(/Marca da bollo/.test(t),'la riga della marca da bollo c’è',
     (t.match(/Marca da bollo[^·]{0,60}/)||[''])[0]);
  ok(/a tuo carico/.test(t),'ed è marcata «a tuo carico»',
     (t.match(/Marca da bollo[\s\S]{0,80}/)||[''])[0]);
  ok(/la paghi tu/.test(t),'e il modulo lo dice per esteso',
     (t.match(/In fattura, ma la paghi tu[^.]{0,80}/)||[''])[0]);
  ok(!/name="stamp_duty_enabled"/.test(await pg.content()),
     'e sulla singola fattura non si ridiscute: niente interruttore qui');
  // il totale: 500 € di lavoro, nessuna rivalsa, nessun bollo addebitato
  await pg.evaluate(()=>{
    const f=document.querySelector('#app form.form');
    f.status.value='invoice_issued'; f.invoice_number.value='1/2026';
    f.requestSubmit();});
  await pg.waitForTimeout(1300);
  const h=await pg.evaluate(()=>(window.__stores.billing_headers||[])[0]||{});
  ok(Number(h.invoice_total_amount)===500,
     'il totale della fattura è 500 €: il bollo non si somma',String(h.invoice_total_amount));
  ok(Number(h.stamp_duty_amount||0)===0,
     'e sulla fattura resta scritto che di bollo non ne hai addebitato',String(h.stamp_duty_amount));
  await pg.close();
}

console.log('\n=== ADDEBITANDOLO, ENTRA NEL TOTALE ===');
{
  const pg=await apri('charged');
  await pg.evaluate(()=>window.openBillingClient('ac'));
  await pg.waitForTimeout(800);
  const t=await testo(pg);
  ok(/addebitata al cliente/.test(t),'il modulo dice che è addebitata',
     (t.match(/In fattura e addebitata[^.]{0,60}/)||[''])[0]);
  ok(!/a tuo carico/.test(t),'e non «a tuo carico»');
  await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
    f.status.value='invoice_issued'; f.requestSubmit();});
  await pg.waitForTimeout(1300);
  const h=await pg.evaluate(()=>(window.__stores.billing_headers||[])[0]||{});
  ok(Number(h.invoice_total_amount)===502,'il totale è 502 €: il bollo si somma',String(h.invoice_total_amount));
  ok(Number(h.stamp_duty_amount)===2,'e risulta addebitato',String(h.stamp_duty_amount));
  await pg.close();
}

console.log('\n=== SOTTO LA SOGLIA IL BOLLO NON CI VA, IN NESSUN CASO ===');
{
  // 60 € di compenso: sotto i 77,47 € il bollo non e' dovuto, e prima
  // ci finiva lo stesso gonfiando di 2 € le fatture piccole.
  const pg=await apri('charged',`
    S.timesheet_entries=[{id:'v1',entry_date:'${M}-03',client_id:'ac',project_id:'p1',activity_id:'a1',
      hours:1,daily_rate_snapshot:480,standard_hours_snapshot:8}];`);
  await pg.evaluate(()=>window.openBillingClient('ac'));
  await pg.waitForTimeout(800);
  const t=await testo(pg);
  ok(/non è dovuta/.test(t),'il modulo dice che qui non è dovuta',
     (t.match(/non è dovuta[^.]{0,60}/)||[''])[0]);
  await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
    f.status.value='invoice_issued'; f.requestSubmit();});
  await pg.waitForTimeout(1300);
  const h=await pg.evaluate(()=>(window.__stores.billing_headers||[])[0]||{});
  ok(Number(h.stamp_duty_amount||0)===0,'e non si addebita niente',String(h.stamp_duty_amount));
  ok(Number(h.invoice_total_amount)===60,'il totale resta 60 €',String(h.invoice_total_amount));
  await pg.close();
}

console.log('\n=== «NON SI APPLICA» RESTA UNA SCELTA POSSIBILE ===');
{
  const pg=await apri('none');
  await pg.evaluate(()=>window.openBillingClient('ac'));
  await pg.waitForTimeout(800);
  const t=await testo(pg);
  ok(/Non si applica/.test(t),'il modulo lo dice',(t.match(/Non si applica[^.]{0,40}/)||[''])[0]);
  await pg.evaluate(()=>{const f=document.querySelector('#app form.form');
    f.status.value='invoice_issued'; f.requestSubmit();});
  await pg.waitForTimeout(1300);
  const h=await pg.evaluate(()=>(window.__stores.billing_headers||[])[0]||{});
  ok(Number(h.invoice_total_amount)===500,'e il totale è netto',String(h.invoice_total_amount));
  await pg.close();
}

console.log('\n=== IL BOLLO CHE PAGHI TU È UN TUO COSTO ===');
{
  const pg=await apri('mine');
  await pg.evaluate(()=>{window.__stores.billing_headers=[
    {id:'h1',client_id:'ac',year:new Date().getFullYear(),month:3,status:'invoice_issued',
     total_amount:500,invoice_total_amount:500,stamp_duty_amount:0}];});
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.go('balance'));
  await pg.waitForTimeout(800);
  const t=await testo(pg);
  ok(/Costi/.test(t),'la pagina del bilancio si apre sui costi');
  ok(/2,00 €|2 €/.test(t),'e i 2 € del bollo ci stanno dentro',
     (t.match(/[^·]{0,50}2,00 €/)||[''])[0]||'non si leggono');
  await pg.close();
}

console.log('\n=== «NON SI APPLICA»: NESSUNA SCADENZA DI BOLLO DA VERSARE ===');
{
  // Il conteggio di quello che si deve all'Agenzia delle Entrate
  // ignorava del tutto la scelta: contava 2 € per ogni fattura sopra
  // soglia comunque, e chi aveva scelto «non si applica» si vedeva
  // delle scadenze che non aveva.
  const con=await apri('mine');
  await con.evaluate(({a})=>{window.__stores.billing_headers=[
    {id:'h1',client_id:'ac',year:a,month:2,status:'invoice_issued',
     total_amount:4600,invoice_total_amount:4784,stamp_duty_amount:0}];},{a:ANNO});
  await con.evaluate(()=>window.reload());await con.waitForTimeout(600);
  await con.evaluate(()=>window.go('tasseFuture'));await con.waitForTimeout(800);
  const tCon=await testo(con);
  ok(/Imposta di bollo/.test(tCon),'pagandolo tu, la scadenza del bollo c’è',
     (tCon.match(/Imposta di bollo[^·]{0,50}/)||[''])[0]);
  await con.close();

  const senza=await apri('none');
  await senza.evaluate(({a})=>{window.__stores.billing_headers=[
    {id:'h1',client_id:'ac',year:a,month:2,status:'invoice_issued',
     total_amount:4600,invoice_total_amount:4784,stamp_duty_amount:0}];},{a:ANNO});
  await senza.evaluate(()=>window.reload());await senza.waitForTimeout(600);
  await senza.evaluate(()=>window.go('tasseFuture'));await senza.waitForTimeout(800);
  const tSenza=await testo(senza);
  ok(!/Imposta di bollo/.test(tSenza),'con «non si applica» non c’è: non devi versare niente',
     (tSenza.match(/Imposta di bollo[^·]{0,50}/)||[''])[0]||'nessuna scadenza');
  await senza.close();
}

console.log('\n=== LA SOGLIA SI MISURA SUGLI IMPORTI ESENTI, RIVALSA COMPRESA ===');
{
  // 76 € di compenso stanno sotto i 77,47. Ma con il 4% di rivalsa la
  // fattura espone 79,04 € esenti, e il bollo e' dovuto. Prima si
  // guardava il solo compenso, e questa fattura non veniva contata.
  const pg=await apri('mine');
  await pg.evaluate(({a})=>{window.__stores.billing_headers=[
    {id:'h1',client_id:'ac',year:a,month:2,status:'invoice_issued',
     total_amount:76,invoice_total_amount:79.04,stamp_duty_amount:0}];},{a:ANNO});
  await pg.evaluate(()=>window.reload());await pg.waitForTimeout(600);
  await pg.evaluate(()=>window.go('tasseFuture'));await pg.waitForTimeout(800);
  const t=await testo(pg);
  ok(/Imposta di bollo/.test(t),'76 € di compenso + 4% fanno 79,04: il bollo è dovuto',
     (t.match(/Imposta di bollo[^·]{0,50}/)||[''])[0]||'non contata');
  await pg.close();

  const sotto=await apri('mine');
  await sotto.evaluate(({a})=>{window.__stores.billing_headers=[
    {id:'h1',client_id:'ac',year:a,month:2,status:'invoice_issued',
     total_amount:70,invoice_total_amount:72.80,stamp_duty_amount:0}];},{a:ANNO});
  await sotto.evaluate(()=>window.reload());await sotto.waitForTimeout(600);
  await sotto.evaluate(()=>window.go('tasseFuture'));await sotto.waitForTimeout(800);
  const t2=await testo(sotto);
  ok(!/Imposta di bollo/.test(t2),'mentre 72,80 € restano sotto soglia, e non è dovuto',
     (t2.match(/Imposta di bollo[^·]{0,50}/)||[''])[0]||'nessuna scadenza');
  await sotto.close();
}

await b.close(); srv.close();
console.log(`\n=== bollo chi lo paga: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
