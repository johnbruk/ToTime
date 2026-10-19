// «Per cliente» nel Timesheet.
//
// «O mi dai sia consuntivato sia pianificato sia totale per cliente
// oppure lo togliamo». Era una riga per tipo di voce, con il solo
// importo: lo stesso cliente due volte (T&M e spese di trasferta) e
// niente pianificato. Adesso una riga per cliente e tre colonne.
//
// I rimborsi spese non sono consuntivato (il consuntivato è il lavoro:
// vedi consuntivato-senza-rimborsi.mjs), e il riepilogo sopra li mette
// «a parte»: la colonna Consuntivato deve sommare a quello che dice il
// riepilogo. In fattura però ci vanno: stanno nel totale, come nel
// «Previsto del mese» della dashboard, e sotto il nome si dice quanti.
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
// la prima cifra in euro di un testo: «+ 1.197,96 € rimborsi spese, nel totale» → 1197.96
const cifra=t=>{const m=String(t||'').match(/-?[\d.]+,\d{2}/);return m?Number(m[0].replace(/\./g,'').replace(',','.')):NaN};
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
  const c=document.querySelector('#app .perCliente');
  if(!c)return null;
  return {righe:[...c.querySelectorAll('.pcRiga:not(.pcTesta)')].map(r=>({nome:r.querySelector('.pcNome .title')?.textContent.trim(),
    nota:r.querySelector('.pcNome small')?.textContent.trim()||'',
    num:[...r.querySelectorAll('[data-l]')].map(x=>x.textContent.trim())})),
    testa:[...c.querySelectorAll('.pcTesta span')].map(x=>x.textContent.trim()),
    largo:c.scrollWidth<=c.clientWidth+1};
});
const vai=async pg=>{await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(500)};

console.log('\n=== UNA RIGA PER CLIENTE, CON CONSUNTIVATO, PIANIFICATO E TOTALE ===');
{
  const pg=await apri();await vai(pg);
  const r=await leggi(pg);
  ok(!!r,'il riquadro «Per cliente» c’è');
  ok(r.testa.join('|')==='Cliente|Consuntivato|Pianificato|Totale','le intestazioni',r.testa.join('|'));
  ok(r.righe.length===2,'una riga per cliente: Gamma non ha niente nel mese',r.righe.map(x=>x.nome).join(', '));
  const alfa=r.righe.find(x=>x.nome==='Cliente Alfa'),beta=r.righe.find(x=>x.nome==='Cliente Beta');
  ok(alfa&&alfa.num.map(eur).join('|')==='1000|1500|3697.96','Alfa: 1.000 consuntivati, 1.500 pianificati, 3.697,96 in tutto coi rimborsi',alfa&&alfa.num.join(' | '));
  ok(alfa&&/rimborsi spese/.test(alfa.nota)&&/totale/.test(alfa.nota)&&cifra(alfa.nota)===1197.96,'e sotto il nome dice quanti sono i rimborsi, e che stanno nel totale',alfa&&alfa.nota);
  ok(beta&&beta.num.map(eur).join('|')==='600|0|1000','Beta: 600 consuntivati, niente pianificato, 1.000 coi 400 di rimborsi',beta&&beta.num.join(' | '));
  ok(!/di cui/.test(alfa&&alfa.nota||''),'i rimborsi non si dicono «di cui» del consuntivato: non ne fanno parte',alfa&&alfa.nota);
  ok(r.righe.every(x=>Math.abs(eur(x.num[0])+eur(x.num[1])+(x.nota?cifra(x.nota):0)-eur(x.num[2]))<0.005),'consuntivato + pianificato + rimborsi = totale, su ogni riga');
  // Le colonne tornano con quello che dice la stessa pagina, e con la
  // dashboard: è la ragione per cui i rimborsi non stanno nel consuntivato.
  const somma=i=>Math.round(r.righe.reduce((a,x)=>a+eur(x.num[i]),0)*100)/100;
  const riep=await pg.evaluate(()=>{const m=document.querySelector('#app .metricLine');return m?m.textContent:''});
  const riepCons=eur((riep.match(/^(.*?)consuntivato/)||[])[1]);
  ok(somma(0)===1600&&somma(0)===riepCons,'la colonna Consuntivato somma a quello che dice il riepilogo: 1.600',somma(0)+' / riepilogo «'+riep.trim()+'»');
  const aparte=await pg.evaluate(()=>{const m=document.querySelector('#app .rimborsiAparte');return m?m.textContent:''});
  ok(Math.abs(r.righe.reduce((a,x)=>a+(x.nota?cifra(x.nota):0),0)-cifra(aparte))<0.005,'e i rimborsi detti sotto i nomi sono quelli «a parte» del riepilogo',aparte.trim());
  await pg.evaluate(()=>window.go('home'));await pg.waitForTimeout(400);
  const prev=await pg.evaluate(()=>{const m=document.querySelector('#app .mesePrevisto b');return m?m.textContent:''});
  const prevEur=eur(prev.split('·').pop());
  ok(Math.abs(somma(2)-prevEur)<0.005&&Math.abs(somma(2)-4697.96)<0.005,'la colonna Totale somma al «Previsto del mese» della dashboard: 4.697,96',somma(2)+' / dashboard «'+prev.trim()+'»');
  await pg.close();
}

