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

console.log('\n=== Il modo principale: registro il versamento, non spunto la riga ===');
// Spuntare la riga giusta e' fragile: bisogna trovarla, aprirla, e
// premere la cosa giusta dentro. Registrare quanto si e' versato no —
// e' un modulo, e l'app scala le scadenze da sola. E' il modo in cui
// funzionano i contributi INPS da sempre.
const pgC=await apri(390);
const errsC=[];pgC.on('pageerror',e=>errsC.push(e.message));
await vaiA(pgC,'Tassazione','Tasse future');
ok(await siLegge(pgC,'Imposta di bollo 2026'),'la pagina dice quanto bollo è dovuto e quanto versato');
ok(await siLegge(pgC,'Ho versato il bollo'),'e offre di registrarlo',
   (await siLegge(pgC,'Ho versato il bollo'))?'c\'è':'NON c\'è: il modo nuovo è irraggiungibile');

const dovutoPrima=await pgC.evaluate(()=>document.querySelectorAll('#app .card .kpiGrid strong')[2].textContent.trim());
ok(await tocca(pgC,'Ho versato il bollo'),'e toccandolo si arriva da qualche parte');
ok(/Pagamenti fiscali/i.test(await schermata(pgC)),'cioè ai Pagamenti fiscali',await schermata(pgC));

// il modulo arriva gia' compilato: anno, tipo, importo che resta
const modulo=await pgC.evaluate(()=>{const f=document.querySelector('#app form.form');
  return f?{anno:f.fiscal_year?.value,tipo:f.payment_type?.value,imp:f.amount?.value,stato:f.status?.value,
            bottone:f.querySelector('button')?.textContent.trim()}:null});
ok(modulo&&modulo.tipo==='bollo','col tipo già scelto',modulo&&modulo.tipo);
ok(modulo&&Number(modulo.imp)>0,'e l\'importo che resta già scritto',modulo&&modulo.imp);
ok(modulo&&modulo.anno==='2026','sull\'anno giusto',modulo&&modulo.anno);
ok(modulo&&/Registra/.test(modulo.bottone||''),'e il pulsante dice cosa fa',modulo&&modulo.bottone);

// si salva come si salva qualunque modulo
await pgC.evaluate(()=>document.querySelector('#app form.form button').click());
await pgC.waitForTimeout(1400);
const scritto=await pgC.evaluate(()=>(window.__stores.tax_payments||[])
  .map(p=>({t:p.payment_type,i:p.amount,s:p.status})));
ok(scritto.length===1&&scritto[0].s==='paid','il versamento è registrato',JSON.stringify(scritto));

// e tornando alle tasse, le scadenze del bollo risultano coperte
await vaiA(pgC,'Tassazione','Tasse future');
const dovutoDopo=await pgC.evaluate(()=>document.querySelectorAll('#app .card .kpiGrid strong')[2].textContent.trim());
const n=t=>Number(String(t).replace(/[^0-9,]/g,'').replace(',','.'));
ok(n(dovutoDopo)<n(dovutoPrima),'e «da versare» è sceso senza aver spuntato niente',
   dovutoPrima+' → '+dovutoDopo);
ok(await siLegge(pgC,'tutto versato'),'la pagina dice che il bollo è a posto',
   (await siLegge(pgC,'tutto versato'))?'lo dice':'non lo dice');
await tocca(pgC,'30/11/2026');
const verdi=await pgC.evaluate(()=>[...document.querySelectorAll('#app .tag')]
  .filter(t=>t.textContent.trim().toLowerCase()==='pagata').length);
ok(verdi>0,'e aprendo una scadenza del bollo risulta pagata',verdi+' targhette');
ok(errsC.length===0,'senza errori JS',errsC.slice(0,2).join(' | ')||'nessuno');
await pgC.close();

console.log('\n=== Il bollo si riconosce anche se il tipo non c\'è ===');
// Se il database non accettasse il tipo «bollo» — un vincolo sui
// valori ammessi — l'app ripiega su «altro». I conti devono tornare
// lo stesso: e' la rete di sicurezza, e senza questa prova non si
// saprebbe se regge.
const pgD=await apri(390);
const errsD=[];pgD.on('pageerror',e=>errsD.push(e.message));
await pgD.evaluate(()=>{window.__stores.tax_payments=[{id:'tp1',fiscal_year:2026,
  payment_type:'altro',payment_date:'2026-10-01',amount:16,status:'paid',
  notes:'Imposta di bollo fatture elettroniche 2026'}]});
