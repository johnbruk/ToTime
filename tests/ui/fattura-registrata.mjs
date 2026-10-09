// La fattura controllata si registra sui mesi che copre.
//
// Caricare l'XML diceva DOVE l'app non tornava, e poi si fermava: «non
// viene salvato niente». Numero, data, importi andavano riscritti a mano
// mese per mese — e una fattura su due mesi voleva dire due schede da
// compilare, rifacendo a mente la divisione.
//
// Ma sono proprio quelle schede che leggono il bilancio e la stima delle
// imposte. Registrare la fattura e' quindi il gesto che fa seguire ai
// conti la fattura VERA invece della proposta dell'app.
//
// La fixture e' una fattura vera su due mesi — febbraio e marzo 2026 —
// con gli identificativi sostituiti e gli importi originali.
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
const schede=pg=>pg.evaluate(()=>(window.__stores.billing_headers||[])
  .map(h=>({...h})).sort((a,b)=>a.month-b.month));
// L'anno degli elenchi e delle tasse e' quello del mese che l'app ha
// davanti: lo si porta sul 2026, cosi' il test non scade a gennaio.
const sul2026=async pg=>{await pg.evaluate(()=>window.openInvoiceDetail('sol',2026,3));await pg.waitForTimeout(500)};
const elenco=async pg=>{await sul2026(pg);await pg.evaluate(()=>window.openAnnualInvoices('issued'));await pg.waitForTimeout(800)};
const bolloDovuto=async pg=>{await sul2026(pg);await pg.evaluate(()=>window.go('tasseFuture'));await pg.waitForTimeout(900);
  const t=await testo(pg);const m=t.match(/Imposta di bollo 2026 Dovuta ([\d.,]+) €/);return m?m[1]:'nessuno'};
const bottone=pg=>pg.evaluate(()=>{
  const b=[...document.querySelectorAll('#app button')].find(x=>/^Registra su/.test(x.textContent.trim()));
  return b?b.textContent.trim():'';
});

console.log('\n=== UNA FATTURA SU DUE MESI SI DIVIDE IN DUE SCHEDE ===');
{
  const pg=await apri();
  await carica(pg,XML);
  const t=await testo(pg);
  ok(/Registra la fattura/.test(t),'dopo il controllo c’è il modo di registrarla');
  ok(/Febbraio 2026/.test(t)&&/Marzo 2026/.test(t),'mese per mese: febbraio e marzo',
     (t.match(/Registra la fattura[\s\S]{0,40}/)||[''])[0]);
  ok(/478,40 €/.test(t),'febbraio: 460 di imponibile + 18,40 di rivalsa = 478,40',
     (t.match(/Febbraio 2026[^€]{0,80}€[^€]{0,40}€[^€]{0,30}/)||[''])[0]);
  ok(/2\.631,20 €/.test(t),'marzo: 2.530 + 101,20 = 2.631,20',
     (t.match(/Marzo 2026[^€]{0,80}€[^€]{0,40}€[^€]{0,30}/)||[''])[0]);
  ok(await bottone(pg)==='Registra su 2 mesi','e il pulsante dice su quanti mesi',await bottone(pg)||'nessun pulsante');
  ok((await schede(pg)).length===0,'ma prima di premerlo non si è scritto niente');
  await pg.close();
}

