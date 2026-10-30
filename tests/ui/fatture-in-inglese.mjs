// Fatture in inglese per i clienti esteri.
//
// A un cliente straniero la fattura si scrive in inglese. La lingua e'
// del cliente: si sceglie nella sua scheda, e da li' le descrizioni da
// incollare su Fiscozen escono in inglese — mese, giornate e importi
// scritti all'inglese. Gli importi non cambiano. E la fattura caricata
// dopo si legge lo stesso: «March 2026 | Days: 5.5» dice mese e giorni
// come «Marzo 2026 | Giorni: 5,5».
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
const XML=fs.readFileSync(path.join(ROOT,'tests/ui/fixtures/fattura-esempio.xml'),'utf8');
const M=new Date().toISOString().slice(0,7);
const ANNO=Number(M.slice(0,4));
const MESE_EN=['January','February','March','April','May','June','July','August','September','October','November','December'][Number(M.slice(5,7))-1]+' '+ANNO;

// Nove giorni e mezzo a 600 €, un albergo da rifatturare e un taxi a
// piè di lista.
const SEMI=lingua=>`
  const S=window.__stores;
  S.clients=[{id:'ch',name:'Cliente Svizzero',code:'CHE',daily_rate:600,standard_hours:8,
    compensation_type:'daily_rate_8h',active:true${lingua?",invoice_language:'"+lingua+"'":''}}];
  S.projects=[{id:'p1',client_id:'ch',name:'Omnichannel',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.expense_categories=[
    {id:'hot',name:'Alloggio',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false},
    {id:'taxi',name:'Taxi',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false}];
  S.timesheet_entries=[1,2,3,4,5,6,7,8,9].map(d=>({id:'v'+d,entry_date:'${M}-0'+d,
    client_id:'ch',project_id:'p1',activity_id:'a1',hours:8,
    daily_rate_snapshot:600,standard_hours_snapshot:8}));
  S.timesheet_entries.push({id:'vh',entry_date:'${M}-10',client_id:'ch',project_id:'p1',
    activity_id:'a1',hours:4,daily_rate_snapshot:600,standard_hours_snapshot:8});
  S.travel_expenses=[
    {id:'s1',expense_date:'${M}-03',client_id:'ch',project_id:'p1',expense_category_id:'hot',
     work_city:'Lugano',amount:1234.5,reimbursement_type:'invoice',payment_method:'carta',receipt_kept:true},
    {id:'s2',expense_date:'${M}-04',client_id:'ch',project_id:'p1',expense_category_id:'taxi',
     work_city:'Lugano',amount:38,reimbursement_type:'expense_report',payment_method:'carta',receipt_kept:true}];
  S.manual_entries=[];S.monthly_compensations=[];S.trips=[];S.vehicles=[];
  S.billing_headers=[];S.billing_lines=[];S.invoice_line_allocations=[];
  S.tax_settings=[{id:'t1',fiscal_year:${ANNO},regime:'forfettario',profitability_coefficient:67,
    substitute_tax_rate:5,inps_gs_rate:26.07,inps_recharge_enabled:true,inps_recharge_rate:4,
    stamp_duty_mode:'mine',stamp_duty_amount:2}];
`;
const apri=async lingua=>{
  const pg=await b.newPage({viewport:{width:390,height:2200},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI(lingua));
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};
const descrizioni=pg=>pg.evaluate(()=>[...document.querySelectorAll('#app .copybox')].map(x=>x.textContent.trim()));
const apriFattura=async pg=>{await pg.evaluate(()=>window.openBillingClient('ch'));await pg.waitForTimeout(900)};

console.log('\n=== UN CLIENTE IN INGLESE: LE DESCRIZIONI ESCONO IN INGLESE ===');
{
  const pg=await apri('en');
  await apriFattura(pg);
  const d=await descrizioni(pg);
  const lav=d.find(x=>/Consulting/.test(x))||'';
  ok(lav==='Consulting services - '+MESE_EN+' - Client/Project: Omnichannel | Days: 9.50',
     'il lavoro: mese inglese, giornate col punto',lav||d.join(' | '));
  const hot=d.find(x=>/Accommodation/.test(x))||'';
  ok(/^Reimbursement of travel expenses · Accommodation · \d\d\/\d\d\/\d{4} · Lugano · Omnichannel · €1,234\.50$/.test(hot),
     'la spesa in fattura: voce tradotta e importo all’inglese',hot||d.join(' | '));
  const taxi=d.find(x=>/Taxi/.test(x))||'';
  ok(/^Reimbursement of travel expenses · Taxi · .* · €38\.00$/.test(taxi),'anche quella a piè di lista',taxi);
  ok(!d.some(x=>/Consulenza|Giorni|Rimborso spese/.test(x)),'e niente resta in italiano',d.join(' | '));
  const t=await testo(pg);
  ok(/In inglese come dice la scheda del cliente/.test(t),'la pagina dice che sono in inglese, e perché');
  ok(/Base 6\.?934,50 €/.test(t),'gli importi non cambiano: 5.700 di lavoro + 1.234,50 di albergo',(t.match(/Base [^·]{0,20}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== UN CLIENTE ITALIANO RESTA COM’ERA ===');
for(const lingua of ['it',null]){
  const pg=await apri(lingua);
  await apriFattura(pg);
  const d=await descrizioni(pg);
  ok(d.some(x=>/^Consulenza - .* \| Giorni: 9,50$/.test(x)),
     'in italiano'+(lingua?'':', anche senza la colonna nel database'),d[0]||'');
  ok(!d.some(x=>/Consulting|Days|Reimbursement/.test(x)),'e senza una parola d’inglese');
  await pg.close();
}

console.log('\n=== LA LINGUA SI SCEGLIE NELLA SCHEDA CLIENTE ===');
{
  const pg=await apri('it');
  await pg.evaluate(()=>window.editClient('ch'));
  await pg.waitForTimeout(500);
  const t=await testo(pg);
  ok(/Lingua delle fatture/.test(t)&&/English/.test(t),'c’è la scelta Italiano · English');
  await pg.click('input[name=invoice_language][value=en]',{force:true});
  await pg.evaluate(()=>document.querySelector('#app form').requestSubmit());
  await pg.waitForTimeout(900);
  const salvata=await pg.evaluate(()=>window.__stores.clients[0].invoice_language);
  ok(salvata==='en','si salva',String(salvata));
  await apriFattura(pg);
  const d=await descrizioni(pg);
  ok(d.some(x=>/^Consulting services/.test(x)),'e la fattura passa all’inglese',d[0]||'');
  await pg.close();
}

console.log('\n=== IL SERVIZIO DEL CONTRATTO, IL CLIENTE FINALE E IL RIFERIMENTO ===');
{
  const pg=await apri('en');
  await pg.evaluate(()=>window.editClient('ch'));
  await pg.waitForTimeout(500);
  const visibili=await pg.evaluate(()=>!document.getElementById('campiInglese').hidden);
  ok(visibili,'con «English» si vedono i tre campi');
  await pg.fill('input[name=invoice_service_en]','SAP and Omnichannel Project Manager');
  await pg.fill('input[name=invoice_end_client]','Acme Group');
  await pg.fill('input[name=invoice_reference]','SOA 123');
  await pg.evaluate(()=>document.querySelector('#app form').requestSubmit());
  await pg.waitForTimeout(900);
  await apriFattura(pg);
  const d=await descrizioni(pg);
  const lav=d.find(x=>/Project Manager/.test(x))||'';
  ok(lav==='SAP and Omnichannel Project Manager - '+MESE_EN+' - End client: Acme Group | Days: 9.50 | Ref. SOA 123',
     'la riga usa le parole del contratto',lav||d.join(' | '));
  ok(d.some(x=>/^Reimbursement of travel expenses · Accommodation/.test(x)),'le spese restano com’erano');
  const f=await pg.evaluate(x=>window.leggiFatturaXML(x),
    XML.replace('Consulenza - Marzo 2026 | Giorni: 5,5','SAP and Omnichannel Project Manager - March 2026 - End client: Acme Group | Days: 5.5 | Ref. SOA 123'));
  ok(f.righe[1].mese==='2026-03'&&f.righe[1].giorni===5.5,'e la riga si rilegge',f.righe[1].mese+' · '+f.righe[1].giorni);
  await pg.evaluate(()=>window.editClient('ch'));
  await pg.waitForTimeout(500);
  await pg.click('input[name=invoice_language][value=it]',{force:true});
  const nascosti=await pg.evaluate(()=>document.getElementById('campiInglese').hidden);
  ok(nascosti,'con «Italiano» i campi si nascondono');
  await pg.close();
}

console.log('\n=== LA FATTURA IN INGLESE SI RILEGGE ===');
{
  const pg=await apri('en');
  const xml=XML.replace('Consulenza - Febbraio 2026 | Giorni: 1,0','Consulting services - February 2026 | Days: 1.0')
    .replace('Consulenza - Marzo 2026 | Giorni: 5,5','Consulting services - March 2026 - Client/Project: Omnichannel | Days: 5.5');
  const f=await pg.evaluate(x=>window.leggiFatturaXML(x),xml);
  ok(f.righe.map(r=>r.mese).join(',')==='2026-02,2026-03','i mesi dalle descrizioni inglesi',f.righe.map(r=>r.mese).join(','));
  ok(f.righe[0].giorni===1&&f.righe[1].giorni===5.5,'e i giorni',f.righe.map(r=>r.giorni).join(' · '));
  const g=await pg.evaluate(x=>window.leggiFatturaXML(x),
    XML.replace('Consulenza - Febbraio 2026 | Giorni: 1,0','Support you may need - Settembre 2026'));
  ok(g.righe[0].mese==='2026-09','«may» minuscolo non è un mese',g.righe[0].mese);
  await pg.close();
}

await b.close();srv.close();
console.log(`\n${pass} OK, ${fail} KO`);
process.exit(fail?1:0);
