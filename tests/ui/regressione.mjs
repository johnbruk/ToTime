// Regressione ampia: tutte le 45 viste della mappa, a tre larghezze e
// nei due temi, più i flussi veri (creare, modificare, cancellare) e la
// coerenza dei numeri fra una vista e l'altra. Serve a prendere quello
// che i test mirati non guardano: una modifica globale al foglio di
// stile o al render tocca schermate che nessuno ricontrolla a mano.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>server.listen(0,r));
const port=server.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

// Le viste si leggono dalla mappa vera del render: se se ne aggiunge
// una, questo test la prende da solo senza che nessuno lo aggiorni.
const src=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
const i0=src.indexOf('const map={home');
const VISTE=src.slice(i0+11,src.indexOf('};',i0)).split(',').map(x=>x.split(':')[0].trim()).filter(Boolean);
const num=t=>Number(String(t).replace(/[^0-9,.]/g,'').replace(/\./g,'').replace(',','.'))||0;

console.log(`\n=== A. Tutte le ${VISTE.length} viste, tre larghezze, due temi ===`);
const rotte=[],vuote=[],sbordate=[],erroriJS=[];
for(const [w,h,nome] of [[360,740,'telefono'],[768,1024,'tablet'],[1440,900,'desktop']]){
  for(const tema of ['light','dark']){
    const pg=await b.newPage({viewport:{width:w,height:h}});
    pg.on('pageerror',e=>erroriJS.push(`${nome}/${tema}: ${e.message}`));
    await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
    await pg.waitForTimeout(700);
    await pg.evaluate(t=>document.documentElement.setAttribute('data-theme',t),tema);
    for(const v of VISTE){
      const r=await pg.evaluate(x=>{
        try{window.go(x)}catch(e){return {err:String(e&&e.message||e)}}
        const app=document.getElementById('app');
        return {len:(app.innerHTML||'').length,
          ovf:document.documentElement.scrollWidth>document.documentElement.clientWidth+1};
      },v).catch(e=>({err:String(e.message).slice(0,90)}));
      await pg.waitForTimeout(45);
      if(r.err)rotte.push(`${nome}/${tema}/${v}: ${r.err}`);
      else{
        if(r.len<120)vuote.push(`${nome}/${tema}/${v} (${r.len})`);
        if(r.ovf)sbordate.push(`${nome}/${tema}/${v}`);
      }
    }
    await pg.close();
  }
}
const totale=VISTE.length*6;
ok(rotte.length===0,'nessuna vista va in errore aprendola',rotte.slice(0,3).join(' | ')||totale+' aperture');
ok(vuote.length===0,'nessuna vista si apre vuota',vuote.slice(0,4).join(' | ')||'tutte con contenuto');
ok(sbordate.length===0,'nessuna vista scorre lateralmente',sbordate.slice(0,4).join(' | ')||'nessuna');
ok(erroriJS.length===0,'nessun errore JS in tutta la navigazione',erroriJS.slice(0,2).join(' | ')||'nessuno');

console.log('\n=== B. I numeri concordano fra una vista e l\'altra ===');
const pg=await b.newPage({viewport:{width:1280,height:900}});
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
await pg.waitForTimeout(800);
const leggi=async(vista,sel)=>{await pg.evaluate(v=>window.go(v),vista);await pg.waitForTimeout(250);
  return pg.evaluate(s=>{const e=document.querySelector(s);return e?e.textContent:''},sel)};
