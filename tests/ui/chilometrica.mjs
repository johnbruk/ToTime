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

console.log('\n=== UNA VOCE CHILOMETRICA \u00c8 KM \u00d7 TARIFFA, QUALUNQUE COSA DICA IL «TIPO CALCOLO» ===');
{
  // Il guasto vero, trovato usando l'app e non i miei test: le voci che
  // esistevano prima che is_mileage esistesse sono rimaste su «Importo
  // manuale». La migrazione le marca chilometriche, il modulo mostra i
  // km... e il campo della tariffa SPARISCE, perche' dipendeva dal
  // tipo calcolo. Scrivevi i km e restavi a zero, senza nemmeno un
  // posto dove mettere la tariffa. I miei test non lo vedevano perche'
  // la fixture era scritta a immagine del mio disegno.
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.expense_categories=[
      {id:'km',name:'Rimborso KM',active:true,reimbursable:true,
       calculation_type:'manual_amount',   // <-- com'\u00e8 nei dati veri
       unit_label:'km',default_unit_rate:0.45,is_mileage:true}];
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','km');
  ok(!(await campo(pg,'unit_rate')).hidden,
     'la tariffa si vede comunque: una chilometrica senza tariffa non \u00e8 niente');
  ok(Number((await campo(pg,'unit_rate')).val)===0.45,
     'e viene proposta quella della voce',String((await campo(pg,'unit_rate')).val));
  await scrivi(pg,'km_tratta','105');
  await spunta(pg,'round_trip');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,
     'e l\u2019importo si calcola: 210 km \u00d7 0,45 = 94,50',String((await campo(pg,'amount')).val));
  // e si salva con l'importo giusto, che era il punto
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(800);
  const e=await pg.evaluate(()=>(window.__stores.travel_expenses||[]).slice(-1)[0]||null);
  ok(e&&Math.abs(Number(e.amount)-94.5)<0.005,
     'e la spesa salvata porta l\u2019importo, non uno zero',String(e&&e.amount));
  await pg.close();
}

console.log('\n=== SENZA TARIFFA, L\u2019APP LO DICE INVECE DI LASCIARE ZERO ===');
{
  // L'altro modo di restare a zero: nessuna tariffa sulla voce e
  // nessun veicolo. L'importo resta zero \u2014 ed \u00e8 giusto \u2014 ma prima
  // non lo spiegava nessuno.
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.expense_categories=[
      {id:'km',name:'Rimborso KM',active:true,reimbursable:true,
       calculation_type:'quantity_rate',unit_label:'km',default_unit_rate:0,is_mileage:true}];
    window.__stores.vehicles=[];
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','km');
  await scrivi(pg,'km_tratta','105');
  await spunta(pg,'round_trip');
  const t=(await testo(pg)).toLowerCase();
  ok(/manca la tariffa/.test(t),'l\u2019app dice che manca la tariffa',t.slice(Math.max(0,t.indexOf('manca la tariffa')-30),t.indexOf('manca la tariffa')+110));
  ok(/veicolo/.test(t),'e dice anche come rimediare: scriverla o scegliere un veicolo');
  // ...e mettendola, il conto parte
  await scrivi(pg,'unit_rate','0.45');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,
     'messa la tariffa, l\u2019importo arriva',String((await campo(pg,'amount')).val));
  ok(!(await testo(pg)).toLowerCase().includes('manca la tariffa'),'e l\u2019avviso sparisce');
  await pg.close();
}

console.log('\n=== IL CONTO SI DEVE LEGGERE, NON SOLO AVVENIRE ===');
{
  // Senza la spunta «lo scrivo a mano» l'app deve calcolare E far
  // vedere il conto: un numero in una casella grigia non dice da dove
  // viene, e se e' sbagliato non si capisce dove.
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','km');
  await scrivi(pg,'vehicle_id','v1');
  await scrivi(pg,'km_tratta','105');
  await spunta(pg,'round_trip');
  const nota=await pg.evaluate(()=>document.getElementById('calcNota')?.textContent||'');
  ok(/210/.test(nota),'il conto a schermo dice i chilometri',nota);
  ok(/0,45/.test(nota),'la tariffa',nota);
  ok(/94,50/.test(nota),'e il risultato',nota);
  ok(/\u00d7/.test(nota)&&/=/.test(nota),'scritto come un conto: 210 km \u00d7 0,45 \u20ac/km = 94,50 \u20ac',nota);
  ok(!(await campo(pg,'amount_a_mano')).checked,'e la spunta «lo scrivo a mano» \u00e8 gi\u00fa');
  // Spuntandola, il conto smette e lo scrivi tu
  await spunta(pg,'amount_a_mano');
  const nota2=await pg.evaluate(()=>document.getElementById('calcNota')?.textContent||'');
  ok(/scrivi tu/i.test(nota2),'spuntandola, l\u2019app dice che l\u2019importo lo scrivi tu',nota2);
  await pg.close();
}