console.log('\n=== REGISTRANDOLA, I CONTI SEGUONO LA FATTURA ===');
{
  const pg=await apri();
  await carica(pg,XML);
  await pg.evaluate(()=>[...document.querySelectorAll('#app button')]
    .find(x=>/^Registra su/.test(x.textContent.trim())).click());
  await pg.waitForTimeout(1500);
  const h=await schede(pg);
  ok(h.length===2,'nascono due schede, una per mese',h.map(x=>x.month).join(', '));
  ok(h.every(x=>x.invoice_number==='1/2026'),'tutte e due col numero della fattura',
     h.map(x=>x.invoice_number).join(' · '));
  ok(h.every(x=>x.invoice_date==='2026-04-08'),'e con la sua data',h.map(x=>x.invoice_date).join(' · '));
  ok(h.every(x=>x.status==='invoice_issued'),'segnate come fattura emessa',h.map(x=>x.status).join(' · '));
  ok(Number(h[0].invoice_total_amount)===478.4&&Number(h[1].invoice_total_amount)===2631.2,
     'con gli importi del mese',h.map(x=>x.invoice_total_amount).join(' · '));
  ok(Number(h[0].total_amount)===460&&Number(h[1].total_amount)===2530,
     'imponibile separato dalla rivalsa',h.map(x=>x.total_amount).join(' · '));
  const somma=h.reduce((a,x)=>a+Number(x.invoice_total_amount),0);
  ok(Math.abs(somma-3109.6)<0.005,'e la somma è il totale della fattura, al centesimo',somma.toFixed(2));
  ok(h.every(x=>Number(x.stamp_duty_amount||0)===0),
     'il bollo che paghi tu non risulta addebitato',h.map(x=>x.stamp_duty_amount).join(' · '));
  // e il resto dell'app lo vede: e' il punto di tutto
  await elenco(pg);
  const t=await testo(pg);
  ok(/3\.109,60 €/.test(t),'le Fatture emesse dell’anno contano 3.109,60 €',
     (t.match(/Totale fatturato[^€]{0,30}€/)||[''])[0]);
  // L'elenco legge il numero con una sua funzione, che si chiama come
  // quella che qui servirebbe a confrontare i numeri: una seconda
  // dichiarazione con lo stesso nome la sostituiva, e ogni fattura
  // dell'elenco diventava «senza numero».
  const numeri=await pg.evaluate(()=>[...document.querySelectorAll('#app .rowFattura .fatNum')]
    .map(x=>x.textContent.trim()));
  ok(numeri.length===2&&numeri.every(n=>n==='1/2026'),
     'e in elenco ogni mese porta il numero della fattura',numeri.join(' | ')||'nessuna riga');
  await pg.close();
}

console.log('\n=== RIPETERLA NON DUPLICA ===');
// Le schede come le scrive la registrazione: numero, data e ogni importo.
const REGISTRATA=`S.billing_headers=[
    {id:'h2',client_id:'sol',year:2026,month:2,status:'invoice_issued',invoice_number:'1/2026',
     invoice_date:'2026-04-08',total_amount:460,inps_recharge_amount:18.4,stamp_duty_amount:0,invoice_total_amount:478.4},
    {id:'h3',client_id:'sol',year:2026,month:3,status:'invoice_issued',invoice_number:'1/2026',
     invoice_date:'2026-04-08',total_amount:2530,inps_recharge_amount:101.2,stamp_duty_amount:0,invoice_total_amount:2631.2}];`;
{
  const pg=await apri(REGISTRATA);
  await carica(pg,XML);
  const t=await testo(pg);
  ok(/Già registrata/.test(t),'la riconosce come già registrata',
     (t.match(/Già registrata[^.]{0,60}/)||[''])[0]||'non la riconosce');
  ok(await bottone(pg)==='','e non offre di registrarla di nuovo',await bottone(pg)||'nessun pulsante, giusto');
  await pg.close();
}

console.log('\n=== UN MESE GIÀ FATTURATO CON UN ALTRO NUMERO NON SI SOVRASCRIVE ===');
{
  const pg=await apri(`S.billing_headers=[
    {id:'hx',client_id:'sol',year:2026,month:2,status:'invoice_issued',invoice_number:'#9/2026',
     total_amount:460,invoice_total_amount:478.4}];`);
  await carica(pg,XML);
  const t=await testo(pg);
  ok(/non si registra/.test(t),'non si registra',(t.match(/Questa fattura non si registra[^.]{0,20}/)||[''])[0]);
  ok(/Febbraio 2026 risulta già fatturato con la #9\/2026/.test(t),'e dice quale mese, con quale fattura',
     (t.match(/Febbraio 2026 risulta[^.]{0,50}/)||[''])[0]);
  ok(/eliminala prima/.test(t),'e cosa fare',(t.match(/Se quella[^.]{0,60}/)||[''])[0]);
  const h=await schede(pg);
  ok(h.length===1&&h[0].invoice_number==='#9/2026','e la scheda vecchia resta com’era',h.map(x=>x.invoice_number).join(' · '));
  await pg.close();
}

