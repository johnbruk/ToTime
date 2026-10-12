// Una fattura su più mesi è una riga sola, che si apre sui mesi.
//
// «Quando ci sono fatture che coprono più mesi, fare in modo che si
// vedano col totale della fattura». L'elenco mostrava una riga per
// scheda, cioè per mese: la 1/2026 compariva due volte, a 478,40 e a
// 2.631,20, e il suo totale — 3.109,60 — non stava scritto da nessuna
// parte.
//
// Adesso una fattura su più mesi è una riga sola col totale e i mesi
// che copre; toccandola si apre, e sotto ci sono i mesi col loro
// importo, ognuno col suo dettaglio. Quelle di un mese solo restano
// com'erano.
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
const eur=t=>Number(String(t||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'));
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Solution',daily_rate:460,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  const h=(id,m,st,n,d,t)=>({id,client_id:'sol',year:2026,month:m,status:st,invoice_number:n,invoice_date:d,
    invoice_total_amount:t,collected_amount:st==='collected'?t:null});
  S.billing_headers=[
    h('h9',9,'invoice_issued','6/2026','2026-09-29',4784),h('h8',8,'collected','6/2026','2026-09-29',956.8),
    h('h7',7,'collected','5/2026','2026-07-31',3348.8),
    h('h5',5,'invoice_issued','3/2026','2026-06-01',4903.6),h('h4',4,'invoice_issued','3/2026','2026-05-05',3827.2),
    h('h3',3,'collected','1/2026','2026-04-08',2631.2),h('h2',2,'collected','1/2026','2026-04-08',478.4)];
