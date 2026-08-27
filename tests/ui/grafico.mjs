// Il grafico annuale della dashboard deve mostrare il consuntivato mese
// per mese, non cumulato. Prima sommava, quindi disegnava sempre una
// salita: sembrava il fatturato che cresce, e non diceva nulla su come
// fosse andato il singolo mese. Qui si verifica proprio quello.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};

// Dodici mesi con valori volutamente diversi fra loro: se il grafico
// cumulasse, la spezzata salirebbe e basta.
const ORE =[10,14, 9,17,12,20,11,16, 0, 0, 0, 0];
const PIAN=[ 0, 0, 0, 0, 0, 0, 0, 6,14,10, 8, 4];
const TARIFFA=480, STD=8;
const righe=[];
ORE.forEach((h,i)=>{if(h)righe.push(`{id:'r${i}',entry_date:'2026-${String(i+1).padStart(2,'0')}-10',client_id:'c1',project_id:'p1',activity_id:'a1',hours:${h},daily_rate_snapshot:${TARIFFA},standard_hours_snapshot:${STD}}`)});
PIAN.forEach((h,i)=>{if(h)righe.push(`{id:'q${i}',entry_date:'2026-${String(i+1).padStart(2,'0')}-25',client_id:'c1',project_id:'p2',activity_id:'a1',hours:${h},status:'planned',tm_batch_id:'tm_x',daily_rate_snapshot:${TARIFFA},standard_hours_snapshot:${STD}}`)});
const monthNames=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const attesoCons=ORE.map(h=>h*TARIFFA/STD);
const attesoPian=PIAN.map(h=>h*TARIFFA/STD);

const server=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}
    if(p.endsWith('mock.html')){b=Buffer.from(b.toString().replace(/timesheet_entries:\[[\s\S]*?\n  \],/,'timesheet_entries:['+righe.join(',')+'],'));}
    s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>server.listen(0,r));
const port=server.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};
// I separatori delle migliaia cambiano fra Node e il browser: si
// confrontano i numeri, non la loro punteggiatura.
const num=t=>Number(String(t).replace(/[^0-9,.]/g,'').replace(/\./g,'').replace(',','.'))||0;

