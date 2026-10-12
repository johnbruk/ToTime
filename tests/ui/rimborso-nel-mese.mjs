// Il rimborso spese sta nel mese della spesa, non nella data che cita.
//
// «Sto registrando la fattura 4 che ha dentro anche un rimborso spese,
// come mai mi stai bloccando?». La riga del rimborso diceva
// «Rimborso KM · 30/06/2026 · ... · Riferimento: Trasferta 23 Aprile
// 2026». Il lettore prendeva il primo nome di mese — e il primo
// nell'ordine del calendario, non del testo — e la metteva in APRILE,
// gia' fatturato con la 2/2026: due scostamenti falsi e la
// registrazione ferma. La spesa, nell'app, e' di giugno.
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

// Giugno: 12 giorni a 460 = 5.520, piu' 160 di rimborso km. La rivalsa
// solo sulla consulenza, come la fa Fiscozen con la spunta.
const riga=(n,desc,q,pu,tot)=>`<DettaglioLinee><NumeroLinea>${n}</NumeroLinea><Descrizione>${desc}</Descrizione><Quantita>${q}</Quantita><PrezzoUnitario>${pu}</PrezzoUnitario><PrezzoTotale>${tot}</PrezzoTotale><AliquotaIVA>0.00</AliquotaIVA><Natura>N2.2</Natura></DettaglioLinee>`;
const fattura=descRimborso=>{
  let x=XML.replace(/<DettaglioLinee>[\s\S]*<\/DettaglioLinee>/,
    riga(1,'Consulenza - Giugno 2026 | Giorni: 12,0','12.00','460.00','5520.00')+
    riga(2,descRimborso,'1.00','160.00','160.00'));
  return x.replace('<Numero>1/2026</Numero>','<Numero>4/2026</Numero>')
    .replace('<Data>2026-04-08</Data>','<Data>2026-07-03</Data>')
    .replace('<TipoDocumento>TD01</TipoDocumento>','<TipoDocumento>TD06</TipoDocumento>')
    .replace('<ImportoContributoCassa>119.60</ImportoContributoCassa>','<ImportoContributoCassa>220.80</ImportoContributoCassa>')
    .replace('<ImponibileCassa>2990.00</ImponibileCassa>','<ImponibileCassa>5520.00</ImponibileCassa>')
    .replace('<ImportoTotaleDocumento>3109.60</ImportoTotaleDocumento>','<ImportoTotaleDocumento>5900.80</ImportoTotaleDocumento>')
    .replace('<ImponibileImporto>3109.60</ImponibileImporto>','<ImponibileImporto>5900.80</ImponibileImporto>')
    .replace('<ImportoPagamento>3109.60</ImportoPagamento>','<ImportoPagamento>5900.80</ImportoPagamento>');
};
const CON_DATA='Rimborso spese di trasferta · Rimborso KM · 30/06/2026 · Milano → Verona e ritorno · 320 km × 0,50 €/km · Riferimento : Trasferta 23 Aprile 2026 · 160,00 €';
const SENZA_DATA='Rimborso KM trasferta Verona del 23 aprile 2026';

const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Cliente Esempio',vat_number:'22222222222',
    daily_rate:460,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'p1',client_id:'sol',name:'Progetto',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.timesheet_entries=[1,2,3,4,5,8,9,10,11,12,15,16].map(d=>({id:'g'+d,entry_date:'2026-06-'+String(d).padStart(2,'0'),
    client_id:'sol',project_id:'p1',activity_id:'a1',hours:8,daily_rate_snapshot:460,standard_hours_snapshot:8}));
  S.travel_expenses=[{id:'km',expense_date:'2026-06-30',client_id:'sol',amount:160,expense_type:'invoice',reimbursable:true,
    description:'Riferimento : Trasferta 23 Aprile 2026'}];
  S.user_profiles=[{id:'u1',user_id:'u1',first_name:'G',last_name:'B',vat_number:'11111111111'}];
  S.monthly_compensations=[];S.manual_entries=[];S.trips=[];S.vehicles=[];S.expense_categories=[];
  // aprile e' gia' fatturato con la 2/2026
  S.billing_headers=[{id:'h4',client_id:'sol',year:2026,month:4,status:'invoice_issued',invoice_number:'2/2026',
    invoice_date:'2026-05-05',total_amount:3680,inps_recharge_amount:147.2,stamp_duty_amount:0,invoice_total_amount:3827.2}];
  S.tax_settings=[{id:'t1',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,
    substitute_tax_rate:5,inps_gs_rate:26.07,inps_recharge_rate:4,inps_recharge_enabled:true,
    stamp_duty_mode:'mine',stamp_duty_amount:2}];
