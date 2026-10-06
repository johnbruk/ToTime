// Il modulo della spesa, in tre blocchi.
//
// Prima erano undici campi in fila, tutti con lo stesso peso visivo: la
// data che cambi ogni volta accanto al costo unitario a quattro
// decimali che non tocchi mai.
//
// E c'era un difetto vero: il modulo chiedeva SIA quantita' x tariffa
// SIA il totale, in tre caselle scrivibili, senza dire quale vince. Se
// correggevi il totale a mano, quantita' e tariffa restavano li' a
// raccontare un'altra cifra. Due fonti di verita' per lo stesso numero.
//
// Qui si verifica che i blocchi ci siano, che la coppia
// quantita'/tariffa compaia solo quando ha senso, che il totale sia
// calcolato e non ambiguo ma correggibile a mano quando serve, e che il
// campo Commessa — che mancava del tutto — ci sia e si salvi.
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

// Due voci di spesa di natura diversa: un volo (importo secco) e la
// chilometrica (quantita' x tariffa). Senza entrambe non si vede la
// differenza che il modulo deve fare.
const SEMI=`
  const S=window.__stores;
  S.clients=[{id:'k2',name:'K2',daily_rate:500,standard_hours:8,compensation_type:'daily_rate_8h',active:true}];
  S.projects=[{id:'omni',client_id:'k2',name:'Omnichannel',active:true}];
  S.expense_categories=[
    {id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount'},
    {id:'notti',name:'Albergo',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'notte',default_unit_rate:85,is_mileage:false},
    {id:'km',name:'Rimborso KM',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'km',default_unit_rate:0.45,is_mileage:true}];
  S.travel_expenses=[];
  S.trips=[{id:'tr1',client_id:'k2',project_id:'omni',destination_city:'Catania',destination_country:'IT',start_date:'2026-10-25',end_date:'2026-10-29',purpose:'Go-live',status:'to_recharge'}];
`;
const apri=async(w=390)=>{
  const pg=await b.newPage({viewport:{width:w,height:1800},hasTouch:w<900});
  pg.on('dialog',d=>d.accept());
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  return pg;
};
const vaiAlModulo=async pg=>{
  await pg.evaluate(()=>window.go('expenseForm'));
  await pg.waitForTimeout(450);
};
const testo=pg=>pg.evaluate(()=>document.getElementById('app').innerText.replace(/\s+/g,' '));
const campo=(pg,n)=>pg.evaluate(x=>{
  const el=document.querySelector(`#app [name="${x}"]`);
  if(!el)return null;
  return {val:el.value,readonly:!!el.readOnly,hidden:!!el.closest('[hidden]'),tipo:el.type||el.tagName.toLowerCase()};
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

console.log('\n=== I TRE BLOCCHI ===');
{
  const pg=await apri();
  await vaiAlModulo(pg);
  const blocchi=await pg.evaluate(()=>[...document.querySelectorAll('#app .bloccoTit')]
    .map(x=>x.childNodes[0].textContent.trim()));
  ok(blocchi.length===3,'il modulo ha tre blocchi, non undici campi in fila',blocchi.join(' / '));
  ok(blocchi[0]==='Quando e dove','primo: Quando e dove',String(blocchi[0]));
  ok(blocchi[1]==='Cosa','secondo: Cosa',String(blocchi[1]));
  ok(blocchi[2]==='Come la tratto','terzo: Come la tratto',String(blocchi[2]));
  // Tutti i campi di prima ci sono ancora: riorganizzare non vuol dire
  // perdere per strada quello che serviva.
  for(const n of ['expense_date','client_id','project_id','expense_category_id',
                  'reimbursement_type','work_city','description','quantity',
                  'unit_rate','amount','notes','trip_id']){
    ok(!!(await campo(pg,n)),'il campo '+n+' c’è ancora');
  }
  await pg.close();
}

console.log('\n=== LA COPPIA QUANTITÀ × TARIFFA SI VEDE SOLO QUANDO SERVE ===');
{
  const pg=await apri();
  await vaiAlModulo(pg);
  // Nessuna voce scelta: la coppia sta nascosta
  ok((await campo(pg,'quantity')).hidden,'senza voce scelta, quantità × tariffa sta nascosta');
  // Volo: importo secco, la coppia resta nascosta
  await scrivi(pg,'expense_category_id','volo');
  ok((await campo(pg,'quantity')).hidden,'su un volo resta nascosta: non vuol dire niente');
  ok(!(await campo(pg,'amount')).readonly,'e il totale si scrive a mano');
  ok((await testo(pg)).includes('Scrivi tu l’importo'),'e l’app lo dice');
  // Albergo, a notti: la coppia compare, con l'unita' giusta e la
  // tariffa proposta dalla voce. La chilometrica ha un blocco suo e un
  // file di test suo, chilometrica.mjs: qui serve il caso generico.
  await scrivi(pg,'expense_category_id','notti');
  ok(!(await campo(pg,'quantity')).hidden,'su una voce a quantità × tariffa compare');
  ok((await testo(pg)).toLowerCase().includes('(notte)'),'con l’unità della voce, notte');
  ok(Number((await campo(pg,'unit_rate')).val)===85,'e la tariffa proposta dalla voce, 85',
     String((await campo(pg,'unit_rate')).val));
  // E tornando al volo si richiude: il campo non deve restare appeso
  await scrivi(pg,'expense_category_id','volo');
  ok((await campo(pg,'quantity')).hidden,'tornando al volo si richiude');
  await pg.close();
}

console.log('\n=== UNA FONTE DI VERITÀ SOLA PER IL TOTALE ===');
{
  const pg=await apri();
  await vaiAlModulo(pg);
  await scrivi(pg,'expense_category_id','notti');
  ok((await campo(pg,'amount')).readonly,
     'a quantità × tariffa, il totale non si scrive: lo calcola l’app');
  ok((await testo(pg)).includes('Lo calcola l’app'),'e l’app lo dice');
  await scrivi(pg,'quantity','3');
  const tot=Number((await campo(pg,'amount')).val);
  ok(Math.abs(tot-255)<0.005,'3 notti × 85 = 255,00',String(tot));
  await scrivi(pg,'unit_rate','90');
  const tot2=Number((await campo(pg,'amount')).val);
  ok(Math.abs(tot2-270)<0.005,'e cambiando tariffa si ricalcola: 270,00',String(tot2));
  // Ma deve restare flessibile: spuntando «Lo scrivo a mano» si corregge
  ok(!!(await campo(pg,'amount_a_mano')),'c’è la spunta «Lo scrivo a mano»');
  await pg.evaluate(()=>{const c=document.querySelector('#app [name=amount_a_mano]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}))});
  await pg.waitForTimeout(250);
  ok(!(await campo(pg,'amount')).readonly,'spuntata, il totale si corregge a mano');
  await scrivi(pg,'amount','100');
  await scrivi(pg,'quantity','9');
  ok(Number((await campo(pg,'amount')).val)===100,
     'e cambiando la quantità il totale corretto a mano NON viene sovrascritto',
     String((await campo(pg,'amount')).val));
  await pg.close();
}

console.log('\n=== LA SPESA NASCE ATTACCATA ALLA COMMESSA ===');
{
  // Con la gerarchia WBS, il modulo deve chiedere la commessa: prima
  // non la chiedeva e ogni spesa nuova nasceva con wbs_id vuoto, cosi'
  // la bonifica di settembre andava rilanciata in eterno.
  const pg=await apri();
  await pg.evaluate(`
    const S=window.__stores;
    S.engagements=[{id:'eng1',project_id:'omni',code:'K2-OMNI-01',name:'Omnichannel 2026',status:'active'}];
    S.wbs_items=[
      {id:'w1',engagement_id:'eng1',code:'K2-OMNI-01-10',activity_code:10,name:'Project management',billable:true,status:'active'},
      {id:'w2',engagement_id:'eng1',code:'K2-OMNI-01-90',activity_code:90,name:'Trasferte e spese',billable:false,status:'active'}];
  `);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(700);
  await vaiAlModulo(pg);
  const w=await campo(pg,'wbs_id');
  ok(!!w,'il modulo chiede la commessa');
  const voci=await pg.evaluate(()=>[...document.querySelectorAll('#app [name=wbs_id] option')].map(o=>o.textContent.trim()));
  ok(voci.some(v=>/Trasferte e spese/.test(v)),'e fra le voci c’è «Trasferte e spese»',voci.join(' | '));
  await scrivi(pg,'wbs_id','w2');
  await scrivi(pg,'expense_category_id','volo');
  await scrivi(pg,'amount','428');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(700);
  const scritta=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice(-1)[0]||null);
  ok(!!scritta,'la spesa si salva');
  ok(scritta&&scritta.wbs_id==='w2','e porta con sé la commessa scelta',String(scritta&&scritta.wbs_id));
  ok(scritta&&scritta.project_id==='omni',
     'col progetto dedotto dalla commessa, non ribattuto a mano',String(scritta&&scritta.project_id));
  ok(scritta&&Number(scritta.amount)===428,'e l’importo giusto',String(scritta&&scritta.amount));
  await pg.close();
}

console.log('\n=== DENTRO UNA TRASFERTA, I CAMPI SE LI PRENDE DA LEI ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.nuovaSpesaInTrasferta('tr1'));
  await pg.waitForTimeout(500);
  ok((await testo(pg)).includes('Dentro la trasferta'),'il modulo dice in quale trasferta si sta scrivendo');
  ok((await testo(pg)).includes('Catania'),'e quale',await testo(pg).then(t=>t.slice(0,80)));
  ok((await campo(pg,'trip_id')).val==='tr1','la trasferta è già scelta');
  ok((await campo(pg,'work_city')).val==='Catania','la città arriva dalla trasferta',
     String((await campo(pg,'work_city')).val));
  ok((await campo(pg,'expense_date')).val==='2026-10-25','e la data parte dal primo giorno',
     String((await campo(pg,'expense_date')).val));
  ok((await campo(pg,'client_id')).val==='k2','col cliente della trasferta');
  await pg.close();
}

console.log('\n=== IL TIPO DI RIMBORSO PARTE COME PRIMA ===');
{
  // Riorganizzare il modulo non deve cambiare di nascosto un default:
  // su una spesa nuova resta «a mio carico», e la voce lo propone poi.
  const pg=await apri();
  await vaiAlModulo(pg);
  ok((await campo(pg,'reimbursement_type')).val==='own',
     'su una spesa nuova il tipo parte da «a mio carico», come prima',
     String((await campo(pg,'reimbursement_type')).val));
  // La voce rimborsabile lo propone «in fattura», come faceva prima
  await scrivi(pg,'expense_category_id','volo');
  ok((await campo(pg,'reimbursement_type')).val==='invoice',
     'e scegliendo una voce rimborsabile diventa «in fattura»',
     String((await campo(pg,'reimbursement_type')).val));
  await pg.close();
}

console.log('\n=== MODIFICARE UNA SPESA ESISTENTE ===');
{
  const pg=await apri();
  await pg.evaluate(`
    window.__stores.travel_expenses=[{id:'sx',expense_date:'2026-10-25',client_id:'k2',project_id:'omni',
      expense_category_id:'notti',work_city:'Catania',quantity:3,unit_rate:85,amount:255,
      reimbursement_type:'invoice',description:'Albergo in centro',trip_id:'tr1'}];
  `);
  await pg.evaluate(()=>window.reload());
  await pg.waitForTimeout(600);
  await pg.evaluate(()=>window.editEntry('sx','expense'));
  await pg.waitForTimeout(500);
  ok((await testo(pg)).includes('Modifica spesa'),'si apre la modifica');
  ok((await campo(pg,'amount')).val==='255','col totale di prima',String((await campo(pg,'amount')).val));
  ok(!(await campo(pg,'quantity')).hidden,'la casella quantità è aperta, perché la voce lo chiede');
  ok((await campo(pg,'quantity')).val==='3','con le tre notti',String((await campo(pg,'quantity')).val));
  ok((await campo(pg,'reimbursement_type')).val==='invoice','e il tipo rimborso di prima');
  ok((await campo(pg,'trip_id')).val==='tr1','e la trasferta di prima');
  ok((await campo(pg,'description')).val.includes('centro'),'e la descrizione di prima');
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== modulo spesa: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
