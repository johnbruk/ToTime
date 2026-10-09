// «Come faccio a cancellare fatture?»
//
// Non si poteva: l'app sapeva creare una fattura e modificarla, e
// basta. Un numero sbagliato — due righe con lo stesso #6/2026 — o una
// fattura nata per errore restavano li' per sempre.
//
// Adesso si elimina, dal dettaglio e dall'elenco. Tranne una
// INCASSATA: quella prima va riportata a «Da fatturare». Togliere un
// incasso dai conti dell'anno deve restare un gesto fatto apposta, non
// l'effetto collaterale di un gesto solo.
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

// Il caso segnalato: due fatture con lo stesso numero, e una incassata.
// Sotto la emessa ci sono righe e ripartizioni per commessa: servono a
// vedere che se ne vanno con lei.
const SEMI=`
  const S=window.__stores;
  S.billing_headers=[
    {id:'h1',client_id:'c1',year:2026,month:9,status:'invoice_issued',invoice_number:'6/2026',invoice_date:'2026-09-04',invoice_total_amount:4784},
    {id:'h2',client_id:'c1',year:2026,month:8,status:'invoice_issued',invoice_number:'6/2026',invoice_date:'2026-10-04',invoice_total_amount:956.8},
    {id:'h3',client_id:'c1',year:2026,month:7,status:'collected',invoice_number:'5/2026',invoice_date:'2026-07-31',collected_amount:3348.8,invoice_total_amount:3348.8}];
  S.billing_lines=[
    {id:'l1',billing_header_id:'h2',client_id:'c1',amount:956.8,description:'Agosto'},
    {id:'l2',billing_header_id:'h1',client_id:'c1',amount:4784,description:'Settembre'}];
  S.invoice_line_allocations=[
    {id:'r1',billing_line_id:'l1',amount:956.8},
    {id:'r2',billing_line_id:'l2',amount:4784}];
  S.timesheet_entries=[
    {id:'v1',entry_date:'2026-08-10',client_id:'c1',project_id:'p1',hours:8,daily_rate_snapshot:480,standard_hours_snapshot:8},
    {id:'v2',entry_date:'2026-07-10',client_id:'c1',project_id:'p1',hours:8,daily_rate_snapshot:480,standard_hours_snapshot:8}];
`;
const apri=async(dove='lista')=>{
  const pg=await b.newPage({viewport:{width:390,height:1600},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  if(dove==='lista'){await pg.evaluate(()=>window.openAnnualInvoices('issued'));await pg.waitForTimeout(600)}
  return pg;
};
const conta=pg=>pg.evaluate(()=>({
  teste:(window.__stores.billing_headers||[]).map(h=>h.id).join(','),
  righe:(window.__stores.billing_lines||[]).map(l=>l.id).join(','),
  rip:(window.__stores.invoice_line_allocations||[]).map(a=>a.id).join(','),
  ore:(window.__stores.timesheet_entries||[]).length}));

console.log('\n=== NELL’ELENCO SI PUÒ ELIMINARE, TRANNE L’INCASSATA ===');
{
  const pg=await apri();
  const righe=await pg.evaluate(()=>[...document.querySelectorAll('#app .rowFattura')].map(r=>({
    numero:r.querySelector('.fatNum')?.textContent.trim(),
    stato:r.querySelector('.fatCli .tag')?.textContent.trim(),
    elimina:!!r.querySelector('.fatDel')})));
  ok(righe.length===3,'in elenco ci sono le tre fatture',righe.map(r=>r.numero).join(' | '));
  const emesse=righe.filter(r=>r.stato==='Fattura emessa');
  ok(emesse.length===2&&emesse.every(r=>r.elimina),
     'le emesse hanno il pulsante per eliminarle',JSON.stringify(emesse));
  const incassata=righe.find(r=>r.stato==='Incassato');
  ok(incassata&&!incassata.elimina,
     'l’incassata no: lì la risposta sarebbe sempre no',JSON.stringify(incassata));
  await pg.close();
}

console.log('\n=== ELIMINANDO, SPARISCE LEI E QUELLO CHE LE STA SOTTO ===');
{
  const pg=await apri();
  const prima=await conta(pg);
  ok(prima.teste==='h1,h2,h3'&&prima.righe==='l1,l2','si parte con tre fatture e due righe',
     `${prima.teste} · ${prima.righe}`);
  // si elimina quella di agosto, la #6/2026 col numero doppione
  await pg.evaluate(()=>{
    const r=[...document.querySelectorAll('#app .rowFattura')]
      .find(x=>/08\/2026/.test(x.querySelector('.fatMese')?.textContent||''));
    r.querySelector('.fatDel').click();
  });
  await pg.waitForTimeout(1300);
  const dopo=await conta(pg);
  ok(dopo.teste==='h1,h3','la fattura di agosto non c’è più',dopo.teste);
  ok(dopo.righe==='l2','e con lei se ne sono andate le sue righe',dopo.righe||'nessuna');
  ok(dopo.rip==='r2','e la ripartizione per commessa',dopo.rip||'nessuna');
  ok(dopo.ore===prima.ore,'ma le ore restano dove sono: il lavoro non si tocca',
     `${prima.ore} prima · ${dopo.ore} dopo`);
  const t=await testo(pg);
  ok(/eliminata/.test(t),'e l’app lo dice',(t.match(/Fattura[^.]{0,70}eliminata[^.]{0,40}/)||[''])[0]);
  ok(/torna da fatturare/.test(t),'dicendo anche che il mese torna da fatturare');
  const rimaste=await pg.evaluate(()=>[...document.querySelectorAll('#app .rowFattura')]
    .map(r=>r.querySelector('.fatMese')?.textContent.trim()).join(' | '));
  ok(!/08\/2026/.test(rimaste),'e la riga sparisce dall’elenco',rimaste);
  await pg.close();
}

console.log('\n=== UNA FATTURA INCASSATA NON SI ELIMINA COSÌ ===');
{
  const pg=await apri('dettaglio');
  await pg.evaluate(()=>window.openInvoiceDetail('c1',2026,7));
  await pg.waitForTimeout(700);
  const bott=await pg.evaluate(()=>{
    const b=[...document.querySelectorAll('#app button')].find(x=>/Elimina fattura/.test(x.textContent));
    return b?b.textContent.trim():'';
  });
  ok(bott==='Elimina fattura','il pulsante c’è anche sull’incassata: è qui che si cambia stato',bott||'assente');
  await pg.evaluate(()=>{
    [...document.querySelectorAll('#app button')].find(x=>/Elimina fattura/.test(x.textContent)).click();
  });
  await pg.waitForTimeout(1200);
  const dopo=await conta(pg);
  ok(dopo.teste==='h1,h2,h3','non viene eliminata',dopo.teste);
  const t=await testo(pg);
  ok(/risulta incassata/.test(t),'e lo dice, invece di eliminarla in silenzio',
     (t.match(/La fattura[^.]{0,120}/)||[''])[0]);
  ok(/Da fatturare/.test(t),'spiegando cosa fare prima: rimetterla su «Da fatturare»',
     (t.match(/Aprila[^.]{0,90}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== DAL DETTAGLIO DI UNA EMESSA, SI ELIMINA ===');
{
  const pg=await apri('dettaglio');
  await pg.evaluate(()=>window.openInvoiceDetail('c1',2026,8));
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>{
    const b=[...document.querySelectorAll('#app button')].find(x=>/Elimina fattura/.test(x.textContent));
    if(b)b.click();
  });
  await pg.waitForTimeout(1300);
  const dopo=await conta(pg);
  ok(dopo.teste==='h1,h3','la fattura è eliminata anche da qui',dopo.teste);
  ok(dopo.righe==='l2','con le sue righe',dopo.righe||'nessuna');
  ok(dopo.ore===2,'e le ore restano tutte',String(dopo.ore));
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== fattura eliminata: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