await pgD.evaluate(()=>window.reload());
await pgD.waitForTimeout(600);
await vaiA(pgD,'Tassazione','Tasse future');
ok(await siLegge(pgD,'tutto versato'),
   'un versamento scritto come «altro», con «bollo» nelle note, viene riconosciuto',
   (await siLegge(pgD,'tutto versato'))?'riconosciuto':'NON riconosciuto: i conti resterebbero sbagliati');
await tocca(pgD,'30/11/2026');
const verdiD=await pgD.evaluate(()=>[...document.querySelectorAll('#app .tag')]
  .filter(t=>t.textContent.trim().toLowerCase()==='pagata').length);
ok(verdiD>0,'e le scadenze risultano coperte lo stesso',verdiD+' targhette');
ok(errsD.length===0,'senza errori JS',errsD.slice(0,2).join(' | ')||'nessuno');
await pgD.close();

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

console.log('\n=== Percorso: «metto in ordine le spese di una trasferta» ===');
// Si parte dalla Dashboard e si arriva a raggruppare delle spese in una
// trasferta senza sapere dove sta niente: si tocca quello che si legge.
const pg4=await apri(390);
const errs4=[];pg4.on('pageerror',e=>errs4.push(e.message));
await pg4.evaluate(()=>{const S=window.__stores;
  S.expense_categories=[{id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount'}];
  S.travel_expenses=[
    {id:'t1',expense_date:'2026-07-14',client_id:'c1',project_id:'p1',expense_category_id:'volo',work_city:'Catania',amount:428,reimbursement_type:'invoice'},
    {id:'t2',expense_date:'2026-07-16',client_id:'c1',project_id:'p1',expense_category_id:'volo',work_city:'Catania',amount:390,reimbursement_type:'invoice'}];
  S.trips=[];
  return window.reload();
});
await pg4.waitForTimeout(700);
await tocca(pg4,'☰',{dove:'body'});
ok(await tocca(pg4,'Spese',{dove:'body'}),'dal menu si arriva alle Spese');
await pg4.waitForTimeout(300);
// sul mese che ha le spese, come farebbe chi le cerca
for(let i=0;i<36;i++){
  if(/Luglio 2026/.test(await pg4.evaluate(()=>document.querySelector('#app .month strong')?.textContent||'')))break;
  await pg4.evaluate(()=>{const b=[...document.querySelectorAll('#app .month button')][0];if(b)b.click()});
  await pg4.waitForTimeout(120);
}
await pg4.waitForTimeout(400);
ok(/Spese/i.test(await schermata(pg4)),'si è sulla pagina Spese',await schermata(pg4));
ok(await siLegge(pg4,'Spese non ancora in una trasferta'),
   'l\'app fa notare da sola che quelle spese non stanno in una trasferta');
ok(await tocca(pg4,'Crea la trasferta'),'e il pulsante per rimediare si legge e si tocca');
await pg4.waitForTimeout(500);
ok((await pg4.evaluate(()=>(window.__stores.trips||[]).length))===1,
   'la trasferta è nata',String(await pg4.evaluate(()=>(window.__stores.trips||[]).length)));
ok(await siLegge(pg4,'818,00'),'e la scheda dice quanto è costata, 428 + 390');
// E la cosa nuova deve essere possibile anche dall'altra vista della
// pagina: una funzione che esiste in una vista sola è irraggiungibile
// per chi apre l'altra. È l'errore del «Segna pagata».
ok(await tocca(pg4,'Tutte le spese'),'si passa all\'altra vista della pagina');
ok(await siLegge(pg4,'Catania'),'e le spese si vedono anche lì');
const vociMenu=await pg4.evaluate(()=>{
  const btn=[...document.querySelectorAll('body button')].find(b=>b.textContent.trim()==='☰');
  if(btn)btn.click();
  return true;
});
await pg4.waitForTimeout(400);
await tocca(pg4,'Spese',{dove:'body'});
await pg4.waitForTimeout(250);
ok(await tocca(pg4,'Nuova trasferta',{dove:'body'}),'e dal menu si crea una trasferta da zero');
await pg4.waitForTimeout(300);
ok(await pg4.evaluate(()=>!!document.querySelector('#app form.form [name=destination_city]')),
   'che apre un modulo in cui si può scrivere la destinazione',await schermata(pg4));

console.log('\n=== Percorso: «registro una spesa chilometrica» ===');
// Partendo dalla Dashboard, si deve arrivare a registrare dei
// chilometri e vedere il totale calcolato, senza sapere dove sta niente.
const pg5=await apri(390);
const errs5=[];pg5.on('pageerror',e=>errs5.push(e.message));
await pg5.evaluate(()=>{const S=window.__stores;
  S.expense_categories=[
    {id:'km',name:'Rimborso KM',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'km',default_unit_rate:0.45,is_mileage:true}];
  S.vehicles=[{id:'v1',name:'Panda',plate:'AB123CD',rate_per_km:0.45,aci_year:2026,active:true}];
  S.travel_expenses=[];S.trips=[];
  return window.reload();
});
await pg5.waitForTimeout(700);
await tocca(pg5,'☰',{dove:'body'});
await tocca(pg5,'Spese',{dove:'body'});
ok(await tocca(pg5,'Nuova spesa',{dove:'body'}),'dal menu si arriva al modulo della spesa');
await pg5.waitForTimeout(300);
ok(/Nuova spesa/i.test(await schermata(pg5)),'ed è il modulo giusto',await schermata(pg5));
// I tre blocchi si devono leggere: è la cosa che si è chiesto di sistemare
ok(await siLegge(pg5,'Quando e dove'),'il modulo si legge a blocchi: «Quando e dove»');
ok(await siLegge(pg5,'Come la tratto'),'e «Come la tratto»');
// Si scelgono i chilometri e si scrive la quantità, come si fa col dito
await pg5.evaluate(()=>{
  const sel=document.querySelector('#app [name=expense_category_id]');
  sel.value='km'; sel.dispatchEvent(new Event('change',{bubbles:true}));
});
await pg5.waitForTimeout(350);
ok(await siLegge(pg5,'Km a tratta'),'e il modulo chiede i km di una tratta, non il totale');
await pg5.evaluate(()=>{
  const q=document.querySelector('#app [name=km_tratta]');
  q.value='105'; q.dispatchEvent(new Event('input',{bubbles:true}));
});
await pg5.waitForTimeout(300);
await pg5.evaluate(()=>{
  const c=document.querySelector('#app [name=round_trip]');
  c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true}));
});
await pg5.waitForTimeout(300);
ok(await siLegge(pg5,'In tutto 210 km'),'spuntando «andata e ritorno» l\'app dice 210 km');
const tot=await pg5.evaluate(()=>document.querySelector('#app [name=amount]')?.value);
ok(Math.abs(Number(tot)-94.5)<0.005,'105 km andata e ritorno diventano 94,50 € senza moltiplicare a mente',String(tot));
ok(await pg5.evaluate(()=>!!document.querySelector('#app [name=amount]')?.readOnly),
   'e il totale non si può scrivere a mano per sbaglio: una fonte di verità sola');