`;
const apri=async(extra='')=>{
  const pg=await b.newPage({viewport:{width:390,height:2000},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(()=>window.reload());await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.go('fatturaCarica'));await pg.waitForTimeout(500);
  return pg;
};
const carica=async(pg,xml)=>{
  await pg.setInputFiles('#app input[type=file]',{name:'fattura4.xml',mimeType:'text/xml',buffer:Buffer.from(xml)});
  await pg.waitForTimeout(900);
};
const esiti=pg=>pg.evaluate(()=>[...document.querySelectorAll('#app .row .title')].map(x=>x.textContent.trim()));
const bottone=pg=>pg.evaluate(()=>{const b=[...document.querySelectorAll('#app button')].find(x=>/^Registra su/.test(x.textContent.trim()));return b?b.textContent.trim():''});

console.log('\n=== IL MESE DI UNA RIGA: QUELLO DI COMPETENZA, NON UNA DATA CITATA ===');
{
  const pg=await apri();
  const mesi=await pg.evaluate(descr=>descr.map(d=>{
    const x=window.leggiFatturaXML(`<?xml version="1.0"?><p:FatturaElettronica xmlns:p="x"><FatturaElettronicaBody><DatiBeniServizi><DettaglioLinee><Descrizione>${d}</Descrizione><PrezzoTotale>1</PrezzoTotale></DettaglioLinee><DatiRiepilogo><ImponibileImporto>1</ImponibileImporto></DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody></p:FatturaElettronica>`);
    return x.righe?x.righe[0].mese:x.errore}),
    ['Consulenza - Marzo 2026 | Giorni: 5,5',
     'Rimborso KM · 30/06/2026 · Riferimento : Trasferta 23 Aprile 2026',
     'Consulenza - Giugno 2026 · rif. ordine del 23 Aprile 2026',
     'Consulenza - Luglio 2026 (recupero Marzo 2026)',
     'Trasferta del 23 aprile 2026']);
  ok(mesi[0]==='2026-03','«Consulenza - Marzo 2026» resta marzo',mesi[0]);
  ok(mesi[1]==='2026-06','«30/06/2026 · Trasferta 23 Aprile 2026» è giugno: la data citata non comanda',mesi[1]);
  ok(mesi[2]==='2026-06','«Giugno 2026 · ordine del 23 Aprile 2026» è giugno',mesi[2]);
  ok(mesi[3]==='2026-07','con due mesi vale il primo nel testo, non il primo del calendario',mesi[3]);
  ok(mesi[4]==='2026-04','una data sola in lettere resta quella',mesi[4]);
  await pg.close();
}

console.log('\n=== LA FATTURA 4 SI LEGGE SU GIUGNO, E SI REGISTRA ===');
{
  const pg=await apri();
  await carica(pg,fattura(CON_DATA));
  const t=await testo(pg);
  ok(!/Aprile 2026 risulta già fatturato/.test(t),'non si ferma più su aprile',(t.match(/Aprile 2026 risulta[^.]{0,40}/)||[''])[0]||'non si ferma');
  ok(!/Importo diverso dal fatturabile/.test(t),'niente scostamenti: giugno torna, 5.520 + 160',(t.match(/Importo diverso[^.]{0,80}/)||[''])[0]||'nessuno');
  ok(!/Rimborsi spese senza una riga propria/.test(t),'e il rimborso ha la sua riga a giugno');
  ok(await bottone(pg)==='Registra su 1 mese','si registra, su un mese solo',await bottone(pg)||'nessun pulsante');
  await pg.evaluate(()=>[...document.querySelectorAll('#app button')].find(x=>/^Registra su/.test(x.textContent.trim())).click());
  await pg.waitForTimeout(1500);
  const h=await pg.evaluate(()=>(window.__stores.billing_headers||[]).map(x=>({m:x.month,n:x.invoice_number,b:x.total_amount,t:x.invoice_total_amount})));
  const giu=h.find(x=>x.m===6)||{};
  ok(giu.n==='4/2026'&&Math.abs(giu.b-5680)<0.005&&Math.abs(giu.t-5900.8)<0.005,
     'giugno registrato: 5.680 di imponibile (rimborso compreso), 5.900,80 in tutto',JSON.stringify(giu));
  const apr=h.find(x=>x.m===4)||{};
  ok(apr.n==='2/2026'&&apr.t===3827.2,'e aprile resta com’era, con la 2/2026',JSON.stringify(apr));
  await pg.close();
}

console.log('\n=== SENZA DATA IN CIFRE, IL MESE LO DICE LA SPESA ===');
{
  // Una descrizione scritta a mano, con la sola data della trasferta:
  // il testo direbbe aprile, ma la spesa da 160 € nell'app e' di giugno.
  const pg=await apri();
  await carica(pg,fattura(SENZA_DATA));
  const t=await testo(pg);
  ok(/Rimborso spese attribuito a Giugno 2026/.test(t),'il rimborso va a giugno, e l’app lo dice',
     (t.match(/Rimborso spese attribuito[^»]{0,60}/)||[''])[0]||'non lo dice');
  ok(/nomina Aprile 2026/.test(t),'dicendo anche che il testo nominava aprile');
  ok(await bottone(pg)==='Registra su 1 mese','e si registra su giugno',await bottone(pg)||'nessun pulsante');
  await pg.close();
}
{
  // Ma se nell'app non c'e' una spesa che combaci, non si indovina: la
  // riga resta dove la mette il testo, e lo scostamento si vede.
  const pg=await apri(`S.travel_expenses=[];`);
  await carica(pg,fattura(SENZA_DATA));
  const t=await testo(pg);
  ok(!/Rimborso spese attribuito/.test(t),'senza una spesa che combaci, nessuna attribuzione inventata');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== rimborso nel mese: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