`;
const apri=async(w=1280,modo='issued',semi=SEMI,[anno,mese]=[2026,9])=>{
  const pg=await b.newPage({viewport:{width:w,height:1600},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(semi);await pg.evaluate(()=>window.reload());await pg.waitForTimeout(700);
  // l'anno degli elenchi e' quello del mese che l'app ha davanti
  await pg.evaluate(([a,m])=>window.openInvoiceDetail('sol',a,m),[anno,mese]);await pg.waitForTimeout(400);
  await pg.evaluate(m=>window.openAnnualInvoices(m),modo);await pg.waitForTimeout(600);
  return pg;
};
const righe=pg=>pg.evaluate(()=>[...document.querySelectorAll('#app .rowFattura')].map(r=>({
  gruppo:r.classList.contains('rowGruppo'),mese:r.classList.contains('rowMese'),
  aperta:r.getAttribute('aria-expanded'),mesi:r.dataset.mesi||'',
  numero:r.querySelector('.fatNum')?.textContent.trim(),
  periodo:(r.querySelector('.fatMese')?.textContent||'').replace(/^\s*MES[EI]\s*/i,'').replace(/\s+/g,' ').trim(),
  stato:r.querySelector('.fatCli .tag')?.textContent.trim(),
  elimina:!!r.querySelector('.fatDel'),
  importo:r.querySelector('.value')?.textContent.trim()})));
const tocca=(pg,mesi)=>pg.evaluate(m=>[...document.querySelectorAll('#app .rowGruppo')].find(r=>r.dataset.mesi===m).click(),mesi);

console.log('\n=== UNA FATTURA SU DUE MESI È UNA RIGA SOLA, COL SUO TOTALE ===');
{
  const pg=await apri();
  const r=await righe(pg);
  const uno=r.filter(x=>x.numero==='1/2026');
  ok(uno.length===1,'la 1/2026 compare una volta sola',String(uno.length));
  const g=uno[0]||{};
  ok(g.gruppo&&g.mesi==='2026-02,2026-03','ed è la riga della fattura, con i suoi due mesi',g.mesi);
  ok(/^02–03\/2026/.test(g.periodo)&&/2 mesi/.test(g.periodo),'dice quali mesi copre, e quanti',g.periodo);
  ok(Math.abs(eur(g.importo)-3109.6)<0.005,'e l’importo è il totale della fattura: 478,40 + 2.631,20',g.importo);
  ok(g.aperta==='false','chiusa, all’inizio',g.aperta);
  ok(!r.some(x=>x.mese),'e i mesi non si vedono finché non si apre');
  const t=await testo(pg);
  ok(!/\b\d{4},\d{2}\s?€/.test(t),'gli importi hanno sempre il puntino delle migliaia',(t.match(/\b\d{4},\d{2}\s?€/)||[''])[0]||'tutti');
  const tot=eur((t.match(/Totale fatturato 2026 ([\d.,]+)\s?€/)||[])[1]);
  const somma=r.filter(x=>!x.mese).reduce((a,x)=>a+eur(x.importo),0);
  ok(Math.abs(tot-somma)<0.005,'e il totale dell’anno è la somma delle righe',`${tot} contro ${somma.toFixed(2)}`);
  ok(!(await pg.$('#app .notaCavallo')),'e senza fatture a cavallo d’anno non c’è nessuna nota da leggere');
  await pg.close();
}

console.log('\n=== TOCCANDOLA SI APRE SUI MESI, CIASCUNO COL SUO IMPORTO ===');
{
  const pg=await apri();
  await tocca(pg,'2026-02,2026-03');await pg.waitForTimeout(400);
  const r=await righe(pg);
  const i=r.findIndex(x=>x.mesi==='2026-02,2026-03');
  ok(r[i].aperta==='true','la riga risulta aperta',r[i].aperta);
  const sotto=r.slice(i+1,i+3);
  ok(sotto.every(x=>x.mese)&&sotto.map(x=>x.periodo).join(',')==='02/2026,03/2026','sotto, febbraio e marzo',sotto.map(x=>x.periodo).join(','));
  ok(eur(sotto[0].importo)===478.4&&eur(sotto[1].importo)===2631.2,'con i loro importi',sotto.map(x=>x.importo).join(' · '));
  ok(Math.abs(eur(sotto[0].importo)+eur(sotto[1].importo)-eur(r[i].importo))<0.005,'che sommano al totale della fattura');
  // un mese porta al suo dettaglio, come prima
  await pg.evaluate(()=>[...document.querySelectorAll('#app .rowMese')][1].click());await pg.waitForTimeout(500);
  const dove=await pg.evaluate(()=>({v:document.documentElement.getAttribute('data-view'),t:(document.querySelector('#app .app')||document.getElementById('app')).innerText.replace(/\s+/g,' ')}));
  ok(dove.v==='billingDetail'&&/Marzo 2026/.test(dove.t),'e toccando marzo si apre il dettaglio di marzo',dove.v+' · '+(dove.t.match(/[A-Z][a-z]+ 2026/)||[''])[0]);
  await pg.evaluate(()=>window.back());await pg.waitForTimeout(500);
  const ancora=await righe(pg);
  ok(ancora.find(x=>x.mesi==='2026-02,2026-03')?.aperta==='true','tornando indietro la fattura è ancora aperta');
  await tocca(pg,'2026-02,2026-03');await pg.waitForTimeout(400);
  ok(!(await righe(pg)).some(x=>x.mese),'e toccandola di nuovo si richiude');
  await pg.close();
}

console.log('\n=== LO STATO DI UNA FATTURA SU PIÙ MESI ===');
{
  const pg=await apri();
  const r=await righe(pg);
  const sei=r.find(x=>x.numero==='6/2026')||{};
  ok(sei.stato==='In parte incassata','agosto incassato e settembre no: «In parte incassata»',sei.stato);
  ok(!sei.elimina,'e non ha «Elimina fattura», come un’incassata',String(sei.elimina));
  const tre=r.find(x=>x.numero==='3/2026')||{};
  ok(tre.gruppo===false,'la 3/2026 ha due date diverse: sono due documenti, e restano due righe',JSON.stringify(r.filter(x=>x.numero==='3/2026').map(x=>x.periodo)));
  ok(r.filter(x=>x.numero==='3/2026').length===2,'appunto, due');
  const cinque=r.find(x=>x.numero==='5/2026')||{};
  ok(!cinque.gruppo&&cinque.periodo==='07/2026','una fattura di un mese solo resta com’era',cinque.periodo);
  await pg.close();
}

console.log('\n=== NEGLI INCASSI, LO STESSO ===');
{
  const pg=await apri(1280,'collected');
  const r=await righe(pg);
  const uno=r.filter(x=>x.numero==='1/2026');
  ok(uno.length===1&&uno[0].gruppo&&Math.abs(eur(uno[0].importo)-3109.6)<0.005,'la 1/2026 incassata è una riga sola, col suo totale',uno.map(x=>x.importo).join(' | '));
  await pg.close();
}

// Una fattura su dicembre e gennaio. Gli elenchi sono per anno, e le
// schede si filtravano per anno PRIMA di raggrupparle: la fattura
// diventava due righe da un mese, una nel 2026 e una nel 2027, e il suo
// totale non si vedeva in nessuno dei due. Adesso compare per intero in
// tutti e due gli anni; il totale dell'anno conta solo i suoi mesi, e
// lo dice.
const CAVALLO=st=>`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Solution',daily_rate:460,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  const h=(id,y,m,st,n,d,t)=>({id,client_id:'sol',year:y,month:m,status:st,invoice_number:n,invoice_date:d,
    invoice_total_amount:t,collected_amount:st==='collected'?t:null});
  S.billing_headers=[
    h('x11',2026,11,'${st}','8/2026','2026-11-30',3000),
    h('x12',2026,12,'${st}','1/2027','2027-01-31',4600),h('x01',2027,1,'${st}','1/2027','2027-01-31',920),
    h('x02',2027,2,'${st}','2/2027','2027-02-28',1500)];
