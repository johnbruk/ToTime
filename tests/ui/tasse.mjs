// Le scadenze fiscali, guardate nei tre modi.
//
// Prima c'era un modo solo, il raggruppamento per anno di riferimento,
// e dentro quei gruppi le date si accavallavano: il «Riferimento 2026»
// conteneva una scadenza del 30/06/2027, e anche il «Riferimento 2027».
// Scorrendo l'elenco non si leggeva in nessun punto l'ordine in cui le
// cose vanno pagate, e niente diceva che due erano gia' scadute.
//
// Adesso: per scadenza (quando devo pagare), per riferimento (a quale
// anno appartiene), e la linea del tempo, che e' le due cose insieme.
// Piu' quanto mettere da parte al mese per arrivarci.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT=new URL('../..',import.meta.url).pathname.replace(/\/$/,'');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){s.writeHead(404);s.end('x');return;}s.writeHead(200,{'content-type':MIME[path.extname(p)]||'text/plain'});s.end(b);});});
await new Promise(r=>srv.listen(0,r));
const port=srv.address().port;
const b=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
let pass=0,fail=0;
const ok=(c,l,x='')=>{c?pass++:fail++;console.log((c?'  OK  ':'  KO  ')+l+(x?'  → '+x:''))};

// Otto fatture incassate sopra la soglia del bollo: nascono scadenze
// vere, due delle quali gia' passate rispetto a oggi.
const apri=async w=>{
  const pg=await b.newPage({viewport:{width:w,height:1600},hasTouch:w<900});
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);
  await pg.evaluate(()=>{const S=window.__stores;
    S.billing_headers=[1,2,3,4,5,6,7,8].map(m=>({id:'bh'+m,client_id:'c1',year:2026,month:m,
      status:'collected',invoice_number:'#'+m,invoice_date:'2026-'+String(m).padStart(2,'0')+'-28',
      collection_date:'2026-'+String(m).padStart(2,'0')+'-28',
      collected_amount:3000,invoice_total_amount:3000,total_amount:3000}));
    S.tax_settings=[{id:'t1',year:2026,profitability_coefficient:78,inps_gs_rate:26.07,
      substitute_tax_rate:5,stamp_duty_amount:2}];
  });
  await pg.evaluate(()=>window.reload().then(()=>window.go('tasseFuture')));
  await pg.waitForTimeout(700);
  return pg;
};
const scheda=pg=>pg.evaluate(()=>{
  const c=document.querySelector('#app .card');
  return {
    viste:[...c.querySelectorAll('.tabs button')].map(x=>({t:x.textContent.trim(),attiva:x.classList.contains('active'),sel:x.getAttribute('aria-selected')})),
    teste:[...c.querySelectorAll('.refHead b')].map(x=>x.textContent.trim()),
    tappe:[...c.querySelectorAll('.lineaTempo .tappa')].map(x=>({
      data:x.querySelector('.tappaData b')?.textContent.trim(),
      quando:x.querySelector('.tappaData span')?.textContent.trim(),
      passata:x.classList.contains('passata'),adesso:x.classList.contains('adesso'),
      aperta:x.classList.contains('aperta'),
      tot:x.querySelector('.tappaTot')?.textContent.trim()||'',
      quante:x.querySelector('.tappaQuante')?.textContent.trim()||'',
      voci:x.querySelectorAll('.tappaVoci li').length,
      resta:x.querySelector('.tappaResta')?.textContent.trim()||''})),
    salva:c.querySelector('.salvaCifra')?.textContent.trim()||'',
    salvaTesto:c.querySelector('.salvaTesto')?.textContent.replace(/\s+/g,' ').trim()||'',
    scaduto:(()=>{const b=c.querySelector('.scadutoBlocco');return b?{
      conto:b.querySelector('.scadutoConto')?.textContent.trim(),
      tot:b.querySelector('.scadutoTot')?.textContent.trim(),
      aperto:b.querySelector('.scadutoBtn')?.getAttribute('aria-expanded'),
      voci:b.querySelectorAll('.scadutoVoci li').length}:null})(),
    prossima:[...c.querySelectorAll('.metricLine')].map(x=>x.textContent.replace(/\s+/g,' ').trim())
      .find(t=>/Prossima/.test(t))||''};
});
const apriScaduto=async pg=>{await pg.evaluate(()=>document.querySelector('#app .card .scadutoBtn').click());
  await pg.waitForTimeout(400)};
