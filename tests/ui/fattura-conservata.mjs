// Le fatture caricate si conservano, con la loro natura IVA.
//
// Registrando una fattura l'app scriveva i suoi numeri sulle schede
// dei mesi, ma il file XML restava nel browser: chiusa la pagina, la
// fattura vera non c'era piu', e con lei la natura IVA (N2.2, N2.1...)
// che dice se il bollo ci va.
//
// Adesso registrandola se ne conserva anche il file. Finche' la tabella
// non c'e' — migrazione non lanciata — tutto funziona come prima, e lo
// si dice.
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

// Il consuntivo che corrisponde alla fattura: 1 giorno a febbraio e
// 5,5 a marzo, a 460 €/g. Con la rivalsa del 4% fanno 3.109,60 €.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Cliente Esempio',vat_number:'22222222222',
    daily_rate:460,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'p1',client_id:'sol',name:'Progetto',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.timesheet_entries=[
    {id:'f1',entry_date:'2026-02-10',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m1',entry_date:'2026-03-02',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m2',entry_date:'2026-03-03',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m3',entry_date:'2026-03-04',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m4',entry_date:'2026-03-05',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m5',entry_date:'2026-03-06',client_id:'sol',project_id:'p1',activity_id:'a1',hours:8},
    {id:'m6',entry_date:'2026-03-09',client_id:'sol',project_id:'p1',activity_id:'a1',hours:4}];
  S.user_profiles=[{id:'u1',user_id:'u1',first_name:'G',last_name:'B',vat_number:'11111111111'}];
  S.monthly_compensations=[];S.manual_entries=[];S.travel_expenses=[];
  S.trips=[];S.vehicles=[];S.billing_headers=[];S.expense_categories=[];
  S.tax_settings=[{id:'t1',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,
    substitute_tax_rate:5,inps_gs_rate:26.07,inps_recharge_rate:4,inps_recharge_enabled:true,
    stamp_duty_mode:'mine',stamp_duty_amount:2}];
`;
const apri=async(extra='')=>{
  const pg=await b.newPage({viewport:{width:390,height:2000},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  // app.js e' un modulo: una funzione dichiarata due volte non vince
  // l'ultima, e' un errore di sintassi e l'app non parte affatto. Lo si
  // dice per nome, invece di cadere al primo comando che non trova.
  if(!(await pg.evaluate(()=>typeof window.reload==='function'))){
    ok(false,'l’app si carica','app.js non è partito: errore di sintassi nel modulo?');
    await b.close();srv.close();process.exit(1);
  }
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.go('fatturaCarica'));
  await pg.waitForTimeout(500);
  return pg;
};
// Si carica il file come lo carica una persona: dal campo del modulo
const carica=async(pg,xml)=>{
  await pg.setInputFiles('#app input[type=file]',
    {name:'fattura.xml',mimeType:'text/xml',buffer:Buffer.from(xml)});
  await pg.waitForTimeout(900);
};
const documenti=pg=>pg.evaluate(()=>(window.__stores.invoice_documents||[]).map(d=>({...d})));
const schede=pg=>pg.evaluate(()=>(window.__stores.billing_headers||[]).map(h=>h.id+':'+h.month).sort().join(','));
const premi=async(pg,re)=>{
  const ok=await pg.evaluate(src=>{const re=new RegExp(src);
    const b=[...document.querySelectorAll('#app button')].find(x=>re.test(x.textContent.trim()));
    if(b)b.click();return !!b},re.source);
  await pg.waitForTimeout(1500);return ok;
};
const bottoni=pg=>pg.evaluate(()=>[...document.querySelectorAll('#app button')].map(b=>b.textContent.trim()));

console.log('\n=== REGISTRANDOLA, IL FILE SI CONSERVA ===');
{
  const pg=await apri();
  await carica(pg,XML);
  const t=await testo(pg);
  ok(/Si conserva anche il file XML, con la natura IVA \(N2\.2\)/.test(t),'prima di premere dice che conserverà il file, con la natura',
     (t.match(/Si conserva anche[^:]{0,60}/)||[''])[0]||'non lo dice');
  ok((await documenti(pg)).length===0,'ma finché non si preme non conserva niente');
  ok(await premi(pg,/^Registra su 2 mesi$/),'si preme «Registra su 2 mesi»');
  const d=await documenti(pg);
  ok(d.length===1,'il file è conservato, una volta',String(d.length));
  const x=d[0]||{};
  ok(x.invoice_number==='1/2026'&&x.invoice_date==='2026-04-08','col numero e la data della fattura',
     x.invoice_number+' · '+x.invoice_date);
  ok(JSON.stringify(x.months)==='["2026-02","2026-03"]','i mesi che copre',JSON.stringify(x.months));
  ok(JSON.stringify(x.natures)==='["N2.2"]','la natura IVA',JSON.stringify(x.natures));
  ok(Number(x.stamp_amount)===2,'il bollo dichiarato nel file',String(x.stamp_amount));
  ok(Math.abs(Number(x.stamp_base)-3109.6)<0.005,'e gli importi su cui si misura la soglia del bollo',String(x.stamp_base));
  ok(x.client_id==='sol','legato al cliente',x.client_id);
  ok(x.xml===XML,'e il file è quello caricato, identico',x.xml?x.xml.length+' caratteri':'vuoto');
  ok(x.file_name==='fattura.xml','col suo nome',x.file_name);
  ok(/Il file XML è conservato/.test(await testo(pg)),'e l’app lo dice');
  await pg.close();
}

console.log('\n=== NEL DETTAGLIO DELLA FATTURA SI RITROVA, E SI SCARICA ===');
{
  const pg=await apri();
  await carica(pg,XML);
  await premi(pg,/^Registra su 2 mesi$/);
  for(const mese of [2,3]){
    await pg.evaluate(m=>window.openInvoiceDetail('sol',2026,m),mese);
    await pg.waitForTimeout(700);
    const t=await testo(pg);
    ok(/Fattura conservata/.test(t)&&/1\/2026 del 08\/04\/2026/.test(t),
       'nel dettaglio di '+(mese===2?'febbraio':'marzo')+' c’è la fattura conservata',
       (t.match(/Fattura conservata[^·]{0,40}/)||[''])[0]||'non c’è');
  }
  const t=await testo(pg);
  ok(/Natura IVA N2\.2/.test(t),'con la sua natura IVA',(t.match(/Natura IVA[^·]{0,20}/)||[''])[0]);
  ok(/Febbraio 2026 e Marzo 2026/.test(t),'e i mesi che copre');
  const [scaricato]=await Promise.all([
    pg.waitForEvent('download',{timeout:5000}).catch(()=>null),
    premi(pg,/^Scarica l’XML$/)]);
  ok(!!scaricato,'«Scarica l’XML» scarica un file');
  if(scaricato){
    ok(scaricato.suggestedFilename()==='fattura.xml','col nome di quando è stato caricato',scaricato.suggestedFilename());
    const fs2=await import('node:fs');
    const pth=await scaricato.path();
    ok(fs2.readFileSync(pth,'utf8')===XML,'ed è la fattura, identica');
  }
  await pg.close();
}

console.log('\n=== RICARICARLA NON CONSERVA UNA SECONDA COPIA ===');
{
  const pg=await apri();
  await carica(pg,XML);
  await premi(pg,/^Registra su 2 mesi$/);
  await pg.evaluate(()=>window.go('fatturaCarica'));await pg.waitForTimeout(500);
  await carica(pg,XML);
  const t=await testo(pg);
  ok(/Già registrata/.test(t),'la riconosce come già registrata');
  const b=await bottoni(pg);
  ok(!b.some(x=>/^Registra su|^Conserva il file/.test(x)),'e non offre né di registrarla né di conservarla',b.filter(x=>/Registra|Conserva/.test(x)).join(' | ')||'nessun pulsante');
  ok((await documenti(pg)).length===1,'il file resta uno');
  await pg.close();
}

console.log('\n=== REGISTRATA PRIMA DELL’ARCHIVIO: SI CONSERVA SENZA RISCRIVERE ===');
{
  // Le schede ci sono gia', giuste: la fattura e' stata registrata con
  // la versione di prima. Manca solo il file.
  const pg=await apri(`S.billing_headers=[
    {id:'h2',client_id:'sol',year:2026,month:2,status:'invoice_issued',invoice_number:'1/2026',
     invoice_date:'2026-04-08',total_amount:460,inps_recharge_amount:18.4,stamp_duty_amount:0,invoice_total_amount:478.4},
    {id:'h3',client_id:'sol',year:2026,month:3,status:'invoice_issued',invoice_number:'1/2026',
     invoice_date:'2026-04-08',total_amount:2530,inps_recharge_amount:101.2,stamp_duty_amount:0,invoice_total_amount:2631.2}];`);
  await carica(pg,XML);
  const t=await testo(pg);
  ok(/il file non è ancora conservato/.test(t),'dice che è registrata ma il file manca',
     (t.match(/Le schede di questi mesi[^.]{0,90}/)||[''])[0]);
  ok(await premi(pg,/^Conserva il file XML$/),'e offre «Conserva il file XML»');
  ok((await documenti(pg)).length===1,'premendolo, il file si conserva');
  ok(await schede(pg)==='h2:2,h3:3','e le schede restano quelle: nessuna riscritta, nessuna nuova',await schede(pg));
  const ins=await pg.evaluate(()=>(window.__ins||[]).filter(x=>x.__table==='billing_headers').length);
  ok(ins===0,'nessun inserimento sulle schede',String(ins));
  await pg.close();
}

console.log('\n=== SENZA LA MIGRAZIONE, LA REGISTRAZIONE FUNZIONA COME PRIMA ===');
{
  const pg=await apri(`window.__tabelleMancanti=['invoice_documents'];`);
  const avvisi=await testo(pg);
  ok(!/invoice_documents/.test(avvisi)&&!/Errore caricamento/.test(avvisi),
     'aprendo l’app nessun avviso per la tabella che manca',(avvisi.match(/Errore caricamento[^.]{0,60}/)||[''])[0]||'nessuno');
  await carica(pg,XML);
  const t=await testo(pg);
  ok(/Il file XML per ora non si conserva/.test(t)&&/2026-10-09_fatture-conservate\.sql/.test(t),
     'dice che il file non si conserva, e quale migrazione lanciare',(t.match(/Il file XML per ora[^.]{0,80}/)||[''])[0]);
  ok(await premi(pg,/^Registra su 2 mesi$/),'si registra lo stesso');
  ok(await schede(pg)!=='','le schede ci sono',await schede(pg));
  const t2=await testo(pg);
  ok(/registrata su Febbraio 2026 e Marzo 2026/.test(t2)&&!/non si è conservato/.test(t2),
     'e non segnala un errore che non c’è',(t2.match(/Fattura 1\/2026[^.]{0,120}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== SE IL FILE NON SI CONSERVA, LA FATTURA RESTA REGISTRATA E LO DICE ===');
{
  const pg=await apri();
  await carica(pg,XML);
  await pg.evaluate(()=>{window.__rifiutaRiga=(t)=>t==='invoice_documents'});
  await premi(pg,/^Registra su 2 mesi$/);
  ok(await schede(pg)!=='','le schede sono scritte',await schede(pg));
  const t=await testo(pg);
  ok(/non si è conservato/.test(t)&&/Conserva il file XML/.test(t),'e dice che il file no, e come rimediare',
     (t.match(/Il file però[^.]{0,80}/)||[''])[0]||'non lo dice');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== fattura conservata: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