console.log('\n=== E VALE ANCHE PER LE VOCI A QUANTIT\u00c0 NON CHILOMETRICHE ===');
{
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.expense_categories.push(
      {id:'notti',name:'Albergo',active:true,reimbursable:true,
       calculation_type:'quantity_rate',unit_label:'notte',default_unit_rate:85,is_mileage:false});
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','notti');
  await scrivi(pg,'quantity','3');
  const nota=await pg.evaluate(()=>document.getElementById('calcNota')?.textContent||'');
  ok(/3 notte/.test(nota),'il conto usa l\u2019unit\u00e0 della voce',nota);
  ok(/255,00/.test(nota),'e arriva al totale: 3 \u00d7 85 = 255,00',nota);
  await pg.close();
}

console.log('\n=== UNA SPESA VECCHIA NON SI DEVE AZZERARE ===');
{
  // IL GUASTO PIU' GRAVE: le chilometriche registrate prima hanno
  // l'importo ma NON i km (la migrazione non le tocca, apposta).
  // Aprendone una e scegliendo un veicolo, il conto faceva
  // 0 km x tariffa = 0,00 e cancellava l'importo storico \u2014 e con la
  // casella di sola lettura non si poteva nemmeno rimediare a mano.
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.travel_expenses=[{id:'vecchia',expense_date:'2026-10-29',
      client_id:'k2',project_id:'omni',expense_category_id:'km',work_city:'Catania',
      amount:94.5,reimbursement_type:'invoice'}];   // ne' quantity ne' unit_rate
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.editEntry('vecchia','expense'));
  await pg.waitForTimeout(500);
  ok((await campo(pg,'amount')).val==='94.5','la spesa vecchia si apre col suo importo',String((await campo(pg,'amount')).val));
  ok(!(await campo(pg,'amount')).readonly,
     'e l\u2019importo resta scrivibile: il conto non lo sa rifare, quindi non lo blocca');
  // Ora il gesto che la distruggeva: scegliere un veicolo
  await scrivi(pg,'vehicle_id','v1');
  await pg.waitForTimeout(300);
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,
     'SCEGLIENDO UN VEICOLO l\u2019importo storico resta 94,50, non diventa 0,00',
     String((await campo(pg,'amount')).val));
  // e nemmeno scrivendo la tariffa a mano
  await scrivi(pg,'unit_rate','0.45');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,
     'e nemmeno scrivendo la tariffa',String((await campo(pg,'amount')).val));
  // ...finche' non si mettono i km, che e' quando il conto ha senso
  await scrivi(pg,'km_tratta','105');
  await spunta(pg,'round_trip');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,
     'mettendo i km il conto rifa' + ' lo stesso importo',String((await campo(pg,'amount')).val));
  // e il salvataggio non perde niente
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(800);
  const e=await pg.evaluate(()=>window.__stores.travel_expenses.find(x=>x.id==='vecchia'));
  ok(e&&Math.abs(Number(e.amount)-94.5)<0.005,'e salvando l\u2019importo \u00e8 ancora 94,50',String(e&&e.amount));
  await pg.close();
}

console.log('\n=== TOGLIENDO LA TARIFFA, L\u2019IMPORTO NON RESTA APPESO ===');
{
  // L'importo restava quello del conto di prima mentre l'app diceva che
  // la tariffa mancava: una cifra che non viene da nessun calcolo, e
  // che si salvava cosi'.
  const pg=await apri();
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','km');
  await scrivi(pg,'vehicle_id','v1');
  await scrivi(pg,'km_tratta','105');
  await spunta(pg,'round_trip');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,'prima il conto c\u2019\u00e8',String((await campo(pg,'amount')).val));
  await scrivi(pg,'unit_rate','0');
  ok(!Number((await campo(pg,'amount')).val),
     'tolta la tariffa, l\u2019importo non resta appeso al conto di prima',
     String((await campo(pg,'amount')).val));
  ok((await testo(pg)).toLowerCase().includes('manca la tariffa'),'e l\u2019app dice perch\u00e9');
  await pg.close();
}

console.log('\n=== CANCELLANDO I KM L\u2019IMPORTO NON VA A ZERO DA SOLO ===');
{
  // Qui si isola la guardia sui km, che negli altri casi resta coperta
  // dalla casella scrivibile: una riga che i km CE LI HA, quindi col
  // totale di sola lettura e la spunta «lo scrivo a mano» giu'. Se si
  // cancellano i km per riscriverli, l'app non deve scrivere uno zero
  // che non ha calcolato \u2014 e salvarlo.
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.travel_expenses=[{id:'conkm',expense_date:'2026-10-29',
      client_id:'k2',project_id:'omni',expense_category_id:'km',work_city:'Catania',
      quantity:210,unit_rate:0.45,amount:94.5,reimbursement_type:'invoice'}];
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.editEntry('conkm','expense'));
  await pg.waitForTimeout(500);
  ok((await campo(pg,'amount')).readonly,
     'la riga coi km ha il totale di sola lettura: il conto lo sa rifare');
  ok(Math.abs(Number((await campo(pg,'km_tratta')).val)-210)<0.005,
     'e i km tornano tutti: senza «andata e ritorno», 210 \u00e8 una tratta sola',
     String((await campo(pg,'km_tratta')).val));
  // si cancellano i km, come farebbe chi li vuole riscrivere
  await scrivi(pg,'km_tratta','');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,
     'cancellati i km, l\u2019importo NON diventa 0,00: l\u2019app non scrive cifre che non ha calcolato',
     String((await campo(pg,'amount')).val));
  // e riscrivendoli il conto riparte
  await scrivi(pg,'km_tratta','50');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-22.5)<0.005,
     'riscrivendoli il conto riparte: 50 km \u00d7 0,45 = 22,50',String((await campo(pg,'amount')).val));
  await pg.close();
}

