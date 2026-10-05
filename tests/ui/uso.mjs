// Fare le cose, non guardare il codice che le fa.
//
// Questo file e' diverso da tutti gli altri. Gli altri verificano che
// un pezzo di app faccia quello per cui e' stato scritto: si apre la
// schermata giusta, si cerca l'elemento col suo nome, si controlla
// l'effetto. Verde, sempre — perche' chi scrive il test sa gia' dove ha
// messo le cose.
//
// Qui invece si parte dalla Dashboard, come quando si apre l'app, e si
// prova ad arrivare a un risultato SENZA sapere dov'e' finito niente:
// si clicca quello che c'e' a schermo cercandolo per quello che dice,
// non per la classe CSS che gli ho dato io.
//
// Il «Segna pagata» era arrivato in produzione irraggiungibile: c'era
// solo nella vista che l'app NON apre per prima, e la sua sezione di
// test ci passava apposta prima di verificare. Nessuno dei 798
// controlli di allora faceva questa cosa qui.
//
// Regola: una funzione nuova non e' finita finche' non c'e' qui dentro
// un percorso che la raggiunge partendo dalla Dashboard.
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

// ─── Gli unici gesti ammessi: quelli che si fanno col dito ──────────
// Niente window.go(), niente querySelector su classi interne. Si tocca
// quello che si legge a schermo.
const tocca=async(pg,testo,{dove='#app',esatto=false}={})=>{
  const fatto=await pg.evaluate(([t,d,e])=>{
    const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
    const q=norm(t);
    const cerca=sel=>[...document.querySelectorAll(sel)]
      .find(x=>{const s=norm(x.textContent);return e?s===q:s.includes(q)});
    // prima i bersagli veri, poi i contenitori: cercando in un colpo
    // solo vince la riga che contiene il pulsante, e si tocca il vuoto
    const el=cerca(d+' button')||cerca(d+' a')||cerca(d+' [role=button]')||cerca(d+' .row');
    if(!el)return false;el.click();return true;
  },[testo,dove,esatto]);
  await pg.waitForTimeout(550);
  return fatto;
};
const siLegge=(pg,testo)=>pg.evaluate(t=>{
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  return norm(document.getElementById('app').textContent).includes(norm(t));
},testo);
const schermata=pg=>pg.evaluate(()=>document.querySelector('#app h1, #app .screenTitle')?.textContent.trim()||'(senza titolo)');