console.log('\n=== LO STESSO NUMERO SCRITTO IN UN ALTRO MODO È LA STESSA FATTURA ===');
{
  // «Fattura #1/2026» scritto a mano, «1/2026» nell'XML: sono uguali.
  const pg=await apri(`S.billing_headers=[
    {id:'hy',client_id:'sol',year:2026,month:2,status:'invoice_issued',invoice_number:'Fattura #1/2026',
     total_amount:400,invoice_total_amount:416}];`);
  await carica(pg,XML);
  ok(await bottone(pg)==='Registra su 2 mesi','si registra: è la stessa fattura',await bottone(pg)||'rifiutata');
  const t=await testo(pg);
  ok(/Già registrata: si aggiorna/.test(t),'e la scheda di febbraio si aggiorna',
     (t.match(/Già registrata: si aggiorna/)||[''])[0]||'non lo dice');
  await pg.close();
}

console.log('\n=== UN MESE INCASSATO RESTA INCASSATO ===');
{
  const pg=await apri(`S.billing_headers=[
    {id:'hc',client_id:'sol',year:2026,month:2,status:'collected',invoice_number:'1/2026',
     total_amount:460,invoice_total_amount:470,collected_amount:478.4}];`);
  await carica(pg,XML);
  await pg.evaluate(()=>[...document.querySelectorAll('#app button')]
    .find(x=>/^Registra su/.test(x.textContent.trim())).click());
  await pg.waitForTimeout(1500);
  const h=await schede(pg);
  const feb=h.find(x=>x.month===2)||{};
  ok(feb.status==='collected','febbraio resta incassato: registrare non fa tornare indietro un incasso',feb.status);
  ok(Number(feb.collected_amount)===478.4,'con il suo importo incassato',String(feb.collected_amount));
  ok(Number(feb.invoice_total_amount)===478.4,'e l’importo corretto da quello della fattura',String(feb.invoice_total_amount));
  await pg.close();
}

console.log('\n=== UNA RIGA SENZA MESE: NON SI SA DOVE METTERLA ===');
{
  const senzaMese=XML.replace('Febbraio 2026','');
  const pg=await apri();
  await carica(pg,senzaMese);
  const t=await testo(pg);
  ok(/non si registra/.test(t),'non si registra',(t.match(/Questa fattura non si registra/)||[''])[0]||'si registra');
  ok(/non dice a che mese/.test(t),'e dice perché',(t.match(/Una riga non dice[^.]{0,60}/)||[''])[0]);
  ok(await bottone(pg)==='','nessun pulsante');
  await pg.close();
}

console.log('\n=== IL BOLLO È UNO PER FATTURA, ANCHE SE I MESI SONO DUE ===');
{
  // Una fattura, un bollo. Divisa su due schede, il conteggio di quello
  // da versare all'Agenzia ne contava due.
  const pg=await apri();
  await carica(pg,XML);
  await pg.evaluate(()=>[...document.querySelectorAll('#app button')]
    .find(x=>/^Registra su/.test(x.textContent.trim())).click());
  await pg.waitForTimeout(1500);
  const d=await bolloDovuto(pg);
  ok(d==='2,00','registrata su due mesi, il bollo dovuto è uno: 2,00 €',d);
  await pg.close();
}
{
  // E la soglia si misura sul documento: due mesi da 52 € fanno una
  // fattura da 104, sopra i 77,47.
  const pg=await apri(`S.billing_headers=[
    {id:'h2',client_id:'sol',year:2026,month:2,status:'invoice_issued',invoice_number:'7/2026',
     invoice_date:'2026-04-08',total_amount:50,invoice_total_amount:52},
    {id:'h3',client_id:'sol',year:2026,month:3,status:'invoice_issued',invoice_number:'7/2026',
     invoice_date:'2026-04-08',total_amount:50,invoice_total_amount:52}];`);
  const d=await bolloDovuto(pg);
  ok(d==='2,00','due mesi sotto soglia, una fattura sopra: il bollo è dovuto',d);
  await pg.close();
}
{
  // Ma lo stesso numero con due date diverse non è una fattura sola:
  // è un doppione, e lì il raggruppamento non deve nascondere niente.
  const pg=await apri(`S.billing_headers=[
    {id:'h2',client_id:'sol',year:2026,month:2,status:'invoice_issued',invoice_number:'7/2026',
     invoice_date:'2026-03-04',total_amount:460,invoice_total_amount:478.4},
    {id:'h3',client_id:'sol',year:2026,month:3,status:'invoice_issued',invoice_number:'7/2026',
     invoice_date:'2026-04-08',total_amount:2530,invoice_total_amount:2631.2}];`);
  const d=await bolloDovuto(pg);
  ok(d==='4,00','stesso numero e date diverse: due documenti, due bolli',d);
  await pg.close();
}