// dashboard: consuntivato dell'anno
const annoHome=num(await leggi('home','.heroCard .kpiGrid strong'));
// dettaglio mese per mese: stessa cifra nel totale
const annoDett=num(await leggi('annualMonths','.card .kpiGrid strong'));
ok(Math.abs(annoHome-annoDett)<0.02,'il consuntivato annuo è lo stesso in dashboard e nel dettaglio',annoHome+' = '+annoDett);
// e la somma delle righe mensili deve ricostruirlo
const righeMesi=await pg.evaluate(()=>[...document.querySelectorAll('.list .row .value')].map(e=>e.textContent));
const sommaMesi=righeMesi.map(num).reduce((a,c)=>a+c,0);
ok(Math.abs(sommaMesi-annoDett)<0.02,'i dodici mesi elencati sommano al totale dell\'anno',sommaMesi+' = '+annoDett);
// il grafico deve raccontare la stessa cosa
await pg.evaluate(()=>window.go('home'));await pg.waitForTimeout(300);
const tip=await pg.evaluate(()=>[...document.querySelectorAll('.chHit .tip')].map(t=>t.textContent));
const sommaGrafico=tip.map(t=>{const m=t.match(/Consuntivato\s*([0-9.,]+)/);return num(m&&m[1])}).reduce((a,c)=>a+c,0);
ok(Math.abs(sommaGrafico-annoHome)<0.02,'e il grafico mese per mese somma allo stesso totale',sommaGrafico+' = '+annoHome);

console.log('\n=== C. Creare, modificare, cancellare un consuntivo ===');
const oreDi=async()=>{await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(300);
  // solo le righe dei consuntivi: nella stessa pagina c'è anche il
  // riepilogo per cliente, che usa le stesse classi
  return pg.evaluate(()=>[...document.querySelectorAll('#app .list .row')]
    .filter(r=>/editEntry|toggleSel/.test(r.getAttribute('onclick')||'')).length)};
const archivio=()=>pg.evaluate(()=>window.__stores.timesheet_entries.length);
const primaRighe=await oreDi();
const primaArch=await archivio();
const primaTot=num(await leggi('home','.cardLink .kpiGrid strong'));
await pg.evaluate(()=>window.go('dailyForm'));await pg.waitForTimeout(300);
const campi=await pg.evaluate(()=>({data:!!document.querySelector('[name="entry_date"]'),
  cliente:!!document.querySelector('[name="client_id"]'),ore:!!document.querySelector('[name="hours"]')}));
