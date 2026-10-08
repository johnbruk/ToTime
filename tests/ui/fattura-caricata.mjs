// La fattura emessa e' la verita'.
//
// Fin qui l'app PROPONEVA i dati per la fattura. Ma una volta emessa e
// trasmessa allo SdI, e' la fattura che fa fede: se i due non
// concordano, a sbagliare e' il consuntivo. Quindi si carica la
// fattura, si legge, e si dice DOVE l'app non tornava.
//
// Si legge l'XML, non il PDF: i campi sono gia' separati e certificati,
// e non si rompe se l'emittente cambia il layout del documento.
//
// La fixture e' una copia della fattura vera con gli identificativi
// sostituiti — P.IVA, codice fiscale, IBAN, email, nomi. Gli importi
// sono quelli originali, altrimenti i conti non proverebbero niente.
// Il file vero non entra nel repository: un IBAN committato ci resta
// per sempre.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.xml':'application/xml'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
const XML=fs.readFileSync(path.join(ROOT,'tests/ui/fixtures/fattura-esempio.xml'),'utf8');

// Il consuntivo che l'app ha: 1 giorno a febbraio e 5,5 a marzo, a
// 460 €/g, cioe' esattamente quello che la fattura dichiara. Da qui si
// parte, e poi lo si guasta un pezzo per volta.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Cliente Esempio',vat_number:'22222222222',
    daily_rate:460,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'p1',client_id:'sol',name:'Progetto',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.expense_categories=[{id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount'}];
  S.timesheet_entries=[
    {id:'f1',entry_date:'2026-02-10',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m1',entry_date:'2026-03-02',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m2',entry_date:'2026-03-03',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m3',entry_date:'2026-03-04',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m4',entry_date:'2026-03-05',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m5',entry_date:'2026-03-06',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m6',entry_date:'2026-03-09',client_id:'sol',project_id:'p1',activity_id:'a1',hours:4}];
  S.monthly_compensations=[];S.manual_entries=[];S.travel_expenses=[];
  S.trips=[];S.vehicles=[];S.billing_headers=[];
  S.tax_settings=[{id:'t1',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,
    substitute_tax_rate:5,inps_gs_rate:26.07,inps_recharge_rate:4,inps_recharge_enabled:true}];
`;
const apri=async(extra='')=>{
  const pg=await b.newPage({viewport:{width:390,height:1600},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};
const leggi=(pg,xml)=>pg.evaluate(x=>window.leggiFatturaXML(x),xml);
const confronta=(pg,xml)=>pg.evaluate(x=>{
  const f=window.leggiFatturaXML(x);
  const r=window.confrontaFattura(f);
  return {f,esiti:r.esiti,cliente:r.cliente?r.cliente.id:null,mesi:r.mesi};
},xml);

console.log('\n=== SI LEGGE TUTTO QUELLO CHE SERVE ===');
{
  const pg=await apri();
  const f=await leggi(pg,XML);
  ok(f.numero==='1/2026','il numero',String(f.numero));
  ok(f.data==='2026-04-08','la data',String(f.data));
  ok(f.clientePiva==='22222222222','la P.IVA del cliente',String(f.clientePiva));
  ok(f.righe.length===2,'le due righe',String(f.righe.length));
  ok(f.righe[0].mese==='2026-02'&&f.righe[1].mese==='2026-03',
     'e il mese che ognuna fattura, letto dalla descrizione',
     f.righe.map(r=>r.mese).join(' · '));
  ok(f.righe[0].giorni===1&&f.righe[1].giorni===5.5,
     'coi giorni: 1,0 e 5,5',f.righe.map(r=>r.giorni).join(' · '));
  ok(Math.abs(f.imponibile-2990)<0.005,'l’imponibile 2.990,00',String(f.imponibile));
  ok(Math.abs(f.rivalsaImporto-119.6)<0.005&&f.rivalsaAliquota===4,
     'la rivalsa 4% = 119,60',`${f.rivalsaAliquota}% ${f.rivalsaImporto}`);
  ok(f.bolloVirtuale&&Math.abs(f.bolloImporto-2)<0.005,'il bollo virtuale da 2,00');
  ok(Math.abs(f.totale-3109.6)<0.005,'e il totale 3.109,60',String(f.totale));
  ok(f.scadenza==='2026-05-31','la scadenza',String(f.scadenza));
  await pg.close();
}

console.log('\n=== QUANDO TUTTO TORNA, NON INVENTA SCOSTAMENTI ===');
{
  const pg=await apri();
  const r=await confronta(pg,XML);
  ok(r.cliente==='sol','il cliente si riconosce dalla P.IVA, senza sceglierlo');
  const gravi=r.esiti.filter(e=>e.liv!=='nota');
  ok(gravi.length===0,'e nessuno scostamento: il consuntivo concorda',
     gravi.map(e=>e.titolo).join(' · ')||'nessuno');
  ok(r.mesi.join(',')==='2026-02,2026-03','i mesi coperti sono due',r.mesi.join(','));
  ok(r.esiti.some(e=>/piu’ mesi/.test(e.titolo)),
     'e che siano due lo dice, invece di lasciarlo scoprire dopo');
  ok(r.esiti.some(e=>/Bollo a tuo carico/.test(e.titolo)),
     'così come dice che i 2 € di bollo li paghi tu');
  await pg.close();
}

console.log('\n=== SE HO LAVORATO MENO DI QUANTO HO FATTURATO, LO DICE ===');
{
  // E' l'incrocio che conta davvero: tolgo mezza giornata di marzo, e
  // la fattura resta ferma a 5,5.
  const pg=await apri(`S.timesheet_entries=S.timesheet_entries.filter(e=>e.id!=='m6');`);
  const r=await confronta(pg,XML);
  const g=r.esiti.find(e=>/Giorni diversi/.test(e.titolo));
  ok(!!g,'lo scostamento sui giorni compare',g?g.titolo:'nessuno');
  ok(!!g&&/5,50 gg/.test(g.dettaglio)&&/5,00 gg/.test(g.dettaglio),
     'con i due numeri a confronto: 5,50 fatturati contro 5,00 consuntivati',
     g?g.dettaglio.slice(0,90):'');
  ok(!!g&&/piu’ di quanto risulta lavorato/.test(g.dettaglio),
     'e dice da che parte pende');
  await pg.close();
}

console.log('\n=== E SE IL CLIENTE NON SI RICONOSCE, NON TIRA A INDOVINARE ===');
{
  const pg=await apri(`S.clients[0].vat_number='99999999999';`);
  const r=await confronta(pg,XML);
  ok(r.cliente===null,'nessun cliente abbinato');
  const b=r.esiti.find(e=>e.liv==='blocco');
  ok(!!b&&/Cliente non riconosciuto/.test(b.titolo),'e lo segnala come blocco',b?b.titolo:'nessuno');
  ok(!!b&&/22222222222/.test(b.dettaglio),'dicendo quale partita IVA cercava',b?b.dettaglio.slice(0,80):'');
  await pg.close();
}

console.log('\n=== UNA FATTURA CHE NON TORNA CON SE STESSA SI FERMA SUBITO ===');
{
  // Se il documento non quadra, confrontarlo col consuntivo non ha senso.
  const rotto=XML.replace('<ImportoTotaleDocumento>3109.60','<ImportoTotaleDocumento>9999.00');
  const pg=await apri();
  const r=await confronta(pg,rotto);
  const b=r.esiti.find(e=>e.liv==='blocco'&&/totale non torna/i.test(e.titolo));
  ok(!!b,'il totale che non torna è un blocco',b?b.titolo:'nessuno');
  ok(!!b&&/3\.109,60/.test(b.dettaglio),'e dice quanto avrebbe dovuto fare',b?b.dettaglio.slice(0,90):'');
  await pg.close();
}

console.log('\n=== UN FILE CHE NON È UNA FATTURA NON PASSA ===');
{
  const pg=await apri();
  const r=await confronta(pg,'<xml>niente</xml>');
  ok(r.esiti.length===1&&r.esiti[0].liv==='blocco','si ferma, con un solo blocco');
  ok(/FatturaElettronicaBody/.test(r.esiti[0].dettaglio),'dicendo cosa manca',r.esiti[0].dettaglio);
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== fattura caricata: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