console.log('\n=== ELIMINANDOLA, SE NE VA TUTTA E NON METÀ ===');
const DUE_MESI=`S.billing_headers=[
    {id:'h2',client_id:'sol',year:2026,month:2,status:'invoice_issued',invoice_number:'1/2026',
     invoice_date:'2026-04-08',total_amount:460,invoice_total_amount:478.4},
    {id:'h3',client_id:'sol',year:2026,month:3,status:'invoice_issued',invoice_number:'1/2026',
     invoice_date:'2026-04-08',total_amount:2530,invoice_total_amount:2631.2},
    {id:'h4',client_id:'sol',year:2026,month:4,status:'invoice_issued',invoice_number:'2/2026',
     invoice_date:'2026-05-04',total_amount:920,invoice_total_amount:956.8}];`;
const eliminaFebbraio=async pg=>{
  await elenco(pg);
  await pg.evaluate(()=>{
    const r=[...document.querySelectorAll('#app .rowFattura')]
      .find(x=>/02\/2026/.test(x.querySelector('.fatMese')?.textContent||''));
    r.querySelector('.fatDel').click();
  });
  await pg.waitForTimeout(1500);
};
{
  const pg=await apri(DUE_MESI);
  await eliminaFebbraio(pg);
  const h=await schede(pg);
  ok(h.map(x=>x.id).join(',')==='h4','eliminando febbraio se ne va anche marzo: è la stessa fattura',
     h.map(x=>x.id).join(',')||'nessuna');
  const t=await testo(pg);
  ok(/i mesi tornano da fatturare/.test(t),'e lo dice',(t.match(/Fattura[^.]{0,90}eliminata[^.]{0,40}/)||[''])[0]);
  await pg.close();
}
{
  // Se uno dei mesi e' incassato non si elimina niente: neanche la
  // meta' non incassata, che lascerebbe la fattura spezzata.
  const pg=await apri(DUE_MESI.replace(`month:3,status:'invoice_issued'`,`month:3,status:'collected'`));
  await eliminaFebbraio(pg);
  const h=await schede(pg);
  ok(h.map(x=>x.id).join(',')==='h2,h3,h4','con marzo incassato non si elimina niente',h.map(x=>x.id).join(','));
  const t=await testo(pg);
  ok(/copre anche 03\/2026, che risulta incassato/.test(t),'e dice quale mese la trattiene',
     (t.match(/La fattura[^.]{0,140}/)||[''])[0]);
  await pg.close();
}

console.log('\n=== DUE TOCCHI SU «REGISTRA» SCRIVONO UNA VOLTA SOLA ===');
{
  // Il secondo tocco arriva mentre il primo sta ancora scrivendo: i
  // dati in memoria non hanno ancora i mesi nuovi, e senza un fermo li
  // avrebbe scritti di nuovo.
  const pg=await apri();
  await carica(pg,XML);
  await pg.evaluate(()=>Promise.all([window.registraFattura(),window.registraFattura()]));
  await pg.waitForTimeout(1500);
  const h=await schede(pg);
  ok(h.length===2,'due schede, non quattro',h.map(x=>x.month).join(', '));
  await pg.close();
}