const apriTappa=async(pg,i)=>{await pg.evaluate(n=>[...document.querySelectorAll('#app .card .tappaBtn')][n].click(),i);
  await pg.waitForTimeout(400)};
const cambia=async(pg,etichetta)=>{
  await pg.evaluate(t=>[...document.querySelectorAll('#app .card .tabs button')]
    .find(x=>x.textContent.trim()===t).click(),etichetta);
  await pg.waitForTimeout(700);
};

console.log('\n=== A. Si parte dalle scadenze, in ordine di data ===');
const pg=await apri(1280);
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
const a=await scheda(pg);
ok(a.viste.length===3,'ci sono tre modi di guardarle',a.viste.map(v=>v.t).join(' | '));
ok(a.viste[0].attiva&&a.viste[0].t==='Per scadenza',
   'e si parte da «Per scadenza»',a.viste.find(v=>v.attiva)?.t);
ok(a.viste.every(v=>v.sel===String(v.attiva)),
   'con lo stato dichiarato per chi legge con la voce',JSON.stringify(a.viste.map(v=>v.sel)));
const date=a.teste.map(t=>t.replace(/\s+/g,' ').replace(/ (fra|passata|oggi|domani).*$/,'').trim());
ok(date.length>1,'le scadenze sono raggruppate per giorno',date.join(' '));
const iso=d=>{const [g,m,y]=d.split('/');return y+m+g};
ok(date.every((d,i)=>i===0||iso(date[i-1])<=iso(d)),
   'dalla più vicina alla più lontana, senza accavallarsi',date.join(' → '));
// di partenza si guarda avanti: lo scaduto sta nel suo blocco, non qui
const oggiIso=new Date().toISOString().slice(0,10).replace(/-/g,'');
ok(date.every(d=>iso(d)>=oggiIso),'e sono solo quelle che devono ancora arrivare',
   date.join(' '));
ok(a.teste.every(t=>/fra |oggi|domani/.test(t)),'ognuna dice fra quanto arriva',
   a.teste.join(' | '));

console.log('\n=== B. Lo scaduto sta da parte, in una riga sola ===');
ok(!!a.scaduto,'c\'è un blocco per quello che è già passato');
ok(a.scaduto&&a.scaduto.aperto==='false','chiuso di partenza: la pagina si apre su cosa viene adesso',
   a.scaduto&&a.scaduto.aperto);
ok(a.scaduto&&a.scaduto.voci===0,'quindi senza nessuna voce a schermo',
   a.scaduto&&String(a.scaduto.voci));
ok(a.scaduto&&/2 voci/.test(a.scaduto.conto||'')&&/12,00/.test(a.scaduto.tot||''),
   'ma dice quante sono e quanto fanno',a.scaduto?a.scaduto.conto+' · '+a.scaduto.tot:'niente');
await apriScaduto(pg);
const ap=await scheda(pg);
ok(ap.scaduto&&ap.scaduto.voci>0,'e toccandolo si aprono',ap.scaduto&&String(ap.scaduto.voci));
await apriScaduto(pg);
ok(/Prossima/.test(a.prossima),'in cima resta scritto qual è la prossima, con quanto manca',
   a.prossima||'niente');
// lo scaduto non si ripete anche come riga di testo sopra: era la
// stessa frase due volte a quattro righe di distanza
const quanteVolte=await pg.evaluate(()=>[...document.querySelectorAll('#app .card .metricLine')]
  .filter(x=>/Già scadute/.test(x.textContent)).length);
ok(quanteVolte===0,'e non è ripetuto anche più sopra',quanteVolte+' ripetizioni');

console.log('\n=== C. Il riferimento non si perde per strada ===');
// era la richiesta: ordinarle per data SENZA perdere a quale anno
// appartiene ogni versamento. Le righe ora sono chiuse, quindi si
// guarda dentro una aperta.
await pg.evaluate(()=>document.querySelector('#app .card .refHead.refApri').click());
await pg.waitForTimeout(400);
const rif=await pg.evaluate(()=>[...document.querySelectorAll('#app .card .row .tag')]
  .map(x=>x.textContent.trim()).filter(t=>/^rif\./.test(t)));
ok(rif.length>0,'aperta una scadenza, ogni voce porta il suo riferimento',
   [...new Set(rif)].join(' '));
await pg.evaluate(()=>document.querySelector('#app .card .refHead.refApri').click());
await pg.waitForTimeout(400);

