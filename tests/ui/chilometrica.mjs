// Il rimborso chilometrico.
//
// Nei dati di ottobre compaiono due righe «Rimborso KM 94,50 €»
// identiche, e non c'e' modo di sapere se sono lo stesso tragitto fatto
// due volte o un errore: non e' scritto ne' quanti km ne' da dove a
// dove. La tariffa era battuta a mano su ogni riga, e le tabelle ACI
// cambiano a gennaio.
//
// Qui si verifica che il veicolo esista, che la sua tariffa sia solo il
// valore PROPOSTO — correggibile sulla singola spesa, come chiesto — che
// una chilometrica si possa registrare anche senza veicolo, e che
// l'andata e ritorno raddoppi i km invece di obbligare a moltiplicare
// a mente.
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
  return {val:el.value,readonly:!!el.readOnly,hidden:!!el.closest('[hidden]'),checked:!!el.checked};
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
    {id:'volo',name:'Volo',active:true,reimbursable:true,calculation_type:'manual_amount',is_mileage:false},
    {id:'km',name:'Rimborso KM',active:true,reimbursable:true,calculation_type:'quantity_rate',unit_label:'km',default_unit_rate:0.40,is_mileage:true}];
  S.vehicles=[
    {id:'v1',name:'Panda',plate:'AB123CD',fuel_type:'benzina',rate_per_km:0.45,aci_year:2026,active:true},
    {id:'v2',name:'Tiguan',plate:'EF456GH',fuel_type:'diesel',rate_per_km:0.62,aci_year:2026,active:true}];
  S.travel_expenses=[];S.trips=[];
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
const alModulo=async pg=>{await pg.evaluate(()=>window.go('expenseForm'));await pg.waitForTimeout(450)};

console.log('\n=== IL PERCORSO COMPARE SOLO SULLE VOCI CHILOMETRICHE ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','volo');
  ok((await campo(pg,'vehicle_id'))===null||(await campo(pg,'vehicle_id')).hidden,
     'su un volo non si chiede il veicolo');
  await scrivi(pg,'expense_category_id','km');
  ok(!(await campo(pg,'vehicle_id')).hidden,'sulla chilometrica si chiede il veicolo');
  ok(!(await campo(pg,'from_place')).hidden,'e il da');
  ok(!(await campo(pg,'to_place')).hidden,'e l’a');
  ok(!(await campo(pg,'round_trip')).hidden,'e l’andata e ritorno');
  await scrivi(pg,'expense_category_id','volo');
  ok((await campo(pg,'vehicle_id')).hidden,'e tornando al volo si richiude');
  await pg.close();
}

console.log('\n=== LA TARIFFA DEL VEICOLO È SOLO PROPOSTA ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','km');
  // Senza veicolo si parte dalla tariffa della voce
  ok(Number((await campo(pg,'unit_rate')).val)===0.40,
     'senza veicolo vale la tariffa della voce, 0,40',String((await campo(pg,'unit_rate')).val));
  await scrivi(pg,'vehicle_id','v1');
  ok(Number((await campo(pg,'unit_rate')).val)===0.45,
     'scegliendo la Panda la tariffa diventa la sua, 0,45',String((await campo(pg,'unit_rate')).val));
  await scrivi(pg,'vehicle_id','v2');
  ok(Number((await campo(pg,'unit_rate')).val)===0.62,
     'col Tiguan diventa 0,62',String((await campo(pg,'unit_rate')).val));
  // IL PUNTO: deve restare flessibile. La tariffa si corregge a mano e
  // NON viene riscritta al tocco successivo.
  ok(!(await campo(pg,'unit_rate')).readonly,'la tariffa si può correggere a mano');
  await scrivi(pg,'unit_rate','0.70');
  await scrivi(pg,'quantity','100');
  ok(Number((await campo(pg,'unit_rate')).val)===0.70,
     'e corretta a mano resta 0,70, non torna a quella del veicolo',
     String((await campo(pg,'unit_rate')).val));
  ok(Math.abs(Number((await campo(pg,'amount')).val)-70)<0.005,
     'col totale calcolato sulla tariffa corretta: 70,00',String((await campo(pg,'amount')).val));
  await pg.close();
}

console.log('\n=== SI PUÒ ANCHE NON AVERE UN VEICOLO ===');
{
  // Chi non ha registrato veicoli deve poter mettere km e tariffa a
  // mano: la flessibilita' chiesta esplicitamente.
  const pg=await apri();
  await pg.evaluate(()=>{window.__stores.vehicles=[];return window.reload()});
  await pg.waitForTimeout(600);
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','km');
  const v=await campo(pg,'vehicle_id');
  ok(!!v&&!v.hidden,'il campo veicolo c’è comunque');
  const opz=await pg.evaluate(()=>[...document.querySelectorAll('#app [name=vehicle_id] option')].map(o=>o.textContent.trim()));
  ok(opz.length===1&&/senza veicolo|nessun veicolo/i.test(opz[0]),
     'e dice che si può fare senza',opz.join(' | '));
  await scrivi(pg,'unit_rate','0.50');
  await scrivi(pg,'quantity','80');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-40)<0.005,
     '80 km × 0,50 a mano = 40,00',String((await campo(pg,'amount')).val));
  await pg.close();
}