`;
console.log('\n=== UNA FATTURA SU DICEMBRE E GENNAIO SI VEDE PER INTERO, IN TUTTI E DUE GLI ANNI ===');
for(const [anno,mese,totAnno,altra] of [[2026,11,7600,'8/2026'],[2027,2,2420,'2/2027']]){
  const pg=await apri(1280,'issued',CAVALLO('invoice_issued'),[anno,mese]);
  const r=await righe(pg);
  const una=r.filter(x=>x.numero==='1/2027');
  ok(una.length===1&&una[0].gruppo,`nel ${anno} la 1/2027 è una riga sola, la riga della fattura`,JSON.stringify(una.map(x=>x.periodo)));
  const g=una[0]||{};
  ok(g.mesi==='2026-12,2027-01'&&/^12\/2026–01\/2027/.test(g.periodo),'con tutti e due i mesi, anche quello dell’altro anno',g.mesi+' · '+g.periodo);
  ok(Math.abs(eur(g.importo)-5520)<0.005,'e il totale della fattura: 4.600,00 + 920,00',g.importo);
  ok(r.some(x=>x.numero===altra&&!x.gruppo),`la ${altra}, di un mese solo, resta com’era`);
  const t=await testo(pg);
  const tot=eur((t.match(new RegExp('Totale fatturato '+anno+' ([\\d.,]+)\\s?€'))||[])[1]);
  ok(Math.abs(tot-totAnno)<0.005,`il totale del ${anno} conta solo i mesi del ${anno}`,`${tot}, atteso ${totAnno}`);
  const nota=await pg.evaluate(()=>document.querySelector('#app .notaCavallo')?.textContent.replace(/\s+/g,' ').trim()||'');
  ok(new RegExp('solo i mesi del '+anno).test(nota)&&/La fattura 1\/2027 copre anche mesi di un altro anno/.test(nota),
     'e una nota spiega perché le righe non si sommano al totale',nota||'nessuna nota');
  if(anno===2026){
    ok(r[0]?.numero==='1/2027','è la fattura più recente, e sta in cima',r.map(x=>x.numero).join(', '));
    await tocca(pg,'2026-12,2027-01');await pg.waitForTimeout(400);
    const sotto=(await righe(pg)).filter(x=>x.mese);
    ok(sotto.map(x=>x.periodo+' '+x.importo).join(' | ').replace(/\s+/g,' ')==='12/2026 4.600,00 € | 01/2027 920,00 €',
       'aperta, mostra dicembre e gennaio con i loro importi',sotto.map(x=>x.periodo+' '+x.importo).join(' | '));
  }
  await pg.close();
}
{
  const pg=await apri(1280,'collected',CAVALLO('collected'),[2026,11]);
  const r=await righe(pg);
  const una=r.filter(x=>x.numero==='1/2027');
  ok(una.length===1&&una[0].gruppo&&Math.abs(eur(una[0].importo)-5520)<0.005,'negli Incassi, lo stesso',JSON.stringify(una.map(x=>x.importo)));
  await pg.close();
}
{
  const pg=await apri(390,'issued',CAVALLO('invoice_issued'),[2026,11]);
  await tocca(pg,'2026-12,2027-01');await pg.waitForTimeout(400);
  const m=await pg.evaluate(()=>({scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    nota:!!document.querySelector('#app .notaCavallo')}));
  ok(m.nota&&m.scroll<=1,'e sul telefono, nota compresa, niente scorre di lato',m.scroll+'px');
  await pg.close();
}

// Una fattura su gennaio e marzo, senza febbraio: «01–03/2026» direbbe
// che copre anche febbraio. I mesi si elencano.
const SALTO=`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Solution',daily_rate:460,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  const h=(id,y,m,n,d,t)=>({id,client_id:'sol',year:y,month:m,status:'invoice_issued',invoice_number:n,invoice_date:d,invoice_total_amount:t});
  S.billing_headers=[
    h('n1',2026,1,'4/2026','2026-03-31',1000),h('n3',2026,3,'4/2026','2026-03-31',2000),
    h('c5',2026,5,'5/2026','2026-06-30',1100),h('c6',2026,6,'5/2026','2026-06-30',1200),
    h('s5',2026,4,'6/2026','2026-07-15',300),h('s6',2026,7,'6/2026','2026-07-15',400),h('s7',2026,9,'6/2026','2026-07-15',500)];
