// Chi la paga, a chi e' intestata la fattura, come l'hai pagata.
//
// Sono le tre cose che decidono se un rimborso e' tassato. Chi inserisce
// la spesa non sceglie «analitico» o «ex art. 15»: risponde a due
// domande in parole semplici e il tipo lo deduce l'app, che lo dice
// con un semaforo e il nome della voce da usare su Fiscozen.
//
// Qui si verifica che le domande ci siano, che il semaforo dica la
// verita' — fattura a me o al cliente: non tassata; scontrino su una
// voce che si puo' fatturare, o contanti: da sistemare; km: tassata —
// che i dati si salvino, e che l'elenco segnali le spese da sistemare.
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
const testo=pg=>pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));
const campo=(pg,n)=>pg.evaluate(x=>{
  const el=document.querySelector(`#app [name="${x}"]`);
  if(!el)return null;
  if(el.type==='radio'){const c=document.querySelector(`#app [name="${x}"]:checked`);
    return {val:c?c.value:'',hidden:!!el.closest('[hidden]'),checked:!!c};}
  return {val:el.value,hidden:!!el.closest('[hidden]'),checked:!!el.checked};
},n);
const scrivi=async(pg,n,v)=>{
  await pg.evaluate(([x,y])=>{
    let el=document.querySelector(`#app [name="${x}"]`);
    if(el&&el.type==='radio'){el=document.querySelector(`#app [name="${x}"][value="${y}"]`);el.checked=true;
      el.dispatchEvent(new Event('change',{bubbles:true}));return;}
    el.value=y;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  },[n,v]);
  await pg.waitForTimeout(300);
};
const spunta=async(pg,n,v=true)=>{
  await pg.evaluate(([x,y])=>{
    const el=document.querySelector(`#app [name="${x}"]`);
    el.checked=y; el.dispatchEvent(new Event('change',{bubbles:true}));
  },[n,v]);
  await pg.waitForTimeout(300);
};

const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'omni',client_id:'k2',name:'Omnichannel',active:true}];
  S.expense_categories=[
    {id:'cena',name:'Cena',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false},
    {id:'taxi',name:'Taxi',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false,invoiceable:false},
    {id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false},
    {id:'metro',name:'ATM',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false,invoiceable:false},
    {id:'hotel',name:'Hotel',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false},
    {id:'km',name:'Rimborso KM',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'km',default_unit_rate:0.45,is_mileage:true}];
  S.travel_expenses=[];S.trips=[];S.vehicles=[];