console.log('\n=== SENZA TOTALE DICHIARATO SI REGISTRA LO STESSO ===');
{
  // ImportoTotaleDocumento e' facoltativo. Trattato come zero, la
  // somma dei mesi «non tornava» con un totale che non c'e'.
  const senzaTotale=XML.replace(/<ImportoTotaleDocumento>[^<]*<\/ImportoTotaleDocumento>/,'');
  const pg=await apri();
  await carica(pg,senzaTotale);
  const t=await testo(pg);
  ok(!/il totale dichiarato è 0,00/.test(t),'non lo rifiuta per un totale di 0,00 €',
     (t.match(/Divisa per mese[^.]{0,90}/)||[''])[0]||'non lo rifiuta');
  ok(await bottone(pg)==='Registra su 2 mesi','e offre di registrarla',await bottone(pg)||'nessun pulsante');
  await pg.close();
}

console.log('\n=== GIÀ REGISTRATA VUOL DIRE: NON CAMBIEREBBE NIENTE ===');
{
  // Stesso numero e stesso totale, ma la data scritta a mano e' un'altra:
  // col solo totale la si dava per registrata, e la data restava sbagliata.
  const pg=await apri(REGISTRATA.replace(/2026-04-08/g,'2026-04-01'));
  await carica(pg,XML);
  ok(await bottone(pg)==='Registra su 2 mesi','con la data diversa si può ancora allineare',
     await bottone(pg)||'nessun pulsante');
  await pg.close();
}

console.log('\n=== IL NUMERO TIENE LE LETTERE DEL SEZIONALE ===');
{
  // «A1/2026» e «1/2026» sono due fatture: togliendo tutte le lettere
  // diventavano lo stesso numero, e la seconda sovrascriveva la prima.
  const pg=await apri(`S.billing_headers=[
    {id:'hx',client_id:'sol',year:2026,month:2,status:'invoice_issued',invoice_number:'A1/2026',
     invoice_date:'2026-04-08',total_amount:460,invoice_total_amount:478.4}];`);
  await carica(pg,XML);
  const t=await testo(pg);
  ok(/Febbraio 2026 risulta già fatturato con la A1\/2026/.test(t),'la A1/2026 non è la 1/2026: non si sovrascrive',
     (t.match(/Febbraio 2026 risulta[^.]{0,40}/)||[''])[0]||'si sovrascrive');
  await pg.close();
}

console.log('\n=== SENZA NUMERO NON SI REGISTRA ===');
{
  const pg=await apri();
  await carica(pg,XML.replace(/<Numero>[^<]*<\/Numero>/,''));
  const t=await testo(pg);
  ok(/mancano il numero o la data/.test(t),'senza numero le schede non si terrebbero insieme: non si registra',
     (t.match(/Alla fattura mancano[^.]{0,40}/)||[''])[0]||'si registra');
  ok(await bottone(pg)==='','nessun pulsante');
  await pg.close();
}

console.log('\n=== L’ARROTONDAMENTO DEL RIEPILOGO ENTRA NELL’IMPONIBILE ===');
{
  // Righe da 2.529,99 e un riepilogo che arrotonda di un centesimo:
  // la fattura torna, e la registrazione deve tornare con lei.
  const arrot=XML.replace('<PrezzoTotale>2530.00</PrezzoTotale>','<PrezzoTotale>2529.99</PrezzoTotale>')
    .replace('<Imposta>0.00</Imposta>','<Imposta>0.00</Imposta><Arrotondamento>0.01</Arrotondamento>');
  const pg=await apri();
  await carica(pg,arrot);
  ok(await bottone(pg)==='Registra su 2 mesi','si registra',
     (await testo(pg)).match(/Questa fattura non si registra[^.]{0,120}/)?.[0]||await bottone(pg));
  await pg.evaluate(()=>window.registraFattura());
  await pg.waitForTimeout(1500);
  const h=await schede(pg);
  const somma=h.reduce((a,x)=>a+Number(x.invoice_total_amount),0);
  ok(Math.abs(somma-3109.6)<0.005,'e la somma dei mesi è il totale, al centesimo',somma.toFixed(2));
  await pg.close();
}

