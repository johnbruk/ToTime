// Margine netto, mese per mese — e i rimborsi in fattura sono compensi.
//
// In dashboard c'erano tre grafici che dicevano poco: una barra
// dell'anno, un elenco di utili calcolati sul solo lavoro e un'area
// cumulata. «Bisognerebbe vedere per ogni mese, a fronte del
// fatturato, quanto è la marginalità netta togliendo spese, tasse
// ecc.» Adesso c'è una riga per mese: la barra è il fatturato, la
// parte verde quanto resta; toccando il mese si vedono le voci.
//
// E la regola dei rimborsi, detta dall'utente: «le spese a mio carico
// sono a mio carico, quelle per cui chiedo rimborso tramite fattura
// no» — sono compensi, ci si pagano le tasse e restano. Il Bilancio li
// toglieva come costo, come una partita di giro: l'utile risultava più
// basso del vero di tutti i rimborsi. Restano partita di giro solo i
// rimborsi fuori reddito, se si è scelta la regola 2025.
//
// I numeri si fanno a mano: coefficiente 78%, INPS 26,07% sul reddito
// forfettario, imposta 5% sul reddito meno l'INPS.
//   settembre  fattura 4.786,00 (bollo 2 addebitato), spese 50 + bollo 2
//              base 4.784 · INPS 972,81 · imposta 137,94 · netto 3.623,26 (76%)
//   ottobre    nessuna fattura: 5 giorni a 460 + 100 di rimborso km,
//              più rivalsa 4% = 2.496,00 da fatturare
//              INPS 507,55 · imposta 71,97 · netto 1.916,48 (77%)
//   agosto     fattura 958,80 di un cliente + 2 giorni a 400 di un altro,
//              non fatturati: 832,00 da fatturare · netto 1.373,48
//   giugno     solo 30 di spese a carico: −30,00, in perdita
//   luglio     scheda esclusa dalla fatturazione: non c'è
//   anno       9.072,80 di cui 3.328,00 da fatturare · netto 6.883,22 (76%)
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
const eur=t=>Number(String(t||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'));

const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'sol',name:'Solution',daily_rate:460,standard_hours:8,compensation_type:'daily_rate_8h',active:true},
             {id:'k2',name:'K2',daily_rate:400,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.expense_categories=[{id:'km',name:'Rimborso km',active:true,reimbursable:true,is_mileage:true},
                        {id:'tr',name:'Treno',active:true,reimbursable:true},
                        {id:'cs',name:'Cancelleria',active:true,reimbursable:false}];
  S.tax_settings=[{id:'t26',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,substitute_tax_rate:5,
    inps_gs_rate:26.07,inps_recharge_enabled:true,inps_recharge_rate:4,stamp_duty_mode:'charged',stamp_duty_enabled:true,stamp_duty_amount:2}];
  S.app_settings=[{id:'d',setting_key:'dash_full',setting_value:'1'},{id:'b',setting_key:'bal_full',setting_value:'1'}];
  const g=(id,d,c,ore=8,rate)=>({id,entry_date:d,client_id:c,project_id:null,activity_id:'a1',hours:ore,
    daily_rate_snapshot:rate||(c==='sol'?460:400),standard_hours_snapshot:8});
  S.timesheet_entries=[
    g('o1','2026-10-01','sol'),g('o2','2026-10-02','sol'),g('o3','2026-10-05','sol'),g('o4','2026-10-06','sol'),g('o5','2026-10-07','sol'),
    Object.assign(g('o9','2026-10-20','sol'),{status:'planned'}),
    g('a1','2026-08-17','k2'),g('a2','2026-08-18','k2'),
    g('l1','2026-07-15','sol')];
  S.travel_expenses=[
    {id:'r1',expense_date:'2026-10-06',client_id:'sol',expense_category_id:'km',amount:100,reimbursement_type:'invoice',reimbursable:true},
    {id:'r2',expense_date:'2026-09-10',client_id:'sol',expense_category_id:'tr',amount:200,reimbursement_type:'invoice',reimbursable:true},
    {id:'c1',expense_date:'2026-09-12',client_id:null,expense_category_id:'cs',amount:50,reimbursement_type:'own',reimbursable:false},
    {id:'c2',expense_date:'2026-06-03',client_id:null,expense_category_id:'cs',amount:30,reimbursement_type:'own',reimbursable:false}];
  S.billing_headers=[
    {id:'h9',client_id:'sol',year:2026,month:9,status:'invoice_issued',invoice_number:'7/2026',invoice_date:'2026-09-30',
     total_amount:4600,inps_recharge_amount:184,stamp_duty_amount:2,invoice_total_amount:4786},
    {id:'h8',client_id:'sol',year:2026,month:8,status:'invoice_issued',invoice_number:'6/2026',invoice_date:'2026-08-31',
     total_amount:920,inps_recharge_amount:36.8,stamp_duty_amount:2,invoice_total_amount:958.8},
    {id:'h7',client_id:'sol',year:2026,month:7,status:'excluded'}];
`;
const apri=async(w=1280,semi=SEMI,tema)=>{
  const pg=await b.newPage({viewport:{width:w,height:1400},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.errs=errs;
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(semi);await pg.evaluate(()=>window.reload());await pg.waitForTimeout(600);
  if(tema)await pg.evaluate(t=>document.documentElement.setAttribute('data-theme',t),tema);
  // l'anno della dashboard e' quello del mese che l'app ha davanti
  await pg.evaluate(()=>window.openInvoiceDetail('sol',2026,10));await pg.waitForTimeout(300);
  await pg.evaluate(()=>window.go('home'));await pg.waitForTimeout(500);
  return pg;
};
const righe=pg=>pg.evaluate(()=>[...document.querySelectorAll('#app .margineCard .margineRiga')].map(r=>({
  mese:r.dataset.mese,nome:r.querySelector('.margineNome')?.firstChild?.textContent.trim(),
  sotto:(r.querySelector('.margineNome span')?.textContent||'').replace(/\s+/g,' ').trim(),
  netto:(r.querySelector('.margineNetto b')?.textContent||'').replace(/\s+/g,' ').trim(),
  resta:(r.querySelector('.margineNetto span')?.textContent||'').replace(/\s+/g,' ').trim(),
  stima:r.classList.contains('stima'),aperta:r.getAttribute('aria-expanded'),
  conto:[...r.querySelectorAll('.margineConto div')].map(d=>(d.firstChild.textContent+' '+d.querySelector('b').textContent).replace(/\s+/g,' ').trim()),
  verde:(()=>{const f=r.querySelector('.margineFatt'),i=f&&f.querySelector('i');if(!f||!i)return null;const w=f.getBoundingClientRect().width;return w?i.getBoundingClientRect().width/w:i.getBoundingClientRect().width})(),
  larga:(()=>{const f=r.querySelector('.margineFatt'),t=r.querySelector('.margineBarra');return f&&t?f.getBoundingClientRect().width/t.getBoundingClientRect().width:null})()})));
const riga=(r,m)=>r.find(x=>x.mese===String(m))||{};

console.log('\n=== I TRE GRAFICI DI PRIMA LASCIANO IL POSTO A UNO ===');
{
  const pg=await apri();
  const t=await pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));
  ok(/Margine netto, mese per mese · 2026/.test(t),'in dashboard c’è «Margine netto, mese per mese · 2026»');
  for(const vecchio of ['Ripartizione ricavi','Marginalità netta mensile','Composizione del fatturabile'])
    ok(!t.includes(vecchio),`e «${vecchio}» non c’è più`);
  ok(pg.errs.length===0,'nessun errore JS',pg.errs.slice(0,2).join(' | ')||'nessuno');
  await pg.close();
}

console.log('\n=== UNA RIGA PER MESE, COI NUMERI FATTI A MANO ===');
{
  const pg=await apri();
  const r=await righe(pg);
  ok(r.map(x=>x.mese).join(',')==='6,8,9,10,anno','giugno, agosto, settembre, ottobre e l’anno; luglio, escluso, non c’è',r.map(x=>x.mese).join(','));
  const set=riga(r,9);
  ok(set.sotto==='4.786,00 € fatturati','settembre: 4.786,00 € fatturati, il totale della fattura',set.sotto);
  ok(set.netto==='3.623,26 €','ti restano 3.623,26 €',set.netto);
  ok(set.resta==='ti resta il 76%','cioè il 76%',set.resta);
  ok(!set.stima,'ed è fatturato, quindi pieno, non a righe');
  const ott=riga(r,10);
  ok(ott.sotto==='2.496,00 € da fatturare','ottobre non ha fattura: 5 giorni a 460 più 100 di km, più rivalsa: 2.496,00 € da fatturare',ott.sotto);
  ok(ott.stima,'ed è a righe, perché è una stima');
  ok(ott.netto==='1.916,48 €'&&ott.resta==='ti resta il 77%','netto 1.916,48 €, il 77%',ott.netto+' · '+ott.resta);
  const ago=riga(r,8);
  ok(ago.sotto==='958,80 € fatturati + 832,00 € da fatturare','agosto: la fattura di un cliente, e i 2 giorni dell’altro ancora da fatturare',ago.sotto);
  ok(!ago.stima,'un mese in parte fatturato non è a righe: lo dice la scritta');
  ok(ago.netto==='1.373,48 €','netto 1.373,48 €',ago.netto);
  const giu=riga(r,6);
  ok(giu.netto==='-30,00 €'&&giu.resta==='in perdita','giugno ha solo 30 € di spese: −30,00, «in perdita»',giu.netto+' · '+giu.resta);
  const anno=riga(r,'anno');
  ok(anno.sotto==='9.072,80 € di cui 3.328,00 € da fatturare','l’anno: 9.072,80 €, di cui 3.328,00 da fatturare',anno.sotto);
  ok(anno.netto==='6.883,22 €'&&anno.resta==='ti resta il 76%','e ti restano 6.883,22 €, il 76%',anno.netto+' · '+anno.resta);
  const somma=r.filter(x=>x.mese!=='anno').reduce((a,x)=>a+eur(x.netto),0);
  ok(Math.abs(somma-eur(anno.netto))<0.015,'la riga dell’anno è la somma dei mesi',somma.toFixed(2));
  await pg.close();
}

console.log('\n=== LA BARRA: LUNGA QUANTO IL FATTURATO, VERDE QUANTO TI RESTA ===');
{
  const pg=await apri();
  const r=await righe(pg);
  const set=riga(r,9),ott=riga(r,10);
  ok(Math.abs(set.larga-1)<0.01,'settembre, il mese più fatturato, ha la barra intera',set.larga?.toFixed(3));
  ok(Math.abs(ott.larga-2496/4786)<0.01,'ottobre è lunga in proporzione: 2.496 su 4.786',ott.larga?.toFixed(3));
  ok(Math.abs(set.verde-3623.26/4786)<0.01,'e il verde di settembre è il 76% della sua barra',set.verde?.toFixed(3));
  ok(riga(r,6).verde===0,'giugno, in perdita, non ha verde');
  await pg.close();
}

console.log('\n=== TOCCANDO UN MESE SI VEDONO LE VOCI ===');
{
  const pg=await apri();
  ok((await righe(pg)).every(x=>!x.conto.length),'all’inizio nessun mese è aperto');
  await pg.evaluate(()=>document.querySelector('#app .margineRiga[data-mese="9"]').click());await pg.waitForTimeout(400);
  let r=await righe(pg);const set=riga(r,9);
  ok(set.aperta==='true','settembre si apre',set.aperta);
  ok(set.conto.join(' | ')==='Spese a tuo carico 52,00 € | Contributi INPS 972,81 € | Imposta 137,94 € | Netto 3.623,26 €',
     'spese 50 + bollo 2, INPS 972,81, imposta 137,94, netto 3.623,26',set.conto.join(' | '));
  // la prova della regola: il rimborso in fattura di ottobre e' fatturato, non spesa
  await pg.evaluate(()=>document.querySelector('#app .margineRiga[data-mese="10"]').click());await pg.waitForTimeout(400);
  r=await righe(pg);
  ok(riga(r,9).conto.length===0,'aprendo ottobre settembre si richiude: uno alla volta');
  ok(riga(r,10).conto[0]==='Spese a tuo carico 0,00 €','i 100 € di rimborso km di ottobre non sono spese: stanno nel fatturato',riga(r,10).conto[0]);
  await pg.evaluate(()=>document.querySelector('#app .margineRiga[data-mese="10"]').click());await pg.waitForTimeout(400);
  ok((await righe(pg)).every(x=>!x.conto.length),'e toccandolo di nuovo si richiude');
  const dove=await pg.evaluate(()=>{document.querySelector('#app .margineTesta').click();return document.documentElement.getAttribute('data-view')});
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(()=>document.documentElement.getAttribute('data-view'))==='balance','il titolo porta al Bilancio');
  await pg.close();
}

console.log('\n=== SUL TELEFONO E AL BUIO ===');
{
  const pg=await apri(390,SEMI,'dark');
  await pg.evaluate(()=>document.querySelector('#app .margineRiga[data-mese="9"]').click());await pg.waitForTimeout(400);
  const m=await pg.evaluate(()=>{
    const r=document.querySelector('#app .margineRiga[data-mese="9"]');
    const nome=r.querySelector('.margineNome').getBoundingClientRect(),barra=r.querySelector('.margineBarra').getBoundingClientRect();
    return {scroll:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      sotto:barra.top>=nome.bottom-1,larga:barra.width,riga:r.getBoundingClientRect().width,
      colonne:getComputedStyle(r.querySelector('.margineConto')).gridTemplateColumns.split(' ').length,
      verde:getComputedStyle(r.querySelector('.margineFatt i')).backgroundColor}});
  ok(m.scroll<=1,'niente scorre di lato',m.scroll+'px');
  ok(m.sotto&&m.larga>m.riga*0.9,'la barra va sotto il nome, larga quanto la riga',`${Math.round(m.larga)} su ${Math.round(m.riga)} px`);
  ok(m.colonne===2,'e le quattro voci stanno su due colonne',String(m.colonne));
  ok(m.verde==='rgb(25, 158, 112)','al buio il verde è quello scelto per il tema scuro',m.verde);
  await pg.close();
}

// ─── Il Bilancio, con la stessa regola ───
const leggiBilancio=pg=>pg.evaluate(()=>{
  const t=document.getElementById('app').innerText.replace(/\s+/g,' ');
  const card=tit=>[...document.querySelectorAll('#app .card')].find(c=>c.querySelector('b')?.textContent.startsWith(tit));
  const amt=c=>c?c.querySelector('.amount')?.textContent.trim():null;
  const righe=c=>c?[...c.querySelectorAll('.row')].map(r=>({t:r.querySelector('.title')?.textContent.trim(),v:r.querySelector('.value')?.textContent.trim()})):[];
  return {t,utile:amt(card('Utile netto stimato')),margine:amt(card('Margine operativo')),
    costi:righe(card('Costi ')),ricavi:righe(card('Ricavi ')),
    mesi:[...document.querySelectorAll('#app .row')].filter(r=>r.getAttribute('onclick')?.startsWith('openMonthExpenses')).map(r=>({m:r.querySelector('.title')?.textContent.trim(),d:r.querySelector('.desc')?.textContent.trim(),v:r.querySelector('.value')?.textContent.trim()}))};
});
const bilancio=async(semi)=>{const pg=await apri(1280,semi);await pg.evaluate(()=>window.go('balance'));await pg.waitForTimeout(500);return pg};

console.log('\n=== BILANCIO: I RIMBORSI IN FATTURA SONO COMPENSI, NON COSTI ===');
{
  const pg=await bilancio(SEMI);
  const x=await leggiBilancio(pg);
  ok(!/Spese anticipate rimborsate/.test(x.t),'fra i costi non c’è più «Spese anticipate rimborsate»',x.costi.map(c=>c.t).join(' · '));
  ok(!/partite di giro\)/.test(x.t)&&/sono compensi/.test(x.t),'e il Bilancio dice che i rimborsi in fattura sono compensi');
  const rimb=x.ricavi.find(r=>/Rimborsi spese in fattura/.test(r.t||''));
  ok(rimb&&Math.abs(eur(rimb.v)-300)<0.005,'fra i ricavi ci sono i 300 € di rimborsi: 200 di treno e 100 di km',rimb?.v);
  ok(!x.costi.some(c=>/fuori reddito/.test(c.t||'')),'senza la regola 2025 non c’è nessun rimborso fra i costi');
  const ott=x.mesi.find(m=>m.m==='Ottobre')||{};
  ok(/Rimborsi in fattura/.test(ott.d||'')&&Math.abs(eur(ott.v)-2400)<0.005,'ottobre nel mese per mese: 2.300 di compensi + 100 di rimborsi = 2.400',`${ott.d} → ${ott.v}`);
  await pg.close();
}
{
  // la prova: lo stesso anno con un rimborso in piu'. Le imposte del
  // Bilancio sono per cassa e qui non c'e' niente di incassato, quindi
  // non si muovono: l'utile deve salire di tutti i 250.
  const piu=SEMI+`S.travel_expenses.push({id:'r9',expense_date:'2026-10-08',client_id:'sol',expense_category_id:'tr',amount:250,reimbursement_type:'invoice',reimbursable:true});`;
  const a=await bilancio(SEMI),pa=await leggiBilancio(a);await a.close();
  const c=await bilancio(piu),pc=await leggiBilancio(c);await c.close();
  ok(Math.abs(eur(pc.utile)-eur(pa.utile)-250)<0.005,'un rimborso in fattura di 250 € alza l’utile di 250: restano a te',`${pa.utile} → ${pc.utile}`);
}

console.log('\n=== CON LA REGOLA 2025 IL RIMBORSO FUORI REDDITO RESTA PARTITA DI GIRO ===');
{
  // settembre incassato, treno pagato con carta e con la ricevuta: il
  // rimborso regge i requisiti, e con la scelta attiva esce dal reddito
  const base=SEMI+`
    S.app_settings.push({id:'f',setting_key:'rimborsi_fuori_reddito',setting_value:'si'});
    const h=S.billing_headers.find(x=>x.id==='h9');h.status='collected';h.collected_amount=4786;h.collection_date='2026-10-05';
    const t=S.travel_expenses.find(x=>x.id==='r2');t.payment_method='carta';t.receipt_kept=true;`;
  const senza=base+`S.travel_expenses=S.travel_expenses.filter(x=>x.id!=='r2');`;
  const a=await bilancio(senza),pa=await leggiBilancio(a),ta=await a.evaluate(()=>window.annualTaxCalc(2026));await a.close();
  const c=await bilancio(base),pc=await leggiBilancio(c),tc=await c.evaluate(()=>window.annualTaxCalc(2026));await c.close();
  const riga=pc.costi.find(x=>/Rimborsi fuori reddito/.test(x.t||''));
  ok(riga&&Math.abs(eur(riga.v)-200)<0.005,'fra i costi compare «− Rimborsi fuori reddito»: 200 €',riga?.v);
  const tasseGiu=(ta.substituteTax+ta.forfaitIncome*0.2607)-(tc.substituteTax+tc.forfaitIncome*0.2607);
  const utileSu=eur(pc.utile)-eur(pa.utile);
  ok(tasseGiu>0,'le imposte scendono, perché i 200 escono dalla base',tasseGiu.toFixed(2));
  ok(Math.abs(utileSu-tasseGiu)<0.015,'e l’utile sale SOLO di quanto scendono le imposte: entrano 200 ed escono 200',`utile +${utileSu.toFixed(2)} · imposte −${tasseGiu.toFixed(2)}`);
}

await b.close(); srv.close();
console.log(`\n=== margine netto: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