const pg=await b.newPage({viewport:{width:1280,height:900}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(900);
await pg.evaluate(()=>window.go('home'));
await pg.waitForTimeout(400);

console.log('\n=== A. Il grafico c\'è, ed è mensile ===');
ok(await pg.$('.annualChartBox')!==null,'il grafico annuale è presente nella dashboard');
const consY=await pg.evaluate(()=>{const p=document.querySelector('.lineChart polyline.pCons');
  return p?p.getAttribute('points').trim().split(/\s+/).map(t=>Number(t.split(',')[1])):[]});
ok(consY.length===8,'la spezzata del consuntivato copre i mesi già trascorsi',consY.length+' punti');
// In SVG l'asse y cresce verso il basso: cumulare significherebbe y sempre
// calante. Se sale e scende, i mesi sono indipendenti.
const sale=consY.some((v,i)=>i>0&&v>consY[i-1]);
const scende=consY.some((v,i)=>i>0&&v<consY[i-1]);
ok(sale&&scende,'la curva sale e scende: i mesi non sono cumulati',sale&&scende?'andamento reale':'monotona — è ancora cumulata');
const monotona=consY.every((v,i)=>i===0||v<=consY[i-1]);
ok(!monotona,'non è la salita continua del cumulato');

console.log('\n=== B. I valori sono quelli veri, mese per mese ===');
const tips=await pg.evaluate(()=>[...document.querySelectorAll('.chHit .tip')].map(t=>t.textContent.replace(/ /g,' ')));
ok(tips.length===12,'ogni mese ha la sua lettura al passaggio del mouse',tips.length+' mesi');
const letto=tips.map(t=>{const m=t.match(/Consuntivato\s*([0-9.,]+)/),q=t.match(/Pianificato\s*([0-9.,]+)/);
  return {c:num(m&&m[1]),p:num(q&&q[1])}});
const erratiC=letto.filter((v,i)=>Math.abs(v.c-attesoCons[i])>0.005);
const erratiP=letto.filter((v,i)=>Math.abs(v.p-attesoPian[i])>0.005);
ok(erratiC.length===0,'il consuntivato di ogni mese corrisponde ai dati',
  erratiC.length?erratiC.length+' mesi sbagliati':'12 mesi: '+letto.map(v=>v.c).join(' '));
ok(erratiP.length===0,'e cosi il pianificato dei mesi futuri',
  erratiP.length?erratiP.length+' mesi sbagliati':letto.map(v=>v.p).join(' '));
ok(Math.abs(letto[6].c-660)<0.005,'esempio: a luglio 11 h a 60 euro/h fanno 660 euro',letto[6].c+'');
// La prova del nove contro il cumulato: la somma dei dodici mesi deve
// fare il totale dell'anno, e nessun mese puo valere quanto il totale.
const somma=letto.reduce((s,v)=>s+v.c,0);
const totale=attesoCons.reduce((a,b)=>a+b,0);
ok(Math.abs(somma-totale)<0.005,'i dodici mesi sommati danno il totale dell anno',somma+' = '+totale);
ok(letto[7].c<totale-0.005,'e l ultimo mese non vale gia tutto l anno, come faceva il cumulato',letto[7].c+' < '+totale);

console.log('\n=== C. Le due serie si distinguono senza usare il colore ===');
const stile=await pg.evaluate(()=>{const c=document.querySelector('.pCons'),p=document.querySelector('.pPlan');
  const g=el=>el?getComputedStyle(el):null;return {cons:g(c)?.strokeDasharray||'',plan:g(p)?.strokeDasharray||'',
    dotC:document.querySelectorAll('.chDots i.dC').length,dotP:document.querySelectorAll('.chDots i.dP').length,
    rC:g(document.querySelector('.chDots i.dC'))?.borderRadius,rP:g(document.querySelector('.chDots i.dP'))?.borderRadius,
    legenda:document.querySelectorAll('.annualChartBox .segLegend .li').length}});
ok(/none|^$/.test(stile.cons)&&/\d/.test(stile.plan),'il consuntivato è continuo, il pianificato tratteggiato',stile.plan||'—');
ok(stile.rC!==stile.rP,'i punti hanno forme diverse: tondi e quadrati',stile.rC+' vs '+stile.rP);
ok(stile.legenda===2,'la legenda nomina entrambe le serie',stile.legenda+' voci');
ok(stile.dotC===8&&stile.dotP===5,'un punto per ogni mese con un valore',stile.dotC+' consuntivati · '+stile.dotP+' pianificati');

// La riga del pianificato non deve strisciare sullo zero da gennaio:
// parte dal primo mese in cui c'è davvero qualcosa (agosto, indice 7)
// e finisce sull'ultimo (dicembre, indice 11).
const planX=await pg.evaluate(()=>{const p=document.querySelector('.lineChart polyline.pPlan');
  return p?p.getAttribute('points').trim().split(/\s+/).map(t=>Number(t.split(',')[0])):[]});
const primoPian=PIAN.findIndex(v=>v>0);
let ultimoPian=-1;PIAN.forEach((v,i)=>{if(v>0)ultimoPian=i});
const atteso=i=>Number((i/11*100).toFixed(2));
ok(planX.length===ultimoPian-primoPian+1,'la riga del pianificato copre solo i mesi pianificati',planX.length+' punti invece di 12');
ok(Math.abs(planX[0]-atteso(primoPian))<0.05,'parte dal primo mese con del pianificato',monthNames[primoPian]);
ok(Math.abs(planX[planX.length-1]-atteso(ultimoPian))<0.05,'e finisce sull\'ultimo',monthNames[ultimoPian]);
ok(planX[0]>0.05,'non parte da gennaio strisciando sullo zero','x = '+planX[0]+'%');

console.log('\n=== D. La lettura al passaggio del mouse ===');
const cols=await pg.$$('.chHit>span');
ok(cols.length===12,'dodici colonne sensibili, una per mese',cols.length+'');
const prima=await pg.evaluate(()=>getComputedStyle(document.querySelector('.chHit .tip')).display);
ok(prima==='none','la lettura resta nascosta finché non serve');
await cols[8].hover();await pg.waitForTimeout(250);
const dopo=await pg.evaluate(()=>{const t=document.querySelectorAll('.chHit>span')[8].querySelector('.tip');
  const r=t.getBoundingClientRect();const p=document.querySelector('.chPlot').getBoundingClientRect();
  return {display:getComputedStyle(t).display,testo:t.textContent.replace(/ /g,' '),
    dentro:r.left>=p.left-1&&r.right<=window.innerWidth}});
ok(dopo.display!=='none','passandoci sopra compare');
ok(/Settembre 2026/.test(dopo.testo),'e dice di che mese si tratta',dopo.testo.replace(/\s+/g,' ').slice(0,44));
ok(dopo.dentro,'senza uscire dallo schermo');
// il mese all'estremo destro è quello che rischia di sfondare
await cols[11].hover();await pg.waitForTimeout(250);
const ultimo=await pg.evaluate(()=>{const t=document.querySelectorAll('.chHit>span')[11].querySelector('.tip');
  const r=t.getBoundingClientRect();return r.right<=window.innerWidth+1&&r.left>=0});
ok(ultimo,'anche dicembre, all\'estremo destro, resta dentro');

console.log('\n=== E. Anno senza pianificato ===');
await pg.evaluate(()=>{window.openMonthTimesheet(2024,5);window.go('home')});
await pg.waitForTimeout(400);
const senzaPlan=await pg.evaluate(()=>({
  c:!!document.querySelector('.annualChartBox'),
  plan:!!document.querySelector('.pPlan'),
  leg:document.querySelectorAll('.annualChartBox .segLegend .li').length}));
ok(senzaPlan.c,'un anno senza dati non rompe il grafico');
ok(senzaPlan.leg===1,'e senza pianificato la legenda mostra una sola serie',senzaPlan.leg+' voce');

console.log('\n=== F. L\'asse dei valori ===');
const asse=await pg.evaluate(()=>{
  const casi=[0,480,660,1200,1740,5700,20917,85000];
  return casi.map(v=>{const m=window.niceMax(v);
    return {v,m,alto:window.fmtAxis(m),mezzo:window.fmtAxis(m/2),uso:v>0?v/m:1}})});
const doppie=asse.filter(a=>a.alto===a.mezzo&&a.v>0);
ok(doppie.length===0,'l\'asse non ripete mai due volte la stessa etichetta',
  doppie.map(d=>d.alto).join(' ')||asse.map(a=>a.alto).join(' '));
const stretti=asse.filter(a=>a.uso<0.6);
ok(stretti.length===0,'il massimo dell\'asse non spreca altezza',
  stretti.map(s=>s.v+'/'+s.m).join(' ')||'dal '+Math.round(Math.min(...asse.map(a=>a.uso))*100)+'% in su');
ok(asse.every(a=>a.m>=a.v),'e non taglia mai il valore più alto');
// a mese vuoto l'asse diceva «1 € / 1 € / 0»
await pg.evaluate(()=>{window.openMonthTimesheet(2024,5);window.go('timesheet')});
await pg.waitForTimeout(350);
const vuoto=await pg.evaluate(()=>[...document.querySelectorAll('.lineChartY span')].map(e=>e.textContent));
ok(new Set(vuoto.filter(Boolean)).size===vuoto.filter(Boolean).length,
  'anche su un mese senza dati non ci sono etichette ripetute','['+vuoto.join('] [')+']');

await b.close();server.close();
console.log('\n'+(errs.length?('ERRORI JS:\n'+errs.join('\n')):'✓ nessun errore JS'));
console.log(`RISULTATO: ${pass} OK / ${fail} KO`);
if(fail||errs.length)process.exitCode=1;