console.log('\n=== IMPORTO E KM MA SENZA TARIFFA: ANCHE QUESTA NON SI AZZERA ===');
{
  // La stessa perdita di dati, su una forma diversa che la prima
  // correzione non copriva: una spesa importata da CSV puo' avere
  // importo E quantita' ma NON la tariffa — le colonne sono opzionali e
  // l'import accetta quella combinazione. Il conto faceva quantita' x 0
  // e cancellava la cifra storica.
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.travel_expenses=[{id:'daCsv',expense_date:'2026-10-29',
      client_id:'k2',project_id:'omni',expense_category_id:'km',work_city:'Catania',
      quantity:210,amount:94.5,reimbursement_type:'invoice'}];   // nessuna unit_rate
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.editEntry('daCsv','expense'));
  await pg.waitForTimeout(500);
  ok(!(await campo(pg,'amount')).readonly,
     'senza tariffa l\u2019importo resta a mano: il conto non lo sa rifare');
  await scrivi(pg,'km_tratta','50');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,
     'e cambiando i km l\u2019importo storico NON si azzera',String((await campo(pg,'amount')).val));
  await pg.evaluate(()=>document.querySelector('#app form.form').requestSubmit());
  await pg.waitForTimeout(800);
  const e=await pg.evaluate(()=>window.__stores.travel_expenses.find(x=>x.id==='daCsv'));
  ok(e&&Math.abs(Number(e.amount)-94.5)<0.005,'e si salva intero',String(e&&e.amount));
  await pg.close();
}

console.log('\n=== UNA RIGA VECCHIA SI PU\u00d2 COMPLETARE ===');
{
  // Sbloccare l'importo nascondeva anche i campi del conto: non si
  // poteva piu' scrivere la tariffa mancante, quindi la riga restava
  // per sempre fuori dal calcolo. I campi devono restare a schermo.
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.vehicles=[];   // nessun veicolo: la tariffa si scrive a mano o niente
    window.__stores.travel_expenses=[{id:'vecchia',expense_date:'2026-10-29',
      client_id:'k2',project_id:'omni',expense_category_id:'km',work_city:'Catania',
      amount:94.5,reimbursement_type:'invoice'}];
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await pg.evaluate(()=>window.editEntry('vecchia','expense'));
  await pg.waitForTimeout(500);
  ok(!(await campo(pg,'unit_rate')).hidden,
     'il campo della tariffa si vede, anche senza veicoli: altrimenti la riga non si completa mai');
  ok(!(await campo(pg,'km_tratta')).hidden,'e cos\u00ec i km');
  // la si completa, e da quel momento il conto la governa
  await scrivi(pg,'unit_rate','0.45');
  await scrivi(pg,'km_tratta','105');
  await spunta(pg,'round_trip');
  ok(Math.abs(Number((await campo(pg,'amount')).val)-94.5)<0.005,
     'completandola, il conto la ricostruisce',String((await campo(pg,'amount')).val));
  await pg.close();
}

console.log('\n=== CAMBIANDO CLIENTE LA TARIFFA TOLTA RESTA TOLTA ===');
{
  // Cambiare cliente ripropone il tipo di rimborso (dipende dalla
  // policy del cliente) ma NON deve rimettere una tariffa che e' stata
  // cancellata apposta.
  const pg=await apri();
  await pg.evaluate(()=>{
    window.__stores.clients.push({id:'alt',name:'Altro cliente',active:true,
      daily_rate:400,standard_hours:8,compensation_type:'daily_rate_8h'});
    return window.reload();
  });
  await pg.waitForTimeout(700);
  await alModulo(pg);
  await scrivi(pg,'expense_category_id','km');
  ok(Number((await campo(pg,'unit_rate')).val)>0,'scegliendo la voce la tariffa viene proposta',
     String((await campo(pg,'unit_rate')).val));
  await scrivi(pg,'unit_rate','');
  ok(!Number((await campo(pg,'unit_rate')).val),'la si cancella',String((await campo(pg,'unit_rate')).val));
  await scrivi(pg,'client_id','alt');
  ok(!Number((await campo(pg,'unit_rate')).val),
     'e cambiando cliente resta cancellata: non torna da sola',
     String((await campo(pg,'unit_rate')).val));
  await pg.close();
}

await b.close(); srv.close();
console.log(`\n=== chilometrica: OK ${pass} · KO ${fail} ===`);
process.exit(fail?1:0);
