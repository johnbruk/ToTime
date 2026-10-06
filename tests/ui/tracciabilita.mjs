// Metodo di pagamento e ricevuta.
//
// Non si poteva dire se una spesa era stata pagata con carta, bonifico
// o contanti, e non c'era nemmeno una spunta per dire «la ricevuta ce
// l'ho». E' esattamente il dato che decide il trattamento fiscale del
// riaddebito: dal 2025 i rimborsi analitici pagati con strumenti
// TRACCIABILI non concorrono al reddito, quelli in contanti si'.
//
// Qui si verifica che i due dati si inseriscano, che il distintivo
// «tracciabile / non tracciabile» dica la verita' giusta — comprese le
// due eccezioni: la chilometrica e' forfettaria e resta compenso
// comunque, e le spese estere sono fuori dall'obbligo — e che una
// spesa senza ricevuta si noti.
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
  return {val:el.value,hidden:!!el.closest('[hidden]'),checked:!!el.checked};
},n);
const scrivi=async(pg,n,v)=>{
  await pg.evaluate(([x,y])=>{
    const el=document.querySelector(`#app [name="${x}"]`);
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

console.log('\n=== I DUE CAMPI CI SONO, NEL BLOCCO GIUSTO ===');
{
  const pg=await apri();
  await alModulo(pg);
  ok(!!(await campo(pg,'payment_method')),'il modulo chiede come si è pagato');
  ok(!!(await campo(pg,'receipt_kept')),'e se la ricevuta c’è');
  const opz=await pg.evaluate(()=>[...document.querySelectorAll('#app [name=payment_method] option')].map(o=>o.textContent.trim().toLowerCase()));
  for(const m of ['carta','bonifico','contanti'])
    ok(opz.some(o=>o.includes(m)),'fra i modi c’è '+m,opz.join(' | '));
  ok(opz.some(o=>/cliente/.test(o)),'e «pagata dal cliente», che non è una mia uscita',opz.join(' | '));
  // Sta in «Come la tratto»: è il blocco di chi la paga
  const dove=await pg.evaluate(()=>{
    const el=document.querySelector('#app [name=payment_method]');
    const bl=el&&el.closest('.bloccoCampi');
    return bl?bl.querySelector('.bloccoTit')?.childNodes[0].textContent.trim():'';
  });
  ok(dove==='Come la tratto','e sta nel blocco «Come la tratto»',String(dove));
  await pg.close();
}

console.log('\n=== IL DISTINTIVO DICE LA VERITÀ ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','cena');
  await scrivi(pg,'reimbursement_type','invoice');
  await scrivi(pg,'payment_method','carta');
  await spunta(pg,'receipt_kept');
  let t=(await testo(pg)).toLowerCase();
  ok(t.includes('tracciabile')&&!t.includes('non tracciabile'),
     'carta + ricevuta: tracciabile',t.slice(t.indexOf('tracciab')-60,t.indexOf('tracciab')+90));
  await scrivi(pg,'payment_method','contanti');
  t=(await testo(pg)).toLowerCase();
  ok(t.includes('non tracciabile'),'contanti: NON tracciabile');
  await scrivi(pg,'payment_method','bonifico');
  t=(await testo(pg)).toLowerCase();
  ok(!t.includes('non tracciabile'),'bonifico: tracciabile di nuovo');
  // Senza ricevuta non basta il mezzo: il giustificativo serve comunque
  await spunta(pg,'receipt_kept',false);
  t=(await testo(pg)).toLowerCase();
  ok(/ricevuta/.test(t),'e senza ricevuta l’app lo fa notare',t.slice(t.indexOf('ricevut')-50,t.indexOf('ricevut')+110));
  await pg.close();
}

console.log('\n=== LE DUE ECCEZIONI, DETTE ===');
{
  const pg=await apri();
  await alModulo(pg);
  // 1) La chilometrica è forfettaria: resta compenso comunque
  await scrivi(pg,'expense_category_id','km');
  await scrivi(pg,'reimbursement_type','invoice');
  await scrivi(pg,'payment_method','carta');
  await spunta(pg,'receipt_kept');
  let t=(await testo(pg)).toLowerCase();
  ok(/forfettari|compenso/.test(t),
     'sulla chilometrica l’app dice che resta compenso, tracciabile o no',
     t.slice(Math.max(0,t.search(/forfettari|compenso/)-70),t.search(/forfettari|compenso/)+120));
  // 2) Una spesa a mio carico non ha niente da riaddebitare: nessun
  //    discorso di tracciabilità che possa confondere
  await scrivi(pg,'expense_category_id','cena');
  await scrivi(pg,'reimbursement_type','own');
  t=(await testo(pg)).toLowerCase();
  ok(!t.includes('tracciabil'),'su una spesa a mio carico il discorso non si apre nemmeno');
  await pg.close();
}

console.log('\n=== I DUE DATI SI SALVANO E SI RILEGGONO ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','cena');
  await scrivi(pg,'amount','42');
  await scrivi(pg,'payment_method','carta');
  await spunta(pg,'receipt_kept');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(800);
  const e=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice(-1)[0]||null);
  ok(e&&e.payment_method==='carta','il metodo si salva',String(e&&e.payment_method));
  ok(e&&e.receipt_kept===true,'e la ricevuta',String(e&&e.receipt_kept));
  await pg.evaluate(()=>window.editEntry(window.__stores.travel_expenses.slice(-1)[0].id,'expense'));
  await pg.waitForTimeout(500);
  ok((await campo(pg,'payment_method')).val==='carta','e rileggendola ci sono',String((await campo(pg,'payment_method')).val));
  ok((await campo(pg,'receipt_kept')).checked===true,'entrambi');
  await pg.close();
}

