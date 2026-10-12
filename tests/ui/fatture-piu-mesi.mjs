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
const apri=async(w=1280,modo='issued')=>{
  const pg=await b.newPage({viewport:{width:w,height:1600},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);await pg.evaluate(()=>window.reload());await pg.waitForTimeout(700);
  // l'anno degli elenchi e' quello del mese che l'app ha davanti
  await pg.evaluate(()=>window.openInvoiceDetail('sol',2026,9));await pg.waitForTimeout(400);
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