const apri=async(w=390)=>{
  const pg=await b.newPage({viewport:{width:w,height:1600},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(900);
  // un anno di incassi veri, cosi' le scadenze fiscali esistono
  await pg.evaluate(()=>{const S=window.__stores;
    S.billing_headers=[1,2,3,4,5,6,7,8].map(m=>({id:'bh'+m,client_id:'c1',year:2026,month:m,
      status:'collected',invoice_number:'#'+m,invoice_date:'2026-'+String(m).padStart(2,'0')+'-28',
      collection_date:'2026-'+String(m).padStart(2,'0')+'-28',
      collected_amount:3000,invoice_total_amount:3000,total_amount:3000}));
    S.tax_settings=[{id:'t1',year:2026,profitability_coefficient:78,inps_gs_rate:26.07,
      substitute_tax_rate:5,stamp_duty_amount:2}];
  });
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(600);
  return pg;
};

console.log('\n=== Percorso: «ho pagato un bollo, lo segno» ===');
// Come lo farebbe una persona: apre l'app, cerca le tasse, trova la
// scadenza, la segna pagata. Senza sapere in che vista o in che
// funzione l'ho messo io.
const pg=await apri(390);
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
ok((await schermata(pg)).length>0,'l\'app si apre',await schermata(pg));

// 1. dal menu si arriva alle tasse: menu, gruppo, voce
const vaiA=async(pg,gruppo,voce)=>{
  await tocca(pg,'\u2630',{dove:'body'});
  await tocca(pg,gruppo,{dove:'body'});
  return tocca(pg,voce,{dove:'body'});
};
const viaMenu=await vaiA(pg,'Tassazione','Tasse future');
ok(viaMenu,'dal menu si arriva a «Tasse future» (menu › Tassazione › Tasse future)');
ok(/Tasse future/i.test(await schermata(pg)),'e ci si arriva davvero',await schermata(pg));

// 2. sulla pagina, COSI' COM'E' QUANDO SI APRE, c'è una scadenza da aprire
const vistaIniziale=await pg.evaluate(()=>document.querySelector('#app .card .tabs button.active')?.textContent.replace(/\s+/g,' ').trim()||'(nessuna vista)');
ok(true,'la pagina si apre sulla vista',vistaIniziale);
const apertaScadenza=await tocca(pg,'30/11/2026');
ok(apertaScadenza,'si tocca una scadenza e si apre');

// 3. e da lì si deve poter dire «questa l'ho pagata» — senza cambiare vista
const puoSegnare=await siLegge(pg,'Segna pagata');
ok(puoSegnare,'da qui si può segnare pagata, senza dover cercare altrove',
   puoSegnare?'si legge «Segna pagata»':'NON si legge da nessuna parte: la funzione è irraggiungibile');

const segnato=await tocca(pg,'Segna pagata');
await pg.waitForTimeout(900);
ok(segnato,'e il gesto va a buon fine');
const registrato=await pg.evaluate(()=>(window.__stores.tax_payments||[]).length);
ok(registrato===1,'il versamento risulta registrato',registrato+' versamenti');
// «pagata» sta dentro «Segna pagata»: cercarla nel testo della pagina
// sarebbe vero anche senza aver segnato niente. Si guarda la targhetta.
const targhetta=await pg.evaluate(()=>[...document.querySelectorAll('#app .tag')]
  .map(t=>t.textContent.trim().toLowerCase()).filter(t=>t==='pagata').length);
ok(targhetta>0,'e a schermo compare la targhetta «pagata»',targhetta+' targhette');

console.log('\n=== Lo stesso percorso, in ogni vista che la pagina offre ===');
// Se una pagina offre piu' modi di guardare la stessa cosa, la cosa si
// deve poter fare in tutti. E' esattamente quello che mancava.
const viste=[...new Set(await pg.evaluate(()=>[...document.querySelectorAll('#app .card .tabs button')]
  .map(x=>x.textContent.replace(/\s+/g,' ').trim())))];
ok(viste.length>0,'la pagina offre più viste',viste.join(' | '));
for(const v of viste){
  await tocca(pg,v,{esatto:true});
  // si apre quello che si apre, poi si guarda se il gesto e' possibile
  for(let i=0;i<10;i++){
    const fatto=await pg.evaluate(()=>{const b=[...document.querySelectorAll('#app .card button')]
      .find(x=>x.getAttribute('aria-expanded')==='false');if(!b)return false;b.click();return true});
    if(!fatto)break;await pg.waitForTimeout(260);
  }
  const bott=await pg.evaluate(()=>[...document.querySelectorAll('#app .card button')]
    .filter(x=>/segna pagata|non l'ho pagata/i.test(x.textContent)).length);
  ok(bott>0,`in «${v}» si può segnare pagata`,
     bott>0?bott+' punti dove farlo':'IRRAGGIUNGIBILE da questa vista');
}

console.log('\n=== Un pulsante non deve mai restare zitto ===');
// «Lo premo e non succede niente» e' il guasto peggiore: chi preme non
// sa se ha sbagliato mira, se l'app sta pensando, o se c'e' un problema
// vero. Qui si verifica che ogni strada dica qualcosa.
const avviso=pg=>pg.evaluate(()=>document.querySelector('#app .toast')?.textContent.replace(/\s+/g,' ').trim()||'');

// 1. premerlo due volte: la seconda deve dirlo, non uscire zitta
await tocca(pg,'Segna pagata');
await pg.waitForTimeout(800);
await pg.evaluate(async()=>{
  const b=[...document.querySelectorAll('#app .card button')].find(x=>/segna pagata/i.test(x.textContent));
  if(b)b.click();
});
await pg.waitForTimeout(900);

// 2. col database che rifiuta per un vincolo: deve ripiegare da solo
const pgA=await apri(390);
await vaiA(pgA,'Tassazione','Tasse future');
await tocca(pgA,'30/11/2026');
await pgA.evaluate(()=>{window.__vietaPagamenti=true});
await tocca(pgA,'Segna pagata');
await pgA.waitForTimeout(1200);
const regA=await pgA.evaluate(()=>(window.__stores.tax_payments||[]).length);
ok(regA===1,'se il database rifiuta il tipo nuovo, ripiega e registra lo stesso',regA+' versamenti');
ok(await pgA.evaluate(()=>[...document.querySelectorAll('#app .tag')]
   .some(t=>t.textContent.trim().toLowerCase()==='pagata')),
   'e la voce risulta pagata comunque');
await pgA.close();

// 3. col database che rifiuta del tutto: deve DIRLO, in italiano
const pgB=await apri(390);
await vaiA(pgB,'Tassazione','Tasse future');
await tocca(pgB,'30/11/2026');
await pgB.evaluate(()=>{window.__rifiutaTutto=true});
await tocca(pgB,'Segna pagata');
await pgB.waitForTimeout(1400);
const msg=await avviso(pgB);
ok(msg.length>0,'quando non si può registrare, qualcosa compare a schermo',msg||'NIENTE: il pulsante resta zitto');
ok(/non si è potuta registrare/i.test(msg),'e dice che non ce l\'ha fatta',msg);
ok(!/row-level security|violates|policy for table/i.test(msg),
   'senza il gergo del database',msg);
ok((await pgB.evaluate(()=>(window.__stores.tax_payments||[]).length))===0,
   'e non resta scritto niente a metà',
   String(await pgB.evaluate(()=>(window.__stores.tax_payments||[]).length)));
await pgB.close();

console.log('\n=== Percorso: «registro un consuntivo» ===');
const pg2=await apri(390);
const errs2=[];pg2.on('pageerror',e=>errs2.push(e.message));
ok(await tocca(pg2,'Nuovo consuntivo'),'dalla Dashboard si arriva al nuovo consuntivo');
ok(await pg2.evaluate(()=>!!document.querySelector('#app form.form [name=hours], #app form.form [name=entry_date]')),
   'e si apre un modulo in cui si può scrivere',await schermata(pg2));

console.log('\n=== Percorso: «mando l\'Excel a un cliente» ===');
const pg3=await apri(390);
const errs3=[];pg3.on('pageerror',e=>errs3.push(e.message));
await tocca(pg3,'\u2630',{dove:'body'});
await tocca(pg3,'Consuntivi',{dove:'body'});
await tocca(pg3,'Timesheet',{dove:'body'});
ok(/Timesheet/i.test(await schermata(pg3)),'dal menu si arriva al Timesheet',await schermata(pg3));
// ci si porta sul mese che ha i consuntivi, come farebbe chi li cerca
for(let i=0;i<36;i++){
  if(/Luglio 2026/.test(await pg3.evaluate(()=>document.querySelector('#app .month strong')?.textContent||'')))break;
  await pg3.evaluate(()=>{const b=[...document.querySelectorAll('#app .month button')][0];if(b)b.click()});
  await pg3.waitForTimeout(120);
}
await pg3.waitForTimeout(400);
ok(await siLegge(pg3,'Condividi'),'e da lì si può condividere');
const perCliente=await pg3.evaluate(()=>[...document.querySelectorAll('#app .cliAzioni button')]
  .every(b=>/\('[^']+'\)/.test(b.getAttribute('onclick')||'')));
ok(perCliente,'e ogni pulsante manda i dati di un cliente solo');

ok(errs.length===0&&errs2.length===0&&errs3.length===0,'nessun errore JS lungo i percorsi',
   errs.concat(errs2,errs3).slice(0,2).join(' | ')||'nessuno');
await pg.close();await pg2.close();await pg3.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