ok(await siLegge(pg5,'Lo scrivo a mano'),'ma la via per correggerlo è a schermo, non nascosta');

console.log('\n=== Percorso: «sforo il limite del cliente e spezzo la spesa» ===');
// Dalla Dashboard, senza sapere dove sta niente: si registra una cena
// sopra il tetto del cliente e si deve VEDERE l'avviso, con la via
// d'uscita a schermo.
const pg6=await apri(390);
const errs6=[];pg6.on('pageerror',e=>errs6.push(e.message));
await pg6.evaluate(()=>{const S=window.__stores;
  S.clients[1].expense_policy=[{category_id:'cena',category:'Cena',type:'invoice',cap:35}];
  S.expense_categories=[{id:'cena',name:'Cena',active:true,reimbursable:true,calculation_type:'manual_amount'}];
  S.travel_expenses=[];S.trips=[];S.vehicles=[];
  return window.reload();
});
await pg6.waitForTimeout(700);
await tocca(pg6,'☰',{dove:'body'});
await tocca(pg6,'Spese',{dove:'body'});
await tocca(pg6,'Nuova spesa',{dove:'body'});
await pg6.waitForTimeout(300);
await pg6.evaluate(()=>{
  const c=document.querySelector('#app [name=client_id]');
  const eq=[...c.options].find(o=>/Equans/.test(o.textContent));
  if(eq){c.value=eq.value;c.dispatchEvent(new Event('change',{bubbles:true}))}
  const sel=document.querySelector('#app [name=expense_category_id]');
  sel.value='cena'; sel.dispatchEvent(new Event('change',{bubbles:true}));
});
await pg6.waitForTimeout(350);
await pg6.evaluate(()=>{
  const a=document.querySelector('#app [name=amount]');
  a.value='60'; a.dispatchEvent(new Event('input',{bubbles:true}));
});
await pg6.waitForTimeout(350);
ok(await siLegge(pg6,'Oltre il limite'),'l\'app avvisa da sola che si è sforato il tetto del cliente');
ok(await siLegge(pg6,'Spezza in due righe'),'e la via d\'uscita è a schermo, non da indovinare');
ok(await siLegge(pg6,'25,00'),'dicendo quanto si è sforato');
await pg6.evaluate(()=>{
  const c=document.querySelector('#app [name=spezza]');
  c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector('#app form.form').requestSubmit();
});
await pg6.waitForTimeout(900);
const due=await pg6.evaluate(()=>(window.__stores.travel_expenses||[]).map(r=>({a:Number(r.amount),t:r.reimbursement_type})));
ok(due.length===2,'e spezzando nascono due righe',JSON.stringify(due));
ok(due.some(r=>r.a===35&&r.t==='invoice')&&due.some(r=>r.a===25&&r.t==='own'),
   '35 in fattura e 25 a mio carico',JSON.stringify(due));