console.log('\n=== D. La linea del tempo: una riga per scadenza ===');
await cambia(pg,'Linea del tempo');
const t=await scheda(pg);
ok(t.tappe.length>1&&t.tappe.length<6,'poche tappe, una per scadenza',
   t.tappe.length+' tappe: '+t.tappe.map(x=>x.data).join(' '));
ok(t.tappe.every(x=>!x.passata),'solo quelle davanti',t.tappe.map(x=>x.data).join(' '));
ok(t.tappe.every(x=>!x.aperta&&x.voci===0),
   'tutte chiuse di partenza: si legge data, importo e quante voci',
   t.tappe.map(x=>x.voci).join(' '));
ok(t.tappe.every(x=>/€/.test(x.tot)&&/voc/.test(x.quante)),
   'e quelle tre cose ci sono tutte',t.tappe.map(x=>x.data+' '+x.tot+' '+x.quante).join(' | '));
ok(t.tappe.every(x=>/fra |oggi|domani/.test(x.quando||'')),
   'con scritto fra quanto arriva',t.tappe.map(x=>x.quando).join(' · '));
// e si apre quella che serve, non tutte
await apriTappa(pg,1);
const t2=await scheda(pg);
ok(t2.tappe[1].voci>0,'toccandone una si aprono le sue voci',t2.tappe[1].voci+' voci');
ok(t2.tappe.filter((x,i)=>i!==1).every(x=>x.voci===0),
   'e le altre restano chiuse',t2.tappe.map(x=>x.voci).join(' '));
ok(/restano /.test(t2.tappe[1].resta||''),
   'aperta, dice anche quanto resta da versare dopo',t2.tappe[1].resta||'niente');
const ultimaAperta=t2.tappe.length-1;
await apriTappa(pg,ultimaAperta);
const t3=await scheda(pg);
ok(/restano 0,00/.test(t3.tappe[ultimaAperta].resta||''),
   'e sull\'ultima quel residuo è zero',t3.tappe[ultimaAperta].resta||'niente');
const rif2=await pg.evaluate(()=>[...document.querySelectorAll('#app .card .tappaVoci .tag')]
  .map(x=>x.textContent.trim()).filter(t=>/^rif\./.test(t)));
ok(rif2.length>0,'e dentro ogni voce porta il suo riferimento',[...new Set(rif2)].join(' '));

console.log('\n=== E. Quanto mettere da parte ===');
ok(/€/.test(t.salva),'la scheda dice una cifra al mese',t.salva);
ok(/per arrivare a \d{2}\/\d{2}\/\d{4}/.test(t.salvaTesto),
   'e per arrivare a quale data',t.salvaTesto);

console.log('\n=== F. La scelta si ricorda ===');
const salvato=await pg.evaluate(()=>(window.__stores.app_settings||[])
  .filter(x=>x.setting_key==='tasse_vista').map(x=>x.setting_value));
ok(salvato.join()==='tempo','la vista scelta finisce nelle impostazioni',JSON.stringify(salvato));
await cambia(pg,'Per riferimento');
const r=await scheda(pg);
ok(r.teste.every(x=>/^Riferimento \d{4}$/.test(x)),
   'la vista per riferimento è ancora quella di prima',r.teste.join(' | '));
ok((await pg.evaluate(()=>(window.__stores.app_settings||[])
   .filter(x=>x.setting_key==='tasse_vista').length))===1,
   'e cambiarla più volte non duplica la riga');

console.log('\n=== G. Su telefono si legge ===');
const pm=await apri(390);
const errs2=[];pm.on('pageerror',e=>errs2.push(e.message));
await cambia(pm,'Linea del tempo');
const m=await scheda(pm);
ok(m.tappe.length>1,'la linea del tempo c\'è anche qui',m.tappe.length+' tappe');
ok(m.tappe.every(x=>x.voci===0),'e anche qui si apre chiusa, una riga per scadenza',
   m.tappe.map(x=>x.data).join(' '));
const sc=await pm.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
ok(sc<=1,'senza scroll orizzontale di pagina',sc+'px');
const dita=await pm.evaluate(()=>[...document.querySelectorAll('#app .card .tabs button')]
  .map(x=>Math.round(x.getBoundingClientRect().height)));
ok(dita.length>0&&dita.every(h=>h>=44),'e i tre pulsanti si prendono col pollice',dita.join(' '));

ok(errs.length===0&&errs2.length===0,'nessun errore JS',
   errs.concat(errs2).slice(0,2).join(' | ')||'nessuno');
await pg.close();await pm.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