console.log('\n=== ANDATA E RITORNO RADDOPPIA I KM ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','km');
  await scrivi(pg,'vehicle_id','v1');
  await scrivi(pg,'km_tratta','105');
  ok(Math.abs(Number((await campo(pg,'quantity')).val)-105)<0.005,
     'sola andata: 105 km',String((await campo(pg,'quantity')).val));
  ok(Math.abs(Number((await campo(pg,'amount')).val)-47.25)<0.005,
     '105 × 0,45 = 47,25',String((await campo(pg,'amount')).val));
  await spunta(pg,'round_trip');
  ok(Math.abs(Number((await campo(pg,'quantity')).val)-210)<0.005,
     'andata e ritorno: 210 km, senza moltiplicare a mente',String((await campo(pg,'quantity')).val));
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,
     'e 94,50 € — esattamente la riga che c’è nei dati di ottobre',
     String((await campo(pg,'amount')).val));
  // E togliendo la spunta si torna indietro
  await spunta(pg,'round_trip',false);
  ok(Math.abs(Number((await campo(pg,'quantity')).val)-105)<0.005,
     'togliendo la spunta si torna a 105',String((await campo(pg,'quantity')).val));
  await pg.close();
}

console.log('\n=== LA SPESA PORTA CON SÉ IL PERCORSO ===');
{
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','km');
  await scrivi(pg,'vehicle_id','v1');
  await scrivi(pg,'from_place','Catania');
  await scrivi(pg,'to_place','Modica');
  await scrivi(pg,'km_tratta','105');
  await spunta(pg,'round_trip');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(700);
  const e=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice(-1)[0]||null);
  ok(!!e,'la spesa si salva');
  ok(e&&e.vehicle_id==='v1','col veicolo',String(e&&e.vehicle_id));
  ok(e&&e.from_place==='Catania','col da',String(e&&e.from_place));
  ok(e&&e.to_place==='Modica','con l’a',String(e&&e.to_place));
  ok(e&&e.round_trip===true,'con l’andata e ritorno',String(e&&e.round_trip));
  ok(e&&Math.abs(Number(e.quantity)-210)<0.005,'coi 210 km totali',String(e&&e.quantity));
  ok(e&&Math.abs(Number(e.unit_rate)-0.45)<0.0005,'con la tariffa',String(e&&e.unit_rate));
  ok(e&&Math.abs(Number(e.amount)-94.5)<0.005,'e l’importo',String(e&&e.amount));
  // ...e ora la riga si legge, invece di dire solo «Rimborso KM 94,50 €»
  await pg.evaluate(()=>window.go('expenses'));
  await pg.waitForTimeout(500);
  const t=await testo(pg);
  ok(t.includes('Catania')&&t.includes('Modica'),'e nell’elenco si legge il percorso',t.slice(0,160));
  ok(/210\s*km/.test(t),'coi chilometri',t.slice(0,160));
  await pg.close();
}

console.log('\n=== I VEICOLI SI CONFIGURANO ===');
{
  const pg=await apri();
  await pg.evaluate(()=>window.go('vehicles'));
  await pg.waitForTimeout(450);
  const t=await testo(pg);
  ok(/Veicoli/i.test(await pg.evaluate(()=>document.querySelector('#app h1, #app .screenTitle')?.textContent||'')),
     'c’è una pagina dei veicoli');
  ok(t.includes('Panda')&&t.includes('Tiguan'),'che li elenca');
  ok(t.includes('0,45')||t.includes('0,4500'),'con la loro tariffa',t.slice(0,200));
  // La tariffa si inserisce a mano, e l'app deve dirlo chiaro insieme
  // al fatto che le tabelle ACI cambiano a gennaio.
  ok(/aci/i.test(t),'e ricorda da dove viene la tariffa (ACI)');
  ok(/gennaio|ogni anno|cambia/i.test(t),'e che va aggiornata',t.slice(0,300));
  // Si aggiunge un veicolo
  await scrivi(pg,'name','Ypsilon');
  await scrivi(pg,'rate_per_km','0.38');
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(600);
  const v=await pg.evaluate(()=>(window.__stores.vehicles||[]).slice(-1)[0]||null);
  ok(v&&v.name==='Ypsilon','e se ne aggiunge uno',String(v&&v.name));
  ok(v&&Math.abs(Number(v.rate_per_km)-0.38)<0.0005,'con la tariffa messa a mano',String(v&&v.rate_per_km));
  await pg.close();
}

console.log('\n=== NIENTE TABELLA VEICOLI, NIENTE DANNI ===');
{
  const pg=await b.newPage({viewport:{width:390,height:1500}});
  await pg.goto(`http://127.0.0.1:${port}/tests/ui/mock.html`,{waitUntil:'networkidle'});
  await pg.waitForTimeout(800);
  await pg.evaluate(SEMI);
  await pg.evaluate(()=>{window.__tabelleMancanti=['vehicles'];return window.reload()});
  await pg.waitForTimeout(800);
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','km');
  const v=await campo(pg,'vehicle_id');
  ok(!v||v.hidden,'senza la tabella non si chiede il veicolo');
  // ...ma i km si registrano comunque: e' il comportamento di prima
  await scrivi(pg,'unit_rate','0.45');
  await scrivi(pg,'quantity','210');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,
     'e la chilometrica si registra comunque, come prima',String((await campo(pg,'amount')).val));
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== chilometrica: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
