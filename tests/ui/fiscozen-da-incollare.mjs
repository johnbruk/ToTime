// Quello che si incolla su Fiscozen, e quello che non ci va.
//
// Il modulo «Aggiungi prestazione» di Fiscozen chiede tre cose —
// Descrizione, IMPORTO e QUANTITA' — e una spunta, «Applica contributo
// GS INPS 4%». L'app dava la descrizione e il TOTALE della riga: i due
// fattori si ricavavano a mente, avendoli entrambi in casa.
//
// Peggio: metteva la rivalsa INPS e la marca da bollo nello stesso
// elenco, ognuna col suo «Copia descrizione». La rivalsa la calcola
// Fiscozen con la spunta, quindi incollandola anche come voce si
// contava DUE VOLTE; e il bollo non e' una prestazione, non si aggiunge
// fra le voci affatto.
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
const num=v=>Number(String(v).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'));

// Nove giorni e mezzo a 600 €: 5.700 € di base, 228 € di rivalsa.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'Cliente Estero',code:'EST',daily_rate:600,standard_hours:8,
    compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'p1',client_id:'k2',name:'Omnichannel',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.timesheet_entries=[1,2,3,4,5,6,7,8,9].map(d=>({id:'v'+d,entry_date:'${M}-0'+d,
    client_id:'k2',project_id:'p1',activity_id:'a1',hours:8,
    daily_rate_snapshot:600,standard_hours_snapshot:8}));
  S.timesheet_entries.push({id:'vh',entry_date:'${M}-10',client_id:'k2',project_id:'p1',
    activity_id:'a1',hours:4,daily_rate_snapshot:600,standard_hours_snapshot:8});
  S.manual_entries=[];S.monthly_compensations=[];S.travel_expenses=[];S.trips=[];
  S.billing_headers=[];S.expense_categories=[];S.billing_lines=[];S.invoice_line_allocations=[];
`;
const apri=async(extra='',modo='mine',rivalsa=4)=>{
  const pg=await b.newPage({viewport:{width:390,height:2000},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(({m,anno,riv})=>{
    window.__stores.tax_settings=[{id:'t1',fiscal_year:anno,regime:'forfettario',
      profitability_coefficient:78,substitute_tax_rate:5,inps_gs_rate:26.07,
      inps_recharge_enabled:true,inps_recharge_rate:riv,
      stamp_duty_mode:m,stamp_duty_amount:2}];
  },{m:modo,anno:ANNO,riv:rivalsa});
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.openBillingClient('k2'));
  await pg.waitForTimeout(900);
  return pg;
};
// I campi di una prestazione, letti come li legge una persona
const campi=pg=>pg.evaluate(()=>[...document.querySelectorAll('#app .fzCampi')].map(c=>{
  const v=[...c.children].map(d=>({
    etichetta:(d.querySelector('span')?.textContent||'').trim(),
    valore:(d.querySelector('b')?.textContent||d.querySelector('.copybox')?.textContent||'').trim()}));
  return Object.fromEntries(v.map(x=>[x.etichetta,x.valore]));
}));

console.log('\n=== I CAMPI SONO QUELLI CHE FISCOZEN CHIEDE ===');
{
  const pg=await apri();
  const c=await campi(pg);
  ok(c.length===1,'c’è una prestazione',String(c.length));
  ok(!!c[0]&&'Descrizione' in c[0]&&'Importo' in c[0]&&'Quantità' in c[0],
     'coi tre campi del modulo «Aggiungi prestazione»',Object.keys(c[0]||{}).join(' | '));
  const imp=num(c[0].Importo), qta=num(c[0]['Quantità']);
  ok(imp===600,'Importo è la tariffa giornaliera, non il totale',String(imp));
  ok(qta===9.5,'Quantità sono le giornate',String(qta));
  ok(Math.abs(imp*qta-5700)<0.005,'e i due fattori danno la base: 600 × 9,5 = 5.700',
     `${imp} × ${qta} = ${imp*qta}`);
  const t=await testo(pg);
  ok(/Base 5\.700,00 €/.test(t),'che è la base scritta in testa',
     (t.match(/Base [^·]{0,20}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== LA RIVALSA NON SI INCOLLA: LA FA FISCOZEN ===');
{
  const pg=await apri();
  const dove=await pg.evaluate(()=>{
    const h=[...document.querySelectorAll('#app h2')].map(x=>x.textContent.trim());
    const righe=[...document.querySelectorAll('#app .list .row')].map(r=>({
      titolo:(r.querySelector('.title')?.textContent||'').trim(),
      copia:!!r.querySelector('button')}));
    return {h,righe};
  });
  ok(dove.h.includes('Da incollare su Fiscozen'),'c’è il blocco di quello che si incolla',dove.h.join(' | '));
  ok(dove.h.includes('Questo non si incolla'),'e quello di quello che non ci va',dove.h.join(' | '));
  const riv=dove.righe.find(r=>/Rivalsa INPS/.test(r.titolo));
  ok(!!riv,'la rivalsa si vede',riv?riv.titolo:'non si vede');
  ok(!!riv&&riv.copia===false,'ma senza «Copia descrizione»: incollarla la conterebbe due volte',
     riv&&riv.copia?'ha ancora il pulsante':'nessun pulsante, giusto');
  const t=await testo(pg);
  ok(/spunta «Applica contributo GS INPS/.test(t),'e dice dov’è la spunta su Fiscozen',
     (t.match(/La calcola Fiscozen[^.]{0,80}/)||[''])[0]);
  ok(/due volte/.test(t),'dicendo anche perché non va incollata');
  await pg.close();
}

console.log('\n=== IL BOLLO NON È UNA PRESTAZIONE ===');
{
  const pg=await apri();
  const bollo=await pg.evaluate(()=>{
    const r=[...document.querySelectorAll('#app .list .row')]
      .find(x=>/Marca da bollo/.test(x.querySelector('.title')?.textContent||''));
    if(!r)return null;
    return {testo:r.innerText.replace(/\s+/g,' '),copia:!!r.querySelector('button'),
      dentro:!!r.closest('.list')};
  });
  ok(!!bollo,'il bollo si vede',bollo?'sì':'no');
  ok(!!bollo&&bollo.copia===false,'senza «Copia descrizione»',
     bollo&&bollo.copia?'ha ancora il pulsante':'nessun pulsante, giusto');
  ok(!!bollo&&/non si aggiunge fra le voci/.test(bollo.testo),
     'e lo dice: non è una prestazione',bollo?bollo.testo.slice(0,110):'');
  ok(!!bollo&&/a tuo carico/.test(bollo.testo),'ed è a tuo carico',bollo?bollo.testo.slice(0,80):'');
  const t=await testo(pg);
  ok(!/Bollo 0,00/.test(t),'e il riepilogo non dice «Bollo 0,00 €», che non vuol dire niente',
     (t.match(/Bollo [^·]{0,12}/)||[''])[0]||'non lo dice');
  await pg.close();
}

console.log('\n=== CON TARIFFE DIVERSE NEL MESE, UN PREZZO UNITARIO NON ESISTE ===');
{
  // Una media moltiplicata per la quantità non tornerebbe col totale:
  // meglio una quantità sola e l'importo pieno, dicendo perché.
  const pg=await apri(`
    S.timesheet_entries.push({id:'vx',entry_date:'${M}-11',client_id:'k2',project_id:'p1',
      activity_id:'a1',hours:8,daily_rate_snapshot:450,standard_hours_snapshot:8});`);
  const c=await campi(pg);
  const imp=num(c[0].Importo), qta=num(c[0]['Quantità']);
  ok(qta===1,'la quantità è 1',String(qta));
  ok(Math.abs(imp-6150)<0.005,'e l’importo è quello pieno: 5.700 + 450',String(imp));
  const t=await testo(pg);
  ok(/Tariffe diverse nel mese/.test(t),'dicendo perché',
     (t.match(/Tariffe diverse[^.]{0,60}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== SOTTO SOGLIA IL BOLLO NON È DOVUTO, E LO DICE ===');
{
  const pg=await apri(`
    S.timesheet_entries=[{id:'v1',entry_date:'${M}-03',client_id:'k2',project_id:'p1',
      activity_id:'a1',hours:1,daily_rate_snapshot:480,standard_hours_snapshot:8}];`);
  const t=await testo(pg);
  ok(/Qui non è dovuta/.test(t),'la riga del bollo dice che qui non è dovuta',
     (t.match(/Qui non è dovuta/)||[''])[0]||'non lo dice');
  ok(/non superano 77,47 €/.test(t),'citando la soglia',
     (t.match(/Gli importi esenti[^.]{0,60}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== QUANTITÀ E IMPORTO, TRASCRITTI COME SI LEGGONO, DANNO LA BASE ===');
{
  // Un'ora su otto e' 0,125 giornate. A schermo, con due decimali,
  // diventava 0,13: trascritta su Fiscozen a 480 €/g faceva 62,40 €
  // invece di 60. Due fattori che non ridanno l'importo non si danno.
  const pg=await apri(`
    S.timesheet_entries=[{id:'v1',entry_date:'${M}-03',client_id:'k2',project_id:'p1',
      activity_id:'a1',hours:1,daily_rate_snapshot:480,standard_hours_snapshot:8}];`);
  const c=await campi(pg);
  const imp=num(c[0].Importo), qta=num(c[0]['Quantità']);
  ok(Math.abs(imp*qta-60)<0.005,'quel che si legge, moltiplicato, fa 60 €',`${imp} × ${qta} = ${imp*qta}`);
  ok(qta===1&&imp===60,'quantità 1 e l’importo pieno',`${imp} × ${qta}`);
  const t=await testo(pg);
  ok(/non stanno in due decimali/.test(t),'dicendo perché',
     (t.match(/Le giornate non[^.]{0,50}/)||[''])[0]||'non lo dice');
  await pg.close();
}
{
  // Dove la riga non ha salvato tariffa e giornata valgono quelle del
  // cliente, come per l'importo. Con 8 ore fisse, un cliente da 7,5
  // ore dava 1,875 giornate su 15 ore, e la base non tornava.
  const pg=await apri(`
    S.clients[0].standard_hours=7.5;
    S.timesheet_entries=['03','04'].map(d=>({id:'v'+d,entry_date:'${M}-'+d,client_id:'k2',
      project_id:'p1',activity_id:'a1',hours:7.5}));`);
  const c=await campi(pg);
  const imp=num(c[0].Importo), qta=num(c[0]['Quantità']);
  ok(imp===600&&qta===2,'senza snapshot: la tariffa e la giornata del cliente, 600 × 2',`${imp} × ${qta}`);
  const t=await testo(pg);
  ok(/Base 1\.200,00 €/.test(t),'che è la base scritta in testa',(t.match(/Base [^·]{0,20}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== LA SPUNTA DI FISCOZEN È AL 4% ===');
{
  // Con un'altra aliquota configurata, dire «spunta la casella» faceva
  // emettere una fattura col 4% mentre l'app contava il 2%.
  const pg=await apri('','mine',2);
  const t=await testo(pg);
  ok(!/La calcola Fiscozen/.test(t),'non dice di affidarsi alla spunta',
     (t.match(/La calcola Fiscozen[^.]{0,40}/)||[''])[0]||'non lo dice, giusto');
  ok(/applica il 4%/.test(t)&&/del 2,00%/.test(t),'dice che la spunta applica il 4% e qui c’è il 2%',
     (t.match(/Attenzione[^.]{0,160}/)||[''])[0]);
  ok(/Configurazione fiscale/.test(t),'e dove si corregge');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== fiscozen da incollare: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