console.log('\n=== L’ELENCO SEGNALA QUELLO CHE MANCA ===');
{
  const pg=await apri();
  await pg.evaluate(`
    window.__stores.travel_expenses=[
      {id:'a',expense_date:'2026-10-05',client_id:'k2',expense_category_id:'cena',amount:40,
       reimbursement_type:'invoice',payment_method:'carta',receipt_kept:true,work_city:'Milano'},
      {id:'b',expense_date:'2026-10-06',client_id:'k2',expense_category_id:'cena',amount:30,
       reimbursement_type:'invoice',payment_method:'contanti',receipt_kept:false,work_city:'Milano'}];
  `);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(600);
  await pg.evaluate(()=>window.go('expenses'));
  await pg.waitForTimeout(400);
  await pg.evaluate(()=>{for(let i=0;i<48;i++){
    if((document.querySelector('.month strong')?.textContent||'').startsWith('Ottobre 2026'))break;
    window.changeMonth(-1)}});
  await pg.waitForTimeout(500);
  const t=(await testo(pg)).toLowerCase();
  ok(/da sistemare|manca|non tracciabil|senza ricevuta/.test(t),
     'l’elenco fa notare la spesa in contanti senza ricevuta',t.slice(0,260));
  // E la riga tracciabile non deve essere segnalata per sbaglio
  const quante=await pg.evaluate(()=>document.querySelectorAll('#app .tagManca').length);
  ok(quante===1,'una segnalazione sola, non due',String(quante));
  await pg.close();
}

console.log('\n=== SENZA LE COLONNE, NIENTE DANNI ===');
{
  // Chi non ha lanciato la migrazione: il modulo non deve mostrare
  // campi che il database butterebbe via in silenzio.
  const pg=await apri();
  await pg.evaluate(()=>{window.__colonneMancanti=['payment_method','receipt_kept'];});
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
  await pg.evaluate(()=>{window.__colonneMancantiVaghe=['payment_method','receipt_kept'];});
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

await b.close(); srv.close();
console.log(`\n=== tracciabilità: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