console.log('\n=== LA RIVALSA CHE NON VALE SU TUTTO NON SI INDOVINA ===');
{
  // 119,60 di rivalsa su 2.000 di base cassa, mentre le righe fanno
  // 2.990: una parte e' senza rivalsa, e non si sa di quale mese.
  const pg=await apri();
  await carica(pg,XML.replace('<ImponibileCassa>2990.00</ImponibileCassa>','<ImponibileCassa>2000.00</ImponibileCassa>'));
  const t=await testo(pg);
  ok(/non vale su tutte le righe/.test(t),'su più mesi non si registra, e dice perché',
     (t.match(/La rivalsa non vale[^.]{0,80}/)||[''])[0]||'si registra');
  await pg.close();
}

console.log('\n=== UNA FATTURA SI ELIMINA TUTTA O NIENTE ===');
{
  // Se il database rifiuta, non deve restare una fattura dimezzata.
  const pg=await apri(DUE_MESI+`window.__rifiutaCancellazione='h3';`);
  await eliminaFebbraio(pg);
  const h=await schede(pg);
  ok(h.map(x=>x.id).join(',')==='h2,h3,h4','il database dice di no su marzo: resta anche febbraio',
     h.map(x=>x.id).join(','));
  await pg.close();
}

console.log('\n=== FERMATA A METÀ, RIPETERLA NON DUPLICA ===');
{
  // Febbraio si scrive, marzo no. Ripetendo, febbraio va aggiornato,
  // non inserito una seconda volta.
  const pg=await apri();
  await carica(pg,XML);
  await pg.evaluate(()=>{window.__rifiutaRiga=(t,r)=>t==='billing_headers'&&Number(r.month)===3});
  await pg.evaluate(()=>window.registraFattura());
  await pg.waitForTimeout(1500);
  const prima=await schede(pg);
  ok(prima.map(x=>x.month).join(',')==='2','la prima volta si ferma dopo febbraio',prima.map(x=>x.month).join(',')||'nessuna');
  const t=await testo(pg);
  ok(/Registrazione fermata su Marzo 2026/.test(t),'e dice dove si è fermata',
     (t.match(/Registrazione fermata[^:]{0,30}/)||[''])[0]||'non lo dice');
  await pg.evaluate(()=>{window.__rifiutaRiga=null});
  await pg.evaluate(()=>window.registraFattura());
  await pg.waitForTimeout(1500);
  const dopo=await schede(pg);
  ok(dopo.map(x=>x.month).join(',')==='2,3','ripetendola, febbraio si aggiorna e marzo si aggiunge: due schede, non tre',
     dopo.map(x=>x.month).join(','));
  await pg.close();
}

console.log('\n=== IL BOLLO DI UNA FATTURA A CAVALLO D’ANNO ===');
{
  // Dicembre e gennaio, 52 € l'uno, una fattura sola da 104: sopra
  // soglia. Tagliata al confine dell'anno erano due mezze fatture.
  const pg=await apri(`S.billing_headers=[
    {id:'h2',client_id:'sol',year:2025,month:12,status:'invoice_issued',invoice_number:'7/2026',
     invoice_date:'2026-01-08',total_amount:50,invoice_total_amount:52},
    {id:'h3',client_id:'sol',year:2026,month:1,status:'invoice_issued',invoice_number:'7/2026',
     invoice_date:'2026-01-08',total_amount:50,invoice_total_amount:52}];`);
  const d=await bolloDovuto(pg);
  ok(d==='2,00','sul 2026 il bollo c’è: la fattura intera supera la soglia',d);
  await pg.evaluate(()=>window.openInvoiceDetail('sol',2025,12));await pg.waitForTimeout(500);
  await pg.evaluate(()=>window.go('tasseFuture'));await pg.waitForTimeout(900);
  const t=await testo(pg);
  ok(!/Imposta di bollo 2025 Dovuta/.test(t),'e sul 2025 non si conta una seconda volta',
     (t.match(/Imposta di bollo 2025 Dovuta [^€]*€/)||[''])[0]||'nessun bollo nel 2025');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== fattura registrata: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