`;
const apri=async(w=390)=>{
  const pg=await b.newPage({viewport:{width:w,height:1900},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};
const alModulo=async pg=>{await pg.evaluate(()=>window.go('expenseForm'));await pg.waitForTimeout(450)};

console.log('\n=== LE DOMANDE CI SONO, NEL BLOCCO GIUSTO ===');
{
  const pg=await apri();
  await alModulo(pg);
  ok(!!(await campo(pg,'reimbursement_type')),'il modulo chiede chi la paga alla fine');
  ok(!!(await campo(pg,'document_type')),'a chi è intestata la fattura');
  ok(!!(await campo(pg,'payment_method')),'e come si è pagato');
  ok(!(await campo(pg,'receipt_kept')),'la vecchia spunta «la ricevuta ce l’ho» non c’è più');
  const t=(await testo(pg)).toLowerCase();
  ok(t.includes('chi la paga alla fine?'),'la prima domanda in parole semplici');
  ok(!/analitic|art\. ?15/.test(t),'mentre si inserisce non si legge gergo fiscale',t.slice(0,200));
  const opz=await pg.evaluate(()=>[...document.querySelectorAll('#app [name=payment_method] option')].map(o=>o.textContent.trim().toLowerCase()));
  for(const m of ['carta','bonifico','contanti'])
    ok(opz.some(o=>o.includes(m)),'fra i modi c’è '+m,opz.join(' | '));
  // La spesa nuova parte da «Io»: la seconda domanda non si vede
  ok((await campo(pg,'reimbursement_type')).val==='own','una spesa nuova parte da «Io»');
  ok((await campo(pg,'document_type')).hidden,'e la domanda sulla fattura non si vede');
  await scrivi(pg,'reimbursement_type','invoice');
  ok(!(await campo(pg,'document_type')).hidden,'riaddebitandola compare la domanda sulla fattura');
  ok((await campo(pg,'payment_method')).val==='carta','il metodo parte da carta, il più comune',String((await campo(pg,'payment_method')).val));
  const dove=await pg.evaluate(()=>{
    const el=document.querySelector('#app [name=payment_method]');
    const bl=el&&el.closest('.bloccoCampi');
    return bl?bl.querySelector('.bloccoTit')?.childNodes[0].textContent.trim():'';
  });
  ok(dove==='Come la tratto','e sta nel blocco «Come la tratto»',String(dove));
  await pg.close();
}

console.log('\n=== IL SEMAFORO DICE LA VERITÀ ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','cena');
  await scrivi(pg,'reimbursement_type','invoice');
  await scrivi(pg,'payment_method','carta');
  const nota=()=>pg.evaluate(()=>(document.getElementById('tracciaBox')?.innerText||'').replace(/\s+/g,' ').toLowerCase());
  let t=await nota();
  ok(/da sistemare/.test(t)&&/intestata/.test(t),'senza dire a chi è intestata: da sistemare, e lo chiede',t);
  await scrivi(pg,'document_type','mia');
  t=await nota();
  ok(/non tassata/.test(t),'fattura intestata a me, carta: non tassata',t);
  ok(/rimborso spese analitico/.test(t),'col nome della voce su Fiscozen',t);
  ok(/85\.000/.test(t)&&/rivalsa/.test(t),'e dice che non conta per gli 85.000 e non porta la rivalsa',t);
  await scrivi(pg,'document_type','cliente');
  t=await nota();
  ok(/non tassata/.test(t)&&/art\. 15/.test(t),'fattura intestata al cliente: non tassata, «Rimborso ex art. 15»',t);
  await scrivi(pg,'document_type','scontrino');
  t=await nota();
  ok(/da sistemare/.test(t)&&/serve la fattura/.test(t),'solo scontrino su una cena: serve la fattura',t);
  await scrivi(pg,'document_type','mia');
  await scrivi(pg,'payment_method','contanti');
  t=await nota();
  ok(/da sistemare/.test(t)&&/contanti/.test(t),'fattura a me ma contanti: da sistemare',t);
  await pg.close();
}

console.log('\n=== DOVE BASTA LO SCONTRINO, E I KM ===');
{
  const pg=await apri();
  await alModulo(pg);
  // 1) Il taxi non si fattura: lo scontrino basta
  await scrivi(pg,'expense_category_id','taxi');
  await scrivi(pg,'reimbursement_type','invoice');
  await scrivi(pg,'document_type','scontrino');
  await scrivi(pg,'payment_method','carta');
  let t=(await pg.evaluate(()=>document.getElementById('tracciaBox')?.innerText||'')).toLowerCase();
  ok(/non tassata/.test(t),'taxi con lo scontrino, pagato con carta: non tassata',t);
  // 2) La chilometrica è forfettaria: tassata, e la domanda sparisce
  await scrivi(pg,'expense_category_id','km');
  t=(await pg.evaluate(()=>document.getElementById('tracciaBox')?.innerText||'')).toLowerCase();
  ok(/tassata/.test(t)&&!/non tassata/.test(t)&&/compenso/.test(t),'il rimborso km è tassato: è un compenso',t);
  ok((await campo(pg,'document_type')).hidden,'e sui km la domanda sulla fattura non si fa');
  // 3) A mio carico: nessun semaforo
  await scrivi(pg,'expense_category_id','cena');
  await scrivi(pg,'reimbursement_type','own');
  t=(await pg.evaluate(()=>document.getElementById('tracciaBox')?.innerText||'')).toLowerCase();
  ok(!t.trim(),'su una spesa a mio carico il semaforo non c’è',t);
  await pg.close();
}

console.log('\n=== CARTA O BONIFICO: SOLO VITTO, ALLOGGIO E TAXI IN ITALIA ===');
{
  // Art. 54 c. 2-bis TUIR (L. 207/2024, D.L. 84/2025): l'obbligo vale
  // per vitto, alloggio e taxi/NCC pagati in Italia, non per treni,
  // aerei, metro, pedaggi. All'estero non vale per nessuna spesa.
  const pg=await apri();
  await alModulo(pg);
  const nota=()=>pg.evaluate(()=>(document.getElementById('tracciaBox')?.innerText||'').replace(/\s+/g,' ').toLowerCase());
  await scrivi(pg,'reimbursement_type','invoice');
  ok((await campo(pg,'expense_country')).val==='IT','una spesa nuova parte da «Italia»',String((await campo(pg,'expense_country')).val));
  await scrivi(pg,'expense_category_id','volo');
  await scrivi(pg,'document_type','mia');
  await scrivi(pg,'payment_method','contanti');
  let t=await nota();
  ok(/non tassata/.test(t),'volo in contanti con fattura a me: non tassata, l’aereo non ha obbligo',t);
  await scrivi(pg,'expense_category_id','metro');
  await scrivi(pg,'document_type','scontrino');
  t=await nota();
  ok(/non tassata/.test(t),'metro in contanti con lo scontrino: non tassata',t);
  await scrivi(pg,'expense_category_id','taxi');
  t=await nota();
  ok(/da sistemare/.test(t)&&/vitto, alloggio e taxi/.test(t),'taxi in contanti in Italia: da sistemare, e dice perché',t);
  await scrivi(pg,'expense_category_id','hotel');
  await scrivi(pg,'document_type','mia');
  t=await nota();
  ok(/da sistemare/.test(t),'hotel in contanti in Italia: da sistemare',t);
  await scrivi(pg,'expense_country','CH');
  t=await nota();
  ok(/non tassata/.test(t)&&/contanti/.test(t),'lo stesso hotel in Svizzera: non tassata, e dice che i contanti vanno bene',t);
  await scrivi(pg,'amount','180');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(800);
  const e=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice(-1)[0]||null);
  ok(e&&e.expense_country==='CH','il paese si salva',String(e&&e.expense_country));
  ok(await pg.evaluate(()=>window.naturaRimborso(window.__stores.travel_expenses.slice(-1)[0])==='analitico'),'e l’app la conta come rimborso analitico');
  await pg.evaluate(()=>window.editEntry(window.__stores.travel_expenses.slice(-1)[0].id,'expense'));
  await pg.waitForTimeout(500);
  ok((await campo(pg,'expense_country')).val==='CH','rileggendola c’è «Svizzera»',String((await campo(pg,'expense_country')).val));
  // Senza paese sulla spesa vale quello della trasferta
  const viaTrasferta=await pg.evaluate(()=>{
    window.__stores.trips=[{id:'gin',client_id:'k2',destination_city:'Ginevra',destination_country:'CH',start_date:'2026-07-01',end_date:'2026-07-03'}];
    return window.reload().then(()=>window.paeseSpesa({trip_id:'gin'}));
  });
  ok(viaTrasferta==='CH','una spesa della trasferta a Ginevra senza paese vale come Svizzera',String(viaTrasferta));
  ok(await pg.evaluate(()=>window.paeseSpesa({})==='IT'),'senza paese né trasferta: Italia, la scelta prudente');
  await pg.close();
}

console.log('\n=== I DATI SI SALVANO E SI RILEGGONO ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','cena');
  await scrivi(pg,'amount','42');
  await scrivi(pg,'reimbursement_type','invoice');
  await scrivi(pg,'document_type','mia');
  await scrivi(pg,'payment_method','bonifico');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(800);
  const e=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice(-1)[0]||null);
  ok(e&&e.payment_method==='bonifico','il metodo si salva',String(e&&e.payment_method));
  ok(e&&e.document_type==='mia','a chi è intestata la fattura pure',String(e&&e.document_type));
  ok(e&&e.reimbursement_type==='invoice','e chi la paga',String(e&&e.reimbursement_type));
  ok(await pg.evaluate(()=>window.naturaRimborso(window.__stores.travel_expenses.slice(-1)[0])==='analitico'),'l’app la riconosce come rimborso analitico');
  await pg.evaluate(()=>window.editEntry(window.__stores.travel_expenses.slice(-1)[0].id,'expense'));
  await pg.waitForTimeout(500);
  ok((await campo(pg,'payment_method')).val==='bonifico','rileggendola c’è il metodo',String((await campo(pg,'payment_method')).val));
  ok((await campo(pg,'document_type')).val==='mia','e il documento',String((await campo(pg,'document_type')).val));
  ok((await campo(pg,'reimbursement_type')).val==='invoice','e chi la paga');
  // Una spesa a mio carico non si porta dietro il documento
  await scrivi(pg,'reimbursement_type','own');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(800);
  const e2=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice(-1)[0]||null);
  ok(e2&&e2.document_type===null,'tornando «a mio carico» il documento si svuota',String(e2&&e2.document_type));
  await pg.close();
}

console.log('\n=== L’ELENCO SEGNALA QUELLO CHE MANCA ===');
{
  const pg=await apri();
  await pg.evaluate(`
    window.__stores.travel_expenses=[
      {id:'a',expense_date:'2026-10-05',client_id:'k2',expense_category_id:'cena',amount:40,
       reimbursement_type:'invoice',payment_method:'carta',document_type:'mia',work_city:'Milano'},
      {id:'b',expense_date:'2026-10-06',client_id:'k2',expense_category_id:'cena',amount:30,
       reimbursement_type:'invoice',payment_method:'carta',document_type:'scontrino',work_city:'Milano'}];
  `);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(600);
  await pg.evaluate(()=>window.go('expenses'));
  await pg.waitForTimeout(400);
  await pg.evaluate(()=>{for(let i=0;i<48;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith('Ottobre 2026'))break;
    window.changeMonth(-1)}});
  await pg.waitForTimeout(500);
  let t=(await testo(pg)).toLowerCase();
  ok(/da sistemare/.test(t),'l’elenco fa notare la cena con il solo scontrino',t.slice(0,260));
  const quante=await pg.evaluate(()=>document.querySelectorAll('#app .tagManca').length);
  ok(quante===1,'una segnalazione sola, non due',String(quante));
  ok(/non tassata/.test(t),'e la cena con la fattura dice «non tassata»');
  // Il filtro: solo quelle da sistemare
  await pg.evaluate(()=>window.apriSpeseDaSistemare());
  await pg.waitForTimeout(400);
  const righe=await pg.evaluate(()=>document.querySelectorAll('#app .row[onclick^="editEntry"]').length);
  t=(await testo(pg)).toLowerCase();
  ok(righe===1&&/mostra tutte/.test(t),'«Mostra solo quelle» lascia la sola spesa da sistemare',String(righe));
  await pg.evaluate(()=>window.togliFiltroDaSistemare());
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(()=>document.querySelectorAll('#app .row[onclick^="editEntry"]').length)===2,'e «Mostra tutte» le riporta');
  await pg.close();
}

console.log('\n=== SENZA LE COLONNE, NIENTE DANNI ===');
{
  // Chi non ha lanciato la migrazione: il modulo non deve mostrare
  // campi che il database butterebbe via in silenzio.
  const pg=await apri();
  await pg.evaluate(()=>{window.__colonneMancanti=['payment_method','receipt_kept','document_type'];});
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','cena');
  await scrivi(pg,'amount','42');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(900);
  const e=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice(-1)[0]||null);
  ok(!!e,'la spesa si salva comunque');
  ok(e&&Math.abs(Number(e.amount)-42)<0.005,'col suo importo',String(e&&e.amount));
  ok(e&&e.payment_method===undefined,'e senza le colonne che il database non ha',String(e&&e.payment_method));
  await pg.close();
}

console.log('\n=== E SE IL DATABASE NON DICE QUALE COLONNA ===');
{
  // Il ripiego dell'app legge il nome della colonna dal messaggio
  // d'errore. Ma non tutti i messaggi lo contengono: in quel caso
  // l'unica rete e' l'elenco dropKeys passato alla scrittura. Senza
  // questo caso, quella rete non si prova mai — e togliendola dal
  // codice tutti i test restavano verdi.
  const pg=await apri();
  await pg.evaluate(()=>{window.__colonneMancantiVaghe=['payment_method','receipt_kept','document_type'];});
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','cena');
  await scrivi(pg,'amount','55');
  await scrivi(pg,'payment_method','carta');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(900);
  const e=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice(-1)[0]||null);
  ok(!!e,'la spesa si salva anche con un errore che non nomina la colonna');
  ok(e&&Math.abs(Number(e.amount)-55)<0.005,'col suo importo',String(e&&e.amount));
  ok(e&&e.payment_method===undefined,'e senza le due colonne',String(e&&e.payment_method));
  await pg.close();
}

console.log('\n=== SE IL DATABASE SCARTA UN DATO, L\u2019APP LO DICE ===');
{
  // Il ripiego sulle colonne mancanti serviva a non bloccare i
  // salvataggi. Ma scartava i campi IN SILENZIO: scrivevi come avevi
  // pagato, la spesa si salvava, e quel dato non c'era. Chi usa l'app
  // non aveva modo di accorgersene.
  const pg=await apri();
  await pg.evaluate(()=>{window.__colonneMancanti=['payment_method','receipt_kept','document_type'];});
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','cena');
  await scrivi(pg,'amount','42');
  await scrivi(pg,'payment_method','carta');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(1100);
  const msg=await pg.evaluate(()=>document.querySelector('.toast')?.textContent.trim()||'');
  ok(msg.length>0,'dopo il salvataggio compare un messaggio',msg||'NIENTE: scarta in silenzio');
  ok(/non \u00e8 stato scritto|non ha ancora dove/i.test(msg),
     'che dice che un dato NON \u00e8 stato scritto',msg);
  ok(/pagat/i.test(msg),'nominando quale',msg);
  ok(/tracciabilita\.sql/i.test(msg),'e quale migrazione lo sistema',msg);
  ok(!/column|schema cache|PGRST/i.test(msg),'senza il gergo del database',msg);
  // La spesa c'\u00e8 comunque: l'avviso informa, non annulla
  const e=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice(-1)[0]||null);
  ok(e&&Math.abs(Number(e.amount)-42)<0.005,'e la spesa \u00e8 salvata lo stesso',String(e&&e.amount));
  await pg.close();
}

console.log('\n=== SE IL DATABASE HA TUTTO, NESSUN AVVISO ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','cena');
  await scrivi(pg,'amount','42');
  await scrivi(pg,'payment_method','carta');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(1000);
  const msg=await pg.evaluate(()=>document.querySelector('.toast')?.textContent.trim()||'');
  ok(!/non \u00e8 stato scritto|non ha ancora dove/i.test(msg),
     'salvando su un database completo non si avvisa di niente',msg||'nessun messaggio');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== tracciabilità: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