`;
console.log('\n=== MESI NON DI FILA: SI ELENCANO, NON SI SCRIVE UN INTERVALLO ===');
{
  const pg=await apri(1280,'issued',SALTO,[2026,9]);
  const r=await righe(pg);
  const per=n=>(r.find(x=>x.numero===n)||{}).periodo||'';
  ok(/^01, 03\/2026/.test(per('4/2026')),'gennaio e marzo: «01, 03/2026», non «01–03/2026»',per('4/2026'));
  ok(!/01–03/.test(per('4/2026')),'che direbbe che c’è anche febbraio');
  ok(/^04, 07, 09\/2026/.test(per('6/2026'))&&/3 mesi/.test(per('6/2026')),'aprile, luglio e settembre: «04, 07, 09/2026», 3 mesi',per('6/2026'));
  ok(/^05–06\/2026/.test(per('5/2026')),'maggio e giugno, di fila, restano un intervallo: «05–06/2026»',per('5/2026'));
  await pg.close();
}

console.log('\n=== SUL TELEFONO UN MESE STA SU UNA RIGA ===');
{
  const pg=await apri(390);
  await tocca(pg,'2026-02,2026-03');await pg.waitForTimeout(400);
  const m=await pg.evaluate(()=>{
    const r=[...document.querySelectorAll('#app .rowMese')];
    return {alte:r.map(x=>Math.round(x.getBoundingClientRect().height)),
      scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  ok(m.alte.length===2&&m.alte.every(h=>h>=40&&h<=64),'ogni mese è una riga sola, alta quanto basta al dito',m.alte.join(' · ')+' px');
  ok(m.scroll<=1,'e niente scorre di lato',m.scroll+'px');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== fatture su più mesi: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