console.log('\n=== SUL TELEFONO ===');
// Gamma con un mese pieno: 26 giorni a 700, 18.200 € — le cifre piu'
// lunghe che capitano davvero, quelle che a 320px non ci stavano.
const PIENO=`S.timesheet_entries.push({id:'g1',entry_date:'${MESE}-01',client_id:'c',hours:208,daily_rate_snapshot:700,standard_hours_snapshot:8,status:'confirmed'});`;
for(const w of [390,320]){
  const pg=await apri(PIENO,w);await vai(pg);
  const r=await leggi(pg);
  ok(r&&r.largo,`a ${w}px il riquadro non esce dallo schermo`);
  ok(r&&r.righe.length===3,`a ${w}px le righe ci sono tutte`,r&&r.righe.map(x=>x.nome+' '+x.num.join(' / ')).join(' · '));
  const tagliate=await pg.evaluate(()=>[...document.querySelectorAll('#app .perCliente [data-l]')].filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.textContent));
  ok(tagliate.length===0,`a ${w}px nessuna cifra tagliata`,tagliate.join(' | ')||'nessuna');
  // l'intestazione sul telefono non c'e': ogni cifra porta la sua
  // etichetta, scritta dal CSS (e quindi fuori da innerText)
  const etichette=await pg.evaluate(()=>[...document.querySelectorAll('#app .perCliente .pcRiga:not(.pcTesta)')][0]?[...document.querySelectorAll('#app .perCliente .pcRiga:not(.pcTesta)')][0].querySelectorAll('[data-l]').length&&[...[...document.querySelectorAll('#app .perCliente .pcRiga:not(.pcTesta)')][0].querySelectorAll('[data-l]')].map(x=>getComputedStyle(x,'::before').content).join('|'):'');
  ok(etichette==='"Consuntivato"|"Pianificato"|"Totale"',`a ${w}px ogni cifra ha la sua etichetta`,String(etichette));
  const testa=await pg.evaluate(()=>{const t=document.querySelector('#app .perCliente .pcTesta');return t?getComputedStyle(t).display:''});
  ok(testa==='none',`a ${w}px l’intestazione della tabella non si vede`,testa);
  await pg.screenshot({path:process.env.SHOT_DIR?process.env.SHOT_DIR+'/per-cliente-tel.png':'/dev/null',fullPage:false}).catch(()=>{});
  await pg.close();
}
if(process.env.SHOT_DIR){const pg=await apri();await vai(pg);const el=await pg.$('#app .perCliente');await el.screenshot({path:process.env.SHOT_DIR+'/per-cliente.png'});
  const pg2=await apri('',390);await vai(pg2);await (await pg2.$('#app .perCliente')).screenshot({path:process.env.SHOT_DIR+'/per-cliente-tel.png'});
  const pg3=await apri(PIENO,320);await vai(pg3);await (await pg3.$('#app .perCliente')).screenshot({path:process.env.SHOT_DIR+'/per-cliente-320.png'});}

await b.close();srv.close();
console.log(`\n${pass} ok, ${fail} ko`);
process.exit(fail?1:0);