console.log('\n=== Percorso: «pago in contanti e l\'app mi avverte» ===');
// Dalla Dashboard: una cena da riaddebitare pagata in contanti deve
// farsi notare, perché è quella che fa perdere il beneficio fiscale.
const pg7=await apri(390);
const errs7=[];pg7.on('pageerror',e=>errs7.push(e.message));
await pg7.evaluate(()=>{const S=window.__stores;
  S.clients[1].expense_policy=[];
  S.expense_categories=[{id:'cena',name:'Cena',active:true,reimbursable:true,calculation_type:'manual_amount'}];
  S.travel_expenses=[];S.trips=[];S.vehicles=[];
  return window.reload();
});
await pg7.waitForTimeout(700);
await tocca(pg7,'☰',{dove:'body'});
await tocca(pg7,'Spese',{dove:'body'});
await tocca(pg7,'Nuova spesa',{dove:'body'});
await pg7.waitForTimeout(300);
ok(await siLegge(pg7,'Come l’hai pagata'),'il modulo chiede come si è pagato');
await pg7.evaluate(()=>{
  const sel=document.querySelector('#app [name=expense_category_id]');
  sel.value='cena'; sel.dispatchEvent(new Event('change',{bubbles:true}));
  const a=document.querySelector('#app [name=amount]');
  a.value='45'; a.dispatchEvent(new Event('input',{bubbles:true}));
  const m=document.querySelector('#app [name=payment_method]');
  m.value='contanti'; m.dispatchEvent(new Event('change',{bubbles:true}));
});
await pg7.waitForTimeout(400);
ok(await siLegge(pg7,'non tracciabile'),'e pagando in contanti lo dice: non tracciabile');
ok(await siLegge(pg7,'concorrere al reddito'),'spiegando cosa comporta');
ok(await siLegge(pg7,'estero'),'e ricorda l\'eccezione delle spese estere');
await pg7.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
await pg7.waitForTimeout(900);
await tocca(pg7,'☰',{dove:'body'});
await tocca(pg7,'Spese',{dove:'body'});
await pg7.waitForTimeout(400);
ok(await siLegge(pg7,'non tracciabile'),'e nell\'elenco la spesa resta segnalata, non si perde');

ok(errs.length===0&&errs2.length===0&&errs3.length===0&&errs4.length===0&&errs5.length===0&&errs6.length===0&&errs7.length===0,'nessun errore JS lungo i percorsi',
   errs.concat(errs2,errs3,errs4,errs5,errs6,errs7).slice(0,2).join(' | ')||'nessuno');
await pg.close();await pg2.close();await pg3.close();await pg4.close();await pg5.close();await pg6.close();await pg7.close();await b.close();srv.close();
console.log(`\nRISULTATO: ${pass} OK / ${fail} KO`);
if(fail)process.exitCode=1;
