// Il riquadro del mese, in dashboard.
//
// «Non lo leggo mai bene». Erano tre colonne di giorni con lo stesso
// peso — consuntivate, pianificate e la loro somma — e gli euro in una
// frase sotto; i rimborsi spese in un'altra riga ancora, «a parte»,
// anche se in fattura ci vanno.
//
// Adesso: il consuntivato in grande; una barra e una legenda con
// consuntivato, pianificato e rimborsi spese; il previsto del mese; e
// sotto, in grigio, il previsto di ogni cliente. Le voci si chiamano
// come nel resto dell'app: «consuntivato», mai «fatto».
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
const gior=t=>Number(String((t||'').match(/([\d.,]+) gg/)?.[1]||'NaN').replace(/\./g,'').replace(',','.'));
const MESE=new Date().toISOString().slice(0,7);
// Due clienti. Alfa: 2 giorni consuntivati e 3 pianificati a 500, piu'
// 1.197,96 di rimborsi. Beta: 1 giorno consuntivato a 600 e 400 di
// rimborsi. Le date pianificate stanno dopo oggi, quelle consuntivate
// prima: e' cosi' che l'app le distingue.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'a',name:'Cliente Alfa',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true},
             {id:'b',name:'Cliente Beta',daily_rate:600,standard_hours:8,compensation_type:'daily_rate_8h',active:true},
             {id:'c',name:'Cliente Gamma',daily_rate:700,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[];S.monthly_compensations=[];S.manual_entries=[];S.billing_headers=[];S.trips=[];
  const r=(id,c,data,h,rate,stato)=>({id,entry_date:data,client_id:c,hours:h,daily_rate_snapshot:rate,standard_hours_snapshot:8,status:stato});
  S.timesheet_entries=[
    r('a1','a','${MESE}-01',8,500,'confirmed'),r('a2','a','${MESE}-02',8,500,'confirmed'),
    r('ap1','a','${MESE}-01',8,500,'planned'),r('ap2','a','${MESE}-02',8,500,'planned'),r('ap3','a','${MESE}-03',8,500,'planned'),
    r('b1','b','${MESE}-03',8,600,'confirmed')];
  S.travel_expenses=[
    {id:'x1',expense_date:'${MESE}-04',client_id:'a',amount:1197.96,expense_type:'invoice',reimbursable:true},
    {id:'x2',expense_date:'${MESE}-05',client_id:'b',amount:400,expense_type:'invoice',reimbursable:true}];
`;
const apri=async(extra='',w=1280)=>{
  const pg=await b.newPage({viewport:{width:w,height:1200},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  // Il Chromium dei test raggruppa anche le quattro cifre, i browser
  // veri in italiano no: «4888,75 €». Lo si rifa' qui, altrimenti il
  // controllo del puntino passerebbe comunque.
  await pg.addInitScript(()=>{
    const Orig=Intl.NumberFormat;
    Intl.NumberFormat=function(loc,opt){const f=new Orig(loc,opt);
      return {format:n=>{const t=f.format(n);return /^it/.test(String(loc))?t.replace(/^(-?)(\d)\.(\d{3}),/,'$1$2$3,'):t},
        formatToParts:n=>f.formatToParts(n),resolvedOptions:()=>f.resolvedOptions()}};
  });
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI+extra);
  await pg.evaluate(()=>window.reload());await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.go('home'));await pg.waitForTimeout(500);
  return pg;
};
const leggi=pg=>pg.evaluate(()=>{
  const c=document.querySelector('#app .meseCard');
  if(!c)return null;
  return {
    titolo:c.querySelector('.meseTesta b')?.textContent.trim(),
    grande:c.querySelector('.meseGrande')?.textContent.trim(),
    sotto:c.querySelector('.meseSotto')?.textContent.trim(),
    voci:[...c.querySelectorAll('.meseLegenda .voce')].map(v=>v.textContent.replace(/\s+/g,' ').trim()),
    barra:[...c.querySelectorAll('.meseBarra i')].map(i=>({k:i.className,w:parseFloat(i.style.width)})),
    previsto:c.querySelector('.mesePrevisto b')?.textContent.trim(),
    clienti:[...c.querySelectorAll('.meseClienti div')].map(d=>[...d.children].map(x=>x.textContent.trim())),
    grigi:[...c.querySelectorAll('.meseClienti div')].every(d=>getComputedStyle(d).color===getComputedStyle(document.querySelector('.meseSotto')).color),
    testo:c.innerText.replace(/\s+/g,' ')};
});

console.log('\n=== UN NUMERO IN GRANDE: IL CONSUNTIVATO ===');
{
  const pg=await apri();
  const r=await leggi(pg);
  ok(!!r,'il riquadro c’è');
  ok(/^Consuntivo · /.test(r.titolo),'il titolo dice il mese',r.titolo);
  // 2 giorni a 500 + 1 a 600
  ok(eur(r.grande)===1600,'in grande il consuntivato: 2 × 500 + 1 × 600 = 1.600,00',r.grande);
  ok(/^consuntivato: 3,00 giorni · 24,0 h$/.test(r.sotto),'e sotto i giorni e le ore consuntivati',r.sotto);
  ok(!/\bfatto\b/i.test(r.testo),'la parola è «consuntivato», mai «fatto»',(r.testo.match(/.{0,20}\bfatto\b.{0,20}/i)||[''])[0]||'nessun «fatto»');
  await pg.close();
}

console.log('\n=== CONSUNTIVATO, PIANIFICATO E RIMBORSI, CHE IN FATTURA CI VANNO ===');
{
  const pg=await apri();
  const r=await leggi(pg);
  ok(r.voci.length===3,'la legenda ha tre voci',r.voci.join(' | '));
  const [c,p,rb]=r.voci;
  ok(/^Consuntivato 3,00 gg · 1\.600,00 €$/.test(c),'consuntivato: giorni ed euro sulla stessa riga',c);
  ok(/^Pianificato 3,00 gg · 1\.500,00 €$/.test(p),'pianificato: 3 giorni a 500',p);
  ok(/^Rimborsi spese · 1\.597,96 €$/.test(rb),'rimborsi spese: 1.197,96 + 400',rb);
  ok(gior(r.previsto)===6,'il previsto conta 6 giorni: i rimborsi non sono giorni',r.previsto);
  ok(Math.abs(eur(r.previsto.split('·')[1])-(1600+1500+1597.96))<0.005,
     'e in euro è la somma delle tre voci: 4.697,96',r.previsto);
  const larg=Object.fromEntries(r.barra.map(x=>[x.k,x.w]));
  ok(r.barra.length===3,'la barra ha tre pezzi',r.barra.map(x=>x.k).join(','));
  ok(Math.abs(larg.f-1600/4697.96*100)<0.05&&Math.abs(larg.p-1500/4697.96*100)<0.05&&Math.abs(larg.r-1597.96/4697.96*100)<0.05,
     'ognuno lungo quanto il suo importo',JSON.stringify(larg));
  await pg.close();
}

console.log('\n=== SOTTO, IN GRIGIO, IL PREVISTO DI OGNI CLIENTE ===');
{
  const pg=await apri();
  const r=await leggi(pg);
  ok(r.clienti.length===2,'due clienti: Gamma nel mese non ha niente, e non compare',r.clienti.map(x=>x[0]).join(', '));
  const alfa=r.clienti.find(x=>x[0]==='Cliente Alfa'),beta=r.clienti.find(x=>x[0]==='Cliente Beta');
  ok(alfa&&eur(alfa[1])===3697.96,'Alfa: 1.000 consuntivati + 1.500 pianificati + 1.197,96 di rimborsi',alfa&&alfa[1]);
  ok(beta&&eur(beta[1])===1000,'Beta: 600 consuntivati + 400 di rimborsi',beta&&beta[1]);
  ok(r.clienti[0][0]==='Cliente Alfa','dal più grande',r.clienti.map(x=>x[0]).join(', '));
  const somma=r.clienti.reduce((a,x)=>a+eur(x[1]),0);
  ok(Math.abs(somma-eur(r.previsto.split('·')[1]))<0.005,'e i clienti sommano al previsto del mese',`${somma.toFixed(2)} contro ${r.previsto}`);
  ok(r.grigi,'scritti in grigio, come le note');
  await pg.close();
}

console.log('\n=== GLI EURO HANNO SEMPRE IL PUNTINO DELLE MIGLIAIA ===');
{
  // «4888,75 €» accanto a «13.048,75 €» sembrava un errore: la regola
  // italiana non raggruppa le quattro cifre, qui si raggruppa sempre.
  const pg=await apri();
  const r=await leggi(pg);
  // il testimone: altrove, dove si usa il formato di sempre, le quattro
  // cifre restano senza puntino — quindi qui il browser fa come il vero
  const altrove=await testo(pg);
  ok(/\b1600,00\s?€/.test(altrove),'(testimone: fuori dal riquadro «1600,00 €» resta senza puntino)',
     (altrove.match(/\b1\.?600,00\s?€/)||[''])[0]);
  const senza=(r.testo.match(/\b\d{4,},\d{2}\s?€/g)||[]);
  ok(senza.length===0,'nel riquadro nessun importo di quattro cifre senza puntino',senza.join(' | ')||'nessuno');
  await pg.close();
}

console.log('\n=== QUELLO CHE NON C’È NON SI MOSTRA ===');
{
  // Niente pianificato e niente rimborsi: restano il consuntivato e il
  // previsto, senza voci a zero che allungano la legenda.
  const pg=await apri(`S.timesheet_entries=S.timesheet_entries.filter(e=>e.status!=='planned');S.travel_expenses=[];`);
  const r=await leggi(pg);
  ok(r.voci.length===1&&/^Consuntivato/.test(r.voci[0]),'solo il consuntivato in legenda',r.voci.join(' | '));
  ok(r.barra.length===1,'e un pezzo solo di barra',String(r.barra.length));
  await pg.close();
  // Un mese vuoto: nessuna barra e nessun cliente, ma il riquadro c'e'
  const vuoto=await apri(`S.timesheet_entries=[];S.travel_expenses=[];`);
  const v=await leggi(vuoto);
  ok(!!v&&eur(v.grande)===0&&v.barra.length===0&&v.clienti.length===0,'un mese vuoto dice 0,00 €, senza barra né clienti',
     v?`${v.grande} · barra ${v.barra.length} · clienti ${v.clienti.length}`:'nessun riquadro');
  await vuoto.close();
}

console.log('\n=== SUL TELEFONO SI LEGGE ===');
{
  const pg=await apri('',390);
  const r=await pg.evaluate(()=>{
    const c=document.querySelector('#app .meseCard');
    const W=document.documentElement.clientWidth;
    const voci=[...c.querySelectorAll('.meseLegenda .voce')].map(v=>v.getBoundingClientRect());
    return {sfora:[...c.querySelectorAll('*')].some(el=>el.getBoundingClientRect().right>W+1),
      unaPerRiga:voci.every((v,i)=>i===0||v.top>=voci[i-1].bottom-1)};
  });
  ok(!r.sfora,'niente esce dallo schermo');
  ok(r.unaPerRiga,'la legenda va una voce per riga');
  await pg.close();
}

console.log('\n=== NEL RIQUADRO DELL’ANNO, IL TOTALE PREVISTO ===');
{
  // «Oltre ad anno in corso e pianificato, metti pure il totale annuo
  // previsto». E' lo stesso numero della pagina Fatturazione › L'anno,
  // «Previsione ricavi»: preso da li', i due non possono divergere.
  const pg=await apri();
  const anno=await pg.evaluate(()=>{
    const c=document.querySelector('#app .heroCard');
    return {kpi:[...c.querySelectorAll('.kpiGrid strong')].map(x=>x.textContent.trim()),
      riga:c.querySelector('.annoPrevisto')?.innerText.replace(/\s+/g,' ').trim()||''};
  });
  ok(/^Totale previsto \d{4}/.test(anno.riga),'c’è il totale previsto dell’anno',anno.riga||'non c’è');
  const prev=eur(anno.riga.match(/([\d.,]+)\s?€/)?.[1]);
  ok(Math.abs(prev-(1600+1500+1597.96))<0.005,'consuntivato + pianificato + rimborsi: 4.697,96',String(prev));
  ok(/rimborsi spese compresi/.test(anno.riga),'e dice che i rimborsi sono compresi');
  await pg.evaluate(()=>window.go('billingAnno'));await pg.waitForTimeout(500);
  const t=await testo(pg);
  const ric=eur((t.match(/= Previsione ricavi \d{4}[^€]*?([\d.,]+)\s?€/)||[])[1]);
  ok(Math.abs(ric-prev)<0.005,'ed è la «Previsione ricavi» di Fatturazione › L’anno',`${prev} contro ${ric}`);
  await pg.close();
}
{
  // Niente pianificato e niente rimborsi: il previsto sarebbe il
  // consuntivato ripetuto, e non si mostra.
  const pg=await apri(`S.timesheet_entries=S.timesheet_entries.filter(e=>e.status!=='planned');S.travel_expenses=[];`);
  const riga=await pg.evaluate(()=>!!document.querySelector('#app .heroCard .annoPrevisto'));
  ok(!riga,'senza pianificato né rimborsi non si ripete il consuntivato');
  await pg.close();
}
{
  // Le cifre di fine anno non si tagliano: «14.135,4…» era il difetto
  // della prima stesura, col previsto come terza colonna.
  const pg=await apri(`S.timesheet_entries.push({id:'big',entry_date:'${MESE}-01',client_id:'a',hours:8*180,daily_rate_snapshot:500,standard_hours_snapshot:8,status:'planned'});`,360);
  const tagliati=await pg.evaluate(()=>[...document.querySelectorAll('#app .heroCard strong,#app .heroCard .annoPrevisto b,#app .meseCard .mesePrevisto b')]
    .filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.textContent.trim()));
  ok(tagliati.length===0,'su un telefono stretto nessuna cifra è troncata, anche sopra i 90.000',tagliati.join(' | ')||'nessuna');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== riquadro del mese: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
