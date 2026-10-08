// Cinque numeri, due nomi, nessuna spiegazione.
//
// La prima pagina di Fatturazione mostrava «Totale fatturazione mese»,
// «Da fatturare» due volte, «Fatturato anno» e «Già fatturato» — cioè
// due parole per quattro cose diverse, su basi diverse (con o senza la
// rivalsa INPS) e periodi diversi (il mese o l'anno), senza che niente
// dicesse quale fosse quale. Erano tutti corretti e sembravano errori.
//
// Qui non si verifica «c'è la scheda»: si verifica che i numeri a
// schermo TORNINO FRA LORO. È il controllo che avrebbe preso l'errore
// che stavo per fare io: mettere nello stesso prospetto il fatturato
// con la rivalsa e il da fatturare senza, e ottenere righe che non
// sommano.
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

// Legge un importo dalla pagina cercandolo DOPO la sua etichetta: è
// così che lo legge una persona, e se l'etichetta sparisce il test
// deve accorgersene invece di trovare il numero altrove.
const euro=(t,etichetta)=>{
  const m=new RegExp(etichetta.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[^€]*?([\\d.]+,\\d{2}) €').exec(t);
  return m?Number(m[1].replace(/\./g,'').replace(',','.')):null;
};
const vicini=(a,b)=>a!==null&&b!==null&&Math.abs(a-b)<0.005;

// Un anno con dentro tutto quello che la pagina deve saper raccontare:
// due fatture (una incassata e una no), lavoro non ancora fatturato,
// un rimborso spese, e giorni pianificati nel futuro.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'ac',name:'Acme',daily_rate:500,standard_hours:8,
    compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'p1',client_id:'ac',name:'Progetto',active:true}];
  S.activities=[{id:'a1',name:'Analisi',active:true}];
  S.expense_categories=[{id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount'}];
  const g=(id,d)=>({id,entry_date:d,client_id:'ac',project_id:'p1',activity_id:'a1',hours:8});
  S.timesheet_entries=[
    g('g1','2026-01-05'),g('g2','2026-01-06'),g('g3','2026-01-07'),g('g4','2026-01-08'),g('g5','2026-01-09'),
    g('g6','2026-01-12'),g('g7','2026-01-13'),g('g8','2026-01-14'),g('g9','2026-01-15'),g('g10','2026-01-16'),
    g('f1','2026-02-02'),g('f2','2026-02-03'),g('f3','2026-02-04'),g('f4','2026-02-05'),
    g('o1','2026-10-01'),g('o2','2026-10-02'),g('o3','2026-10-05'),
    g('o4','2026-10-06'),g('o5','2026-10-07'),g('o6','2026-10-08'),
    {...g('n1','2026-11-09'),status:'planned'},{...g('n2','2026-11-10'),status:'planned'},
    {...g('n3','2026-11-11'),status:'planned'},{...g('n4','2026-11-12'),status:'planned'}];
  S.travel_expenses=[{id:'s1',expense_date:'2026-03-10',client_id:'ac',project_id:'p1',
    expense_category_id:'volo',work_city:'Roma',amount:500,reimbursement_type:'invoice'}];
  S.billing_headers=[
    {id:'h1',client_id:'ac',year:2026,month:1,status:'collected',
     total_amount:5000,invoice_total_amount:5200,collected_amount:5200},
    {id:'h2',client_id:'ac',year:2026,month:2,status:'invoice_issued',
     total_amount:2000,invoice_total_amount:2080}];
  S.monthly_compensations=[];S.manual_entries=[];S.trips=[];S.vehicles=[];S.wbs_items=[];
  S.tax_settings=[{id:'t1',fiscal_year:2026,regime:'forfettario',profitability_coefficient:78,
    substitute_tax_rate:5,inps_gs_rate:26.07,inps_recharge_rate:4,inps_recharge_enabled:true,
    stamp_duty_enabled:false,stamp_duty_amount:2,annual_revenue_limit:85000}];
`;
const apri=async(extra='')=>{
  const pg=await b.newPage({viewport:{width:390,height:2600},hasTouch:true});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};

console.log('\n=== CI SI ARRIVA DALLA DASHBOARD, COL DITO ===');
{
  // La regola del metodo: una pagina rifatta non è finita finché non
  // c'è un percorso che la raggiunge partendo da dove si apre l'app.
  const pg=await apri();
  const tocca=async(t)=>pg.evaluate(q=>{
    const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
    const n=[...document.querySelectorAll('button,.row,a,label,[onclick]')]
      .find(x=>norm(x.textContent).includes(norm(q)));
    if(!n)return false; n.click(); return true;
  },t);
  ok(await tocca('☰'),'il menu si apre');
  await pg.waitForTimeout(250);
  ok(await tocca('Fatturazione'),'e c’è la voce Fatturazione');
  await pg.waitForTimeout(500);
  const t=await testo(pg);
  ok(/Fatturazione e incassi/.test(t),'si arriva alla pagina',t.slice(0,80));
  await pg.close();
}

console.log('\n=== IL TOTALE DEL MESE SI SCOMPONE NEI SUOI PEZZI ===');
{
  // Prima diceva «Include eventuale rivalsa INPS 4% e marca da bollo se
  // attive»: per sapere quanto fosse la rivalsa bisognava andarla a
  // cercare in Configurazione fiscale.
  const pg=await apri();
  await pg.evaluate(()=>window.go('billing'));
  await pg.waitForTimeout(600);
  const t=await testo(pg);
  ok(/Da fatturare · Ottobre 2026/.test(t),'il titolo dice il mese, non solo «del mese»',
     (t.match(/Da fatturare[^€]{0,40}/)||[''])[0]);
  const tot=euro(t,'Da fatturare · Ottobre 2026');
  const comp=euro(t,'di compensi e spese'.replace('di compensi e spese','')) ;
  const pezzi=/([\d.]+,\d{2}) € di compensi e spese(?: · ([\d.]+,\d{2}) € di rivalsa INPS)?/.exec(t);
  ok(vicini(tot,3120),'il totale di ottobre è 3.120,00 (6 giorni × 500 + 4% di rivalsa)',String(tot));
  ok(!!pezzi,'e la riga sotto lo scompone',pezzi?pezzi[0]:'(nessuna scomposizione)');
  const base=pezzi?Number(pezzi[1].replace(/\./g,'').replace(',','.')):null;
  const riv=pezzi&&pezzi[2]?Number(pezzi[2].replace(/\./g,'').replace(',','.')):0;
  ok(vicini(base+riv,tot),'e i pezzi sommano al totale: non c’è niente da indovinare',
     `${base} + ${riv} = ${base+riv} contro ${tot}`);
  await pg.close();
}

console.log('\n=== LA CASSA TORNA, E DICE SU CHE BASE ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.go('billing'));
  // la cassa e il prospetto dell’anno stanno nella vista «L’anno»:
  // la pagina si apre sul mese, ed è giusto così
  await pg.evaluate(()=>window.setBillingVista('anno'));
  await pg.waitForTimeout(500);
  await pg.waitForTimeout(600);
  const t=await testo(pg);
  const daInc=euro(t,'Da incassare');
  const fat=euro(t,'fatturato nel 2026'.replace('fatturato nel 2026',''))||null;
  const m=/([\d.]+,\d{2}) € fatturato nel 2026 · ([\d.]+,\d{2}) € già incassato/.exec(t);
  ok(!!m,'fatturato e incassato stanno uno accanto all’altro',m?m[0]:'(non trovati)');
  const F=m?Number(m[1].replace(/\./g,'').replace(',','.')):null;
  const I=m?Number(m[2].replace(/\./g,'').replace(',','.')):null;
  ok(vicini(F,7280)&&vicini(I,5200),'7.280,00 fatturato · 5.200,00 incassato',`${F} · ${I}`);
  ok(vicini(daInc,2080),'e da incassare 2.080,00',String(daInc));
  ok(vicini(F-I,daInc),'cioè il numero grande È la differenza dei due: torna',
     `${F} − ${I} = ${F-I} contro ${daInc}`);
  ok(/comprendono<\/b>|comprendono/.test(t)&&/rivalsa/.test(t),
     'e la pagina dice che qui la rivalsa è compresa');
  await pg.close();
}

console.log('\n=== IL PROSPETTO DELL’ANNO SOMMA DAVVERO ===');
{
  // È il controllo che conta. Mescolando le due basi — fatturato con la
  // rivalsa e da fatturare senza — le righe NON sommano, ed è
  // esattamente l'errore che stavo per fare.
  const pg=await apri();
  await pg.evaluate(()=>window.go('billing'));
  // la cassa e il prospetto dell’anno stanno nella vista «L’anno»:
  // la pagina si apre sul mese, ed è giusto così
  await pg.evaluate(()=>window.setBillingVista('anno'));
  await pg.waitForTimeout(500);
  await pg.waitForTimeout(600);
  const t=await testo(pg);
  const gia=euro(t,'Già fatturato');
  const anc=euro(t,'Ancora da fatturare');
  const mat=euro(t,'= Maturato nel 2026');
  const pia=euro(t,'+ Pianificato');
  const pre=euro(t,'= Previsione ricavi 2026');
  ok(vicini(gia,7000),'già fatturato 7.000,00 — al netto della rivalsa',String(gia));
  ok(vicini(anc,3500),'ancora da fatturare 3.500,00',String(anc));
  ok(vicini(gia+anc,mat),'e le due sommano al maturato',`${gia} + ${anc} = ${gia+anc} contro ${mat}`);
  ok(vicini(mat,10500),'che è 10.500,00: 10.000 di lavoro + 500 di rimborso',String(mat));
  ok(vicini(pia,2000),'il pianificato è 2.000,00: quattro giorni di novembre',String(pia));
  ok(vicini(mat+pia,pre),'e maturato + pianificato fa la previsione',
     `${mat} + ${pia} = ${mat+pia} contro ${pre}`);
  await pg.close();
}

console.log('\n=== LE DUE BASI SONO DIVERSE, E LA PAGINA DICE PERCHÉ ===');
{
  // 7.000 contro 7.280 è la rivalsa. Prima questa differenza c'era e
  // non era spiegata da nessuna parte: sembrava un errore.
  const pg=await apri();
  await pg.evaluate(()=>window.go('billing'));
  // la cassa e il prospetto dell’anno stanno nella vista «L’anno»:
  // la pagina si apre sul mese, ed è giusto così
  await pg.evaluate(()=>window.setBillingVista('anno'));
  await pg.waitForTimeout(500);
  await pg.waitForTimeout(600);
  const t=await testo(pg);
  ok(/al netto/.test(t),'dice che il prospetto dell’anno è al netto');
  ok(/7\.000,00 €[^€]{0,80}7\.280,00 €/.test(t),
     'e mette i due numeri a confronto, nominandoli',
     (t.match(/è per questo[^.]{0,160}/i)||[''])[0]);
  await pg.close();
}

console.log('\n=== SE SI È FATTURATO PIÙ DEL MATURATO, NON SPARISCE ===');
{
  // Con «ancora da fatturare» a zero le righe non tornerebbero:
  // l'eccedenza si mostra per quello che è.
  const pg=await apri(`S.billing_headers[1].total_amount=20000;S.billing_headers[1].invoice_total_amount=20800;`);
  await pg.evaluate(()=>window.go('billing'));
  // la cassa e il prospetto dell’anno stanno nella vista «L’anno»:
  // la pagina si apre sul mese, ed è giusto così
  await pg.evaluate(()=>window.setBillingVista('anno'));
  await pg.waitForTimeout(500);
  await pg.waitForTimeout(600);
  const t=await testo(pg);
  const gia=euro(t,'Già fatturato');
  const ant=euro(t,'Fatturato in anticipo');
  const mat=euro(t,'= Maturato nel 2026');
  ok(vicini(gia,25000),'già fatturato 25.000,00',String(gia));
  ok(ant!==null,'compare la riga «Fatturato in anticipo»',String(ant));
  ok(vicini(gia-ant,mat),'e le righe tornano lo stesso, per sottrazione',
     `${gia} − ${ant} = ${gia-ant} contro ${mat}`);
  await pg.close();
}

// l’impostazione si ricorda: la riporto sul mese, se no il prossimo che
// apre questa pagina la trova sull’anno senza capire perché
{const pg=await apri();await pg.evaluate(()=>window.setBillingVista('mese'));await pg.waitForTimeout(400);await pg.close();}

await b.close(); srv.close();
console.log(`\n=== fatturazione chiara: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