ok(campi.data&&campi.cliente&&campi.ore,'il modulo del consuntivo giornaliero ha i suoi campi');
// Un giorno feriale qualsiasi del mese in corso: il 15 agosto è
// Ferragosto e guardDay() chiede giustamente conferma, che qui
// accettiamo comunque per non dipendere dal calendario.
pg.on('dialog',d=>d.accept());
// Deve essere un giorno feriale GIÀ TRASCORSO del mese in corso: una
// voce datata domani l'app la conta — giustamente — come pianificata,
// non come consuntivata, e le ore del mese non si muoverebbero.
const oggi=await pg.evaluate(()=>{const d=new Date();
  for(let g=d.getDate();g>=1;g--){const x=new Date(d.getFullYear(),d.getMonth(),g);
    if(x.getDay()>=1&&x.getDay()<=5)
      return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(g).padStart(2,'0')}`}
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});
await pg.fill('[name="entry_date"]',oggi);
await pg.fill('[name="hours"]','8');
await pg.evaluate(()=>document.querySelector('form.form').requestSubmit());
await pg.waitForTimeout(600);
const dopoArch=await archivio();
ok(dopoArch===primaArch+1,'il consuntivo viene davvero salvato',primaArch+' → '+dopoArch+' voci');
const dopoRighe=await oreDi();
ok(dopoRighe===primaRighe+1,'e compare una riga in più nel timesheet del mese',primaRighe+' → '+dopoRighe);
const dopoTot=num(await leggi('home','.cardLink .kpiGrid strong'));
ok(dopoTot>primaTot,'le ore consuntivate del mese sono aumentate (giorno passato, non pianificato)',
  primaTot+' → '+dopoTot+' h il '+oggi);
// modifica
await pg.evaluate(()=>window.go('timesheet'));await pg.waitForTimeout(300);
const apribile=await pg.evaluate(()=>{
  const r=[...document.querySelectorAll('#app .list .row')].find(x=>/editEntry/.test(x.getAttribute('onclick')||''));
  if(!r)return false;r.click();return true});
await pg.waitForTimeout(450);
const modifica=await pg.evaluate(()=>({titolo:document.querySelector('#app h1')?.textContent||'',
  ore:document.querySelector('[name="hours"]')?.value}));
ok(apribile,'la riga del timesheet è apribile in modifica');
ok(/Modifica/i.test(modifica.titolo),'e si apre proprio la schermata di modifica',modifica.titolo);
ok(modifica.ore==='8','con dentro le ore che avevo salvato',modifica.ore+' h');
// cancellazione
const primaDelete=await archivio();
await pg.evaluate(async()=>{const id=window.__stores.timesheet_entries.slice(-1)[0].id;
  await window.deleteDaily(id);});
await pg.waitForTimeout(700);
const dopoDelete=await archivio();
ok(dopoDelete===primaDelete-1,'e la si può cancellare dall\'app, non solo dall\'archivio',primaDelete+' → '+dopoDelete+' voci');
const righeFinali=await oreDi();
ok(righeFinali===primaRighe,'il timesheet torna com\'era prima della prova',primaRighe+' → '+righeFinali);

console.log('\n=== D. Le viste che dipendono da una selezione ===');
// Queste viste non si raggiungono con go(): vogliono un elemento
// selezionato. Si aprono con la funzione vera dell'app e si controlla
// che la schermata cambi davvero, non che resti quella di prima.
const selezioni=[
  ['giorno',            'openDay',           ['2026-07-10']],
  ['dettaglio fattura', 'openInvoiceDetail', ['c1',2026,7]],
  ['fatture emesse',    'openAnnualInvoices',['issued']],
  ['timesheet del mese','openMonthTimesheet',[2026,7]]];
for(const [etichetta,fn,args] of selezioni){
  await pg.evaluate(()=>window.go('home'));await pg.waitForTimeout(200);
  const prima=await pg.evaluate(()=>document.querySelector('#app h1')?.textContent||'');
  const esiste=await pg.evaluate(f=>typeof window[f]==='function',fn);
  await pg.evaluate(([f,a])=>window[f](...a),[fn,args]);
  await pg.waitForTimeout(350);
  const dopo=await pg.evaluate(()=>({t:document.querySelector('#app h1')?.textContent||'',
    len:document.getElementById('app').innerHTML.length}));
  ok(esiste,`la funzione ${fn} è raggiungibile`);
  ok(dopo.t!==prima&&dopo.len>400,`e apre davvero ${etichetta}`,dopo.t.slice(0,40)+' ('+dopo.len+' caratteri)');
}

console.log('\n=== E. Il menu porta dove dice ===');
await pg.evaluate(()=>window.go('menu'));await pg.waitForTimeout(300);
const voci=await pg.evaluate(()=>[...document.querySelectorAll('#app [onclick]')]
  .map(e=>(e.getAttribute('onclick')||'').match(/go\('([a-zA-Z]+)'\)/)).filter(Boolean).map(m=>m[1]));
const inesistenti=[...new Set(voci)].filter(v=>!VISTE.includes(v));
ok(inesistenti.length===0,'ogni voce del menu punta a una vista che esiste',inesistenti.join(', ')||voci.length+' collegamenti');

console.log('\n=== F. Temi e persistenza ===');
for(const t of ['light','dark']){
  const c=await pg.evaluate(tema=>{document.documentElement.setAttribute('data-theme',tema);
    window.go('home');
    const s=getComputedStyle(document.body);
    return {bg:s.backgroundColor,fg:s.color}},t);
  const diverso=c.bg!==c.fg&&c.bg!=='rgba(0, 0, 0, 0)';
  ok(diverso,`nel tema ${t==='light'?'chiaro':'scuro'} sfondo e testo sono definiti e diversi`,c.bg+' su '+c.fg);
}

ok(errs.length===0,'nessun errore JS durante i flussi',errs.slice(0,2).join(' | ')||'nessuno');
await b.close();server.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
